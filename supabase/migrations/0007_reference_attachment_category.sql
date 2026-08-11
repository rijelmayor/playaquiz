-- Allow desired sample/reference photos in job_attachments.
-- Fixes: new row for relation "job_attachments" violates
-- check constraint "job_attachments_category_check".

alter table job_attachments
  drop constraint if exists job_attachments_category_check;

alter table job_attachments
  add constraint job_attachments_category_check
  check (category in ('transaction', 'site_visit', 'approved_design', 'reference'));
