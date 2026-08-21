-- Accounting financial-close override.
--
-- Problem: validate_accounting_job_closure() (0017) hard-blocks financial
-- close unless production_stage = 'completed', the latest QC passed, the
-- latest installation is completed + verified, there are no pending
-- material requests, and actual costs are fully reconciled. For jobs where
-- the customer already paid in full after installation but some upstream
-- operational record was never logged correctly in Production (a missed QC
-- entry, an installation record that was never marked verified, a stale
-- material request, etc.), Accounting has no way to close the job at all,
-- even though the money side of the job is done.
--
-- This migration adds an explicit, auditable override path. It does NOT
-- relax the standard process for the normal close button — every existing
-- check still applies by default. Override only kicks in when Accounting
-- deliberately sets override = true and supplies a written reason, and even
-- then it never waives the two facts that actually define "the job is
-- financially done": the job must be fully paid, and the job must have
-- reached installed/paid/closed. Those two conditions cannot be overridden.

alter table accounting_job_closures add column if not exists override boolean not null default false;
alter table accounting_job_closures add column if not exists override_reason text;
alter table accounting_job_closures add column if not exists override_by uuid references users(user_id);

create or replace function validate_accounting_job_closure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_final numeric(12,2);
  v_received numeric(12,2);
  v_production_stage text;
  v_qc_result text;
  v_qc_rework boolean;
  v_install_status text;
  v_install_verified boolean;
  v_pending_requests integer;
  v_actual_materials numeric(12,2);
  v_actual_labor numeric(12,2);
  v_actual_logistics numeric(12,2);
begin
  select j.status, coalesce(j.final_value, j.quoted_value, 0)
    into v_status, v_final
  from jobs j
  where j.job_id = new.job_id;

  if v_status is null then
    raise exception 'Job does not exist';
  end if;

  -- These two facts define "the job is financially done" and are never
  -- waived, override or not: the customer balance must be fully in, and
  -- the job must actually have reached an installed/paid/closed state.
  select coalesce(sum(p.amount), 0)
    into v_received
  from payments p
  where p.job_id = new.job_id
    and p.status = 'received';

  if v_received + 0.01 < v_final then
    raise exception 'Customer balance must be fully received before financial close';
  end if;

  if v_status not in ('installed', 'paid', 'closed') then
    raise exception 'Job must be installed, paid, or closed before financial close';
  end if;

  if new.override then
    -- Accounting discretion path: require a written reason and stamp who
    -- authorized it, but skip the granular production/QC/installation/
    -- material-request gates below. Everything is still written to
    -- accounting_job_closures and audit_logs, so this is a logged exception,
    -- not a silent bypass.
    if new.override_reason is null or length(trim(new.override_reason)) < 5 then
      raise exception 'An override reason is required to close a job outside the standard operational checklist';
    end if;
    new.override_by := coalesce(new.override_by, new.closed_by);
    return new;
  end if;

  -- Standard path: full operational readiness, unchanged from before.
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

-- accounting_job_closures was never wired into the generic audit trail
-- (0020). An override close is exactly the kind of action that should show
-- up there, so bring the whole table under audit, not just overrides.
drop trigger if exists audit_accounting_job_closures on accounting_job_closures;
create trigger audit_accounting_job_closures after insert or update or delete on accounting_job_closures
for each row execute function write_audit_log('closure_id');
