-- DW AdSign CRM V12.2.1
-- Current-database upgrade: commission admin defaults, audit trail,
-- Sales quotation permissions, and workflow safeguards.
-- Safe to re-run.

-- ============================================================
-- 1. ADMIN COMMISSION DEFAULTS
-- ============================================================
create table if not exists commission_settings (
  settings_id integer primary key default 1 check (settings_id = 1),
  commission_type text not null default 'percentage' check (commission_type in ('percentage','fixed')),
  commission_value numeric(12,2) not null default 10.00 check (commission_value >= 0),
  updated_by uuid references users(user_id),
  updated_at timestamptz not null default now()
);

alter table commission_settings enable row level security;
drop policy if exists "admin full access commission_settings" on commission_settings;
create policy "admin full access commission_settings" on commission_settings for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

insert into commission_settings(settings_id, commission_type, commission_value)
values (1, 'percentage', 10.00)
on conflict (settings_id) do nothing;

-- ============================================================
-- 2. COMMISSION FUNCTIONS / TRIGGERS
-- ============================================================
alter table job_commissions add column if not exists commission_rate numeric(5,2) not null default 10.00;
alter table job_commissions add column if not exists commission_type text not null default 'percentage';
alter table job_commissions add column if not exists commission_value numeric(12,2) not null default 10.00;

alter table job_commissions drop constraint if exists job_commissions_type_check;
alter table job_commissions add constraint job_commissions_type_check
  check (commission_type in ('percentage','fixed'));

create or replace function job_commission_config_trigger()
returns trigger as $$
begin
  if new.commission_type = 'percentage' then
    new.commission_rate = coalesce(new.commission_value, 0);
  elsif TG_OP = 'INSERT' then
    new.commission_rate = 0;
  else
    new.commission_rate = coalesce(old.commission_rate, 0);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_commissions_config_before_change on job_commissions;
create trigger job_commissions_config_before_change
before insert or update of commission_type, commission_value on job_commissions
for each row execute function job_commission_config_trigger();

create or replace function calc_commission_amount(p_job_id uuid)
returns void as $$
begin
  update job_commissions jc
  set amount = round(
    (
      case
        when jc.commission_type = 'fixed' then coalesce(jc.commission_value,0)
        else coalesce((select final_value from jobs where job_id = p_job_id),0)
          * coalesce(jc.commission_value,0) / 100
      end
    ) * coalesce(jc.split_pct,100) / 100, 2)
  where jc.job_id = p_job_id
    and jc.status not in ('paid','void');
end;
$$ language plpgsql security definer;

