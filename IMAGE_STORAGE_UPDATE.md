# v12.1 Image Storage Safety Update

- Keeps the existing Supabase `0018_image_storage_optimization.sql` migration unchanged in behavior.
- Image uploads are resized to max 2200px and compressed to WebP <= 1.5 MB before Storage.
- Source images over 10 MB are rejected.
- A maximum of 10 images can be selected per upload action.
- Double-click/repeated-submit upload locking is preserved.
- Approved Design replacement now uploads to a unique path first, creates the new DB record, then cleans up old records/files.
- If the new upload or DB insert fails, the existing approved design remains untouched.
- Production no longer exposes an Approved Design upload control; Admin remains the source of truth and Production only views the approved design.
- Production/QC/Installation evidence remains historical and is not automatically overwritten.
