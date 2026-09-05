-- LSEITE ERP — consolidated schema (Week 1 foundation through Week 4+
-- Payroll, plus credit/debit notes)
-- For a brand new Supabase project, run this whole file once in the SQL
-- Editor (Project > SQL Editor > New query) — it is the single, complete,
-- up-to-date source of truth, kept in sync in place rather than as a pile
-- of separate migration files. If you already ran an earlier version of
-- this file against a live project, don't re-run it from scratch (the
-- `create table`/`create policy` statements aren't idempotent) — apply only
-- the specific ALTER/CREATE statements you're missing instead.
-- Tables covered: companies, users (profile), chart_of_accounts, parties,
-- items, tax_rates, journal_entries, invoices, invoice_line_items,
-- invoice_number_counters, stock_ledger, payments, bank_transactions.
-- Payroll tables come in a later phase per ROADMAP.md — not created here yet.

create extension if not exists pgcrypto;

-- ============================================================
-- companies
-- multi-branch ready: every business table below carries company_id,
-- even though only one company row is expected to exist right now.
-- ============================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gstin text,
  address text,
  state_code text not null,
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  -- Phase 16: printed on the invoice PDF when set. logo_url is a plain
  -- link to an already-hosted image (no Supabase Storage bucket — that
  -- would be new infrastructure for one cosmetic field), embedded via
  -- pdf-lib's embedPng/embedJpg in api/invoice-pdf.js.
  logo_url text,
  udyam_number text,
  created_at timestamptz not null default now(),
  constraint companies_gstin_format
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  constraint companies_state_code_format check (state_code ~ '^[0-9]{2}$')
);

-- ============================================================
-- users (profile row linked 1:1 to Supabase Auth's auth.users)
-- ============================================================
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id),
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'accountant', 'viewer')),
  -- A second gate on top of role='admin', for the Manage Users feature
  -- only (create/reset accounts) — every other admin capability is
  -- unaffected. Deliberately a plain flag, not a generalized "levels"
  -- system: nothing else in this app needs more than this one distinction.
  -- No client-editable way to set this — same as role, promoted only via
  -- the Supabase Table Editor.
  can_manage_users boolean not null default false,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
-- The first person to ever sign up becomes admin (and can_manage_users,
-- since they're the one setting up the company); everyone after is a
-- viewer until an admin promotes them (done via Supabase Table Editor for
-- now — no user-management screen in Week 1 scope).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
begin
  is_first_user := (select count(*) from public.users) = 0;
  insert into public.users (id, role, can_manage_users)
  values (
    new.id,
    case when is_first_user then 'admin' else 'viewer' end,
    is_first_user
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================
-- chart_of_accounts
-- ============================================================
create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  type text not null check (type in ('asset', 'liability', 'income', 'expense', 'equity')),
  -- Non-null only for the 8 accounts auto-seeded by bootstrap_company() below.
  -- Lets post_invoice() find "the" Accounts Receivable account etc. without
  -- guessing from the free-text name. Structurally mandatory, not a user
  -- choice, hence auto-seeded rather than exposed as a settings screen.
  system_role text check (
    system_role is null or system_role in (
      'accounts_receivable', 'accounts_payable',
      'output_cgst', 'output_sgst', 'output_igst',
      'input_cgst', 'input_sgst', 'input_igst',
      'deductions_payable',
      'raw_material_inventory', 'finished_goods_inventory',
      'cost_of_goods_sold', 'rnd_expense',
      'customer_advances',
      'wastage_expense', 'platform_commission_expense',
      'tds_payable',
      'fixed_assets_gross', 'accumulated_depreciation', 'depreciation_expense', 'disposal_gain_loss'
    )
  ),
  constraint coa_system_role_type_consistency check (
    system_role is null
    or (system_role in ('accounts_receivable', 'input_cgst', 'input_sgst', 'input_igst', 'raw_material_inventory', 'finished_goods_inventory', 'fixed_assets_gross', 'accumulated_depreciation') and type = 'asset')
    or (system_role in ('accounts_payable', 'output_cgst', 'output_sgst', 'output_igst', 'deductions_payable', 'customer_advances', 'tds_payable') and type = 'liability')
    or (system_role in ('cost_of_goods_sold', 'rnd_expense', 'wastage_expense', 'platform_commission_expense', 'depreciation_expense') and type = 'expense')
    or (system_role in ('disposal_gain_loss') and type = 'income')
  ),
  created_at timestamptz not null default now()
);

create unique index coa_company_system_role_idx
  on public.chart_of_accounts (company_id, system_role)
  where system_role is not null;

-- ============================================================
-- parties (customers / vendors)
-- ============================================================
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  gstin text,
  state_code text not null,
  type text not null check (type in ('customer', 'vendor')),
  -- Phase 16: default recipient for "Email PDF" on an invoice. Loosely
  -- validated (not a full RFC 5322 check, just enough to catch an obvious
  -- typo) — still editable/overridable per-send in the UI regardless.
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  constraint parties_gstin_format
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  constraint parties_state_code_format check (state_code ~ '^[0-9]{2}$')
);

-- ============================================================
-- items (goods / services)
-- ============================================================
create table public.items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  hsn_sac_code text not null,
  unit text not null,
  opening_stock numeric(14, 2) not null default 0,
  type text not null check (type in ('good', 'service')),
  -- Null = no alert configured. Only meaningful for type='good' — nothing
  -- enforces that here since a service simply never has stock movements,
  -- so an unused threshold on one is harmless, not worth a constraint.
  low_stock_threshold numeric(14, 2) check (low_stock_threshold is null or low_stock_threshold >= 0),
  -- Manufacturing (Phase 9): which side of the production process this
  -- good sits on. Constrained to type='good' — a service is never raw
  -- material or finished good. Costing (Phase 10) only ever runs on
  -- raw_material items.
  item_type text check (item_type is null or (item_type in ('raw_material', 'finished_good') and type = 'good')),
  -- Free text, not a lookup table — a handful of labels like "Milk-based"
  -- or "Flours" doesn't justify a management screen yet.
  category text,
  -- Phase 10: running weighted-average cost, raw materials only. Updated
  -- on every raw-material purchase line in post_invoice(); never set for
  -- finished goods (their cost lives per-batch on item_batches.unit_cost
  -- instead — see that table).
  average_cost numeric(14, 2) check (average_cost is null or average_cost >= 0),
  created_at timestamptz not null default now()
);

-- ============================================================
-- tax_rates — GST rates by HSN/SAC code. Never hardcoded in app code;
-- all GST calculation logic must read from this table.
-- effective_from/effective_to keep historical invoices accurate when a
-- rate changes later (see CLAUDE.md section 3).
-- ============================================================
create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  hsn_sac_code text not null,
  rate numeric(5, 2) not null check (rate >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint tax_rates_valid_range check (effective_to is null or effective_to >= effective_from)
);

-- ============================================================
-- journal_entries — one row per debit or credit leg. Rows belonging to
-- the same transaction share entry_group_id. A deferred constraint
-- trigger below enforces sum(debit) = sum(credit) per group at commit
-- time, so a one-sided entry can never be persisted (CLAUDE.md section 3).
-- No UPDATE/DELETE policy is granted (see RLS below) — corrections must
-- be posted as a reversing entry, not an edit, to keep the ledger honest.
-- ============================================================
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  entry_group_id uuid not null,
  entry_date date not null,
  account_id uuid not null references public.chart_of_accounts (id),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now(),
  constraint journal_entries_one_sided check (not (debit > 0 and credit > 0))
);

create index journal_entries_group_idx on public.journal_entries (entry_group_id);

create function public.check_journal_entry_balance()
returns trigger
language plpgsql
as $$
declare
  grp uuid := coalesce(new.entry_group_id, old.entry_group_id);
  total_debit numeric;
  total_credit numeric;
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into total_debit, total_credit
    from public.journal_entries
    where entry_group_id = grp;

  if total_debit <> total_credit then
    raise exception 'journal entry group % is not balanced: debit % != credit %',
      grp, total_debit, total_credit;
  end if;

  return null;
end;
$$;

create constraint trigger journal_entries_balance_check
  after insert or update or delete on public.journal_entries
  deferrable initially deferred
  for each row execute function public.check_journal_entry_balance();

-- ============================================================
-- Row Level Security
-- ============================================================
create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.users where id = auth.uid();
$$;

alter table public.companies enable row level security;
alter table public.users enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.parties enable row level security;
alter table public.items enable row level security;
alter table public.tax_rates enable row level security;
alter table public.journal_entries enable row level security;

-- companies: everyone in the company can read; only admin/accountant edit.
-- No client-side INSERT policy — see bootstrap_company() below for how the
-- very first company row gets created.
create policy companies_select on public.companies
  for select using (id = public.current_user_company_id());

