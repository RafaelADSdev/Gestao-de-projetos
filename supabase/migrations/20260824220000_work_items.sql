-- Executable cards linked to projects (Epics) with multi-assignee support.

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  workflow_id uuid not null,
  board_column_id uuid not null,
  sprint_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 200),
  description text check (description is null or char_length(description) <= 2000),
  sort_order numeric(18, 6) not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_workspace_id_id_key unique (workspace_id, id),
  constraint work_items_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint work_items_workflow_fk foreign key (workspace_id, workflow_id)
    references public.workflows(workspace_id, id) on delete restrict,
  constraint work_items_board_column_fk foreign key (workspace_id, board_column_id)
    references public.board_columns(workspace_id, id) on delete restrict,
  constraint work_items_sprint_fk foreign key (workspace_id, workflow_id, sprint_id)
    references public.sprints(workspace_id, workflow_id, id) on delete set null (sprint_id)
);

create index work_items_workspace_workflow_sprint_idx
  on public.work_items (workspace_id, workflow_id, sprint_id, sort_order)
  where archived_at is null;
create index work_items_workspace_project_idx
  on public.work_items (workspace_id, project_id)
  where archived_at is null;
create index work_items_board_column_fk_idx
  on public.work_items (workspace_id, board_column_id);

create table public.work_item_assignees (
  work_item_id uuid not null,
  workspace_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (work_item_id, member_id),
  constraint work_item_assignees_work_item_fk foreign key (workspace_id, work_item_id)
    references public.work_items(workspace_id, id) on delete cascade,
  constraint work_item_assignees_member_fk foreign key (workspace_id, member_id)
    references public.workspace_members(workspace_id, user_id) on delete cascade
);

create index work_item_assignees_member_idx
  on public.work_item_assignees (workspace_id, member_id);

create trigger work_items_set_updated_at
  before update on public.work_items
  for each row execute function private.set_updated_at();

alter table public.work_items enable row level security;
alter table public.work_item_assignees enable row level security;

create policy work_items_select_member on public.work_items
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy work_items_insert_member on public.work_items
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy work_items_update_member on public.work_items
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy work_items_delete_member on public.work_items
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy work_item_assignees_select_member on public.work_item_assignees
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy work_item_assignees_insert_member on public.work_item_assignees
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy work_item_assignees_delete_member on public.work_item_assignees
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

revoke all on table public.work_items from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.work_items to authenticated, service_role;
revoke all on table public.work_item_assignees from public, anon, authenticated, service_role;
grant select, insert, delete on table public.work_item_assignees to authenticated, service_role;

create trigger work_items_capture_audit
  after insert or update or delete on public.work_items
  for each row execute function private.capture_audit_event();

comment on table public.work_items is 'Kanban cards linked to a project Epic, with optional sprint planning.';
comment on table public.work_item_assignees is 'Many-to-many assignees for a work item card.';
