-- Pipeline accuracy + explicit site-visit tracking
--
-- A site visit is considered completed ONLY when a user explicitly records
-- the visit through the Site Visit Editor. Attachments and pipeline status
-- are not treated as proof of a completed visit.

alter table jobs
  add column if not exists site_visit_status text not null default 'not_required'
  check (site_visit_status in ('not_required', 'not_recorded', 'scheduled', 'completed', 'cancelled', 'rescheduled'));

alter table jobs
  add column if not exists site_visit_date timestamptz;

alter table jobs
  add column if not exists site_visit_by uuid references users(user_id);

alter table jobs
  add column if not exists site_visit_note text;

-- If a site visit is required but no explicit visit record exists, keep it
-- unrecorded. Do NOT infer a visit from the job status or attachments.
update jobs
set site_visit_status = 'not_recorded'
where coalesce(needs_site_visit, false) = true
  and site_visit_status in ('not_required', 'scheduled')
  and site_visit_date is null
  and site_visit_by is null;

-- Jobs that do not need a site visit remain not required.
update jobs
set site_visit_status = 'not_required'
where coalesce(needs_site_visit, false) = false;