create policy companies_update on public.companies
  for update using (
    id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Creates the first company row and assigns it to the calling user in one
-- atomic step. Deliberately NOT exposed as a plain client-side INSERT
-- policy: a user could otherwise set their own company_id to any existing
-- company's id, not just one they created. security definer bypasses RLS
-- only inside this function, which itself only ever assigns the row it
-- just inserted — never an arbitrary caller-supplied id.
create or replace function public.bootstrap_company(
  p_name text,
  p_gstin text,
  p_address text,
  p_state_code text,
  p_bank_name text,
  p_bank_account_no text,
  p_bank_ifsc text
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company public.companies;
begin
  if (select company_id from public.users where id = auth.uid()) is not null then
    raise exception 'You already belong to a company.';
  end if;

  insert into public.companies (name, gstin, address, state_code, bank_name, bank_account_no, bank_ifsc)
  values (p_name, p_gstin, p_address, p_state_code, p_bank_name, p_bank_account_no, p_bank_ifsc)
  returning * into new_company;

  update public.users set company_id = new_company.id where id = auth.uid();

  perform public.seed_system_accounts(new_company.id);

  return new_company;
end;
$$;

-- The 8 ledger accounts every GST-posting company structurally needs.
-- Shared by bootstrap_company() (new companies) and the one-time backfill
-- below (for a company created before this migration existed).
create or replace function public.seed_system_accounts(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chart_of_accounts (company_id, name, type, system_role) values
    (p_company_id, 'Accounts Receivable', 'asset', 'accounts_receivable'),
    (p_company_id, 'Accounts Payable', 'liability', 'accounts_payable'),
    (p_company_id, 'Output CGST', 'liability', 'output_cgst'),
    (p_company_id, 'Output SGST', 'liability', 'output_sgst'),
    (p_company_id, 'Output IGST', 'liability', 'output_igst'),
    (p_company_id, 'Input CGST', 'asset', 'input_cgst'),
    (p_company_id, 'Input SGST', 'asset', 'input_sgst'),
    (p_company_id, 'Input IGST', 'asset', 'input_igst'),
    (p_company_id, 'Deductions Payable', 'liability', 'deductions_payable'),
    (p_company_id, 'Raw Material Inventory', 'asset', 'raw_material_inventory'),
    (p_company_id, 'Finished Goods Inventory', 'asset', 'finished_goods_inventory'),
    (p_company_id, 'Cost of Goods Sold', 'expense', 'cost_of_goods_sold'),
    (p_company_id, 'R&D Expense', 'expense', 'rnd_expense'),
    (p_company_id, 'Customer Advances', 'liability', 'customer_advances'),
    (p_company_id, 'Wastage Expense', 'expense', 'wastage_expense'),
    (p_company_id, 'Platform Commission Expense', 'expense', 'platform_commission_expense'),
    (p_company_id, 'TDS Payable', 'liability', 'tds_payable'),
    (p_company_id, 'Fixed Assets', 'asset', 'fixed_assets_gross'),
    (p_company_id, 'Accumulated Depreciation', 'asset', 'accumulated_depreciation'),
    (p_company_id, 'Depreciation Expense', 'expense', 'depreciation_expense'),
    (p_company_id, 'Gain/Loss on Asset Disposal', 'income', 'disposal_gain_loss')
  on conflict (company_id, system_role) where system_role is not null do nothing;
end;
$$;

-- Backfill: seed the 8 accounts for any company that already existed before
-- this migration. Safe to run more than once (on conflict do nothing above).
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.seed_system_accounts(c.id);
  end loop;
end;
$$;

grant execute on function public.bootstrap_company to authenticated;

-- users: see your own row, or every row in your company if you're admin.
-- No client-side INSERT/UPDATE policy — profile rows are managed by the
-- on_auth_user_created trigger and, for role changes, the Supabase Table
-- Editor for now.
create policy users_select on public.users
  for select using (
    id = auth.uid()
    or (public.current_user_role() = 'admin' and company_id = public.current_user_company_id())
  );

-- chart_of_accounts / parties / items: read all in your company,
-- write restricted to admin/accountant.
create policy coa_select on public.chart_of_accounts
  for select using (company_id = public.current_user_company_id());
create policy coa_write on public.chart_of_accounts
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy coa_update on public.chart_of_accounts
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
-- system_role is null excludes the 8 auto-seeded accounts from deletion —
-- post_invoice()/cancel_invoice() depend on them always existing.
create policy coa_delete on public.chart_of_accounts
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
    and system_role is null
  );

create policy parties_select on public.parties
  for select using (company_id = public.current_user_company_id());
create policy parties_write on public.parties
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy parties_update on public.parties
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy parties_delete on public.parties
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

create policy items_select on public.items
  for select using (company_id = public.current_user_company_id());
create policy items_write on public.items
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy items_update on public.items
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy items_delete on public.items
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- tax_rates: any authenticated user can read (needed to calculate GST on
-- an invoice); only admin can edit, and only ever by manual review — see
-- CLAUDE.md section 3, rates must never be auto-applied by code.
create policy tax_rates_select on public.tax_rates
  for select using (auth.role() = 'authenticated');
create policy tax_rates_write on public.tax_rates
  for insert with check (public.current_user_role() = 'admin');
create policy tax_rates_update on public.tax_rates
  for update using (public.current_user_role() = 'admin');
create policy tax_rates_delete on public.tax_rates
  for delete using (public.current_user_role() = 'admin');

-- journal_entries: read your company's ledger; insert only as
-- admin/accountant. No update/delete policy at all — see comment above
-- the table definition.
create policy journal_entries_select on public.journal_entries
  for select using (company_id = public.current_user_company_id());
create policy journal_entries_insert on public.journal_entries
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- ============================================================
-- Week 1–2: Sales & Purchase Invoicing
-- ============================================================

-- invoices — one row per sales/purchase invoice. Immutable once posted:
-- no update/delete policy at all (see RLS below), same reasoning as
-- journal_entries — corrections go through cancel_invoice(), never an edit.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  type text not null check (type in ('sales', 'purchase')),
  party_id uuid not null references public.parties (id),
  invoice_number text not null,
  financial_year text not null,
  invoice_date date not null,
  revenue_expense_account_id uuid not null references public.chart_of_accounts (id),
  subtotal numeric(14, 2) not null default 0,
  cgst_total numeric(14, 2) not null default 0,
  sgst_total numeric(14, 2) not null default 0,
  igst_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint invoices_unique_number unique (company_id, type, invoice_number),
  -- Must always hold: header totals are a SUM of the (already-rounded) line
  -- amounts, never recomputed independently — otherwise a 1-paisa drift
  -- between header and lines would make the journal_entries balance
  -- trigger reject the whole invoice at commit time.
  constraint invoices_totals_consistent check (grand_total = subtotal + cgst_total + sgst_total + igst_total)
);

-- invoice_line_items — hsn_sac_code and tax_rate are copied from the item /
-- tax_rates at invoice time, so a later edit to either doesn't rewrite
-- history (CLAUDE.md section 3).
create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id),
  item_id uuid not null references public.items (id),
  hsn_sac_code text not null,
  quantity numeric(14, 2) not null check (quantity > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  taxable_value numeric(14, 2) not null,
  tax_rate numeric(5, 2) not null check (tax_rate >= 0),
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

-- invoice_number_counters — atomic, gap-free sequential numbering per
-- company+type+financial-year (GST Rule 46: consecutive serial numbers,
-- unique per financial year). The ON CONFLICT DO UPDATE below takes a row
-- lock, so concurrent posts serialize instead of racing for the same number.
-- invoice_type also covers 'sales_credit_note'/'purchase_debit_note' —
-- correction documents (see the Credit/Debit Notes section) get their own
-- gap-free sequence too, same GST Rule 46 reasoning.
create table public.invoice_number_counters (
  company_id uuid not null references public.companies (id),
  invoice_type text not null check (invoice_type in ('sales', 'purchase', 'sales_credit_note', 'purchase_debit_note')),
  financial_year text not null,
  next_number integer not null default 1,
  primary key (company_id, invoice_type, financial_year)
);

create function public.financial_year_for(p_date date)
returns text
language sql
immutable
as $$
  select
    (case when extract(month from p_date)::int >= 4
      then extract(year from p_date)::int
      else extract(year from p_date)::int - 1
    end)::text
    || '-' ||
    lpad((
      (case when extract(month from p_date)::int >= 4
        then extract(year from p_date)::int + 1
        else extract(year from p_date)::int
      end) % 100
    )::text, 2, '0');
$$;

-- Single source of truth for "which tax_rates row applies" — used both by
-- the client for a live preview and by post_invoice() at save time, so the
-- two can never disagree about which rate applied.
create function public.resolve_tax_rate(p_hsn_sac_code text, p_as_of date)
returns numeric
language sql
stable
as $$
  select rate from public.tax_rates
  where hsn_sac_code = p_hsn_sac_code
    and effective_from <= p_as_of
    and (effective_to is null or effective_to >= p_as_of)
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.resolve_tax_rate(text, date) to authenticated;

-- Single source of truth for the CGST+SGST vs IGST split (CLAUDE.md
-- section 3) — same state_code => CGST+SGST (half the rate each);
-- different => IGST (full rate). Used by both live preview and posting.
create function public.calculate_gst_split(
  p_seller_state_code text,
  p_buyer_state_code text,
  p_taxable_value numeric,
  p_tax_rate numeric
)
returns table (cgst numeric, sgst numeric, igst numeric)
language plpgsql
immutable
as $$
begin
  if p_seller_state_code = p_buyer_state_code then
    cgst := round(p_taxable_value * p_tax_rate / 2 / 100, 2);
    sgst := cgst;
    igst := 0;
  else
    cgst := 0;
    sgst := 0;
    igst := round(p_taxable_value * p_tax_rate / 100, 2);
  end if;
  return next;
end;
$$;

grant execute on function public.calculate_gst_split(text, text, numeric, numeric) to authenticated;

alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_number_counters enable row level security;

-- No insert/update/delete policies on invoices/invoice_line_items — all
-- writes happen through post_invoice()/cancel_invoice() (SECURITY DEFINER),
-- same reasoning as bootstrap_company()'s missing companies insert policy.
create policy invoices_select on public.invoices
  for select using (company_id = public.current_user_company_id());

create policy invoice_line_items_select on public.invoice_line_items
  for select using (
    exists (
      select 1 from public.invoices
      where invoices.id = invoice_line_items.invoice_id
        and invoices.company_id = public.current_user_company_id()
    )
  );

-- invoice_number_counters: RLS enabled, no policies — touched only inside
-- post_invoice(), which bypasses RLS as a SECURITY DEFINER function.

-- ============================================================
-- Week 2: Inventory / Stock Tracking
-- ============================================================

-- item_batches (Phase 9) — one row per lot of a raw material or finished
-- good, so two batches of the same item can carry different expiry
-- dates. unit_cost is populated only for finished-goods batches (Phase
-- 10's production entries) — raw-material costing lives on
-- items.average_cost instead, not per batch. Nothing writes to this table
-- yet in Phase 9; it exists so stock_ledger can reference it.
create table public.item_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  item_id uuid not null references public.items (id),
  expiry_date date,
  unit_cost numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index item_batches_item_idx on public.item_batches (item_id);

alter table public.item_batches enable row level security;

create policy item_batches_select on public.item_batches
  for select using (company_id = public.current_user_company_id());

-- stock_ledger — one row per stock movement. Immutable like
-- journal_entries/invoices: no update/delete policy — reversals happen
-- via an opposite-direction row, never by editing history.
-- reference_type/reference_id (Phase 9, mirrors journal_entries' same
-- pattern) generalize what caused a movement beyond just invoices —
-- production entries and R&D trials (Phase 10) will use this too.
-- batch_id is nullable until Phase 10 starts populating it.
create table public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  item_id uuid not null references public.items (id),
  batch_id uuid references public.item_batches (id),
  reference_type text not null default 'invoice',
  reference_id uuid,
  quantity numeric(14, 2) not null check (quantity > 0),
  direction text not null check (direction in ('in', 'out')),
  movement_date date not null,
  created_at timestamptz not null default now()
);

create index stock_ledger_item_idx on public.stock_ledger (item_id);

alter table public.stock_ledger enable row level security;

-- No insert/update/delete policies — written only from inside
-- post_invoice()/cancel_invoice() (SECURITY DEFINER), same reasoning as
-- invoices/invoice_line_items above.
create policy stock_ledger_select on public.stock_ledger
  for select using (company_id = public.current_user_company_id());

-- Current stock per good = opening_stock + net(in - out) movements.
-- A plain view, not materialized. IMPORTANT: a bare `create view` runs with
-- the view OWNER's privileges for RLS purposes (Postgres default), not the
-- querying user's — `security_invoker = true` is what makes it re-evaluate
-- RLS on the underlying items/stock_ledger tables as the actual caller.
-- Without it, any authenticated user could see every company's stock.
create view public.item_current_stock
with (security_invoker = true) as
select
  i.id as item_id,
  i.company_id,
  i.name,
  i.hsn_sac_code,
  i.unit,
  i.opening_stock,
  i.low_stock_threshold,
  i.opening_stock + coalesce(
    sum(case when sl.direction = 'in' then sl.quantity else -sl.quantity end), 0
  ) as current_stock
from public.items i
left join public.stock_ledger sl on sl.item_id = i.id
where i.type = 'good'
group by i.id;

-- Phase 10 shared helper: consumes p_quantity of an item out of its
-- item_batches, oldest-expiry-first (FEFO), splitting across batches if
-- one alone doesn't cover the quantity. Records one stock_ledger 'out' row
-- per batch touched (so each batch's own remaining quantity stays
-- correct), and returns the total cost consumed — the raw-material cost
-- basis for a production entry/R&D trial, or the COGS basis for a sale.
-- Costing differs by item_type: a raw material's cost is its single
-- running items.average_cost (not tracked per batch); a finished good's
-- cost is whatever unit_cost its own batch was produced at (Phase 10 never
-- computes a running average for finished goods — see items.average_cost's
-- comment). Not directly callable by clients — only ever invoked from
-- inside another SECURITY DEFINER posting function.
create function public.consume_item_fefo(
  p_company_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_reference_type text,
  p_reference_id uuid,
  p_movement_date date
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_batch record;
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_total_cost numeric := 0;
begin
  select item_type, average_cost into v_item from public.items where id = p_item_id;

  if v_item.item_type = 'raw_material' and v_item.average_cost is null then
    raise exception 'Item % has never been purchased/costed — record a purchase before consuming it.', p_item_id;
  end if;

  for v_batch in
    select ib.id, ib.unit_cost,
      coalesce(sum(case when sl.direction = 'in' then sl.quantity else -sl.quantity end), 0) as remaining_qty
    from public.item_batches ib
    left join public.stock_ledger sl on sl.batch_id = ib.id
    where ib.item_id = p_item_id and ib.company_id = p_company_id
    group by ib.id, ib.unit_cost, ib.expiry_date
    having coalesce(sum(case when sl.direction = 'in' then sl.quantity else -sl.quantity end), 0) > 0
    order by ib.expiry_date asc nulls last, ib.created_at asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_batch.remaining_qty);

    insert into public.stock_ledger (company_id, item_id, batch_id, reference_type, reference_id, quantity, direction, movement_date)
    values (p_company_id, p_item_id, v_batch.id, p_reference_type, p_reference_id, v_take, 'out', p_movement_date);

    v_total_cost := v_total_cost + v_take * coalesce(
      case when v_item.item_type = 'raw_material' then v_item.average_cost else v_batch.unit_cost end,
      0
    );
    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    raise exception 'Insufficient produced/purchased batch stock for item % (% short).', p_item_id, v_remaining;
  end if;

  return round(v_total_cost, 2);
end;
$$;

-- Atomically posts an invoice: validates the caller, resolves the invoice
-- number, computes every line via resolve_tax_rate()/calculate_gst_split(),
-- inserts the invoice + line items, records stock_ledger movements for
-- type='good' items, and posts the matching journal_entries legs (which
-- the existing balance trigger validates automatically).
-- p_line_items shape: [{"item_id": "...", "quantity": 1, "rate": 100}, ...]
create or replace function public.post_invoice(
  p_type text,
  p_party_id uuid,
  p_invoice_date date,
  p_revenue_expense_account_id uuid,
  p_line_items jsonb,
  p_custom_order_id uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_seller_state_code text;
  v_buyer_state_code text;
  v_expected_party_type text;
  v_expected_account_type text;
  v_fy text;
  v_prefix text;
  v_seq int;
  v_invoice_number text;
  v_invoice public.invoices;
  v_entry_group uuid := gen_random_uuid();
  v_subtotal numeric(14, 2) := 0;
  v_cgst numeric(14, 2) := 0;
  v_sgst numeric(14, 2) := 0;
  v_igst numeric(14, 2) := 0;
  v_grand numeric(14, 2);
  v_line jsonb;
  v_item record;
  v_tax_rate numeric;
  v_split record;
  v_taxable numeric(14, 2);
  v_line_cgst numeric(14, 2);
  v_line_sgst numeric(14, 2);
  v_line_igst numeric(14, 2);
  v_line_total numeric(14, 2);
  v_ar_ap_account_id uuid;
  v_cgst_account_id uuid;
  v_sgst_account_id uuid;
  v_igst_account_id uuid;
  -- Phase 10: manufacturing costing accounts, and per-invoice accumulators
  -- for the purchase-side raw-material/other split and the sales-side
  -- COGS layered on top of the normal revenue posting.
  v_rm_inventory_account_id uuid;
  v_fg_inventory_account_id uuid;
  v_cogs_account_id uuid;
  v_subtotal_rm numeric(14, 2) := 0;
  v_subtotal_other numeric(14, 2) := 0;
  v_cogs_total numeric(14, 2) := 0;
  v_old_qty numeric;
  v_updated_avg numeric(14, 2);
  v_new_batch_id uuid;
begin
  if p_type not in ('sales', 'purchase') then
    raise exception 'Invalid invoice type: %', p_type;
  end if;

  -- security definer bypasses RLS, so re-check everything RLS would have
  -- checked — same discipline bootstrap_company() already follows.
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to post invoices.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_invoice_date);

  select state_code into v_seller_state_code from public.companies where id = v_company_id;

  v_expected_party_type := case when p_type = 'sales' then 'customer' else 'vendor' end;
  select state_code into v_buyer_state_code
    from public.parties
    where id = p_party_id and company_id = v_company_id and type in (v_expected_party_type, 'both');
  if v_buyer_state_code is null then
    raise exception 'Party not found, not in your company, or wrong type for a % invoice.', p_type;
  end if;

  v_expected_account_type := case when p_type = 'sales' then 'income' else 'expense' end;
  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_revenue_expense_account_id and company_id = v_company_id and type = v_expected_account_type
  ) then
    raise exception 'Revenue/expense account not found, not in your company, or wrong type for a % invoice.', p_type;
  end if;

  select id into v_ar_ap_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when p_type = 'sales' then 'accounts_receivable' else 'accounts_payable' end;
  select id into v_cgst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when p_type = 'sales' then 'output_cgst' else 'input_cgst' end;
  select id into v_sgst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when p_type = 'sales' then 'output_sgst' else 'input_sgst' end;
  select id into v_igst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when p_type = 'sales' then 'output_igst' else 'input_igst' end;
  select id into v_rm_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'raw_material_inventory';
  select id into v_fg_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'finished_goods_inventory';
  select id into v_cogs_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'cost_of_goods_sold';

  if v_ar_ap_account_id is null or v_cgst_account_id is null or v_sgst_account_id is null or v_igst_account_id is null
     or v_rm_inventory_account_id is null or v_fg_inventory_account_id is null or v_cogs_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  if jsonb_array_length(p_line_items) = 0 then
    raise exception 'An invoice needs at least one line item.';
  end if;

  if p_custom_order_id is not null and not exists (
    select 1 from public.custom_orders where id = p_custom_order_id and company_id = v_company_id
  ) then
    raise exception 'Custom order not found in your company.';
  end if;

  v_fy := public.financial_year_for(p_invoice_date);
  v_prefix := case when p_type = 'sales' then 'SI' else 'PI' end;

  insert into public.invoice_number_counters (company_id, invoice_type, financial_year, next_number)
  values (v_company_id, p_type, v_fy, 2)
  on conflict (company_id, invoice_type, financial_year)
    do update set next_number = invoice_number_counters.next_number + 1
  returning next_number - 1 into v_seq;

  v_invoice_number := v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');

  insert into public.invoices (
    company_id, type, party_id, invoice_number, financial_year, invoice_date,
    revenue_expense_account_id, entry_group_id, custom_order_id
  ) values (
    v_company_id, p_type, p_party_id, v_invoice_number, v_fy, p_invoice_date,
    p_revenue_expense_account_id, v_entry_group, p_custom_order_id
  ) returning * into v_invoice;

  for v_line in select * from jsonb_array_elements(p_line_items)
  loop
    select id, hsn_sac_code, type, item_type, average_cost into v_item
      from public.items
      where id = (v_line->>'item_id')::uuid and company_id = v_company_id;
    if not found then
      raise exception 'Item % not found in your company.', v_line->>'item_id';
    end if;

    v_tax_rate := public.resolve_tax_rate(v_item.hsn_sac_code, p_invoice_date);
    if v_tax_rate is null then
      raise exception 'No tax rate found for HSN/SAC % as of %.', v_item.hsn_sac_code, p_invoice_date;
    end if;

    v_taxable := round((v_line->>'quantity')::numeric * (v_line->>'rate')::numeric, 2);

    select * into v_split from public.calculate_gst_split(v_seller_state_code, v_buyer_state_code, v_taxable, v_tax_rate);
    v_line_cgst := v_split.cgst;
    v_line_sgst := v_split.sgst;
    v_line_igst := v_split.igst;
    v_line_total := v_taxable + v_line_cgst + v_line_sgst + v_line_igst;

    insert into public.invoice_line_items (
      invoice_id, item_id, hsn_sac_code, quantity, rate, taxable_value, tax_rate,
      cgst_amount, sgst_amount, igst_amount, line_total
    ) values (
      v_invoice.id, v_item.id, v_item.hsn_sac_code, (v_line->>'quantity')::numeric, (v_line->>'rate')::numeric,
      v_taxable, v_tax_rate, v_line_cgst, v_line_sgst, v_line_igst, v_line_total
    );

    if v_item.type = 'good' and p_type = 'purchase' and v_item.item_type = 'raw_material' then
      -- Weighted-average cost update: old_qty/average_cost are this item's
      -- state right before this line's purchase.
      select coalesce(sum(case when direction = 'in' then quantity else -quantity end), 0) into v_old_qty
        from public.stock_ledger where item_id = v_item.id and company_id = v_company_id;

      if v_old_qty > 0 and v_item.average_cost is not null then
        v_updated_avg := round(
          (v_old_qty * v_item.average_cost + (v_line->>'quantity')::numeric * (v_line->>'rate')::numeric)
          / (v_old_qty + (v_line->>'quantity')::numeric), 2
        );
      else
        v_updated_avg := (v_line->>'rate')::numeric;
      end if;
      update public.items set average_cost = v_updated_avg where id = v_item.id;

      insert into public.item_batches (company_id, item_id, expiry_date)
      values (v_company_id, v_item.id, nullif(v_line->>'expiry_date', '')::date)
      returning id into v_new_batch_id;

      insert into public.stock_ledger (company_id, item_id, batch_id, reference_type, reference_id, quantity, direction, movement_date)
      values (v_company_id, v_item.id, v_new_batch_id, 'invoice', v_invoice.id, (v_line->>'quantity')::numeric, 'in', p_invoice_date);

      v_subtotal_rm := v_subtotal_rm + v_taxable;
    elsif v_item.type = 'good' and p_type = 'sales' and v_item.item_type = 'finished_good' then
      v_cogs_total := v_cogs_total + public.consume_item_fefo(
        v_company_id, v_item.id, (v_line->>'quantity')::numeric, 'invoice', v_invoice.id, p_invoice_date
      );
    else
      if v_item.type = 'good' then
        insert into public.stock_ledger (company_id, item_id, reference_type, reference_id, quantity, direction, movement_date)
        values (
          v_company_id, v_item.id, 'invoice', v_invoice.id, (v_line->>'quantity')::numeric,
          case when p_type = 'sales' then 'out' else 'in' end,
          p_invoice_date
        );
      end if;
      if p_type = 'purchase' then
        v_subtotal_other := v_subtotal_other + v_taxable;
      end if;
    end if;

    v_subtotal := v_subtotal + v_taxable;
    v_cgst := v_cgst + v_line_cgst;
    v_sgst := v_sgst + v_line_sgst;
    v_igst := v_igst + v_line_igst;
  end loop;

  v_grand := v_subtotal + v_cgst + v_sgst + v_igst;

  update public.invoices
    set subtotal = v_subtotal, cgst_total = v_cgst, sgst_total = v_sgst, igst_total = v_igst, grand_total = v_grand
    where id = v_invoice.id
    returning * into v_invoice;

  if p_type = 'sales' then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_invoice_date, v_ar_ap_account_id, v_grand, 0, 'invoice', v_invoice.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_invoice_date, p_revenue_expense_account_id, 0, v_subtotal, 'invoice', v_invoice.id);
    if v_cgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_cgst_account_id, 0, v_cgst, 'invoice', v_invoice.id);
    end if;
    if v_sgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_sgst_account_id, 0, v_sgst, 'invoice', v_invoice.id);
    end if;
    if v_igst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_igst_account_id, 0, v_igst, 'invoice', v_invoice.id);
    end if;
    -- Phase 10: cost of finished goods actually sold, layered on top of
    -- the revenue posting above — a separate journal pair, not a
    -- replacement of it.
    if v_cogs_total > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_cogs_account_id, v_cogs_total, 0, 'invoice', v_invoice.id);
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_fg_inventory_account_id, 0, v_cogs_total, 'invoice', v_invoice.id);
    end if;
  else
    -- Phase 10: raw-material lines route to raw_material_inventory
    -- automatically; everything else on a purchase still goes to whatever
    -- expense account was picked, exactly as before.
    if v_subtotal_rm > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_rm_inventory_account_id, v_subtotal_rm, 0, 'invoice', v_invoice.id);
    end if;
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_invoice_date, v_ar_ap_account_id, 0, v_grand, 'invoice', v_invoice.id);
    if v_subtotal_other > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, p_revenue_expense_account_id, v_subtotal_other, 0, 'invoice', v_invoice.id);
    end if;
    if v_cgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_cgst_account_id, v_cgst, 0, 'invoice', v_invoice.id);
    end if;
    if v_sgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_sgst_account_id, v_sgst, 0, 'invoice', v_invoice.id);
    end if;
    if v_igst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_invoice_date, v_igst_account_id, v_igst, 0, 'invoice', v_invoice.id);
    end if;
  end if;

  return v_invoice;
end;
$$;

grant execute on function public.post_invoice(text, uuid, date, uuid, jsonb, uuid) to authenticated;

-- credit_notes — the correction document cancel_invoice() always issues.
-- Full-value only (matches cancel_invoice's all-or-nothing semantics; a
-- partial credit/debit note is a bigger feature, not built here). Dated
-- when it's actually issued, NOT the original invoice's date — that's the
-- whole point: the original invoice keeps its own historical figures
-- exactly as reported, and this document carries the correction into
-- WHATEVER period it's actually issued in. "type" mirrors the original
-- invoice: sales -> Credit Note (reduces output tax), purchase -> Debit
-- Note (reduces input tax credit) — standard terminology in Indian
-- accounting software (e.g. Tally), even though technically it's the
-- vendor who'd issue the credit note on a purchase; either way it debits
-- the vendor in our own books. Immutable/read-only from the client, same
-- as invoices — only ever created inside cancel_invoice().
create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  invoice_id uuid not null references public.invoices (id) unique,
  type text not null check (type in ('sales', 'purchase')),
  note_number text not null,
  note_date date not null,
  subtotal numeric(14, 2) not null,
  cgst_total numeric(14, 2) not null,
  sgst_total numeric(14, 2) not null,
  igst_total numeric(14, 2) not null,
  grand_total numeric(14, 2) not null,
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint credit_notes_unique_number unique (company_id, type, note_number)
);

alter table public.credit_notes enable row level security;

create policy credit_notes_select on public.credit_notes
  for select using (company_id = public.current_user_company_id());

-- Reverses a posted invoice and issues the credit/debit note that makes
-- the reversal a real, dated GST document rather than a silent edit of
-- history: inserts a new entry_group with every leg's debit/credit
-- swapped, reverses any stock_ledger movements the same way, records a
-- credit_notes row dated today (sharing that same entry_group_id), and
-- marks the invoice cancelled. The original invoice, line items, journal
-- rows, and stock movements are never touched — reports include the
-- original invoice in ITS OWN period exactly as posted, and this note in
-- WHATEVER period it's actually issued in, so a return already filed
-- never silently changes.
create or replace function public.cancel_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_company_id uuid;
  v_reversal_group uuid := gen_random_uuid();
  v_leg record;
  v_fy text;
  v_note_type text;
  v_note_prefix text;
  v_seq int;
  v_note_number text;
  -- Phase 10: reverting a raw-material purchase's contribution to
  -- items.average_cost is only mathematically clean if nothing else has
  -- touched that item's stock since — see the guard loop below.
  v_rm_line record;
  v_this_purchase_time timestamptz;
  v_curr_qty numeric;
  v_curr_avg numeric;
  v_old_qty numeric;
  v_new_avg numeric;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to cancel invoices.';
  end if;
  perform public.reject_if_period_closed(v_company_id, current_date);

  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id;
  if not found then
    raise exception 'Invoice not found in your company.';
  end if;
  if v_invoice.status <> 'posted' then
    raise exception 'Only a posted invoice can be cancelled (current status: %).', v_invoice.status;
  end if;

  if exists (select 1 from public.payments where invoice_id = v_invoice.id and status = 'posted') then
    raise exception 'Cancel the payment(s) recorded against this invoice first.';
  end if;

  -- Phase 10: for a raw-material purchase, items.average_cost is a
  -- running weighted average — reverting just this purchase's contribution
  -- is only ever mathematically clean if nothing has touched this item's
  -- stock since (no later purchase, no production/R&D consumption). If
  -- anything has, block the whole cancellation rather than silently
  -- computing a wrong average; correct it with a fresh entry instead.
  -- Raising here rolls back this entire function call, so it's safe to
  -- also update average_cost for earlier lines in the same pass below.
  if v_invoice.type = 'purchase' then
    for v_rm_line in
      select ili.item_id, ili.quantity, ili.rate
      from public.invoice_line_items ili
      join public.items i on i.id = ili.item_id
      where ili.invoice_id = v_invoice.id and i.item_type = 'raw_material'
    loop
      select max(created_at) into v_this_purchase_time
        from public.stock_ledger
        where reference_type = 'invoice' and reference_id = v_invoice.id and item_id = v_rm_line.item_id;

      if exists (
        select 1 from public.stock_ledger
        where item_id = v_rm_line.item_id and company_id = v_company_id and created_at > v_this_purchase_time
      ) then
        raise exception 'Cannot cancel: item % has had later purchases or consumption since this invoice was posted. Post a correcting entry instead.', v_rm_line.item_id;
      end if;

      select coalesce(sum(case when direction = 'in' then quantity else -quantity end), 0) into v_curr_qty
        from public.stock_ledger where item_id = v_rm_line.item_id and company_id = v_company_id;
      select average_cost into v_curr_avg from public.items where id = v_rm_line.item_id;

      v_old_qty := v_curr_qty - v_rm_line.quantity;
      if v_old_qty > 0 then
        v_new_avg := round((v_curr_avg * v_curr_qty - v_rm_line.quantity * v_rm_line.rate) / v_old_qty, 2);
      else
        v_new_avg := null;
      end if;
      update public.items set average_cost = v_new_avg where id = v_rm_line.item_id;
    end loop;
  end if;

  for v_leg in
    select account_id, debit, credit from public.journal_entries where entry_group_id = v_invoice.entry_group_id
  loop
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_reversal_group, current_date, v_leg.account_id, v_leg.credit, v_leg.debit, 'invoice_cancellation', v_invoice.id);
  end loop;

  for v_leg in
    select item_id, batch_id, quantity, direction from public.stock_ledger
    where reference_type = 'invoice' and reference_id = v_invoice.id
  loop
    insert into public.stock_ledger (company_id, item_id, batch_id, reference_type, reference_id, quantity, direction, movement_date)
    values (
      v_company_id, v_leg.item_id, v_leg.batch_id, 'invoice', v_invoice.id, v_leg.quantity,
      case when v_leg.direction = 'in' then 'out' else 'in' end,
      current_date
    );
  end loop;

  v_fy := public.financial_year_for(current_date);
  v_note_type := case when v_invoice.type = 'sales' then 'sales_credit_note' else 'purchase_debit_note' end;
  v_note_prefix := case when v_invoice.type = 'sales' then 'CN' else 'DN' end;

  insert into public.invoice_number_counters (company_id, invoice_type, financial_year, next_number)
  values (v_company_id, v_note_type, v_fy, 2)
  on conflict (company_id, invoice_type, financial_year)
    do update set next_number = invoice_number_counters.next_number + 1
  returning next_number - 1 into v_seq;

  v_note_number := v_note_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');

  insert into public.credit_notes (
    company_id, invoice_id, type, note_number, note_date,
    subtotal, cgst_total, sgst_total, igst_total, grand_total, entry_group_id
  ) values (
    v_company_id, v_invoice.id, v_invoice.type, v_note_number, current_date,
    v_invoice.subtotal, v_invoice.cgst_total, v_invoice.sgst_total, v_invoice.igst_total, v_invoice.grand_total, v_reversal_group
  );

  update public.invoices set status = 'cancelled' where id = v_invoice.id returning * into v_invoice;

  return v_invoice;
end;
$$;

grant execute on function public.cancel_invoice(uuid) to authenticated;

-- ============================================================
-- Phase 10: Production & R&D Recipe Trials
-- ============================================================

-- production_entries — one row per manufacturing batch: what finished
-- good was made, how much, and which new item_batches lot it created.
-- Immutable, no cancel/edit path in this phase (not requested) —
-- corrections are future scope if ever needed.
create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  finished_good_item_id uuid not null references public.items (id),
  quantity_produced numeric(14, 2) not null check (quantity_produced > 0),
  production_date date not null,
  output_batch_id uuid not null references public.item_batches (id),
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.production_entries enable row level security;

create policy production_entries_select on public.production_entries
  for select using (company_id = public.current_user_company_id());

