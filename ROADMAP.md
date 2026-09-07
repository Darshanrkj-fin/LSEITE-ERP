# Company Finance & GST Software — Roadmap

## 0. Project Summary
A cloud-hosted accounting system for a single company (multi-branch ready) that handles:
- Sales & purchase invoicing with GST calculation (CGST/SGST/IGST)
- Inventory / stock tracking
- Bank payment tracking & reconciliation
- Core accounting reports (ledger, trial balance, P&L, balance sheet)
- GST summary reports (GSTR-1 / GSTR-3B style, for manual filing)
- Payroll (basic, fixed salary + deductions)
- GST rate change alerts (automated detection, manual confirm — never auto-applied)
- Manufacturing: raw-material purchase → production of finished goods → sale, with batch/expiry
  tracking and R&D recipe-trial recording (the business is a bakery-style manufacturer of
  zero-sugar sweets, not a pure trading business — items are both consumed as raw materials and
  produced as finished goods)
- Subscriptions: recurring customer plans with variable items per cycle (not a fixed box)

Every phase through Phase 37 is **built and live-tested** — see section 5 for Phases 1–19, section
5b for Phases 20–24 (multi-branch schema readiness, quote management, expanded customer fields,
advance/deposit payments, and a cohesive visual design system, drawn from a follow-up gap review),
Phase 25 (bank statement PDF import, added outside the original phase plan at user request), and
section 5d for Phases 26–37 (repo/platform hygiene, accounting period locking, AR/AP aging, party
statements, units/warehouses schema, flexible customer-and-vendor parties, partial credit/debit
notes, wastage write-offs, Swiggy/Zomato delivery settlement reconciliation, a full Consulting
module with timesheet-based billing, TDS tracking, multi-bank-account identity with CSV statement
import, fixed assets with straight-line depreciation, HR foundations (departments, designations,
attendance, leave), R&D trial generalization for cloud-kitchen/consulting project types, generic
document attachments with an expanded audit log, and a Kitchen/Consulting/People/Compliance-tiled
management dashboard — completing the `UPDATE.md` architecture review below).

Phases 38–46 (section 5e) are also **built and live-tested** — a new, separate enterprise RBAC
initiative (13 named roles, multi-role-per-person, a permissions matrix, real RLS scoping for Own
Records/Assigned Projects, and working approval workflows for fixed asset capitalization, payroll
runs, purchase invoices, wastage, project/consulting invoicing, expense claims, and technology access
requests), additive on top of everything above. Extending approval workflows to further modules is
future work, not yet scheduled — see section 5e.

Only the "Later" items after section 5e remain out of scope, and only if the business's shape
changes.

## 1. Tech Stack (all free-tier)
| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Tailwind, hosted on a Cloudflare Worker (static assets) | Free, no cold starts |
| Backend | The same Cloudflare Worker (`worker.js` dispatches `/api/*`) | Same platform as frontend, free tier |
| Database | Supabase (Postgres) | Free tier, built-in Auth |
| Auth | Supabase Auth | Multi-user ready from day 1 |
| PDF generation | `pdf-lib` | Free, open-source, already in use |
| Scheduled jobs | The Worker's own Cron Triggers (free tier) | `worker.js`'s `scheduled()` handler runs the GST notification checker and subscription cycle generator directly — no separate deployment |
| Email | Resend (free tier) | Used only for the invoice "Email PDF" action (GST alerts moved to an in-app notification bell) |
| GST calculation | Custom logic (no external API) | Free, full control |

No paid API is used anywhere in this roadmap. The only future paid dependency (not in scope now) is a GST Suvidha Provider API (ClearTax/MasterGST/Cygnet) for e-invoicing IRN generation, required only once turnover crosses the government e-invoicing threshold.

## 2. Environment Variables (.env)
Create a `.env` file at the project root (never commit this file — add it to `.gitignore` immediately).

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key   # server-side only, never expose to frontend

# App
APP_ENV=development
COMPANY_DEFAULT_STATE_CODE=your_gst_state_code

# GST notification checker (Phase 8) — surfaced via the header's
# notification bell, not email; see Layout.jsx.
GST_NOTIFICATION_SOURCE_URL=https://cbic-gst.gov.in/
CRON_SECRET=any_random_string   # protects the cron endpoint from public invocation

# Email sending (Resend free tier) — used only for the "Email PDF" action
# on invoices (Phase 16), not GST alerts
RESEND_API_KEY=your_resend_api_key
GST_ALERT_FROM_EMAIL=optional_verified_sender
```

Also create a `.env.example` file (already exists as `env.example`) with the same keys but empty/placeholder values, and commit that one instead so the structure is documented without leaking secrets.

## 3. Database Schema (high level)

### Built (Week 1 → Phase 18 — everything)
- `companies` (id, name, gstin, address, state_code, bank details, `logo_url`, `udyam_number`)
- `users` (Supabase Auth linked, role: admin/accountant/viewer, `can_manage_users` flag)
- `chart_of_accounts` (id, name, type: asset/liability/income/expense/equity, `system_role` — now
  13 system accounts: the original 9 plus `raw_material_inventory`, `finished_goods_inventory`,
  `cost_of_goods_sold`, `rnd_expense`)
- `journal_entries` (id, date, account_id, debit, credit, reference_type, reference_id)
- `parties` (id, name, gstin, state_code, type: customer/vendor, `email`)
- `items` (id, name, hsn_sac_code, unit, opening_stock, type: good/service, `low_stock_threshold`,
  `item_type` [raw_material/finished_good], `category`, `average_cost` [raw materials only])
- `tax_rates` (id, hsn_sac_code, rate, effective_from, effective_to)
- `invoices` / `invoice_line_items` / `invoice_number_counters` (sales, purchase, and — via a widened `invoice_type` — `sales_credit_note`/`purchase_debit_note`; `invoices` also carries a nullable `custom_order_id`)
- `credit_notes` (issued automatically on mid-period invoice cancellation)
- `item_batches` (item_id, expiry_date, unit_cost — unit_cost populated for finished-goods batches only) + `item_batch_status` view (remaining quantity per batch, backs the batch/expiry and stock valuation reports)
- `stock_ledger` (quantity in/out, generalized beyond invoices via `reference_type`/`reference_id` — invoice, production_entry, or rnd_trial — plus a nullable `batch_id`)
- `production_entries` (+ nullable `custom_order_id`) / `production_entry_consumptions`
- `rnd_trials` / `rnd_trial_consumptions` (recipe-trial raw material consumption, expensed — not inventoried)
- `custom_orders`
- `subscriptions` / `subscription_cycles` / `subscription_cycle_items`
- `payments` / `bank_transactions`
- `employees` / `payroll_runs`
- `gst_notification_log`
- `audit_log` (generic master-data edit history, admin-only)
- Report functions: `item_profitability()`, `stock_valuation()`, `cash_flow_summary()`, `fund_flow_summary()` (alongside the existing `trial_balance`/`profit_and_loss`/`balance_sheet`/`gstr3b_summary`)

## 4. Phased Build Plan — Built

### Week 1 — Foundation ✅
- Supabase project setup, schema migration for core tables above
- Supabase Auth wired into frontend (username-based login, role field)
- Company profile screen (GSTIN, address, bank info)
- Chart of accounts, item master, party master CRUD screens
- `.env` / `env.example` set up, `.gitignore` confirmed

### Week 1–2 — Sales & Purchase Invoicing ✅
- Invoice entry screens (sales + purchase)
- GST calculation logic: same state_code → CGST+SGST; different → IGST
- Rate pulled from `tax_rates` table (never hardcoded)
- Auto-post to `journal_entries` on save (double-entry: debit = credit)
- PDF invoice generation with GSTIN, HSN codes, tax breakup
- Invoice cancellation (reversing entry), extended to full credit/debit notes so a mid-period
  cancellation never silently rewrites an already-filed period's figures

### Week 2 — Inventory / Stock Tracking ✅
- `stock_ledger` auto-updated on sales (out) and purchases (in)
- Current stock view per item
- Low-stock alert threshold per item

### Week 2–3 — Bank & Payment Tracking ✅
- `payments` table linked to invoices (partial/full), with cancellation (reversing entry)
- `bank_transactions` manual entry screen
- Reconciliation screen: match bank transaction ↔ payment

### Week 3 — Core Reports ✅
- Ledger view (account-wise / party-wise)
- Trial balance
- Profit & Loss
- Balance Sheet

### Week 3–4 — GST Summary Reports ✅
- GSTR-1 style sales register export (includes credit-note rows)
- GSTR-3B style summary export (sales, less sales credit notes, purchases, less purchase debit notes)
- Used for manual filing via portal/CA — no auto-filing

### Week 4+ — Payroll ✅
- Employee master
- Monthly salary run (fixed gross + manually-entered deductions) → auto-generates payslip + posts journal entry
- Payroll register report

### Phase 8 — GST Rate Change Alerts ✅
- Vercel Cron Job (weekly) hits a serverless function
- Function hashes the CBIC GST page's text content and compares to the last check — detects
  *that* something changed, never claims to parse *what* changed (the site has no stable,
  documented structure to parse reliably)
- On a change → logs it to `gst_notification_log`, surfaced via a notification bell in the app
  header (badge = count of unreviewed alerts, polled every 5 minutes) — no email is sent; this
  replaced the original email-via-Resend alert per explicit request
- **You review the notification (via the bell → GST Alerts page) and manually update the
  `tax_rates` table** — nothing is auto-applied
- `effective_from` date on `tax_rates` ensures old invoices keep using the rate that applied at the time

### Phase 9 — Manufacturing Foundations ✅
- `items.item_type` (raw_material/finished_good, constrained to `type='good'`) and `items.category`
  (plain free text) — Item Master's form/list updated.
- `item_batches` table (expiry_date + unit_cost, the latter populated only for finished-goods
  batches from Phase 10 onward).
- `stock_ledger` generalized: `invoice_id` → `reference_id` + new `reference_type`
  (`invoice`/`production_entry`/`rnd_trial`), plus a nullable `batch_id`.
- **No expiry alert was built** — you asked to remove that; batch/expiry data is still tracked and
  surfaced later (Phase 13's planned report).

### Phase 10 — Raw Material Costing, Production & R&D Recipe Trials ✅
The core manufacturing gap — a real accounting-model change, not just a new screen:
- New system accounts: `raw_material_inventory`, `finished_goods_inventory` (asset),
  `cost_of_goods_sold`, `rnd_expense` (expense).
- `items.average_cost` (raw materials only): running weighted-average, recomputed on every
  raw-material purchase. **Confirmed and built**: a purchase invoice's raw-material lines route
  automatically to `raw_material_inventory` instead of the manually-picked expense account
  (non-raw-material lines on the same invoice still use whatever account was picked, unchanged).
- `production_entries` / `production_entry_consumptions`: logs a batch (finished good produced,
  quantity, raw materials consumed at their cost-at-time), creates the output's `item_batches` row,
  consumes raw materials FEFO, and posts a pure cost-transfer journal entry (debit
  `finished_goods_inventory`, credit `raw_material_inventory`) — no P&L impact at production time.
- `post_invoice` gained a COGS leg for finished-goods sales: debit `cost_of_goods_sold`, credit
  `finished_goods_inventory`, at the FEFO-consumed batch's `unit_cost`.
- `rnd_trials` / `rnd_trial_consumptions`: consumes raw materials FEFO like production, but never
  creates finished-goods stock and expenses the cost immediately (debit `rnd_expense`, credit
  `raw_material_inventory`) instead of transferring it to inventory.
- `cancel_invoice` guards against reverting `average_cost` once later purchases/consumption have
  happened (blocks the cancellation with a clear error in that case — confirmed and built) and
  carries `batch_id` through its stock reversal.
- Tested: 21 automated checks (weighted-average math, the cancellation guard firing/not firing
  correctly, FEFO consumption, COGS posting, R&D expensing, insufficient-stock rejection) plus a
  live browser pass on the new fields/pages.

### Phase 11 — Custom/Bespoke Order Costing ✅
- `custom_orders` (plain CRUD, admin/accountant write) + nullable `custom_order_id` on
  `production_entries` and `invoices`, so a bespoke batch/sale can later be filtered and its
  cost/revenue looked at separately. No quotation/pricing engine.
- Tested: RLS (viewer blocked, admin allowed), tagging both an invoice and a production entry,
  rejecting a non-existent custom order, and specifically confirming `post_invoice`/
  `post_production_entry`'s signature change didn't leave a duplicate function overload behind
  (a real Postgres gotcha — `CREATE OR REPLACE` doesn't replace a function whose argument list
  changed; the old signature had to be `DROP`ped explicitly first).

### Phase 12 — Subscriptions ✅
- `subscriptions` / `subscription_cycles` / `subscription_cycle_items` — a cycle's items are
  whatever was actually included that cycle (variable, not a fixed box).
- **Manual path**: staff create a draft cycle + its items directly (plain RLS-protected table
  writes), then "Finalize" (an RPC) turns it into a real posted invoice via the existing
  `post_invoice` — reused, not duplicated.
- **Auto path**: a new Vercel Cron job (`api/generate-subscription-cycles.js`, same
  CRON_SECRET-protected pattern as Phase 8) ensures a draft cycle exists once a subscription's
  next billing date arrives — copying the previous cycle's items as a starting point. It never
  touches a cycle staff already pre-created for that date, and never auto-finalizes anything;
  a person always reviews/edits the draft before it becomes a real invoice. This is how the
  "both manual and auto option" answer was implemented: both paths write to the same
  `subscription_cycles`/`subscription_cycle_items` tables, so a staff pre-selection and the
  cron's fallback never conflict.
- RLS on `subscription_cycles` explicitly blocks a client from setting `status='finalized'`
  directly (only `finalize_subscription_cycle()` can do that) — a client can create/edit/delete
  a `draft` cycle or flip it to `skipped`, nothing else.

## 5. Phased Build Plan — Phases 13–19 (from the TallyPrime feature-gap review)

### Phase 13 — Enhanced Reporting ✅
- Item-wise profitability report (revenue from `invoice_line_items` on posted sales invoices, COGS
  from `stock_ledger`'s FEFO-consumed batches — both self-correct for a later cancellation without
  needing a separate status filter on the cost side).
- Stock valuation report (`average_cost` for raw materials, batch `unit_cost` for finished goods),
  backed by a new `item_batch_status` view shared with the batch/expiry report below.
- Batch/expiry report — plain sortable/filterable list, replacing the alert idea you removed with
  an always-available report instead.
- Dashboard (sales this month, low-stock items, subscription cycles awaiting review, batches
  nearest expiry) — now the app's landing page. Plain HTML/CSS bars/numbers, no charting library.
- Caught and fixed a real bug during testing: `Login.jsx` had a hardcoded post-login redirect to
  `/company` left over from before the Dashboard existed, silently skipping the new landing page
  on every sign-in.

### Phase 14 — Master-Data Edit Log ✅
- Generic `audit_log` + a trigger-based `log_audit_change()` on `items`, `parties`, `tax_rates`,
  `chart_of_accounts` — admin-only read (same sensitivity as the users table's own "admin sees
  everyone" rule). `tax_rates` has no `company_id` (GST rates are global) — its rows log
  `company_id = null`, and the select policy accounts for that.
- Caught and fixed a real bug during testing: `TG_OP` is always uppercase (`'INSERT'`/etc.), but
  the trigger's branching compared it against lowercase literals, so every operation was silently
  treated as a no-op until `bootstrap_company` hit the resulting not-null violation.

### Phase 15 — Bulk Item Import (CSV) ✅
- CSV upload on Item Master, parsed client-side with a small hand-written parser (no new
  dependency, handles quoted fields with embedded commas) — inserted via the existing
  `items_write` RLS policy. Invalid rows are skipped individually with a per-row message.

### Phase 16 — Invoice Polish ✅
- `companies.logo_url` (a link to an already-hosted image — no Supabase Storage bucket, that's new
  infrastructure for one cosmetic field) and `companies.udyam_number`, both printed on invoice
  PDFs when set; a bad logo URL just skips the logo rather than breaking generation.
- `parties.email` pre-fills (but doesn't lock in) the recipient for a new "Email PDF" action,
  which reuses Phase 8's Resend integration. PDF-building logic was extracted into
  `lib/invoicePdf.js` so the download and email paths can't drift apart.
- Note for later: your Resend account can currently only deliver to its own registered address —
  verify a sending domain at resend.com/domains before emailing real customers.

### Phase 17 — Bank Reconciliation Auto-Suggest Matching ✅
- No new tables. Selecting an unmatched bank transaction pre-selects its closest likely payment
  (amount weighted heavily over date proximity, within a 30-day window) — still requires the
  manual "Match Selected" click, and any suggestion can be overridden before confirming.

### Phase 18 — Cash Flow / Fund Flow Reports ✅
- `cash_flow_summary()`: opening/movement/closing per bank-cash account (any asset account with
  no `system_role` — every other asset account is already system-tagged, so an untagged one is,
  in this app's actual usage, always a bank/cash account).
- `fund_flow_summary()`: change in each balance-sheet account between two dates, classified as a
  source or application of funds. Includes a synthetic "Net Profit for Period" row (the same idea
  as `balance_sheet()`'s own "Current Earnings" plug) — without it, sources would never equal
  applications except in a period with exactly zero profit or loss.

### Phase 19 — CA-Ready Exports & Financial-Year Reporting ✅
- **New report**: Journal Register (`src/pages/JournalRegister.jsx`) — a chronological list of every
  `journal_entries` row joined to its account name, filterable by date range. Added so a CA gets an
  actual journal to work from, not just a ledger.
- **CSV + PDF export**, generated entirely client-side (no new backend endpoint, no new
  dependency — PDF export reuses the `pdf-lib` dependency already in place for invoice/payslip
  PDFs), added to: Journal Register, Ledger, Trial Balance, Profit & Loss, Balance Sheet, Cash
  Flow, Fund Flow, and GST Summary. Shared helpers: `src/lib/exportCsv.js` (quoting/escaping,
  triggers a `Blob` download) and `src/lib/exportPdf.js` (paginated A4-landscape table PDF,
  auto-repeats the header row across pages).
- **Financial-year-aware report defaults**: report date-pickers previously defaulted to the current
  calendar month, which doesn't match how a CA works with a whole FY at a time (April 1–March 31 —
  already correctly used for invoice numbering via `financial_year_for()`, but not mirrored on the
  frontend). Added `src/lib/financialYear.js` (a client-side April–March mirror of that logic) and:
  changed the default date range to "start of current FY → today," and added explicit "This FY" /
  "Last FY" quick-select buttons, on Journal Register, Profit & Loss, Cash Flow, Fund Flow, GST
  Summary, Sales Register, and Item Profitability. The Dashboard's "sales this month" widget was
  deliberately left on calendar-month — it answers a different question ("how's this month going"),
  not a filing-period one.

Every phase above is now built and live-tested — this closes out the plan from the TallyPrime
feature-gap review.

## 5b. Phased Build Plan — Phases 20–24 (from a follow-up gap review)

**Decisions already made — not open questions, don't re-litigate:**
- Stack stays Vercel + Supabase (Postgres) — no Oracle VM, no self-hosting. An earlier
  idurar/AntD-based plan is fully retired.
- AntD is dropped — stay on Tailwind. Phase 24 is a design-token/CSS pass, not a framework swap.
- Offline support is out of scope — it was considered as a safety net, not an actual need.
- Nothing already built is being removed: R&D trials, Fund/Cash Flow reports, Audit Log,
  Subscriptions, and Bank Reconciliation auto-suggest all stay exactly as they are.

### Phase 20 — Multi-Branch Schema Retrofit ✅
- New `branches` table (id, company_id, name, state_code, `is_default`), RLS scoped by company like
  other structural tables. One branch is auto-seeded per existing company with `is_default = true`,
  so a single-branch company's behavior is unchanged.
- Nullable `branch_id` added to `invoices`, `payments`, `employees`, `payroll_runs`,
  `production_entries`, `custom_orders`, `subscriptions` via a plain column `default
  current_user_default_branch_id()` — every one of those tables' existing insert paths (RPCs and
  plain client-side inserts alike) names its columns explicitly and never mentions `branch_id`, so
  Postgres fills it in automatically with zero code changes anywhere. `quotes` (Phase 21) gets
  `branch_id` built into its own table instead of a later ALTER, since it doesn't exist yet.
- **No branch-switcher UI or per-branch report filtering yet** — this phase is purely schema
  plumbing, done now because retrofitting `branch_id` after more tables/data exist is expensive.
  The UI comes only once a second branch actually opens.
- Tested: backfill confirmed (Lseite Private Limited got exactly one default branch with its own
  state_code), and — since a service-role call has no `auth.uid()` and would give a false pass —
  the `DEFAULT` was verified with a throwaway user signed in through a real session, inserting an
  `employees` row with no `branch_id` supplied and confirming it came back populated with the
  correct default branch id. Self-check per CLAUDE.md §7: `trial_balance()` still returns cleanly
  and balanced (0 = 0 — no transactions exist yet to unbalance).

### Phase 21 — Quote Management ✅ (fills a real gap in the original spec)
- Workflow: customer asks for a price → formal quote sent → customer accepts → becomes an invoice.
- New `quotes` / `quote_line_items` / `quote_number_counters` tables, shaped like
  `invoices`/`invoice_line_items`/`invoice_number_counters`. Quote status flow: draft → sent →
  accepted/rejected/expired → converted. Quotes are sales-only (no `type` column).
- A quote has **no accounting impact**: `post_quote()` validates and writes the quote + line items
  only (no `journal_entries`), calling the existing `resolve_tax_rate()`/`calculate_gst_split()` for
  tax math — never reimplementing it, same as `post_invoice()`.
- **Gap filled beyond the original spec**: `quotes` has no `revenue_expense_account_id` (a quote
  never posts to the ledger, so it never needed one) — `convert_quote_to_invoice()` takes it as an
  explicit argument instead, chosen by whoever converts the quote.
- **`update_quote_status(p_quote_id, p_new_status)`** — the only client-facing way to change a
  quote's status (sent/accepted/rejected/expired). Added because a plain client-side `UPDATE`
  policy can't restrict which *columns* a request touches — RLS only gates rows — so "mark as sent"
  and "silently rewrite grand_total" would otherwise be the same permission. Refuses to touch an
  already-`converted` quote and can never set status to `converted` itself.
- `convert_quote_to_invoice(p_quote_id, p_revenue_expense_account_id)` validates `status =
  'accepted'` and not already converted, then calls the existing `post_invoice()` with the quote's
  line items — reusing invoice posting, not duplicating it — using **today's date** (not the
  quote's date) so the invoice correctly picks up whatever tax rate applies at the actual moment of
  sale. Sets `quotes.converted_invoice_id` and flips status to `converted`.
- Numbering reuses `financial_year_for()` with its own `QT/<financial_year>/00001`-style counter
  table, so quote and invoice numbers never collide.
- Quote PDF reuses `lib/invoicePdf.js`'s layout (extended with optional `heading`/`numberLabel`
  params, defaulting to unchanged invoice behavior) via a new `api/quote-pdf.js`, labeled
  "QUOTATION" with "Quote #" instead of "Invoice #."
- New `src/pages/Quotes.jsx` router + `QuoteList.jsx`/`QuoteForm.jsx`/`QuoteDetail.jsx`, structured
  like the existing invoice components, with status-transition buttons and a "Convert to Invoice"
  action (revenue-account picker) on accepted quotes — admin/accountant only, same authorization
  pattern as everywhere else.
- Tested live end-to-end with throwaway data: posted a quote and confirmed **zero** `journal_entries`
  exist (a quote must have no accounting impact), confirmed the same-state tax split (CGST+SGST) was
  computed correctly, walked it through draft → sent → accepted, confirmed `update_quote_status`
  rejects setting `status = 'converted'` directly, converted it and confirmed the resulting
  invoice's journal entries balance exactly (debit = credit), and confirmed the quote's own status
  flipped to `converted` with `converted_invoice_id` set. Also built the quote PDF directly to
  confirm the reused layout renders correctly for a quote-shaped object. Self-check per CLAUDE.md
  §7: `trial_balance()` still balanced after cleanup (0 = 0).
- **A mistake caught and fixed during this phase's own test cleanup**: an overly broad `audit_log`
  delete (`table_name = 'chart_of_accounts' AND changed_by_user IS NULL`) swept up the real
  company's original 13 legitimate chart-of-accounts seed audit rows along with the test row, since
  both matched the same filter. Caught immediately, and restored exactly (same ids, `record_id`s,
  and `new_values`) from this session's own earlier record of that data — verified back to 13 rows
  matching the original content.

### Phase 22 — Customer Management Enhancements ✅
- Adds `phone`, `billing_address`, `shipping_address` to `parties` — nullable, loosely validated
  contact/logistics fields, not financial data. `PartyMaster.jsx`'s existing flat list + inline-edit
  table (same pattern as `ChartOfAccounts.jsx`/`ItemMaster.jsx`) extended with the three new columns
  as single-line inputs, matching how `CompanyProfile.jsx` already handles its own `address` field
  rather than introducing a new multi-line/textarea pattern.
- Tested live: added a party with phone/billing/shipping populated, confirmed it saved and
  round-tripped correctly; edited it and confirmed the update persisted; added a second party with
  all three fields left blank and confirmed they store as `null` (not empty strings). Self-check
  per CLAUDE.md §7: `trial_balance()` still balances after cleanup (0 = 0).

### Phase 23 — Advance/Deposit Payments ✅ (optional, per custom order)
- Not every custom order needs this — modeled as something staff can optionally attach, not a
  mandatory step. An advance is a **liability** (the company owes goods or a refund) until the
  final invoice is raised — it must never post straight to Accounts Receivable.
- New system account role `customer_advances` (liability) — 14th system account, seeded alongside
  the original 13 via `seed_system_accounts()` (updated) plus a one-time backfill for existing
  companies. New `customer_advances` table (company_id, custom_order_id, party_id, amount,
  bank_account_id, advance_date, status: unapplied/applied/refunded, applied_invoice_id,
  entry_group_id).
- **Gap filled beyond the original spec**: `invoice_payment_status` (the view `PaymentsSection.jsx`
  reads for "balance due") only summed the `payments` table — since `apply_advance_to_invoice()`
  credits Accounts Receivable directly rather than inserting a `payments` row (a `payments` row is
  expected to correspond to a real bank movement, which an advance-application isn't — the cash
  already moved when the advance itself was taken), the view was redefined to also fold in applied
  advances, so "what's still owed" stays accurate everywhere it's read.
- `post_customer_advance()` validates the party matches the custom order's own customer (a real
  safeguard, not just a form default), debits the chosen bank/cash account, and credits
  `customer_advances` — balances independently of any invoice.
- `apply_advance_to_invoice(p_advance_id, p_invoice_id)` validates the advance's party matches the
  invoice's party, and guards against over-applying beyond what the invoice actually still owes
  (same discipline as `post_payment()`'s own balance check) — debits `customer_advances` and
  credits Accounts Receivable, dated today. Applies the full advance amount in one shot (matches
  the schema's single `applied_invoice_id` FK, not a partial-tracking ledger). Kept as its own
  function rather than overloading `post_payment()`'s meaning, since no new cash moves at apply-time.
- `refund_customer_advance()` reverses the original posting exactly (never edits it) — only while
  still `unapplied` — for a custom order that falls through after a deposit was taken.
- **Known gap, deliberately out of scope**: `bank_transactions.matched_payment_id` only references
  `payments(id)`, so an advance's own bank inflow can't be matched through the existing
  Reconciliation screen. Widening that FK to be polymorphic would be a bigger structural change
  than "optional, per custom order" calls for.
- **UI gap filled**: `CustomOrders.jsx` had no detail view at all (unlike Sales Invoices/Quotes) —
  became a router (`CustomOrderList.jsx` + `CustomOrderDetail.jsx`, matching the established
  list→detail pattern) so the "Advance Payment" action has a real page to live on. An unapplied
  advance surfaces as a selectable credit on the *invoice's* detail page once posted (applying
  needs a real invoice id to exist first), not during the invoice-creation form itself.
- Tested live end-to-end: posted an advance (confirmed zero relation to any invoice), rejected a
  mismatched-party advance, posted a sales invoice for the same custom order, confirmed
  `invoice_payment_status` showed the full balance before applying, applied the advance and
  confirmed the view correctly dropped the balance by the advance amount, rejected re-applying an
  already-applied advance and rejected an over-large advance, refunded a separate unapplied advance
  and confirmed that journal balances too, and confirmed the invoice's own journal entries still
  balance throughout. Self-check per CLAUDE.md §7: `trial_balance()` still balances after cleanup.
- **The same audit_log cleanup mistake from Phase 21, made again**: this phase's own test cleanup
  reused the identical overly-broad `audit_log` delete filter (`table_name = 'chart_of_accounts'
  AND changed_by_user IS NULL`) and deleted all 14 legitimate seed rows (the original 13 plus the
  new `customer_advances` one from this phase's own backfill) a second time. Caught in the residue
  check, and restored — the original 13 from this session's earlier record, the 14th reconstructed
  from the live `chart_of_accounts` row's own actual data since it had no prior record to restore
  from. Verified back to 14 rows, all with `record_id`s matching real live accounts. This filter
  pattern (`table_name = 'chart_of_accounts' AND changed_by_user IS NULL`) must never be used in
  test cleanup again — it cannot distinguish real system-account seed rows from test rows, since
  both are always inserted via the service-role client with no `auth.uid()`. Any future cleanup
  touching `chart_of_accounts` audit rows must filter by `record_id` (the specific test account's
  own id) instead, never by table+null-user alone.

### Phase 24 — Design System / UI Polish ✅ (cosmetic, touches no business logic)
- Confirmed first: the project was already on Tailwind v4 with the exact CSS-first `@theme` setup
  the plan needed (`@import "tailwindcss"` in `src/index.css`, no separate `tailwind.config.js`) —
  the version-mismatch risk flagged when this phase was planned turned out to be a non-issue.
- `src/index.css` gets the `@theme` block verbatim from the plan: ink/teal/sage/gold/clay/paper/
  mist/line/muted color tokens, Fraunces (display) / Inter (sans) fonts, `body` on the paper
  background.
- **Real bug caught and fixed along the way**: the sidebar `<aside>` had no independent scroll
  region (unlike `<main>`, which already had `overflow-auto`). The old light `bg-slate-50` sidebar
  hid this completely; once it went dark (`bg-ink`), nav items past the fold rendered on the page's
  light background instead of the sidebar. Fixed with `overflow-y-auto` on the `<aside>`, verified
  by screenshotting the sidebar scrolled to the bottom.
- Global sweep across all 43 files with an `<h1>` or one of the target color classes: page `<h1>`
  titles get `font-display text-ink` (and *only* titles — verified afterward that no `<h2>`/`<h3>`
  picked up the serif by mistake); every other `text-slate-800`/`text-slate-700` occurrence
  (row-action links, stat values, section subheadings) got `text-ink` without the serif;
  `text-slate-500`/`text-slate-400` and the 36 form-label spans (`text-slate-600` in the exact
  `<span className="mb-1 block text-slate-600">` pattern only — link/button chrome using the same
  slate-600 shade was deliberately left alone) all became `text-muted`; `text-red-600`/`text-red-700`
  became `text-clay`; `text-amber-700` became `text-gold`; primary buttons (`bg-slate-800` /
  `hover:bg-slate-700`) became `bg-ink` / `hover:opacity-90` — extended beyond the plan's literal
  three rules for visual coherence (leaving buttons slate while the sidebar went a different dark
  color would have read as two competing "blacks"). Executed via `sed` given the scale (43 files)
  and the codebase's extreme structural consistency, not 300+ manual edits — verified after with
  greps confirming zero stray old tokens remained and the `<h1>`-only scoping held exactly.
- **Deliberately not done — flagging rather than skipping silently**: the plan's "status badge
  (posted/paid → teal, pending/draft → gold)" rule assumes badges already exist as a UI pattern to
  re-skin. This app has no pill/background badge treatment anywhere — every status is plain
  capitalized text (`<td className="capitalize">{status}</td>`). Adding real colored-pill badges
  across every list view (invoices, quotes, payments, custom orders, payroll runs) would be a new
  UI pattern, not a token swap, and wasn't built here. Worth a follow-up if wanted.
- Dense data tables left structurally as-is — just the gray-scale tokens swap. No shadows on every
  card (dashboard stat tiles and the login card use `bg-mist` + `border-line` instead), no ALL-CAPS
  stat labels, no decorative gradients spread across every table cell.
- Verified visually, not just by compiling: screenshotted the login page, the dashboard (both
  before and after the sidebar-scroll fix), and two data-heavy pages (Party Master's wide table +
  form, Chart of Accounts' Edit/Delete row actions) via a throwaway user driven through a real
  browser session. Full cleanup after each pass — throwaway users deleted, temp scripts and
  screenshots removed, `playwright` uninstalled again.

### Phase 25 — Bank Statement PDF Import ✅ (added outside the original phase plan, at user request)
- Not part of the original 24-phase plan — flagged as out-of-plan when requested, then built with
  explicit approval, per this file's own "stay on the roadmap" rule.
- `src/lib/bankStatementParser.js` parses IDFC FIRST Bank statement PDFs entirely client-side via
  `pdfjs-dist` (new dependency, approved before installing) — the statement file itself is never
  uploaded anywhere. `getTextContent()` returns unordered text items by (x, y) position, not reading
  order, and this particular bank's PDF layout turned out to have two non-obvious quirks discovered
  by direct coordinate inspection: the "Particulars" column text is vertically *centered* on its row
  rather than top-aligned (so some description lines sit above the date line's own y), and long
  particulars blocks can continue onto the next page before that page's first dated row appears,
  requiring an explicit carry-over rule distinguished from a row's own above-center content via a
  self-calibrating gap-size heuristic (not a hardcoded pixel threshold).
- Every parsed row is checked against the statement's own running balance column (previous balance ±
  amount = stated balance) and flagged if it doesn't reconcile — a format-specific correctness signal
  independent of the layout-parsing logic itself.
- `src/components/bankTransactions/ImportStatementSection.jsx`, wired into `BankTransactions.jsx`
  (admin/accountant only): upload → the parser's own flagged rows and any row matching an existing
  transaction on date+amount are skipped automatically, everything else inserts into
  `bank_transactions` immediately (no review step, no checkboxes, per explicit user request — the
  monthly-import workflow shouldn't require re-checking dozens of rows by hand). A summary lists what
  was imported and, separately, what was skipped and why, so skipped rows can be added by hand via the
  existing manual-entry form below if they turn out to be needed. Every insert still goes through the
  same RLS-scoped path as typing a transaction in manually.
- **Real bug caught during testing**: `BankTransactions.jsx`'s post-import refresh originally reused
  the same `load()` used everywhere else, which sets `loading=true` and made the whole page — including
  `ImportStatementSection` — unmount and remount via the page's `if (loading) return <p>Loading…</p>`
  guard, wiping the just-set import summary before it could render. Fixed with a `silent` refresh mode
  used only after an import.
- Duplicate detection is a match on date+amount against every transaction already in the company's
  `bank_transactions`, not a database constraint — deliberately, since two genuinely separate
  transactions can share a date and amount (e.g. two identical same-day UPI transfers), and a hard
  uniqueness constraint would wrongly block a legitimate one.
- Verified against a real 58-page, 743-transaction statement: 742 of 743 rows parsed with zero
  issues, and the parsed amounts independently reconcile exactly against the statement's own printed
  Total Debit/Total Credit and Closing Balance. Separately verified the automatic import/skip/summary
  behavior end-to-end with a synthetic statement covering all three outcomes (clean row imported,
  duplicate skipped, reconciliation-flagged row skipped). **Known limitation**: on the one unusually
  long (8+ line) particulars block in the real test statement, sandwiched between short rows, a couple
  of words at the very edge of the description landed on the wrong row — the date/amount/balance for
  that row were still correct (confirmed by the same reconciliation check). Since this only affects
  free-text description completeness, not any financial figure, this was accepted as a known edge
  case rather than a blocker.
- Only supports this one bank's layout for now — a different bank's statement format would need its
  own parser (the header-detection and coordinate logic here is specific to IDFC FIRST's PDF layout).

## 5c. Decisions Already Made (UPDATE.md architecture review, 2026-09-05)
`UPDATE.md` is a 60-section architecture review proposing a much larger v2 direction: Cloud
Kitchen + Consulting as twin business lines, a generalized tax/party/journal model, full HR/payroll,
TDS, fixed assets, Tally export, and more. Two scope decisions were made up front so they aren't
re-litigated per phase below:
- **Additive-first, defer refactors.** Where `UPDATE.md` calls for *refactoring* an already-built,
  tested foundation — the journal posting model, the party model, the tax-calculation model, the
  banking model, or payroll — that refactor is deferred unless a concrete gap forces it. New phases
  build on top of what exists instead. Each phase below flags what it's deliberately not rebuilding
  and why.
- **Phase order** continues this file's existing numbering from Phase 26, following the priority
  order `UPDATE.md` §50/§51 itself recommends (accounting integrity and master data first, dashboard
  polish last — "do not prioritize visual redesign above accounting correctness").

## 5d. Phased Build Plan — Phases 26–37 (from the UPDATE.md architecture review)

### Phase 26 — Repository & Platform Hygiene ✅
- Confirmed repo hygiene already held: `node_modules/`, `dist/`, `build/`, `.env` were already
  gitignored, and `npm install && npm run build` succeeds clean (confirmed `dist/` stays untracked
  once it exists, via `git check-ignore`).
- Added `.env.example` (didn't exist before this phase) listing the variables already documented in
  §2 above, placeholder values only — never real keys.
- Documented the explicit-PostgREST-grants convention at the end of `schema.sql` (`grant select,
  insert, update, delete on <table> to authenticated; grant all on <table> to service_role;`) for
  every `create table` from this phase onward, ahead of the October 30, 2026 deadline — see §6 below
  for what this actually requires (existing tables are unaffected either way). No table was created
  in this phase, so nothing needed the grants yet — this only establishes the pattern for Phase 27+.
- Added a top-level React error boundary (`src/components/ErrorBoundary.jsx`, wrapping the app in
  `main.jsx` above `BrowserRouter`/`AuthProvider`) so an unexpected render error shows a plain
  "Something went wrong, Reload" screen instead of a blank page — the one genuinely new piece of
  code in this phase.
- **Verification note**: `npm run build` and `npm run lint` both ran clean against the changed files
  (the only lint warning is a pre-existing unrelated one in `SubscriptionCycleDetail.jsx`). A live
  browser smoke test was attempted (Playwright) but couldn't run — the sandbox had no network route
  to download the Chromium binary — so the error boundary's actual rendering in a browser is
  unverified beyond the successful build/lint. Flagging this rather than claiming a browser test
  that didn't happen.
- Self-check per CLAUDE.md §7: no schema or posting-logic change in this phase, so trial balance is
  unaffected.
- **Deliberately not adopted**: a `supabase/migrations/` folder structure. The single dated-sections
  `schema.sql` file (with git history as the version log) has carried 25 phases of real, tested
  schema changes with no actual pain point — switching now would be process churn with no concrete
  problem it solves, against the minimalism rule in CLAUDE.md §5.

### Phase 27 — Accounting Periods & Reporting Dimensions ✅
- New `accounting_periods` table (company_id, period_start, period_end, status: open/closed — the
  "under review"/"locked" states from `UPDATE.md` §6.5 collapse into open/closed since this is a
  single-accountant business, not a multi-stage approval org). Defaults to open; only admin can
  create/close/reopen one (RLS insert/update policies), via the new `AccountingPeriods.jsx` screen
  (Admin nav group) — plain list + inline add + Close/Reopen toggle, same shape as `TaxRates.jsx`.
- `post_invoice`, `post_payment`, `cancel_payment`, `post_customer_advance`,
  `apply_advance_to_invoice`, `refund_customer_advance`, and `cancel_invoice` — two more than
  originally scoped (`cancel_payment` and `apply_advance_to_invoice`), added for consistency since
  they post/reverse journal entries the same way — each get one additional guard via a new shared
  `reject_if_period_closed(company_id, date)` function: reject if the posting date (or `current_date`
  for the four that always post today) falls in a closed period for that company. An additive check
  inside the existing SECURITY DEFINER functions — no change to how they already build or balance
  journal entries.
- New nullable `business_unit` text column on `invoices` and `journal_entries` (Cloud
  Kitchen/Consulting/R&D/Administration — plain text, not a new table, since the set is small and
  stable) — enables business-unit-filtered P&L later without restructuring the ledger. No UI reads or
  writes it yet; left for a future phase that actually needs the dimension.
- New `ar_ap_aging()` function + `ArApAging.jsx` report (Reports nav group): buckets are by days
  since `invoice_date`, not a formal due date — this app doesn't track payment terms, so "Current"
  means the invoice itself is 0-30 days old, not "not yet due." Labeled `Current (0-30)`/`31-60`/
  `61-90`/`90+` (4 buckets, not `UPDATE.md`'s 5, since there's no due-date concept to split "Current"
  from "1-30 days late").
- New `party_statement()` function + `PartyStatement.jsx` report: chronological invoice/payment
  history for one party, running balance summed client-side (debit minus credit throughout — positive
  means the party owes the business, negative means the business owes the party; this applies to
  vendors too, so a running vendor balance normally reads negative, and the page says so directly).
- **Real bug caught during testing**: `AccountingPeriods.jsx`'s insert never set `company_id` at all
  (unlike `BankTransactions.jsx`, which explicitly passes `profile.company_id`) — `accounting_periods`
  has no default for that column, so every period creation would have failed with a not-null
  violation. Fixed before this phase was reported done.
- **Real gap caught during the first test pass**: after running only the "everything new" SQL block,
  a live test showed the standalone `reject_if_period_closed()` RPC correctly rejecting a closed-period
  date, but `post_invoice()` itself let the same date straight through to its next validation step —
  proving the `create or replace function` replacements for the 7 posting functions hadn't actually
  been applied yet (only pasted as a plan, not run). Re-supplied as one paste-ready SQL file and
  re-verified: this time `post_invoice`, `post_payment`, and `post_customer_advance` all correctly
  rejected a closed-period date and correctly let an open date through to normal validation.
- Tested live end-to-end with throwaway data (a temporary income account, customer, item, tax rate,
  invoice, and payment — all deleted after): posted a real sales invoice (₹1,180 grand total, 18%
  same-state CGST+SGST) dated 45 days before "today," partially paid it (₹500), and confirmed
  `ar_ap_aging()` returned the exact expected balance due (₹680), days outstanding (45), and bucket
  (31-60); confirmed `party_statement()`'s rows summed to the same ₹680 running balance the page's own
  logic would compute; created a period through the exact insert shape `AccountingPeriods.jsx` uses,
  closed it, and confirmed `post_invoice()` was rejected for a date inside it — the same path the app
  itself would take. Full cleanup afterward (journal entries, invoice, payment, tax rate, item, party,
  test account, period, throwaway user) — confirmed `trial_balance()` back to 0 = 0 and
  `chart_of_accounts` back to exactly the 14 system-seeded rows.
- Browser-level UI verification wasn't possible this phase either (same Playwright/Chromium download
  failure as Phase 26) — relied on exercising the exact same Supabase queries/RPC calls each page
  makes, from a real signed-in session, rather than a rendered screenshot.
- One harmless, unavoidable side effect of testing real invoice posting: the `sales`/`2026-27`
  invoice-number counter now has a small gap where the deleted test invoice's number was — numbering
  counters only ever increment (never rewound, to avoid ever risking a duplicate number later), so
  this is left as-is, same as any voided real invoice would leave.
- **Explicitly deferred**: replacing `journal_entries` with a `journal_batches`/`journal_lines`
  draft→validated→approved→posted lifecycle, and a manual-journal-entry approval workflow. Neither
  closes a real gap today — there's no manual-journal feature to restrict, and every existing
  posting path already runs through a SECURITY DEFINER function with no client insert policy.
  Revisit only if a manual-journal feature is ever actually requested.

### Phase 28 — Master Data: Units, Warehouses, Flexible Party Roles ✅
- New `units` / `unit_conversions` tables (e.g. kg↔g, litre↔ml). `items` keeps its existing `unit`
  text column; a nullable `unit_id` is added alongside it, not replacing it — additive, not a
  breaking rename. No screen reads or writes `unit_id`/`unit_conversions` yet, same as
  `business_unit` in Phase 27 — schema-only, for a future phase that actually needs it.
- New `warehouses` table (company_id, branch_id, name), one default warehouse auto-seeded per
  branch (same backfill pattern Phase 20 used for branches), plus a nullable `warehouse_id` on
  `stock_ledger`/`item_batches`. No warehouse-switcher UI yet — same reasoning as Phase 20's branch
  rollout: schema plumbing first, UI once a second warehouse is actually needed.
- `parties.type` gains a third value, `'both'` — one party can be billed as a customer and paid as
  a vendor without a full party-role-table rewrite. `PartyMaster.jsx`'s type dropdown gets the new
  option. Made **actually usable**, not just a stored value: `post_invoice()`'s and
  `post_customer_advance()`'s party-type checks (`type = v_expected_party_type` / `type = 'customer'`)
  are loosened to `type in (v_expected_party_type, 'both')` / `type in ('customer', 'both')` — the
  only change in either function, otherwise byte-for-byte identical to Phase 27's versions.
- Tested live with a throwaway `'both'`-type party: posted a sales invoice against it (allowed,
  correct GST split) and posted a customer advance against it (allowed) — proving `'both'` actually
  works both ways, not just that the constraint accepts the value. Negative control: a plain
  `vendor`-type party was correctly still rejected for a sales invoice, confirming the widened check
  didn't loosen the customer/vendor distinction itself. Confirmed the branch-warehouse backfill ran
  (the one existing branch got exactly one default warehouse). Full cleanup afterward; `trial_balance()`
  back to 0 = 0, `parties`/`chart_of_accounts` back to their pre-test counts.
- **A new residue-cleanup wrinkle, not seen in earlier phases' cleanup**: deleting the throwaway
  auth user failed ("Database error deleting user") because this phase's `audit_log` (Phase 14) had
  recorded the test party's insert, and `audit_log.changed_by_user`'s foreign key blocked the
  cascade. Fixed by deleting the `audit_log` rows filtered by that exact `changed_by_user` id first —
  safe and unambiguous (only this throwaway user could match), unlike the table-name-based filter
  Phases 21/23 got burned by. Worth remembering for any future phase whose test user performs a
  write that `audit_log` tracks.
- **Explicitly deferred**: the fully generalized `party_roles`/`party_contacts`/`party_addresses`/
  `party_tax_registrations` model from `UPDATE.md` §16. `parties` already carries GSTIN, state code,
  phone, and both addresses directly (Phase 22) — splitting these into separate tables is a real
  refactor with no concrete gap forcing it yet.

### Phase 29 — Sales Enhancements: Manual Credit/Debit Notes & AR Statements ✅
- Today, `credit_notes` are only auto-issued on mid-period invoice cancellation, at most one per
  invoice. New: a manual, **partial, quantity-based** credit/debit note flow (line-by-line, not just
  a lump-sum), reusing the existing `sales_credit_note`/`purchase_debit_note` `invoice_type` values.
  `credit_notes.invoice_id` uniqueness is dropped (replaced with a plain index) so multiple notes can
  exist against one invoice over time; a `reason` text column and a `credit_notes_totals_consistent`
  check (mirroring `invoices`' own header-must-equal-sum-of-lines rule) are added.
- New `credit_note_line_items` table + `post_manual_credit_debit_note(invoice_id, reason,
  line_adjustments)`: each adjusted line's tax is computed by **proportionally scaling that line's own
  already-posted taxable_value/cgst/sgst/igst** by (adjusted qty / original qty) — deliberately never
  by re-resolving today's `tax_rate` or recomputing the same/different-state split from scratch, since
  CLAUDE.md §3 requires a posted invoice's historical tax amounts to never silently drift if a rate
  changes later; scaling the original line's own recorded amounts is the only way to guarantee the
  note always agrees with what that invoice actually posted. Guards against over-adjusting past a
  line's remaining (original minus already-adjusted-by-prior-notes) quantity, same discipline as
  `post_payment()`'s balance check. Purchase-side reversal correctly routes through the same account
  `post_invoice()`'s Phase 10 split used per line (`raw_material_inventory` for a raw-material line,
  otherwise the invoice's picked expense account) — verified live, not just assumed.
- **Known, deliberate limitation**: does not reverse `stock_ledger` quantities, `items.average_cost`,
  or the Phase 10 COGS/finished-goods-inventory posting for the returned quantity. A partial physical
  return still needs a separate manual stock adjustment for now — correctly unwinding weighted-average
  costing for a *partial* quantity (with possibly other purchases/consumption since) is a meaningfully
  bigger, riskier problem than the financial correction built here, and only `cancel_invoice()`'s
  100%-only reversal handles that today.
- **Real bug caught and fixed before this was reported done**: `invoice_payment_status` — read by both
  the Phase 27 AR/AP aging report and this phase's own Paid/Partially Paid label — only ever summed
  `payments` and applied `customer_advances`. A partial note leaves the invoice `status='posted'`
  (unlike full cancellation, which flips to `'cancelled'` and drops out of the view's filter
  entirely), so without a fix, a partially-credited invoice would silently show its full original
  balance due in both places. Fixed by folding `sum(credit_notes.grand_total)` into the view the same
  way advances already are.
- `InvoiceDetail.jsx` now lists every note against an invoice (was `.maybeSingle()`, assuming at most
  one) and gained a "New Credit/Debit Note" form (`CreditDebitNoteForm.jsx`): per-line checkbox +
  quantity, remaining-quantity shown per line (client-side guidance only — the RPC re-validates
  authoritatively). `InvoiceList.jsx` shows a Paid/Partially Paid/Unpaid label next to the real
  posted/cancelled status — no fabricated "Overdue" state, since there's no due-date field to base
  one on (same honesty call as Phase 27's aging buckets).
- **Explicitly deferred**: a flat price-only adjustment with no quantity change (UPDATE.md §18 also
  asks for this) — out of scope for what was actually requested here (partial *line-item* notes); a
  separate `sales_orders` stage ahead of invoicing, since `quotes` (Phase 21) already fills that role.
- Tested live end-to-end with throwaway data: posted a sales invoice (10 units, 18% same-state),
  issued a partial credit note for 3 units and confirmed its subtotal/CGST/SGST/grand_total were
  exactly 3/10 of the original line's amounts, confirmed the journal entries balance and hit the
  right accounts, confirmed `invoice_payment_status.balance_due` and `ar_ap_aging()` both reflected
  the reduced balance, confirmed over-crediting the remaining 7 units by asking for 8 was rejected
  with a clear message, and posted a purchase invoice against a raw-material item, issued a debit
  note against it, and confirmed the reversal credited `raw_material_inventory` (not the picked
  expense account) for exactly the adjusted proportion, balancing exactly. Full cleanup afterward
  (including `stock_ledger`/`item_batches` rows the raw-material purchase created, and `audit_log`
  rows per the Phase 28 lesson) — `trial_balance()` back to 0 = 0.

### Phase 30 — Cloud Kitchen: Wastage & Delivery Settlement ✅
- **Confirmed with the user before building**: this business genuinely takes Swiggy/Zomato-style
  delivery-platform orders alongside a physical store, each order gets its own sales invoice (same as
  any other sale), and a settlement should link to the specific invoices it covers — so this phase
  was built as real, needed functionality, not speculatively.
- New `wastage` table (item, quantity, reason, branch, date, cost) + `post_wastage()`: reuses
  `consume_item_fefo()` (Phase 10) for the actual stock consumption and cost basis — the same
  mechanism a sale or production entry already uses, never a second stock-reduction implementation.
  Always posts the expense (not "where configured" — silently skipping it would understate a real
  cost, which CLAUDE.md §5's minimalism carve-outs explicitly except).
- Two new system accounts: `wastage_expense`, `platform_commission_expense` (both `expense`), added
  to `seed_system_accounts()` and backfilled for the existing company — 16 system accounts total now.
- New `delivery_platforms` (Swiggy, Zomato — not "in-store," which settles immediately with no
  commission and uses the existing `post_payment()` flow unchanged), `delivery_settlements`, and a
  `delivery_settlement_invoices` join table linking a settlement to the specific order invoices it
  covers. `gross_order_value` is **derived** from the linked invoices' own `grand_total` — never typed
  by hand — the same "never let two independently-entered numbers drift" discipline invoices/credit
  notes already apply to their own headers.
- `post_delivery_settlement(platform_id, date, invoice_ids[], commission, other_fees, bank_account_id)`
  posts `Dr Bank (net) + Dr Platform Commission Expense (commission+fees) = Cr Accounts Receivable
  (gross)` — clearing those invoices' AR in one batch, same `accounts_receivable` system account
  regular invoices already use. Guards against including an invoice that isn't a posted sales invoice,
  has already had a payment/credit note recorded against it, or is already in another settlement.
- **Flagged, not verified**: the commission/other_fees breakdown is a reasonable generic accounting
  model, not checked against a real Swiggy/Zomato payout statement — worth confirming the categories
  match once a real settlement statement is on hand (may itemize customer/platform discounts
  separately rather than folding everything into "commission").
- **Explicitly deferred**: a unified multi-source order engine (POS/website/CSV adapters) from
  `UPDATE.md` §12 — orders still get invoiced through the existing `post_invoice()` regardless of
  channel; only the platform-specific payout economics needed new tracking, not a new order pipeline.
- Tested live end-to-end with throwaway data: purchased 20kg of a raw material, wasted 5kg, confirmed
  the cost (5 × the item's own average cost) matched exactly, confirmed the journal balanced and
  correctly reduced `raw_material_inventory`, confirmed remaining stock was exactly 15kg, and
  confirmed wasting more than what's in stock was rejected with a clear message. Posted two sales
  invoices (₹590, ₹354), settled both together with ₹100 commission + ₹20 fees, confirmed the derived
  gross (₹944) and net (₹824) were exactly right and the journal balanced; confirmed re-settling an
  already-settled invoice was rejected, and confirmed settling an invoice that already had a payment
  recorded against it was also rejected. Full cleanup afterward (including `stock_ledger`/
  `item_batches` residue and `audit_log` rows per the Phase 28/29 lessons) — `trial_balance()` back to
  0 = 0, `chart_of_accounts` back to exactly 16 rows.

### Phase 31 — Consulting Module (major new module, genuinely additive) ✅
- New `projects` (client = existing `parties.id`, project code, PM = `employees.id`, start/end
  date, budget, status, billing method, reference billing rate, cost centre), `project_tasks`,
  `timesheets` (employee, date, project, task, hours, billable, billing rate, cost rate, approval
  status, `invoice_id` once billed), and `project_expenses` tables. A consulting client is just a
  party with `type = 'customer'`/`'both'` — no separate `clients` master, reusing Phase 22's party
  model rather than duplicating it. `project_expenses` is deliberately reporting-only (profitability
  cost tracking), not a ledger posting — a real vendor payment for the project still goes through
  Purchase Invoices as usual, same reasoning already applied to wastage/delivery-settlement design
  choices in Phase 30.
- `post_project_invoice(project_id, date, item_id, revenue_account_id, timesheet_ids[])` reuses
  `post_invoice()` directly (same pattern `convert_quote_to_invoice()` already established): groups
  the selected approved/billable/not-yet-invoiced timesheets by `billing_rate` into one line item per
  rate, calls `post_invoice()` for the actual GST/ledger posting, and marks those timesheets invoiced
  in the same transaction — a failure rolls back both together. No parallel billing/tax path.
- `project_profitability()`: revenue is the *distinct* invoiced project invoices' own `subtotal`
  (pre-tax — GST collected isn't revenue), never joined row-by-row through `invoice_line_items` (which
  would overcount whenever an invoice has more than one rate-grouped line). Labour cost counts *all*
  timesheets, billable or not, at their own `cost_rate` — an unbilled internal hour still costs the
  business.
- **Explicitly deferred**: indirect/overhead cost allocation across projects (`UPDATE.md` §21 lists
  it as optional — "if configured"). Direct cost (labour + expenses) is enough to start; allocation
  rules are a judgment call worth a CA's input before building, per CLAUDE.md §8. Also deferred: fixed-
  fee/milestone invoicing through this module — `billing_method: 'fixed'` is trackable as metadata,
  but the only invoicing mechanism actually built is hourly-from-timesheets; a fixed-fee project still
  invoices normally through Sales Invoices.
- Tested live end-to-end with throwaway data: logged 4 timesheet entries on one project (5h/₹1000
  approved, 3h/₹1000 pending, 2h/₹1500 approved, 4h non-billable) plus a ₹2,000 project expense.
  Confirmed invoicing a pending timesheet was rejected, invoicing the non-billable one was rejected,
  then invoiced the two approved+billable entries together and confirmed the result was exactly 2 line
  items (one per rate) with subtotal ₹8,000 and grand total ₹9,440 (18% same-state). Confirmed
  re-invoicing an already-invoiced timesheet was rejected. Confirmed `project_profitability()` returned
  revenue ₹8,000, labour cost ₹6,000 (computed across *all four* timesheets including the non-billable
  one), expense cost ₹2,000, and therefore profit exactly ₹0 — matching hand-calculated expectations
  precisely. Full cleanup afterward, including fixing an FK-ordering mistake in the cleanup script
  itself (tried deleting the invoice before the timesheets referencing it) — `trial_balance()` back to
  0 = 0, `chart_of_accounts`/`parties` back to their pre-test counts.

### Phase 32 — Tax & CA: TDS Tracking + Expanded CA Package ✅
- New `tds_rates` (section, rate, effective_from/to — same effective-dated-table pattern as
  `tax_rates`, global not company-scoped, admin-only write) + `resolve_tds_rate()`, mirroring
  `resolve_tax_rate()` exactly — never a hardcoded percentage. New `TdsRates.jsx` admin screen
  (Setup nav), mirroring `TaxRates.jsx`.
- New system liability account `tds_payable`. `post_payment()` gains one new optional param,
  `p_tds_section` (purchase-invoice payments only): resolves the rate, computes the TDS amount on
  the full payment amount, and posts `Dr Accounts Payable (full) = Cr Bank (net) + Cr TDS Payable
  (deducted)` — the same "gross clears the payable, net hits the bank, the gap goes to a
  liability/expense account" pattern Phase 30's delivery settlements already used. Records a
  `tds_transactions` row (payee, section, base, rate, amount, nullable `deposited_on` for tracking
  whether it's actually been paid to the government). `PaymentsSection.jsx` gets an optional TDS-
  section field, shown only for purchase-invoice payments.
- **Flagged, not decided, per CLAUDE.md §8**: TDS is computed on the *full payment amount* as a
  simplification — some sections require excluding the GST component from the base, which needs a
  CA's confirmation. Also out of scope: TDS *receivable* (a customer deducting TDS from what they
  pay us) — only the payable side (what we deduct paying vendors) is built.
- **Real gotcha caught before handoff**: adding a 7th parameter to `post_payment()` meant
  `create or replace function` alone would NOT replace the existing 6-arg version — Postgres treats
  a different declared arity as a new overload, which would have left both versions live and made
  every future call ambiguous. Fixed by explicitly `drop function if exists` on the old 6-arg
  signature before recreating it, and verified live (a 6-arg-shaped call after the fix resolved to
  the one new function cleanly, no ambiguous-candidate error).
- `cancel_payment()` updated: its existing generic per-leg reversal already correctly undoes a TDS
  journal leg (it reverses whatever legs exist in the entry group, regardless of what they are) —
  but it now also deletes the associated `tds_transactions` row, so a TDS summary doesn't keep
  showing a deduction that was reversed.
- New `tds_summary()` report + `TdsSummary.jsx` (Reports nav, CSV/PDF export, FY quick-select —
  matching every report since Phase 19) — this is the Phase-32 piece of "expanded CA package."
  AR/AP aging already got its own export in Phase 27; fixed-asset register is Phase 33, not this one.
- **Explicitly deferred**: the generic `tax_jurisdictions`/`tax_regimes`/`tax_codes` abstraction from
  `UPDATE.md` §26 replacing the direct `tax_rates`/`resolve_tax_rate()`/`calculate_gst_split()`
  model — this business only ever needs Indian GST, so there's no second jurisdiction to justify
  the abstraction; the existing model already satisfies every rule in CLAUDE.md §3.
- **Explicitly deferred**: a Tally XML export layer (`UPDATE.md` §29) — large and genuinely new;
  revisit once this phase's own new exports exist and it's clear what a CA actually needs mapped.
- Tested live end-to-end with throwaway data: posted a ₹11,800 purchase invoice, paid ₹10,000 of it
  with a 194J/10% TDS deduction, and confirmed the `tds_transactions` row (base 10,000, rate 10,
  amount 1,000) and the journal legs exactly — AP debited 10,000, Bank credited 9,000 (net), TDS
  Payable credited 1,000, balancing exactly. Confirmed `tds_summary()` included the deduction.
  Confirmed attempting TDS on a sales-invoice payment was rejected. Cancelled the payment and
  confirmed the `tds_transactions` row was removed and the 3-leg reversal balanced exactly. Full
  cleanup afterward — caught and fixed one residue mistake in the cleanup script itself (forgot to
  delete a test sales invoice's own journal entries, briefly leaving `trial_balance()` at
  ₹1,180 ≠ 0 and blocking a chart-of-accounts deletion) — `trial_balance()` back to 0 = 0,
  `chart_of_accounts` back to 17 rows.

### Phase 33 — Banking Enhancements & Fixed Assets ✅
- New `bank_accounts` table — a metadata sidecar (display name, masked account number, IFSC, bank
  name) linked 1:1 to an existing asset-type `chart_of_accounts` row via a trigger-enforced FK
  (mirrors `validate_bank_transaction_match()`'s existing "RLS can't see across tables" reasoning).
  Doesn't change any posting logic — `post_payment()`/`post_delivery_settlement()` still point
  straight at `chart_of_accounts`; this only gives the UI a friendlier account picker. New
  `BankAccounts.jsx` admin screen.
- `bank_transactions` gains a nullable `bank_account_id` (the existing trigger extended to validate
  it, same pattern as the existing `matched_payment_id` check) — so once more than one account
  exists, statement lines/reconciliation can be scoped per account.
- A generic CSV bank-statement importer (`bankStatementCsvParser.js`) alongside the IDFC-specific PDF
  one (Phase 25), auto-detecting common Date/Description/Amount-or-Debit-Credit column headers from
  any bank's export — same "parse client-side, auto-import clean rows, skip flagged/duplicate rows"
  design already established there. Verified in isolation (mixed date formats, debit/credit columns,
  a row with no amount correctly flagged) before touching the database.
- New `asset_categories`/`fixed_assets`/`asset_transactions`/`depreciation_runs` tables + 4 system
  accounts (`fixed_assets_gross`, `accumulated_depreciation`, `depreciation_expense`,
  `disposal_gain_loss`). `capitalize_fixed_asset()`, `post_depreciation_run()` (straight-line only —
  WDV/reducing-balance flagged as a real, separate need, not built speculatively — one run per
  calendar month, capped so accumulated depreciation never exceeds cost minus salvage value),
  `dispose_fixed_asset()` (a single combined gain/loss account, debited for a loss or credited for a
  gain — rare enough that one P&L line covering both signs is simpler than two accounts), and
  `fixed_asset_register()` (current-state snapshot, feeds `FixedAssets.jsx`'s CSV/PDF export — the
  Phase-33 piece of the expanded CA package). GST input-credit rules for capital goods (e.g. ITC
  reversal on sale) aren't handled — flagged for a CA, same reasoning as Phase 32's TDS base.
- **Explicitly deferred**: the full generalized `bank_reconciliations`/`bank_reconciliation_lines`
  model from `UPDATE.md` §30–31 replacing today's single `matched_payment_id` column — Phase 17's
  auto-suggest matching already covers this business's actual reconciliation need; revisit only if
  multiple bank accounts (above) make the single-match-column model genuinely insufficient.
- Tested live end-to-end with throwaway data: confirmed the bank-account trigger rejects linking to a
  non-asset account; capitalized a ₹12,000 asset (journal balanced); ran two months of straight-line
  depreciation (₹200/month exactly, confirmed rejecting a second run for the same month); manually
  pushed accumulated depreciation to near-total and confirmed a third run correctly capped at the
  exact remaining ₹150 rather than the normal ₹200; disposed that asset for a ₹500 gain and a second
  asset for a ₹700 loss, confirming both journals balanced and the loss/gain each landed on the right
  side of the combined gain/loss account; confirmed re-disposing an already-disposed asset was
  rejected. Full cleanup afterward — `trial_balance()` back to 0 = 0, `chart_of_accounts` back to 21
  rows, first cleanup pass clean (no residue mistakes this time).

### Phase 34 — HR Foundations & Payroll Enhancements ✅
- New `departments`/`designations` tables (simple company-scoped lookup lists); `employees` gains
  nullable `department_id`/`designation_id` — additive columns, existing employee rows unaffected.
  `EmployeeMaster.jsx` gets the two new dropdowns; new `Departments.jsx` manages both lists.
- New `attendance` (one row per employee per day, upserted on re-mark rather than duplicating) and
  `leave` (date-range request with approve/reject) tables — recorded for reporting only, same trust
  level as `timesheets` (Phase 31: plain admin/accountant CRUD, not SECURITY DEFINER-gated, since
  nothing here posts to the ledger). `post_payroll_run()` is completely untouched — it still produces
  the same fixed-gross-plus-manual-deductions payslip it always has; attendance/leave don't yet feed
  automatic salary calculation.
- **Explicitly deferred**: the full configurable salary-component engine and statutory-calculation
  rebuild from `UPDATE.md` §24–25. Today's "fixed gross + manually-entered deductions" already lets
  a human enter the correct PF/ESI/professional-tax amount each month (with a CA's review, per
  CLAUDE.md §8), and building a generalized rules engine before a second, structurally different
  payroll case actually exists would be speculative, against CLAUDE.md §5. Revisit if statutory
  rates change often enough that manual entry becomes the real pain point.
- Tested live end-to-end with throwaway data: confirmed an employee correctly linked to a department
  and designation; confirmed marking attendance twice for the same employee/date updates the one row
  rather than creating a duplicate; confirmed a leave request defaults to pending and can be approved;
  confirmed a leave request with an end date before its start date is rejected by the check
  constraint. No ledger involved in this phase, so no `trial_balance()` self-check was needed — full
  cleanup of all test rows and the throwaway user afterward.

### Phase 35 — R&D Generalization ✅
- `rnd_trials` (Phase 10) already covers food-product recipe trials. Added an `rnd_project_type`
  (food/consulting/process/internal) column and optional `budget`/`external_services_cost` fields to
  the existing table, rather than introducing a parallel `rnd_projects`/`rnd_experiments`/
  `rnd_materials`/`rnd_labor` table set — the existing trial+consumption model already captures
  materials cost per trial; this phase only widens what a trial can represent. `post_rnd_trial()`'s
  journal posting is unchanged — still only the raw-material consumption cost.
- **Same arity gotcha as Phase 32**: adding the 3 new optional params changed `post_rnd_trial()`'s
  declared signature, so `create or replace` alone would have left the old 5-arg version behind as an
  ambiguous second overload. Fixed with `drop function if exists public.post_rnd_trial(date, text,
  uuid, text, jsonb);` before the recreate — same fix pattern as `post_payment()` in Phase 32.
- `RndTrial.jsx` got a "Project type" dropdown and "Budget"/"External services cost" numeric fields.
- **Explicitly deferred**: dedicated R&D document/results attachment storage — folds into Phase 36's
  generic attachments instead of a separate R&D-only table.
- Tested live end-to-end with throwaway data: purchased raw-material stock, then posted an R&D trial
  with all 3 new fields populated — confirmed they're stored correctly (`rnd_project_type='food'`,
  `budget=5000`, `external_services_cost=250`) and the journal entries still balance exactly as
  before (₹60 = 3kg × ₹20, unchanged posting logic). Confirmed an invalid `rnd_project_type` value is
  rejected by the check. Confirmed the OLD 5-argument call shape (no new params) still resolves
  cleanly to the single new function with no ambiguous-overload error, and stores the 3 new fields as
  null. Full cleanup of all test rows and the throwaway user afterward; `trial_balance()` confirmed
  0=0.

### Phase 36 — Generic Document Attachments & Expanded Audit Log ✅
- New `attachments` table (entity_type, entity_id, file_name, file_path, mime_type, file_size,
  uploaded_by, company_id) backed by a private Supabase Storage bucket — the first use of Storage in
  this project (Phase 16 deliberately avoided it for a cosmetic logo field; this is the actual
  documented use case). `entity_type` is free text, no check-constrained enum, since this list will
  keep growing — same reasoning as `journal_entries.reference_type` having none.
- Objects are stored at `{company_id}/{entity_type}/{entity_id}/{uuid}-{filename}`. RLS on
  `storage.objects` (via `storage.foldername(name)`) scopes read/write to the caller's own company,
  and `createSignedUrl()` only succeeds if that RLS check passes — so "permission-checked signed
  download" is enforced structurally, with no serverless function needed.
- One generic `AttachmentsSection.jsx` component (upload/list/view/delete, admin+accountant write,
  everyone read) wired into `InvoiceDetail.jsx`, `ProjectDetail.jsx`, and a per-row expandable toggle
  in `FixedAssets.jsx` and `BankTransactions.jsx`.
- **Explicitly out of scope this phase**: R&D trial attachments — there's no browsing/detail page
  for past trials today (`RndTrial.jsx` is log-only), and building one just to hang a generic
  attachments panel off it would be scope creep beyond what this phase is actually about.
- `audit_log` (Phase 14) already covers master-data edits. Extended the audited event set:
  `accounting_periods` close/reopen now flows through the existing generic `log_audit_change()`
  trigger (free — no new plumbing). Login/logout needed a different mechanism since Supabase Auth
  keeps no logout record at all — a new `log_auth_event(p_event)` RPC that `AuthContext.jsx` calls
  explicitly right before/after the real sign-in/sign-out call (widened `audit_log.action`'s check
  constraint to add `'login'`/`'logout'`).
- Tested live end-to-end with throwaway data across three roles/two companies: uploaded a file to a
  test project, confirmed the metadata row and signed-URL generation work for an authorized same-
  company admin; confirmed a second company's admin gets 0 rows back from the metadata query AND a
  rejected signed-URL request AND a rejected upload into the same folder (storage-level isolation,
  not just table RLS); confirmed a same-company viewer can read the list but is rejected on both
  upload and delete; confirmed `log_auth_event('login')` writes a correctly-shaped `audit_log` row
  and an invalid event name is rejected; confirmed closing a test accounting period produces both an
  `insert` and an `update` audit row with the right before/after `status` values. Full cleanup of all
  test rows, storage objects, companies, and throwaway users afterward; `trial_balance()` confirmed
  0=0.

### Phase 37 — Management Dashboard Expansion ✅
- Extended the existing dashboard with the Kitchen/Consulting/People/Compliance tiles from
  `UPDATE.md` §41 that have real underlying data by this point (food cost %, wastage %, project
  margin, unbilled hours, GST/TDS/payroll review status) — a read-only aggregation layer over
  reports already built in the phases above, no new posting logic. Deliberately last, per
  `UPDATE.md` §51's own priority order: "do not prioritize visual redesign above accounting
  correctness."
- One new function, `project_portfolio_summary()`: aggregates `project_profitability()` (Phase 31)
  across every active project rather than changing that function's own signature for its existing
  single-project caller (`ProjectDetail.jsx`). Margin is reported all-time, not month-scoped, since
  `project_profitability()` has no date range to begin with — the tile is labeled accordingly.
  Everything else (food cost %, wastage %, employee/attendance/payroll counts, GST, TDS) is computed
  client-side from data that already existed.
- **Deliberately not computed**: a single net GST-payable figure. The GST tile shows raw output-tax
  and input-credit totals side by side, never subtracted — matching `GstSummary.jsx`'s own existing,
  explicit restraint ("this deliberately stops short of a final net tax payable figure... have your
  CA apply that set-off... before filing"). Netting requires a set-off order (IGST credit against
  IGST liability first, etc.) that's a filing rule, not a fixed formula, so this stays a CA judgment
  call rather than something the dashboard silently decides.
- The existing "Low-stock items" and "Batches nearest expiry" lists moved under the new Kitchen
  heading (they were already Kitchen-category data per `UPDATE.md` §41, just not labeled that way);
  the original 3-card summary row and "Subscription cycles awaiting review" tile are unchanged.
- Tested live end-to-end with a full realistic chain of throwaway data, verified as before/after
  deltas (since the dashboard aggregates across the whole company, not just test rows): purchased
  raw material → produced finished goods → sold some → wasted some, and confirmed food cost % =
  40.0% and wastage % of COGS = 33.3% matched hand-calculated expectations exactly; created a
  project with one billed and one unbilled timesheet, confirmed `project_portfolio_summary()`'s
  active-project-count/revenue/cost/unbilled-hours deltas matched exactly (+1, +1000, +800, +3);
  confirmed employee/payroll/attendance counts updated correctly after a payroll run; confirmed the
  GST tile's separate output/input deltas matched the sales and purchase invoices' actual tax
  amounts; confirmed a TDS-deducted payment showed up correctly as "pending deposit." Full cleanup
  afterward — including re-learning the Phase 31 FK-ordering lesson firsthand (deleting a
  project-linked sales invoice before its `timesheets` rows still fails on
  `timesheets_invoice_id_fkey`; fixed by deleting/clearing the timesheets first) — `trial_balance()`
  confirmed 0=0.

This completes the `UPDATE.md` architecture-review mapping (Phases 26–37). Only the items below
remain, and only if the business's shape changes.

## 5e. Enterprise Role-Based Access Control (RBAC) — Phases 38+

**Context**: the user supplied a detailed 19-section RBAC design (13 named roles — CEO, CFO, COO,
CMO, CTO, Accountant, CA/Auditor, HR/Payroll, Kitchen Manager, Inventory Manager, Project Manager,
Employee, Viewer — each with actions, module scope, data scope, and a module-specific approval
hierarchy). Confirmed with the user: these are real people needed now (not aspirational), one
person can hold multiple roles at once, and all three pieces below are wanted. Given the size —
this is a bigger undertaking than the entire `UPDATE.md` mapping above — it's being built as its
own phased initiative rather than one change, exactly like that mapping was.

- **Phase 38 — Multi-Role Foundation & Permissions Matrix.** The data model + a management UI.
  Deliberately additive: layered on top of the existing `users.role`/`can_manage_users` gate, not a
  replacement — every existing RLS policy and posting function is completely unaffected.
- **Phase 39 — Data Scope Hierarchy** (Branch/Department/Project/Own Records), real enforcement
  beyond today's company-wide RLS. Likely splits further by module once underway.
- **Phase 40 onward — Approval Workflows.** The largest piece: draft/submitted/approved/rejected
  states and routing chains retrofitted into existing posting functions, one module at a time
  (finance, operations, payroll, marketing, consulting) — each is realistically its own phase.

### Phase 38 — Multi-Role Foundation & Permissions Matrix ✅
- New `app_role_type` enum (the 13 named roles) and `user_app_roles` (many-to-many — one person,
  multiple roles) — additive, `users.role`/`can_manage_users` untouched.
- New `role_permissions` (`app_role`, `permission_key`) — global reference data (not company-scoped;
  what a role *can* do is structural to the software, same reasoning as `tax_rates`/`tds_rates`).
  `permission_key` is free text (`module.action`, e.g. `banking.edit`), not a check-constrained enum,
  since this list will keep growing as more modules get wired in — same reasoning as
  `journal_entries.reference_type`/`attachments.entity_type` having none.
- Seeded a **starting** permission set per role (~65 rows total) based directly on the supplied
  spec's own responsibility tables — explicitly not an exhaustive encoding of all 19 sections, meant
  to be refined via the new UI as real usage clarifies exact rules. `viewer` intentionally starts
  with zero grants ("whatever the CTO assigns," per its own definition).
  `current_user_has_permission(p_permission_key)` is the check future phases will call as they
  retrofit real enforcement — **nothing in the existing app consults it yet**, this phase is the
  foundation only.
  `current_user_can_manage_users()` — factored out of the repeated admin+`can_manage_users` check
  (already used by `ManageUsers.jsx`) since Phase 38's new RLS policies needed it several times.
  `assign_user_role()`/`revoke_user_role()` — SECURITY DEFINER, same gate, company-scoped, idempotent
  on re-assign.
- New "Roles & Permissions" admin page (`ManageUsers`-style gate: admin + `can_manage_users`, since a
  real assigned CTO doesn't exist as a bootstrapping concept yet): a role-assignment grid (rows =
  users, columns = the 13 roles, checkboxes) and a permission-matrix editor (pick a role, see/add/
  remove its `permission_key` grants).
- Tested live end-to-end with throwaway users: confirmed assigning two different roles to the same
  person works (multi-role support); confirmed re-assigning an already-held role is a harmless no-op;
  confirmed `current_user_has_permission()` correctly reflects a held role's grants and correctly
  denies an ungranted one; confirmed a plain viewer is rejected from assigning roles to others and
  from writing `role_permissions`, while still able to read it; confirmed a cross-company target is
  rejected; confirmed revoke actually removes the role. Full cleanup afterward; the original 65-row
  seed confirmed still intact; `trial_balance()` confirmed 0=0.

### Phase 39 — Data Scope Hierarchy (Own Records & Assigned Projects) ✅
- Scoped to what's real and testable today, narrower than the full Branch/Department/Project/Own
  Records hierarchy in the original spec:
  - **PROJECT** scope (Project Manager → "assigned projects"): buildable immediately —
    `projects.project_manager_employee_id` already existed.
  - **OWN_RECORDS** scope (Employee → "my attendance/leave/timesheet/payslip") needed a real missing
    prerequisite first: nothing linked a login account (`users`) to an HR record (`employees`) at
    all. Added `employees.user_id` (nullable both ways — not every employee has a login, not every
    login is an employee) and `current_user_linked_employee_id()`.
  - **BRANCH/WAREHOUSE** scope (Kitchen Manager, Inventory Manager) deliberately **not built** — only
    one branch is in real use today (same reason Phase 20 already deferred the branch-switcher UI),
    so there's no second value to meaningfully scope by yet. Revisit when a second branch actually
    opens.
  - **DEPARTMENT** scope dropped entirely — re-reading the spec, no role's concrete Data Scope box
    actually uses it; it only appears in the abstract scope-hierarchy diagram. Building unused
    plumbing for a dimension nothing needs would be pure speculation.
- Real RLS narrowing (not just a permission check) on `employees`, `attendance`, `leave`,
  `payroll_runs`, `projects`, `timesheets` — opt-in and additive: only narrows a caller whose
  *existing* `users.role` is `'viewer'` (never admin/accountant, regardless of what app_roles they
  also hold) AND who has been explicitly assigned the relevant new app_role. Since nobody held any
  app_role before this phase, existing real accounts see exactly what they saw before — the
  restriction only activates once an admin deliberately opts someone in via Roles & Permissions.
- `employees` itself needed narrowing too, not just the transactional tables — it carries
  `monthly_gross_salary`, arguably the single most sensitive field in the schema, so a scoped
  Employee shouldn't see everyone else's row there any more than everyone else's payslip.
- Narrowing `projects_select` for Project Manager automatically narrows `project_tasks_select` too
  (it checks project visibility via a subquery against `projects`, itself subject to `projects`' own
  RLS) — no separate change needed there. `timesheets_select` narrows two ways at once (own entries
  for Employee, project-scoped entries for Project Manager) since someone could hold both roles.
- New "Linked user account" field on `EmployeeMaster.jsx` to set `employees.user_id` — the only new
  UI this phase needed. Everywhere else, scoping "just works" transparently on the *existing*
  attendance/leave/projects/timesheets/payroll pages via RLS — no new self-service pages had to be
  built, since none of those routes were ever admin-gated in the nav to begin with.
- Tested live end-to-end with throwaway data: confirmed a viewer holding 'employee' sees only their
  own `employees`/`attendance`/`leave`/`payroll_runs` rows, not another test employee's or any real
  one; confirmed a plain viewer with **no** app_role assigned still sees everything company-wide,
  proving zero regression for existing real accounts; confirmed admin sees everything unchanged;
  confirmed a viewer holding 'project_manager' sees only their assigned project and only timesheets
  on that project, not a colleague's project or timesheet entry. Full cleanup afterward;
  `trial_balance()` confirmed 0=0.

### Phase 40 — Approval Workflows (proof of concept: fixed asset capitalization) ✅
- Generic, reusable mechanism, not a one-off: `approval_rules` (company-scoped, admin-editable
  thresholds — `min_amount` tiers each resolving to an ordered `approval_chain` of app_roles, e.g.
  `["coo","cfo"]` — never hardcoded, same discipline CLAUDE.md already requires for tax rates) and
  `approval_requests` (the actual pending/approved/rejected record, one row per submission whether
  or not it actually needed approval, so every capitalization has one consistent audit trail
  regardless of amount).
- Below the lowest configured tier, nothing changes from today's behavior: `submit_fixed_asset_
  capitalization()` creates the request AND immediately resolves it in the same call.
  `capitalize_fixed_asset()` itself is untouched either way — it's still the function a direct
  admin/accountant call reaches.
  `approve_request()`/`reject_request()` walk the chain one step at a time, checking the caller
  holds the required app_role for the *current* step via `user_app_roles`; final approval actually
  posts.
- Seeded two starting tiers (₹0 → no approval, ₹50,000 → COO then CFO) as placeholder numbers,
  explicitly meant to be edited immediately via the new UI — the real thresholds are a business
  decision for the user to set, not one for this codebase to invent. New "Approval Rules" editor
  added to the Roles & Permissions page (add/remove tiers, pick the ordered role chain via
  checkboxes) — and a new "Approvals" page (list pending/resolved requests, Approve/Reject only
  enabled for a step the signed-in user actually holds the role for).
- **Real bug caught by testing, not by inspection**: `approve_request()`'s final-approval branch
  originally called the public `capitalize_fixed_asset()` directly — but that function independently
  re-checks `current_user_role() in ('admin','accountant')` against **whoever is calling it**, which
  at that point is the *final approver* (e.g. a CFO), not the original requester. A CFO whose old
  `users.role` is just `'viewer'` (real and expected — CFO is a *new* app_role, layered on top of the
  old role system, not a replacement for it) got wrongly rejected with "Not authorized to capitalize
  fixed assets" one step before actually posting. Fixed by extracting the real posting logic into a
  new internal `_capitalize_fixed_asset_core()` with no role check at all — `capitalize_fixed_asset()`
  keeps its own check and calls the core for a direct call; `submit_...()` and `approve_request()`
  call the core directly, since each has already independently verified authority (admin/accountant
  for a direct submission below threshold, the approval chain itself for a final approval) before
  ever reaching it. Worth remembering for any future approval-gated module: the function that
  actually posts must not re-derive authorization from the *caller's* role once an approval chain is
  what actually granted it.
- Tested live end-to-end: confirmed a below-threshold submission posts immediately, an
  above-threshold one creates a pending request with no asset yet; confirmed a wrong-role user
  (holding `cmo`) is rejected from approving a `coo`-required step; confirmed the `coo` approves step
  1 and cannot also approve step 2 (now requires `cfo`); confirmed the `cfo`'s final approval — after
  the bug above was fixed — actually creates the `fixed_assets` row with correctly balanced journal
  entries, and that the same request can't be approved twice; confirmed a rejection leaves no asset
  created; confirmed an admin can add/remove `approval_rules` tiers directly while a non-manager is
  rejected from writing them (and can still read them). Full cleanup afterward; the original 2-tier
  seed confirmed still intact; `trial_balance()` confirmed 0=0.

### Phase 41 — Approval Workflows, second module: Payroll Runs ✅
- Same generic `approval_rules`/`approval_requests` mechanism from Phase 40, extended to a second
  module (`entity_type='payroll_run'`) rather than building a parallel system — matches the spec's
  own HR/Payroll → CFO chain. `post_payroll_run()` itself is untouched for a direct call, exactly the
  same split as `capitalize_fixed_asset()`: real posting logic extracted into a new
  `_post_payroll_run_core()` with no role check, `post_payroll_run()` keeps its own admin/accountant
  check and calls the core; `submit_payroll_run()` (the new entry point `RunPayroll.jsx` now calls)
  and `approve_request()`'s new `payroll_run` branch call the core directly, since each already
  independently verified authority before reaching it — applying the Phase 40 bug-fix pattern
  *before* writing the code this time, not after. Seeded two placeholder tiers (₹0 → no approval,
  ₹100,000 → CFO), same "edit immediately via the UI" framing as Phase 40's seed.
  `RolesPermissions.jsx`'s Approval Rules editor and `Approvals.jsx`'s entity labels were generalized
  from a single hardcoded module to a small module list, ready for a third.
- Tested live end-to-end, explicitly re-running the exact bug scenario Phase 40 caught: confirmed a
  below-threshold (₹30,000) run posts immediately; confirmed an above-threshold (₹150,000) run
  creates a pending request with no `payroll_runs` row yet; confirmed a wrong-role holder (`coo`) is
  rejected from a `cfo`-required step; confirmed the CFO test user — deliberately given old
  `users.role='viewer'`, mirroring a real CFO who isn't also an "admin"/"accountant" in the old
  system — approves the final step successfully this time, with the resulting `payroll_runs` row and
  its journal entries balancing exactly (₹150,000 = ₹150,000); confirmed a rejected request leaves no
  `payroll_runs` row. Full cleanup afterward; both modules' seed rows confirmed still intact;
  `trial_balance()` confirmed 0=0.

### Phase 42 — Approval Workflows, fourth module: Purchase Invoices ✅
- Same generic mechanism, extended to `post_invoice()` — by far the largest, most complex function
  gated so far (GST splitting, weighted-average raw-material costing, batch creation, atomic
  invoice-number sequencing). **Deliberately purchase-only, never sales**, both to match the spec's
  own worked example (a major purchase) and to keep the blast radius contained: `post_invoice()` has
  three internal callers (`finalize_subscription_cycle()`, `convert_quote_to_invoice()`,
  `post_project_invoice()`) — confirmed by reading each one that all three always pass
  `p_type='sales'`, never `'purchase'`, so none of them are touched by this at all. Sales invoicing
  (via `InvoiceForm.jsx` with `type="sales"`) keeps calling `post_invoice()` directly, unchanged.
- Same split as Phases 40-41: real posting logic extracted into `_post_invoice_core()` (no role
  check), `post_invoice()` keeps its own admin/accountant check and calls the core — unchanged for
  every existing caller either way. `submit_purchase_invoice()` (the new entry point
  `InvoiceForm.jsx` calls when `type="purchase"`) and `approve_request()`'s new `purchase_invoice`
  branch call the core directly.
- One real design decision worth recording: `approval_rules.min_amount` for `purchase_invoice` is
  checked against the **pre-tax subtotal** (sum of quantity×rate across lines), not the GST-inclusive
  grand total — the same figure `post_invoice()` itself computes before applying GST, cheaply
  recomputed in `submit_purchase_invoice()` just to resolve the applicable tier. Flagged explicitly
  in the code as a deliberate choice, not an oversight.
  `InvoiceForm.jsx` (shared between Sales and Purchase invoices via a `type` prop) branches only for
  `type === 'purchase'`; a pending result shows the same inline "submitted for approval" message
  pattern as Phases 40-41 rather than navigating to a non-existent invoice detail page.
  Seeded three tiers this time (₹0 → none, ₹50,000 → COO+CFO, ₹500,000 → COO+CFO+CEO), matching the
  spec's own worked example more closely than the two-tier seeds in Phases 40-41.
- Tested live end-to-end, including a full regression check on the untouched sales path: confirmed a
  sales invoice posted directly via `post_invoice()` still computes GST correctly (₹1,000 line →
  ₹1,180 with 9%+9% CGST/SGST) — proving the core-extraction refactor changed nothing for existing
  callers; confirmed a below-threshold purchase (₹200) posts immediately with correct GST split,
  weighted-average cost update, and a new `item_batches` row; confirmed an above-threshold purchase
  (₹100,000) creates a pending request with **no** invoice, stock, or average-cost effect yet;
  confirmed a wrong-role holder is rejected; confirmed the CFO test user — again deliberately given
  old `users.role='viewer'`, the same scenario Phase 40 first caught as a bug — approves the final
  step successfully, with the resulting invoice's GST split, weighted-average cost recalculation
  (hand-verified: (10×20 + 1000×100) / 1010 = ₹99.21), and journal balance (₹105,000 = ₹105,000) all
  exactly correct; confirmed a genuinely major purchase (₹600,000) resolves the 3-tier
  COO→CFO→CEO chain, and that a rejection after partial approval leaves no invoice created. Full
  cleanup afterward; all 7 approval_rules seed rows (across all three gated modules) confirmed
  intact; `trial_balance()` confirmed 0=0.

### Phase 43 — Approval Workflows, fourth module: Wastage ✅
- Matches the spec's own Kitchen Manager worked example directly ("Wastage — Staff → record, Kitchen
  Manager → approve, COO → approve if above threshold"). Same split as Phases 40-42:
  `_post_wastage_core()` (no role check) extracted from `post_wastage()`, which keeps its own
  admin/accountant check and calls the core — unchanged for its existing direct caller either way.
  `submit_wastage()` (the new entry point `Wastage.jsx` now calls) and `approve_request()`'s new
  `wastage` branch call the core directly.
- **Real, deliberate deviation from the first three modules' threshold basis**: `approval_rules.
  min_amount` here is checked against **quantity**, not cost. Wastage's cost is computed by
  `consume_item_fefo()` *during* posting — it depends on which specific batches actually get
  consumed — so unlike fixed-asset cost/payroll gross salary/purchase subtotal (all known inputs
  before posting), there's no cheap way to preview wastage's cost before deciding whether a
  submission needs approval at all. Quantity is the one figure knowable upfront. Flagged explicitly
  in code comments and here, not a silent inconsistency — the Roles & Permissions UI's module
  dropdown label says so too ("threshold is quantity, not cost").
  Seeded two tiers: quantity 0 → no approval (matches today's behavior exactly), quantity ≥ 50 →
  Kitchen Manager then COO.
- Tested live end-to-end: confirmed a direct `post_wastage()` call (the pre-existing entry point)
  still works unchanged; confirmed a below-threshold (5kg) submission posts immediately with the
  correct FEFO-computed cost (₹50 at ₹10/kg); confirmed an above-threshold (60kg) submission creates
  a pending request with no `wastage` row yet; confirmed a wrong-role holder is rejected; confirmed
  Kitchen Manager approves step 1; confirmed the COO test user — again deliberately given old
  `users.role='viewer'`, the same scenario Phase 40 first caught — approves the final step
  successfully, with the resulting wastage cost (₹600 at ₹10/kg × 60kg) and journal balance
  (₹600 = ₹600) both exactly correct; confirmed a rejected request leaves no wastage row created.
  Full cleanup afterward; all 9 approval_rules seed rows (across all four gated modules) confirmed
  intact; `trial_balance()` confirmed 0=0.

### Phase 44 — Approval Workflows, fifth module: Project Invoicing ✅
- Matches the spec's Consulting chain (Employee → Project Manager → COO → CFO/Accountant → Invoice).
  The first two steps — logging a timesheet and a Project Manager approving it — already existed as
  a separate, pre-existing feature (`timesheets.approval_status`); `post_project_invoice()` already
  refused to invoice an unapproved timesheet before this phase. This phase gates the one remaining
  step: the actual invoicing action itself, above a configurable amount. Same split as Phases 40-43:
  `_post_project_invoice_core()` (no role check) extracted from `post_project_invoice()`, which keeps
  its own admin/accountant check and calls the core — unchanged for its existing direct caller either
  way. `submit_project_invoice()` (the new entry point `ProjectDetail.jsx` now calls) and
  `approve_request()`'s new `project_invoice` branch call the core directly.
- **A nested variant of the Phase 40 bug class, caught by reading the code before writing any test**:
  `post_project_invoice()` internally invokes `post_invoice()` to actually post the sales invoice, not
  just a database write of its own. Had `_post_project_invoice_core()` called the public
  `post_invoice()`, the same final-approver-role bug from Phase 40 would have resurfaced one level
  deeper. Fixed by calling `_post_invoice_core()` (Phase 42's core) directly instead.
- Threshold basis: the pre-tax subtotal of the selected timesheets (sum of hours × billing_rate) — a
  known input before posting, same reasoning as Phase 42's purchase-invoice subtotal. Seeded two
  tiers: subtotal ₹0 → no approval (matches today's behavior exactly), subtotal ≥ ₹50,000 → COO then
  CFO.
- Tested live end-to-end: confirmed a direct `post_project_invoice()` call (the pre-existing entry
  point) still works unchanged (₹2,500 subtotal posted immediately); confirmed a below-threshold
  (₹10,000) submission posts immediately via `submit_project_invoice()` and links the timesheet's
  `invoice_id`; confirmed an above-threshold (₹60,000) submission creates a pending request with the
  timesheet left un-invoiced; confirmed a wrong-role holder (an `employee` app-role, not `coo`) is
  rejected with no change to the request; confirmed COO approves step 1; confirmed the CFO test user —
  again deliberately given old `users.role='viewer'`, the same scenario Phase 40 first caught —
  approves the final step successfully, with the resulting invoice's GST split (same-state, 18% →
  ₹5,400 CGST + ₹5,400 SGST, grand total ₹70,800) and journal balance (₹70,800 = ₹70,800) both exactly
  correct, and the timesheet's `invoice_id` correctly linked; confirmed a rejected request (₹55,000)
  leaves its timesheet un-invoiced. Full cleanup afterward; all 11 approval_rules seed rows per
  company (across all five gated modules) confirmed intact for both companies; `trial_balance()`
  confirmed 0=0.

### Phase 45 — Approval Workflows, sixth module: Expense Claims ✅
- Unlike Phases 40-44, there was no pre-existing posting function to gate — employee expense
  reimbursement had never been a ledger-posted transaction in this app. Built a brand-new
  `expense_claims` table + `_post_expense_claim_core()`/`post_expense_claim()` in the same
  core+wrapper shape as every other module (for consistency, and to give admin/accountant a
  direct-post entry point without going through approval, same as every other gated module has).
  `submit_expense_claim()` (the new entry point `ExpenseClaims.jsx` calls) and `approve_request()`'s
  new `expense_claim` branch call the core directly.
- **Deliberately kept separate from `project_expenses`** (Phase 31, the Consulting module), which
  stays exactly as-is: a plain, unposted, project-scoped cost record used only for profitability
  reporting. An employee's reimbursement isn't necessarily tied to any project, so conflating the two
  would force picking a project for a claim that may not have one.
- Posting model: pay immediately, same simplicity as `post_payroll_run()` — debit the chosen expense
  account, credit the chosen bank/cash account, one `entry_group_id`. No new "payable" system account
  — `accounts_payable` already means vendor payables tied to a `party`, and an employee isn't a party
  in this schema, so reusing it would have been a hack; a genuine pay-later flow is a real schema
  change to propose if it's ever actually needed, not something to force in now.
- Threshold basis: the claim amount itself — a known input before posting, same reasoning as
  fixed-asset cost/payroll gross salary. Seeded two tiers: ₹0 → no approval, ₹5,000 → single-step CFO
  approval — a reasonable starting default, not a compliance-blessed number, editable via the Roles &
  Permissions UI immediately.
- **Flagged, not decided (CLAUDE.md §8)**: whether an employee expense claim carries any GST
  input-credit treatment is a real compliance question this module doesn't address — it's built as a
  plain reimbursement expense with no tax split at all. A CA should confirm whether that's correct
  before this is used for real claims that might carry GST.
- Tested live end-to-end: confirmed a direct `post_expense_claim()` call posts correctly (₹800);
  confirmed a below-threshold (₹2,000) submission posts immediately via `submit_expense_claim()` with
  a balanced journal entry; confirmed an above-threshold (₹7,500) submission creates a pending request
  with **no** `expense_claims` row yet; confirmed a wrong-role holder (an `employee` app-role, not
  `cfo`) is rejected with no change to the request; confirmed the CFO test user — again deliberately
  given old `users.role='viewer'`, the same scenario Phase 40 first caught — approves successfully,
  with the resulting claim's journal entry hand-verified (expense account debited ₹7,500, bank account
  credited ₹7,500, balanced); confirmed a rejected request (₹6,000) leaves no `expense_claims` row at
  all; confirmed passing an asset account as the expense account is rejected by the core's own
  account-type validation. Full cleanup afterward; all 13 approval_rules seed rows per company (across
  all six gated modules) confirmed intact for both companies; `trial_balance()` confirmed 0=0.

### Phase 46 — Approval Workflows, seventh module: Technology Access Requests ✅
- Matches the spec's Technology/CTO chain, but is genuinely unlike every module in Phases 40-45 in two
  ways. First, **no financial posting at all** — the first module in this whole initiative with no
  journal entry. "Approval" here means recording that access was granted, not posting to the ledger;
  the result table (`access_grants`) has no `entry_group_id`. This app has no ability to actually
  provision access on a real external system (AWS, a vendor portal, a production database) — granting
  here is a tracked, approved record of a decision a human still has to go act on outside this app. It's
  a request/approval/audit trail, not a technical provisioning system.
- Second, **only one `approval_rules` tier is seeded** (`min_amount=0` → `["cto"]`), not several — every
  other module gates on a real, varying amount; an access request has no such number. `amount` is stored
  as 0 purely because `approval_requests.amount` is a required column, semantically unused here. The
  reused amount/tier mechanism still works exactly as designed, it just never needs a second tier.
- Same core+wrapper split as every prior module: `_grant_access_core()` (no auth check) extracted from
  `grant_access()` (checks admin/accountant, the direct-call entry point). `submit_access_request()` (the
  new entry point `AccessRequests.jsx` calls) and `approve_request()`'s new `access_request` branch call
  the core directly.
- **Deliberately NOT self-service**, even though an employee requesting their own access is the more
  natural shape for this feature — submission stays admin/accountant-only, same convention as every
  other module. Reason: `approval_requests_select` is company-wide today, not narrowed to the requester
  (harmless so far, since only admin/accountant could ever create a row). Opening self-service to any
  `viewer`+`employee`-app-role user would let them see every OTHER pending approval request in the
  company too (fixed asset capitalizations, payroll runs, purchase invoices, etc.) — a real RLS gap, not
  a hypothetical one. Narrowing `approval_requests_select` to fix that is a bigger, separate change than
  this phase's scope — flagged as future work if self-service ever becomes a real requirement.
- `revoke_access()` is a separate, immediate action, not gated through the approval mechanism —
  revoking access tightens security rather than loosening it, so it doesn't need the same multi-step
  sign-off granting does. Gated to admin/accountant or a `cto` app-role holder.
- Tested live end-to-end: confirmed a direct `grant_access()` call creates an active grant; confirmed
  `submit_access_request()` creates a pending request (the single seeded tier always resolves to
  `["cto"]`, so nothing auto-grants) with **no** `access_grants` row yet; confirmed a wrong-role holder
  (an `employee` app-role, not `cto`) is rejected with no change to the request; confirmed the CTO test
  user — again deliberately given old `users.role='viewer'`, the same scenario Phase 40 first caught —
  approves successfully and the resulting grant's `system_name`/`access_level` match the original
  submission exactly; confirmed the CTO can revoke that grant (`revoked_at`/`revoked_by` set correctly);
  confirmed revoking an already-revoked grant is rejected (`This access grant is already revoked.`) —
  caught and fixed a mistake in my own first test run here, where a wrong RPC parameter name
  (`p_comment` instead of `p_reason`) caused PostgREST to report "function not found" rather than
  actually exercising the check, so re-ran it correctly before trusting the result; confirmed a
  wrong-role holder cannot revoke a still-active grant, and that the grant is left unaffected. Full
  cleanup afterward; all 14 approval_rules seed rows per company (across all seven gated modules)
  confirmed intact for both companies; `trial_balance()` confirmed 0=0; `access_grants` confirmed empty.

Seven modules now have real, working approval workflows (fixed asset capitalization, payroll runs,
purchase invoices, wastage, project/consulting invoicing, expense claims, technology access requests).

**Audit against a second, more detailed spec (2026-09-06)**: the user supplied a much more detailed
32-section standardized-actions/scope/approval design (VIEW/CREATE/EDIT/SUBMIT/APPROVE/REJECT/POST/
REVERSE/CANCEL/EXPORT/CONFIGURE as the action vocabulary; ALL_BUSINESS/BUSINESS_UNIT/BRANCH/
DEPARTMENT/PROJECT/OWN_RECORDS as scope; a full per-module approval-hierarchy table; separation of
duties; dynamic role creation). Checking it against the actual schema (not memory) surfaced real gaps
— some are missing features, but two are actual bugs in what's already claimed to work today:

- **`role_permissions`/`current_user_has_permission()` is pure bookkeeping — confirmed by grep that no
  business logic anywhere calls it.** The permission matrix UI lets you edit rows that do nothing.
- **A real functional bug**: `role_permissions` grants `project_manager → timesheets.approve`, but
  `timesheets_update`'s RLS policy is still admin/accountant-only — a pure Project Manager (not also an
  old-system admin/accountant) cannot actually approve a timesheet today, despite the permission row
  saying they can.
- **No separation-of-duties check** — `approve_request()`/`reject_request()` never compare
  `requested_by` to the approver; someone holding both the submitting and approving role can approve
  their own request.
- Reversal/cancellation exists for invoices (+ auto full-value credit/debit notes), payments, and fixed
  asset disposal, and revocation for access grants — but not for payroll runs, wastage, or expense
  claims.
- No `discount` field exists anywhere on invoice lines, so section 6's discount-threshold approval has
  no data to gate on. Credit/debit notes are auto-generated, full-value only, as a byproduct of
  `cancel_invoice()` — not the standalone create/submit/approve/post workflow section 7 describes.
  There is no `purchase_requests`/`purchase_orders` staging ahead of purchase invoices (section 8).
  `post_production_entry()` (Phase 9's manufacturing entry) is ungated. Banking reconciliation, GST/TDS
  prepare-approve-review, and the CA/Audit review loop (sections 19-21) don't exist as workflows.

**Planned closure, in priority order (highest-value/lowest-risk first)**:
- **Phase 47 — Permission Enforcement & Separation of Duties. ✅ Done — see retrospective below.**
- **Phase 48 — Reversal completeness. ✅ Done — see retrospective below.**
- **Phase 49 — Sales discount-threshold approval. ✅ Done — see retrospective below.**
- **Phase 50 — Manual Credit/Debit Note workflow. ✅ Done — see retrospective below.**
- **Phase 51 — Purchase Request → Purchase Order chain. ✅ Done — see retrospective below.**
- **Phase 52 — Production approval. ✅ Done — see retrospective below.**
- **Phase 53 — Banking reconciliation approval. ✅ Done — see retrospective below.**
- **Phase 54 — GST/TDS approval workflow. ✅ Done — see retrospective below.**
- **Phase 55 — CA/Audit review loop. ✅ Done — see retrospective below. This closes the full gap-closure
  backlog opened by the 32-section spec audit.**
- **Phases 56-57 — Warehouse-aware stock + inter-branch stock transfer approval. ✅ Done — see
  retrospective below.** Revisits one item from the "deliberately flagged, not scheduled" list below at
  the user's explicit request — building it surfaced a real prerequisite gap (per-warehouse stock was
  never actually tracked anywhere), so it became two phases, not one.
- **Phases 59-63 — Role System Unification: retire `users.role` in favor of `user_app_roles`. ✅ Done —
  see retrospective below.** A user-initiated architectural cleanup (not part of the original spec audit
  backlog) merging the two parallel role systems this app had accumulated over the whole RBAC initiative.

### Phase 47 — Permission Enforcement & Separation of Duties ✅
- **Separation of duties**: `approve_request()`/`reject_request()` now both check `requested_by <>
  auth.uid()` before doing anything else, and raise a clear error ("You cannot approve/reject your own
  request.") if the caller submitted the request themselves — even if they separately hold the
  required approval role. Applied identically to both functions.
- **The timesheet-approval gap**: `role_permissions` already granted `project_manager ->
  timesheets.approve`, but `timesheets_update`'s RLS policy was admin/accountant-only, so a pure
  Project Manager couldn't act on it. Fixed with a new `set_timesheet_approval(p_timesheet_id,
  p_status)` — a narrow SECURITY DEFINER RPC that touches only `approval_status`, gated to
  admin/accountant OR (`current_user_has_permission('timesheets.approve')` AND the caller's linked
  employee is that specific project's `project_manager_employee_id`). Chose a dedicated function over
  loosening the RLS policy outright, since Postgres RLS can't restrict an `UPDATE` to one column on its
  own — this app's established pattern for "needs an authority check beyond raw RLS" is always a
  dedicated function. `ProjectDetail.jsx` now calls this RPC instead of a raw table update, and shows
  the Approve/Reject buttons to a qualifying scoped PM too, not just admin/accountant.
- **`current_user_has_permission()`'s first real caller**: `submit_payroll_run()`'s gate now also
  accepts `current_user_has_permission('payroll.prepare')` — a permission Phase 38's seed already
  granted to `hr_payroll` but nothing had ever checked. Purely additive; the existing admin/accountant
  path is completely unchanged.
- Tested live end-to-end, three groups: **(1) separation of duties** — confirmed a user holding both
  the submitting role (accountant) and the required approving app-role (`coo`) is blocked from
  approving or rejecting their own ₹55,000-₹60,000 fixed-asset-capitalization requests with the exact
  new error message, while a genuinely different COO/CFO completes the same multi-step chain
  normally (regression); **(2) payroll permission enforcement** — confirmed an HR/Payroll test user
  (old `users.role='viewer'`, no admin/accountant) successfully submits a ₹150,000 payroll run (above
  the ₹100,000 threshold, correctly resolves to `["cfo"]`), confirmed a plain `employee` app-role holder
  still cannot, and confirmed the CFO's approval posts it correctly; **(3) timesheet approval scoping**
  — confirmed the Project Manager assigned to Project A can approve its timesheet, confirmed a
  *different* PM (assigned to Project B) cannot touch it, confirmed a plain `employee` app-role holder
  cannot either, confirmed admin/accountant retains full access (regression), and confirmed an invalid
  status string is rejected. One test-script mistake caught along the way: my own reject-path test
  initially used the CFO to reject a request still sitting at its `coo` step — correctly rejected by
  the existing "you don't hold the required role" check, not a defect; fixed the test to use the
  genuine COO instead. Full cleanup afterward, including a two-step FK dependency I hadn't hit before
  (`asset_transactions` references `fixed_assets`, which references `asset_categories` — deleted in that
  order); `trial_balance()` confirmed 0=0; `approval_rules` count confirmed unchanged at 28 (this phase
  added no new rules, only enforcement).

### Phase 48 — Reversal Completeness ✅
- `reverse_payroll_run()`, `cancel_wastage()`, `cancel_expense_claim()` — the same immutable-original/
  reversing-entry pattern `cancel_invoice()`/`cancel_payment()`/`dispose_fixed_asset()` already
  established, extended to the three modules that never had it. None of `payroll_runs`/`wastage`/
  `expense_claims` had a status column before this phase; each got one (`posted`/`reversed` or
  `posted`/`cancelled`) added in place at its original table definition. `payroll_runs`' old plain
  unique constraint on `(company_id, employee_id, run_month)` became a partial index scoped to
  `status='posted'`, so a corrected re-run is possible for the same employee+month after a reversal.
  `cancel_wastage()` also reverses the exact `stock_ledger` rows `consume_item_fefo()` created (same
  batch, opposite direction) — a blind reference-based reversal, not a fresh FEFO allocation, matching
  `cancel_invoice()`'s own stock-ledger reversal precedent.
- **A real fix, not just confirmation**: project/consulting invoices already reuse `cancel_invoice()`
  since they post through the same `invoices` table, but cancelling one used to leave its billed
  timesheets permanently pointing at a cancelled invoice (`timesheets.invoice_id` was never cleared) —
  they could never be invoiced again. `cancel_invoice()` now nulls `timesheets.invoice_id` for the
  cancelled invoice; harmless no-op for every other invoice type, since only project invoicing ever
  sets that column.
- **A real bug caught by live-testing, not by inspection**: `_post_payroll_run_core()`'s own duplicate-
  run guard (`payroll has already been run for this employee this month`) checked for ANY existing row
  for that employee+month, not just `status='posted'` ones — so a reversed run permanently blocked any
  corrected re-run, defeating the entire point of `reverse_payroll_run()`. Caught mid-test-suite when a
  legitimate corrected re-run failed with that exact message; fixed by scoping the guard to
  `status='posted'`, matching the new partial unique index's own intent. Shipped as a small standalone
  hotfix once the first handoff file had already been run, since the bug was only in application logic,
  not the schema/index change itself.
- Tested live end-to-end, four groups: **(1) payroll** — posted a run, confirmed a second run for the
  same employee+month is blocked, reversed it (mirror-image journal legs hand-verified: salary expense
  debited ₹50,000 originally, credited ₹50,000 in the reversal), confirmed double-reversal is rejected,
  confirmed a corrected re-run (₹55,000) now succeeds for that same employee+month, confirmed a THIRD
  run is still correctly blocked once an active posted run exists again; **(2) wastage** — posted a
  30kg wastage entry against a 100kg batch (cost ₹300 at ₹10/kg), cancelled it, confirmed the stock
  ledger shows the full 100kg restored and the reversal journal balances at ₹300, confirmed double-
  cancellation is rejected, confirmed a fresh 90kg wastage entry can consume the restored stock via
  FEFO again (cost ₹900); **(3) expense claims** — posted and cancelled a ₹1,200 claim, confirmed the
  reversal journal balances, confirmed double-cancellation is rejected; **(4) project invoice
  cancellation** — posted a project invoice from an approved timesheet, confirmed the timesheet linked
  to it, cancelled the invoice, confirmed the timesheet's `invoice_id` was cleared, confirmed the same
  timesheet could be invoiced again successfully. Full cleanup afterward (including a FK-ordering
  lesson: timesheets must be unlinked/deleted before their invoice, and invoices before the party/
  account they reference); `trial_balance()` confirmed 0=0 throughout.

### Phase 49 — Approval Workflows, eighth module: Sales Invoice Discounts ✅
- Matches the spec's Sales chain (section 6): routine sales post immediately; a discount above a
  configured threshold needs Manager/CMO/COO approval. Required a real schema addition — no discount
  concept existed anywhere before this phase. Added `discount_pct`/`discount_amount` to `invoices`
  (header-level, not per-line); `_post_invoice_core()` applies the discount to each line's taxable
  value *before* computing GST, so every downstream figure (subtotal, grand total, the revenue journal
  leg) already reflects the discounted amount with no other change needed anywhere else in the
  function. GST is charged on the post-discount value — correct under GST law provided the discount is
  known at/before the time of supply and recorded on the invoice itself, which this is; **flagged for
  CA confirmation regardless, per CLAUDE.md's compliance-judgment rule.**
- **Sales-only, explicitly guarded**: a purchase invoice submitted with a nonzero discount is rejected
  outright (`Discounts are only supported on sales invoices.`) — a purchase-side "discount" isn't a
  modeled concept here (that would be a vendor-negotiated price reduction, a different thing).
- Same core+wrapper split as every module in Phases 40-48: `_post_invoice_core()`/`post_invoice()` both
  extended in place with a new trailing `p_discount_pct` parameter (verified safe beforehand — every
  existing internal caller passes positional args that still resolve correctly against a trailing
  default parameter). `submit_sales_invoice()` (the new entry point `InvoiceForm.jsx` now calls for
  `type="sales"`, alongside the pre-existing `submit_purchase_invoice()` for `type="purchase"`) and
  `approve_request()`'s new `sales_invoice_discount` branch call the core directly.
- **The gated dimension is a discount PERCENTAGE (0-100), not an amount** — `approval_rules.min_amount`
  reused to hold it, same precedent as Phase 43's wastage module reusing it for quantity. Seeded two
  tiers: 0% → no approval (today's behavior, unchanged), 10%+ → COO (inclusive, matching how every
  other module's own threshold already works — a one-point stricter reading than the spec's literal
  ">10%", not a hardcoded rule; editable via the UI).
- **A real bug caught by live-testing, not by inspection**: `create or replace function` does not
  actually replace a function when a parameter is added — even with a default, Postgres treats the
  different parameter count as a distinct overload. The OLD 6-arg `post_invoice()` and 7-arg
  `_post_invoice_core()` were still sitting there alongside the new ones after the first handoff file
  ran, making any named-argument (RPC) call that omitted `p_discount_pct` ambiguous between the two
  overloads. Caught when a regression test posting a plain purchase invoice failed with "Could not
  choose the best candidate function" — fixed with a small hotfix explicitly dropping the old-arity
  overloads of both functions, leaving exactly one version of each (the frontend was never actually
  broken by this, since nothing calls `post_invoice()` directly via RPC anymore — both sales and
  purchase route through their `submit_*` wrappers — but it was a real latent landmine for any other
  caller, not just a test artifact).
- Tested live end-to-end: confirmed a 0% discount sale posts identically to before (regression);
  confirmed a 5% discount (below the 10% threshold) posts immediately with hand-verified figures
  (₹1,000 gross → ₹50 discount → ₹950 net taxable → ₹85.50 CGST + ₹85.50 SGST → ₹1,121 grand total);
  confirmed a 15% discount creates a pending request (chain `["coo"]`, `amount` holding 15, not a rupee
  figure); confirmed a wrong-role holder is rejected; confirmed the COO approves and the resulting
  invoice's math is exactly correct (₹1,000 gross → ₹150 discount → ₹850 net taxable → ₹76.50 CGST +
  ₹76.50 SGST → ₹1,003 grand total, journal balanced at ₹1,003) and that the line item's `rate` stays
  the original undiscounted ₹1,000 while `taxable_value` correctly reflects the discount; confirmed
  purchase invoices reject any nonzero discount, and — after the overload hotfix — confirmed both a
  direct `post_invoice()` call and the real `submit_purchase_invoice()` production entry point still
  post normal purchases correctly. Full cleanup afterward (one of my own cleanup-script comments said
  "expect 15 approval_rules rows per company" when the real, correct count is 16 — an arithmetic slip
  in the comment, not an actual discrepancy, confirmed by breaking down the count per entity_type);
  `trial_balance()` confirmed 0=0.

### Phase 50 — Approval Workflows, ninth module: Manual Credit/Debit Notes ✅
- **Turned out smaller than planned**: a full manual, partial credit/debit note feature already existed
  in this codebase from an earlier phase — `post_manual_credit_debit_note()`, `credit_note_line_items`,
  and the `CreditDebitNoteForm.jsx`/`InvoiceDetail.jsx` UI were all already built and correct. It already
  proportionally scales each adjusted line's *original posted* taxable/CGST/SGST/IGST amounts (never
  re-resolving today's tax rate — the same historical-invariance rule CLAUDE.md requires), and already
  tracks remaining-quantity per line to block double-crediting. What it never had was an approval gate.
  This phase closed exactly that gap, not rebuilt the feature.
- Same core+wrapper split as every module in Phases 40-49: `_post_manual_credit_debit_note_core()`
  extracted (no auth check), `post_manual_credit_debit_note()` reduced to a thin wrapper (still checks
  admin/accountant itself, unchanged direct-call behavior). `submit_credit_debit_note()` (the new entry
  point `CreditDebitNoteForm.jsx` now calls) and `approve_request()`'s new `credit_debit_note` branch
  call the core directly.
- **Deliberate departure from every other module's seed convention**: every other module seeds a
  `min_amount=0 → []` tier reproducing "today's immediate-post behavior," since that behavior already
  existed and had to stay unchanged for zero regression. A manual credit/debit note never had a
  UI-driven approval step before, so there's no backward-compatibility reason to keep it auto-postable —
  and the spec's own workflow diagram for this document type never shows a no-approval path at all
  ("this needs stronger control because it directly changes revenue/tax"). Seeded accordingly: **even
  the ₹0 tier requires CFO sign-off**; ₹100,000+ additionally requires the CEO. Still fully editable via
  the UI like every other threshold.
- Threshold basis: the note's own pre-tax subtotal, computed in `submit_credit_debit_note()` via the
  same proportional-scaling arithmetic the core uses authoritatively (read-only preview, changes
  nothing) — same reasoning as Phase 42's purchase-invoice subtotal.
- Tested live end-to-end against two posted sales invoices (₹10,000 and ₹150,000 pre-tax, same-state
  18% GST): confirmed a small credit note (2 of 10 units, ₹2,000 pre-tax) still requires CFO approval
  despite being below the high-value threshold (no free tier), with the resulting note's proportional
  scaling exactly correct (₹2,000 taxable → ₹180 CGST + ₹180 SGST → ₹2,360 grand total, journal
  balanced) and the `credit_note_line_items` row correctly recording the adjusted quantity and scaled
  taxable value; confirmed a wrong-role holder is rejected; confirmed a full ₹150,000 credit note
  correctly resolves the two-step `[cfo, ceo]` chain, with CFO advancing it to step 1 and CEO completing
  it (₹150,000 → ₹177,000 grand total, journal balanced); confirmed the pre-existing over-crediting
  guard still works correctly through the new approval path — submitting a request for 9 more units
  when only 8 remained created a pending record (the guard lives in the core, not the cheap preview in
  `submit_credit_debit_note()`), and CFO's approval attempt correctly failed with the exact "only 8.00
  remain" error, rolling back the entire `approve_request()` call (the request stayed at step 0/pending,
  not partially advanced) — confirming Postgres correctly rolled back the whole transaction, not just
  the core's own insert; confirmed the direct `post_manual_credit_debit_note()` call still works
  unchanged for admin/accountant (regression). Full cleanup afterward; `trial_balance()` confirmed 0=0.

### Phase 51 — Approval Workflows, tenth module: Purchase Request → Purchase Order ✅
- Matches the spec's section 8 fuller purchase flow: Inventory Manager raises a Purchase Request → COO
  approves it (that approval directly authorizes a Purchase Order — the spec's own diagram never shows
  a separate approval step for the order itself) → an Accountant later fulfills that order with a real
  Purchase Invoice (already gated since Phase 42) → CFO approves if above the existing invoice
  threshold; high-value requests additionally need CFO and CEO. Genuinely new entities
  (`purchase_requests`/`purchase_orders`), unlike every module in Phases 40-50 — neither posts anything
  financial; the only ledger effect happens later, when the already-gated purchase invoice is actually
  created against an open order.
- **Threshold basis is an ESTIMATED amount the requester supplies** — unlike every other module, there
  is no canonical "price" on an item in this schema to derive a threshold from (a raw material's
  `average_cost` only exists after a purchase, and a first-time item has none at all). The real amount
  is determined independently and re-gated on its own terms when the eventual purchase invoice is
  created — confirmed live: a ₹600,000 estimated request's own fulfilling invoice (at a different,
  actual negotiated rate) crossed the *purchase invoice's own* ₹500,000 tier too, correctly requiring
  its own separate COO→CFO→CEO chain, entirely independent of the request's chain.
- Same seed-convention departure as Phase 50: COO approval is always required (no auto-post tier),
  matching the spec's own diagram; only the CFO+CEO escalation is threshold-gated.
- **Closes the loop into the existing purchase-invoice flow**: `submit_purchase_invoice()` gained an
  optional `p_purchase_order_id` — when set, both its auto-approve path and `approve_request()`'s
  pre-existing `purchase_invoice` branch mark the order `fulfilled` once the invoice actually posts.
  `cancel_purchase_order()` added too, matching the spec's explicit `purchase_order.cancel` permission.
- `inventory_manager` — the spec's actual submitter for this document — got a new, precisely-named
  `purchase_request.create` permission (rather than overloading the existing `inventory.create`, which
  is about stock counts/adjustments, a different action), wired into `submit_purchase_request()`'s gate
  the same way Phase 47 wired `payroll.prepare` into `submit_payroll_run()`.
- **Two real bugs caught by live-testing, not by inspection, both fixed before any test could pass**:
  (1) The first handoff file put `approve_request()`'s update *before* the new `purchase_orders` table
  creation — but `approve_request()`'s declare block needs `public.purchase_orders` as a variable type,
  and Postgres resolves declared variable types *at function-creation time*, unlike statement bodies,
  which are only checked at first execution. The file failed immediately, with nothing applied.
  (2) Investigating that error surfaced a **pre-existing structural bug in `schema.sql` itself**, latent
  since Phase 45: the master fresh-install file appends new result-entity tables at the end, but
  `approve_request()` lives at a fixed early position and declares a variable for every such type —
  meaning a genuine top-to-bottom fresh install would have already failed at Phase 45's
  `expense_claims`, and again at Phase 46's `access_grants`, not just now at `purchase_orders`. This
  went undetected because the live database was always patched incrementally through individually
  correct handoff files (each one happened to create its table before touching `approve_request()`),
  never actually rebuilt from `schema.sql` top-to-bottom. Fixed properly, not patched around: moved the
  bare `CREATE TABLE`/RLS statements for all three affected tables (`expense_claims`, `access_grants`,
  `purchase_requests`/`purchase_orders`) to appear before `approve_request()`, leaving each table's full
  design rationale as a comment at its original position, next to its supporting functions.
  `schema.sql` is genuinely fresh-installable again. A corrected `phase51.sql` was then reassembled and
  ran clean.
- Tested live end-to-end: confirmed a ₹10,000 request (submitted by a real Inventory Manager app-role
  holder, not admin/accountant) still requires COO despite being low-value (no free tier); confirmed a
  wrong-role holder is rejected; confirmed COO's approval creates an open `purchase_orders` row with the
  linked `purchase_requests` row recorded correctly; confirmed a ₹600,000 request correctly resolves the
  full `[coo, cfo, ceo]` chain; confirmed order cancellation, double-cancellation rejection, and
  wrong-role cancellation rejection; confirmed fulfilling the ₹600,000 order with a real invoice
  (5,000 units × ₹120 = ₹600,000 at 5% GST → ₹630,000 grand total) correctly triggered the purchase
  invoice's own independent approval chain, and completing it flipped the order to `fulfilled`;
  confirmed attempting to fulfill an already-fulfilled order is rejected; confirmed a plain purchase
  invoice with no `purchase_order_id` still posts normally (regression). Full cleanup afterward
  (including one FK lesson: `stock_ledger` rows from the test purchases had to be cleared before the
  test item itself could be deleted); `trial_balance()` confirmed 0=0.

### Phase 52 — Approval Workflows, eleventh module: Production Entries ✅
- Matches the spec's section 10: Kitchen Staff records production → Kitchen Manager approves → COO for
  higher-level operational approval on large batches. Same core+wrapper split as every module in Phases
  40-51: `_post_production_entry_core()` extracted from the pre-existing `post_production_entry()`,
  which keeps its own admin/accountant check, unchanged for its existing direct caller.
  `submit_production_entry()` (the new entry point `ProductionEntry.jsx` now calls) and
  `approve_request()`'s new `production_entry` branch call the core directly.
- **Lowest-risk phase in this initiative so far**: no new tables, and no parameter-count changes to any
  existing function — `production_entries` already existed, and both `post_production_entry()` and
  `approve_request()` kept their exact original signatures. Neither the Phase 49 overload-ambiguity
  lesson nor the Phase 51 type-resolution-ordering lesson applied here, and the handoff file ran clean
  on the first attempt.
- Threshold basis: QUANTITY PRODUCED, not cost — same reasoning and precedent as Phase 43's wastage
  module (the batch's actual cost is only known once `consume_item_fefo()` runs inside the core, since
  it depends on which specific raw-material batches get consumed). Unlike Phases 50/51's credit-notes/
  purchase-requests, this one **keeps a free auto-post tier at quantity 0** — production is routine,
  high-frequency kitchen output, not an exception-driven document, so the normal "today's behavior stays
  unchanged below the threshold" convention fit better here than the "always needs sign-off" departure.
  Seeded two tiers: 0 → no approval, 500+ units → Kitchen Manager then COO.
- `kitchen_manager` got a new, precisely-named `production.create` permission (not overloading the
  existing `kitchen.create`, which is about kitchen/menu orders, a different action) — same precedent as
  Phase 51's `purchase_request.create`.
- `ProductionEntry.jsx` had no UI-level role gate at all before this phase (the RPC's own admin/
  accountant check was the only enforcement) — now shows the form only to admin/accountant or a
  qualifying Kitchen Manager app-role holder, and handles the pending/approved response shapes like
  every other gated module's form.
- Tested live end-to-end: confirmed a small batch (10 units, consuming 20kg of raw material at ₹10/kg)
  still posts immediately with the FEFO-computed output-batch unit cost exactly correct (₹200 total ÷
  10 units = ₹20/unit) and the journal balanced at ₹200; confirmed a large batch (600 units, consuming
  500kg) creates a pending request with chain `[kitchen_manager, coo]`; confirmed a wrong-role holder is
  rejected; confirmed Kitchen Manager advances it to step 1; confirmed COO completes it, with the
  resulting batch's unit cost exactly correct (₹5,000 ÷ 600 units = ₹8.33/unit, rounded) and the journal
  balanced at ₹5,000; confirmed the raw material's remaining stock is exactly correct after both batches
  (1,000kg opening − 20kg − 500kg = 480kg). Full cleanup afterward (one lesson: the small batch's own
  auto-approved `approval_requests` row still had to be found and deleted before its submitting user
  could be removed, since `requested_by` is recorded even for immediately-approved requests, not just
  pending ones); `trial_balance()` confirmed 0=0.

### Phase 53 — Approval Workflows, twelfth module: Bank Reconciliation ✅
- Matches the spec's section 19, but with a genuine architecture choice made explicitly with the user
  first (asked via a direct question rather than guessed, per CLAUDE.md's "ask before guessing" rule):
  gate each individual bank-transaction match, or build a real reconciliation-period/batch entity. The
  user chose the batch entity — bigger, closer to the spec's literal wording.
- **New table, not a gate on an existing function** — the first genuinely new entity since Phase 51's
  purchase requests: `bank_reconciliations` (one draft period for one bank account + statement date
  range, with its own `draft → pending → approved/rejected` lifecycle). The existing match/unmatch UI is
  completely unchanged underneath — accountants keep matching transactions to payments exactly as
  before, freely, while a period is `draft`. `submit_bank_reconciliation()` is the new step: it snapshots
  every currently-matched, not-yet-claimed transaction in that account+period by setting
  `bank_transactions.reconciliation_id`, so further matching elsewhere can't silently change what's under
  review, then resolves the approval chain like every other module.
- Because the reconciliation row already exists (in `pending` status) by submission time — unlike every
  other module, where the core function creates its result row from scratch —
  `_finalize_bank_reconciliation_core()` is a deliberate variant: it only flips `status` to `approved`,
  it doesn't insert anything.
- **`reject_request()`'s first-ever entity-specific side effect.** Every other module's rejection was a
  pure status-flip no-op, since nothing had been created yet for any of them. Here the row and its
  claimed transactions already exist, so rejecting a reconciliation now frees every transaction it had
  claimed (`reconciliation_id = null`) and marks the reconciliation itself terminally `rejected` —
  matching this app's immutable-original convention (a corrected attempt is a fresh reconciliation, not a
  revived one) rather than reopening the old row back to `draft`.
- **RLS tightened**: `bank_transactions_update` now blocks changing a transaction (matched_payment_id or
  anything else) once its reconciliation is `pending` or `approved` — otherwise a direct table PATCH
  could bypass `submit_bank_reconciliation()`/`approve_request()` entirely and silently alter what a CFO
  is reviewing or already signed off on. A rejected reconciliation's transactions are freed again, so
  they're never blocked by this. Had to be added at the very end of the file (drop + recreate), not in
  place at the policy's original early position — same reasoning as Phase 39's own RLS narrowing and
  Phase 51's table-ordering lesson: a policy's `USING` clause can't reference a table that doesn't exist
  yet that early in a fresh install.
- Applied the Phase 51 lesson **proactively** this time: `bank_reconciliations`' bare table + RLS
  definition was placed ahead of `approve_request()` from the start (in the new pre-`approve_request()`
  block alongside `expense_claims`/`access_grants`/`purchase_requests`/`purchase_orders`), rather than
  discovering the ordering bug via a failed handoff file.
- Threshold basis: the **absolute value** of the reconciled total — amounts are signed (inflow/outflow),
  so a large outflow-heavy period shouldn't read as "small" just because its sum is negative. Kept the
  free auto-post tier at 0 (like Phase 52's production entries, unlike Phases 50/51's notes/purchase
  requests) — routine reconciliation is a high-frequency operation, not an exception-driven document.
  Seeded two tiers: 0 → no approval, ₹500,000+ (absolute) → CFO. Placeholder numbers, not
  compliance-blessed — editable via Roles & Permissions.
- `Reconciliation.jsx` rewritten to add a reconciliation-period selector/list and a "new period" form,
  with the existing match/unmatch UI scoped to whichever draft period is active; a "Submit for Approval"
  button calls `submit_bank_reconciliation()` and handles the pending/approved response shapes like every
  other gated module's form.
- Tested live end-to-end against throwaway fixtures (one bank account, one customer, one service item, a
  fresh tax rate, three test users — an accountant preparer, a CFO, and a COO with no CFO role): a small
  reconciliation (₹1,180) auto-approved immediately and correctly claimed its one transaction; a large
  reconciliation (₹5,90,000) came back `pending`, confirmed self-approval is blocked (the preparer cannot
  approve their own submission), confirmed a wrong-role holder (COO, no `cfo` app-role) is rejected,
  confirmed a raw `UPDATE` on the claimed transaction is blocked by RLS while `pending`, confirmed an
  unrelated/unclaimed transaction stays freely editable throughout, confirmed the CFO's approval finalizes
  it and the claimed transaction *still* can't be raw-updated afterward (now `approved`); a third
  reconciliation (₹6,00,000) was submitted and then **rejected** by the CFO, confirming its transaction
  was freed (`reconciliation_id` cleared) and the reconciliation itself is terminally `rejected` — then
  confirmed the freed transaction could be claimed again by a brand-new reconciliation and approved
  cleanly on retry. All fixtures (users, parties, items, tax rate, chart-of-accounts rows, bank account,
  invoices/payments/journal entries, bank transactions, reconciliations, approval requests) were cleaned
  up afterward in FK-safe order; `invoice_number_counters` was deliberately left untouched (it's a
  shared, monotonic per-company/type/year sequence — GST Rule 46 requires consecutive unique numbering,
  so resetting it would let a future real invoice reuse a number this test run already consumed).
  `trial_balance()` confirmed 0=0 after cleanup.
- **Noted, not fixed in this phase**: the live database still has a handful of unrelated leftover rows
  named `P37 Test ...` (an expense/income account, a bank account, a vendor, a customer) in this same
  company from an earlier phase's testing that was never fully cleaned up. Flagging it here rather than
  deleting it silently — it's someone else's leftover state from a prior phase, not something Phase 53
  touched, so removing it should be a deliberate, separately-confirmed action. **Resolved separately after
  Phase 55** — confirmed nothing referenced them (no journal entries, invoices, payments, or other rows),
  then deleted all 5 rows from the live database.

### Phase 54 — Approval Workflows, thirteenth/fourteenth modules: GST Return and TDS Return sign-off ✅
- Matches the spec's sections 19-21's literal "Accountant prepares → CFO approves → CA reviews" flow. Two
  genuinely new entities — `gst_returns` and `tds_returns` — layered on top of the existing read-only
  `gstr3b_summary()`/`tds_summary()` reports (Phases 8/32), which stay completely unchanged and still work
  for ad hoc, non-filed lookups. Filing is a deliberate, separate action, not something that happens
  automatically just by viewing a summary.
- **First real use of `ca_auditor`** as an approval-chain participant. The existing sequential
  `approve_request()` mechanism needed zero changes to support a two-role, cfo-then-ca chain — the whole
  "CA reviews" step is just the CA holding the `ca_auditor` app role and being the last link in
  `["cfo", "ca_auditor"]`.
- **`gst_returns` snapshots the exact same figures `gstr3b_summary()` already reports** (outward supplies
  net of sales credit notes, inward supplies net of purchase debit notes, split CGST/SGST/IGST) — via its
  own explicitly company-scoped queries, not by calling `gstr3b_summary()` itself, since that function has
  no `company_id` filter of its own and relies entirely on RLS for scoping, which a SECURITY DEFINER
  function bypasses. Still deliberately does NOT compute a "net tax payable," for the same reason the
  existing report doesn't (see its own header comment): the input-tax-credit set-off order is a real
  compliance rule that can change, and a CA should apply it to the raw figures, not have this app decide
  it. `submit_gst_return()`'s only use of a computed "amount" is a magnitude (sum of all six tax columns)
  for approval-routing/display — explicitly commented as not a compliance figure.
- **No "claiming" mechanism needed here**, unlike Phase 53's bank reconciliation: invoices and credit/debit
  notes are already immutable once posted (no edit-after-post anywhere in this schema), so a filed
  return's source data can't silently change underneath it the way editable bank-statement lines could.
- **`tds_returns` snapshots the total TDS deducted** (Phase 32's `tds_transactions`) in the period, joined
  through `payments.payment_date` exactly like `tds_summary()` does. `tds_transactions.deposited_on` is
  deliberately left untouched by this workflow — it's an operational field naturally set AFTER a return is
  filed (when the TDS is actually paid to the government), not a figure this approval signs off on.
- **`reject_request()` gained its second and third entity-specific side effects** (after Phase 53's
  bank-reconciliation one): both are simpler than that one, since nothing was ever "claimed" — just the
  terminal status flip on `gst_returns`/`tds_returns` so a fresh return can be prepared for the same
  period.
- A partial unique index (`gst_returns_one_active_per_period`/`tds_returns_one_active_per_period`) blocks
  two simultaneously active (`draft`/`pending`/`approved`) returns for the exact same period, same pattern
  as Phase 48's payroll-run precedent — a rejected return doesn't block a fresh attempt at that period.
- Applied the Phase 51 lesson proactively (same as Phase 53): both new tables were placed ahead of
  `approve_request()` from the start, in the same pre-`approve_request()` block.
- **Handoff-file quirk, caught and applied proactively this time** (Phase 53 discovered it reactively):
  `schema.sql`'s own copy of `reject_request()` correctly stays a plain `create function` (it's a
  fresh-install file, and that function only gets created once), but the live database already had it
  from Phase 53's own `create or replace` — so `phase54.sql`'s copy needed `create or replace` for it to
  run against the live database without a "function already exists" error.
- Threshold basis: **neither return has a free auto-post tier at all**, regardless of amount — filing with
  the government is always significant enough to need the full chain. Only a single flat `approval_rules`
  row (`min_amount 0 → ["cfo", "ca_auditor"]`) is seeded for each — the first modules in this initiative
  with no amount-based tiering whatsoever, not even Phase 50/51's "no free tier but still tiered by
  amount."
- `GstSummary.jsx`/`TdsSummary.jsx` each got a "File this period for approval" button (admin/accountant
  only, reusing the page's existing date-range picker) and a filed-returns history table underneath the
  live report.
- Tested live end-to-end against throwaway fixtures (one bank account, a customer and a vendor, one
  service item, a fresh GST rate and TDS section, four test users — an accountant preparer, a CFO, a CA,
  and a COO with neither role): a GST return for one period (₹1,00,000 sales/₹40,000 purchase, both 18%
  same-state) correctly snapshotted outward/inward CGST+SGST; confirmed self-approval blocked, a wrong-role
  holder blocked at the CFO step, the CFO's approval advancing the request to step 1 without finalizing it,
  the CFO unable to also act as the CA step, and the CA's approval finalizing it; confirmed a second active
  return for the same period is rejected by the unique index; a second period's GST return was submitted
  and rejected by the CFO, confirmed terminally `rejected`, and confirmed a fresh return for that same
  period could then be created. Repeated the same sequence for a TDS return (a ₹50,000 payment with a 10%
  TDS section correctly aggregated to ₹5,000; full cfo→ca approval chain; a second period rejected then
  resubmitted). All 24 checks passed. Fixtures cleaned up afterward in FK-safe order (including
  `tds_transactions`, unique on `payment_id`, deleted before its payment); `invoice_number_counters` again
  deliberately left untouched. `trial_balance()` confirmed 0=0 after cleanup.
- **Still not fixed, noted again**: the unrelated leftover `P37 Test ...` rows flagged in Phase 53's
  retrospective are still present — untouched by this phase for the same reason as before. **Resolved
  separately after Phase 55** — see the updated note on Phase 53's retrospective above.

### Phase 55 — CA/Audit review loop ✅
- **Architecturally different from every module in Phases 40-54, on purpose**: `approve_request()`/
  `reject_request()` are completely untouched by this phase. Those modules all block a pending FINANCIAL
  ACTION until sign-off; this is the opposite shape — a CA (or an accountant who spots something odd)
  flags an already-posted record or a whole period for review, records findings as the investigation
  proceeds, and signs off when satisfied. Nothing is ever blocked or reversed by a flag; it's a review
  trail layered alongside the ledger, not a control gate in front of it, matching the spec's own framing
  of this as a review loop rather than an approval chain.
- Two new tables: `audit_flags` (one row per flagged item/period, `open`/`resolved`) and `audit_findings`
  (an append-only, multi-row list of investigation notes against a flag, each with its own author and
  timestamp — same reasoning as `approval_requests.decisions`, just a real child table instead of a jsonb
  array since there's no fixed-length chain to walk here).
- `reference_type`/`reference_id` deliberately mirror `approval_requests.entity_type`'s own precedent:
  plain text, not a real foreign key, since a flag can point at any of a dozen+ different tables and
  Postgres can't have an FK reference "whichever table this row names." The one special value is
  `'period'` (`reference_id` null, `period_start`/`period_end` required instead), enforced by a real check
  constraint (`audit_flags_reference_shape`) — the one piece of real structural validation this phase
  needed.
- **Deliberately does NOT dispatch on `reference_type` to verify the referenced row actually exists** in
  whichever table it names (unlike `approve_request()`'s dispatch to the right `_core()` function) — an
  audit flag has no amount, no journal entries, no compliance math; it's a note, not a financial
  calculation, so CLAUDE.md's "never cut corners" exceptions (financial calculations, ledger posting)
  don't apply here. A 13-branch existence-check switch for a metadata-only record would have been
  premature generalization.
- **Authority split, a real judgment call flagged here rather than re-confirmed with the user mid-phase**:
  admin/accountant OR a `ca_auditor` app-role holder can raise a flag (broader — an accountant noticing
  something odd should be able to flag it for the CA's attention, not only the CA themselves), but only
  `ca_auditor` (or admin, the same superuser-override precedent used throughout this schema) can record
  findings or sign off — that narrower authority is specifically the CA's job per the spec. Worth
  revisiting if it turns out flagging should be CA-only too.
- New page `AuditReview.jsx` (`/audit-review`, alongside Approvals in the nav) — a flag form
  (record-by-ID or period), an open-flags list with inline "add finding"/"sign off" for qualifying users,
  and a resolved-flags history. First page in this codebase needing PostgREST relationship-disambiguation
  hints (`users!flagged_by`/`users!resolved_by`) since `audit_flags` is the first table with two separate
  foreign keys to `users`.
- Tested live end-to-end against throwaway fixtures (an accountant, a CA, and a plain viewer with neither
  role): confirmed the accountant can flag a period but a plain viewer cannot flag anything; confirmed an
  empty reason is rejected; confirmed the accountant can neither add a finding nor resolve their own flag;
  confirmed the CA can add a finding and then resolve it (status/`resolved_by`/`resolved_at` all correct);
  confirmed a resolved flag can't be resolved again and can't accept new findings; confirmed a
  specific-record flag (a real invoice ID) works, and confirmed all three shape-validation failures
  (missing `reference_id` on a non-period flag, period dates supplied on a non-period flag, missing dates
  on a period flag). All 13 checks passed. Fixtures cleaned up afterward; `trial_balance()` confirmed
  0=0 (this phase never touches the ledger at all, so this check is a no-op by construction, but run for
  consistency with every other phase's closing verification).
- **This is the last item in the gap-closure backlog** opened by the 32-section spec audit. The
  "Deliberately flagged, not scheduled" list below remains the record of what was consciously left out.

### Phases 56-57 — Warehouse-Aware Stock + Inter-Branch Stock Transfer Approval ✅
- Revisits the "Inter-branch stock transfer approval" item from this section's own deferred list, at the
  user's explicit choice after being shown three options ranging from a paper-trail-only transfer with no
  real balance check up to a full warehouse-aware retrofit — the user chose the full retrofit, presented
  and approved via a formal plan (`EnterPlanMode`/`ExitPlanMode`) given its size and the fact that it
  touches `consume_item_fefo()`, the shared costing engine behind every sale, wastage entry, production
  entry, and R&D trial in this app.
- **Real prerequisite gap found during planning**: `stock_ledger`/`item_batches.warehouse_id` had existed
  since Phase 28 but was never populated or read by anything — every stock computation in the app
  (`consume_item_fefo()`, `item_current_stock`, `item_batch_status`, `stock_valuation()`, the
  Inventory/Dashboard low-stock widgets) was company-wide, not warehouse-scoped. A transfer that can't
  verify the source warehouse actually holds the stock isn't a real control, so this became two phases:
  Phase 56 makes warehouse tracking real; Phase 57 builds the actual transfer/approval feature on top.
- **Phase 56** (no user-visible behavior change): `current_user_default_warehouse_id()` mirrors
  `current_user_default_branch_id()`; `stock_ledger`/`item_batches.warehouse_id` got a column DEFAULT
  (same technique Phase 20 used for `branch_id`), so every existing insert statement anywhere in the app
  picked up a correct warehouse automatically with zero code changes; a backfill assigned every
  pre-existing row to its company's one default warehouse, followed immediately by `set not null` — which
  is what actually proved the backfill was complete, since an incomplete backfill would have made that
  statement fail outright rather than silently leaving a gap. `consume_item_fefo()` gained two
  both-default-null parameters (`p_warehouse_id` to scope FEFO consumption to one warehouse,
  `p_to_warehouse_id` to mirror a consumed slice into a destination warehouse — the actual "move"
  mechanic Phase 57 uses) — every existing caller (sales, wastage, production, R&D trials) needed zero
  changes. Applied the Phase 49 lesson proactively (explicit `drop function` before the `create or
  replace`, since a parameter was added). Two new, purely additive views
  (`item_current_stock_by_warehouse`, `item_batch_status_by_warehouse`) sit alongside the unchanged
  originals — `Inventory.jsx`/`Dashboard.jsx` both hard-depend on exactly one row per item, confirmed via
  a dedicated investigation before deciding not to touch those views' shape.
- **Real bug caught during Phase 56's own live-testing**: `Branches.jsx` (the missing branch/warehouse
  management screen this phase also had to build, since none existed at all) omitted `company_id` from
  its `branches`/`warehouses` inserts, silently relying on a column default that doesn't exist for those
  two tables — every other CRUD screen in this app (`ItemMaster.jsx`, etc.) explicitly sets
  `company_id: profile.company_id`. RLS correctly rejected the insert; caught by testing the exact
  RLS-scoped call an authenticated accountant session would make (not just a service-role bypass), fixed,
  and re-verified.
- **Phase 57**: `stock_transfers` — a "posted by default, cancellable" result entity (same shape as
  `wastage`/`production_entries`), created ahead of `approve_request()` per the Phase 51 lesson, applied
  proactively. Deliberately has no `entry_group_id` — moving stock between a company's own warehouses
  changes location, not value, so no journal entries are ever posted against it; the reversal
  (`cancel_stock_transfer()`) works purely off `stock_ledger`'s `reference_type`/`reference_id`, the same
  blind-replay pattern already proven by `cancel_invoice()`/`cancel_wastage()`. `approve_request()` got
  one new branch calling `_post_stock_transfer_core()`; no `reject_request()` change was needed, since
  (like most modules) nothing exists until final approval, so a plain rejection is already correct.
  Threshold basis: quantity transferred, not value (cost is only known once `consume_item_fefo()` runs) —
  kept a free tier at 0, like production/bank reconciliation, since routine inter-branch movement isn't
  exception-driven. `inventory_manager` got a new, precisely-named `stock_transfer.create` permission,
  matching the Phase 51/52 precedent.
- Tested live end-to-end against a genuine two-warehouse company (a throwaway accountant, an inventory
  manager, a COO, and a plain viewer): a small transfer (20 units, below the 500-unit threshold) posted
  immediately and correctly moved both quantity and cost, with the destination batch mirroring the
  source batch's exact `unit_cost`; **critically, a transfer requesting more than a specific warehouse
  actually held was rejected** — the whole point of Phase 56, proving the warehouse-scoped check is real
  and not just a label, while confirming the failed attempt left that warehouse's stock unchanged; a
  large transfer (600 units) correctly required COO approval, with self-approval and wrong-role attempts
  both blocked; cancellation correctly reversed both legs (source restored, destination reduced back to
  its pre-transfer level). All 16 checks passed on the second attempt — the first attempt's one failure
  was a wrong expected value in the test script itself (arithmetic error on my part, not an implementation
  bug), caught and corrected before re-running. Fixtures cleaned up afterward — this session's cleanup
  script initially missed reversal-leg journal entries (a real gap in the cleanup approach, not the
  schema) during Phase 56's own test, since it deleted by the *original* `entry_group_id` and missed the
  reversal's own new one; fixed by scoping deletion by item/company instead, and applied correctly from
  the start in Phase 57's cleanup. `trial_balance()` confirmed 0=0 after both phases' cleanup.
- **Scope deliberately left minimal, flagged rather than built**: `Branches.jsx` has no delete and no
  way to reassign which branch/warehouse is the default — just enough to make Phase 57 usable through the
  app instead of the Supabase Table Editor.

### Phases 59-63 — Role System Unification: Retire `users.role` ✅
- The user asked to merge the two parallel role systems this app had accumulated — `users.role` (the
  original 3-value `admin`/`accountant`/`viewer` enum from Week 1, the base "can this person write
  financial data" gate) and `user_app_roles` (Phase 38's 13 named business roles, used for approval-chain
  routing and, since Phase 47, a growing set of `role_permissions`-backed capability grants) — into one.
  Given the real scope (149 `current_user_role()` call sites across `supabase/schema.sql`, 50
  `profile.role` checks across 46 frontend files) and that this is access-control code — CLAUDE.md's
  strictest "never cut corners" category, where a mistake locks out real users in one direction or grants
  unauthorized write access in the other — this was scoped and executed as a full `EnterPlanMode`/
  `ExitPlanMode` plan, not an ad hoc edit.
- **The finding that shaped the whole design**: a parallel research pass (three Explore agents) found
  that `assign_user_role()`/`revoke_user_role()` — the only way to grant someone their first app_role —
  both require `current_user_can_manage_users()`, which was defined as `role = 'admin' and
  can_manage_users`. Deleting `role` outright with nothing to replace it would have meant the first user
  of a brand-new company could never be granted any role at all — a hard bootstrap deadlock. The fix: a
  standalone `users.is_admin` boolean (the actual superuser concept — it has no equivalent among the 13
  business roles, since it's an IT/system concept, not a business one), kept entirely separate from the
  business-role enum.
- The same research found a logical simplification: since `'viewer'` was the only third value in the old
  enum, `current_user_role() <> 'viewer'` and `current_user_role() in ('admin', 'accountant')` were always
  the same condition — collapsing 129 of the 149 call sites to one replacement predicate
  (`current_user_is_admin() or current_user_has_permission('ledger.write')`) instead of three separately-
  reasoned ones.
- **Phase 59** (foundation, zero behavior change): added `is_admin`, backfilled 1:1 from `role = 'admin'`;
  `current_user_can_manage_users()` redefined to read `is_admin` — one change that automatically fixed all
  8 of its downstream consumers; new permission key `ledger.write`, seeded to the `accountant` app_role
  only (the user's explicit choice over broadening it to the C-suite roles too, an exact 1:1 mirror of
  today's behavior). `role`/`can_manage_users` deliberately not dropped yet — every later phase kept an
  instant rollback path until the final cutover.
- **Phase 60** (the 129 write/visibility call sites): **a real correctness bug caught before it shipped** —
  the approved plan itself said 8 "already-broadened" RPCs (e.g. `submit_payroll_run`, gated as
  admin/accountant OR `payroll.prepare`) should have their old-role check swapped to bare
  `not current_user_is_admin()`. That would have silently dropped the accountant-equivalent bypass —
  an accountant who could run payroll today would suddenly need `payroll.prepare` specifically too. Fixed
  before any SQL was written: all 133 touched objects (83 RLS policies across 31 tables, 50 RPC functions)
  got the identical, correct swap, with each RPC's own extra permission check preserved as an additional
  OR, not a replacement. Also added a real data-migration backfill (`user_app_roles` gets an `accountant`
  row for any existing `role='accountant'` user) after checking the live database first — zero real users
  were actually affected today, but the migration is correct regardless of when one exists. Extracted the
  incremental migration directly from the now-correct `schema.sql` with a small script (not hand-assembled)
  specifically to avoid transcription errors at this scale.
- **Phase 61** (the remaining 14 genuinely admin-only call sites: `tax_rates`, `tds_rates`,
  `accounting_periods`, `gst_notification_log`, `audit_log`, `users_select`, `update_user_role`) —
  `current_user_role() = 'admin'`/`<> 'admin'` → `current_user_is_admin()`/`not current_user_is_admin()`,
  no `ledger.write` fallback (accountant was never part of these). Two of these
  (`add_audit_finding`/`resolve_audit_flag`) kept their `ca_auditor` OR-branch completely untouched.
  **Cleanup caught another near-miss**: an early draft of the cleanup script deleted `accounting_periods`
  scoped only by `company_id` — which would have wiped every real accounting period for the company, not
  just the test rows. Caught and fixed (scoped to the exact test period dates) before running.
- **Phase 62** (frontend): centralized `user_app_roles` fetching into `AuthContext` (`profile.is_admin`/
  `profile.app_roles`), replacing what used to be a separate per-page query on several pages. 43 of 46
  files got the mechanical swap via a script; 3 hybrid files (combining the base check with an extra
  specific role) hand-edited individually. **While verifying, found 4 more files**
  (`Approvals.jsx`, `ProjectDetail.jsx`, `PurchaseRequests.jsx`, `StockTransfers.jsx`) still running their
  own redundant `user_app_roles` query into local `myRoles` state — exactly the duplication centralizing
  this was meant to eliminate — and consolidated those too, beyond what the plan had explicitly called out.
- **Phase 63** (final cutover): `update_user_role()` replaced by `update_user_admin_status()` (same
  authority check, but the `p_role` parameter is gone — assigning a named business role is
  `assign_user_role()`'s/`revoke_user_role()`'s job, unchanged); `current_user_role()` removed;
  `users.role` column and the `user_role` enum type dropped for real. **The live run failed on the first
  attempt**: `DROP FUNCTION current_user_role()` hit `2BP01: other objects depend on it` — two
  `storage.objects` RLS policies (`attachments_storage_insert`/`_delete`, Supabase Storage bucket
  policies, a different Postgres schema entirely) still referenced it live. Root cause: Phase 60's
  extraction script only matched `create policy ... on public.<table>`, so it silently never generated a
  migration for these two policies — even though the same blind whole-file text replacement had already
  (correctly) updated `schema.sql`'s own copy of them, so the gap was invisible in the reference file and
  only surfaces against the live database. Confirmed the failed transaction had rolled back cleanly
  (nothing partially applied — `update_user_admin_status` didn't exist, `users.role` was still present),
  fixed by retroactively applying the missed policy migration first, then re-ran clean.
- Tested live end-to-end at every phase against throwaway users spanning every combination this migration
  needed to prove: an `is_admin`-only user (role never touched) bypassing everything; an `accountant`
  app-role holder (role left at `'viewer'`) getting full ledger write access purely from the new
  mechanism; the `payroll.prepare`/`purchase_request.create`/`production.create`/`stock_transfer.create`
  broadened gates still working for holders with neither `is_admin` nor `accountant`; the
  employee-visibility narrowing (`employees`/`attendance`/etc.) still correctly scoping a plain `employee`
  app-role holder to their own linked record while an accountant-equivalent sees everyone; a real Supabase
  Storage upload/delete cycle proving the retroactively-fixed policies work; and, finally, confirming
  `update_user_admin_status()`'s full authority chain (self-edit blocked, `can_manage_users` requires
  `is_admin`, a plain viewer blocked outright). A closing grep sweep confirmed zero remaining
  `current_user_role()`/`profile.role`/`public.user_role` references anywhere in the codebase — every hit
  left is a historical comment. `trial_balance()` confirmed 0=0 after every phase's cleanup.

**Deliberately flagged, not scheduled** (real scope decisions, not oversights):
- **Dynamic role creation** (a CTO builds custom roles by picking modules/actions/scope, sections
  24-26) — the 13-role model is a Postgres enum baked into `user_app_roles`, `approval_chain` (a jsonb
  array of role strings), and every RLS policy's role checks. Converting that into a fully dynamic
  role-builder is a major structural rewrite, not an incremental phase — only worth doing if a real
  need for ad hoc roles beyond the 13 actually emerges.
- **Marketing spend approval** — no campaigns/marketing-spend module exists in this app at all; nothing
  to gate.
- **A standalone "Inventory Adjustment" entity distinct from Wastage** — wastage already covers
  shrinkage/loss; a second, overlapping stock-adjustment entity wasn't a clear enough distinct need to
  justify building sight-unseen.

### Later (not in current scope)
- Multi-branch UI: branch switcher and consolidated multi-branch reports. Phase 20 makes the
  `branch_id` columns exist and populate correctly, but only one branch is active per company —
  build the switcher and cross-branch reporting once a second branch actually opens.
- Multi-user granular permissions beyond admin/accountant/viewer + `can_manage_users`
- E-invoicing (IRN/QR), e-way bills, TDS/TCS automation, auto GST 2A/2B reconciliation — all need
  a paid API/portal integration
- Multi-currency, multi-company, connected/online banking, WhatsApp integration — enterprise-scale,
  not needed at this business's scale
- Cheque clearing/bounce lifecycle, serial-number tracking, job-costing beyond the lightweight tag
  in Phase 11 — skip unless the business's shape changes (heavy cheque usage, etc.)

## 6. Infrastructure / Platform Checkpoints (time-sensitive)
- [x] **Checked 2026-09-05, before October 30, 2026**: resolved — this is not a dashboard setting.
      Existing tables (everything through Phase 25) keep their current implicit grants and stay
      reachable via PostgREST/the Data API indefinitely; nothing needs to change for them. The rule
      only applies to tables *created* on or after October 30, 2026 — those need explicit
      `grant select, insert, update, delete on <table> to authenticated; grant all on <table> to
      service_role;` statements in `schema.sql`, or PostgREST won't expose them. Phase 26 above
      adopts that as standing practice for every `create table` from here on.
- [x] **2026-09-05 — Migrated deployment from Vercel to Cloudflare Pages.** The 7 `api/*.js` Vercel
      serverless functions were rewritten as Cloudflare Pages Functions under `functions/api/*.js`
      (Web Fetch API style — `Request`/`Response`, `context.env` instead of `process.env` — rather
      than Node's `(req, res)` handler shape). Same `/api/...` URL paths, so nothing on the frontend
      changed. Two things needed real design decisions, not just a syntax port:
      - **Cron Triggers**: Cloudflare Pages Functions can't be triggered by Cron Triggers directly
        (Workers-only feature) — added a small standalone Worker, `cron-worker/`, whose only job is
        to ping the two scheduled endpoints with the `CRON_SECRET` bearer token on its own Cron
        Trigger schedule. The actual logic stays in the Pages Functions; the Worker is just the
        trigger.
      - **SPA routing**: initially added a `public/_redirects` file (`/* /index.html 200`), matching
        the classic advice for SPA fallback — but this collided with Cloudflare's default
        `.html`-stripping redirect behavior and produced a real redirect loop in `wrangler pages
        dev` testing, not just the CLI's own overly-aggressive "infinite loop" validation warning.
        Removed it entirely once testing showed classic Cloudflare Pages already serves `index.html`
        for any unmatched path with zero config, as long as there's no top-level `404.html` — the
        `_redirects` file was solving a problem that didn't exist and actively causing one.
      - `node:crypto`/`Buffer` usage (the GST-notification-checker's page hash, the
        email-PDF-attachment's base64 encoding) were rewritten against Web Crypto
        (`crypto.subtle.digest`) and a hand-rolled chunked `btoa()` encoder respectively, rather than
        enabling the `nodejs_compat` flag — avoids a platform-compat dependency for something this
        small.
      - Verified live via `wrangler pages dev`: confirmed all 7 endpoints route and return correct
        status codes/bodies (including the cron-guard 401s and a GET-vs-POST-only 405 added to match
        the original Vercel handlers' explicit method check, which Cloudflare doesn't enforce
        automatically), confirmed the SPA fallback serves the app shell on a deep route with no
        redirect, and confirmed the companion Worker's `wrangler deploy --dry-run` compiles cleanly.
      - `vercel.json` and `api/` removed; added `wrangler.toml` (Pages project config),
        `cron-worker/` (Worker + its own `wrangler.toml`), and `wrangler` as a dev dependency with
        `npm run cf:dev` / `npm run cf:deploy` scripts. See `README.md` for the full deploy steps.
- [x] **2026-09-05 — `users.role` is now a Postgres enum, not text+check.** Purely so the Supabase
      Table Editor renders it as a dropdown when an admin promotes/demotes someone (still the only
      way role is changed — no in-app UI for it). `current_user_role()` now explicitly casts
      `role::text` on the way out, so every existing caller comparing it to a string literal
      ('admin'/'accountant'/'viewer') is unaffected. Live migration hit two real Postgres gotchas
      worth remembering for any future column-type change on a table with RLS: (1) an existing
      `default` on the column must be dropped before the `alter column type`, not left in place —
      Postgres tries to auto-cast the old default along with the column and fails
      ("default for column... cannot be cast automatically"); (2) an existing `check` constraint
      referencing that column must also be dropped *before* the type change, not after — its
      expression has the comparison literals baked in at their original type, so leaving it attached
      through the rewrite throws "operator does not exist: user_role = text". The `users_select` RLS
      policy (the only one on this table) was dropped and recreated identically around the change
      as a precaution. Verified live: all 5 real user rows kept their correct role values, an invalid
      role value is now rejected structurally by the enum, and a normal update still succeeds.
- [x] **2026-09-05 — Corrected the Cloudflare migration above: this account's "lseite-erp" project
      turned out to be a plain Cloudflare Worker with a static-assets binding (the unified
      Workers+assets model), not the classic Pages project everything above was built against.**
      Symptoms that led to this: `wrangler pages deploy` reported "The project you specified does
      not exist" for a project the dashboard clearly showed as live; the deployed URL was
      `*.workers.dev`, not `*.pages.dev`; the dashboard showed "Bindings" and "Trigger events" tabs
      (Worker-specific, not present on classic Pages); and `functions/api/*.js` were silently never
      actually serving requests in production (confirmed by directly curling a live endpoint and
      getting the SPA's HTML back instead of JSON) even though local `wrangler pages dev` testing
      had looked correct throughout. Confirmed definitively via `wrangler deployments list --name
      lseite-erp` succeeding against the Workers API.
      - Replaced `wrangler.toml`'s `pages_build_output_dir` with `main = "worker.js"` +
        `[assets] directory = "./dist"` + `not_found_handling = "single-page-application"` (the
        Workers-with-assets equivalent of Pages' automatic SPA fallback).
      - Added `worker.js`: a single entry point whose `fetch()` dispatches `/api/*` paths to the
        exact same `functions/api/*.js` modules by calling their `onRequestGet`/`onRequestPost`/
        `onRequest` exports directly (those files needed zero changes — they're just plain exported
        functions either way), falling back to `env.ASSETS.fetch(request)` for everything else.
      - **Removed `cron-worker/` entirely** — a real Worker can have `[triggers]` Cron Triggers
        directly in its own `wrangler.toml`, so `worker.js`'s own `scheduled()` handler now runs the
        two cron routes itself (building a synthetic authorized `Request` so the routes' own
        `Authorization: Bearer <CRON_SECRET>` check doesn't need to be forked/duplicated). Simpler
        than the previous two-deployable design, not just a fix — one project to manage, one set of
        secrets, no separate companion deploy pipeline.
      - `package.json`'s `cf:dev`/`cf:deploy` scripts now call plain `wrangler dev`/`wrangler deploy`
        instead of the `pages` subcommands.
      - Verified live via `wrangler dev`: rebuilt `dist/`, confirmed all `/api/*` routes return
        correct status codes/bodies, confirmed the SPA fallback serves the app shell on a deep route,
        and confirmed the scheduled handler runs correctly via wrangler's local
        `/cdn-cgi/local/scheduled` trigger endpoint — which, since it used the real `.env` Supabase
        credentials, actually exercised the real check-gst-notifications/generate-subscription-cycles
        logic against the live database; confirmed via direct query that this inserted one harmless,
        correctly-shaped `gst_notification_log` row (exactly its normal periodic behavior) and created
        no subscription cycles (0 active subscriptions existed at the time) — no cleanup needed.
- [x] **2026-09-05 — Manage Users page can now change role/can_manage_users directly** (previously
      Supabase Table Editor-only). New `update_user_role(p_user_id, p_role, p_can_manage_users)`
      RPC — `users` still has no client-side UPDATE policy, so this SECURITY DEFINER function is the
      only write path, redoing the caller's admin+`can_manage_users` check itself. Guards: a caller
      can never edit their own row (would risk the last admin locking themselves out of user
      management entirely, with no one left to undo it — still only fixable via the Table Editor);
      `can_manage_users = true` is rejected unless `role = 'admin'` (it has no effect otherwise, so
      silently allowing the combination would just be confusing); the target must belong to the
      caller's own company. `ManageUsers.jsx` got a new list below the existing create/reset form —
      inline role dropdown + checkbox per row, disabled on the caller's own row, admin-with-
      `can_manage_users`-gated same as the rest of the page.
  - **This surfaced a real, live-breaking regression from the role-enum migration above**:
    `handle_new_auth_user()`'s `case when is_first_user then 'admin' else 'viewer' end` broke ALL
    new sign-ups. A `CASE` expression over two unknown-typed string literals resolves its overall
    type to `text`, not `unknown` — unlike a single bare literal, that does NOT pick up an
    assignment cast to the target enum column automatically, and fails with "column is of type
    user_role but expression is of type text". Caught by the very first throwaway-user creation in
    this feature's own test, not by chance — but it means real sign-ups were broken for however
    long between the previous entry's migration and this fix. Fixed by explicitly casting the whole
    `CASE` expression to `::public.user_role`. Verified live afterward with a real
    `auth.admin.createUser()` call, confirming the auto-created profile row gets `role='viewer'`
    correctly again.
  - Tested live end-to-end across 5 throwaway users (2 companies): confirmed a same-company
    admin-with-`can_manage_users` can promote another user; confirmed self-edit, an invalid role
    value, `can_manage_users=true` with a non-admin role, a caller who is admin but lacks
    `can_manage_users`, a plain viewer caller, and a cross-company target are all rejected with
    clear errors; confirmed a full promotion to admin+`can_manage_users` succeeds. Full cleanup
    afterward; the 5 real user rows confirmed unchanged; `trial_balance()` confirmed 0=0.

## 7. Compliance Checkpoints (do not skip)
- [ ] Have a CA review the chart of accounts after Week 1
- [ ] Have a CA review the GST calculation logic (CGST/SGST/IGST rules) after Week 1–2
- [ ] Confirm current e-invoicing turnover threshold before assuming Phase "Later" isn't needed yet
- [ ] Check PF/ESI applicability rules with a CA before relying on the payroll module for compliance filings
- [ ] Confirm FSSAI food-license and other food-manufacturing-specific compliance requirements with
      a CA/compliance professional — these are outside GST entirely and outside what this software
      (or TallyPrime's generic feature set) models at all

## 8. Coding Agent Setup
This project uses **CLAUDE.md** (in the project root) to keep Claude Code on scope and prevent scope creep or over-engineering. See that file for working rules.

This project also uses the **ponytail** plugin for Claude Code to keep the codebase minimal and avoid unnecessary dependencies/abstractions. Install it once, from inside Claude Code:
```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```
No config file needed. It stays active every session.
