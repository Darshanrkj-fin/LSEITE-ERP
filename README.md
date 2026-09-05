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
| Backend | Cloudflare Pages Functions (Workers runtime, ESM) | Thin — most logic lives in Postgres |
| Database | Supabase (Postgres + Auth + Row-Level Security) | Free tier |
| PDF generation | `pdf-lib` | Invoices, payslips, quotes, report exports |
| Scheduled jobs | A companion Cloudflare Worker with Cron Triggers | Pings the GST-notification-checker and subscription-cycle-generator Functions on schedule — Pages Functions can't be triggered by Cron Triggers directly, so this tiny Worker (`cron-worker/`) is a separate deploy whose only job is the trigger |
| Email | Resend | Only the invoice "Email PDF" action |

No paid APIs, no ORM — plain `@supabase/supabase-js` queries and Postgres RPC calls. Almost all
financial logic (GST splitting, invoice posting/cancellation, production costing, payroll posting)
lives in `SECURITY DEFINER` Postgres functions in `supabase/schema.sql`, not in application code —
so the double-entry and GST-correctness guarantees hold even if something bypasses the UI. A
deferred trigger rejects any transaction where debits ≠ credits within the same posting group.

## Project structure

```
src/                  React frontend (pages, components, contexts, lib helpers)
functions/api/        Cloudflare Pages Functions (PDF generation, email, cron endpoints, user admin)
cron-worker/          A separate, tiny Cloudflare Worker that triggers the two cron endpoints above
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
- `CRON_SECRET` — a random string; the companion `cron-worker/` sends it as a bearer token so these two endpoints can verify the caller. Set the same value in both places (see Deployment below).
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
This runs the frontend standalone via Vite; `functions/api/*.js` isn't served this way. To exercise
the Functions locally too, use:
```bash
npm run cf:dev
```
which runs `wrangler pages dev` proxying to the Vite dev server, serving `functions/api/*` exactly
as Cloudflare would in production (reads env vars from your `.env` automatically).

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server (frontend only) |
| `npm run cf:dev` | Frontend + `functions/api/*` together, via `wrangler pages dev` |
| `npm run build` | Production build |
| `npm run cf:deploy` | Build, then deploy to Cloudflare Pages (`wrangler pages deploy`) |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | Run `oxlint` |

## Deployment

Deployed as a static frontend + Cloudflare Pages Functions, both from this one repo. Client-side
routing (React Router) works with zero extra config — classic Cloudflare Pages serves `index.html`
for any path that doesn't match a real file or a Function, as long as there's no top-level
`404.html`. `functions/api/*.js` map directly to `/api/*` URLs, the same paths the Vercel functions
used to serve, so nothing on the frontend needed to change.

1. **Deploy the main app**: connect this repo in the Cloudflare dashboard (Workers & Pages → Create
   → Pages), or run `npm run cf:deploy` from the CLI. Build command `npm run build`, output
   directory `dist`. Set every variable from `.env` in the project's Settings → Environment
   variables — `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` must never be prefixed `NEXT_PUBLIC_`
   or otherwise exposed to the client bundle (only `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` are meant to reach the browser — see `vite.config.js`'s
   `envPrefix`).
2. **Deploy the cron trigger**: from `cron-worker/`, run `wrangler deploy`. Set
   `PAGES_URL` in `cron-worker/wrangler.toml` to your deployed Pages URL, and set the Worker's own
   `CRON_SECRET` secret (`wrangler secret put CRON_SECRET`, run from inside `cron-worker/`) to the
   **exact same value** as the Pages project's `CRON_SECRET` env var — that's what lets the Pages
   Functions verify the call actually came from the scheduled Worker and not the public internet.

## Further reading

- [`ROADMAP.md`](ROADMAP.md) — the full phased build plan, schema-at-a-glance, and a running log of
  what's been built and tested.
- [`CLAUDE.md`](CLAUDE.md) — working rules for anyone (human or AI) extending this codebase.

## License

MIT — see [`LICENSE`](LICENSE).