-- production_entry_consumptions — which raw materials (and how much of
-- each, at what cost) went into one production entry. No fixed
-- recipe/BOM — this varies batch to batch, logged as it actually happened.
create table public.production_entry_consumptions (
  id uuid primary key default gen_random_uuid(),
  production_entry_id uuid not null references public.production_entries (id),
  raw_material_item_id uuid not null references public.items (id),
  quantity_consumed numeric(14, 2) not null check (quantity_consumed > 0),
  unit_cost_at_time numeric(14, 2) not null check (unit_cost_at_time >= 0),
  created_at timestamptz not null default now()
);

alter table public.production_entry_consumptions enable row level security;

create policy production_entry_consumptions_select on public.production_entry_consumptions
  for select using (
    exists (
      select 1 from public.production_entries pe
      where pe.id = production_entry_consumptions.production_entry_id
        and pe.company_id = public.current_user_company_id()
    )
  );

-- rnd_trials — a recipe experiment: raw materials consumed, optionally
-- aimed at a specific finished-good candidate. Unlike production, a
-- trial's output is never added to sellable stock (no batch is created
-- for it) — it's a test, not inventory, and its cost is expensed
-- immediately rather than transferred to finished-goods inventory.
create table public.rnd_trials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  trial_date date not null,
  recipe_description text,
  resulting_item_id uuid references public.items (id),
  outcome_notes text,
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.rnd_trials enable row level security;

create policy rnd_trials_select on public.rnd_trials
  for select using (company_id = public.current_user_company_id());

create table public.rnd_trial_consumptions (
  id uuid primary key default gen_random_uuid(),
  rnd_trial_id uuid not null references public.rnd_trials (id),
  raw_material_item_id uuid not null references public.items (id),
  quantity_consumed numeric(14, 2) not null check (quantity_consumed > 0),
  unit_cost_at_time numeric(14, 2) not null check (unit_cost_at_time >= 0),
  created_at timestamptz not null default now()
);

alter table public.rnd_trial_consumptions enable row level security;

create policy rnd_trial_consumptions_select on public.rnd_trial_consumptions
  for select using (
    exists (
      select 1 from public.rnd_trials rt
      where rt.id = rnd_trial_consumptions.rnd_trial_id
        and rt.company_id = public.current_user_company_id()
    )
  );

-- Records a production batch: creates the output item_batches lot,
-- consumes each raw material FEFO via consume_item_fefo() (which posts
-- the stock_ledger legs itself), derives the batch's unit_cost from total
-- consumed cost / quantity produced, and posts a pure cost-transfer
-- journal entry (finished_goods_inventory debit, raw_material_inventory
-- credit) — no P&L impact here; that happens later, when the finished
-- good is actually sold (see post_invoice's COGS leg).
create or replace function public.post_production_entry(
  p_finished_good_item_id uuid,
  p_quantity_produced numeric,
  p_production_date date,
  p_expiry_date date,
  p_consumptions jsonb,
  p_custom_order_id uuid default null
)
returns public.production_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_fg_item record;
  v_entry public.production_entries;
  v_entry_group uuid := gen_random_uuid();
  v_batch public.item_batches;
  v_line jsonb;
  v_rm_item record;
  v_total_cost numeric(14, 2) := 0;
  v_unit_cost numeric(14, 2);
  v_fg_inventory_account_id uuid;
  v_rm_inventory_account_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to record production.';
  end if;

  if p_quantity_produced <= 0 then
    raise exception 'Quantity produced must be positive.';
  end if;

  select id, item_type into v_fg_item from public.items
    where id = p_finished_good_item_id and company_id = v_company_id and type = 'good';
  if not found or v_fg_item.item_type <> 'finished_good' then
    raise exception 'Item is not a finished good in your company.';
  end if;

  if jsonb_array_length(p_consumptions) = 0 then
    raise exception 'A production entry needs at least one raw material consumed.';
  end if;

  if p_custom_order_id is not null and not exists (
    select 1 from public.custom_orders where id = p_custom_order_id and company_id = v_company_id
  ) then
    raise exception 'Custom order not found in your company.';
  end if;

  select id into v_fg_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'finished_goods_inventory';
  select id into v_rm_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'raw_material_inventory';
  if v_fg_inventory_account_id is null or v_rm_inventory_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.item_batches (company_id, item_id, expiry_date)
  values (v_company_id, p_finished_good_item_id, p_expiry_date)
  returning * into v_batch;

  insert into public.production_entries (
    company_id, finished_good_item_id, quantity_produced, production_date, output_batch_id, entry_group_id, custom_order_id
  ) values (
    v_company_id, p_finished_good_item_id, p_quantity_produced, p_production_date, v_batch.id, v_entry_group, p_custom_order_id
  ) returning * into v_entry;

  insert into public.stock_ledger (company_id, item_id, batch_id, reference_type, reference_id, quantity, direction, movement_date)
  values (v_company_id, p_finished_good_item_id, v_batch.id, 'production_entry', v_entry.id, p_quantity_produced, 'in', p_production_date);

  for v_line in select * from jsonb_array_elements(p_consumptions)
  loop
    select id, item_type, average_cost into v_rm_item
      from public.items
      where id = (v_line->>'item_id')::uuid and company_id = v_company_id and type = 'good';
    if not found or v_rm_item.item_type <> 'raw_material' then
      raise exception 'Item % is not a raw material in your company.', v_line->>'item_id';
    end if;

    v_total_cost := v_total_cost + public.consume_item_fefo(
      v_company_id, v_rm_item.id, (v_line->>'quantity')::numeric, 'production_entry', v_entry.id, p_production_date
    );

    insert into public.production_entry_consumptions (production_entry_id, raw_material_item_id, quantity_consumed, unit_cost_at_time)
    values (v_entry.id, v_rm_item.id, (v_line->>'quantity')::numeric, v_rm_item.average_cost);
  end loop;

  v_unit_cost := round(v_total_cost / p_quantity_produced, 2);
  update public.item_batches set unit_cost = v_unit_cost where id = v_batch.id;

  if v_total_cost > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_production_date, v_fg_inventory_account_id, v_total_cost, 0, 'production_entry', v_entry.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_production_date, v_rm_inventory_account_id, 0, v_total_cost, 'production_entry', v_entry.id);
  end if;

  return v_entry;
end;
$$;

grant execute on function public.post_production_entry(uuid, numeric, date, date, jsonb, uuid) to authenticated;

-- Records an R&D recipe trial: consumes raw materials FEFO exactly like
-- production, but never creates finished-goods stock, and expenses the
-- cost immediately (rnd_expense debit) rather than transferring it to
-- finished_goods_inventory — a trial is R&D spend, not inventory creation.
create function public.post_rnd_trial(
  p_trial_date date,
  p_recipe_description text,
  p_resulting_item_id uuid,
  p_outcome_notes text,
  p_consumptions jsonb
)
returns public.rnd_trials
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_trial public.rnd_trials;
  v_line jsonb;
  v_rm_item record;
  v_total_cost numeric(14, 2) := 0;
  v_rnd_expense_account_id uuid;
  v_rm_inventory_account_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to record an R&D trial.';
  end if;

  if jsonb_array_length(p_consumptions) = 0 then
    raise exception 'A trial needs at least one raw material consumed.';
  end if;

  if p_resulting_item_id is not null and not exists (
    select 1 from public.items where id = p_resulting_item_id and company_id = v_company_id and type = 'good'
  ) then
    raise exception 'Resulting item not found in your company.';
  end if;

  select id into v_rnd_expense_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'rnd_expense';
  select id into v_rm_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'raw_material_inventory';
  if v_rnd_expense_account_id is null or v_rm_inventory_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.rnd_trials (company_id, trial_date, recipe_description, resulting_item_id, outcome_notes, entry_group_id)
  values (v_company_id, p_trial_date, p_recipe_description, p_resulting_item_id, p_outcome_notes, v_entry_group)
  returning * into v_trial;

  for v_line in select * from jsonb_array_elements(p_consumptions)
  loop
    select id, item_type, average_cost into v_rm_item
      from public.items
      where id = (v_line->>'item_id')::uuid and company_id = v_company_id and type = 'good';
    if not found or v_rm_item.item_type <> 'raw_material' then
      raise exception 'Item % is not a raw material in your company.', v_line->>'item_id';
    end if;

    v_total_cost := v_total_cost + public.consume_item_fefo(
      v_company_id, v_rm_item.id, (v_line->>'quantity')::numeric, 'rnd_trial', v_trial.id, p_trial_date
    );

    insert into public.rnd_trial_consumptions (rnd_trial_id, raw_material_item_id, quantity_consumed, unit_cost_at_time)
    values (v_trial.id, v_rm_item.id, (v_line->>'quantity')::numeric, v_rm_item.average_cost);
  end loop;

  if v_total_cost > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_trial_date, v_rnd_expense_account_id, v_total_cost, 0, 'rnd_trial', v_trial.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_trial_date, v_rm_inventory_account_id, 0, v_total_cost, 'rnd_trial', v_trial.id);
  end if;

  return v_trial;
end;
$$;

grant execute on function public.post_rnd_trial(date, text, uuid, text, jsonb) to authenticated;

-- ============================================================
-- Phase 11: Custom/Bespoke Order Costing
-- ============================================================

-- custom_orders — a lightweight tag for the occasional bespoke/bulk order
-- (e.g. a wedding order), so its production and sale can later be filtered
-- and looked at separately. Plain editable master data, not a posting
-- table — no pricing/quotation engine, just a record to tag against.
create table public.custom_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  party_id uuid not null references public.parties (id),
  description text,
  order_date date not null,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.custom_orders enable row level security;

create policy custom_orders_select on public.custom_orders
  for select using (company_id = public.current_user_company_id());
create policy custom_orders_write on public.custom_orders
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy custom_orders_update on public.custom_orders
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy custom_orders_delete on public.custom_orders
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Nullable tag on the two documents a bespoke order actually flows
-- through — added via ALTER rather than rewriting the original CREATE
-- TABLE statements above, since custom_orders is defined later in this
-- file than either of them.
alter table public.invoices add column custom_order_id uuid references public.custom_orders (id);
alter table public.production_entries add column custom_order_id uuid references public.custom_orders (id);

-- ============================================================
-- Week 2–3: Bank & Payment Tracking
-- ============================================================

-- payments — a (partial or full) payment against one invoice. Immutable
-- once posted, same as invoices/journal_entries — corrections go through
-- cancel_payment(), never an edit. bank_account_id is the asset ledger
-- account the cash/bank leg posts to (user-picked, same reasoning as
-- invoices' revenue/expense account — a company may have several, e.g.
-- "Cash in Hand" vs a specific bank account; not worth a new system_role).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  invoice_id uuid not null references public.invoices (id),
  bank_account_id uuid not null references public.chart_of_accounts (id),
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null,
  mode text not null check (mode in ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other')),
  bank_ref text,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);

-- Outstanding balance per invoice — cancelled payments don't count, hence
-- filtering in the JOIN condition (not a WHERE clause, which would also
-- drop invoices with zero payments since a left-joined NULL never equals
-- 'posted'). `security_invoker = true` — see item_current_stock above for
-- why this is required, not optional, on every view here.
-- Redefined again in the Phase 23 section below (after customer_advances
-- exists) to also fold in applied advances — kept as the original
-- payments-only definition here since customer_advances can't exist yet
-- this early in a fresh top-to-bottom deploy.
create view public.invoice_payment_status
with (security_invoker = true) as
select
  i.id as invoice_id,
  i.company_id,
  i.type,
  i.invoice_number,
  i.grand_total,
  coalesce(sum(p.amount), 0) as amount_paid,
  i.grand_total - coalesce(sum(p.amount), 0) as balance_due
from public.invoices i
left join public.payments p on p.invoice_id = i.id and p.status = 'posted'
where i.status = 'posted'
group by i.id;

-- bank_transactions — manually entered lines from the actual bank
-- statement (no bank API integration — CLAUDE.md free-tier/no-paid-API
-- rule). Unlike payments, this is plain editable master data: a typo in a
-- manually-typed statement line should just be fixed, not "reversed."
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  transaction_date date not null,
  amount numeric(14, 2) not null check (amount <> 0), -- signed: positive = inflow, negative = outflow
  description text,
  matched_payment_id uuid references public.payments (id),
  created_at timestamptz not null default now()
);

-- A payment can be matched by at most one bank transaction.
create unique index bank_transactions_matched_payment_idx
  on public.bank_transactions (matched_payment_id)
  where matched_payment_id is not null;

-- A plain UPDATE (setting matched_payment_id) can't be scoped by RLS to
-- "only a payment in the same company" since RLS on bank_transactions only
-- sees the row being written, not the payments table — this trigger closes
-- that gap regardless of which policy/query performs the update.
create or replace function public.validate_bank_transaction_match()
returns trigger
language plpgsql
as $$
begin
  if new.matched_payment_id is not null then
    if not exists (
      select 1 from public.payments where id = new.matched_payment_id and company_id = new.company_id
    ) then
      raise exception 'Matched payment does not belong to the same company.';
    end if;
  end if;
  -- Phase 33: same reasoning as the matched_payment_id check above — a
  -- plain RLS policy can't see across to bank_accounts to confirm it's
  -- the same company.
  if new.bank_account_id is not null then
    if not exists (
      select 1 from public.bank_accounts where id = new.bank_account_id and company_id = new.company_id
    ) then
      raise exception 'Bank account does not belong to the same company.';
    end if;
  end if;
  return new;
end;
$$;

create trigger bank_transactions_validate_match
  before insert or update on public.bank_transactions
  for each row execute function public.validate_bank_transaction_match();

alter table public.payments enable row level security;
alter table public.bank_transactions enable row level security;

-- payments: read your company's payments; no insert/update/delete client
-- policies — all writes happen through post_payment()/cancel_payment().
create policy payments_select on public.payments
  for select using (company_id = public.current_user_company_id());

-- bank_transactions: ordinary editable master data (see comment on the
-- table), same read/write shape as chart_of_accounts/parties/items.
create policy bank_transactions_select on public.bank_transactions
  for select using (company_id = public.current_user_company_id());
create policy bank_transactions_write on public.bank_transactions
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy bank_transactions_update on public.bank_transactions
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy bank_transactions_delete on public.bank_transactions
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Atomically posts a payment: validates the caller, the invoice, and the
-- bank account; blocks overpayment past the invoice's remaining balance;
-- inserts the payment; posts the two matching journal_entries legs
-- (sales: debit bank account / credit Accounts Receivable — purchase:
-- debit Accounts Payable / credit bank account).
-- Adding p_tds_section (Phase 32) changes this function's declared arity,
-- so `create or replace` alone would leave the old 6-arg version behind
-- as a separate overload (ambiguous-call risk) rather than replacing it —
-- the old signature must be dropped explicitly first.
drop function if exists public.post_payment(uuid, uuid, numeric, date, text, text);

create or replace function public.post_payment(
  p_invoice_id uuid,
  p_bank_account_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_mode text,
  p_bank_ref text,
  p_tds_section text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_invoice public.invoices;
  v_already_paid numeric(14, 2);
  v_ar_ap_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_payment public.payments;
  -- Phase 32: TDS WE deduct paying a vendor (payable side only — a
  -- customer deducting TDS from what they pay US is a different,
  -- deferred scenario, see ROADMAP.md). Computed on the full payment
  -- amount as a simplification, flagged for a CA to confirm the correct
  -- base (some sections exclude the GST component) — never hardcoded,
  -- always read from tds_rates via resolve_tds_rate(), same discipline
  -- CLAUDE.md section 3 already requires for GST.
  v_tds_rate numeric;
  v_tds_amount numeric(14, 2) := 0;
  v_tds_payable_account_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to record payments.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_payment_date);

  if p_mode not in ('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'other') then
    raise exception 'Invalid payment mode: %', p_mode;
  end if;
  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id;
  if not found then
    raise exception 'Invoice not found in your company.';
  end if;
  if v_invoice.status <> 'posted' then
    raise exception 'Cannot record a payment against a % invoice.', v_invoice.status;
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_bank_account_id and company_id = v_company_id and type = 'asset'
  ) then
    raise exception 'Bank/cash account not found, not in your company, or not an asset account.';
  end if;

  select coalesce(sum(amount), 0) into v_already_paid
    from public.payments where invoice_id = p_invoice_id and status = 'posted';
  if v_already_paid + p_amount > v_invoice.grand_total then
    raise exception 'Payment of % would exceed the invoice balance (already paid %, invoice total %).',
      p_amount, v_already_paid, v_invoice.grand_total;
  end if;

  select id into v_ar_ap_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_invoice.type = 'sales' then 'accounts_receivable' else 'accounts_payable' end;
  if v_ar_ap_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  if p_tds_section is not null then
    if v_invoice.type <> 'purchase' then
      raise exception 'TDS can only be deducted on a purchase-invoice payment.';
    end if;
    v_tds_rate := public.resolve_tds_rate(p_tds_section, p_payment_date);
    if v_tds_rate is null then
      raise exception 'No TDS rate found for section % as of %.', p_tds_section, p_payment_date;
    end if;
    v_tds_amount := round(p_amount * v_tds_rate / 100, 2);
    if v_tds_amount >= p_amount then
      raise exception 'Computed TDS (%) cannot exceed the payment amount (%).', v_tds_amount, p_amount;
    end if;
    select id into v_tds_payable_account_id from public.chart_of_accounts
      where company_id = v_company_id and system_role = 'tds_payable';
    if v_tds_payable_account_id is null then
      raise exception 'Missing system ledger account(s) for this company.';
    end if;
  end if;

  insert into public.payments (company_id, invoice_id, bank_account_id, amount, payment_date, mode, bank_ref, entry_group_id)
  values (v_company_id, p_invoice_id, p_bank_account_id, p_amount, p_payment_date, p_mode, p_bank_ref, v_entry_group)
  returning * into v_payment;

  if v_invoice.type = 'sales' then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_payment_date, p_bank_account_id, p_amount, 0, 'payment', v_payment.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_payment_date, v_ar_ap_account_id, 0, p_amount, 'payment', v_payment.id);
  else
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_payment_date, v_ar_ap_account_id, p_amount, 0, 'payment', v_payment.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_payment_date, p_bank_account_id, 0, p_amount - v_tds_amount, 'payment', v_payment.id);
    if v_tds_amount > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, p_payment_date, v_tds_payable_account_id, 0, v_tds_amount, 'payment', v_payment.id);
      insert into public.tds_transactions (
        company_id, payment_id, payee_party_id, section, taxable_base, rate, tds_amount
      ) values (
        v_company_id, v_payment.id, v_invoice.party_id, p_tds_section, p_amount, v_tds_rate, v_tds_amount
      );
    end if;
  end if;

  return v_payment;
end;
$$;

grant execute on function public.post_payment(uuid, uuid, numeric, date, text, text, text) to authenticated;

-- Reverses a posted payment the same way cancel_invoice() reverses an
-- invoice: a new entry_group with every leg's debit/credit swapped,
-- original rows untouched.
create or replace function public.cancel_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_company_id uuid;
  v_reversal_group uuid := gen_random_uuid();
  v_leg record;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to cancel payments.';
  end if;
  perform public.reject_if_period_closed(v_company_id, current_date);

  select * into v_payment from public.payments where id = p_payment_id and company_id = v_company_id;
  if not found then
    raise exception 'Payment not found in your company.';
  end if;
  if v_payment.status <> 'posted' then
    raise exception 'Only a posted payment can be cancelled (current status: %).', v_payment.status;
  end if;

  for v_leg in
    select account_id, debit, credit from public.journal_entries where entry_group_id = v_payment.entry_group_id
  loop
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_reversal_group, current_date, v_leg.account_id, v_leg.credit, v_leg.debit, 'payment_cancellation', v_payment.id);
  end loop;

  -- Phase 32: the reversal above already correctly undoes the TDS
  -- journal leg (it reverses every leg in the entry group generically) —
  -- this just removes the now-stale tds_transactions record so a TDS
  -- summary report doesn't keep showing a deduction that was reversed.
  delete from public.tds_transactions where payment_id = v_payment.id;

  update public.payments set status = 'cancelled' where id = v_payment.id returning * into v_payment;

  return v_payment;
end;
$$;

grant execute on function public.cancel_payment(uuid) to authenticated;

-- ============================================================
-- Week 3: Core Reports
-- ============================================================

