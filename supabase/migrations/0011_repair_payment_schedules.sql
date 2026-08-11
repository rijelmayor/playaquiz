-- Repair / backfill payment schedules for existing jobs.
-- Run after 0010_payment_milestones.sql.

-- Ensure every quoted job has a payment term and a schedule.
update jobs
set payment_terms = coalesce(payment_terms, '50_50')
where payment_terms is null;

-- Explicit backfill. This does not depend on the jobs trigger firing.
insert into payment_schedules (job_id, sequence_no, label, percentage, amount, due_stage)
select
  j.job_id,
  1,
  case when j.payment_terms = '50_50' then 'Down Payment'
       when j.payment_terms = 'full_on_completion' then 'Completion Payment'
       when j.payment_terms = 'full_on_installation' then 'Installation Payment'
       else 'Payment' end,
  case when j.payment_terms = '50_50' then 50 else 100 end,
  round((coalesce(j.quoted_value, j.final_value, 0) *
    case when j.payment_terms = '50_50' then 0.50 else 1 end)::numeric, 2),
  case when j.payment_terms = '50_50' then 'approval'
       when j.payment_terms = 'full_on_completion' then 'completion'
       when j.payment_terms = 'full_on_installation' then 'installation'
       else 'custom' end
from jobs j
where coalesce(j.quoted_value, j.final_value, 0) > 0
  and j.payment_terms in ('50_50', 'full_on_completion', 'full_on_installation')
  and not exists (
    select 1 from payment_schedules ps
    where ps.job_id = j.job_id and ps.sequence_no = 1
  );

insert into payment_schedules (job_id, sequence_no, label, percentage, amount, due_stage)
select
  j.job_id,
  2,
  'Completion Payment',
  50,
  round((coalesce(j.quoted_value, j.final_value, 0) * 0.50)::numeric, 2),
  'completion'
from jobs j
where coalesce(j.quoted_value, j.final_value, 0) > 0
  and j.payment_terms = '50_50'
  and not exists (
    select 1 from payment_schedules ps
    where ps.job_id = j.job_id and ps.sequence_no = 2
  );

-- Recalculate schedule statuses from existing received payments.
do $$
declare r record;
begin
  for r in select payment_schedule_id from payment_schedules loop
    perform sync_payment_schedule_status(r.payment_schedule_id);
  end loop;
end $$;
