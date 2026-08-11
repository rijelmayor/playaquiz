-- Advertising CRM: missing RLS policies
-- clients, payments, quotations, and designs had row level security turned
-- on in 0001_init.sql but no policies were ever defined for them, which
-- means every role (including admin) was silently locked out of reading
-- or writing them. This adds the missing policies, mirroring the access
-- pattern already used for jobs/job_orders/job_commissions.

-- ── clients ─────────────────────────────────────────────────────────────
-- Sales creates brand-new client rows before a job exists to tie them to,
-- so the insert policy can't check ownership yet — only that they're sales.
-- Read access afterwards is scoped to clients tied to their own jobs.
create policy "sales inserts clients" on clients for insert
  with check (current_user_role() = 'sales');

create policy "sales reads own clients" on clients for select
  using (
    current_user_role() = 'sales'
    and client_id in (select client_id from jobs where booked_by = current_user_id())
  );

create policy "fabricator reads clients on assigned job orders" on clients for select
  using (
    current_user_role() = 'fabricator'
    and client_id in (
      select j.client_id from jobs j
      join job_orders jo on jo.job_id = j.job_id
      where jo.fabricator_id = current_user_id()
    )
  );

create policy "admin full access clients" on clients for all
  using (current_user_role() = 'admin');

create policy "accounting reads clients" on clients for select
  using (current_user_role() = 'accounting');

-- ── payments ────────────────────────────────────────────────────────────
create policy "sales reads own job payments" on payments for select
  using (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

create policy "admin full access payments" on payments for all
  using (current_user_role() = 'admin');

create policy "accounting full access payments" on payments for all
  using (current_user_role() = 'accounting');

-- ── quotations ──────────────────────────────────────────────────────────
create policy "sales reads own job quotations" on quotations for select
  using (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

create policy "admin full access quotations" on quotations for all
  using (current_user_role() = 'admin');

create policy "accounting reads quotations" on quotations for select
  using (current_user_role() = 'accounting');

-- ── designs ─────────────────────────────────────────────────────────────
create policy "sales reads own job designs" on designs for select
  using (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

create policy "fabricator reads designs on assigned job orders" on designs for select
  using (
    current_user_role() = 'fabricator'
    and job_id in (
      select job_id from job_orders where fabricator_id = current_user_id()
    )
  );

create policy "admin full access designs" on designs for all
  using (current_user_role() = 'admin');

create policy "accounting reads designs" on designs for select
  using (current_user_role() = 'accounting');
