-- Production/accounting closure controls.
-- Apply after 0015_accounting_portal.sql and 0016_production_system.sql.

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

  return new;
end;
$$;

drop trigger if exists accounting_job_closure_validation on accounting_job_closures;
create trigger accounting_job_closure_validation
before insert or update on accounting_job_closures
for each row execute function validate_accounting_job_closure();

-- Production cannot be marked completed until final QC and verified installation
-- are actually recorded. This prevents an API/UI call from skipping the
-- operational completion gate.
create or replace function validate_production_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qc_result text;
  v_qc_rework boolean;
  v_install_status text;
  v_install_verified boolean;
begin
  if new.production_stage = 'completed' and old.production_stage is distinct from 'completed' then
    select q.result, q.rework_required
      into v_qc_result, v_qc_rework
    from job_order_qc_checks q
    where q.job_order_id = new.job_order_id
    order by q.inspected_at desc
    limit 1;

    if coalesce(v_qc_result, '') <> 'pass' or coalesce(v_qc_rework, true) then
      raise exception 'Final QC must pass before Production can be completed';
    end if;

    select i.status, i.verified
      into v_install_status, v_install_verified
    from job_order_installations i
    where i.job_order_id = new.job_order_id
    order by i.updated_at desc nulls last, i.created_at desc
    limit 1;

    if coalesce(v_install_status, '') <> 'completed' or coalesce(v_install_verified, false) <> true then
      raise exception 'Installation must be completed and verified before Production can be completed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists production_completion_validation on job_orders;
create trigger production_completion_validation
before update of production_stage on job_orders
for each row execute function validate_production_completion();

-- Correct the original roll-ups so deleting the last detail row resets
-- actual cost to 0 instead of leaving a stale amount.
create or replace function recalc_job_order_material_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  update job_orders
  set actual_materials_cost = (
    select coalesce(sum(coalesce(actual_qty, 0) * coalesce(actual_unit_cost, 0)), 0)
    from job_order_materials
    where job_order_id = v_job_order_id
  )
  where job_order_id = v_job_order_id;
  return coalesce(new, old);
end;
$$;
create or replace function recalc_job_order_labor_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  update job_orders
  set actual_labor_cost = (
    select coalesce(sum(amount), 0)
    from job_order_labor_logs
    where job_order_id = v_job_order_id
  )
  where job_order_id = v_job_order_id;
  return coalesce(new, old);
end;
$$;

create or replace function recalc_job_order_logistics_actuals() returns trigger
language plpgsql security definer as $$
declare v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);
  update job_orders
  set actual_logistics_cost = (
    select coalesce(sum(coalesce(actual_cost, 0)), 0)
    from job_order_deliveries
    where job_order_id = v_job_order_id
  )
  where job_order_id = v_job_order_id;
  return coalesce(new, old);
end;
$$;
