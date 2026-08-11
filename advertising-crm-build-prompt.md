# Build prompt: advertising company CRM

Use this as the spec/prompt for an AI coding assistant (Claude Code, Cursor, etc.) to scaffold the project.

## Context

I run a solo/small-team advertising company in the Philippines producing signage and print materials (tarpaulins, LED signs, acrylic signs, billboards) for weddings, corporate events, and businesses. Leads come primarily from Facebook ads. I need a CRM to manage the full pipeline from lead capture to job completion, with role-based portals for each stage of the workflow.

## Tech stack

- **Frontend/backend**: Next.js (App Router), deployed on Vercel
- **Database + auth**: Supabase (Postgres, Row Level Security, Supabase Auth)
- **Version control**: GitHub, connected to Vercel for auto-deploy on push
- **Styling**: Tailwind CSS

## Roles and portals

Four role-based portals, each scoped to what that role needs. All roles see a shared job record but only edit their own fields. An Admin Dashboard has full visibility across all portals.

1. **Sales** — client interaction: lead intake, client info capture, site visit scheduling, job status tracking, own commission summary
2. **Admin** — quotation creation/approval, design approval routing, oversees full pipeline
3. **Accounting** — payments (down payment, balance), releasing funds to fabrication for raw materials, commission payout release
4. **Fabrication/Production** — job orders, materials sourcing status, production status, installation scheduling

## Core workflow

1. **Lead capture** — Facebook ad → Messenger/lead form → lead logged by Sales
2. **Sales intake** — client info, product needed, urgency captured in CRM, agent auto-tagged as `booked_by`
3. **Site visit** (conditional) — only if job requires on-site measurement/assessment
4. **Design concept** — layout/mockup created, sent to client for approval; up to 2 free revision rounds, then a revision fee applies
5. **Quotation** — itemized pricing based on design + site visit data, sent for client approval
6. **Client approval + down payment** — 50% down payment required before production starts
7. **Job order created** — forwarded to Fabrication with specs, approved design, estimated materials cost
8. **Funds release** — Accounting releases funds to Fabrication for raw materials (separate event from commission payout)
9. **Production** — status: sourcing materials → in production → QA/finishing → ready for install
10. **Installation** — scheduled, client walkthrough/sign-off
11. **Final payment** — balance collected, invoice issued
12. **Commission release** — Accounting marks agent commission payable once final payment is received AND job is marked complete
13. **Closeout** — job archived, optional client follow-up/review request

## Database schema (Postgres via Supabase)

```sql
-- Users (all roles: sales, admin, accounting, fabricator)
create table users (
  user_id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('sales', 'admin', 'accounting', 'fabricator')),
  email text unique not null,
  created_at timestamptz default now()
);

-- Clients
create table clients (
  client_id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  location text,
  created_at timestamptz default now()
);

-- Jobs (core record every portal touches)
create table jobs (
  job_id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(client_id),
  booked_by uuid references users(user_id), -- locked after creation
  status text not null default 'lead' check (status in (
    'lead', 'site_visit', 'design_review', 'quoted', 'approved',
    'in_production', 'installed', 'paid', 'closed', 'cancelled'
  )),
  needs_site_visit boolean default false,
  quoted_value numeric(12,2),
  final_value numeric(12,2), -- commission calculates off this, not quoted_value
  cancelled boolean default false,
  cancel_reason text,
  created_at timestamptz default now()
);

-- Quotations (versioned, since revisions happen)
create table quotations (
  quotation_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  version int not null default 1,
  total numeric(12,2) not null,
  valid_until date,
  created_at timestamptz default now()
);

-- Design revisions
create table designs (
  design_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  revision_no int not null default 1, -- flag revision_no > 2 for fee
  status text default 'pending' check (status in ('pending', 'approved', 'revision_requested')),
  file_url text,
  created_at timestamptz default now()
);

-- Client payments (down payment + balance)
create table payments (
  payment_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  type text not null check (type in ('down_payment', 'balance')),
  amount numeric(12,2) not null,
  status text default 'pending' check (status in ('pending', 'received')),
  paid_date timestamptz
);

-- Job orders (production side, tracking materials, labor, AND outsourced logistics cost)
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
  logistics_vendor text, -- outsourced truck/delivery provider name
  funds_release_status text default 'not_released' check (funds_release_status in
    ('not_released', 'partially_released', 'fully_released', 'reconciled')),
  deadline date,
  status text default 'sourcing' check (status in
    ('sourcing', 'in_production', 'qa', 'ready_for_install', 'installed'))
);

-- Fund releases (log, not a single field — releases happen case-by-case,
-- sometimes full upfront, sometimes staged, so multiple rows per job order.
-- Covers materials purchases, labor/fabricator payouts, and outsourced logistics.)
create table fund_releases (
  release_id uuid primary key default gen_random_uuid(),
  job_order_id uuid references job_orders(job_order_id),
  released_by uuid references users(user_id), -- accounting user
  category text not null default 'materials' check (category in ('materials', 'labor', 'logistics')),
  amount numeric(12,2) not null,
  note text, -- e.g. "initial material deposit", "delivery truck outsource payment"
  released_date timestamptz default now()
);

-- Agent commissions (supports split commission across multiple agents per job)
create table job_commissions (
  commission_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  agent_id uuid references users(user_id),
  split_pct numeric(5,2) not null default 100.00, -- for multi-agent bookings
  amount numeric(12,2), -- = final_value * commission_rate * split_pct / 100
  status text default 'pending' check (status in ('pending', 'payable', 'paid', 'void')),
  paid_date timestamptz
);
```

