-- Advertising CRM: initial schema
-- Run this in the Supabase SQL editor, or via `supabase db push`.

create table users (
  user_id uuid primary key default gen_random_uuid(),
  auth_id uuid unique references auth.users(id),
  name text not null,
  role text not null check (role in ('sales', 'admin', 'accounting', 'fabricator')),
  email text unique not null,
  created_at timestamptz default now()
);

create table clients (
  client_id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  location text,
  created_at timestamptz default now()
);

create table jobs (
  job_id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(client_id),
  booked_by uuid references users(user_id),
  status text not null default 'lead' check (status in (
    'lead', 'site_visit', 'design_review', 'quoted', 'approved',
    'in_production', 'installed', 'paid', 'closed', 'cancelled'
  )),
  needs_site_visit boolean default false,
  quoted_value numeric(12,2),
  final_value numeric(12,2),
  cancelled boolean default false,
  cancel_reason text,
  created_at timestamptz default now()
);

create table quotations (
  quotation_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  version int not null default 1,
  total numeric(12,2) not null,
  valid_until date,
  created_at timestamptz default now()
);

create table designs (
  design_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  revision_no int not null default 1,
  status text default 'pending' check (status in ('pending', 'approved', 'revision_requested')),
  file_url text,
  created_at timestamptz default now()
);

create table payments (
  payment_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  type text not null check (type in ('down_payment', 'balance')),
  amount numeric(12,2) not null,
  status text default 'pending' check (status in ('pending', 'received')),
  paid_date timestamptz
);

create table job_orders (
  job_order_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  fabricator_id uuid references users(user_id),
  materials text,
  estimated_materials_cost numeric(12,2),
  actual_materials_cost numeric(12,2),
  estimated_labor_cost numeric(12,2),
  actual_labor_cost numeric(12,2),
  estimated_logistics_cost numeric(12,2),
  actual_logistics_cost numeric(12,2),
  logistics_vendor text,
  funds_release_status text default 'not_released' check (funds_release_status in
    ('not_released', 'partially_released', 'fully_released', 'reconciled')),
  deadline date,
  status text default 'sourcing' check (status in
    ('sourcing', 'in_production', 'qa', 'ready_for_install', 'installed'))
);

create table fund_releases (
  release_id uuid primary key default gen_random_uuid(),
  job_order_id uuid references job_orders(job_order_id),
  released_by uuid references users(user_id),
  category text not null default 'materials' check (category in ('materials', 'labor', 'logistics')),
  amount numeric(12,2) not null,
  note text,
  released_date timestamptz default now()
);

create table job_commissions (
  commission_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  agent_id uuid references users(user_id),
  split_pct numeric(5,2) not null default 100.00,
  amount numeric(12,2),
  status text default 'pending' check (status in ('pending', 'payable', 'paid', 'void')),
  paid_date timestamptz
);

-- Profitability view — Admin dashboard reads from this directly.
create view job_profitability as
select
  j.job_id,
  j.status,
  j.final_value,
  coalesce(jo.actual_materials_cost, jo.estimated_materials_cost, 0) as materials_cost,
  coalesce(jo.actual_labor_cost, jo.estimated_labor_cost, 0) as labor_cost,
  coalesce(jo.actual_logistics_cost, jo.estimated_logistics_cost, 0) as logistics_cost,
  coalesce((select sum(amount) from job_commissions jc
    where jc.job_id = j.job_id and jc.status != 'void'), 0) as commission_cost,
  j.final_value - (
    coalesce(jo.actual_materials_cost, jo.estimated_materials_cost, 0) +
    coalesce(jo.actual_labor_cost, jo.estimated_labor_cost, 0) +
    coalesce(jo.actual_logistics_cost, jo.estimated_logistics_cost, 0) +
    coalesce((select sum(amount) from job_commissions jc
      where jc.job_id = j.job_id and jc.status != 'void'), 0)
  ) as net_profit,
  case when j.final_value > 0 then
    round(100 * (j.final_value - (
      coalesce(jo.actual_materials_cost, jo.estimated_materials_cost, 0) +
      coalesce(jo.actual_labor_cost, jo.estimated_labor_cost, 0) +
      coalesce(jo.actual_logistics_cost, jo.estimated_logistics_cost, 0) +
      coalesce((select sum(amount) from job_commissions jc
        where jc.job_id = j.job_id and jc.status != 'void'), 0)
    )) / j.final_value, 1)
  else null end as margin_pct,
  (jo.actual_materials_cost is null or jo.actual_labor_cost is null
    or jo.actual_logistics_cost is null) as is_estimated
from jobs j
left join job_orders jo on jo.job_id = j.job_id;

-- Row Level Security
alter table jobs enable row level security;
alter table clients enable row level security;
alter table job_orders enable row level security;
alter table fund_releases enable row level security;
alter table job_commissions enable row level security;
alter table payments enable row level security;
alter table quotations enable row level security;
alter table designs enable row level security;

-- Helper: current user's role, looked up once per query
create or replace function current_user_role() returns text as $$
  select role from users where auth_id = auth.uid();
$$ language sql stable security definer;

create or replace function current_user_id() returns uuid as $$
  select user_id from users where auth_id = auth.uid();
$$ language sql stable security definer;

-- Sales: can see/edit only jobs they booked. Admin/accounting/fabricator: broader access.
create policy "sales sees own jobs" on jobs for select
  using (current_user_role() = 'sales' and booked_by = current_user_id());
create policy "sales inserts own jobs" on jobs for insert
  with check (current_user_role() = 'sales' and booked_by = current_user_id());
create policy "admin full access jobs" on jobs for all
  using (current_user_role() = 'admin');
create policy "accounting reads jobs" on jobs for select
  using (current_user_role() = 'accounting');
create policy "fabricator reads assigned jobs" on jobs for select
  using (current_user_role() = 'fabricator' and job_id in (
    select job_id from job_orders where fabricator_id = current_user_id()
  ));

create policy "accounting full access fund_releases" on fund_releases for all
  using (current_user_role() = 'accounting');
create policy "fabricator reads own job_orders" on job_orders for select
  using (current_user_role() = 'fabricator' and fabricator_id = current_user_id());
create policy "admin full access job_orders" on job_orders for all
  using (current_user_role() = 'admin');
create policy "accounting full access job_commissions" on job_commissions for all
  using (current_user_role() = 'accounting');
create policy "sales reads own commissions" on job_commissions for select
  using (current_user_role() = 'sales' and agent_id = current_user_id());
