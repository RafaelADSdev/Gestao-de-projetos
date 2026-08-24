-- Team access management, six-digit PIN metadata and self-service avatars.

begin;

alter table public.workspace_members
  add column name text check (name is null or char_length(btrim(name)) between 2 and 120),
  add column avatar_url text check (avatar_url is null or avatar_url ~* '^https?://'),
  add column pin_changed_at timestamptz;

update public.workspace_members as member
set
  name = profile.full_name,
  avatar_url = profile.avatar_url
from public.profiles as profile
where profile.id = member.user_id;

comment on column public.workspace_members.name is 'Display-name snapshot kept in sync with profiles so access changes remain readable in the immutable audit log.';
comment on column public.workspace_members.avatar_url is 'Public avatar URL snapshot; image bytes live in the avatars Storage bucket.';
comment on column public.workspace_members.pin_changed_at is 'Timestamp only. PIN values and hashes remain exclusively inside Supabase Auth.';

create or replace function private.can_manage_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_members as manager
      join public.workspace_members as target
        on target.workspace_id = manager.workspace_id
      where manager.user_id = (select auth.uid())
        and manager.status = 'active'
        and manager.role = 'owner'
        and target.user_id = p_profile_id
    );
$$;

revoke execute on function private.can_manage_profile(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.can_manage_profile(uuid)
  to authenticated, service_role;

create policy profiles_update_workspace_owner on public.profiles
  for update to authenticated
  using ((select private.can_manage_profile(id)))
  with check ((select private.can_manage_profile(id)));

create or replace function private.sync_profile_to_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.full_name is not distinct from new.full_name
     and old.avatar_url is not distinct from new.avatar_url then
    return new;
  end if;

  update public.workspace_members
  set
    name = new.full_name,
    avatar_url = new.avatar_url,
    updated_at = now()
  where user_id = new.id;

  return new;
end;
$$;

revoke execute on function private.sync_profile_to_memberships()
  from public, anon, authenticated, service_role;

create trigger profiles_sync_member_snapshots
  after update of full_name, avatar_url on public.profiles
  for each row execute function private.sync_profile_to_memberships();

create or replace function public.mark_own_pin_changed()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  update public.workspace_members
  set pin_changed_at = changed_at, updated_at = changed_at
  where user_id = (select auth.uid())
    and status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'Active workspace membership required';
  end if;

  return changed_at;
end;
$$;

revoke all on function public.mark_own_pin_changed()
  from public, anon, authenticated, service_role;
grant execute on function public.mark_own_pin_changed()
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
