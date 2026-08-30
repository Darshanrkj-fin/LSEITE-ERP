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

Every phase below (Week 1 through Phase 19) is **built and live-tested**. This includes the full
plan from the original TallyPrime feature-gap review — see section 5 for what each phase covers.
Only the "Later" items at the end of section 5 remain, and only if the business's shape changes.

## 1. Tech Stack (all free-tier)
| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Tailwind, hosted on Vercel | Free, no cold starts |
| Backend | Vercel Serverless Functions (Node.js) | Same platform as frontend, free tier |
| Database | Supabase (Postgres) | Free tier, built-in Auth |
| Auth | Supabase Auth | Multi-user ready from day 1 |
| PDF generation | `pdf-lib` | Free, open-source, already in use |
| Scheduled jobs | Vercel Cron Jobs (free tier) | GST notification checker, subscription cycle generator (both built) |
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

## 5. Phased Build Plan — Phases 13–18 (from the TallyPrime feature-gap review)

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
feature-gap review. Only the items below remain, and only if the business's shape changes.

### Later (not in current scope)
- Multi-branch (`branch_id` column across tables, consolidated reports)
- Multi-user granular permissions beyond admin/accountant/viewer + `can_manage_users`
- E-invoicing (IRN/QR), e-way bills, TDS/TCS automation, auto GST 2A/2B reconciliation — all need
  a paid API/portal integration
- Multi-currency, multi-company, connected/online banking, WhatsApp integration — enterprise-scale,
  not needed at this business's scale
- Godown/warehouse management, cheque clearing/bounce lifecycle, serial-number tracking, job-costing
  beyond the lightweight tag in Phase 11 — skip unless the business's shape changes (multiple
  locations, heavy cheque usage, etc.)

## 6. Compliance Checkpoints (do not skip)
- [ ] Have a CA review the chart of accounts after Week 1
- [ ] Have a CA review the GST calculation logic (CGST/SGST/IGST rules) after Week 1–2
- [ ] Confirm current e-invoicing turnover threshold before assuming Phase "Later" isn't needed yet
- [ ] Check PF/ESI applicability rules with a CA before relying on the payroll module for compliance filings
- [ ] Confirm FSSAI food-license and other food-manufacturing-specific compliance requirements with
      a CA/compliance professional — these are outside GST entirely and outside what this software
      (or TallyPrime's generic feature set) models at all

## 7. Coding Agent Setup
This project uses **CLAUDE.md** (in the project root) to keep Claude Code on scope and prevent scope creep or over-engineering. See that file for working rules.

This project also uses the **ponytail** plugin for Claude Code to keep the codebase minimal and avoid unnecessary dependencies/abstractions. Install it once, from inside Claude Code:
```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```
No config file needed. It stays active every session.
