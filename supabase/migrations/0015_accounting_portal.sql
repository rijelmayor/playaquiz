-- Accounting Portal expansion. Existing Sales/Admin/Production tables remain the source of truth.
-- This migration adds accounting-only records for opening balances, operating expenses,
-- and financial job closing. It does not alter operational workflow tables.

create table if not exists accounting_opening_balances (
  opening_balance_id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  cash_on_hand numeric(12,2) not null default 0,
  bank_balance numeric(12,2) not null default 0,
  opening_receivables numeric(12,2) not null default 0,
  opening_payables numeric(12,2) not null default 0,
  note text,
  created_by uuid references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounting_expenses (
  expense_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id) on delete set null,
  category text not null check (category in (
    'materials', 'labor', 'fabrication', 'installation', 'logistics',
    'commission', 'office', 'utilities', 'rent', 'transportation',
    'software', 'marketing', 'supplies', 'other'
  )),
  description text not null,
  payee text,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null default 'paid' check (status in ('pending', 'paid', 'void')),
  payment_method text,
  reference_no text,
  expense_date date not null default current_date,
  note text,
  created_by uuid references users(user_id),
  created_at timestamptz not null default now()
);

create table if not exists accounting_job_closures (
  closure_id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(job_id) on delete cascade,
  closed_by uuid references users(user_id),
  closed_at timestamptz not null default now(),
  final_revenue numeric(12,2) not null default 0,
  final_cost numeric(12,2) not null default 0,
  final_profit numeric(12,2) not null default 0,
  note text
);

alter table accounting_opening_balances enable row level security;
alter table accounting_expenses enable row level security;
alter table accounting_job_closures enable row level security;

create policy "accounting full access opening balances" on accounting_opening_balances
  for all using (current_user_role() = 'accounting')
  with check (current_user_role() = 'accounting');

create policy "admin reads opening balances" on accounting_opening_balances
  for select using (current_user_role() = 'admin');

create policy "accounting full access expenses" on accounting_expenses
  for all using (current_user_role() = 'accounting')
  with check (current_user_role() = 'accounting');

create policy "admin reads accounting expenses" on accounting_expenses
  for select using (current_user_role() = 'admin');

create policy "accounting full access job closures" on accounting_job_closures
  for all using (current_user_role() = 'accounting')
  with check (current_user_role() = 'accounting');

create policy "admin reads job closures" on accounting_job_closures
  for select using (current_user_role() = 'admin');

-- Accounting needs read access to production job-order cost data.
create policy "accounting reads job orders" on job_orders
  for select using (current_user_role() = 'accounting');

create policy "accounting reads fund releases" on fund_releases
  for select using (current_user_role() = 'accounting');

create policy "accounting reads users" on users
  for select using (current_user_role() = 'accounting');

create index if not exists accounting_expenses_job_id_idx on accounting_expenses(job_id);
create index if not exists accounting_expenses_date_idx on accounting_expenses(expense_date);
create index if not exists accounting_closures_job_id_idx on accounting_job_closures(job_id);

-- A financial close is only valid after operational completion and full collection.
create or replace function validate_accounting_job_closure()
returns trigger as $$
declare
  v_status text;
  v_final numeric(12,2);
  v_received numeric(12,2);
begin
  select status, coalesce(final_value, quoted_value, 0)
    into v_status, v_final
  from jobs where job_id = new.job_id;

  select coalesce(sum(amount), 0)
    into v_received
  from payments
  where job_id = new.job_id and status = 'received';

  if v_status not in ('installed', 'paid', 'closed') then
    raise exception 'Job must be installed, paid, or closed before financial close';
  end if;

  if v_received + 0.01 < v_final then
    raise exception 'Customer balance must be fully received before financial close';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists accounting_job_closure_validation on accounting_job_closures;
create trigger accounting_job_closure_validation
before insert or update on accounting_job_closures
for each row execute function validate_accounting_job_closure();
