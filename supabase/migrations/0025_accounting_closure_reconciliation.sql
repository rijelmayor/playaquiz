-- DW AdSign CRM V14.1
-- Accounting closure reconciliation + commission finalization.
--
-- Goals:
-- 1. Accounting can close a fully-paid job when the operational job-order
--    proves the work reached installation/completion, even if the parent
--    jobs.status is stale.
-- 2. A financial close makes the parent job status CLOSED so Admin no longer
--    treats the job as active/in production.
-- 3. Fully received payment schedules are synchronized on close.
-- 4. Commission amount is calculated from final_value OR quoted_value and
--    becomes PAYABLE when the job is financially closed.
-- 5. Override remains auditable and still requires full customer payment plus
--    operational evidence that the job reached installation/completion.

-- ------------------------------------------------------------
-- 1. Commission calculation: use final value, falling back to quoted value.
-- ------------------------------------------------------------
create or replace function calc_commission_amount(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update job_commissions jc
  set amount = round(
    (
      case
        when jc.commission_type = 'fixed' then coalesce(jc.commission_value, 0)
        else coalesce(
          (select coalesce(final_value, quoted_value, 0) from jobs where job_id = p_job_id),
          0
        ) * coalesce(jc.commission_value, 0) / 100
      end
    ) * coalesce(jc.split_pct, 100) / 100,
    2
  )
  where jc.job_id = p_job_id
    and jc.status not in ('paid', 'void');
end;
$$;

-- Recalculate every open commission now, including older jobs whose
-- final_value was never populated but quoted_value exists.
do $$
declare r record;
begin
  for r in select distinct job_id from job_commissions where status not in ('paid','void') loop
    perform calc_commission_amount(r.job_id);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- 2. Operational completion evidence independent of parent jobs.status.
-- ------------------------------------------------------------
create or replace function job_has_installation_completion(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from job_orders jo
    where jo.job_id = p_job_id
      and (
        jo.production_stage = 'completed'
        or jo.status in ('installed', 'completed')
        or exists (
          select 1
          from job_order_installations i
          where i.job_order_id = jo.job_order_id
            and i.status = 'completed'
        )
      )
  );
$$;

-- ------------------------------------------------------------
-- 3. Commission synchronization.
--    Full payment is based on total received, not merely a particular
--    payment row being attached to a specific milestone schedule.
-- ------------------------------------------------------------
create or replace function sync_job_commissions(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jobs%rowtype;
  v_final numeric(12,2);
  v_received numeric(12,2);
  v_complete boolean;
begin
  select * into v_job from jobs where job_id = p_job_id;
  if v_job is null then return; end if;

  if v_job.cancelled then
    update job_commissions
    set status = 'void'
    where job_id = p_job_id and status not in ('paid', 'void');
    return;
  end if;

  v_final := coalesce(v_job.final_value, v_job.quoted_value, 0);

  select coalesce(sum(p.amount), 0)
    into v_received
  from payments p
  where p.job_id = p_job_id
    and p.status = 'received';

  v_complete := job_has_installation_completion(p_job_id)
    or v_job.status in ('installed', 'paid', 'closed');

  if v_received + 0.01 >= v_final and v_complete then
    perform calc_commission_amount(p_job_id);
    update job_commissions
    set status = 'payable'
    where job_id = p_job_id and status = 'pending';
  end if;
end;
$$;

-- Ensure future job-status/payment changes continue to synchronize commission.
drop trigger if exists jobs_after_update_sync_commissions on jobs;
create trigger jobs_after_update_sync_commissions
after update of status, cancelled, final_value, quoted_value on jobs
for each row execute function sync_job_commissions(new.job_id);

drop trigger if exists payments_after_change_sync_commissions on payments;
create trigger payments_after_change_sync_commissions
after insert or update or delete on payments
for each row execute function sync_job_commissions(coalesce(new.job_id, old.job_id));

-- ------------------------------------------------------------
-- 4. Replace closure validation.
-- ------------------------------------------------------------
create or replace function validate_accounting_job_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final numeric(12,2);
  v_received numeric(12,2);
  v_operational_complete boolean;
  v_production_stage text;
  v_actual_materials numeric(12,2);
  v_actual_labor numeric(12,2);
  v_actual_logistics numeric(12,2);
  v_qc_result text;
  v_qc_rework boolean;
  v_install_status text;
  v_install_verified boolean;
  v_pending_requests integer;
begin
  select coalesce(j.final_value, j.quoted_value, 0)
    into v_final
  from jobs j
  where j.job_id = new.job_id;

  if v_final is null then
    raise exception 'Job does not exist';
  end if;

  select coalesce(sum(p.amount), 0)
    into v_received
  from payments p
  where p.job_id = new.job_id
    and p.status = 'received';

  if v_received + 0.01 < v_final then
    raise exception 'Customer balance must be fully received before financial close';
  end if;

  v_operational_complete := job_has_installation_completion(new.job_id);

  if not v_operational_complete then
    raise exception 'Job must have reached installation/completion before financial close';
  end if;

  if new.override then
    if new.override_reason is null or length(trim(new.override_reason)) < 5 then
      raise exception 'An override reason is required to close a job outside the standard operational checklist';
    end if;
    new.override_by := coalesce(new.override_by, new.closed_by);
    return new;
  end if;

  select jo.production_stage, jo.actual_materials_cost, jo.actual_labor_cost, jo.actual_logistics_cost
    into v_production_stage, v_actual_materials, v_actual_labor, v_actual_logistics
  from job_orders jo
  where jo.job_id = new.job_id
  order by jo.job_order_id desc
  limit 1;

  if coalesce(v_production_stage, '') <> 'completed' then
    raise exception 'Production must be completed before financial close';
  end if;

  if v_actual_materials is null or v_actual_labor is null or v_actual_logistics is null then
    raise exception 'Actual production costs must be reconciled before financial close';
  end if;

  select q.result, q.rework_required
    into v_qc_result, v_qc_rework
  from job_order_qc_checks q
  join job_orders jo on jo.job_order_id = q.job_order_id
  where jo.job_id = new.job_id
  order by q.inspected_at desc
  limit 1;

  if coalesce(v_qc_result, '') <> 'pass' or coalesce(v_qc_rework, true) then
    raise exception 'A passing final QC inspection is required before financial close';
  end if;

  select i.status, i.verified
    into v_install_status, v_install_verified
  from job_order_installations i
  join job_orders jo on jo.job_order_id = i.job_order_id
  where jo.job_id = new.job_id
  order by i.updated_at desc nulls last, i.created_at desc
  limit 1;

  if coalesce(v_install_status, '') <> 'completed' or coalesce(v_install_verified, false) <> true then
    raise exception 'Installation must be completed and verified before financial close';
  end if;

  select count(*)
    into v_pending_requests
  from job_order_material_requests r
  join job_orders jo on jo.job_order_id = r.job_order_id
  where jo.job_id = new.job_id
    and r.status = 'pending';

  if v_pending_requests > 0 then
    raise exception 'Pending material requests must be resolved before financial close';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_job_closure_validation on accounting_job_closures;
create trigger accounting_job_closure_validation
before insert or update on accounting_job_closures
for each row execute function validate_accounting_job_closure();

-- ------------------------------------------------------------
-- 5. After financial close: synchronize the parent job, payment schedules,
--    and commission status.
-- ------------------------------------------------------------
create or replace function finalize_accounting_job_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_final numeric(12,2);
  v_received numeric(12,2);
begin
  select coalesce(final_value, quoted_value, 0)
    into v_final
  from jobs
  where job_id = new.job_id;

  select coalesce(sum(amount), 0)
    into v_received
  from payments
  where job_id = new.job_id
    and status = 'received';

  -- Once Accounting closes the financial transaction, the parent pipeline
  -- must stop reporting the job as In Production.
  update jobs
  set status = 'closed',
      updated_at = now()
  where job_id = new.job_id
    and status <> 'cancelled';

  -- If the customer has actually paid the full final/quoted value, all
  -- remaining milestone schedules are settled. This fixes cases where the
  -- payment row was attached to an earlier milestone but the money itself
  -- is already fully received.
  if v_received + 0.01 >= v_final then
    update payment_schedules
    set status = 'paid', updated_at = now()
    where job_id = new.job_id
      and status <> 'paid';
  end if;

  perform calc_commission_amount(new.job_id);
  update job_commissions
  set status = 'payable'
  where job_id = new.job_id
    and status = 'pending';

  return new;
end;
$$;

drop trigger if exists accounting_job_closure_finalize on accounting_job_closures;
create trigger accounting_job_closure_finalize
after insert or update on accounting_job_closures
for each row execute function finalize_accounting_job_closure();

-- Keep closure actions auditable.
drop trigger if exists audit_accounting_job_closures on accounting_job_closures;
create trigger audit_accounting_job_closures
after insert or update or delete on accounting_job_closures
for each row execute function write_audit_log('closure_id');

-- ------------------------------------------------------------
-- 6. Repair the known Nikki payment schedule inconsistency.
--    The balance payment is received but was attached to the down-payment
--    schedule. Move it to the completion schedule, then mark both milestones
--    paid because the entire ₱5,750 job is received.
-- ------------------------------------------------------------
do $$
declare
  v_job_id uuid := 'f06da5e6-a6d0-4ced-be32-bfa86e30d703';
  v_completion_id uuid;
begin
  select payment_schedule_id
    into v_completion_id
  from payment_schedules
  where job_id = v_job_id
    and due_stage = 'completion'
  order by sequence_no desc
  limit 1;

  if v_completion_id is not null then
    update payments p
    set payment_schedule_id = v_completion_id
    where p.job_id = v_job_id
      and p.type = 'balance'
      and p.status = 'received'
      and exists (
        select 1
        from payment_schedules ps
        where ps.payment_schedule_id = p.payment_schedule_id
          and ps.job_id = v_job_id
          and ps.due_stage = 'approval'
      );
  end if;

  update payment_schedules
  set status = 'paid', updated_at = now()
  where job_id = v_job_id
    and exists (
      select 1
      from payments p
      where p.job_id = v_job_id
        and p.status = 'received'
    )
    and (select coalesce(sum(p.amount),0) from payments p where p.job_id = v_job_id and p.status = 'received')
        + 0.01 >= (select coalesce(final_value, quoted_value, 0) from jobs where job_id = v_job_id);

  perform calc_commission_amount(v_job_id);
  update job_commissions
  set status = 'payable'
  where job_id = v_job_id and status = 'pending';
end;
$$;
