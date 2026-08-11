-- Repair migration for installations that already ran the original 0012.
-- The old 0012 incorrectly inferred "completed" from site-visit attachments.
-- Those inferred rows have no explicit visit date/person because the old
-- migration never populated them. Reset only those inferred rows so that no
-- existing customer is falsely shown as visited.
--
-- Explicitly recorded visits are preserved because the SiteVisitEditor always
-- stores both site_visit_date and site_visit_by when status is completed.

-- 0012 in an already-deployed database may still have the old check constraint.
-- Replace it so the new "not_recorded" state is accepted.
alter table jobs drop constraint if exists jobs_site_visit_status_check;
alter table jobs add constraint jobs_site_visit_status_check
  check (site_visit_status in ('not_required', 'not_recorded', 'scheduled', 'completed', 'cancelled', 'rescheduled'));

update jobs
set site_visit_status = case
  when coalesce(needs_site_visit, false) then 'not_recorded'
  else 'not_required'
end,
site_visit_date = null,
site_visit_by = null
where site_visit_status = 'completed'
  and site_visit_date is null
  and site_visit_by is null;

-- Any job that does not require a visit should never carry a visit status.
update jobs
set site_visit_status = 'not_required',
    site_visit_date = null,
    site_visit_by = null,
    site_visit_note = null
where coalesce(needs_site_visit, false) = false;