-- Every journal_entries row with two independent running balances:
-- one continuous per account (the control-account view — e.g. all of
-- Accounts Receivable together), one per (account, party) pair (a
-- subsidiary/party sub-ledger — a single customer's own running balance,
-- independent of the control account's overall total). party_id is
-- derived by tracing reference_type/reference_id back to the invoice
-- (directly, or via the payment it belongs to). `security_invoker = true`
-- — see item_current_stock above; without it this view would run with the
-- view owner's privileges and bypass RLS on journal_entries/
-- chart_of_accounts/invoices/payments/parties for every querying user.
create view public.ledger_entries
with (security_invoker = true) as
select
  je.id,
  je.company_id,
  je.entry_date,
  je.account_id,
  coa.name as account_name,
  coa.type as account_type,
  coa.system_role as account_system_role,
  je.debit,
  je.credit,
  je.reference_type,
  je.reference_id,
  coalesce(inv1.party_id, inv2.party_id) as party_id,
  party.name as party_name,
  je.created_at,
  sum(je.debit - je.credit) over (
    partition by je.account_id
    order by je.entry_date, je.created_at
    rows between unbounded preceding and current row
  ) as account_running_balance,
  sum(je.debit - je.credit) over (
    partition by je.account_id, coalesce(inv1.party_id, inv2.party_id)
    order by je.entry_date, je.created_at
    rows between unbounded preceding and current row
  ) as party_running_balance
from public.journal_entries je
join public.chart_of_accounts coa on coa.id = je.account_id
left join public.invoices inv1 on je.reference_type in ('invoice', 'invoice_cancellation') and je.reference_id = inv1.id
left join public.payments pay on je.reference_type in ('payment', 'payment_cancellation') and je.reference_id = pay.id
left join public.invoices inv2 on pay.invoice_id = inv2.id
left join public.parties party on party.id = coalesce(inv1.party_id, inv2.party_id);

-- Cumulative debit/credit per account as of a given date. Not SECURITY
-- DEFINER — relies on RLS to scope to the caller's company, same as the
-- view above.
create function public.trial_balance(p_as_of date)
returns table (account_id uuid, account_name text, account_type text, total_debit numeric, total_credit numeric)
language sql
stable
as $$
  select coa.id, coa.name, coa.type,
    coalesce(sum(je.debit), 0), coalesce(sum(je.credit), 0)
  from public.chart_of_accounts coa
  left join public.journal_entries je on je.account_id = coa.id and je.entry_date <= p_as_of
  group by coa.id, coa.name, coa.type
  order by coa.type, coa.name;
$$;

grant execute on function public.trial_balance(date) to authenticated;

-- Income/expense movement between two dates — a period figure, unlike
-- the point-in-time trial balance / balance sheet.
create function public.profit_and_loss(p_from date, p_to date)
returns table (account_id uuid, account_name text, account_type text, net_amount numeric)
language sql
stable
as $$
  select coa.id, coa.name, coa.type,
    sum(case when coa.type = 'income' then je.credit - je.debit else je.debit - je.credit end)
  from public.chart_of_accounts coa
  join public.journal_entries je on je.account_id = coa.id
  where coa.type in ('income', 'expense')
    and je.entry_date between p_from and p_to
  group by coa.id, coa.name, coa.type
  order by coa.type, coa.name;
$$;

grant execute on function public.profit_and_loss(date, date) to authenticated;

-- Asset/liability/equity balances as of a date, plus a synthetic "Current
-- Earnings" equity line (cumulative income - expense to date). Without
-- it the balance sheet wouldn't actually balance: there's no separate
-- retained-earnings closing entry anywhere in this system, so cumulative
-- profit/loss has to show up in equity for assets = liabilities + equity
-- to hold.
create function public.balance_sheet(p_as_of date)
returns table (section text, account_name text, amount numeric)
language sql
stable
as $$
  select coa.type, coa.name,
    coalesce(sum(case when coa.type = 'asset' then je.debit - je.credit else je.credit - je.debit end), 0)
  from public.chart_of_accounts coa
  left join public.journal_entries je on je.account_id = coa.id and je.entry_date <= p_as_of
  where coa.type in ('asset', 'liability', 'equity')
  group by coa.id, coa.type, coa.name

  union all

  select 'equity', 'Current Earnings',
    coalesce(sum(je.credit - je.debit), 0)
  from public.chart_of_accounts coa
  join public.journal_entries je on je.account_id = coa.id and je.entry_date <= p_as_of
  where coa.type in ('income', 'expense');
$$;

grant execute on function public.balance_sheet(date) to authenticated;

-- ============================================================
-- Week 3–4: GST Summary Reports
-- ============================================================

-- GSTR-1-style sales register: one row per posted sales invoice in the
-- period. This is an EXPORT for a human/CA to file with — not an attempt
-- to reproduce the GST portal's exact filing schema (B2B/B2CS/HSN-summary
-- splits, etc.), which is compliance-judgment territory this app isn't
-- qualified to decide (see CLAUDE.md section 8). No SQL object needed:
-- the frontend queries public.invoices directly (already RLS-scoped).
-- Cancelled invoices are excluded — if one was posted in this period and
-- cancelled in a LATER period after this period's return was already
-- filed, the correct GST treatment is a credit note in the later period,
-- not silently rewriting this period's register. No credit-note feature
-- exists yet, so that case is a known gap, flagged in the UI, not solved
-- here.

-- GSTR-3B-style summary: total outward taxable supplies (sales) and
-- inward supplies eligible for ITC (purchases) in a period, split by
-- CGST/SGST/IGST. Deliberately does NOT compute a final "net tax
-- payable" — the input-tax-credit set-off order (IGST credit must offset
-- IGST liability before CGST/SGST, etc.) is a real compliance rule that
-- can change and shouldn't be hardcoded with false confidence; a CA
-- applies that to the raw figures below.
-- Invoices are included regardless of later cancellation — an invoice
-- dated in this period genuinely was a supply in this period, whatever
-- happens to it afterward. The correction instead shows up as its own
-- "less: credit/debit notes" line, dated when the note was actually
-- issued — so a period already filed never silently changes underneath
-- you just because something got cancelled later.
create function public.gstr3b_summary(p_from date, p_to date)
returns table (label text, taxable_value numeric, cgst numeric, sgst numeric, igst numeric)
language sql
stable
as $$
  select
    'Outward taxable supplies (Sales)',
    coalesce(sum(i.subtotal), 0), coalesce(sum(i.cgst_total), 0), coalesce(sum(i.sgst_total), 0), coalesce(sum(i.igst_total), 0)
  from public.invoices i
  where i.type = 'sales' and i.invoice_date between p_from and p_to

  union all

  select
    'Less: sales credit notes issued this period',
    -coalesce(sum(cn.subtotal), 0), -coalesce(sum(cn.cgst_total), 0), -coalesce(sum(cn.sgst_total), 0), -coalesce(sum(cn.igst_total), 0)
  from public.credit_notes cn
  where cn.type = 'sales' and cn.note_date between p_from and p_to

  union all

  select
    'Inward supplies eligible for ITC (Purchases)',
    coalesce(sum(i.subtotal), 0), coalesce(sum(i.cgst_total), 0), coalesce(sum(i.sgst_total), 0), coalesce(sum(i.igst_total), 0)
  from public.invoices i
  where i.type = 'purchase' and i.invoice_date between p_from and p_to

  union all

  select
    'Less: purchase debit notes issued this period',
    -coalesce(sum(cn.subtotal), 0), -coalesce(sum(cn.cgst_total), 0), -coalesce(sum(cn.sgst_total), 0), -coalesce(sum(cn.igst_total), 0)
  from public.credit_notes cn
  where cn.type = 'purchase' and cn.note_date between p_from and p_to;
$$;

grant execute on function public.gstr3b_summary(date, date) to authenticated;

-- ============================================================
-- Week 4+: Payroll (basic, fixed salary + deductions — ROADMAP.md
-- section 0's literal scope, not a statutory-deduction engine)
-- ============================================================

-- employees — plain editable master data, same shape as parties/items.
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  employee_code text,
  join_date date not null,
  monthly_gross_salary numeric(14, 2) not null check (monthly_gross_salary >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy employees_select on public.employees
  for select using (company_id = public.current_user_company_id());
create policy employees_write on public.employees
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy employees_update on public.employees
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy employees_delete on public.employees
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- payroll_runs — one row per employee per month. Immutable once posted,
-- same reasoning as invoices/payments — no correction feature here (a
-- mistake gets adjusted in next month's run, which is how real payroll
-- corrections normally happen; a "cancel payroll run" reversal wasn't
-- asked for and isn't built). Deduction amounts are plain data-entry
-- fields, not computed from any hardcoded PF/ESI/professional-tax rate —
-- CLAUDE.md section 8: those are compliance judgment for a CA to confirm,
-- never decided by this app, same principle as tax_rates never being
-- hardcoded in application code.
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  employee_id uuid not null references public.employees (id),
  run_month date not null,
  gross_salary numeric(14, 2) not null check (gross_salary > 0),
  pf_deduction numeric(14, 2) not null default 0 check (pf_deduction >= 0),
  esi_deduction numeric(14, 2) not null default 0 check (esi_deduction >= 0),
  professional_tax_deduction numeric(14, 2) not null default 0 check (professional_tax_deduction >= 0),
  other_deductions numeric(14, 2) not null default 0 check (other_deductions >= 0),
  total_deductions numeric(14, 2) not null,
  net_pay numeric(14, 2) not null,
  bank_account_id uuid not null references public.chart_of_accounts (id),
  salary_expense_account_id uuid not null references public.chart_of_accounts (id),
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint payroll_runs_one_per_employee_month unique (company_id, employee_id, run_month),
  constraint payroll_runs_totals_consistent
    check (total_deductions = pf_deduction + esi_deduction + professional_tax_deduction + other_deductions),
  constraint payroll_runs_net_pay_consistent check (net_pay = gross_salary - total_deductions),
  constraint payroll_runs_net_pay_not_negative check (net_pay >= 0)
);

alter table public.payroll_runs enable row level security;

-- No insert/update/delete policies — all writes happen through
-- post_payroll_run() (SECURITY DEFINER), same reasoning as invoices.
create policy payroll_runs_select on public.payroll_runs
  for select using (company_id = public.current_user_company_id());

-- Atomically posts one employee's payroll for a month: validates the
-- caller, the employee, and the two chosen accounts (salary_expense_
-- account_id is user-picked like invoices' revenue/expense account —
-- a business may classify salary under different expense accounts;
-- bank_account_id reuses the exact same picker pattern as payments).
-- Deductions Payable is the one auto-seeded system account (structurally
-- singular, like Accounts Receivable), found by system_role, not picked.
-- run_month is normalized to the first of its month so a duplicate run
-- for the same employee+month is caught by the unique constraint above
-- regardless of what day of the month the caller passes in.
create function public.post_payroll_run(
  p_employee_id uuid,
  p_run_month date,
  p_gross_salary numeric,
  p_pf_deduction numeric default 0,
  p_esi_deduction numeric default 0,
  p_professional_tax_deduction numeric default 0,
  p_other_deductions numeric default 0,
  p_salary_expense_account_id uuid default null,
  p_bank_account_id uuid default null
)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_employee public.employees;
  v_deductions_payable_account_id uuid;
  v_total_deductions numeric(14, 2);
  v_net_pay numeric(14, 2);
  v_run_month date;
  v_entry_group uuid := gen_random_uuid();
  v_run public.payroll_runs;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to run payroll.';
  end if;

  select * into v_employee from public.employees where id = p_employee_id and company_id = v_company_id;
  if not found then
    raise exception 'Employee not found in your company.';
  end if;
  if v_employee.status <> 'active' then
    raise exception 'Cannot run payroll for an inactive employee.';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_salary_expense_account_id and company_id = v_company_id and type = 'expense'
  ) then
    raise exception 'Salary expense account not found, not in your company, or not an expense account.';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_bank_account_id and company_id = v_company_id and type = 'asset'
  ) then
    raise exception 'Bank/cash account not found, not in your company, or not an asset account.';
  end if;

  select id into v_deductions_payable_account_id
    from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'deductions_payable';
  if v_deductions_payable_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  v_run_month := date_trunc('month', p_run_month)::date;
  v_total_deductions := p_pf_deduction + p_esi_deduction + p_professional_tax_deduction + p_other_deductions;
  v_net_pay := p_gross_salary - v_total_deductions;

  if v_net_pay < 0 then
    raise exception 'Deductions (%) exceed gross salary (%).', v_total_deductions, p_gross_salary;
  end if;

  if exists (
    select 1 from public.payroll_runs
    where employee_id = p_employee_id and run_month = v_run_month
  ) then
    raise exception 'Payroll has already been run for this employee for %.', to_char(v_run_month, 'Mon YYYY');
  end if;

  insert into public.payroll_runs (
    company_id, employee_id, run_month, gross_salary,
    pf_deduction, esi_deduction, professional_tax_deduction, other_deductions,
    total_deductions, net_pay, bank_account_id, salary_expense_account_id, entry_group_id
  ) values (
    v_company_id, p_employee_id, v_run_month, p_gross_salary,
    p_pf_deduction, p_esi_deduction, p_professional_tax_deduction, p_other_deductions,
    v_total_deductions, v_net_pay, p_bank_account_id, p_salary_expense_account_id, v_entry_group
  ) returning * into v_run;

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, v_run_month, p_salary_expense_account_id, p_gross_salary, 0, 'payroll_run', v_run.id);
  if v_total_deductions > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, v_run_month, v_deductions_payable_account_id, 0, v_total_deductions, 'payroll_run', v_run.id);
  end if;
  if v_net_pay > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, v_run_month, p_bank_account_id, 0, v_net_pay, 'payroll_run', v_run.id);
  end if;

  return v_run;
end;
$$;

grant execute on function public.post_payroll_run(uuid, date, numeric, numeric, numeric, numeric, numeric, uuid, uuid) to authenticated;

-- Phase 8: GST Rate Change Alerts. This table is company-independent
-- (GST law changes affect every company the same way), so it has no
-- company_id. The cron endpoint writes rows using the service-role key
-- (bypasses RLS entirely, same pattern as api/manage-user.js); no
-- insert/delete policy exists for normal users. Nothing here ever writes
-- to tax_rates — a human always reviews and edits that table manually
-- (CLAUDE.md section 3).
create table public.gst_notification_log (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  notification_found boolean not null,
  page_hash text not null,
  reviewed_by_user uuid references public.users (id),
  reviewed_at timestamptz
);

alter table public.gst_notification_log enable row level security;

create policy gst_notification_log_select on public.gst_notification_log
  for select using (auth.role() = 'authenticated');

-- Only marking a row reviewed is a client-side write; admins only.
create policy gst_notification_log_update on public.gst_notification_log
  for update using (public.current_user_role() = 'admin');

-- ============================================================
-- Phase 12: Subscriptions
-- ============================================================

-- subscriptions — a customer's recurring plan. Plain editable master data.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  party_id uuid not null references public.parties (id),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  start_date date not null,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy subscriptions_select on public.subscriptions
  for select using (company_id = public.current_user_company_id());
create policy subscriptions_write on public.subscriptions
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy subscriptions_update on public.subscriptions
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy subscriptions_delete on public.subscriptions
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- subscription_cycles — one row per billing cycle. Each cycle's items are
-- whatever was actually included THAT cycle (variable, not a fixed box) —
-- see subscription_cycle_items below. A cycle is plain editable data while
-- 'draft' (staff can create one ahead of time to pre-select items for an
-- upcoming date, or the cron job in api/generate-subscription-cycles.js
-- creates one automatically once a cycle's date arrives with no draft
-- already there, copying the previous cycle's items as a starting point).
-- 'finalized' only ever happens via finalize_subscription_cycle() below,
-- which posts a real invoice through the existing post_invoice() — reused,
-- not duplicated — so a finalized cycle is exactly as immutable as any
-- other posted invoice. 'skipped' is a plain status flip (e.g. a paused
-- customer's cycle that was never going to be billed).
create table public.subscription_cycles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id),
  cycle_date date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'skipped')),
  invoice_id uuid references public.invoices (id),
  created_at timestamptz not null default now(),
  constraint subscription_cycles_unique unique (subscription_id, cycle_date)
);

alter table public.subscription_cycles enable row level security;

create policy subscription_cycles_select on public.subscription_cycles
  for select using (
    exists (
      select 1 from public.subscriptions s
      where s.id = subscription_cycles.subscription_id and s.company_id = public.current_user_company_id()
    )
  );
create policy subscription_cycles_write on public.subscription_cycles
  for insert with check (
    status = 'draft' and invoice_id is null
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_cycles.subscription_id and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  );
-- WITH CHECK keeps the client from ever setting status='finalized' or an
-- invoice_id directly — that transition only ever happens inside
-- finalize_subscription_cycle() (SECURITY DEFINER, bypasses RLS entirely).
create policy subscription_cycles_update on public.subscription_cycles
  for update using (
    status = 'draft'
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_cycles.subscription_id and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  )
  with check (status in ('draft', 'skipped') and invoice_id is null);
