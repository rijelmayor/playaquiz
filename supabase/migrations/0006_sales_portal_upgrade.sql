-- Advertising CRM: sales portal upgrade
--
-- 1. Customer follow-up status (separate from the operational pipeline
--    status in `jobs.status`, which automation/triggers depend on).
--    Sales sets it day-to-day, admin can edit/override any value.
-- 2. Client email address.
-- 3. `updated_at` on jobs so the UI can show "saved" / "last updated" times.
-- 4. Quotations become fully self-contained documents: line items, terms,
--    validity, who made them — instead of just a single `total` number.
-- 5. `quotation_settings` — a single editable row of company info / terms
--    that Admin can change, which every quotation pulls its defaults from.
-- 6. Sales gets INSERT access to quotations (previously read-only), scoped
--    to jobs they booked, so sales can create quotations too.
--
-- Every statement here is safe to re-run.

-- ── 1. Customer follow-up status ────────────────────────────────────────
alter table jobs add column if not exists follow_up_status text
  not null default 'follow_up'
  check (follow_up_status in ('follow_up', 'drawing', 'approved', 'other'));
alter table jobs add column if not exists follow_up_note text;

-- ── 2. Client email ──────────────────────────────────────────────────────
alter table clients add column if not exists email text;

-- ── 3. updated_at on jobs ────────────────────────────────────────────────
alter table jobs add column if not exists updated_at timestamptz default now();

create or replace function set_jobs_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
before update on jobs
for each row execute function set_jobs_updated_at();

-- ── 4. Quotations: line items, terms, versioned document fields ─────────
alter table quotations add column if not exists items jsonb not null default '[]'::jsonb;
alter table quotations add column if not exists project_job_id text;
alter table quotations add column if not exists customer_name text;
alter table quotations add column if not exists terms text;
alter table quotations add column if not exists services_note text;
alter table quotations add column if not exists valid_days int not null default 15;
alter table quotations add column if not exists created_by uuid references users(user_id);
alter table quotations add column if not exists sent_at timestamptz;
alter table quotations add column if not exists sent_to text;

-- ── 5. quotation_settings (singleton, admin-editable) ────────────────────
create table if not exists quotation_settings (
  id int primary key default 1,
  company_name text not null default 'Delight Works Advertising Signages',
  company_address text not null default '2nd Flr, Unit 15, Ellen''s Bldg, Jasmin St., Capitol Site, Cebu City',
  company_contact text not null default '09569934866/09329848552/09205102720',
  services_note text not null default 'Mock-Up/Mobilization/Installation FREE',
  terms text not null default
'1. Estimated days to finish the project is 5-7 working days from approval and downpayment.
2. Price Quote Valid 15 days
3. Mode of payment: 50% downpayment and 50% after completion
4. All Payments shall be made via Cash, Check or Credit Card
5. All Checks Payable to: __________',
  valid_days int not null default 15,
  updated_by uuid references users(user_id),
  updated_at timestamptz default now(),
  constraint quotation_settings_singleton check (id = 1)
);
insert into quotation_settings (id) values (1) on conflict (id) do nothing;

alter table quotation_settings enable row level security;

drop policy if exists "everyone reads quotation_settings" on quotation_settings;
create policy "everyone reads quotation_settings" on quotation_settings for select
  using (current_user_role() in ('sales', 'admin', 'accounting', 'fabricator'));

drop policy if exists "admin updates quotation_settings" on quotation_settings;
create policy "admin updates quotation_settings" on quotation_settings for update
  using (current_user_role() = 'admin');

-- ── 6. Sales can create quotations on their own jobs ─────────────────────
drop policy if exists "sales inserts own job quotations" on quotations;
create policy "sales inserts own job quotations" on quotations for insert
  with check (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

-- Sales/admin should also be able to record that a quotation was emailed
-- (sent_at / sent_to) after the fact.
drop policy if exists "sales updates own job quotations" on quotations;
create policy "sales updates own job quotations" on quotations for update
  using (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );
