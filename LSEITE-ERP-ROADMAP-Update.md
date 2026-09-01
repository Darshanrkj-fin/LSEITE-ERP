# LSEITE ERP — Roadmap Update (Phases 20–24)

This is a single consolidated addition to your existing `ROADMAP.md`, written in the same phased
format as Phases 1–19. Hand this file to Claude Code alongside the existing `ROADMAP.md` and
`CLAUDE.md` — it should append these as new phases and follow the same build discipline (stay on
roadmap, build in order, don't introduce new tools without flagging, ask before assuming).

**Decisions already made, so Claude Code shouldn't re-ask:**
- Stack stays Vercel + Supabase (Postgres) — **no Oracle VM, no self-hosting**. Original idurar/AntD
  plan is fully retired.
- **AntD is dropped.** Stay on Tailwind. Apply the design system in Phase 24 instead of a framework swap.
- **Offline support is out of scope.** Was considered as a safety net, not needed — don't build it.
- Nothing gets removed from what's already built (confirmed: keep R&D trials, Fund/Cash Flow
  reports, Audit Log, Subscriptions, Bank Reconciliation auto-suggest — all stay).

---

## Phase 20 — Multi-branch schema retrofit (do this first)

**Why first:** every table/function built after this point should carry `branch_id` from day one.
Retrofitting after more tables exist is expensive; doing it now is cheap.

- New `branches` table (`id`, `company_id`, `name`, `state_code`, `is_default`). Seed one branch per
  existing company, `is_default = true`.
- Add nullable `branch_id uuid references public.branches(id)` to: `invoices`, `payments`, `quotes`
  (once Phase 21 exists), `employees`, `payroll_runs`, `production_entries`, `custom_orders`,
  `subscriptions`.
- Default every new row to the company's default branch (trigger or application-level default) so
  nothing breaks with a single branch today.
- **No branch-switcher UI yet** — that's a later phase, only build it when branch 2 actually opens.
  This phase is purely "make the column exist and get populated correctly."

---

## Phase 21 — Quote Management (was fully missing from original spec)

**Workflow:** customer asks for a price → formal quote sent → customer accepts → becomes an invoice.

### Schema
```sql
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id),
  party_id uuid not null references public.parties (id),
  quote_number text not null,
  financial_year text not null,
  quote_date date not null,
  valid_until date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  converted_invoice_id uuid references public.invoices (id),
  subtotal numeric(14,2) not null default 0,
  cgst_total numeric(14,2) not null default 0,
  sgst_total numeric(14,2) not null default 0,
  igst_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  custom_order_id uuid references public.custom_orders (id),
  created_at timestamptz not null default now(),
  constraint quotes_unique_number unique (company_id, financial_year, quote_number)
);

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id),
  item_id uuid not null references public.items (id),
  hsn_sac_code text not null,
  quantity numeric(14,2) not null,
  rate numeric(14,2) not null,
  taxable_value numeric(14,2) not null,
  tax_rate numeric(5,2) not null,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);

create table public.quote_number_counters (
  company_id uuid not null references public.companies (id),
  financial_year text not null,
  next_number int not null default 1,
  primary key (company_id, financial_year)
);
```

### Functions
- `post_quote(...)` — mirrors `post_invoice()`'s validation, calls the existing
  `resolve_tax_rate()`/`calculate_gst_split()` (never duplicate the tax math), writes to
  `quotes`/`quote_line_items` only — no journal entries, a quote has no accounting impact until converted.
- `convert_quote_to_invoice(p_quote_id uuid)` — validates `status = 'accepted'` and not already
  converted, calls the existing `post_invoice()` with the quote's line items, sets
  `quotes.converted_invoice_id`, flips status to `converted`. Reuses invoice posting — doesn't reimplement it.
- Quote PDF reusing `lib/invoicePdf.js`'s pattern, labeled "QUOTATION," no invoice number field.
- Numbering: reuse `financial_year_for()`, prefix `QT/FY/00001`, separate counter table so quote and
  invoice numbers never collide.

### UI
New `Quotes.jsx` (list + status filter) + `QuoteForm.jsx` structured like `InvoiceForm.jsx`. "Convert
to Invoice" button on accepted quotes, admin/accountant only (existing authorization pattern).

---

## Phase 22 — Customer Management enhancements

