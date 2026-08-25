-- Client photos and dedicated storage bucket.

alter table public.clients
  add column if not exists avatar_url text check (avatar_url is null or avatar_url ~* '^https?://');

comment on column public.clients.avatar_url is 'Public logo or contact photo stored in the client-avatars bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-avatars',
  'client-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_avatars_select_member on storage.objects;
create policy client_avatars_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-avatars'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists client_avatars_insert_member on storage.objects;
create policy client_avatars_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'client-avatars'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists client_avatars_update_member on storage.objects;
create policy client_avatars_update_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'client-avatars'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'client-avatars'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

drop policy if exists client_avatars_delete_member on storage.objects;
create policy client_avatars_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'client-avatars'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );
