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

Only the "Later" items after section 5d remain out of scope, and only if the business's shape
changes.

## 1. Tech Stack (all free-tier)
| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Tailwind, hosted on Cloudflare Pages | Free, no cold starts |
| Backend | Cloudflare Pages Functions (Workers runtime) | Same platform as frontend, free tier |
| Database | Supabase (Postgres) | Free tier, built-in Auth |
| Auth | Supabase Auth | Multi-user ready from day 1 |
| PDF generation | `pdf-lib` | Free, open-source, already in use |
| Scheduled jobs | A companion Cloudflare Worker with Cron Triggers (free tier) | Pages Functions can't be triggered by Cron Triggers directly, so a tiny separate Worker (`cron-worker/`) pings the GST notification checker and subscription cycle generator on schedule |
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