-- Job profitability view (Admin dashboard reads from this directly —
-- no need to recompute margin logic in app code)
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
  -- flags actuals not yet in — margin shown is still based on estimates
  (jo.actual_materials_cost is null or jo.actual_labor_cost is null
    or jo.actual_logistics_cost is null) as is_estimated
from jobs j
left join job_orders jo on jo.job_id = j.job_id;


- **Commission**: percentage of `jobs.final_value`, calculated per agent via `job_commissions.split_pct`. Status moves `pending → payable` only when the job's final payment is received AND job status is `installed`/`closed`. If `jobs.cancelled = true`, related `job_commissions` rows are set to `void`, never `payable`.
- **Funds release for materials, labor, and logistics**: separate from commission payout, and released case-by-case rather than on a fixed rule — Accounting can release the full estimate upfront, or stage it in partial amounts as needed (e.g. a materials deposit now, a labor payout after installation, an outsourced delivery truck payment on dispatch). Each release is logged as its own `fund_releases` row, tagged `materials`, `labor`, or `logistics`, rather than overwriting a single field — the job order shows a running total per category (`sum(fund_releases.amount) where category = ...`) against its matching estimate field. `job_orders.funds_release_status` reflects the combined total across all three categories: `not_released` (sum = 0) → `partially_released` (0 < sum < combined estimate) → `fully_released` (sum >= combined estimate) → `reconciled` (set manually once actuals are confirmed against `actual_materials_cost`, `actual_labor_cost`, and `actual_logistics_cost`). This is a production-enabling action available as soon as the job order is created and approved, not tied to job completion. Track all three actual-cost fields to flag margin overruns (`actual > estimated`, for any category). `logistics_vendor` records which outsourced delivery provider was used, since the company has no owned trucks.
- **Design revisions**: `designs.revision_no > 2` should surface a revision-fee prompt in the Admin portal before the next quotation is finalized.
- **`booked_by` is immutable** once set — this is the commission attribution source of truth and should never be editable after intake, even by Admin, to avoid attribution disputes. If genuinely needed, require an audit-logged override.
- **RLS policies**: Sales sees only their own client/job records for editing (but Admin dashboard aggregates all). Accounting sees payment/commission/funds-release fields across all jobs. Fabricator sees only `job_orders` assigned to them plus read-only job specs.

## Portals — UI requirements

Each portal is a separate route group (e.g. `/sales`, `/admin`, `/accounting`, `/production`) gated by `role` from Supabase Auth session, sharing one underlying `jobs` table.

- **Sales**: client list with status badges, new client intake form, own commission summary card (pending/paid)
- **Admin**: quotation approval queue, design approval queue, full pipeline overview (status counts), per-job profitability view — final value minus materials, labor, logistics costs, and commission payouts, shown as net profit and margin percentage (from `job_profitability`); flag jobs still running on estimated costs (`is_estimated = true`) since actuals may shift the number
- **Accounting**: balances due; funds-release-to-fabrication view per job order showing released-so-far vs. estimated cost with a "release funds" action that logs a new `fund_releases` entry (amount + note) rather than a single toggle; commission payout queue, gated on final payment + job completion
- **Fabrication/Production**: job order board by status (sourcing/in production/QA/ready), materials, labor, and logistics cost vs. estimate, outsourced delivery vendor, deadlines

## Deployment

- GitHub repo, connected to Vercel for CI/CD on push to `main`
- Supabase project for Postgres + Auth + Row Level Security
- Environment variables (Supabase URL/anon key) set in Vercel project settings, never committed
