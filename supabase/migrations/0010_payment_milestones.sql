-- Payment milestone model
-- Supports 50/50, full on completion, full on installation, and custom schedules.

alter table jobs drop constraint if exists jobs_payment_terms_check;
alter table jobs
  add constraint jobs_payment_terms_check
  check (payment_terms in ('50_50', 'full_on_completion', 'full_on_installation', 'custom'));

alter table quotations drop constraint if exists quotations_payment_terms_check;
alter table quotations
  add constraint quotations_payment_terms_check
  check (payment_terms in ('50_50', 'full_on_completion', 'full_on_installation', 'custom'));

create table if not exists payment_schedules (
  payment_schedule_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(job_id) on delete cascade,
  sequence_no integer not null,
  label text not null,
  percentage numeric(5,2) not null check (percentage > 0 and percentage <= 100),
  amount numeric(12,2) not null check (amount >= 0),
  due_stage text not null check (due_stage in ('approval', 'production', 'completion', 'installation', 'custom')),
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, sequence_no)
);

alter table payments
  add column if not exists payment_schedule_id uuid references payment_schedules(payment_schedule_id) on delete set null,
  add column if not exists reference_no text,
  add column if not exists note text;

alter table payment_schedules enable row level security;

create policy "admin full access payment_schedules" on payment_schedules for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

create policy "accounting reads payment_schedules" on payment_schedules for select
  using (current_user_role() = 'accounting');

create policy "sales reads own payment_schedules" on payment_schedules for select
  using (current_user_role() = 'sales' and job_id in (
    select job_id from jobs where booked_by = current_user_id()
  ));

create policy "sales inserts own payment_schedules" on payment_schedules for insert
  with check (current_user_role() = 'sales' and job_id in (
    select job_id from jobs where booked_by = current_user_id()
  ));

create policy "sales deletes pending own payment_schedules" on payment_schedules for delete
  using (current_user_role() = 'sales' and status = 'pending' and job_id in (
    select job_id from jobs where booked_by = current_user_id()
  ));

create or replace function assign_payment_schedule_to_payment()
returns trigger as $$
begin
  if new.payment_schedule_id is not null then
    return new;
  end if;

  if new.type = 'down_payment' then
    select payment_schedule_id into new.payment_schedule_id
    from payment_schedules
    where job_id = new.job_id and due_stage = 'approval' and status <> 'paid'
    order by sequence_no
    limit 1;
  elsif new.type = 'balance' then
    select payment_schedule_id into new.payment_schedule_id
    from payment_schedules
    where job_id = new.job_id and status <> 'paid'
    order by sequence_no
    limit 1;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists payments_assign_schedule on payments;
create trigger payments_assign_schedule
before insert on payments
for each row execute function assign_payment_schedule_to_payment();

create or replace function sync_payment_schedule_status(p_schedule_id uuid)
returns void as $$
declare
  v_due numeric(12,2);
  v_received numeric(12,2);
begin
  select amount into v_due from payment_schedules where payment_schedule_id = p_schedule_id;
  if v_due is null then return; end if;

  select coalesce(sum(amount), 0) into v_received
  from payments
  where payment_schedule_id = p_schedule_id and status = 'received';

  update payment_schedules
  set status = case
    when v_received >= v_due then 'paid'
    when v_received > 0 then 'partial'
    else 'pending'
  end,
  updated_at = now()
  where payment_schedule_id = p_schedule_id;
end;
$$ language plpgsql security definer;

create or replace function payments_after_change_sync_schedule()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.payment_schedule_id is not null then
      perform sync_payment_schedule_status(old.payment_schedule_id);
    end if;
    return old;
  end if;

  if old.payment_schedule_id is not null and old.payment_schedule_id is distinct from new.payment_schedule_id then
    perform sync_payment_schedule_status(old.payment_schedule_id);
  end if;
  if new.payment_schedule_id is not null then
    perform sync_payment_schedule_status(new.payment_schedule_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

 drop trigger if exists payments_after_change_sync_schedule on payments;
 create trigger payments_after_change_sync_schedule
 after insert or update or delete on payments
 for each row execute function payments_after_change_sync_schedule();

-- Rebuild only unpaid schedules when the job's terms or quoted amount changes.
-- Paid/partial schedules are preserved so payment history is never erased.
create or replace function sync_job_payment_schedule()
returns trigger as $$
declare
  v_total numeric(12,2);
begin
  v_total := coalesce(new.quoted_value, new.final_value, 0);

  if v_total <= 0 then
    return new;
  end if;

  delete from payment_schedules ps
  where ps.job_id = new.job_id
    and ps.status = 'pending'
    and not exists (
      select 1 from payments p
      where p.payment_schedule_id = ps.payment_schedule_id and p.status = 'received'
    );

  if new.payment_terms = '50_50' then
    insert into payment_schedules (job_id, sequence_no, label, percentage, amount, due_stage)
    values
      (new.job_id, 1, 'Down Payment', 50, round(v_total * 0.50, 2), 'approval'),
      (new.job_id, 2, 'Completion Payment', 50, round(v_total * 0.50, 2), 'completion')
    on conflict (job_id, sequence_no) do nothing;
  elsif new.payment_terms = 'full_on_completion' then
    insert into payment_schedules (job_id, sequence_no, label, percentage, amount, due_stage)
    values (new.job_id, 1, 'Completion Payment', 100, round(v_total, 2), 'completion')
    on conflict (job_id, sequence_no) do nothing;
  elsif new.payment_terms = 'full_on_installation' then
    insert into payment_schedules (job_id, sequence_no, label, percentage, amount, due_stage)
    values (new.job_id, 1, 'Installation Payment', 100, round(v_total, 2), 'installation')
    on conflict (job_id, sequence_no) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists jobs_sync_payment_schedule on jobs;
create trigger jobs_sync_payment_schedule
after insert or update of payment_terms, quoted_value, final_value on jobs
for each row execute function sync_job_payment_schedule();

-- Seed schedules for existing jobs by firing the trigger for existing quoted/final values.
update jobs set quoted_value = quoted_value where quoted_value is not null;
update jobs set final_value = final_value where quoted_value is null and final_value is not null;

-- Link existing received payments to the generated standard milestones.
update payments p
set payment_schedule_id = ps.payment_schedule_id
from payment_schedules ps
where p.job_id = ps.job_id
  and p.payment_schedule_id is null
  and p.status = 'received'
  and (
    (p.type = 'down_payment' and ps.sequence_no = 1 and ps.due_stage = 'approval')
    or
    (p.type = 'balance' and ps.sequence_no = (select max(ps2.sequence_no) from payment_schedules ps2 where ps2.job_id = p.job_id))
  );

-- Refresh statuses after linking historical payments.
do $$
declare r record;
begin
  for r in select payment_schedule_id from payment_schedules loop
    perform sync_payment_schedule_status(r.payment_schedule_id);
  end loop;
end $$;

-- Prevent schedule percentages from exceeding 100% for a job.
create or replace function validate_payment_schedule_total()
returns trigger as $$
declare
  v_total numeric;
begin
  select coalesce(sum(percentage), 0) into v_total
  from payment_schedules
  where job_id = new.job_id
    and payment_schedule_id <> coalesce(new.payment_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_total + new.percentage > 100.01 then
    raise exception 'Payment schedule for this job cannot exceed 100%%';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists validate_payment_schedule_total on payment_schedules;
create trigger validate_payment_schedule_total
before insert or update of percentage, job_id on payment_schedules
for each row execute function validate_payment_schedule_total();
