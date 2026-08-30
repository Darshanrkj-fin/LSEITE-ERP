# LSEITE ERP — Detailed Project Summary

This is a standalone, point-in-time summary of what has actually been built, how it works, and
what's still open. `ROADMAP.md` is the plan (phases, schema-at-a-glance, compliance checklist) and
`CLAUDE.md` is the working-rules file for whoever (human or AI) touches this codebase next — this
document sits between them: a fuller narrative of the system as it exists today.

## 1. What this system is

A GST-compliant finance system built for one specific business: a bakery-style manufacturer of
zero-sugar sweets that buys raw materials, produces finished goods, sells them directly and via
recurring subscriptions, and also takes custom/bespoke orders. It is for that one company's
internal use — multi-branch fields exist in the schema but are not in active use.

It covers: sales & purchase invoicing with GST, inventory and batch/expiry tracking, manufacturing
(production entries + R&D recipe trials), custom orders, subscriptions, bank reconciliation, core
double-entry accounting reports, GST summary reports, payroll, and GST-rate-change alerting.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + Tailwind | No component/icon library — everything hand-built |
| Backend | Vercel Serverless Functions (Node, ESM) | Thin — most logic lives in Postgres functions |
| Database | Supabase (Postgres + Auth + RLS) | Free tier |
| PDF generation | `pdf-lib` | Shared by invoice PDFs, payslips, and report exports |
| Scheduled jobs | Vercel Cron | GST notification checker, subscription-cycle generator |
| Email | Resend (free tier) | Only for the invoice "Email PDF" action — **not** GST alerts anymore |

No paid API anywhere. No ORM — plain `@supabase/supabase-js` queries and Postgres RPC calls.

## 3. Architecture, in one paragraph

Almost all financial logic — GST splitting, invoice posting, cancellation/reversal, production
costing, payroll posting — lives in `SECURITY DEFINER` Postgres functions in
`supabase/schema.sql`, not in JavaScript. The React frontend calls these via
`supabase.rpc(...)` and otherwise reads tables directly under Row-Level Security. This means the
double-entry and GST-correctness guarantees hold even if someone bypasses the UI and calls the
API directly — the database itself refuses to let a transaction post unbalanced (a deferred
trigger checks `sum(debit) = sum(credit)` per `entry_group_id` at commit time). The single
`api/` Vercel functions that exist are for things Postgres can't do itself: fetching an external
web page (GST notification checker), generating a PDF, sending an email, and user management
(needs the service-role key, which never reaches the browser).

## 4. Core accounting model

- Every posting is double-entry: `journal_entries` rows share an `entry_group_id`; a deferred
  trigger rejects the transaction at commit if debits ≠ credits for that group.
- `chart_of_accounts.system_role` marks 13 accounts Postgres relies on structurally (Accounts
  Receivable/Payable, Output/Input CGST/SGST/IGST, Deductions Payable, Raw Material Inventory,
  Finished Goods Inventory, Cost of Goods Sold, R&D Expense). These are auto-seeded per company,
  can't be deleted (RLS + a UI-level disabled Delete button), and every posting function resolves
  them by role, never by name string.
- GST split logic lives in exactly one function, `calculate_gst_split()`: same
  `state_code` (buyer vs. seller/company) → CGST+SGST; different → IGST. Every invoice type calls
  this one function — never duplicated.
- Tax rates live only in `tax_rates` (hsn_sac_code, rate, `effective_from`/`effective_to`).
  Nothing in application code hardcodes a rate. A rate change never rewrites a historical invoice
  because `resolve_tax_rate()` looks up the rate as of the invoice date, and the amount that was
  actually charged is stored on the invoice/line-item row at posting time.
- Invoice cancellation mid-period issues a real credit/debit note rather than deleting or editing
  the original — the original invoice, its lines, and its journal entries are never touched.

## 5. Manufacturing & inventory model

- `items.item_type` distinguishes raw materials from finished goods.
- Raw materials: `items.average_cost` is a running weighted-average, recomputed on every purchase.
- Finished goods: costed per-batch. `production_entries` consumes raw materials **FEFO**
  (first-expiring-first-out) at their cost-at-time, creates the output's `item_batches` row, and
  posts a pure cost-transfer entry (debit Finished Goods Inventory, credit Raw Material Inventory)
  — no P&L impact at production time.
- Selling a finished good posts a COGS leg at the FEFO-consumed batch's actual unit cost (debit
  COGS, credit Finished Goods Inventory), so gross margin is real, not estimated.
- R&D recipe trials consume raw materials the same FEFO way but never create finished-goods stock
  — the cost is expensed immediately (debit R&D Expense) since it's not inventory, it's product
  development.
- Cancelling an invoice or production entry after later activity depends on it (e.g. average_cost
  already moved, or the batch was partly consumed) is blocked with a clear error rather than
  silently corrupting costs.
- Custom/bespoke orders get a lightweight `custom_order_id` tag on production entries and invoices
  so their cost/revenue can be filtered and looked at separately — no separate quotation engine.

## 6. Subscriptions

