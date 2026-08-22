-- Storage required by the applicant request form.
-- Safe to re-run: buckets and policies are created idempotently.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('id-documents', 'id-documents', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('live-photos', 'live-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Applicants may manage only files under their own UUID folder.
create policy "request_storage_select_authenticated"
on storage.objects for select to authenticated
using (
  bucket_id in ('id-documents', 'live-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "request_storage_insert_authenticated"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('id-documents', 'live-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "request_storage_update_authenticated"
on storage.objects for update to authenticated
using (
  bucket_id in ('id-documents', 'live-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('id-documents', 'live-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "request_storage_delete_authenticated"
on storage.objects for delete to authenticated
using (
  bucket_id in ('id-documents', 'live-photos')
  and (storage.foldername(name))[1] = auth.uid()::text
);