create policy subscription_cycles_delete on public.subscription_cycles
  for delete using (
    status = 'draft'
    and exists (
      select 1 from public.subscriptions s
      where s.id = subscription_cycles.subscription_id and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  );

-- subscription_cycle_items — variable per cycle, exactly like invoice line
-- items, but pre-invoice: this is what finalize_subscription_cycle() feeds
-- straight into post_invoice() as p_line_items.
create table public.subscription_cycle_items (
  id uuid primary key default gen_random_uuid(),
  subscription_cycle_id uuid not null references public.subscription_cycles (id),
  item_id uuid not null references public.items (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  created_at timestamptz not null default now()
);

alter table public.subscription_cycle_items enable row level security;

create policy subscription_cycle_items_select on public.subscription_cycle_items
  for select using (
    exists (
      select 1 from public.subscription_cycles sc
      join public.subscriptions s on s.id = sc.subscription_id
      where sc.id = subscription_cycle_items.subscription_cycle_id and s.company_id = public.current_user_company_id()
    )
  );
create policy subscription_cycle_items_write on public.subscription_cycle_items
  for insert with check (
    exists (
      select 1 from public.subscription_cycles sc
      join public.subscriptions s on s.id = sc.subscription_id
      where sc.id = subscription_cycle_items.subscription_cycle_id and sc.status = 'draft'
        and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  );
create policy subscription_cycle_items_update on public.subscription_cycle_items
  for update using (
    exists (
      select 1 from public.subscription_cycles sc
      join public.subscriptions s on s.id = sc.subscription_id
      where sc.id = subscription_cycle_items.subscription_cycle_id and sc.status = 'draft'
        and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  );
create policy subscription_cycle_items_delete on public.subscription_cycle_items
  for delete using (
    exists (
      select 1 from public.subscription_cycles sc
      join public.subscriptions s on s.id = sc.subscription_id
      where sc.id = subscription_cycle_items.subscription_cycle_id and sc.status = 'draft'
        and s.company_id = public.current_user_company_id()
        and public.current_user_role() in ('admin', 'accountant')
    )
  );

-- Finalizes a draft cycle into a real posted sales invoice, reusing
-- post_invoice() rather than duplicating its GST/ledger/stock logic.
-- SECURITY DEFINER bypasses RLS, so re-check everything RLS would have
-- checked — same discipline every other posting function follows. Calling
-- post_invoice() from in here still resolves the REAL caller's company/role
-- correctly: SECURITY DEFINER only elevates privileges for RLS purposes,
-- it doesn't change which request the session belongs to.
create function public.finalize_subscription_cycle(
  p_cycle_id uuid,
  p_revenue_account_id uuid
)
returns public.subscription_cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_cycle public.subscription_cycles;
  v_party_id uuid;
  v_line_items jsonb;
  v_invoice public.invoices;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to finalize subscription cycles.';
  end if;

  select sc.* into v_cycle
    from public.subscription_cycles sc
    join public.subscriptions s on s.id = sc.subscription_id
    where sc.id = p_cycle_id and s.company_id = v_company_id;
  if not found then
    raise exception 'Subscription cycle not found in your company.';
  end if;
  if v_cycle.status <> 'draft' then
    raise exception 'Only a draft cycle can be finalized (current status: %).', v_cycle.status;
  end if;

  select party_id into v_party_id from public.subscriptions where id = v_cycle.subscription_id;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity, 'rate', rate))
    into v_line_items
    from public.subscription_cycle_items
    where subscription_cycle_id = p_cycle_id;

  if v_line_items is null then
    raise exception 'This cycle has no items to invoice.';
  end if;

  v_invoice := public.post_invoice('sales', v_party_id, v_cycle.cycle_date, p_revenue_account_id, v_line_items, null);

  update public.subscription_cycles set status = 'finalized', invoice_id = v_invoice.id
    where id = p_cycle_id
    returning * into v_cycle;

  return v_cycle;
end;
$$;

grant execute on function public.finalize_subscription_cycle(uuid, uuid) to authenticated;

-- ============================================================
-- Phase 13: Enhanced Reporting
-- ============================================================

-- item_batch_status — remaining quantity per batch, for any item (raw
-- material or finished good). A plain view, not materialized. Backs both
-- the batch/expiry report and the finished-goods rows of stock_valuation()
-- below — one source of truth for "how much of this batch is left," not
-- duplicated in two places. `security_invoker = true` — see
-- item_current_stock above; required so it re-evaluates RLS on the
-- underlying item_batches/stock_ledger/items tables for whoever queries it.
create view public.item_batch_status
with (security_invoker = true) as
select
  ib.id as batch_id,
  ib.item_id,
  i.name as item_name,
  i.item_type,
  i.category,
  i.company_id,
  ib.expiry_date,
  ib.unit_cost,
  coalesce(sum(case when sl.direction = 'in' then sl.quantity else -sl.quantity end), 0) as remaining_quantity
from public.item_batches ib
join public.items i on i.id = ib.item_id
left join public.stock_ledger sl on sl.batch_id = ib.id
group by ib.id, ib.item_id, i.name, i.item_type, i.category, i.company_id, ib.expiry_date, ib.unit_cost
having coalesce(sum(case when sl.direction = 'in' then sl.quantity else -sl.quantity end), 0) > 0;

-- item_profitability(from, to) — revenue vs. cost of goods sold per
-- finished-good item over a date range. Revenue comes straight from
-- invoice_line_items (posted sales invoices only — a cancelled invoice's
-- lines are never counted). COGS comes from stock_ledger's 'out' movements
-- against item_batches.unit_cost — a cancellation's reversing 'in' row
-- nets itself out automatically, the same self-correcting trick
-- item_current_stock already relies on, so no separate invoice-status
-- filter is needed on that side.
create function public.item_profitability(p_from date, p_to date)
returns table (
  item_id uuid,
  item_name text,
  quantity_sold numeric,
  revenue numeric,
  cogs numeric,
  profit numeric
)
language sql
stable
as $$
  select
    i.id,
    i.name,
    coalesce(sale.qty, 0) as quantity_sold,
    coalesce(sale.revenue, 0) as revenue,
    coalesce(cost.cogs, 0) as cogs,
    coalesce(sale.revenue, 0) - coalesce(cost.cogs, 0) as profit
  from public.items i
  left join (
    select ili.item_id, sum(ili.quantity) as qty, sum(ili.taxable_value) as revenue
    from public.invoice_line_items ili
    join public.invoices inv on inv.id = ili.invoice_id
    where inv.type = 'sales' and inv.status = 'posted' and inv.invoice_date between p_from and p_to
    group by ili.item_id
  ) sale on sale.item_id = i.id
  left join (
    select sl.item_id,
      sum((case when sl.direction = 'out' then sl.quantity else -sl.quantity end) * coalesce(ib.unit_cost, 0)) as cogs
    from public.stock_ledger sl
    join public.item_batches ib on ib.id = sl.batch_id
    where sl.reference_type = 'invoice' and sl.movement_date between p_from and p_to
    group by sl.item_id
  ) cost on cost.item_id = i.id
  where i.item_type = 'finished_good'
  order by i.name;
$$;

grant execute on function public.item_profitability(date, date) to authenticated;

-- stock_valuation() — current stock × cost, right now. Raw materials use
-- items.average_cost (one running figure, not tracked per batch); finished
-- goods use item_batch_status (each batch may have a different unit_cost).
create function public.stock_valuation()
returns table (
  item_id uuid,
  item_name text,
  item_type text,
  detail text,
  quantity numeric,
  unit_cost numeric,
  total_value numeric
)
language sql
stable
as $$
  select ics.item_id, ics.name, i.item_type, 'current stock'::text,
    ics.current_stock, i.average_cost, ics.current_stock * coalesce(i.average_cost, 0)
  from public.item_current_stock ics
  join public.items i on i.id = ics.item_id
  where i.item_type = 'raw_material'
  union all
  select bs.item_id, bs.item_name, bs.item_type,
    'batch, expires ' || coalesce(bs.expiry_date::text, 'unknown'),
    bs.remaining_quantity, bs.unit_cost, bs.remaining_quantity * coalesce(bs.unit_cost, 0)
  from public.item_batch_status bs
  where bs.item_type = 'finished_good';
$$;

grant execute on function public.stock_valuation() to authenticated;

-- ============================================================
-- Phase 14: Master-Data Edit Log
-- ============================================================

-- audit_log — generic edit history for master data (items, parties,
-- tax_rates, chart_of_accounts): the tables that have plain update/delete
-- today with no history. Financial *postings* already have an audit trail
-- by construction (never edited/deleted, always reversed) — this is only
-- about master data. company_id is nullable because tax_rates has no
-- company_id at all (GST rates are global, not per-company) — its rows
-- always log company_id = null; the select policy below accounts for that.
-- Populated only by log_audit_change() below; never client-writable.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by_user uuid references public.users (id),
  changed_at timestamptz not null default now(),
  old_values jsonb,
  new_values jsonb
);

create index audit_log_record_idx on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;

-- Admin only — this shows OTHER users' actions, same sensitivity as the
-- users table's own "admin sees everyone, others see only themselves" rule.
create policy audit_log_select on public.audit_log
  for select using (
    public.current_user_role() = 'admin'
    and (company_id = public.current_user_company_id() or company_id is null)
  );

-- Generic trigger function: works on any table with a uuid "id" column,
-- via to_jsonb()->>'...' extraction rather than direct field access (NEW.id
-- would fail to compile against tables lacking a given column — jsonb
-- extraction just returns null for a missing key instead of erroring,
-- which is exactly what tax_rates' missing company_id needs).
create function public.log_audit_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_json jsonb;
  v_new_json jsonb;
begin
  -- TG_OP is always uppercase ('INSERT'/'UPDATE'/'DELETE') — compare
  -- case-insensitively, since the rest of this function already lowercases
  -- it for the action column.
  v_old_json := case when lower(tg_op) in ('update', 'delete') then to_jsonb(old) else null end;
  v_new_json := case when lower(tg_op) in ('insert', 'update') then to_jsonb(new) else null end;

  insert into public.audit_log (company_id, table_name, record_id, action, changed_by_user, old_values, new_values)
  values (
    coalesce(v_new_json ->> 'company_id', v_old_json ->> 'company_id')::uuid,
    tg_table_name,
    coalesce(v_new_json ->> 'id', v_old_json ->> 'id')::uuid,
    lower(tg_op),
    auth.uid(),
    v_old_json,
    v_new_json
  );

  return coalesce(new, old);
end;
$$;

create trigger items_audit after insert or update or delete on public.items
  for each row execute function public.log_audit_change();
create trigger parties_audit after insert or update or delete on public.parties
  for each row execute function public.log_audit_change();
create trigger tax_rates_audit after insert or update or delete on public.tax_rates
  for each row execute function public.log_audit_change();
create trigger chart_of_accounts_audit after insert or update or delete on public.chart_of_accounts
  for each row execute function public.log_audit_change();

-- ============================================================
-- Phase 18: Cash Flow / Fund Flow Reports
-- ============================================================

-- cash_flow_summary(from, to) — opening/net movement/closing per bank/cash
-- account over a period. "Bank/cash account" here means any asset account
-- with no system_role: every OTHER asset account (accounts_receivable,
-- input CGST/SGST/IGST, raw_material_inventory, finished_goods_inventory)
-- is already system-tagged, so a plain, untagged asset account is — in
-- this app's actual usage — always one a user set up as a bank/cash
-- account (same accounts post_payment's p_bank_account_id already points
-- at). If that assumption ever stops holding, this report is the one
-- place to revisit, not the accounting itself.
create function public.cash_flow_summary(p_from date, p_to date)
returns table (
  account_name text,
  opening_balance numeric,
  net_movement numeric,
  closing_balance numeric
)
language sql
stable
as $$
  select
    coa.name,
    coalesce(sum(case when je.entry_date < p_from then je.debit - je.credit else 0 end), 0),
    coalesce(sum(case when je.entry_date between p_from and p_to then je.debit - je.credit else 0 end), 0),
    coalesce(sum(case when je.entry_date <= p_to then je.debit - je.credit else 0 end), 0)
  from public.chart_of_accounts coa
  left join public.journal_entries je on je.account_id = coa.id
  where coa.type = 'asset' and coa.system_role is null
  group by coa.id, coa.name
  order by coa.name;
$$;

grant execute on function public.cash_flow_summary(date, date) to authenticated;

-- fund_flow_summary(from, to) — change in each balance-sheet account
-- between two dates, classified as a source or application of funds
-- (asset increase / liability-equity decrease = application; the reverse
-- = source). Deliberately scoped to balance-sheet accounts only, not a
-- full textbook "fund flow from operations" adjusting net profit for
-- non-cash items — that's real complexity this business doesn't need.
-- Computes both dates' balances in one query, joined internally by
-- account_id (balance_sheet() itself only exposes account_name, which
-- isn't safe to join two calls of it back together on). Includes a
-- synthetic "Net Profit for Period" row, same idea as balance_sheet()'s
-- own "Current Earnings" plug — without it, sources would never equal
-- application except in a period with exactly zero profit or loss, since
-- every real profit/loss shows up as a change in some asset/liability
-- account with nothing on the equity side to balance it here.
create function public.fund_flow_summary(p_from date, p_to date)
returns table (
  section text,
  account_name text,
  opening_balance numeric,
  closing_balance numeric,
  change numeric,
  classification text
)
language sql
stable
as $$
  with balances as (
    select
      coa.id,
      coa.type,
      coa.name,
      coalesce(sum(case when je.entry_date <= p_from then
        (case when coa.type = 'asset' then je.debit - je.credit else je.credit - je.debit end)
        else 0 end), 0) as opening,
      coalesce(sum(case when je.entry_date <= p_to then
        (case when coa.type = 'asset' then je.debit - je.credit else je.credit - je.debit end)
        else 0 end), 0) as closing
    from public.chart_of_accounts coa
    left join public.journal_entries je on je.account_id = coa.id
    where coa.type in ('asset', 'liability', 'equity')
    group by coa.id, coa.type, coa.name

    union all

    select null::uuid, 'equity', 'Net Profit for Period',
      coalesce(sum(case when je.entry_date <= p_from then je.credit - je.debit else 0 end), 0),
      coalesce(sum(case when je.entry_date <= p_to then je.credit - je.debit else 0 end), 0)
    from public.chart_of_accounts coa
    join public.journal_entries je on je.account_id = coa.id
    where coa.type in ('income', 'expense')
  )
  select
    type,
    name,
    opening,
    closing,
    closing - opening,
    case
      when type = 'asset' and closing - opening > 0 then 'application'
      when type = 'asset' and closing - opening < 0 then 'source'
      when type in ('liability', 'equity') and closing - opening > 0 then 'source'
      when type in ('liability', 'equity') and closing - opening < 0 then 'application'
      else 'none'
    end
  from balances
  where closing - opening <> 0
  order by type, name;
$$;

-- ============================================================
-- Phase 20: Multi-Branch Schema Retrofit
-- Pure schema plumbing — no branch-switcher UI yet (ROADMAP.md 5b). Every
-- table below gets a nullable branch_id that defaults to the caller's
-- company's default branch via current_user_default_branch_id(), so every
-- existing RPC (post_invoice, post_payment, post_production_entry,
-- post_payroll_run) and every plain client-side insert (employees,
-- custom_orders, subscriptions) picks it up automatically without any
-- code changes, since none of them name branch_id in their column list.
-- ============================================================

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  state_code text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one default branch per company.
create unique index branches_one_default_per_company
  on public.branches (company_id)
  where is_default;

alter table public.branches enable row level security;

create policy branches_select on public.branches
  for select using (company_id = public.current_user_company_id());
create policy branches_write on public.branches
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy branches_update on public.branches
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- One-time backfill: every company that existed before this migration gets
-- exactly one default branch, named after the company, using its own
-- state_code. Safe to run more than once (a company that already has a
-- default branch is skipped).
do $$
declare
  c record;
begin
  for c in select id, name, state_code from public.companies loop
    if not exists (
      select 1 from public.branches where company_id = c.id and is_default
    ) then
      insert into public.branches (company_id, name, state_code, is_default)
      values (c.id, c.name, c.state_code, true);
    end if;
  end loop;
end;
$$;

-- Resolves the caller's company's default branch — used only as a column
-- DEFAULT below, so branch_id populates itself on any insert that doesn't
-- explicitly set it. Same security-definer pattern as
-- current_user_company_id(), scoped the same way.
create function public.current_user_default_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.branches
  where company_id = public.current_user_company_id() and is_default
  limit 1;
$$;

alter table public.invoices add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.payments add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.employees add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.payroll_runs add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.production_entries add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.custom_orders add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();
alter table public.subscriptions add column branch_id uuid
  references public.branches (id) default public.current_user_default_branch_id();

grant execute on function public.fund_flow_summary(date, date) to authenticated;

-- ============================================================
-- Phase 21: Quote Management
-- A quote has NO accounting impact — post_quote() never touches
-- journal_entries. Tax math is never reimplemented: every line calls the
-- same resolve_tax_rate()/calculate_gst_split() post_invoice() already
-- uses. Quotes are sales-only (no "type" column, unlike invoices) since
-- the workflow is always "quote a customer," never a vendor.
-- ============================================================

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id) default public.current_user_default_branch_id(),
  party_id uuid not null references public.parties (id),
  quote_number text not null,
  financial_year text not null,
  quote_date date not null,
  valid_until date,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  converted_invoice_id uuid references public.invoices (id),
  subtotal numeric(14, 2) not null default 0,
  cgst_total numeric(14, 2) not null default 0,
  sgst_total numeric(14, 2) not null default 0,
  igst_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  custom_order_id uuid references public.custom_orders (id),
  created_at timestamptz not null default now(),
  constraint quotes_unique_number unique (company_id, financial_year, quote_number),
  -- Same discipline as invoices_totals_consistent: the header must always
  -- equal the sum of the (already-rounded) line amounts.
  constraint quotes_totals_consistent check (grand_total = subtotal + cgst_total + sgst_total + igst_total)
);

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id),
  item_id uuid not null references public.items (id),
  hsn_sac_code text not null,
  quantity numeric(14, 2) not null,
  rate numeric(14, 2) not null,
  taxable_value numeric(14, 2) not null,
  tax_rate numeric(5, 2) not null,
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null
);

-- Separate counter from invoice_number_counters so quote and invoice
-- numbers can never collide, same atomic on-conflict pattern.
create table public.quote_number_counters (
  company_id uuid not null references public.companies (id),
  financial_year text not null,
  next_number integer not null default 1,
  primary key (company_id, financial_year)
);

alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.quote_number_counters enable row level security;

create policy quotes_select on public.quotes
  for select using (company_id = public.current_user_company_id());

create policy quote_line_items_select on public.quote_line_items
  for select using (
    exists (select 1 from public.quotes q where q.id = quote_id and q.company_id = public.current_user_company_id())
  );

-- quote_number_counters: RLS enabled, no policies — touched only inside
-- post_quote(), same as invoice_number_counters.

create or replace function public.post_quote(
  p_party_id uuid,
  p_quote_date date,
  p_line_items jsonb,
  p_valid_until date default null,
  p_custom_order_id uuid default null
)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_seller_state_code text;
  v_buyer_state_code text;
  v_fy text;
  v_seq int;
  v_quote_number text;
  v_quote public.quotes;
  v_subtotal numeric(14, 2) := 0;
  v_cgst numeric(14, 2) := 0;
  v_sgst numeric(14, 2) := 0;
  v_igst numeric(14, 2) := 0;
  v_grand numeric(14, 2);
  v_line jsonb;
  v_item record;
  v_tax_rate numeric;
  v_split record;
  v_taxable numeric(14, 2);
  v_line_cgst numeric(14, 2);
  v_line_sgst numeric(14, 2);
  v_line_igst numeric(14, 2);
  v_line_total numeric(14, 2);
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to create quotes.';
  end if;

  select state_code into v_seller_state_code from public.companies where id = v_company_id;

  select state_code into v_buyer_state_code
    from public.parties
    where id = p_party_id and company_id = v_company_id and type = 'customer';
  if v_buyer_state_code is null then
    raise exception 'Party not found, not in your company, or not a customer.';
  end if;

  if jsonb_array_length(p_line_items) = 0 then
    raise exception 'A quote needs at least one line item.';
  end if;

  if p_custom_order_id is not null and not exists (
    select 1 from public.custom_orders where id = p_custom_order_id and company_id = v_company_id
  ) then
    raise exception 'Custom order not found in your company.';
  end if;

  v_fy := public.financial_year_for(p_quote_date);

  insert into public.quote_number_counters (company_id, financial_year, next_number)
  values (v_company_id, v_fy, 2)
  on conflict (company_id, financial_year)
    do update set next_number = quote_number_counters.next_number + 1
  returning next_number - 1 into v_seq;

  v_quote_number := 'QT/' || v_fy || '/' || lpad(v_seq::text, 5, '0');

  insert into public.quotes (
    company_id, party_id, quote_number, financial_year, quote_date, valid_until, custom_order_id
  ) values (
    v_company_id, p_party_id, v_quote_number, v_fy, p_quote_date, p_valid_until, p_custom_order_id
  ) returning * into v_quote;

  for v_line in select * from jsonb_array_elements(p_line_items)
  loop
    select id, hsn_sac_code into v_item
      from public.items
      where id = (v_line->>'item_id')::uuid and company_id = v_company_id;
    if not found then
      raise exception 'Item % not found in your company.', v_line->>'item_id';
    end if;

    v_tax_rate := public.resolve_tax_rate(v_item.hsn_sac_code, p_quote_date);
    if v_tax_rate is null then
      raise exception 'No tax rate found for HSN/SAC % as of %.', v_item.hsn_sac_code, p_quote_date;
    end if;

    v_taxable := round((v_line->>'quantity')::numeric * (v_line->>'rate')::numeric, 2);

    select * into v_split from public.calculate_gst_split(v_seller_state_code, v_buyer_state_code, v_taxable, v_tax_rate);
    v_line_cgst := v_split.cgst;
    v_line_sgst := v_split.sgst;
    v_line_igst := v_split.igst;
    v_line_total := v_taxable + v_line_cgst + v_line_sgst + v_line_igst;

    insert into public.quote_line_items (
      quote_id, item_id, hsn_sac_code, quantity, rate, taxable_value, tax_rate,
      cgst_amount, sgst_amount, igst_amount, line_total
    ) values (
      v_quote.id, v_item.id, v_item.hsn_sac_code, (v_line->>'quantity')::numeric, (v_line->>'rate')::numeric,
      v_taxable, v_tax_rate, v_line_cgst, v_line_sgst, v_line_igst, v_line_total
    );

    v_subtotal := v_subtotal + v_taxable;
    v_cgst := v_cgst + v_line_cgst;
    v_sgst := v_sgst + v_line_sgst;
    v_igst := v_igst + v_line_igst;
  end loop;

  v_grand := v_subtotal + v_cgst + v_sgst + v_igst;

  update public.quotes
    set subtotal = v_subtotal, cgst_total = v_cgst, sgst_total = v_sgst, igst_total = v_igst, grand_total = v_grand
    where id = v_quote.id
    returning * into v_quote;

  return v_quote;
end;
$$;

grant execute on function public.post_quote(uuid, date, jsonb, date, uuid) to authenticated;

-- Status transitions only — deliberately the only client-facing way to
-- change a quote's status, since a plain client-side UPDATE policy can't
-- restrict which COLUMNS a request touches (RLS only gates which ROWS).
-- Without this, "mark as sent" and "silently rewrite grand_total" would be
-- the same permission. Never allowed to touch a converted quote, and never
-- allowed to set status to 'converted' itself — only
-- convert_quote_to_invoice() can do that.
create function public.update_quote_status(p_quote_id uuid, p_new_status text)
returns public.quotes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_quote public.quotes;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to update quotes.';
  end if;

  if p_new_status not in ('sent', 'accepted', 'rejected', 'expired') then
    raise exception 'Invalid status: %. Use convert_quote_to_invoice() to convert.', p_new_status;
  end if;

  select * into v_quote from public.quotes where id = p_quote_id and company_id = v_company_id;
  if not found then
    raise exception 'Quote not found in your company.';
  end if;
  if v_quote.status = 'converted' then
    raise exception 'This quote has already been converted to an invoice and can no longer be changed.';
  end if;

  update public.quotes set status = p_new_status where id = p_quote_id returning * into v_quote;
  return v_quote;
end;
$$;

grant execute on function public.update_quote_status(uuid, text) to authenticated;

-- Converts an accepted quote into a real posted invoice by calling the
-- existing post_invoice() — reusing invoice posting rather than
-- duplicating it. Uses TODAY's date for the invoice (not the quote's own
-- date), so it correctly picks up whatever tax rate actually applies at
-- the moment of sale via post_invoice()'s own resolve_tax_rate() call.
-- p_revenue_expense_account_id is required here (not stored on the quote
-- itself, since a quote has no ledger account until it becomes a real
-- sale) — chosen by whoever converts it, same as posting any sales invoice.
create function public.convert_quote_to_invoice(p_quote_id uuid, p_revenue_expense_account_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_quote public.quotes;
  v_line_items jsonb;
  v_invoice public.invoices;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to convert quotes.';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id and company_id = v_company_id;
  if not found then
    raise exception 'Quote not found in your company.';
  end if;
  if v_quote.status <> 'accepted' then
    raise exception 'Only an accepted quote can be converted to an invoice (current status: %).', v_quote.status;
  end if;
  if v_quote.converted_invoice_id is not null then
    raise exception 'This quote has already been converted.';
  end if;

  select jsonb_agg(jsonb_build_object('item_id', item_id, 'quantity', quantity, 'rate', rate))
    into v_line_items
    from public.quote_line_items
    where quote_id = p_quote_id;

  v_invoice := public.post_invoice(
    'sales', v_quote.party_id, current_date, p_revenue_expense_account_id, v_line_items, v_quote.custom_order_id
  );

  update public.quotes
    set status = 'converted', converted_invoice_id = v_invoice.id
    where id = p_quote_id;

  return v_invoice;
end;
$$;

grant execute on function public.convert_quote_to_invoice(uuid, uuid) to authenticated;

-- ============================================================
-- Phase 22: Customer Management Enhancements
-- Nullable, loosely validated contact/logistics fields — not financial
-- data, so this doesn't fall under the "never cut corners" validation
-- rule (that's reserved for GSTIN/amounts/dates/tax calculations).
-- ============================================================

alter table public.parties add column phone text;
alter table public.parties add column billing_address text;
alter table public.parties add column shipping_address text;

-- ============================================================
-- Phase 23: Advance/Deposit Payments (optional, per custom order)
-- An advance is a LIABILITY (goods or a refund owed) until applied to a
-- real invoice — it must never post straight to Accounts Receivable.
-- 14th system account added here: 'customer_advances' (liability) — see
-- the chart_of_accounts check constraints and seed_system_accounts()
-- above, both already updated to include it.
-- Known gap, out of scope for this phase: bank_transactions.
-- matched_payment_id only references payments(id), so an advance's own
-- bank inflow can't be matched through the existing Reconciliation screen
-- — widening that FK to be polymorphic would be a bigger structural
-- change than "optional, per custom order" calls for.
-- ============================================================

-- Backfill: give any company that existed before this migration its
-- customer_advances account too. Safe to run more than once.
do $$
declare
  c record;
begin
  for c in select id from public.companies loop
    perform public.seed_system_accounts(c.id);
  end loop;
end;
$$;

create table public.customer_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  custom_order_id uuid not null references public.custom_orders (id),
  party_id uuid not null references public.parties (id),
  amount numeric(14, 2) not null check (amount > 0),
  bank_account_id uuid not null references public.chart_of_accounts (id),
  advance_date date not null,
  status text not null default 'unapplied' check (status in ('unapplied', 'applied', 'refunded')),
  applied_invoice_id uuid references public.invoices (id),
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.customer_advances enable row level security;

create policy customer_advances_select on public.customer_advances
  for select using (company_id = public.current_user_company_id());

create function public.post_customer_advance(
  p_custom_order_id uuid,
  p_party_id uuid,
  p_amount numeric,
  p_bank_account_id uuid,
  p_advance_date date
)
returns public.customer_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_order_party_id uuid;
  v_advances_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_advance public.customer_advances;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to record advances.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_advance_date);

  if p_amount <= 0 then
    raise exception 'Advance amount must be greater than zero.';
  end if;

  select party_id into v_order_party_id
    from public.custom_orders where id = p_custom_order_id and company_id = v_company_id;
  if v_order_party_id is null then
    raise exception 'Custom order not found in your company.';
  end if;
  if v_order_party_id <> p_party_id then
    raise exception 'Party does not match this custom order''s own customer.';
  end if;

  if not exists (
    select 1 from public.parties where id = p_party_id and company_id = v_company_id and type in ('customer', 'both')
  ) then
    raise exception 'Party not found, not in your company, or not a customer.';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_bank_account_id and company_id = v_company_id and type = 'asset'
  ) then
    raise exception 'Bank/cash account not found, not in your company, or not an asset account.';
  end if;

  select id into v_advances_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'customer_advances';
  if v_advances_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.customer_advances (
    company_id, custom_order_id, party_id, amount, bank_account_id, advance_date, entry_group_id
  ) values (
    v_company_id, p_custom_order_id, p_party_id, p_amount, p_bank_account_id, p_advance_date, v_entry_group
  ) returning * into v_advance;

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_advance_date, p_bank_account_id, p_amount, 0, 'customer_advance', v_advance.id);
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_advance_date, v_advances_account_id, 0, p_amount, 'customer_advance', v_advance.id);

  return v_advance;
