-- Advertising CRM: security fix + workflow automation
-- Run after 0001–0003. Two things this fixes:
--
-- 1. CRITICAL: `users` had RLS enabled nowhere — 0001 never turned it on.
--    With the anon/publishable key, that means anyone with your Supabase
--    URL could read every user's name/email/role, or worse, INSERT/UPDATE
--    rows in `users` directly (e.g. set their own role to 'admin').
--    This was a real hole, not a hypothetical one — fix first.
--
-- 2. Automation the spec describes as system behavior but that nothing in
--    0001–0003 actually implements: booked_by immutability, commission
--    pending→payable/void transitions, funds_release_status roll-up, and
--    job_orders reaching 'installed' flowing back to jobs.status. Right
--    now these fields only change if someone manually sets them.

-- ── 1. Lock down `users` ───────────────────────────────────────────────
alter table users enable row level security;

create policy "users read own row" on users for select
  using (auth_id = auth.uid());

create policy "admin full access users" on users for all
  using (current_user_role() = 'admin');

-- No self-service insert/update policy on purpose — account creation stays
-- a manual step in the Supabase dashboard (per README), so nobody can grant
-- themselves a role via the anon key.

-- ── 2. booked_by immutability ───────────────────────────────────────────
-- Spec: "booked_by is immutable once set... even by Admin... If genuinely
-- needed, require an audit-logged override." 0001 never enforced this —
-- admin's "full access" policy could silently overwrite it.

create table booked_by_overrides (
  override_id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(job_id),
  old_booked_by uuid references users(user_id),
  new_booked_by uuid references users(user_id),
  reason text not null,
  overridden_by uuid references users(user_id),
  created_at timestamptz default now()
);
alter table booked_by_overrides enable row level security;
create policy "admin full access booked_by_overrides" on booked_by_overrides for all
  using (current_user_role() = 'admin');

create or replace function prevent_booked_by_change() returns trigger as $$
begin
  if old.booked_by is distinct from new.booked_by
     and coalesce(current_setting('app.allow_booked_by_override', true), 'false') <> 'true' then
    raise exception 'booked_by is immutable — use override_booked_by() to change it';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger jobs_booked_by_immutable
before update on jobs
for each row execute function prevent_booked_by_change();

-- The only sanctioned way to change booked_by: logs why, then flips the
-- session flag so the trigger above lets the update through.
create or replace function override_booked_by(p_job_id uuid, p_new_agent uuid, p_reason text)
returns void as $$
declare
  v_old uuid;
begin
  if current_user_role() <> 'admin' then
    raise exception 'only admin can override booked_by';
  end if;
  select booked_by into v_old from jobs where job_id = p_job_id;
  insert into booked_by_overrides (job_id, old_booked_by, new_booked_by, reason, overridden_by)
    values (p_job_id, v_old, p_new_agent, p_reason, current_user_id());
  perform set_config('app.allow_booked_by_override', 'true', true);
  update jobs set booked_by = p_new_agent where job_id = p_job_id;
end;
$$ language plpgsql security definer;

-- ── 3. Commissions: auto-create, auto-calc, auto-transition ────────────
-- 0001 defined the job_commissions table but nothing ever inserted into
-- it, so the "commission pending" figure sales sees was always going to
-- read ₱0 forever. Every job now gets a commission row at intake, at a
-- default rate — override split_pct/commission_rate per row for
-- multi-agent bookings.

alter table job_commissions add column commission_rate numeric(5,2) not null default 10.00;

create policy "admin full access job_commissions" on job_commissions for all
  using (current_user_role() = 'admin');

create or replace function jobs_after_insert_create_commission() returns trigger as $$
begin
  insert into job_commissions (job_id, agent_id, split_pct, commission_rate, status)
  values (new.job_id, new.booked_by, 100.00, 10.00, 'pending');
  return new;
end;
$$ language plpgsql security definer;

create trigger jobs_after_insert_commission
after insert on jobs
for each row execute function jobs_after_insert_create_commission();

-- amount = final_value * commission_rate% * split_pct%, recalculated
-- whenever final_value is set/changed. Paid/void rows are left alone.
create or replace function calc_commission_amount(p_job_id uuid) returns void as $$
begin
  update job_commissions jc
  set amount = round(
    coalesce((select final_value from jobs where job_id = p_job_id), 0)
    * jc.commission_rate / 100 * jc.split_pct / 100, 2)
  where jc.job_id = p_job_id and jc.status not in ('paid', 'void');
