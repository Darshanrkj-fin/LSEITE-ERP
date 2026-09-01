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

Every phase through Phase 19 is **built and live-tested** — see section 5 for what each covers.
Phases 20–24 (section 5b) are planned and under active construction: multi-branch schema
readiness, quote management, expanded customer fields, advance/deposit payments, and a cohesive
visual design system, drawn from a follow-up gap review. Only the "Later" items after section 5b
remain out of scope beyond that, and only if the business's shape changes.

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

### Phase 22 — Customer Management Enhancements
- Adds `phone`, `billing_address`, `shipping_address` to `parties` — nullable, loosely validated
  contact/logistics fields, not financial data. Party Master's form/list updated to show and edit
  them.

### Phase 23 — Advance/Deposit Payments (optional, per custom order)
- Not every custom order needs this — modeled as something staff can optionally attach, not a
  mandatory step. An advance is a **liability** (the company owes goods or a refund) until the
  final invoice is raised — it must never post straight to Accounts Receivable.
- New system account role `customer_advances` (liability), seeded alongside the existing 13 system
  accounts. New `customer_advances` table (company_id, custom_order_id, party_id, amount,
  bank_account_id, advance_date, status: unapplied/applied/refunded, applied_invoice_id,
  entry_group_id).
- `post_customer_advance()` debits the chosen bank/cash account and credits `customer_advances` —
  balances independently of any invoice.
- `apply_advance_to_invoice(p_advance_id, p_invoice_id)` debits `customer_advances` and credits
  Accounts Receivable for that invoice — kept as its own function rather than overloading
  `post_payment()`'s meaning, since no new cash actually moves at apply-time.
- `refund_customer_advance()` reverses the original posting (never edits it), for a custom order
  that falls through after a deposit was taken.
- UI: an optional "Advance Payment" action on `CustomOrders.jsx`'s detail view; any unapplied
  advance shows as a selectable credit when raising the final invoice for that custom order.

### Phase 24 — Design System / UI Polish (do last — cosmetic, touches no business logic)
- Grounded in the actual Lseite logo (navy → teal/sage gradient mandala, gold accent ring, serif
  "Lseite" wordmark) rather than default Tailwind gray — a global token fix, not a page-by-page
  redesign or a framework swap.
- New CSS custom properties for ink/teal/sage/gold/clay/paper/mist/line/muted colors and a
  Fraunces (display) / Inter (sans) font pairing, applied via a global find/replace pass: page
  `<h1>` titles get the display serif + ink color, secondary text goes muted, error text goes clay,
  success/pending status badges get teal/gold tints, the sidebar goes ink with a teal left-border
  on the active nav item.
- Dense data tables are left structurally as-is — just the gray-scale tokens swap. No shadows on
  every card, no ALL-CAPS stat labels, no decorative gradients spread across every table cell.

Only the items below remain after Phase 24, and only if the business's shape changes.

### Later (not in current scope)
- Multi-branch UI: branch switcher and consolidated multi-branch reports. Phase 20 makes the
  `branch_id` columns exist and populate correctly, but only one branch is active per company —
  build the switcher and cross-branch reporting once a second branch actually opens.
- Multi-user granular permissions beyond admin/accountant/viewer + `can_manage_users`
- E-invoicing (IRN/QR), e-way bills, TDS/TCS automation, auto GST 2A/2B reconciliation — all need
  a paid API/portal integration
- Multi-currency, multi-company, connected/online banking, WhatsApp integration — enterprise-scale,
  not needed at this business's scale
- Godown/warehouse management, cheque clearing/bounce lifecycle, serial-number tracking, job-costing
  beyond the lightweight tag in Phase 11 — skip unless the business's shape changes (multiple
  locations, heavy cheque usage, etc.)

## 6. Infrastructure / Platform Checkpoints (time-sensitive)
- [ ] **Before October 30, 2026**: Supabase is requiring explicit Postgres grants for
      PostgREST/Data-API access on free-tier projects from that date. Since this app talks to
      Supabase entirely through `supabase-js` (which goes through PostgREST), check the Supabase
      dashboard for whether this project needs the grants added, and add them ahead of the
      deadline — otherwise the API can stop serving requests. A settings check, not development
      work — doesn't need to wait for the phase order above.

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
