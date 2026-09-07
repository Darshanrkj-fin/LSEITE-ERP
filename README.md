# LSEITE ERP

A GST-compliant finance and operations system built for a bakery-style manufacturer that has grown
into a multi-line, multi-branch business: manufacturing (raw materials → production → finished
goods), a cloud kitchen taking Swiggy/Zomato-style orders, a physical store, recurring
subscriptions, custom orders, and a consulting practice billed by timesheet. Built for one
company's internal use, with real multi-branch/multi-warehouse operation (not just schema
readiness — see "Branches, warehouses & stock transfers" below).

Covers sales & purchase invoicing with GST, inventory and batch/expiry tracking across multiple
warehouses, manufacturing and R&D trials, delivery-platform settlement reconciliation,
project/consulting billing, bank reconciliation, fixed assets and depreciation, payroll and HR
basics (departments, attendance, leave), TDS tracking, document attachments, an audit log,
double-entry accounting reports, GST/TDS summary reports and return-filing sign-off, a CA/audit
review loop, and a management dashboard — with a full role-based approval workflow layer (13 named
business roles, granular permissions, and configurable multi-step approval chains) gating every
module above a company-configured amount/quantity threshold.

See [`ROADMAP.md`](ROADMAP.md) for the full build plan and phase-by-phase history, and
[`CLAUDE.md`](CLAUDE.md) for the working rules this codebase is built under (non-negotiable
double-entry accounting, GST rates never hardcoded, compliance judgment calls always flagged to a
CA rather than decided in code).

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | No component/icon library — hand-built |
| Backend | A single Cloudflare Worker with static assets | One deployable — `worker.js` dispatches `/api/*` to the route modules under `functions/api/`, and serves everything else from the built frontend via the `[assets]` binding |
| Database | Supabase (Postgres + Auth + Row-Level Security) | Free tier |
| PDF generation | `pdf-lib` | Invoices, payslips, quotes, report exports |
| Scheduled jobs | The same Worker's own Cron Triggers | `worker.js`'s `scheduled()` handler runs the GST-notification-checker/subscription-cycle-generator routes directly on schedule — no separate deployment |
| Email | Resend | Only the invoice "Email PDF" action |

No paid APIs, no ORM — plain `@supabase/supabase-js` queries and Postgres RPC calls. Almost all
financial logic (GST splitting, invoice posting/cancellation, production costing, payroll posting)
lives in `SECURITY DEFINER` Postgres functions in `supabase/schema.sql`, not in application code —
so the double-entry and GST-correctness guarantees hold even if something bypasses the UI. A
deferred trigger rejects any transaction where debits ≠ credits within the same posting group.

## Project structure

```
worker.js             The Worker's entry point — routes /api/* to functions/api/, serves assets otherwise
src/                  React frontend (pages, components, contexts, lib helpers)
functions/api/        Route modules (PDF generation, email, cron endpoints, user admin) — plain
                      exported functions, dispatched to by worker.js (not Pages' file-based routing)
lib/                  Shared backend helpers used by functions/ and scripts/
scripts/              One-off Node scripts (e.g. manage-user.js)
supabase/schema.sql   The full database schema — single source of truth, applied top to bottom
supabase/tests/       Standalone SQL assertion scripts for core financial calculations
```

## Authorization: roles, permissions & approval workflows

Every account has exactly one binary superuser flag — **`is_admin`** — plus zero or more of **13
named business roles**, and every RLS policy and RPC in the schema is gated by one or both of
those, never by a generic "role" enum. This is deliberate, not incidental: a person's authority to
*write financial data at all* (is_admin, or holding a role with the right permission grant) is a
completely separate axis from *which specific business hierarchy they sit in* (CFO, kitchen
manager, inventory manager, ...), and the two used to be conflated in a single `users.role`
column (`admin`/`accountant`/`viewer`) before that was retired in favor of this model.

