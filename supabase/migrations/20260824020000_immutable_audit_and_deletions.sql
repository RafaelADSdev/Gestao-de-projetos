-- Immutable audit history and operational deletion permissions.

begin;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  actor_id uuid,
  actor_name text not null,
  actor_email text,
  action text not null check (action in ('created', 'updated', 'deleted')),
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 80),
  entity_id text not null check (char_length(btrim(entity_id)) between 1 and 180),
  entity_label text not null check (char_length(btrim(entity_label)) between 1 and 240),
  project_id uuid,
  changed_fields text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index audit_log_workspace_created_idx
  on public.audit_log (workspace_id, created_at desc);
create index audit_log_workspace_entity_idx
  on public.audit_log (workspace_id, entity_type, entity_id, created_at desc);
create index audit_log_project_created_idx
  on public.audit_log (workspace_id, project_id, created_at desc)
  where project_id is not null;
create index audit_log_actor_created_idx
  on public.audit_log (actor_id, created_at desc)
  where actor_id is not null;

-- The audit table intentionally has no foreign keys: its tenant, actor,
-- project and entity identifiers are historical snapshots that must survive
-- deletion of their source rows.
comment on table public.audit_log is 'Global append-only audit trail across workspaces; identifiers and actor details are immutable snapshots.';
comment on column public.audit_log.workspace_id is 'Workspace snapshot without a destructive foreign key.';
comment on column public.audit_log.actor_id is 'Supabase user UUID snapshot; null denotes a service/system operation.';
comment on column public.audit_log.changed_fields is 'Names of non-sensitive fields affected by the operation; never their values.';

create or replace function private.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row jsonb;
  old_row jsonb := '{}'::jsonb;
  new_row jsonb := '{}'::jsonb;
  audit_action text;
  audit_workspace_id uuid;
  audit_actor_id uuid;
  audit_actor_name text;
  audit_actor_email text;
  audit_entity_id text;
  audit_entity_label text;
  audit_project_id uuid;
  audit_changed_fields text[] := '{}'::text[];
