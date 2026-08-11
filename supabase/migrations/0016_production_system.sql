-- Production system overhaul.
-- Keeps the existing job_orders workflow intact while adding detailed
-- production execution, costing, QC, logistics and installation records.

-- ── Job-order production brief ──────────────────────────────────────────
alter table job_orders add column if not exists order_description text;
alter table job_orders add column if not exists dimensions text;
alter table job_orders add column if not exists quantity numeric(12,2) default 1;
alter table job_orders add column if not exists specifications text;
alter table job_orders add column if not exists installation_notes text;
alter table job_orders add column if not exists production_notes text;
alter table job_orders add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));
alter table job_orders add column if not exists production_stage text not null default 'materials'
  check (production_stage in ('materials','fabrication','printing','finishing','electrical','assembly','qc','ready_for_delivery','installation','completed','on_hold'));
alter table job_orders add column if not exists previous_production_stage text;
alter table job_orders add column if not exists started_at timestamptz;
alter table job_orders add column if not exists completed_at timestamptz;
alter table job_orders add column if not exists hold_reason text;
alter table job_orders add column if not exists scheduled_installation_date date;

-- ── Materials ───────────────────────────────────────────────────────────
create table if not exists job_order_materials (
  material_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  material_name text not null,
  specification text,
  unit text not null default 'unit',
  estimated_qty numeric(12,3),
  actual_qty numeric(12,3),
  estimated_unit_cost numeric(12,2),
  actual_unit_cost numeric(12,2),
  status text not null default 'planned'
    check (status in ('planned','available','partial','shortage','used','cancelled')),
  notes text,
  created_by uuid references users(user_id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Labor/work logs ─────────────────────────────────────────────────────
create table if not exists job_order_labor_logs (
  labor_log_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  worker_name text not null,
  task text not null,
  work_date date not null default current_date,
  hours numeric(8,2) not null default 0,
  hourly_rate numeric(12,2) not null default 0,
  amount numeric(12,2) generated always as (round(hours * hourly_rate, 2)) stored,
  notes text,
  logged_by uuid references users(user_id),
  created_at timestamptz default now()
);

-- ── Production stage history ────────────────────────────────────────────
create table if not exists job_order_stage_history (
  history_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_by uuid references users(user_id),
  note text,
  changed_at timestamptz default now()
);

-- ── Material requests ──────────────────────────────────────────────────
create table if not exists job_order_material_requests (
  request_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  material_name text not null,
  quantity numeric(12,3) not null,
  unit text not null default 'unit',
  estimated_cost numeric(12,2),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','purchased','received','cancelled')),
  requested_by uuid references users(user_id),
  reviewed_by uuid references users(user_id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

-- ── Quality control ─────────────────────────────────────────────────────
create table if not exists job_order_qc_checks (
  qc_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  result text not null check (result in ('pass','fail','conditional')),
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  rework_required boolean not null default false,
  inspected_by uuid references users(user_id),
  inspected_at timestamptz default now()
);

-- ── Delivery / dispatch ─────────────────────────────────────────────────
create table if not exists job_order_deliveries (
  delivery_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  scheduled_date date,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  driver_name text,
  vehicle text,
  destination text,
  status text not null default 'ready'
    check (status in ('ready','dispatched','delivered','failed','rescheduled')),
  notes text,
  created_by uuid references users(user_id),
  created_at timestamptz default now()
);

-- ── Installation ────────────────────────────────────────────────────────
create table if not exists job_order_installations (
  installation_id uuid primary key default gen_random_uuid(),
  job_order_id uuid not null references job_orders(job_order_id) on delete cascade,
  scheduled_date date,
  team_name text,
  location text,
  arrival_at timestamptz,
  departure_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','assigned','on_site','in_progress','partial','completed','failed','rescheduled')),
  representative_name text,
  notes text,
  verified boolean not null default false,
  created_by uuid references users(user_id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────
create index if not exists job_order_materials_job_idx on job_order_materials(job_order_id);
create index if not exists job_order_labor_logs_job_idx on job_order_labor_logs(job_order_id);
create index if not exists job_order_stage_history_job_idx on job_order_stage_history(job_order_id, changed_at desc);
create index if not exists job_order_material_requests_job_idx on job_order_material_requests(job_order_id, status);
create index if not exists job_order_qc_checks_job_idx on job_order_qc_checks(job_order_id, inspected_at desc);
create index if not exists job_order_deliveries_job_idx on job_order_deliveries(job_order_id, scheduled_date);
create index if not exists job_order_installations_job_idx on job_order_installations(job_order_id, scheduled_date);

-- ── Attachment categories ───────────────────────────────────────────────
-- Existing categories remain valid. New categories distinguish production
-- reference material, progress evidence, QC evidence and installation proof.
alter table job_attachments
  drop constraint if exists job_attachments_category_check;
alter table job_attachments
  add constraint job_attachments_category_check
  check (category in (
    'transaction','site_visit','approved_design','reference',
    'order_reference','production_progress','qc','installation_proof'
  ));

-- ── RLS ─────────────────────────────────────────────────────────────────
alter table job_order_materials enable row level security;
alter table job_order_labor_logs enable row level security;
alter table job_order_stage_history enable row level security;
alter table job_order_material_requests enable row level security;
alter table job_order_qc_checks enable row level security;
alter table job_order_deliveries enable row level security;
alter table job_order_installations enable row level security;

-- Fabricators can work only on their assigned orders.
drop policy if exists "fabricator reads own job_orders" on job_orders;
create policy "fabricator reads own job_orders" on job_orders for select
  using (current_user_role() = 'fabricator' and fabricator_id = current_user_id());
drop policy if exists "fabricator updates own job_orders" on job_orders;
create policy "fabricator updates own job_orders" on job_orders for update
  using (current_user_role() = 'fabricator' and fabricator_id = current_user_id())
  with check (current_user_role() = 'fabricator' and fabricator_id = current_user_id());

create policy "admin full access production materials" on job_order_materials for all using (current_user_role() = 'admin');
create policy "fabricator reads own production materials" on job_order_materials for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator inserts own production materials" on job_order_materials for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator updates own production materials" on job_order_materials for update
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()))
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "accounting reads production materials" on job_order_materials for select
  using (current_user_role() = 'accounting');

create policy "admin full access production labor" on job_order_labor_logs for all using (current_user_role() = 'admin');
create policy "fabricator reads own production labor" on job_order_labor_logs for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator inserts own production labor" on job_order_labor_logs for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator updates own production labor" on job_order_labor_logs for update
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()))
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "accounting reads production labor" on job_order_labor_logs for select
  using (current_user_role() = 'accounting');

create policy "admin full access production stage history" on job_order_stage_history for all using (current_user_role() = 'admin');
create policy "fabricator reads own stage history" on job_order_stage_history for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "accounting reads production stage history" on job_order_stage_history for select
  using (current_user_role() = 'accounting');

create policy "admin full access material requests" on job_order_material_requests for all using (current_user_role() = 'admin');
create policy "fabricator reads own material requests" on job_order_material_requests for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator creates material requests" on job_order_material_requests for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()) and requested_by = current_user_id());
create policy "fabricator updates own pending material requests" on job_order_material_requests for update
  using (current_user_role() = 'fabricator' and requested_by = current_user_id() and status = 'pending')
  with check (current_user_role() = 'fabricator' and requested_by = current_user_id());
create policy "accounting reads material requests" on job_order_material_requests for select
  using (current_user_role() = 'accounting');

create policy "admin full access qc" on job_order_qc_checks for all using (current_user_role() = 'admin');
create policy "fabricator reads own qc" on job_order_qc_checks for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator creates own qc" on job_order_qc_checks for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()) and inspected_by = current_user_id());
create policy "accounting reads qc" on job_order_qc_checks for select
  using (current_user_role() = 'accounting');

create policy "admin full access deliveries" on job_order_deliveries for all using (current_user_role() = 'admin');
create policy "fabricator reads own deliveries" on job_order_deliveries for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator inserts own deliveries" on job_order_deliveries for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator updates own deliveries" on job_order_deliveries for update
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()))
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "accounting reads deliveries" on job_order_deliveries for select
  using (current_user_role() = 'accounting');

