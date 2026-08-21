-- DW AdSign CRM V14.2
-- Commission posting + Accounting release workflow.
--
-- Rules:
-- 1. A commission is automatically POSTED as `pending` only when the job is
--    fully paid and operationally completed.
-- 2. Sales sees each posted commission individually as PENDING FOR RELEASE.
--    Sales does not see an accumulated pending total.
-- 3. Accounting sees every pending commission by job and may release the
--    calculated amount or an adjusted amount.
-- 4. A release is atomic and auditable. The calculated amount is preserved;
--    an adjusted release is stored separately.
-- 5. Release changes job_commissions from pending to paid. The Sales item
--    therefore disappears automatically from the pending list.

create table if not exists commission_releases (
  release_id uuid primary key default gen_random_uuid(),
  commission_id uuid not null unique references job_commissions(commission_id) on delete restrict,
  job_id uuid not null references jobs(job_id) on delete restrict,
  agent_id uuid not null references users(user_id) on delete restrict,
  calculated_amount numeric(12,2) not null default 0,
  released_amount numeric(12,2) not null,
  adjustment_amount numeric(12,2) not null default 0,
  adjustment_reason text,
  released_by uuid not null references users(user_id) on delete restrict,
  released_at timestamptz not null default now()
);

create index if not exists commission_releases_job_id_idx on commission_releases(job_id);
create index if not exists commission_releases_agent_id_idx on commission_releases(agent_id);
create index if not exists commission_releases_released_at_idx on commission_releases(released_at desc);

alter table commission_releases enable row level security;

drop policy if exists "accounting full access commission_releases" on commission_releases;
create policy "accounting full access commission_releases" on commission_releases
for all using (current_user_role() = 'accounting')
with check (current_user_role() = 'accounting');

drop policy if exists "admin full access commission_releases" on commission_releases;
create policy "admin full access commission_releases" on commission_releases
for all using (current_user_role() = 'admin')
with check (current_user_role() = 'admin');

-- Normalize the old intermediate state. `payable` is now represented as
-- `pending` because Accounting's Release button is the only payout action.
update job_commissions
set status = 'pending'
where status = 'payable';

-- Rebuild the synchronization rule so completion posts a commission as
-- pending-for-release rather than payable.
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
    set status = 'pending'
    where job_id = p_job_id and status = 'pending';
  end if;
end;
$$;

-- Existing jobs can become operationally complete through job_orders rather
-- than the parent jobs row, so keep the commission state synchronized there.
drop trigger if exists job_orders_after_change_sync_commissions on job_orders;
create trigger job_orders_after_change_sync_commissions
after insert or update or delete on job_orders
for each row execute function sync_job_commissions(coalesce(new.job_id, old.job_id));

-- Release RPC: one atomic operation for Accounting. It preserves the
-- calculated commission and records any adjustment instead of overwriting it.
drop function if exists release_job_commission(uuid, numeric, text, uuid);
create or replace function release_job_commission(
  p_commission_id uuid,
  p_released_amount numeric default null,
  p_adjustment_reason text default null,
  p_released_by uuid default null
)
returns commission_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commission job_commissions%rowtype;
  v_release commission_releases%rowtype;
  v_amount numeric(12,2);
  v_adjustment numeric(12,2);
  v_user uuid;
begin
  if current_user_role() <> 'accounting' then
    raise exception 'Only Accounting can release commissions';
  end if;

  v_user := coalesce(p_released_by, current_user_id());

  select * into v_commission
  from job_commissions
  where commission_id = p_commission_id
  for update;

  if not found then
    raise exception 'Commission record not found';
  end if;

  if v_commission.status <> 'pending' then
    raise exception 'Commission is not pending for release';
  end if;

  v_amount := round(coalesce(p_released_amount, v_commission.amount, 0), 2);

  if v_amount < 0 then
    raise exception 'Release amount cannot be negative';
  end if;

  v_adjustment := round(v_amount - coalesce(v_commission.amount, 0), 2);

  if v_adjustment <> 0 and (p_adjustment_reason is null or length(trim(p_adjustment_reason)) < 3) then
    raise exception 'An adjustment reason is required when the release amount differs from the calculated commission';
  end if;

  insert into commission_releases (
    commission_id,
    job_id,
    agent_id,
    calculated_amount,
    released_amount,
    adjustment_amount,
    adjustment_reason,
    released_by
  ) values (
    v_commission.commission_id,
    v_commission.job_id,
    v_commission.agent_id,
    coalesce(v_commission.amount, 0),
    v_amount,
    v_adjustment,
    nullif(trim(p_adjustment_reason), ''),
    v_user
  )
  returning * into v_release;

  update job_commissions
  set status = 'paid',
      paid_date = now()
  where commission_id = v_commission.commission_id;

  return v_release;
end;
$$;

revoke all on function release_job_commission(uuid, numeric, text, uuid) from public;
grant execute on function release_job_commission(uuid, numeric, text, uuid) to authenticated;

-- Commission release records are part of the audit trail.
drop trigger if exists audit_commission_releases on commission_releases;
create trigger audit_commission_releases
after insert or update or delete on commission_releases
for each row execute function write_audit_log('release_id');

-- Recalculate open commissions and post any already-completed, fully-paid jobs.
do $$
declare r record;
begin
  for r in
    select distinct jc.job_id
    from job_commissions jc
    where jc.status not in ('paid','void')
  loop
    perform sync_job_commissions(r.job_id);
  end loop;
end;
$$;

-- Replace the older finalizer so a financial close never changes a posted
-- commission into the obsolete `payable` state.
create or replace function finalize_accounting_closure()
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

  update jobs
  set status = 'closed', updated_at = now()
  where job_id = new.job_id
    and status <> 'cancelled';

  if v_received + 0.01 >= v_final then
    update payment_schedules
    set status = 'paid', updated_at = now()
    where job_id = new.job_id
      and status <> 'paid';
  end if;

  perform calc_commission_amount(new.job_id);

  update job_commissions
  set status = 'pending'
  where job_id = new.job_id
    and status = 'pending';

  return new;
end;
$$;

-- Remove the legacy trigger name introduced by 0025 and ensure only one
-- validation/finalization pair remains active.
drop trigger if exists accounting_job_closure_validation on accounting_job_closures;
drop trigger if exists accounting_closure_validate on accounting_job_closures;
drop trigger if exists accounting_closure_finalize on accounting_job_closures;

create trigger accounting_closure_validate
before insert or update on accounting_job_closures
for each row execute function validate_accounting_job_closure();

create trigger accounting_closure_finalize
after insert or update on accounting_job_closures
for each row execute function finalize_accounting_closure();

-- PostgreSQL trigger arguments are literal values, not NEW/OLD expressions.
-- Use small trigger wrappers so the workflow remains valid on a fresh migration.
create or replace function jobs_after_change_sync_commissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_job_commissions(new.job_id);
  return new;
end;
$$;

create or replace function payments_after_change_sync_commissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_job_commissions(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end;
$$;

create or replace function job_orders_after_change_sync_commissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_job_commissions(coalesce(new.job_id, old.job_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists jobs_after_update_sync_commissions on jobs;
create trigger jobs_after_update_sync_commissions
after update of status, cancelled, final_value, quoted_value on jobs
for each row execute function jobs_after_change_sync_commissions();

drop trigger if exists payments_after_change_sync_commissions on payments;
create trigger payments_after_change_sync_commissions
after insert or update or delete on payments
for each row execute function payments_after_change_sync_commissions();

drop trigger if exists job_orders_after_change_sync_commissions on job_orders;
create trigger job_orders_after_change_sync_commissions
after insert or update or delete on job_orders
for each row execute function job_orders_after_change_sync_commissions();