- **`is_admin`** (`users.is_admin`) — the superuser bypass. Automatically `true` for the very first
  person to sign up for a new company (see `handle_new_auth_user()`); everyone after starts with no
  elevated access until an existing admin grants it. A second, narrower flag,
  **`can_manage_users`**, gates specifically the ability to create/reset user accounts and change
  another user's `is_admin`/`can_manage_users` status (Manage Users page) — deliberately decoupled
  from `is_admin` itself, so "can write anywhere" and "can administer other accounts" aren't the
  same permission.
- **`user_app_roles`** — a many-to-many table: one person can hold any number of the 13 roles
  (`ceo`, `cfo`, `coo`, `cmo`, `cto`, `accountant`, `ca_auditor`, `hr_payroll`, `kitchen_manager`,
  `inventory_manager`, `project_manager`, `employee`, `viewer`) at once. Assigned via the **Roles &
  Permissions** page (admin + `can_manage_users` only), never self-service.
- **`role_permissions`** — a small, explicit, global (not per-company) table of `(app_role,
  permission_key)` grants, read via `current_user_has_permission(key)`. This is how a specific role
  gets authority over a specific action without inheriting blanket write access — e.g.
  `inventory_manager` holds `stock_transfer.create` and `purchase_request.create`, but nothing else;
  `hr_payroll` holds `payroll.prepare`. The broad "day-to-day financial write" grant
  (`ledger.write`) is seeded to `accountant` only.
- **`approval_rules` / `approval_requests`** — the generic approval-chain engine every gated module
  shares. A company configures, per entity type, one or more amount/quantity tiers, each naming an
  ordered list of roles that must sign off in sequence (e.g. "under ₹50,000: no approval needed;
  ₹50,000+: `cfo` then `ca_auditor`"). Submitting a gated action either posts immediately (if the
  resolved chain is empty) or creates a pending `approval_requests` row that walks the chain one
  role at a time via `approve_request()`/`reject_request()` — the same two functions for every
  module. A person can never approve their own submission (separation of duties), and the actual
  posting logic only ever runs once, at the final approval step, calling the same internal
  `_core()` function the immediate-post path uses — so there's exactly one code path per module
  that can touch the ledger, approved or not.