create or replace function jobs_after_update_recalc_amount()
returns trigger as $$
begin
  perform calc_commission_amount(new.job_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_after_update_commission_amount on jobs;
create trigger jobs_after_update_commission_amount
after update of final_value on jobs
for each row execute function jobs_after_update_recalc_amount();

create or replace function job_commissions_after_config_change()
returns trigger as $$
begin
  perform calc_commission_amount(new.job_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists job_commissions_after_config_change on job_commissions;
create trigger job_commissions_after_config_change
after update of commission_type, commission_value, split_pct on job_commissions
for each row execute function job_commissions_after_config_change();

create or replace function jobs_after_insert_create_commission()
returns trigger as $$
declare
  v_type text;
  v_value numeric(12,2);
begin
  select commission_type, commission_value into v_type, v_value
  from commission_settings where settings_id = 1;

  insert into job_commissions (
    job_id, agent_id, split_pct, commission_type, commission_value,
    commission_rate, amount, status
  ) values (
    new.job_id,
    new.booked_by,
    100.00,
    coalesce(v_type,'percentage'),
    coalesce(v_value,10.00),
    case when coalesce(v_type,'percentage') = 'percentage' then coalesce(v_value,10.00) else 0 end,
    case
      when coalesce(v_type,'percentage') = 'fixed' then coalesce(v_value,10.00)
      when new.final_value is not null then new.final_value * coalesce(v_value,10.00) / 100
      else 0
    end,
    'pending'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists jobs_after_insert_commission on jobs;
create trigger jobs_after_insert_commission
after insert on jobs
for each row execute function jobs_after_insert_create_commission();

-- Repair jobs created before the commission trigger existed.
insert into job_commissions(job_id, agent_id, split_pct, commission_type, commission_value, commission_rate, amount, status)
select
  j.job_id, j.booked_by, 100.00,
  coalesce(cs.commission_type,'percentage'), coalesce(cs.commission_value,10.00),
  case when coalesce(cs.commission_type,'percentage') = 'percentage' then coalesce(cs.commission_value,10.00) else 0 end,
  case
    when coalesce(cs.commission_type,'percentage') = 'fixed' then coalesce(cs.commission_value,10.00)
    when j.final_value is not null then j.final_value * coalesce(cs.commission_value,10.00) / 100
    else 0
  end,
  'pending'
from jobs j
cross join (select commission_type, commission_value from commission_settings where settings_id = 1) cs
where not exists (select 1 from job_commissions jc where jc.job_id = j.job_id);

-- ============================================================
-- 3. SALES QUOTATION WORKFLOW SAFETY
-- ============================================================
drop policy if exists "sales inserts own job quotations" on quotations;
create policy "sales inserts own job quotations" on quotations for insert
with check (current_user_role() = 'sales' and job_id in (select job_id from jobs where booked_by = current_user_id()));

drop policy if exists "sales updates own job quotations" on quotations;
create policy "sales updates own job quotations" on quotations for update
using (current_user_role() = 'sales' and job_id in (select job_id from jobs where booked_by = current_user_id()));

create or replace function protect_sales_quotation_status()
returns trigger as $$
begin
  if current_user_role() = 'sales' and new.quotation_status in ('accepted','rejected') then
    raise exception 'Sales can prepare and send quotations, but only Admin can accept or reject a quotation.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists protect_sales_quotation_status on quotations;
create trigger protect_sales_quotation_status
before insert or update of quotation_status on quotations
for each row execute function protect_sales_quotation_status();

-- ============================================================
-- 4. AUDIT TRAIL
-- ============================================================
create table if not exists audit_logs (
  audit_id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(user_id),
  action text not null,
  table_name text not null,
  record_id text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table audit_logs enable row level security;
drop policy if exists "admin reads audit_logs" on audit_logs;
create policy "admin reads audit_logs" on audit_logs for select using (current_user_role() = 'admin');

drop function if exists write_audit_log() cascade;
create function write_audit_log()
returns trigger as $$
declare
  v_actor uuid;
  v_id text;
begin
  v_actor := current_user_id();
  v_id := coalesce(to_jsonb(new)->>TG_ARGV[0], to_jsonb(old)->>TG_ARGV[0]);

  insert into audit_logs(actor_id, action, table_name, record_id, old_data, new_data)
  values (
    v_actor,
    case TG_OP when 'INSERT' then 'created' when 'UPDATE' then 'updated' when 'DELETE' then 'deleted' end,
    TG_TABLE_NAME,
    v_id,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Avoid duplicate trigger creation when rerun.
drop trigger if exists audit_quotations on quotations;
create trigger audit_quotations after insert or update or delete on quotations
for each row execute function write_audit_log('quotation_id');

drop trigger if exists audit_jobs on jobs;
create trigger audit_jobs after insert or update or delete on jobs
for each row execute function write_audit_log('job_id');

drop trigger if exists audit_job_commissions on job_commissions;
create trigger audit_job_commissions after insert or update or delete on job_commissions
for each row execute function write_audit_log('commission_id');

drop trigger if exists audit_designs on designs;
create trigger audit_designs after insert or update or delete on designs
for each row execute function write_audit_log('design_id');

drop trigger if exists audit_job_acknowledgments on job_acknowledgments;
create trigger audit_job_acknowledgments after insert or update or delete on job_acknowledgments
for each row execute function write_audit_log('acknowledgment_id');

-- ============================================================
-- 5. VERIFY / RECALCULATE OPEN COMMISSIONS
-- ============================================================
do $$
declare r record;
begin
  for r in select distinct job_id from job_commissions where status not in ('paid','void') loop
    perform calc_commission_amount(r.job_id);
  end loop;
end;
$$;

-- Audit the global commission setting itself.
drop trigger if exists audit_commission_settings on commission_settings;
create trigger audit_commission_settings after insert or update or delete on commission_settings
for each row execute function write_audit_log('settings_id');
