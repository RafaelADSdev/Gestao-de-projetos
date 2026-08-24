-- Workflows, sprints and technology catalog.
--
-- This is intentionally incremental: existing workspaces receive one stable
-- default workflow before workflow_id becomes mandatory on columns/projects.

begin;

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  key text not null check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  sprint_enabled boolean not null default false,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflows_workspace_id_id_key unique (workspace_id, id),
  constraint workflows_workspace_key_key unique (workspace_id, key),
  constraint workflows_default_not_archived_check
    check (not is_default or archived_at is null)
);

create unique index workflows_one_default_per_workspace_idx
  on public.workflows (workspace_id)
  where is_default;
create index workflows_workspace_active_idx
  on public.workflows (workspace_id, name)
  where archived_at is null;

-- Derive deterministic UUIDs so every pre-existing workspace receives the
-- same default workflow ID whenever this migration is replayed from scratch.
with workspace_hashes as (
  select
    id as workspace_id,
    md5('central-agency:default-workflow:' || id::text) as hash
  from public.workspaces
), workspace_defaults as (
  select
    workspace_id,
    case
      when workspace_id = '00000000-0000-4000-8000-000000000001'::uuid
        then '00000000-0000-4000-8000-000000000301'::uuid
      else (
        substr(hash, 1, 8) || '-' ||
        substr(hash, 9, 4) || '-' ||
        substr(hash, 13, 4) || '-' ||
        substr(hash, 17, 4) || '-' ||
        substr(hash, 21, 12)
      )::uuid
    end as workflow_id
  from workspace_hashes
)
insert into public.workflows (
  id, workspace_id, name, key, description, sprint_enabled, is_default
)
select
  workflow_id,
  workspace_id,
  'Operação padrão',
  'operacao-padrao',
  'Fluxo principal criado durante a migração dos quadros existentes.',
  false,
  true
from workspace_defaults;

alter table public.board_columns
  add column workflow_id uuid,
  add column description text,
  add column archived_at timestamptz;

update public.board_columns as board_column
set workflow_id = workflow.id
from public.workflows as workflow
where workflow.workspace_id = board_column.workspace_id
  and workflow.is_default;

alter table public.board_columns
  alter column workflow_id set not null,
  drop constraint board_columns_workspace_key_key,
  drop constraint board_columns_workspace_position_key,
  add constraint board_columns_workspace_workflow_fk
    foreign key (workspace_id, workflow_id)
    references public.workflows(workspace_id, id) on delete restrict,
  add constraint board_columns_workspace_workflow_id_key
    unique (workspace_id, workflow_id, id),
  add constraint board_columns_workflow_key_key
    unique (workspace_id, workflow_id, key),
  add constraint board_columns_workflow_position_key
    unique (workspace_id, workflow_id, position);

create index board_columns_workflow_position_idx
  on public.board_columns (workspace_id, workflow_id, position);

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workflow_id uuid not null,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  goal text,
  status text not null default 'planned'
    check (status in ('planned', 'active', 'completed')),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprints_date_order_check check (end_date >= start_date),
  constraint sprints_workspace_workflow_fk
    foreign key (workspace_id, workflow_id)
    references public.workflows(workspace_id, id) on delete cascade,
  constraint sprints_workspace_workflow_id_key
    unique (workspace_id, workflow_id, id)
);

create index sprints_workflow_status_dates_idx
  on public.sprints (workspace_id, workflow_id, status, start_date, end_date);

alter table public.projects
  add column workflow_id uuid,
  add column sprint_id uuid;

update public.projects as project
set workflow_id = board_column.workflow_id
from public.board_columns as board_column
where board_column.workspace_id = project.workspace_id
  and board_column.id = project.board_column_id;

alter table public.projects
  alter column workflow_id set not null,
  drop constraint projects_board_column_fk,
  add constraint projects_workflow_fk
    foreign key (workspace_id, workflow_id)
    references public.workflows(workspace_id, id) on delete restrict,
  add constraint projects_board_column_workflow_fk
    foreign key (workspace_id, workflow_id, board_column_id)
    references public.board_columns(workspace_id, workflow_id, id) on delete restrict,
  add constraint projects_sprint_workflow_fk
    foreign key (workspace_id, workflow_id, sprint_id)
    references public.sprints(workspace_id, workflow_id, id) on delete set null (sprint_id);