end;
$$ language plpgsql security definer;

create or replace function jobs_after_update_recalc_amount() returns trigger as $$
begin
  perform calc_commission_amount(new.job_id);
  return new;
end;
$$ language plpgsql;

create trigger jobs_after_update_commission_amount
after update of final_value on jobs
for each row execute function jobs_after_update_recalc_amount();

-- pending -> payable once the balance payment is received AND the job has
-- reached installed/paid/closed. cancelled jobs void every unpaid commission.
create or replace function sync_job_commissions(p_job_id uuid) returns void as $$
declare
  v_job jobs%rowtype;
  v_balance_received boolean;
begin
  select * into v_job from jobs where job_id = p_job_id;
  if v_job is null then return; end if;

  if v_job.cancelled then
    update job_commissions set status = 'void'
    where job_id = p_job_id and status not in ('paid', 'void');
    return;
  end if;

  select exists(
    select 1 from payments
    where job_id = p_job_id and type = 'balance' and status = 'received'
  ) into v_balance_received;

  if v_balance_received and v_job.status in ('installed', 'paid', 'closed') then
    update job_commissions set status = 'payable'
    where job_id = p_job_id and status = 'pending';
  end if;
end;
$$ language plpgsql security definer;

create or replace function jobs_sync_commissions_trigger() returns trigger as $$
begin
  perform sync_job_commissions(new.job_id);
  return new;
end;
$$ language plpgsql;

create trigger jobs_after_update_sync_commissions
after update of status, cancelled on jobs
for each row execute function jobs_sync_commissions_trigger();

create or replace function payments_sync_commissions_trigger() returns trigger as $$
begin
  perform sync_job_commissions(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger payments_after_change_sync_commissions
after insert or update or delete on payments
for each row execute function payments_sync_commissions_trigger();

-- ── 4. funds_release_status roll-up ─────────────────────────────────────
-- FundReleaseQueue logs rows into fund_releases but nothing ever updated
-- job_orders.funds_release_status, so it would have shown "not_released"
-- forever regardless of what accounting released.
create or replace function recalc_funds_release_status() returns trigger as $$
declare
  v_job_order_id uuid;
  v_job_order job_orders%rowtype;
  v_total_released numeric(12,2);
  v_total_estimate numeric(12,2);
begin
  if TG_OP = 'DELETE' then
    v_job_order_id := old.job_order_id;
  else
    v_job_order_id := new.job_order_id;
  end if;

  select * into v_job_order from job_orders where job_order_id = v_job_order_id;
  if v_job_order is null or v_job_order.funds_release_status = 'reconciled' then
    -- don't clobber a manually reconciled status
    return null;
  end if;

  select coalesce(sum(amount), 0) into v_total_released
  from fund_releases where job_order_id = v_job_order_id;

  v_total_estimate := coalesce(v_job_order.estimated_materials_cost, 0)
    + coalesce(v_job_order.estimated_labor_cost, 0)
    + coalesce(v_job_order.estimated_logistics_cost, 0);

  update job_orders set funds_release_status = case
    when v_total_released <= 0 then 'not_released'
    when v_total_estimate > 0 and v_total_released >= v_total_estimate then 'fully_released'
    else 'partially_released'
  end
  where job_order_id = v_job_order_id;

  return null;
end;
$$ language plpgsql security definer;

create trigger fund_releases_recalc
after insert or update or delete on fund_releases
for each row execute function recalc_funds_release_status();

-- ── 5. job_orders reaching 'installed' flows back to the parent job ────
-- Production's "Advance" button only ever touched job_orders.status.
-- jobs.status never followed, so it could never reach 'installed', which
-- meant the commission-payable check above could never fire either.
create or replace function job_orders_after_update_sync_job_status() returns trigger as $$
begin
  if new.status = 'installed' and old.status <> 'installed' then
    update jobs set status = 'installed'
    where job_id = new.job_id and status = 'in_production';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger job_orders_sync_job_status
after update of status on job_orders
for each row execute function job_orders_after_update_sync_job_status();
