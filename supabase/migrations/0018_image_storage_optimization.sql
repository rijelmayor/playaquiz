-- Image storage optimization for the Free-tier CRM.
-- Run after 0017_production_accounting_close_controls.sql.
--
-- The application compresses images client-side before upload. This bucket
-- limit is a second line of defense so an unoptimized client cannot upload
-- oversized files into the CRM.
--
-- Approved-design replacement is handled in the application: the new file is
-- uploaded under a unique path and committed before older design files/rows
-- are cleaned up. This avoids overwriting the only valid design on failure.

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
where id = 'job-attachments';

-- Keep lookup fast for replacement of the current approved design.
create index if not exists job_attachments_approved_design_current_idx
  on job_attachments(job_id, job_order_id, category, created_at desc)
  where category = 'approved_design';