end;
$$;

grant execute on function public.post_customer_advance(uuid, uuid, numeric, uuid, date) to authenticated;

-- Applies the FULL advance amount to one invoice in a single shot — matches
-- the schema's one-shot applied_invoice_id FK, not a partial-tracking
-- ledger. Guards against over-applying beyond what the invoice actually
-- still owes, same discipline as post_payment()'s own balance check.
create function public.apply_advance_to_invoice(p_advance_id uuid, p_invoice_id uuid)
returns public.customer_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_advance public.customer_advances;
  v_invoice public.invoices;
  v_ar_account_id uuid;
  v_advances_account_id uuid;
  v_already_covered numeric(14, 2);
  v_entry_group uuid := gen_random_uuid();
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to apply advances.';
  end if;
  perform public.reject_if_period_closed(v_company_id, current_date);

  select * into v_advance from public.customer_advances where id = p_advance_id and company_id = v_company_id;
  if not found then
    raise exception 'Advance not found in your company.';
  end if;
  if v_advance.status <> 'unapplied' then
    raise exception 'This advance is % and cannot be applied.', v_advance.status;
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id;
  if not found then
    raise exception 'Invoice not found in your company.';
  end if;
  if v_invoice.type <> 'sales' or v_invoice.status <> 'posted' then
    raise exception 'Can only apply an advance to a posted sales invoice.';
  end if;
  if v_invoice.party_id <> v_advance.party_id then
    raise exception 'This advance belongs to a different customer than the invoice.';
  end if;

  select coalesce(sum(p.amount), 0) + coalesce((
    select sum(amount) from public.customer_advances
    where applied_invoice_id = p_invoice_id and status = 'applied'
  ), 0) into v_already_covered
  from public.payments p where p.invoice_id = p_invoice_id and p.status = 'posted';

  if v_already_covered + v_advance.amount > v_invoice.grand_total then
    raise exception 'Applying % would exceed the invoice balance (already covered %, invoice total %).',
      v_advance.amount, v_already_covered, v_invoice.grand_total;
  end if;

  select id into v_ar_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'accounts_receivable';
  select id into v_advances_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'customer_advances';
  if v_ar_account_id is null or v_advances_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, current_date, v_advances_account_id, v_advance.amount, 0, 'customer_advance_applied', v_advance.id);
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, current_date, v_ar_account_id, 0, v_advance.amount, 'customer_advance_applied', v_advance.id);

  update public.customer_advances
    set status = 'applied', applied_invoice_id = p_invoice_id
    where id = p_advance_id
    returning * into v_advance;

  return v_advance;
end;
$$;

grant execute on function public.apply_advance_to_invoice(uuid, uuid) to authenticated;

-- Reverses the ORIGINAL post_customer_advance() posting exactly (never
-- edits it) — only allowed while still unapplied, for a custom order that
-- falls through after a deposit was taken.
create function public.refund_customer_advance(p_advance_id uuid)
returns public.customer_advances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_advance public.customer_advances;
  v_advances_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to refund advances.';
  end if;
  perform public.reject_if_period_closed(v_company_id, current_date);

  select * into v_advance from public.customer_advances where id = p_advance_id and company_id = v_company_id;
  if not found then
    raise exception 'Advance not found in your company.';
  end if;
  if v_advance.status <> 'unapplied' then
    raise exception 'This advance is % and cannot be refunded directly.', v_advance.status;
  end if;

  select id into v_advances_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'customer_advances';
  if v_advances_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, current_date, v_advances_account_id, v_advance.amount, 0, 'customer_advance_refund', v_advance.id);
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, current_date, v_advance.bank_account_id, 0, v_advance.amount, 'customer_advance_refund', v_advance.id);

  update public.customer_advances set status = 'refunded' where id = p_advance_id returning * into v_advance;

  return v_advance;
end;
$$;

grant execute on function public.refund_customer_advance(uuid) to authenticated;

-- Redefines invoice_payment_status (originally created earlier in this
-- file, payments-only) to also fold in applied customer_advances — see
-- the comment on the original definition above for why.
create or replace view public.invoice_payment_status
with (security_invoker = true) as
select
  i.id as invoice_id,
  i.company_id,
  i.type,
  i.invoice_number,
  i.grand_total,
  coalesce(sum(p.amount), 0) + coalesce(adv.applied_amount, 0) as amount_paid,
  i.grand_total - coalesce(sum(p.amount), 0) - coalesce(adv.applied_amount, 0) as balance_due
from public.invoices i
left join public.payments p on p.invoice_id = i.id and p.status = 'posted'
left join (
  select applied_invoice_id, sum(amount) as applied_amount
  from public.customer_advances
  where status = 'applied'
  group by applied_invoice_id
) adv on adv.applied_invoice_id = i.id
where i.status = 'posted'
group by i.id, adv.applied_amount;

-- ============================================================
-- Phase 26 — Repository & Platform Hygiene
-- No new tables. Supabase requires explicit Postgres grants for
-- PostgREST/Data-API access on any table created on or after
-- October 30, 2026 (existing tables, including everything above this
-- point, keep their current implicit grants and are unaffected). From
-- this point on, every `create table` in this file must be followed by:
--
--   grant select, insert, update, delete on public.<table> to authenticated;
--   grant all on public.<table> to service_role;
--
-- (narrower per-role grants where a table is read-only for `authenticated`,
-- matching whatever the table's own RLS policies already allow). RLS still
-- does the actual authorization — these grants only make the table
-- reachable through PostgREST at all.
-- ============================================================

-- ============================================================
-- Phase 27 — Accounting Periods & Reporting Dimensions
-- ============================================================

-- No overlap-prevention constraint: not needed for correctness (the guard
-- below blocks a date if ANY closed period contains it, whether or not
-- periods are tidy/non-overlapping), and adding one would need the
-- btree_gist extension for no real benefit at this business's scale.
create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  unique (company_id, period_start, period_end)
);

grant select, insert, update, delete on public.accounting_periods to authenticated;
grant all on public.accounting_periods to service_role;

alter table public.accounting_periods enable row level security;

create policy accounting_periods_select on public.accounting_periods
  for select using (company_id = public.current_user_company_id());
-- Only admin can create/close/reopen a period — matches how this app
-- already treats admin as the top authority (e.g. can_manage_users).
create policy accounting_periods_write on public.accounting_periods
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() = 'admin'
  );
create policy accounting_periods_update on public.accounting_periods
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() = 'admin'
  );

-- Shared guard called from every posting/reversal function below — blocks
-- writing a journal-affecting transaction dated inside a closed accounting
-- period. Not security definer itself: called only from within already-
-- security-definer posting functions, so it inherits their elevated
-- context at call time (same pattern already used by
-- resolve_tax_rate()/calculate_gst_split()).
create function public.reject_if_period_closed(p_company_id uuid, p_date date)
returns void
language plpgsql
as $$
begin
  if exists (
    select 1 from public.accounting_periods
    where company_id = p_company_id
      and status = 'closed'
      and p_date between period_start and period_end
  ) then
    raise exception 'Cannot post: % falls in a closed accounting period.', p_date;
  end if;
end;
$$;

grant execute on function public.reject_if_period_closed(uuid, date) to authenticated;

-- Cloud Kitchen / Consulting / R&D / Administration — plain text, not a
-- new table, since the set of business units is small and stable for this
-- business. Nullable: existing rows and every current posting path are
-- unaffected until a business_unit is actually chosen somewhere.
alter table public.invoices add column business_unit text;
alter table public.journal_entries add column business_unit text;

-- AR/AP aging. Buckets are by days since invoice_date, not a formal due
-- date (invoices don't carry payment terms yet) — "Current" means the
-- invoice itself is 0-30 days old, not "not yet due". Read-only, invoker
-- rights (not security definer): runs under the caller's own RLS, exactly
-- like trial_balance()/profit_and_loss() above.
create function public.ar_ap_aging(p_type text, p_as_of date default current_date)
returns table (
  invoice_id uuid,
  party_id uuid,
  party_name text,
  invoice_number text,
  invoice_date date,
  grand_total numeric,
  balance_due numeric,
  days_outstanding int,
  bucket text
)
language sql
stable
as $$
  select
    ips.invoice_id, i.party_id, pt.name, ips.invoice_number, i.invoice_date,
    ips.grand_total, ips.balance_due,
    (p_as_of - i.invoice_date)::int as days_outstanding,
    case
      when (p_as_of - i.invoice_date) <= 30 then 'Current (0-30)'
      when (p_as_of - i.invoice_date) <= 60 then '31-60'
      when (p_as_of - i.invoice_date) <= 90 then '61-90'
      else '90+'
    end as bucket
  from public.invoice_payment_status ips
  join public.invoices i on i.id = ips.invoice_id
  join public.parties pt on pt.id = i.party_id
  where ips.type = p_type and ips.balance_due > 0.005
  order by i.invoice_date;
$$;

grant execute on function public.ar_ap_aging(text, date) to authenticated;

-- Per-party statement: a chronological list of invoice/payment events for
-- one party, reusing existing data — not a new sub-ledger. Running balance
-- is left for the client to sum in order (one plain SELECT, ponytail
-- minimalism — no need for a window-function balance column server-side).
create function public.party_statement(p_party_id uuid, p_from date, p_to date)
returns table (
  event_date date,
  event_type text,
  reference_number text,
  debit numeric,
  credit numeric
)
language sql
stable
as $$
  select i.invoice_date, 'invoice', i.invoice_number,
    case when i.type = 'sales' then i.grand_total else 0 end,
    case when i.type = 'purchase' then i.grand_total else 0 end
  from public.invoices i
  where i.party_id = p_party_id and i.status = 'posted' and i.invoice_date between p_from and p_to
  union all
  select p.payment_date, 'payment', coalesce(p.bank_ref, ''),
    case when i.type = 'purchase' then p.amount else 0 end,
    case when i.type = 'sales' then p.amount else 0 end
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  where i.party_id = p_party_id and p.status = 'posted' and p.payment_date between p_from and p_to
  order by 1;
$$;

grant execute on function public.party_statement(uuid, date, date) to authenticated;

-- ============================================================
-- Phase 28 — Master Data: Units, Warehouses, Flexible Party Roles
-- ============================================================

create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;

alter table public.units enable row level security;

create policy units_select on public.units
  for select using (company_id = public.current_user_company_id());
create policy units_write on public.units
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy units_update on public.units
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy units_delete on public.units
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- 1 from_unit = factor * to_unit (e.g. 1 kg = 1000 * 1 g).
create table public.unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  from_unit_id uuid not null references public.units (id),
  to_unit_id uuid not null references public.units (id),
  factor numeric(14, 6) not null check (factor > 0),
  created_at timestamptz not null default now(),
  unique (from_unit_id, to_unit_id)
);

grant select, insert, update, delete on public.unit_conversions to authenticated;
grant all on public.unit_conversions to service_role;

alter table public.unit_conversions enable row level security;

create policy unit_conversions_select on public.unit_conversions
  for select using (company_id = public.current_user_company_id());
create policy unit_conversions_write on public.unit_conversions
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy unit_conversions_update on public.unit_conversions
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy unit_conversions_delete on public.unit_conversions
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- items keeps its existing `unit` text column as-is; unit_id is additive,
-- not a replacement — nothing existing breaks, and no current screen
-- reads or writes it yet.
alter table public.items add column unit_id uuid references public.units (id);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid not null references public.branches (id),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one default warehouse per branch (same pattern as
-- branches_one_default_per_company above).
create unique index warehouses_one_default_per_branch
  on public.warehouses (branch_id)
  where is_default;

grant select, insert, update, delete on public.warehouses to authenticated;
grant all on public.warehouses to service_role;

alter table public.warehouses enable row level security;

create policy warehouses_select on public.warehouses
  for select using (company_id = public.current_user_company_id());
create policy warehouses_write on public.warehouses
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy warehouses_update on public.warehouses
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Backfill: give every existing branch its own default warehouse, same
-- reasoning as Phase 20's branch backfill. Safe to run more than once
-- (skips a branch that already has one).
do $$
declare
  b record;
begin
  for b in select id, company_id, name from public.branches loop
    if not exists (select 1 from public.warehouses where branch_id = b.id and is_default) then
      insert into public.warehouses (company_id, branch_id, name, is_default)
      values (b.company_id, b.id, b.name || ' - Main Warehouse', true);
    end if;
  end loop;
end $$;

-- Nullable, additive — no existing insert into stock_ledger/item_batches
-- names these columns, so every current posting path is unaffected.
alter table public.stock_ledger add column warehouse_id uuid references public.warehouses (id);
alter table public.item_batches add column warehouse_id uuid references public.warehouses (id);

-- parties.type widened to allow 'both' — a party can be billed as a
-- customer and paid as a vendor without a full party-role-table rewrite.
-- post_invoice() and post_customer_advance() above are updated (in place)
-- to treat 'both' as satisfying either role check, so this is actually
-- usable, not just a decorative value.
alter table public.parties drop constraint parties_type_check;
alter table public.parties add constraint parties_type_check check (type in ('customer', 'vendor', 'both'));

-- ============================================================
-- Phase 29 — Sales Enhancements: Manual Credit/Debit Notes & AR Statements
-- ============================================================

-- credit_notes previously allowed at most one per invoice (the
-- cancel_invoice()-only full reversal). A manual partial note needs
-- multiple notes against the same invoice over time, so the uniqueness
-- goes away — replaced with a plain index for the same lookup performance.
alter table public.credit_notes drop constraint credit_notes_invoice_id_key;
create index credit_notes_invoice_id_idx on public.credit_notes (invoice_id);

alter table public.credit_notes add column reason text;

-- Same invariant post_invoice()'s own header already enforces: the header
-- must be a SUM of the (already-rounded) line amounts, never recomputed
-- independently. cancel_invoice()'s existing insert already satisfies this
-- (it copies the invoice's own already-consistent totals wholesale); the
-- new post_manual_credit_debit_note() below computes it the same way.
alter table public.credit_notes add constraint credit_notes_totals_consistent
  check (grand_total = subtotal + cgst_total + sgst_total + igst_total);

-- One row per invoice_line_item a manual note touches. Quantity-based
-- partial adjustments only (a returned quantity of a line) — a flat
-- price-only adjustment with no quantity change is a real, separate need
-- flagged in ROADMAP.md rather than built speculatively here.
create table public.credit_note_line_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references public.credit_notes (id),
  invoice_line_item_id uuid not null references public.invoice_line_items (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  taxable_value numeric(14, 2) not null,
  tax_rate numeric(5, 2) not null check (tax_rate >= 0),
  cgst_amount numeric(14, 2) not null default 0,
  sgst_amount numeric(14, 2) not null default 0,
  igst_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.credit_note_line_items to authenticated;
grant all on public.credit_note_line_items to service_role;

alter table public.credit_note_line_items enable row level security;

-- No company_id column here either, same reasoning as invoice_line_items
-- above — scoped by joining through credit_notes. No insert/update/delete
-- policy: all writes happen through post_manual_credit_debit_note().
create policy credit_note_line_items_select on public.credit_note_line_items
  for select using (
    exists (
      select 1 from public.credit_notes
      where credit_notes.id = credit_note_line_items.credit_note_id
        and credit_notes.company_id = public.current_user_company_id()
    )
  );

-- Issues a manual, partial credit/debit note against specific invoice
-- lines — for a partial return or price correction, distinct from
-- cancel_invoice()'s full reversal (which stays the only path that also
-- unwinds inventory/average_cost, and only ever for 100% of the invoice).
--
-- Each line's tax amounts are computed by PROPORTIONALLY SCALING that
-- line's own already-posted taxable_value/cgst/sgst/igst by
-- (adjusted quantity / original quantity) — never by re-resolving today's
-- tax rate or recomputing the same/different-state split from scratch.
-- This is deliberate: CLAUDE.md section 3 requires a posted invoice's
-- historical tax amounts never silently change if a rate is later
-- updated, and scaling the ORIGINAL line's own recorded amounts is the
-- only way to guarantee the note always agrees with what that invoice
-- actually posted, regardless of what tax_rates says today.
--
-- Known, deliberate limitation: this does not reverse stock_ledger
-- quantities, items.average_cost, or the Phase 10 COGS/finished-goods-
-- inventory posting for the returned quantity. A partial return of
-- physical goods still needs a separate manual stock adjustment for now —
-- flagged in ROADMAP.md rather than built speculatively, since correctly
-- unwinding weighted-average costing for a PARTIAL quantity (with
-- possibly other purchases/consumption having happened since) is a
-- meaningfully bigger, riskier problem than the financial correction here.
create or replace function public.post_manual_credit_debit_note(
  p_invoice_id uuid,
  p_reason text,
  p_line_adjustments jsonb -- [{invoice_line_item_id, quantity}, ...]
)
returns public.credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_invoice public.invoices;
  v_fy text;
  v_note_type text;
  v_note_prefix text;
  v_seq int;
  v_note_number text;
  v_entry_group uuid := gen_random_uuid();
  v_note public.credit_notes;
  v_adj jsonb;
  v_adj_qty numeric(14, 2);
  v_line public.invoice_line_items;
  v_already_credited numeric(14, 2);
  v_remaining numeric(14, 2);
  v_factor numeric(14, 6);
  v_line_taxable numeric(14, 2);
  v_line_cgst numeric(14, 2);
  v_line_sgst numeric(14, 2);
  v_line_igst numeric(14, 2);
  v_line_total numeric(14, 2);
  v_subtotal numeric(14, 2) := 0;
  v_cgst numeric(14, 2) := 0;
  v_sgst numeric(14, 2) := 0;
  v_igst numeric(14, 2) := 0;
  v_grand numeric(14, 2);
  v_ar_ap_account_id uuid;
  v_cgst_account_id uuid;
  v_sgst_account_id uuid;
  v_igst_account_id uuid;
  -- Purchase-side routing must mirror post_invoice()'s own split exactly
  -- (Phase 10): a raw-material line's taxable value reverses out of
  -- raw_material_inventory, everything else reverses out of the invoice's
  -- own picked revenue_expense_account_id. Sales has no such split — all
  -- revenue posts to one picked account regardless of item type.
  v_item_type text;
  v_subtotal_rm numeric(14, 2) := 0;
  v_subtotal_other numeric(14, 2) := 0;
  v_rm_inventory_account_id uuid;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to issue credit/debit notes.';
  end if;
  perform public.reject_if_period_closed(v_company_id, current_date);

  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id;
  if not found then
    raise exception 'Invoice not found in your company.';
  end if;
  if v_invoice.status <> 'posted' then
    raise exception 'Can only issue a credit/debit note against a posted invoice (current status: %).', v_invoice.status;
  end if;

  if jsonb_array_length(p_line_adjustments) = 0 then
    raise exception 'A credit/debit note needs at least one line adjustment.';
  end if;

  select id into v_ar_ap_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_invoice.type = 'sales' then 'accounts_receivable' else 'accounts_payable' end;
  select id into v_cgst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_invoice.type = 'sales' then 'output_cgst' else 'input_cgst' end;
  select id into v_sgst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_invoice.type = 'sales' then 'output_sgst' else 'input_sgst' end;
  select id into v_igst_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_invoice.type = 'sales' then 'output_igst' else 'input_igst' end;
  select id into v_rm_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'raw_material_inventory';
  if v_ar_ap_account_id is null or v_cgst_account_id is null or v_sgst_account_id is null or v_igst_account_id is null
     or v_rm_inventory_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  v_fy := public.financial_year_for(current_date);
  v_note_type := case when v_invoice.type = 'sales' then 'sales_credit_note' else 'purchase_debit_note' end;
  v_note_prefix := case when v_invoice.type = 'sales' then 'CN' else 'DN' end;

  insert into public.invoice_number_counters (company_id, invoice_type, financial_year, next_number)
  values (v_company_id, v_note_type, v_fy, 2)
  on conflict (company_id, invoice_type, financial_year)
    do update set next_number = invoice_number_counters.next_number + 1
  returning next_number - 1 into v_seq;

  v_note_number := v_note_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');

  insert into public.credit_notes (
    company_id, invoice_id, type, note_number, note_date, reason,
    subtotal, cgst_total, sgst_total, igst_total, grand_total, entry_group_id
  ) values (
    v_company_id, v_invoice.id, v_invoice.type, v_note_number, current_date, p_reason,
    0, 0, 0, 0, 0, v_entry_group
  ) returning * into v_note;

  for v_adj in select * from jsonb_array_elements(p_line_adjustments)
  loop
    select * into v_line
      from public.invoice_line_items
      where id = (v_adj->>'invoice_line_item_id')::uuid and invoice_id = p_invoice_id;
    if not found then
      raise exception 'Line item % does not belong to this invoice.', v_adj->>'invoice_line_item_id';
    end if;

    v_adj_qty := (v_adj->>'quantity')::numeric;
    if v_adj_qty <= 0 then
      raise exception 'Adjustment quantity must be greater than zero.';
    end if;

    select coalesce(sum(quantity), 0) into v_already_credited
      from public.credit_note_line_items where invoice_line_item_id = v_line.id;
    v_remaining := v_line.quantity - v_already_credited;
    if v_adj_qty > v_remaining then
      raise exception 'Cannot adjust % units of line %: only % remain (invoice quantity %, already adjusted %).',
        v_adj_qty, v_line.id, v_remaining, v_line.quantity, v_already_credited;
    end if;

    v_factor := v_adj_qty / v_line.quantity;
    v_line_taxable := round(v_line.taxable_value * v_factor, 2);
    v_line_cgst := round(v_line.cgst_amount * v_factor, 2);
    v_line_sgst := round(v_line.sgst_amount * v_factor, 2);
    v_line_igst := round(v_line.igst_amount * v_factor, 2);
    v_line_total := v_line_taxable + v_line_cgst + v_line_sgst + v_line_igst;

    insert into public.credit_note_line_items (
      credit_note_id, invoice_line_item_id, quantity, taxable_value, tax_rate,
      cgst_amount, sgst_amount, igst_amount, line_total
    ) values (
      v_note.id, v_line.id, v_adj_qty, v_line_taxable, v_line.tax_rate,
      v_line_cgst, v_line_sgst, v_line_igst, v_line_total
    );

    if v_invoice.type = 'purchase' then
      select item_type into v_item_type from public.items where id = v_line.item_id;
      if v_item_type = 'raw_material' then
        v_subtotal_rm := v_subtotal_rm + v_line_taxable;
      else
        v_subtotal_other := v_subtotal_other + v_line_taxable;
      end if;
    end if;

    v_subtotal := v_subtotal + v_line_taxable;
    v_cgst := v_cgst + v_line_cgst;
    v_sgst := v_sgst + v_line_sgst;
    v_igst := v_igst + v_line_igst;
  end loop;

  v_grand := v_subtotal + v_cgst + v_sgst + v_igst;

  update public.credit_notes
    set subtotal = v_subtotal, cgst_total = v_cgst, sgst_total = v_sgst, igst_total = v_igst, grand_total = v_grand
    where id = v_note.id
    returning * into v_note;

  -- Mirror image of post_invoice()'s own entries, at the note's (smaller)
  -- amounts — a sales credit note reduces revenue/output-tax and AR; a
  -- purchase debit note reduces AP and reverses the same account the
  -- original purchase used (raw_material_inventory for a raw-material
  -- line, otherwise the invoice's own picked revenue_expense_account_id —
  -- exactly the same routing post_invoice() itself used).
  if v_invoice.type = 'sales' then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, current_date, v_invoice.revenue_expense_account_id, v_subtotal, 0, 'credit_note', v_note.id);
    if v_cgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_cgst_account_id, v_cgst, 0, 'credit_note', v_note.id);
    end if;
    if v_sgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_sgst_account_id, v_sgst, 0, 'credit_note', v_note.id);
    end if;
    if v_igst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_igst_account_id, v_igst, 0, 'credit_note', v_note.id);
    end if;
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, current_date, v_ar_ap_account_id, 0, v_grand, 'credit_note', v_note.id);
  else
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, current_date, v_ar_ap_account_id, v_grand, 0, 'credit_note', v_note.id);
    if v_subtotal_rm > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_rm_inventory_account_id, 0, v_subtotal_rm, 'credit_note', v_note.id);
    end if;
    if v_subtotal_other > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_invoice.revenue_expense_account_id, 0, v_subtotal_other, 'credit_note', v_note.id);
    end if;
    if v_cgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_cgst_account_id, 0, v_cgst, 'credit_note', v_note.id);
    end if;
    if v_sgst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_sgst_account_id, 0, v_sgst, 'credit_note', v_note.id);
    end if;
    if v_igst > 0 then
      insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
        values (v_company_id, v_entry_group, current_date, v_igst_account_id, 0, v_igst, 'credit_note', v_note.id);
    end if;
  end if;

  return v_note;
