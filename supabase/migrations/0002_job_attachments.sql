-- Advertising CRM: reference photo attachments
-- Adds a place to save transaction photos, site visit photos, and the
-- approved design photo for each job order. Run after 0001_init.sql.

create table job_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(job_id),
  job_order_id uuid references job_orders(job_order_id),
  uploaded_by uuid references users(user_id),
  category text not null check (category in ('transaction', 'site_visit', 'approved_design')),
  file_path text not null,
  caption text,
  created_at timestamptz default now(),
  -- an "approved_design" photo only makes sense once a job order exists
  constraint approved_design_needs_job_order
    check (category != 'approved_design' or job_order_id is not null)
);

create index job_attachments_job_id_idx on job_attachments(job_id);
create index job_attachments_job_order_id_idx on job_attachments(job_order_id);

alter table job_attachments enable row level security;

-- Sales: can attach/view photos only on jobs they booked (transaction, site visit).
create policy "sales inserts attachments on own jobs" on job_attachments for insert
  with check (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

create policy "sales reads attachments on own jobs" on job_attachments for select
  using (
    current_user_role() = 'sales'
    and job_id in (select job_id from jobs where booked_by = current_user_id())
  );

-- Fabricator: can attach/view photos (approved design) only on job orders assigned to them.
create policy "fabricator inserts attachments on own job orders" on job_attachments for insert
  with check (
    current_user_role() = 'fabricator'
    and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id())
  );

create policy "fabricator reads attachments on own job orders" on job_attachments for select
  using (
    current_user_role() = 'fabricator'
    and job_order_id in (select job_order_id from job_orders where fabricator_id = current_user_id())
  );

create policy "admin full access job_attachments" on job_attachments for all
  using (current_user_role() = 'admin');

create policy "accounting reads job_attachments" on job_attachments for select
  using (current_user_role() = 'accounting');

-- Storage bucket for the actual image files. Kept private — access is
-- controlled by the storage policies below, mirroring the table policies
-- above. Files are stored under `{job_id}/{category}/{filename}`.
insert into storage.buckets (id, name, public)
values ('job-attachments', 'job-attachments', false)
on conflict (id) do nothing;

create policy "sales uploads to own job folders"
on storage.objects for insert
with check (
  bucket_id = 'job-attachments'
  and current_user_role() = 'sales'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from jobs where booked_by = current_user_id()
  )
);

create policy "sales reads own job folders"
on storage.objects for select
using (
  bucket_id = 'job-attachments'
  and current_user_role() = 'sales'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from jobs where booked_by = current_user_id()
  )
);

create policy "fabricator uploads to assigned job folders"
on storage.objects for insert
with check (
  bucket_id = 'job-attachments'
  and current_user_role() = 'fabricator'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from job_orders where fabricator_id = current_user_id()
  )
);

create policy "fabricator reads assigned job folders"
on storage.objects for select
using (
  bucket_id = 'job-attachments'
  and current_user_role() = 'fabricator'
  and (storage.foldername(name))[1]::uuid in (
    select job_id from job_orders where fabricator_id = current_user_id()
  )
);

create policy "admin full access job-attachments bucket"
on storage.objects for all
using (bucket_id = 'job-attachments' and current_user_role() = 'admin');

create policy "accounting reads job-attachments bucket"
on storage.objects for select
using (bucket_id = 'job-attachments' and current_user_role() = 'accounting');