create policy "admin full access installations" on job_order_installations for all using (current_user_role() = 'admin');
create policy "fabricator reads own installations" on job_order_installations for select
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator inserts own installations" on job_order_installations for insert
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "fabricator updates own installations" on job_order_installations for update
  using (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()))
  with check (current_user_role() = 'fabricator' and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id()));
create policy "accounting reads installations" on job_order_installations for select
  using (current_user_role() = 'accounting');

-- Attachment access: Admin can upload the approved design/order brief;
-- fabricators can read all attachments attached to their assigned order and
-- can add progress/QC/installation evidence. Existing sales permissions stay.
drop policy if exists "fabricator inserts attachments on own job orders" on job_attachments;
create policy "fabricator inserts production evidence on own job orders" on job_attachments for insert
  with check (
    current_user_role() = 'fabricator'
    and category in ('production_progress','qc','installation_proof')
    and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id())
  );
drop policy if exists "fabricator reads attachments on own job orders" on job_attachments;
create policy "fabricator reads attachments on own job orders" on job_attachments for select
  using (
    current_user_role() = 'fabricator'
    and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id())
  );

-- Storage policies for the new production evidence categories. The existing
-- admin/sales policies remain; this adds the restricted fabricator write path.
drop policy if exists "fabricator uploads to assigned job folders" on storage.objects;
create policy "fabricator uploads production evidence to assigned job folders"
on storage.objects for insert
with check (
  bucket_id = 'job-attachments'
  and current_user_role() = 'fabricator'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from job_orders where fabricator_id = current_user_id()
  )
  and (storage.foldername(name))[2] in ('production_progress','qc','installation_proof')
);

