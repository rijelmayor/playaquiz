-- Sales image management: allow Sales to replace/delete their own
-- transaction, site-visit and sample mock-up attachments.
-- No new table/column is required.

drop policy if exists "sales deletes attachments on own jobs" on job_attachments;
create policy "sales deletes attachments on own jobs"
on job_attachments for delete
using (
  current_user_role() = 'sales'
  and job_id in (select job_id from jobs where booked_by = current_user_id())
);

drop policy if exists "sales deletes own job attachment files" on storage.objects;
create policy "sales deletes own job attachment files"
on storage.objects for delete
using (
  bucket_id = 'job-attachments'
  and current_user_role() = 'sales'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from jobs where booked_by = current_user_id()
  )
);