begin
  if tg_op = 'INSERT' then
    new_row := pg_catalog.to_jsonb(new);
    source_row := new_row;
    audit_action := 'created';
  elsif tg_op = 'UPDATE' then
    old_row := pg_catalog.to_jsonb(old);
    new_row := pg_catalog.to_jsonb(new);
    source_row := new_row;
    audit_action := 'updated';
  elsif tg_op = 'DELETE' then
    old_row := pg_catalog.to_jsonb(old);
    source_row := old_row;
    audit_action := 'deleted';
  else
    raise exception using
      errcode = '0A000',
      message = 'Unsupported audit trigger operation: ' || tg_op;
  end if;

  audit_workspace_id := nullif(source_row ->> 'workspace_id', '')::uuid;
  audit_entity_id := coalesce(
    nullif(source_row ->> 'id', ''),
    nullif(source_row ->> 'project_id', ''),
    nullif(source_row ->> 'user_id', '')
  );

  if audit_workspace_id is null or audit_entity_id is null then
    raise exception using
      errcode = '23502',
      message = 'Audited rows must expose workspace_id and a stable identifier';
  end if;

  audit_entity_label := coalesce(
    nullif(pg_catalog.btrim(source_row ->> 'name'), ''),
    nullif(pg_catalog.btrim(source_row ->> 'title'), ''),
    nullif(pg_catalog.btrim(source_row ->> 'service_name'), ''),
    nullif(pg_catalog.btrim(source_row ->> 'label'), ''),
    nullif(pg_catalog.btrim(source_row ->> 'key'), ''),
    tg_table_name || ' ' || audit_entity_id
  );

  if tg_table_name = 'projects' then
    audit_project_id := nullif(source_row ->> 'id', '')::uuid;
  elsif source_row ? 'project_id' then
    audit_project_id := nullif(source_row ->> 'project_id', '')::uuid;
  end if;

  select coalesce(pg_catalog.array_agg(changed.field_name order by changed.field_name), '{}'::text[])
  into audit_changed_fields
  from (
    select field.field_name
    from pg_catalog.jsonb_object_keys(old_row || new_row) as field(field_name)
    where old_row -> field.field_name is distinct from new_row -> field.field_name
      and field.field_name !~* '(token|secret|password|credential|cipher|vault|amount|revenue|cost|price|value)'
  ) as changed;

  audit_actor_id := auth.uid();
  if audit_actor_id is null then
    audit_actor_name := 'Sistema';
    audit_actor_email := null;
  else
    select profile.full_name, profile.email
    into audit_actor_name, audit_actor_email
    from public.profiles as profile
    where profile.id = audit_actor_id;

    audit_actor_name := coalesce(
      nullif(pg_catalog.btrim(audit_actor_name), ''),
      nullif(pg_catalog.btrim(audit_actor_email), ''),
      'Usuário'
    );
  end if;

  insert into public.audit_log (
    workspace_id,
    actor_id,
    actor_name,
    actor_email,
    action,
    entity_type,
    entity_id,
    entity_label,
    project_id,
    changed_fields
  )
  values (
    audit_workspace_id,
    audit_actor_id,
    audit_actor_name,
    audit_actor_email,
    audit_action,
    tg_table_name,
    audit_entity_id,
    audit_entity_label,
    audit_project_id,
    audit_changed_fields
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.reject_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = pg_catalog.format(
      '%I.%I is append-only; %s is not permitted',
      tg_table_schema,
      tg_table_name,
      tg_op
    );
end;
$$;

revoke execute on function private.capture_audit_event()
  from public, anon, authenticated, service_role;
revoke execute on function private.reject_history_mutation()
  from public, anon, authenticated, service_role;

create trigger clients_capture_audit
  after insert or update or delete on public.clients
  for each row execute function private.capture_audit_event();
create trigger workflows_capture_audit
  after insert or update or delete on public.workflows
  for each row execute function private.capture_audit_event();
create trigger board_columns_capture_audit
  after insert or update or delete on public.board_columns
  for each row execute function private.capture_audit_event();
create trigger sprints_capture_audit
  after insert or update or delete on public.sprints
  for each row execute function private.capture_audit_event();
create trigger technologies_capture_audit
  after insert or update or delete on public.technologies
  for each row execute function private.capture_audit_event();
create trigger project_templates_capture_audit
  after insert or update or delete on public.project_templates
  for each row execute function private.capture_audit_event();
create trigger projects_capture_audit
  after insert or update or delete on public.projects
  for each row execute function private.capture_audit_event();
create trigger checklist_items_capture_audit
  after insert or update or delete on public.checklist_items
  for each row execute function private.capture_audit_event();
create trigger deadlines_capture_audit
  after insert or update or delete on public.deadlines
  for each row execute function private.capture_audit_event();
create trigger project_resources_capture_audit
  after insert or update or delete on public.project_resources
  for each row execute function private.capture_audit_event();
create trigger commercial_terms_capture_audit
  after insert or update or delete on public.commercial_terms
  for each row execute function private.capture_audit_event();
create trigger subscriptions_capture_audit
  after insert or update or delete on public.subscriptions
  for each row execute function private.capture_audit_event();
create trigger project_subscriptions_capture_audit
  after insert or update or delete on public.project_subscriptions
  for each row execute function private.capture_audit_event();
create trigger subscription_financials_capture_audit
  after insert or update or delete on public.subscription_financials
  for each row execute function private.capture_audit_event();
create trigger project_technologies_capture_audit
  after insert or update or delete on public.project_technologies
  for each row execute function private.capture_audit_event();
create trigger workspace_members_capture_audit
  after insert or update or delete on public.workspace_members
  for each row execute function private.capture_audit_event();
create trigger calendar_connections_capture_audit
  after insert or update or delete on public.calendar_connections
  for each row execute function private.capture_audit_event();

create trigger audit_log_reject_update_delete
  before update or delete on public.audit_log
  for each row execute function private.reject_history_mutation();
create trigger audit_log_reject_truncate
  before truncate on public.audit_log
  for each statement execute function private.reject_history_mutation();

-- Project activity is also a historical snapshot. Removing all destructive
-- foreign keys ensures it survives project, workspace and profile deletion.
alter table public.project_activity
  drop constraint if exists project_activity_workspace_id_fkey,
  drop constraint if exists project_activity_actor_id_fkey,
  drop constraint if exists project_activity_project_fk;

create trigger project_activity_reject_update_delete
  before update or delete on public.project_activity
  for each row execute function private.reject_history_mutation();
create trigger project_activity_reject_truncate
  before truncate on public.project_activity
  for each statement execute function private.reject_history_mutation();

alter table public.audit_log enable row level security;

create policy audit_log_select_member on public.audit_log
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy clients_delete_member on public.clients
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy projects_delete_member on public.projects
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Explicit Data API grants. Both histories are append-only; audit_log is only
-- written by the private trigger, while project_activity remains app-appendable.
revoke all on table public.audit_log
  from public, anon, authenticated, service_role;
grant select on table public.audit_log
  to authenticated, service_role;

revoke all on table public.project_activity
  from public, anon, authenticated, service_role;
grant select, insert on table public.project_activity
  to authenticated, service_role;

grant delete on table public.clients, public.projects
  to authenticated;

comment on table public.project_activity is 'Append-only project history whose snapshot IDs survive source-row deletion.';

commit;
