-- Quotation payment options: bank transfer details + GCash number/QR code,
-- printed at the bottom of the quotation PDF. Admin-editable, same singleton
-- pattern as the rest of quotation_settings.

alter table quotation_settings add column if not exists bank_name text;
alter table quotation_settings add column if not exists bank_account_name text;
alter table quotation_settings add column if not exists bank_account_number text;
alter table quotation_settings add column if not exists gcash_number text;
alter table quotation_settings add column if not exists gcash_account_name text;
-- Public URL of the uploaded GCash QR code image (see bucket below).
alter table quotation_settings add column if not exists gcash_qr_url text;

-- Storage bucket for the QR code image. Public + read-only-by-everyone
-- because the PDF is generated both in the browser (Sales/Admin) and on
-- the server (email route) and just needs to `fetch()` the image bytes —
-- no signed URL plumbing required for a non-sensitive payment QR graphic.
insert into storage.buckets (id, name, public)
values ('quotation-assets', 'quotation-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "admin manages quotation-assets bucket" on storage.objects;
create policy "admin manages quotation-assets bucket"
on storage.objects for all
using (bucket_id = 'quotation-assets' and current_user_role() = 'admin')
with check (bucket_id = 'quotation-assets' and current_user_role() = 'admin');

drop policy if exists "everyone reads quotation-assets bucket" on storage.objects;
create policy "everyone reads quotation-assets bucket"
on storage.objects for select
using (bucket_id = 'quotation-assets');