-- ── Automatic stage audit ───────────────────────────────────────────────
create or replace function log_job_order_stage_change() returns trigger
language plpgsql security definer as $$
begin
  if new.production_stage is distinct from old.production_stage then
    insert into job_order_stage_history(job_order_id, from_stage, to_stage, changed_by)
    values (new.job_order_id, old.production_stage, new.production_stage, current_user_id());
  end if;
  return new;
end;
$$;

drop trigger if exists job_order_stage_history_trigger on job_orders;
create trigger job_order_stage_history_trigger
after update of production_stage on job_orders
for each row execute function log_job_order_stage_change();

-- Keep the legacy status in sync with the richer production stage so the
-- existing Admin/Accounting automation continues to work.
create or replace function sync_legacy_job_order_status_from_stage() returns trigger
language plpgsql security definer as $$
begin
  if new.production_stage = 'materials' then new.status := 'sourcing';
  elsif new.production_stage in ('fabrication','printing','finishing','electrical','assembly','on_hold') then new.status := 'in_production';
  elsif new.production_stage = 'qc' then new.status := 'qa';
  elsif new.production_stage = 'ready_for_delivery' then new.status := 'ready_for_install';
  elsif new.production_stage = 'installation' then new.status := 'ready_for_install';
  elsif new.production_stage = 'completed' then new.status := 'installed';
  end if;
  return new;
end;
$$;

drop trigger if exists job_order_stage_sync_status on job_orders;
create trigger job_order_stage_sync_status
before insert or update of production_stage on job_orders
for each row execute function sync_legacy_job_order_status_from_stage();

-- Backfill the richer stage from the legacy status for existing records.
update job_orders set production_stage = case
  when status = 'sourcing' then 'materials'
  when status = 'in_production' then 'fabrication'
  when status = 'qa' then 'qc'
  when status = 'ready_for_install' then 'ready_for_delivery'
  when status = 'installed' then 'completed'
  else 'materials'
end;

-- Seed a history entry for existing orders so the activity timeline has a
-- starting point without inventing events beyond the current state.
insert into job_order_stage_history(job_order_id, from_stage, to_stage, note)
select jo.job_order_id, null, jo.production_stage, 'Production system initialized'
from job_orders jo
where not exists (
  select 1 from job_order_stage_history h where h.job_order_id = jo.job_order_id
);