Recurring customer plans where the item mix can vary cycle to cycle (not a fixed box):
- **Manual path**: staff create a draft cycle and its line items directly, then call
  `finalize_subscription_cycle()`, which turns it into a real invoice via the same `post_invoice`
  used everywhere else (no duplicated posting logic).
- **Auto path**: a weekly-cron-style Vercel job ensures a draft cycle exists once a subscription's
  next billing date arrives, seeded from the previous cycle's items — but it never auto-finalizes.
  A human always reviews/edits the draft before it becomes a real invoice, and it never clobbers a
  cycle staff already pre-created for that date.

## 7. Reports, exports, and the financial-year fix

### Reports built
Ledger (account-wise / party-wise), Trial Balance, Profit & Loss, Balance Sheet, Cash Flow
summary, Fund Flow summary, GSTR-1-style Sales Register, GSTR-3B-style GST Summary, Item
Profitability, Stock Valuation, Batch/Expiry report, Payroll Register, Journal Register, and an
Audit Log (admin-only, generic edit history for items/parties/tax_rates/CoA).

### CA-handoff exports (CSV + PDF)
Every report a CA would need to prepare filings from has both a CSV and a PDF export button,
generated **entirely client-side** — no new backend endpoint, no new library:
- `src/lib/exportCsv.js` — a small shared CSV writer (proper quoting/escaping of commas, quotes,
  newlines), triggers a browser download via a `Blob`.
- `src/lib/exportPdf.js` — a shared paginated table-PDF writer built on the `pdf-lib` dependency
  that was already in the project for invoice/payslip PDFs (no new library added). A4 landscape,
  repeats the header row automatically when a table spills onto a new page.
- Wired into: Journal Register, Ledger, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow,
  Fund Flow, GST Summary.
- `src/pages/JournalRegister.jsx` is a report page added specifically for this — a chronological
  list of every `journal_entries` row joined to its account name, filterable by date range, so a
  CA gets an actual journal, not just a ledger.

### Financial-year correctness
The invoice-numbering side of the system already used the Indian financial year (April 1 – March
31) correctly via a server-side `financial_year_for()` SQL function. The **report date-pickers**
did not — they defaulted to the current calendar month. Fixed by adding
`src/lib/financialYear.js`, a small client-side mirror of the same April–March logic
(`thisFinancialYearRange()` / `lastFinancialYearRange()`), and:
- Changing the default date range to **"start of current FY → today"** instead of "start of this
  month" on: Journal Register, Profit & Loss, Cash Flow, Fund Flow, GST Summary, Sales Register,
  Item Profitability.
- Adding explicit **"This FY" / "Last FY"** quick-select buttons on the same pages.
- The Dashboard's "sales this month" widget was deliberately left on calendar-month — it's meant
  to answer "how's this month going," not a filing-period question.

Documented in `ROADMAP.md` as **Phase 19**.

## 8. GST rate-change alerting — email replaced with an in-app notification bell

Originally (Phase 8): a weekly Vercel Cron job hashes the visible text of the CBIC GST
notifications page, compares it to the last check, and — on a detected change — logged it **and
emailed** a configured address via Resend.

**This was changed on explicit request** ("instead of sending gst alert to mail you can add
notification icon in the website" → confirmed as "replace email entirely," not run alongside it):
- `api/check-gst-notifications.js` no longer sends any email. It only computes the page hash,
  compares to the last logged hash, and inserts a row into `gst_notification_log`
  (`notification_found`, `page_hash`). The `sendAlertEmail()` function and the now-unused
  `GST_ALERT_EMAIL` env var were removed entirely (from `.env`, `env.example`, and code).
- `src/components/Layout.jsx` now renders a **notification bell** in the app header (a hand-inlined
  SVG — there's no icon library in this project). It polls `gst_notification_log` every 5 minutes
  for rows where `notification_found = true AND reviewed_at IS NULL`, shows the count as a small
  red badge, and links to the existing `GstAlerts.jsx` page.
- The review flow itself is unchanged: an admin opens `/gst-alerts`, sees the log, clicks "Mark
  reviewed," and — per the non-negotiable rule in `CLAUDE.md` §3 — **nothing in this pipeline is
  ever allowed to touch `tax_rates` automatically**. A human always makes the actual rate-change
  decision and edits `tax_rates` by hand, with `effective_from` preserving historical invoice
  accuracy.
- `RESEND_API_KEY` / `GST_ALERT_FROM_EMAIL` remain in `.env` — they're still used, just only for
  the unrelated "Email PDF" action on invoices (Phase 16), not for GST alerts.
- Live-tested end-to-end with Playwright against a throwaway test user and a throwaway
  `gst_notification_log` row: the badge showed the correct unreviewed count, clicking it navigated
  to `/gst-alerts`, and the badge cleared after the alert was marked reviewed. All test data was
  deleted afterward and a residue check confirmed nothing was left behind.

## 9. `ROADMAP.md` is kept current

`ROADMAP.md` has been updated to fold in the export/CSV-PDF/Journal-Register work and the
financial-year default fix as **Phase 19 — CA-Ready Exports & Financial-Year Reporting**, and the
GST-alert email→bell change is reflected in Phase 8. `ROADMAP.md` and this document agree on
everything through Phase 19.

## 10. Live company data

The real company record now exists in the live Supabase project: **Lseite Private Limited**
(GSTIN not yet registered — left blank, not a placeholder), registered address in Bengaluru, GST
state code 29, IDFC First Bank account on file. All 5 existing user accounts (2 admins, 3 viewers)
are attached to it, and the 13 system chart-of-accounts rows were auto-seeded via
`bootstrap_company()`/`seed_system_accounts()`. A logo is pending — `companies.logo_url` is a
plain link to an already-hosted image (no Supabase Storage bucket was built, a deliberate call to
avoid new infrastructure for one cosmetic field); the logo will additionally be added as a static
asset for in-app branding (login page, header) once the image file itself is available on disk.

## 11. Testing discipline used throughout this project

No test framework (vitest/jest) was added — that would be new tooling for a project whose
`CLAUDE.md` explicitly asks to justify every new dependency. Instead, two testing approaches were
used depending on what was being verified:
- **Financial calculations** (GST split, weighted-average costing, FEFO consumption, trial
  balance): plain `do $$ begin assert ...; end $$;` blocks run manually in the Supabase SQL
  Editor (see `supabase/tests/gst_calc_checks.sql`), or one-off Node scripts calling the real RPCs
  against the live database and asserting on the returned rows.
- **UI/user-facing flows**: Playwright, temp-installed with `npm install --no-save playwright`
  and uninstalled again afterward, driving the actual dev server against the live Supabase
  project — never mocked. Every test run: creates a throwaway company/user/data, exercises the
  real flow, independently re-queries the database to confirm the effect rather than trusting a
  "success" toast, then deletes every row it created and re-queries to confirm zero residue.
- A recurring gotcha worth knowing if you extend this pattern: deleting `tax_rates` via the
  **service-role** client (not a real logged-in user) causes the audit-log trigger to insert a row
  with `changed_by_user = null` and `company_id = null` (tax_rates has no company scoping). These
  orphaned rows aren't caught by the usual "delete everything for this test company/user" cleanup
  filters, and because `audit_log.changed_by_user` has no `ON DELETE CASCADE`, they silently block
  `auth.admin.deleteUser()`. Fix: explicitly find and delete `audit_log` rows by
  `table_name = 'tax_rates'` before retrying user deletion, and always delete `audit_log` last.

## 12. Security posture

- `SUPABASE_SERVICE_ROLE_KEY` never reaches the frontend bundle — used only in `api/*.js` (Vercel
  functions) and local admin scripts (`scripts/manage-user.js`).
- Every table with company-scoped data has RLS keyed off `current_user_company_id()`. Tables with
  no client-writable path (e.g. `invoices`, `invoice_number_counters`) have **no insert/update/
  delete policy at all** — the only way to write is through a `SECURITY DEFINER` RPC, which redoes
  the role/company checks RLS would otherwise have done.
- Cron endpoints check `Authorization: Bearer <CRON_SECRET>` before doing anything.
- Financial inputs are validated inside the posting functions themselves, not just in React forms.
- **Fixed a critical RLS-bypass bug** (caught by Supabase's security advisor): the 4 reporting
  views (`item_current_stock`, `invoice_payment_status`, `ledger_entries`, `item_batch_status`)
  were created without `security_invoker = true`. Postgres views default to running with the
  *view owner's* privileges for RLS purposes — not the querying user's — so despite comments in
  the schema claiming otherwise, any authenticated user could have queried these views and seen
  every company's ledger, stock, invoice-payment, and batch data, bypassing RLS on the underlying
  tables entirely. Fixed by adding `with (security_invoker = true)` to all 4 view definitions in
  `supabase/schema.sql`, plus an `ALTER VIEW ... SET (security_invoker = on)` patch for the
  already-live database. Low practical impact today (only one company exists), but a structural
  leak in a schema that's explicitly multi-company-ready — worth re-checking with the Supabase
  linter after any future `create view`.

## 13. What's explicitly out of scope right now

From `ROADMAP.md` §5 "Later," unchanged: multi-branch consolidation, granular permissions beyond
admin/accountant/viewer, e-invoicing (IRN/QR) and e-way bills, TDS/TCS automation, GST 2A/2B
auto-reconciliation, multi-currency/multi-company, connected banking, WhatsApp integration,
godown/warehouse management, cheque lifecycle tracking, serial-number tracking, and job-costing
beyond the lightweight custom-order tag.

## 14. Compliance items still needing a human (CA) sign-off

Per `CLAUDE.md` §8, this software implements mechanisms but never decides compliance judgment
calls. Outstanding, unchanged from `ROADMAP.md` §6:
- [ ] CA review of the chart of accounts
- [ ] CA review of the GST calculation logic (CGST/SGST/IGST rules)
- [ ] Confirm the current e-invoicing turnover threshold before assuming it doesn't apply yet
- [ ] Confirm PF/ESI applicability rules before relying on payroll for compliance filings
- [ ] Confirm FSSAI food-license and other food-manufacturing-specific requirements
