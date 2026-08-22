-- Storage for screenshots attached to processing details.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'processing-screenshots',
  'processing-screenshots',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Agents may upload and manage screenshots only in their own UUID folder.
drop policy if exists "processing_screenshots_select_authenticated" on storage.objects;
create policy "processing_screenshots_select_authenticated"
on storage.objects for select to authenticated
using (
  bucket_id = 'processing-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "processing_screenshots_insert_authenticated" on storage.objects;
create policy "processing_screenshots_insert_authenticated"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'processing-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "processing_screenshots_update_authenticated" on storage.objects;
create policy "processing_screenshots_update_authenticated"
on storage.objects for update to authenticated
using (
  bucket_id = 'processing-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'processing-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "processing_screenshots_delete_authenticated" on storage.objects;
create policy "processing_screenshots_delete_authenticated"
on storage.objects for delete to authenticated
using (
  bucket_id = 'processing-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);
