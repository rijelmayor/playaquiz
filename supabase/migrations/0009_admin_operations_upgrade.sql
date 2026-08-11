-- Admin operations upgrade
-- Payment terms are per job so Sales/Admin can distinguish the standard
-- 50/50 arrangement from full payment due on installation.
alter table jobs
  add column if not exists payment_terms text not null default '50_50'
  check (payment_terms in ('50_50', 'full_on_installation'));

-- Store the agreed payment term on each quotation as well, so a quotation
-- remains a self-contained record even if the job's current preference changes.
alter table quotations
  add column if not exists payment_terms text not null default '50_50'
  check (payment_terms in ('50_50', 'full_on_installation'));

-- Existing quotations inherit the job's current payment term where possible.
update quotations q
set payment_terms = coalesce(j.payment_terms, '50_50')
from jobs j
where j.job_id = q.job_id;
