-- TITANS WINDOWS Measurement to Production: storage for site photos.
-- Run once in Supabase (the same project as the quotation software):
--   SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again.
--
-- What it does:
--   * makes a photo bucket "m2p-photos" that can be READ by anyone who has a photo's exact link
--     (installation staff open the link with no login). Links contain a long random key, and the
--     bucket cannot be listed, so photos cannot be found without the link.
--   * lets the app UPLOAD pictures (JPEG/PNG/WebP, at most 5 MB each) into that bucket only.
--   * nobody can change, list or delete photos from the app; delete them in Supabase -> Storage.
-- Nothing in the quotation software's tables is touched.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('m2p-photos', 'm2p-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "m2p photos: app can upload" on storage.objects;
create policy "m2p photos: app can upload"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'm2p-photos'
    -- <job key>/<item id>/<photo id>.jpg
    and name ~ '^[a-z0-9]{16,}/[a-z0-9]+/[a-z0-9]+\.jpg$'
  );
