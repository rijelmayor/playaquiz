-- Material/expense actual preservation
-- Production fund releases are actual job costs. Admin material detail rows
-- are supporting actual records. Do not reset an existing actual material
-- cost to zero merely because no detail rows exist yet.

create or replace function recalc_job_order_material_actuals() returns trigger
language plpgsql security definer as $$
declare
  v_job_order_id uuid;
begin
  v_job_order_id := coalesce(new.job_order_id, old.job_order_id);
  perform set_config('app.production_cost_rollup', 'true', true);

  if exists (
    select 1 from job_order_materials
    where job_order_id = v_job_order_id
  ) then
    update job_orders
    set actual_materials_cost = (
      select coalesce(sum(coalesce(actual_qty, 0) * coalesce(actual_unit_cost, 0)), 0)
      from job_order_materials
      where job_order_id = v_job_order_id
    )
    where job_order_id = v_job_order_id;
  end if;

  return coalesce(new, old);
end;
$$;
