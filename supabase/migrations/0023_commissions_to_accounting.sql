-- Commissions move from Admin to Accounting.
-- `job_commissions` already grants Accounting full access (see 0001_init.sql),
-- so per-commission rate/type edits already work. The one gap is the
-- singleton `commission_settings` (the default % used for new jobs), which
-- was Admin-only. Give Accounting the same write access; Admin keeps it too
-- for now so nothing breaks if it's referenced elsewhere.

drop policy if exists "accounting full access commission_settings" on commission_settings;
create policy "accounting full access commission_settings" on commission_settings for all
  using (current_user_role() = 'accounting')
  with check (current_user_role() = 'accounting');
