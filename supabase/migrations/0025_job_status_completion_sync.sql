-- DW AdSign CRM: synchronize parent job status from completed installation + payment.
--
-- Root cause fixed here:
-- job_orders / installation records could reach the real-world "installed"
-- state while jobs.status remained "in_production". Accounting correctly rejected
-- that stale parent status, leaving an installed + fully-paid job impossible to close.
--
-- Business rule:
--   completed + verified installation => jobs.status = installed
--   completed + verified installation + fully received customer payment => jobs.status = paid
--   accounting_job_closures remains the separate financial-close record.
--
-- This migration is idempotent and also repairs existing stale jobs.

create or replace function sync_parent_job_completion_status(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_final numeric(12,2);
  v_received numeric(12,2);
  v_install_status text;
  v_install_verified boolean;
  v_next_status text;
begin
  select * into v_job
  from jobs
  where job_id = p_job_id;

  if not found then
    return;
  end if;

  -- Never move cancelled or already financially closed jobs backwards.
  if coalesce(v_job.cancelled, false) or v_job.status = 'closed' then
    return;
  end if;

  select i.status, i.verified
    into v_install_status, v_install_verified
  from job_order_installations i
  join job_orders jo on jo.job_order_id = i.job_order_id
  where jo.job_id = p_job_id
  order by i.updated_at desc nulls last, i.created_at desc
  limit 1;

  -- Installation is not a parent-job completion event until Admin verification
  -- is present. This prevents Production from self-promoting a job.
  if coalesce(v_install_status, '') <> 'completed'
     or coalesce(v_install_verified, false) <> true then
    return;
  end if;

  select coalesce(j.final_value, j.quoted_value, 0)
    into v_final
  from jobs j
  where j.job_id = p_job_id;

  select coalesce(sum(p.amount), 0)
    into v_received
  from payments p
  where p.job_id = p_job_id
    and p.status = 'received';

  if v_received + 0.01 >= v_final then
    v_next_status := 'paid';
  else
    v_next_status := 'installed';
  end if;

  -- Only advance stale/earlier operational states. Do not overwrite a later
  -- state such as paid/closed or an explicit cancelled state.
  if v_job.status in ('approved', 'in_production', 'installed') then
    if v_job.status is distinct from v_next_status then
      update jobs
      set status = v_next_status
      where job_id = p_job_id;
    end if;
  end if;
end;
$$;

-- Production/admin installation changes are the primary operational trigger.
create or replace function job_installations_sync_parent_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_parent_job_completion_status(coalesce(new.job_order_id, old.job_order_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists job_installations_sync_parent_status on job_order_installations;
create trigger job_installations_sync_parent_status
after insert or update of status, verified or delete on job_order_installations
for each row
execute function job_installations_sync_parent_status_trigger();

-- Payment changes can make an already-installed job become fully paid.
create or replace function payments_sync_parent_job_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_parent_job_completion_status(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists payments_sync_parent_job_status on payments;
create trigger payments_sync_parent_job_status
after insert or update of amount, status, job_id or delete on payments
for each row
execute function payments_sync_parent_job_status_trigger();

-- Also repair parent status when an existing job-order is marked installed.
create or replace function job_orders_sync_parent_job_completion_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_parent_job_completion_status(new.job_id);
  return new;
end;
$$;

drop trigger if exists job_orders_sync_parent_job_completion_status on job_orders;
create trigger job_orders_sync_parent_job_completion_status
after insert or update of status, production_stage on job_orders
for each row
execute function job_orders_sync_parent_job_completion_status_trigger();

-- Backfill existing stale records. This is intentionally based on the real
-- installation + payment records rather than customer name or Job ID.
do $$
declare
  r record;
begin
  for r in
    select distinct jo.job_id
    from job_orders jo
    join job_order_installations i on i.job_order_id = jo.job_order_id
    where i.status = 'completed'
      and i.verified = true
  loop
    perform sync_parent_job_completion_status(r.job_id);
  end loop;
end;
$$;