create index projects_workflow_board_sort_idx
  on public.projects (workspace_id, workflow_id, board_column_id, sort_order, created_at)
  where archived_at is null;
create index projects_sprint_fk_idx
  on public.projects (workspace_id, workflow_id, sprint_id)
  where sprint_id is not null;

create table public.technologies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null
    check (category in (
      'frontend', 'backend', 'database', 'infrastructure',
      'design', 'analytics', 'other'
    )),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technologies_workspace_id_id_key unique (workspace_id, id)
);

create unique index technologies_workspace_name_unique_idx
  on public.technologies (workspace_id, lower(name));
create index technologies_workspace_category_active_idx
  on public.technologies (workspace_id, category, name)
  where archived_at is null;

create table public.project_technologies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  technology_id uuid not null,
  created_at timestamptz not null default now(),
  constraint project_technologies_project_technology_key
    unique (project_id, technology_id),
  constraint project_technologies_project_fk
    foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint project_technologies_technology_fk
    foreign key (workspace_id, technology_id)
    references public.technologies(workspace_id, id) on delete cascade
);

create index project_technologies_project_fk_idx
  on public.project_technologies (workspace_id, project_id);
create index project_technologies_technology_fk_idx
  on public.project_technologies (workspace_id, technology_id);

create trigger workflows_set_updated_at before update on public.workflows
  for each row execute function private.set_updated_at();
create trigger sprints_set_updated_at before update on public.sprints
  for each row execute function private.set_updated_at();
create trigger technologies_set_updated_at before update on public.technologies
  for each row execute function private.set_updated_at();

alter table public.workflows enable row level security;
alter table public.sprints enable row level security;
alter table public.technologies enable row level security;
alter table public.project_technologies enable row level security;

create policy workflows_select_member on public.workflows
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy workflows_insert_admin on public.workflows
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy workflows_update_admin on public.workflows
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy workflows_delete_admin on public.workflows
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy sprints_select_member on public.sprints
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy sprints_insert_admin on public.sprints
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy sprints_update_admin on public.sprints
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy sprints_delete_admin on public.sprints
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy technologies_select_member on public.technologies
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy technologies_insert_admin on public.technologies
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy technologies_update_admin on public.technologies
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy technologies_delete_admin on public.technologies
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy project_technologies_select_member on public.project_technologies
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy project_technologies_insert_member on public.project_technologies
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_technologies_update_admin on public.project_technologies
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy project_technologies_delete_member on public.project_technologies
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Explicit Data API exposure. RLS supplies row-level authorization after these
-- table privileges make the private app reachable to signed-in users.
revoke all on table
  public.workflows,
  public.sprints,
  public.technologies,
  public.project_technologies
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.workflows,
  public.sprints,
  public.technologies,
  public.project_technologies
to authenticated, service_role;

insert into public.technologies (
  id, workspace_id, name, category, color, website_url
)
values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', 'Next.js', 'frontend', '#000000', 'https://nextjs.org'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', 'TypeScript', 'frontend', '#3178C6', 'https://www.typescriptlang.org'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000001', 'Tailwind CSS', 'frontend', '#06B6D4', 'https://tailwindcss.com'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000001', 'Supabase', 'database', '#3ECF8E', 'https://supabase.com'),
  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-000000000001', 'Vercel', 'infrastructure', '#000000', 'https://vercel.com'),
  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-000000000001', 'Figma', 'design', '#A259FF', 'https://www.figma.com');

comment on table public.workflows is 'Workspace-scoped Kanban workflows; one active default is backfilled per existing workspace.';
comment on table public.sprints is 'Optional planning cycles scoped to exactly one workspace workflow.';
comment on table public.technologies is 'Workspace-owned technology catalog used to classify project stacks.';
comment on table public.project_technologies is 'Workspace-safe many-to-many mapping between projects and technologies.';
comment on column public.board_columns.workflow_id is 'Workflow that owns this Kanban stage.';
comment on column public.board_columns.description is 'Optional guidance describing the purpose of this Kanban stage.';
comment on column public.board_columns.archived_at is 'Soft-deletion marker; projects must be moved before a stage is archived.';
comment on column public.projects.workflow_id is 'Workflow currently governing this project.';
comment on column public.projects.sprint_id is 'Optional sprint in the same workspace and workflow as the project.';

commit;
