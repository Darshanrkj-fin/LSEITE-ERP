# LSEITE ERP

A GST-compliant finance and operations system built for a bakery-style manufacturer that has grown
into a multi-line business: manufacturing (raw materials → production → finished goods), a cloud
kitchen taking Swiggy/Zomato-style orders, a physical store, recurring subscriptions, custom
orders, and a consulting practice billed by timesheet. Built for one company's internal use.

Covers sales & purchase invoicing with GST, inventory and batch/expiry tracking, manufacturing and
R&D trials, delivery-platform settlement reconciliation, project/consulting billing, bank
reconciliation, fixed assets and depreciation, payroll and HR basics (departments, attendance,
leave), TDS tracking, document attachments, an audit log, double-entry accounting reports, GST
summary reports, and a management dashboard.

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

The first user to sign up (via Supabase Auth) automatically becomes an admin for a new company —
see `handle_new_auth_user()` / `bootstrap_company()` in the schema for details.

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