```sql
alter table public.parties add column phone text;
alter table public.parties add column billing_address text;
alter table public.parties add column shipping_address text;
```
Nullable, loosely validated — contact/logistics data, not financial data.

---

## Phase 23 — Advance/deposit payments (optional, per custom order)

Not every custom order needs this — model as something staff can optionally attach, not mandatory.
An advance is a **liability** (you owe goods or a refund) until the final invoice is raised — it must
not post straight to Accounts Receivable.

### Schema
```sql
-- New system_role: 'customer_advances' (liability), seeded alongside the existing 13 system accounts
create table public.customer_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  custom_order_id uuid not null references public.custom_orders (id),
  party_id uuid not null references public.parties (id),
  amount numeric(14,2) not null check (amount > 0),
  bank_account_id uuid not null references public.chart_of_accounts (id),
  advance_date date not null,
  status text not null default 'unapplied' check (status in ('unapplied', 'applied', 'refunded')),
  applied_invoice_id uuid references public.invoices (id),
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);
```

### Functions
- `post_customer_advance(...)` — debit bank/cash, credit `customer_advances` (liability). Balances independently.
- `apply_advance_to_invoice(p_advance_id, p_invoice_id)` — debit `customer_advances`, credit
  Accounts Receivable for that invoice. Kept separate from `post_payment()` rather than overloading its meaning.
- `refund_customer_advance(...)` — reverses the original posting (never edits it) for the case where
  a custom order falls through after a deposit was taken.

### UI
"Advance Payment" button on `CustomOrders.jsx` detail view (optional). Show any unapplied advance as
a selectable credit when raising the final invoice for that custom order.

---

## Phase 24 — Design system / UI polish (do last, purely cosmetic)

Grounded in the actual logo (navy → teal/sage gradient mandala, gold accent ring, serif "Lseite"
wordmark) rather than default Tailwind gray. Global token fix, not a page-by-page redesign.

### `src/index.css`
```css
@import "tailwindcss";

@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600&display=swap');

@theme {
  --color-ink: #16213E;
  --color-teal: #1F7A64;
  --color-sage: #5A9A78;
  --color-gold: #B8933D;
  --color-clay: #A6483E;
  --color-paper: #F8F7F4;
  --color-mist: #F1F0EA;
  --color-line: #DAD8D0;
  --color-muted: #8A8578;

  --font-display: "Fraunces", serif;
  --font-sans: "Inter", sans-serif;
}

body {
  background: var(--color-paper);
  font-family: var(--font-sans);
}
```

### Global replacement pass across existing pages
| Find | Replace with | Where |
|---|---|---|
| `text-slate-800` | `text-ink font-display` | Page `<h1>` titles only |
| `text-slate-500` | `text-muted` | Secondary/helper text |
| `text-red-600` | `text-clay` | Error/danger text |
| Status badge (posted/paid) | `bg-teal/10 text-teal` | Success states |
| Status badge (pending/draft) | gold-tinted equivalent | Pending states |
| Sidebar background | `bg-ink` | `Layout.jsx` |
| Active nav item | `border-l-2 border-teal bg-white/10` | `Layout.jsx` |

Avoid: shadows on every card (use flat `bg-mist` + hairline `border-line` instead), ALL-CAPS stat
labels, decorative gradients. Brand personality lives in sidebar/headers/status colors, not spread
across every table cell — leave dense tables structurally as-is, just swap the gray-scale tokens.

---

## Operational item — not a phase, but time-sensitive

**Before October 30, 2026:** Supabase is requiring explicit Postgres grants for PostgREST/Data-API
access on free-tier projects from that date. Since this app talks to Supabase entirely through
`supabase-js` (which goes through PostgREST), check the Supabase dashboard for whether this project
needs the grants added, and add them ahead of the deadline — otherwise the API can stop serving
requests. This is a settings check, not development work — can be done any time before the deadline,
doesn't need to wait for the phase order above.

---

## Suggested build order

1. Phase 20 (multi-branch columns) — cheap now, expensive later
2. Phase 21 (Quote Management) — directly fills a gap in the original spec
3. Phase 22 (Customer Management fields) — small, quick
4. Phase 23 (Advance payments) — needs careful accounting treatment, take it slower
5. Supabase PostgREST grants check — anytime before Oct 30, 2026, doesn't block anything above
6. Phase 24 (Design system) — cosmetic, do last, lowest risk to do last since it doesn't touch logic