end;
$$;

grant execute on function public.post_manual_credit_debit_note(uuid, text, jsonb) to authenticated;

-- Redefines invoice_payment_status again (see the two comments above this
-- one) to also fold in credit/debit notes. A manual partial note leaves
-- the invoice status='posted' (unlike a full cancel_invoice(), which
-- flips status to 'cancelled' and drops out of this view's own filter
-- entirely) — so without this, a partially-credited invoice would still
-- show its full original balance due, silently overstating AR aging
-- (Phase 27) and the Paid/Partially Paid label (this phase) by exactly
-- the credited amount.
create or replace view public.invoice_payment_status
with (security_invoker = true) as
select
  i.id as invoice_id,
  i.company_id,
  i.type,
  i.invoice_number,
  i.grand_total,
  coalesce(sum(p.amount), 0) + coalesce(adv.applied_amount, 0) + coalesce(cn.credited_amount, 0) as amount_paid,
  i.grand_total - coalesce(sum(p.amount), 0) - coalesce(adv.applied_amount, 0) - coalesce(cn.credited_amount, 0) as balance_due
from public.invoices i
left join public.payments p on p.invoice_id = i.id and p.status = 'posted'
left join (
  select applied_invoice_id, sum(amount) as applied_amount
  from public.customer_advances
  where status = 'applied'
  group by applied_invoice_id
) adv on adv.applied_invoice_id = i.id
left join (
  select invoice_id, sum(grand_total) as credited_amount
  from public.credit_notes
  group by invoice_id
) cn on cn.invoice_id = i.id
where i.status = 'posted'
group by i.id, adv.applied_amount, cn.credited_amount;

-- ============================================================
-- Phase 30 — Cloud Kitchen: Wastage & Delivery Settlement
-- ============================================================

-- Wastage — spoilage/expiry/damage/loss write-off for a raw material or
-- finished good. Reuses consume_item_fefo() (Phase 10) for the actual
-- stock consumption and cost basis, exactly like a sale or production
-- consumption does — never a second stock-reduction implementation.
create table public.wastage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id) default public.current_user_default_branch_id(),
  item_id uuid not null references public.items (id),
  quantity numeric(14, 2) not null check (quantity > 0),
  reason text not null check (reason in (
    'spoilage', 'expired', 'damaged', 'production_loss', 'preparation_loss', 'quality_rejection', 'other'
  )),
  wastage_date date not null,
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.wastage to authenticated;
grant all on public.wastage to service_role;

alter table public.wastage enable row level security;

create policy wastage_select on public.wastage
  for select using (company_id = public.current_user_company_id());
-- No insert/update/delete policy — all writes happen through
-- post_wastage(), same reasoning as every other posting table.

-- Always posts the expense (never "where configured") — silently letting
-- a write-off skip the P&L would understate a real cost, which CLAUDE.md
-- section 5's minimalism carve-outs explicitly except ("financial
-- calculations... never cut corners").
create or replace function public.post_wastage(
  p_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_wastage_date date
)
returns public.wastage
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_item record;
  v_cost numeric(14, 2);
  v_wastage_expense_account_id uuid;
  v_inventory_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_wastage public.wastage;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to record wastage.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_wastage_date);

  if p_reason not in ('spoilage', 'expired', 'damaged', 'production_loss', 'preparation_loss', 'quality_rejection', 'other') then
    raise exception 'Invalid wastage reason: %', p_reason;
  end if;

  select item_type into v_item from public.items where id = p_item_id and company_id = v_company_id and type = 'good';
  if not found then
    raise exception 'Item not found in your company, or not a physical good.';
  end if;

  select id into v_wastage_expense_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'wastage_expense';
  select id into v_inventory_account_id from public.chart_of_accounts
    where company_id = v_company_id
      and system_role = case when v_item.item_type = 'raw_material' then 'raw_material_inventory' else 'finished_goods_inventory' end;
  if v_wastage_expense_account_id is null or v_inventory_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.wastage (company_id, item_id, quantity, reason, wastage_date, entry_group_id)
  values (v_company_id, p_item_id, p_quantity, p_reason, p_wastage_date, v_entry_group)
  returning * into v_wastage;

  v_cost := public.consume_item_fefo(v_company_id, p_item_id, p_quantity, 'wastage', v_wastage.id, p_wastage_date);

  update public.wastage set cost = v_cost where id = v_wastage.id returning * into v_wastage;

  if v_cost > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_wastage_date, v_wastage_expense_account_id, v_cost, 0, 'wastage', v_wastage.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_wastage_date, v_inventory_account_id, 0, v_cost, 'wastage', v_wastage.id);
  end if;

  return v_wastage;
end;
$$;

grant execute on function public.post_wastage(uuid, numeric, text, date) to authenticated;

-- Delivery platforms (Swiggy, Zomato, etc.) — not "in-store": walk-in
-- sales settle immediately with no commission deducted and use the
-- existing post_payment() flow unchanged. Only online platforms that pay
-- out later, net of commission, need this settlement/reconciliation layer.
create table public.delivery_platforms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

grant select, insert, update, delete on public.delivery_platforms to authenticated;
grant all on public.delivery_platforms to service_role;

alter table public.delivery_platforms enable row level security;

create policy delivery_platforms_select on public.delivery_platforms
  for select using (company_id = public.current_user_company_id());
create policy delivery_platforms_write on public.delivery_platforms
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy delivery_platforms_update on public.delivery_platforms
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Each order already has its own sales invoice (confirmed with the user —
-- one invoice per Swiggy/Zomato order, same as any other sale). A
-- settlement is a later, BATCHED bank payout covering many orders at once,
-- net of the platform's commission — so gross_order_value is deliberately
-- DERIVED from the linked invoices below, never entered by hand, the same
-- "never let two independently-entered numbers drift" discipline
-- invoices/credit notes already apply to their own header totals.
--
-- The commission/other_fees breakdown here is a reasonable generic model
-- (Dr Bank + Dr Commission Expense = Cr Accounts Receivable) — the exact
-- categories a real Swiggy/Zomato payout statement itemizes weren't known
-- at build time; flagged in ROADMAP.md to double-check against an actual
-- settlement statement.
create table public.delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  platform_id uuid not null references public.delivery_platforms (id),
  settlement_date date not null,
  gross_order_value numeric(14, 2) not null,
  commission numeric(14, 2) not null check (commission >= 0),
  other_fees numeric(14, 2) not null default 0 check (other_fees >= 0),
  settlement_amount numeric(14, 2) not null,
  bank_account_id uuid not null references public.chart_of_accounts (id),
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint delivery_settlements_amount_consistent
    check (settlement_amount = gross_order_value - commission - other_fees)
);

grant select, insert, update, delete on public.delivery_settlements to authenticated;
grant all on public.delivery_settlements to service_role;

alter table public.delivery_settlements enable row level security;

create policy delivery_settlements_select on public.delivery_settlements
  for select using (company_id = public.current_user_company_id());
-- No insert/update/delete policy — all writes happen through
-- post_delivery_settlement().

-- Which specific order invoices a settlement covers — the audit trail
-- from bank deposit back to individual orders. unique(invoice_id): an
-- invoice can only ever belong to one settlement (defense in depth —
-- post_delivery_settlement() already checks this explicitly too).
create table public.delivery_settlement_invoices (
  settlement_id uuid not null references public.delivery_settlements (id),
  invoice_id uuid not null references public.invoices (id) unique,
  primary key (settlement_id, invoice_id)
);

grant select, insert, update, delete on public.delivery_settlement_invoices to authenticated;
grant all on public.delivery_settlement_invoices to service_role;

alter table public.delivery_settlement_invoices enable row level security;

create policy delivery_settlement_invoices_select on public.delivery_settlement_invoices
  for select using (
    exists (
      select 1 from public.delivery_settlements
      where delivery_settlements.id = delivery_settlement_invoices.settlement_id
        and delivery_settlements.company_id = public.current_user_company_id()
    )
  );

create or replace function public.post_delivery_settlement(
  p_platform_id uuid,
  p_settlement_date date,
  p_invoice_ids uuid[],
  p_commission numeric,
  p_other_fees numeric,
  p_bank_account_id uuid
)
returns public.delivery_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_gross numeric(14, 2) := 0;
  v_settlement_amount numeric(14, 2);
  v_entry_group uuid := gen_random_uuid();
  v_settlement public.delivery_settlements;
  v_ar_account_id uuid;
  v_commission_account_id uuid;
  v_invoice_id uuid;
  v_invoice record;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to post delivery settlements.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_settlement_date);

  if not exists (select 1 from public.delivery_platforms where id = p_platform_id and company_id = v_company_id) then
    raise exception 'Delivery platform not found in your company.';
  end if;

  if array_length(p_invoice_ids, 1) is null or array_length(p_invoice_ids, 1) = 0 then
    raise exception 'A settlement needs at least one invoice.';
  end if;

  if p_commission < 0 or p_other_fees < 0 then
    raise exception 'Commission and fees cannot be negative.';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_bank_account_id and company_id = v_company_id and type = 'asset'
  ) then
    raise exception 'Bank/cash account not found, not in your company, or not an asset account.';
  end if;

  select id into v_ar_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'accounts_receivable';
  select id into v_commission_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'platform_commission_expense';
  if v_ar_account_id is null or v_commission_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  foreach v_invoice_id in array p_invoice_ids
  loop
    select i.*, ips.balance_due into v_invoice
      from public.invoices i
      join public.invoice_payment_status ips on ips.invoice_id = i.id
      where i.id = v_invoice_id and i.company_id = v_company_id;
    if not found then
      raise exception 'Invoice % not found in your company, or not posted.', v_invoice_id;
    end if;
    if v_invoice.type <> 'sales' then
      raise exception 'Invoice % is not a sales invoice.', v_invoice_id;
    end if;
    if v_invoice.balance_due <> v_invoice.grand_total then
      raise exception 'Invoice % has already had a payment or credit note recorded against it — its balance no longer matches its original total.', v_invoice_id;
    end if;
    if exists (select 1 from public.delivery_settlement_invoices where invoice_id = v_invoice_id) then
      raise exception 'Invoice % has already been included in another settlement.', v_invoice_id;
    end if;
    v_gross := v_gross + v_invoice.grand_total;
  end loop;

  v_settlement_amount := v_gross - p_commission - p_other_fees;
  if v_settlement_amount < 0 then
    raise exception 'Commission and fees (%) cannot exceed the gross order value (%).', p_commission + p_other_fees, v_gross;
  end if;

  insert into public.delivery_settlements (
    company_id, platform_id, settlement_date, gross_order_value, commission, other_fees,
    settlement_amount, bank_account_id, entry_group_id
  ) values (
    v_company_id, p_platform_id, p_settlement_date, v_gross, p_commission, p_other_fees,
    v_settlement_amount, p_bank_account_id, v_entry_group
  ) returning * into v_settlement;

  foreach v_invoice_id in array p_invoice_ids
  loop
    insert into public.delivery_settlement_invoices (settlement_id, invoice_id) values (v_settlement.id, v_invoice_id);
  end loop;

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_settlement_date, p_bank_account_id, v_settlement_amount, 0, 'delivery_settlement', v_settlement.id);
  if (p_commission + p_other_fees) > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_settlement_date, v_commission_account_id, p_commission + p_other_fees, 0, 'delivery_settlement', v_settlement.id);
  end if;
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_settlement_date, v_ar_account_id, 0, v_gross, 'delivery_settlement', v_settlement.id);

  return v_settlement;
end;
$$;

grant execute on function public.post_delivery_settlement(uuid, date, uuid[], numeric, numeric, uuid) to authenticated;

-- ============================================================
-- Phase 31 — Consulting Module (major new module, additive)
-- A consulting client is just a party with type customer/both — no
-- separate clients master, reusing Phase 22's party model. Billing reuses
-- post_invoice() directly (see post_project_invoice() below) — no
-- parallel billing/tax path.
-- ============================================================

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id) default public.current_user_default_branch_id(),
  project_code text not null,
  client_party_id uuid not null references public.parties (id),
  project_manager_employee_id uuid references public.employees (id),
  start_date date not null,
  end_date date,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  -- Informational only — the only billing mechanism actually built here is
  -- hourly, from approved timesheets (see post_project_invoice()). A fixed-
  -- fee/milestone project can still be tracked, just invoiced the normal
  -- way through Sales Invoices rather than through this project.
  billing_method text not null default 'hourly' check (billing_method in ('hourly', 'fixed')),
  billing_rate numeric(14, 2) check (billing_rate is null or billing_rate >= 0),
  cost_centre text,
  created_at timestamptz not null default now(),
  unique (company_id, project_code)
);

grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;

alter table public.projects enable row level security;

create policy projects_select on public.projects
  for select using (company_id = public.current_user_company_id());
create policy projects_write on public.projects
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy projects_update on public.projects
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy projects_delete on public.projects
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  name text not null,
  estimated_hours numeric(14, 2) check (estimated_hours is null or estimated_hours >= 0),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.project_tasks to authenticated;
grant all on public.project_tasks to service_role;

alter table public.project_tasks enable row level security;

-- No company_id column — scoped by joining through projects, same
-- reasoning as invoice_line_items/credit_note_line_items above.
create policy project_tasks_select on public.project_tasks
  for select using (
    exists (select 1 from public.projects where projects.id = project_tasks.project_id and projects.company_id = public.current_user_company_id())
  );
