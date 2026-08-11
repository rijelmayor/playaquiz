-- Fixes the bug where site-visit updates recorded by Sales could become
-- invisible in Admin.
--
-- Root cause: the UI gated the entire Site Visit block (in both the Sales
-- editor and the Admin portal) behind the boolean `needs_site_visit`. That
-- flag was only ever set once, at job creation. If a job was created with
-- `needs_site_visit = false` (or the flag drifted out of sync for any other
-- reason), Sales could never open the Site Visit Editor again to record a
-- visit, and Admin would never render the Site Visit card even if a status
-- update existed on the row.
--
-- Fix: `site_visit_status` (which already has a proper 'not_required' state)
-- becomes the single source of truth. `needs_site_visit` is kept only for
-- backward compatibility with older queries/reports and is now derived
-- automatically from `site_visit_status` via trigger, instead of being
-- hand-maintained by the UI.

-- 1. Backfill: make the boolean agree with the status that already exists.
update jobs
set needs_site_visit = (site_visit_status <> 'not_required')
where needs_site_visit <> (site_visit_status <> 'not_required');

-- 2. Keep them in sync going forward, no matter which layer writes to the row.
create or replace function sync_needs_site_visit()
returns trigger
language plpgsql
as $$
begin
  new.needs_site_visit := (new.site_visit_status <> 'not_required');
  return new;
end;
$$;

drop trigger if exists trg_sync_needs_site_visit on jobs;
create trigger trg_sync_needs_site_visit
  before insert or update of site_visit_status on jobs
  for each row
  execute function sync_needs_site_visit();

-- 3. Belt-and-suspenders: the Admin overview also needs to distinguish jobs
--    where a visit is required but nobody has recorded it. Any job that
--    reports 'not_required' but somehow still carries a date/recorder from
--    a prior bad state is cleared, so the badge in Admin reads correctly.
update jobs
set site_visit_date = null,
    site_visit_by = null
where site_visit_status = 'not_required'
  and (site_visit_date is not null or site_visit_by is not null);