- **Gated modules** (each with its own threshold basis — amount, quantity, or discount %, since
  cost/value isn't always known before the underlying stock/costing logic actually runs): fixed
  asset capitalization, payroll runs, purchase invoices, sales-invoice discounts, wastage write-offs,
  project/consulting invoicing, expense claims, technology access requests, manual credit/debit
  notes, purchase requests → orders, production entries, bank reconciliation, GST returns, TDS
  returns, and inter-branch stock transfers.
- **CA/Audit review loop** — a structurally different feature, not a gate: an accountant or
  `ca_auditor` can flag any already-posted record or an entire date range for review
  (`audit_flags`/`audit_findings`), record findings as an investigation proceeds, and sign off —
  without ever blocking or reversing the thing being reviewed. This is a trail alongside the
  ledger, not a control in front of it.

## Branches, warehouses & stock transfers

Multi-branch was schema-ready from early on but not actually load-bearing until a genuine
warehouse-aware stock retrofit: `stock_ledger`/`item_batches` now carry a real, always-populated
`warehouse_id`, and `consume_item_fefo()` (the shared FEFO costing engine behind every sale,
wastage entry, production run, and R&D trial) can scope consumption to one specific warehouse and
optionally mirror the consumed slice into a destination warehouse — the actual mechanic behind
**inter-branch stock transfers**, a full request/approval/cancellation workflow (`stock_transfers`)
built on top of it. Two new, purely additive per-warehouse views
(`item_current_stock_by_warehouse`, `item_batch_status_by_warehouse`) sit alongside the original,
still company-wide `item_current_stock`/`item_batch_status` views the Inventory/Dashboard pages
already depended on. Branches and their warehouses are managed from the **Branches & Warehouses**
page.

## Getting started

### Prerequisites
- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier is enough)
- A [Cloudflare](https://dash.cloudflare.com/sign-up) account (free tier is enough) if you intend to deploy

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in the values:
```bash
cp .env.example .env
```
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from your Supabase project settings.
- `SUPABASE_SERVICE_ROLE_KEY` — **server-side only**, never exposed to the frontend. Used by `functions/api/*.js` and `scripts/*.js`.
- `CRON_SECRET` — a random string; `worker.js`'s `scheduled()` handler sends it as a bearer token to the two cron routes, so they can verify the call actually came from the platform's own scheduler and not a public request.
- `RESEND_API_KEY` / `GST_ALERT_FROM_EMAIL` — only needed for the "Email PDF" action on invoices.
- `GST_NOTIFICATION_SOURCE_URL` — the page the GST-notification checker watches for changes.

### 3. Set up the database
In the Supabase SQL Editor, run the entire contents of [`supabase/schema.sql`](supabase/schema.sql)
against a fresh project. It creates every table, function, trigger, RLS policy, and the Storage
bucket used for document attachments, in one pass.

The first user to sign up (via Supabase Auth) automatically becomes an admin (`is_admin = true`,
`can_manage_users = true`) for a new company — see `handle_new_auth_user()` / `bootstrap_company()`
in the schema for details. Everyone who signs up after that starts with no elevated access at all;
the admin assigns named business roles (accountant, CFO, kitchen manager, ...) and their
permissions from the **Roles & Permissions** page, and can promote another account to admin from
**Manage Users** — see "Authorization: roles, permissions & approval workflows" above.

### 4. Run the dev server
```bash
npm run dev
```
This runs the frontend standalone via Vite; `/api/*` isn't served this way. To exercise the Worker
locally too (routes + static assets together, exactly as Cloudflare serves them in production), use:
```bash
npm run cf:dev
```
which builds the frontend, then runs `wrangler dev` (reads env vars from your `.env` automatically).

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (frontend only) |
| `npm run cf:dev` | Build, then run the whole Worker locally via `wrangler dev` |
| `npm run build` | Production build |
| `npm run cf:deploy` | Build, then deploy (`wrangler deploy`) |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | Run `oxlint` |

## Deployment

Deployed as a single Cloudflare Worker: `worker.js` is the entry point, `[assets]` in `wrangler.toml`
points at the built `dist/` directory with `not_found_handling = "single-page-application"` (the SPA
fallback for client-side routing), and `functions/api/*.js` are dispatched to by path from
`worker.js` rather than relying on Cloudflare Pages' file-based routing. `/api/*` URLs are unchanged
from the old Vercel setup, so nothing on the frontend needed to change.

1. **Log in once**: `npx wrangler login`.
2. **Deploy**: `npm run cf:deploy` (builds, then `wrangler deploy`).
3. **Set environment variables**: Cloudflare dashboard → Workers & Pages → this project → Settings
   → Variables and Secrets. Add every value from `.env` — mark `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET`, and `RESEND_API_KEY` as **secrets**, not plain text. Only `NEXT_PUBLIC_SUPABASE_URL`
   / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are meant to reach the browser (see `vite.config.js`'s
   `envPrefix`) — everything else stays server-side. Redeploy once after adding them.
4. **Cron Triggers** are configured in `wrangler.toml` (`[triggers]`) and take effect automatically
   on deploy — no separate setup. You can trigger them manually to verify without waiting for the
   real schedule: `curl -X POST https://<your-worker-url>/api/check-gst-notifications -H "Authorization: Bearer <CRON_SECRET>"`.

## Further reading

- [`ROADMAP.md`](ROADMAP.md) — the full phased build plan, schema-at-a-glance, and a running log of
  what's been built and tested.
- [`CLAUDE.md`](CLAUDE.md) — working rules for anyone (human or AI) extending this codebase.

## License

MIT — see [`LICENSE`](LICENSE).