create policy project_tasks_write on public.project_tasks
  for insert with check (
    exists (select 1 from public.projects where projects.id = project_tasks.project_id and projects.company_id = public.current_user_company_id())
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy project_tasks_update on public.project_tasks
  for update using (
    exists (select 1 from public.projects where projects.id = project_tasks.project_id and projects.company_id = public.current_user_company_id())
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy project_tasks_delete on public.project_tasks
  for delete using (
    exists (select 1 from public.projects where projects.id = project_tasks.project_id and projects.company_id = public.current_user_company_id())
    and public.current_user_role() in ('admin', 'accountant')
  );

-- invoice_id is set once these hours are billed (post_project_invoice()
-- below) — plain client UPDATE can still touch it (same trust level this
-- app already extends admin/accountant on every other master-data table;
-- it's a "has this been billed" tracking flag, not itself ledger-affecting
-- — the invoice's own journal entries are what's actually immutable).
create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  project_id uuid not null references public.projects (id),
  task_id uuid references public.project_tasks (id),
  employee_id uuid not null references public.employees (id),
  work_date date not null,
  hours numeric(14, 2) not null check (hours > 0),
  billable boolean not null default true,
  billing_rate numeric(14, 2) check (billing_rate is null or billing_rate >= 0),
  cost_rate numeric(14, 2) check (cost_rate is null or cost_rate >= 0),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  invoice_id uuid references public.invoices (id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.timesheets to authenticated;
grant all on public.timesheets to service_role;

alter table public.timesheets enable row level security;

create policy timesheets_select on public.timesheets
  for select using (company_id = public.current_user_company_id());
create policy timesheets_write on public.timesheets
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy timesheets_update on public.timesheets
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy timesheets_delete on public.timesheets
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Reporting-only cost record for project profitability — deliberately NOT
-- a ledger posting. If this cost also involves a real vendor payment
-- needing GST input credit, enter that separately through Purchase
-- Invoices as usual; this table just tags a cost to a project for
-- profitability, the same way it would be tracked on a spreadsheet today.
create table public.project_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  project_id uuid not null references public.projects (id),
  expense_date date not null,
  description text not null,
  amount numeric(14, 2) not null check (amount > 0),
  category text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.project_expenses to authenticated;
grant all on public.project_expenses to service_role;

alter table public.project_expenses enable row level security;

create policy project_expenses_select on public.project_expenses
  for select using (company_id = public.current_user_company_id());
create policy project_expenses_write on public.project_expenses
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy project_expenses_update on public.project_expenses
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy project_expenses_delete on public.project_expenses
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- Generates a normal sales invoice from a set of approved, billable,
-- not-yet-invoiced timesheet entries — grouped by billing_rate into one
-- line item per rate, using the given item_id (its own hsn_sac_code
-- drives the tax lookup inside post_invoice(), same as every other sale;
-- never a parallel billing/tax path). Marks the timesheets invoiced in
-- the same transaction as posting, so a failure rolls back both together.
create or replace function public.post_project_invoice(
  p_project_id uuid,
  p_invoice_date date,
  p_item_id uuid,
  p_revenue_expense_account_id uuid,
  p_timesheet_ids uuid[]
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_project public.projects;
  v_line_items jsonb;
  v_invoice public.invoices;
  v_timesheet_id uuid;
  v_ts public.timesheets;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to invoice projects.';
  end if;

  select * into v_project from public.projects where id = p_project_id and company_id = v_company_id;
  if not found then
    raise exception 'Project not found in your company.';
  end if;

  if array_length(p_timesheet_ids, 1) is null or array_length(p_timesheet_ids, 1) = 0 then
    raise exception 'Select at least one timesheet entry to invoice.';
  end if;

  foreach v_timesheet_id in array p_timesheet_ids
  loop
    select * into v_ts from public.timesheets
      where id = v_timesheet_id and project_id = p_project_id and company_id = v_company_id;
    if not found then
      raise exception 'Timesheet entry % does not belong to this project.', v_timesheet_id;
    end if;
    if not v_ts.billable then
      raise exception 'Timesheet entry % is not billable.', v_timesheet_id;
    end if;
    if v_ts.approval_status <> 'approved' then
      raise exception 'Timesheet entry % is not approved (status: %).', v_timesheet_id, v_ts.approval_status;
    end if;
    if v_ts.invoice_id is not null then
      raise exception 'Timesheet entry % has already been invoiced.', v_timesheet_id;
    end if;
    if v_ts.billing_rate is null then
      raise exception 'Timesheet entry % has no billing rate set.', v_timesheet_id;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('item_id', p_item_id, 'quantity', total_hours, 'rate', billing_rate))
    into v_line_items
    from (
      select billing_rate, sum(hours) as total_hours
      from public.timesheets
      where id = any(p_timesheet_ids)
      group by billing_rate
    ) grouped;

  v_invoice := public.post_invoice('sales', v_project.client_party_id, p_invoice_date, p_revenue_expense_account_id, v_line_items);

  update public.timesheets set invoice_id = v_invoice.id where id = any(p_timesheet_ids);

  return v_invoice;
end;
$$;

grant execute on function public.post_project_invoice(uuid, date, uuid, uuid, uuid[]) to authenticated;

-- Revenue is the DISTINCT invoiced project invoices' own subtotal
-- (pre-tax — GST collected isn't revenue), never joined row-by-row
-- through invoice_line_items (which would multiply/overcount whenever a
-- project invoice has more than one rate-grouped line). Labour cost
-- counts ALL timesheets (billable or not) at their own cost_rate — an
-- unbilled internal hour still costs the business. Read-only, invoker
-- rights, same as every other report function.
create function public.project_profitability(p_project_id uuid)
returns table (
  revenue numeric, labour_cost numeric, expense_cost numeric,
  total_cost numeric, profit numeric, margin_pct numeric
)
language sql
stable
as $$
  with rev as (
    select coalesce(sum(i.subtotal), 0) as revenue
    from public.invoices i
    where i.id in (
      select distinct invoice_id from public.timesheets
      where project_id = p_project_id and invoice_id is not null
    )
  ),
  labour as (
    select coalesce(sum(hours * coalesce(cost_rate, 0)), 0) as labour_cost
    from public.timesheets where project_id = p_project_id
  ),
  expenses as (
    select coalesce(sum(amount), 0) as expense_cost
    from public.project_expenses where project_id = p_project_id
  )
  select
    rev.revenue, labour.labour_cost, expenses.expense_cost,
    labour.labour_cost + expenses.expense_cost,
    rev.revenue - (labour.labour_cost + expenses.expense_cost),
    case when rev.revenue > 0
      then round((rev.revenue - (labour.labour_cost + expenses.expense_cost)) / rev.revenue * 100, 2)
      else null
    end
  from rev, labour, expenses;
$$;

grant execute on function public.project_profitability(uuid) to authenticated;

-- ============================================================
-- Phase 32 — Tax & CA: TDS Tracking + Expanded CA Package
-- TDS WE deduct paying a vendor (payable side) only — a customer
-- deducting TDS from what they pay US ("TDS receivable") is a different,
-- deferred scenario (see ROADMAP.md). Rates are never hardcoded, same
-- discipline CLAUDE.md section 3 already requires for GST: read from
-- tds_rates via resolve_tds_rate(), an effective-dated table just like
-- tax_rates.
-- ============================================================

create table public.tds_rates (
  id uuid primary key default gen_random_uuid(),
  section text not null,
  rate numeric(5, 2) not null check (rate >= 0),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint tds_rates_valid_range check (effective_to is null or effective_to >= effective_from)
);

grant select, insert, update, delete on public.tds_rates to authenticated;
grant all on public.tds_rates to service_role;

alter table public.tds_rates enable row level security;

-- Global, not company-scoped — same shape as tax_rates. Admin-only write,
-- same reasoning TaxRates.jsx already documents (rate changes reviewed
-- manually, never auto-applied).
create policy tds_rates_select on public.tds_rates for select using (true);
create policy tds_rates_write on public.tds_rates
  for insert with check (public.current_user_role() = 'admin');
create policy tds_rates_update on public.tds_rates
  for update using (public.current_user_role() = 'admin');
create policy tds_rates_delete on public.tds_rates
  for delete using (public.current_user_role() = 'admin');

create function public.resolve_tds_rate(p_section text, p_as_of date)
returns numeric
language sql
stable
as $$
  select rate from public.tds_rates
  where section = p_section
    and effective_from <= p_as_of
    and (effective_to is null or effective_to >= p_as_of)
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.resolve_tds_rate(text, date) to authenticated;

-- One row per TDS deduction actually posted (see post_payment() above).
-- deposited_on is nullable — set later, separately, once the deducted
-- amount is actually deposited with the government; a plain admin/
-- accountant update, not itself ledger-affecting (matches the same trust
-- level already extended for timesheets.invoice_id in Phase 31).
create table public.tds_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  payment_id uuid not null references public.payments (id) unique,
  payee_party_id uuid not null references public.parties (id),
  section text not null,
  taxable_base numeric(14, 2) not null,
  rate numeric(5, 2) not null,
  tds_amount numeric(14, 2) not null,
  deposited_on date,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tds_transactions to authenticated;
grant all on public.tds_transactions to service_role;

alter table public.tds_transactions enable row level security;

create policy tds_transactions_select on public.tds_transactions
  for select using (company_id = public.current_user_company_id());
create policy tds_transactions_update on public.tds_transactions
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
-- No insert/delete policy — insert happens only via post_payment(),
-- delete only via cancel_payment() (both SECURITY DEFINER).

create function public.tds_summary(p_from date, p_to date)
returns table (
  payment_date date, payee_name text, section text,
  taxable_base numeric, rate numeric, tds_amount numeric, deposited_on date
)
language sql
stable
as $$
  select p.payment_date, party.name, t.section, t.taxable_base, t.rate, t.tds_amount, t.deposited_on
  from public.tds_transactions t
  join public.payments p on p.id = t.payment_id
  join public.parties party on party.id = t.payee_party_id
  where p.payment_date between p_from and p_to
  order by p.payment_date;
$$;

grant execute on function public.tds_summary(date, date) to authenticated;

-- ============================================================
-- Phase 33 — Banking Enhancements & Fixed Assets
-- ============================================================

-- Today "the bank" is really just a chart-of-accounts asset row with no
-- dedicated identity. This is a metadata sidecar, not a new posting
-- target — post_payment()/post_delivery_settlement() keep pointing
-- straight at chart_of_accounts exactly as before; this just gives the
-- UI a friendlier way to label and pick "which bank account" than a
-- generic COA row name, and lets bank_transactions (below) know which
-- account a statement line belongs to once more than one exists.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id) default public.current_user_default_branch_id(),
  chart_of_accounts_id uuid not null references public.chart_of_accounts (id) unique,
  account_name text not null,
  account_number text,
  ifsc_code text,
  bank_name text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.bank_accounts to authenticated;
grant all on public.bank_accounts to service_role;

alter table public.bank_accounts enable row level security;

create policy bank_accounts_select on public.bank_accounts
  for select using (company_id = public.current_user_company_id());
create policy bank_accounts_write on public.bank_accounts
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy bank_accounts_update on public.bank_accounts
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy bank_accounts_delete on public.bank_accounts
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

-- A plain RLS policy can't see across to chart_of_accounts to confirm
-- it's an asset account in the same company — same reasoning as
-- validate_bank_transaction_match() above.
create function public.validate_bank_account()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.chart_of_accounts
    where id = new.chart_of_accounts_id and company_id = new.company_id and type = 'asset'
  ) then
    raise exception 'Linked chart-of-accounts row must be an asset account in the same company.';
  end if;
  return new;
end;
$$;

create trigger bank_accounts_validate
  before insert or update on public.bank_accounts
  for each row execute function public.validate_bank_account();

-- Nullable, additive — existing rows and every current import path are
-- unaffected until a bank_account is actually chosen somewhere.
alter table public.bank_transactions add column bank_account_id uuid references public.bank_accounts (id);

-- ------------------------------------------------------------
-- Fixed Assets — straight-line depreciation only (the only method
-- actually built here; WDV/reducing-balance is a real, separate need
-- flagged rather than built speculatively). GST input credit on capital
-- goods has its own separate rules (e.g. ITC reversal on sale) not
-- handled here — flagged for a CA, same reasoning as Phase 32's TDS base.
-- ------------------------------------------------------------

create table public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  name text not null,
  useful_life_years numeric(5, 2) not null check (useful_life_years > 0),
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

grant select, insert, update, delete on public.asset_categories to authenticated;
grant all on public.asset_categories to service_role;

alter table public.asset_categories enable row level security;

create policy asset_categories_select on public.asset_categories
  for select using (company_id = public.current_user_company_id());
create policy asset_categories_write on public.asset_categories
  for insert with check (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy asset_categories_update on public.asset_categories
  for update using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );
create policy asset_categories_delete on public.asset_categories
  for delete using (
    company_id = public.current_user_company_id()
    and public.current_user_role() in ('admin', 'accountant')
  );

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  branch_id uuid references public.branches (id) default public.current_user_default_branch_id(),
  category_id uuid not null references public.asset_categories (id),
  name text not null,
  asset_code text,
  purchase_date date not null,
  cost numeric(14, 2) not null check (cost > 0),
  salvage_value numeric(14, 2) not null default 0 check (salvage_value >= 0 and salvage_value < cost),
  accumulated_depreciation numeric(14, 2) not null default 0 check (accumulated_depreciation >= 0),
  status text not null default 'active' check (status in ('active', 'disposed')),
  disposal_date date,
  disposal_proceeds numeric(14, 2),
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  constraint fixed_assets_accum_dep_not_exceed_depreciable check (accumulated_depreciation <= cost - salvage_value)
);

grant select, insert, update, delete on public.fixed_assets to authenticated;
grant all on public.fixed_assets to service_role;

alter table public.fixed_assets enable row level security;

create policy fixed_assets_select on public.fixed_assets
  for select using (company_id = public.current_user_company_id());
-- No insert/update/delete policy — capitalize_fixed_asset(),
-- post_depreciation_run(), and dispose_fixed_asset() (all SECURITY
-- DEFINER) are the only writes.

-- One row per event affecting an asset — capitalization, each
-- depreciation run's own contribution, disposal — the same "movement
-- history" role stock_ledger plays for inventory.
create table public.asset_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  asset_id uuid not null references public.fixed_assets (id),
  transaction_type text not null check (transaction_type in ('capitalization', 'depreciation', 'disposal')),
  transaction_date date not null,
  amount numeric(14, 2) not null,
  entry_group_id uuid not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.asset_transactions to authenticated;
grant all on public.asset_transactions to service_role;

alter table public.asset_transactions enable row level security;

create policy asset_transactions_select on public.asset_transactions
  for select using (company_id = public.current_user_company_id());

-- One row per batch depreciation posting (typically monthly). A unique
-- constraint on (company_id, period_start) is defense in depth —
-- post_depreciation_run() already checks this explicitly too, same
-- belt-and-suspenders reasoning as delivery_settlement_invoices.
create table public.depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  run_date date not null,
  period_start date not null,
  period_end date not null,
  total_depreciation numeric(14, 2) not null default 0,
  entry_group_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, period_start)
);

grant select, insert, update, delete on public.depreciation_runs to authenticated;
grant all on public.depreciation_runs to service_role;

alter table public.depreciation_runs enable row level security;

create policy depreciation_runs_select on public.depreciation_runs
  for select using (company_id = public.current_user_company_id());

-- Capitalizes a new fixed asset: Dr Fixed Assets (cost) / Cr the chosen
-- funding account (bank if paid immediately, or a payable if bought on
-- credit — either an asset or liability account is accepted, unlike most
-- postings here which only accept one type, since a capital purchase is
-- routinely made either way).
create or replace function public.capitalize_fixed_asset(
  p_category_id uuid,
  p_name text,
  p_asset_code text,
  p_purchase_date date,
  p_cost numeric,
  p_salvage_value numeric,
  p_funding_account_id uuid
)
returns public.fixed_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_fixed_assets_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_asset public.fixed_assets;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to capitalize fixed assets.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_purchase_date);

  if not exists (select 1 from public.asset_categories where id = p_category_id and company_id = v_company_id) then
    raise exception 'Asset category not found in your company.';
  end if;
  if p_salvage_value >= p_cost then
    raise exception 'Salvage value must be less than cost.';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_funding_account_id and company_id = v_company_id and type in ('asset', 'liability')
  ) then
    raise exception 'Funding account not found in your company, or not an asset/liability account.';
  end if;

  select id into v_fixed_assets_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'fixed_assets_gross';
  if v_fixed_assets_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.fixed_assets (
    company_id, category_id, name, asset_code, purchase_date, cost, salvage_value, entry_group_id
  ) values (
    v_company_id, p_category_id, p_name, p_asset_code, p_purchase_date, p_cost, p_salvage_value, v_entry_group
  ) returning * into v_asset;

  insert into public.asset_transactions (company_id, asset_id, transaction_type, transaction_date, amount, entry_group_id)
    values (v_company_id, v_asset.id, 'capitalization', p_purchase_date, p_cost, v_entry_group);

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_purchase_date, v_fixed_assets_account_id, p_cost, 0, 'fixed_asset', v_asset.id);
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_purchase_date, p_funding_account_id, 0, p_cost, 'fixed_asset', v_asset.id);

  return v_asset;
end;
$$;

grant execute on function public.capitalize_fixed_asset(uuid, text, text, date, numeric, numeric, uuid) to authenticated;

-- Posts one month of straight-line depreciation for every active asset
-- purchased on or before the period end, capped so accumulated
-- depreciation never exceeds cost minus salvage value. One combined
-- journal pair for the whole run (Dr Depreciation Expense / Cr
-- Accumulated Depreciation), not one pair per asset — matches how
-- post_wastage()/post_delivery_settlement() already aggregate rather than
-- posting a journal leg per line.
create function public.post_depreciation_run(p_run_date date)
returns public.depreciation_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_period_start date := date_trunc('month', p_run_date)::date;
  v_period_end date := (date_trunc('month', p_run_date) + interval '1 month - 1 day')::date;
  v_dep_expense_account_id uuid;
  v_accum_dep_account_id uuid;
  v_entry_group uuid := gen_random_uuid();
  v_run public.depreciation_runs;
  v_asset record;
  v_monthly_dep numeric(14, 2);
  v_remaining numeric(14, 2);
  v_this_dep numeric(14, 2);
  v_total numeric(14, 2) := 0;
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to post a depreciation run.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_run_date);

  if exists (select 1 from public.depreciation_runs where company_id = v_company_id and period_start = v_period_start) then
    raise exception 'A depreciation run for % already exists.', to_char(v_period_start, 'Mon YYYY');
  end if;

  select id into v_dep_expense_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'depreciation_expense';
  select id into v_accum_dep_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'accumulated_depreciation';
  if v_dep_expense_account_id is null or v_accum_dep_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  insert into public.depreciation_runs (company_id, run_date, period_start, period_end, total_depreciation, entry_group_id)
  values (v_company_id, p_run_date, v_period_start, v_period_end, 0, v_entry_group)
  returning * into v_run;

  for v_asset in
    select fa.id, fa.cost, fa.salvage_value, fa.accumulated_depreciation, ac.useful_life_years
    from public.fixed_assets fa
    join public.asset_categories ac on ac.id = fa.category_id
    where fa.company_id = v_company_id and fa.status = 'active' and fa.purchase_date <= v_period_end
  loop
    v_monthly_dep := round((v_asset.cost - v_asset.salvage_value) / (v_asset.useful_life_years * 12), 2);
    v_remaining := (v_asset.cost - v_asset.salvage_value) - v_asset.accumulated_depreciation;
    v_this_dep := least(v_monthly_dep, v_remaining);
    if v_this_dep > 0 then
      update public.fixed_assets set accumulated_depreciation = accumulated_depreciation + v_this_dep where id = v_asset.id;
      insert into public.asset_transactions (company_id, asset_id, transaction_type, transaction_date, amount, entry_group_id)
        values (v_company_id, v_asset.id, 'depreciation', p_run_date, v_this_dep, v_entry_group);
      v_total := v_total + v_this_dep;
    end if;
  end loop;

  if v_total > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_run_date, v_dep_expense_account_id, v_total, 0, 'depreciation_run', v_run.id);
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_run_date, v_accum_dep_account_id, 0, v_total, 'depreciation_run', v_run.id);
  end if;

  update public.depreciation_runs set total_depreciation = v_total where id = v_run.id returning * into v_run;

  return v_run;
end;
$$;

grant execute on function public.post_depreciation_run(date) to authenticated;

-- Disposes an active asset: receives proceeds, clears the asset's own
-- gross cost and accumulated depreciation, and plugs the difference to a
-- single combined gain/loss account (credited for a gain, debited for a
-- loss) — a rare enough event that one P&L line covering both signs is
-- simpler than two separate system accounts.
create or replace function public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_proceeds numeric,
  p_receiving_account_id uuid
)
returns public.fixed_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_asset public.fixed_assets;
  v_fixed_assets_account_id uuid;
  v_accum_dep_account_id uuid;
  v_gain_loss_account_id uuid;
  v_nbv numeric(14, 2);
  v_gain_loss numeric(14, 2);
  v_entry_group uuid := gen_random_uuid();
begin
  v_company_id := public.current_user_company_id();
  if v_company_id is null or public.current_user_role() not in ('admin', 'accountant') then
    raise exception 'Not authorized to dispose of fixed assets.';
  end if;
  perform public.reject_if_period_closed(v_company_id, p_disposal_date);

  select * into v_asset from public.fixed_assets where id = p_asset_id and company_id = v_company_id;
  if not found then
    raise exception 'Asset not found in your company.';
  end if;
  if v_asset.status <> 'active' then
    raise exception 'Only an active asset can be disposed of (current status: %).', v_asset.status;
  end if;
  if p_proceeds < 0 then
    raise exception 'Disposal proceeds cannot be negative.';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_receiving_account_id and company_id = v_company_id and type = 'asset'
  ) then
    raise exception 'Receiving account not found in your company, or not an asset account.';
  end if;

  select id into v_fixed_assets_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'fixed_assets_gross';
  select id into v_accum_dep_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'accumulated_depreciation';
  select id into v_gain_loss_account_id from public.chart_of_accounts
    where company_id = v_company_id and system_role = 'disposal_gain_loss';
  if v_fixed_assets_account_id is null or v_accum_dep_account_id is null or v_gain_loss_account_id is null then
    raise exception 'Missing system ledger account(s) for this company.';
  end if;

  v_nbv := v_asset.cost - v_asset.accumulated_depreciation;
  v_gain_loss := p_proceeds - v_nbv;

  insert into public.asset_transactions (company_id, asset_id, transaction_type, transaction_date, amount, entry_group_id)
    values (v_company_id, v_asset.id, 'disposal', p_disposal_date, p_proceeds, v_entry_group);

  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_disposal_date, p_receiving_account_id, p_proceeds, 0, 'fixed_asset_disposal', v_asset.id);
  if v_asset.accumulated_depreciation > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_disposal_date, v_accum_dep_account_id, v_asset.accumulated_depreciation, 0, 'fixed_asset_disposal', v_asset.id);
  end if;
  insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
    values (v_company_id, v_entry_group, p_disposal_date, v_fixed_assets_account_id, 0, v_asset.cost, 'fixed_asset_disposal', v_asset.id);
  if v_gain_loss > 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_disposal_date, v_gain_loss_account_id, 0, v_gain_loss, 'fixed_asset_disposal', v_asset.id);
  elsif v_gain_loss < 0 then
    insert into public.journal_entries (company_id, entry_group_id, entry_date, account_id, debit, credit, reference_type, reference_id)
      values (v_company_id, v_entry_group, p_disposal_date, v_gain_loss_account_id, -v_gain_loss, 0, 'fixed_asset_disposal', v_asset.id);
  end if;

  update public.fixed_assets
    set status = 'disposed', disposal_date = p_disposal_date, disposal_proceeds = p_proceeds
    where id = v_asset.id
    returning * into v_asset;

  return v_asset;
end;
$$;

grant execute on function public.dispose_fixed_asset(uuid, date, numeric, uuid) to authenticated;

-- Current-state snapshot, not point-in-time — an asset register is
-- inherently "as things stand today," and reconstructing historical
-- accumulated depreciation from asset_transactions as of an arbitrary
-- past date would be false precision this business doesn't need yet.
create function public.fixed_asset_register()
returns table (
  asset_id uuid, name text, category_name text, purchase_date date,
  cost numeric, accumulated_depreciation numeric, net_book_value numeric, status text
)
language sql
stable
as $$
  select fa.id, fa.name, ac.name, fa.purchase_date, fa.cost, fa.accumulated_depreciation,
    fa.cost - fa.accumulated_depreciation, fa.status
  from public.fixed_assets fa
  join public.asset_categories ac on ac.id = fa.category_id
  order by fa.purchase_date;
$$;

grant execute on function public.fixed_asset_register() to authenticated;