-- ── Cost roll-ups into the legacy job-order fields ───────────────────────
-- These fields are already consumed by Accounting/job_profitability. The
-- Production detail tables therefore become the operational source while
-- the legacy totals remain the compatibility/reporting source.
create or replace function recalc_job_order_material_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  if exists (select 1 from job_order_materials where job_order_id = v_job_order_id) then
    update job_orders
    set actual_materials_cost = (
      select coalesce(sum(coalesce(actual_qty, 0) * coalesce(actual_unit_cost, 0)), 0)
      from job_order_materials where job_order_id = v_job_order_id
    )
    where job_order_id = v_job_order_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists job_order_material_cost_rollup on job_order_materials;
create trigger job_order_material_cost_rollup
after insert or update or delete on job_order_materials
for each row execute function recalc_job_order_material_actuals();

create or replace function recalc_job_order_labor_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  if exists (select 1 from job_order_labor_logs where job_order_id = v_job_order_id) then
    update job_orders
    set actual_labor_cost = (
      select coalesce(sum(amount), 0) from job_order_labor_logs where job_order_id = v_job_order_id
    )
    where job_order_id = v_job_order_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists job_order_labor_cost_rollup on job_order_labor_logs;
create trigger job_order_labor_cost_rollup
after insert or update or delete on job_order_labor_logs
for each row execute function recalc_job_order_labor_actuals();

alter table job_order_deliveries add column if not exists actual_cost numeric(12,2);
create or replace function recalc_job_order_logistics_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  if exists (select 1 from job_order_deliveries where job_order_id = v_job_order_id) then
    update job_orders
    set actual_logistics_cost = (
      select coalesce(sum(coalesce(actual_cost, 0)), 0) from job_order_deliveries where job_order_id = v_job_order_id
    )
    where job_order_id = v_job_order_id;
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists job_order_delivery_cost_rollup on job_order_deliveries;
create trigger job_order_delivery_cost_rollup
after insert or update or delete on job_order_deliveries
for each row execute function recalc_job_order_logistics_actuals();

-- Fabricators may advance production and maintain the production brief, but
-- they cannot alter the commercial/financial controls that Admin/Accounting
-- own. Actual cost totals are maintained by the detail-table roll-ups.
create or replace function protect_fabricator_job_order_fields() returns trigger
language plpgsql security definer as $$
begin
  if current_user_role() = 'fabricator' and coalesce(current_setting('app.production_cost_rollup', true), 'false') <> 'true' then
    if new.job_id is distinct from old.job_id
      or new.fabricator_id is distinct from old.fabricator_id
      or new.estimated_materials_cost is distinct from old.estimated_materials_cost
      or new.estimated_labor_cost is distinct from old.estimated_labor_cost
      or new.estimated_logistics_cost is distinct from old.estimated_logistics_cost
      or new.actual_materials_cost is distinct from old.actual_materials_cost
      or new.actual_labor_cost is distinct from old.actual_labor_cost
      or new.actual_logistics_cost is distinct from old.actual_logistics_cost
      or new.funds_release_status is distinct from old.funds_release_status
      or new.logistics_vendor is distinct from old.logistics_vendor
      or new.deadline is distinct from old.deadline
      or new.priority is distinct from old.priority then
      raise exception 'Fabricators cannot change commercial, financial, assignment, deadline or priority fields on a Job Order';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_fabricator_job_order_fields on job_orders;
create trigger protect_fabricator_job_order_fields
before update on job_orders
for each row execute function protect_fabricator_job_order_fields();

-- Fabricators can only edit their own material requests while still pending.
drop policy if exists "fabricator updates own pending material requests" on job_order_material_requests;
create policy "fabricator updates own pending material requests" on job_order_material_requests for update
  using (current_user_role() = 'fabricator' and requested_by = current_user_id() and status = 'pending')
  with check (current_user_role() = 'fabricator' and requested_by = current_user_id() and status = 'pending');
