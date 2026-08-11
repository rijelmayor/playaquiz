-- Advertising CRM: sales portal editing support
--
-- Fixes a real bug: NewClientForm did `insert(...).select().single()` on
-- `clients`. With RLS, an INSERT ... RETURNING also has to satisfy the
-- SELECT policy on the row being returned — and "sales reads own clients"
-- only allows a client whose client_id already appears on one of the
-- agent's jobs. On first insert, no job exists yet, so that check always
-- failed, `.select()` came back empty, the code bailed out before ever
-- inserting the job row, and the client silently never showed up anywhere.
-- Fixed on the app side (client_id generated client-side, no RETURNING
-- needed on the clients insert) — this migration adds what else was
-- missing for a full edit flow: update policies (sales could insert and
-- read their own clients/jobs, but never update them), a job name field,
-- a notes/chat-transcript field, and a 'reference' photo category for
-- "this is the look the client wants" images.
--
-- Every statement here is safe to re-run.

alter table jobs add column if not exists job_name text;
alter table jobs add column if not exists notes text;

drop policy if exists "sales updates own clients" on clients;
create policy "sales updates own clients" on clients for update
  using (
    current_user_role() = 'sales'
    and client_id in (select client_id from jobs where booked_by = current_user_id())
  );

-- NOTE: this allows sales to update any column on a job they booked, not
-- just job_name/notes/needs_site_visit — Postgres RLS policies aren't
-- column-scoped. booked_by itself stays protected by the immutability
-- trigger from 0004 regardless. If you need to lock sales out of editing
-- status/quoted_value/final_value specifically, that needs column-level
-- GRANT/REVOKE or a trigger that rejects those columns changing when the
-- session role is 'sales' — flag it if you want that added.
drop policy if exists "sales updates own jobs" on jobs;
create policy "sales updates own jobs" on jobs for update
  using (current_user_role() = 'sales' and booked_by = current_user_id());

-- Widen job_attachments to allow a 'reference' category (the "this is the
-- look/sample the client wants" photo) alongside the existing three.
alter table job_attachments drop constraint if exists job_attachments_category_check;
alter table job_attachments add constraint job_attachments_category_check
  check (category in ('transaction', 'site_visit', 'approved_design', 'reference'));
