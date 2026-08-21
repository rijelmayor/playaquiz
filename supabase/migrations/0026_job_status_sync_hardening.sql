-- DW AdSign CRM: harden installation/payment -> parent job status synchronization.
--
-- This follow-up is safe whether 0025 was just applied or was already present.
-- It re-creates the sync function/triggers and performs a deterministic backfill.
--
-- Business rule:
--   completed + verified installation + unpaid balance -> installed
--   completed + verified installation + fully received payment -> paid
--   never move closed/cancelled jobs backwards
--
-- Financial closure remains separate in accounting_job_closures.

create or replace function sync_parent_job_completion_status(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_final numeric(12,2);
  v_received numeric(12,2);
  v_install_status text;
  v_install_verified boolean;
  v_next_status text;
begin
  select
    j.status,
    coalesce(j.final_value, j.quoted_value, 0)
  into
    v_status,
    v_final
  from jobs j
  where j.job_id = p_job_id;

  if not found then
    return;
  end if;

  if coalesce((select cancelled from jobs where job_id = p_job_id), false)
     or v_status = 'closed' then
    return;
  end if;

  select
    i.status,
    coalesce(i.verified, false)
  into
    v_install_status,
    v_install_verified
  from job_order_installations i
  join job_orders jo on jo.job_order_id = i.job_order_id
  where jo.job_id = p_job_id
  order by i.updated_at desc nulls last, i.created_at desc nulls last
  limit 1;

  if coalesce(v_install_status, '') <> 'completed'
     or v_install_verified is not true then
    return;
  end if;

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

  -- Only repair stale operational states. Never demote paid/closed/cancelled.
  if v_status in ('lead', 'site_visit', 'design_review', 'quoted', 'approved', 'in_production', 'installed') then
    if v_status is distinct from v_next_status then
      update jobs
      set status = v_next_status
      where job_id = p_job_id;
    end if;
  end if;
end;
$$;

create or replace function job_installations_sync_parent_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_parent_job_completion_status(old.job_order_id);
    return old;
  end if;

  perform sync_parent_job_completion_status(new.job_order_id);
  return new;
end;
$$;

drop trigger if exists job_installations_sync_parent_status on job_order_installations;
create trigger job_installations_sync_parent_status
after insert or update of status, verified or delete on job_order_installations
for each row
execute function job_installations_sync_parent_status_trigger();

create or replace function payments_sync_parent_job_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_parent_job_completion_status(old.job_id);
    return old;
  end if;

  perform sync_parent_job_completion_status(new.job_id);
  return new;
end;
$$;

drop trigger if exists payments_sync_parent_job_status on payments;
create trigger payments_sync_parent_job_status
after insert or update of amount, status, job_id or delete on payments
for each row
execute function payments_sync_parent_job_status_trigger();

create or replace function job_orders_sync_parent_job_completion_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform sync_parent_job_completion_status(old.job_id);
    return old;
  end if;

  perform sync_parent_job_completion_status(new.job_id);
  return new;
end;
$$;

drop trigger if exists job_orders_sync_parent_job_completion_status on job_orders;
create trigger job_orders_sync_parent_job_completion_status
after insert or update of status, production_stage or job_id or delete on job_orders
for each row
execute function job_orders_sync_parent_job_completion_status_trigger();

-- Deterministic repair for every existing job whose latest installation is
-- completed and verified. No customer-name or hard-coded Job ID is used.
do $$
declare
  r record;
begin
  for r in
    select distinct jo.job_id
    from job_orders jo
    join job_order_installations i
      on i.job_order_id = jo.job_order_id
    where i.status = 'completed'
      and coalesce(i.verified, false) = true
  loop
    perform sync_parent_job_completion_status(r.job_id);
  end loop;
end;
$$;
