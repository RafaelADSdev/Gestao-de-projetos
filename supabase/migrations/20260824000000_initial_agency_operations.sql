-- Central da Agencia - production baseline
--
-- Security model:
--   * public tables are exposed explicitly to authenticated/service_role only;
--   * every public table has RLS enabled;
--   * tenant access is derived from active workspace_members rows;
--   * financial rows are limited to owner/admin;
--   * Google token ciphertext is stored in the non-exposed private schema.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Supabase is moving Data API exposure to opt-in. Keep future objects private
-- until a migration grants the exact privileges they require.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  avatar_url text check (avatar_url is null or avatar_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_unique_idx
  on public.profiles (lower(email))
  where email is not null;

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_workspace_user_key unique (workspace_id, user_id)
);

create index workspace_members_user_active_idx
  on public.workspace_members (user_id, workspace_id)
  where status = 'active';
create index workspace_members_user_id_idx
  on public.workspace_members (user_id);
create index workspace_members_workspace_role_idx
  on public.workspace_members (workspace_id, role)
  where status = 'active';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  company_name text,
  contact_name text,
  email text,
  phone text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_workspace_id_id_key unique (workspace_id, id)
);

create index clients_workspace_name_idx
  on public.clients (workspace_id, name)
  where archived_at is null;
create index clients_created_by_idx
  on public.clients (created_by)
  where created_by is not null;

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  key text not null check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  position smallint not null check (position >= 0),
  color text not null default '#64748B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  wip_limit integer check (wip_limit is null or wip_limit > 0),
  is_terminal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_columns_workspace_id_id_key unique (workspace_id, id),
  constraint board_columns_workspace_key_key unique (workspace_id, key),
  constraint board_columns_workspace_position_key unique (workspace_id, position)
);

create table public.project_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  project_type text not null check (project_type in ('site_institutional', 'course_platform', 'maintenance')),
  checklist_blueprint jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checklist_blueprint) = 'array'),
  resource_blueprint jsonb not null default '[]'::jsonb
    check (jsonb_typeof(resource_blueprint) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_templates_workspace_id_id_key unique (workspace_id, id),
  constraint project_templates_workspace_key_key unique (workspace_id, key)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null,
  board_column_id uuid not null,
  template_id uuid,
  name text not null check (char_length(btrim(name)) between 2 and 180),
  project_type text not null default 'other'
    check (project_type in ('site_institutional', 'course_platform', 'maintenance', 'other')),
  description text,
  responsible_id uuid,
  next_action text,
  blocked boolean not null default false,
  blocker_reason text,
  billing_model text not null default 'none'
    check (billing_model in ('none', 'one_time', 'recurring', 'hybrid')),
  sort_order numeric(18, 6) not null default 0,
  started_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_workspace_id_id_key unique (workspace_id, id),
  constraint projects_client_fk foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete restrict,
  constraint projects_board_column_fk foreign key (workspace_id, board_column_id)
    references public.board_columns(workspace_id, id) on delete restrict,
  constraint projects_template_fk foreign key (workspace_id, template_id)
    references public.project_templates(workspace_id, id) on delete set null (template_id),
  constraint projects_responsible_member_fk foreign key (workspace_id, responsible_id)
    references public.workspace_members(workspace_id, user_id) on delete set null (responsible_id)
);

create index projects_workspace_board_sort_idx
  on public.projects (workspace_id, board_column_id, sort_order, created_at)
  where archived_at is null;
create index projects_board_column_fk_idx
  on public.projects (workspace_id, board_column_id);
create index projects_workspace_client_idx
  on public.projects (workspace_id, client_id)
  where archived_at is null;
create index projects_client_fk_idx
  on public.projects (workspace_id, client_id);
create index projects_workspace_responsible_idx
  on public.projects (workspace_id, responsible_id)
  where archived_at is null and responsible_id is not null;
create index projects_responsible_fk_idx
  on public.projects (workspace_id, responsible_id)
  where responsible_id is not null;
create index projects_template_fk_idx
  on public.projects (workspace_id, template_id)
  where template_id is not null;
create index projects_created_by_idx
  on public.projects (created_by)
  where created_by is not null;
create index projects_updated_by_idx
  on public.projects (updated_by)
  where updated_by is not null;
create index projects_workspace_blocked_idx
  on public.projects (workspace_id, updated_at desc)
  where archived_at is null and blocked;

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  template_item_key text,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  description text,
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklist_items_workspace_project_id_key unique (workspace_id, project_id, id),
  constraint checklist_items_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade
);

create index checklist_items_project_position_idx
  on public.checklist_items (workspace_id, project_id, position);
create index checklist_items_open_idx
  on public.checklist_items (workspace_id, project_id, updated_at)
  where completed_at is null;
create index checklist_items_completed_by_idx
  on public.checklist_items (completed_by)
  where completed_by is not null;

create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  checklist_item_id uuid,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  kind text not null default 'other'
    check (kind in ('delivery', 'review', 'client-content', 'launch', 'maintenance', 'other')),
  due_date date not null,
  due_time time without time zone,
  all_day boolean not null default true,
  timezone text not null default 'America/Sao_Paulo',
  reminder_days smallint[] not null default array[7, 2, 0]::smallint[],
  status text not null default 'open' check (status in ('open', 'completed', 'canceled')),
  sync_enabled boolean not null default true,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deadlines_workspace_id_id_key unique (workspace_id, id),
  constraint deadlines_all_day_time_check check (all_day = (due_time is null)),
  constraint deadlines_reminders_not_null_check check (array_position(reminder_days, null) is null),
  constraint deadlines_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint deadlines_checklist_item_fk foreign key (workspace_id, project_id, checklist_item_id)
    references public.checklist_items(workspace_id, project_id, id) on delete cascade
);

create index deadlines_project_due_idx
  on public.deadlines (workspace_id, project_id, due_date, due_time)
  where status = 'open';
create index deadlines_project_fk_idx
  on public.deadlines (workspace_id, project_id);
create index deadlines_workspace_upcoming_idx
  on public.deadlines (workspace_id, due_date, due_time)
  where status = 'open';
create index deadlines_checklist_item_fk_idx
  on public.deadlines (workspace_id, project_id, checklist_item_id)
  where checklist_item_id is not null;
create index deadlines_completed_by_idx
  on public.deadlines (completed_by)
  where completed_by is not null;

create table public.project_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  resource_type text not null default 'other'
    check (resource_type in ('production', 'staging', 'admin', 'github', 'figma', 'drive', 'documentation', 'other')),
  label text not null check (char_length(btrim(label)) between 2 and 120),
  url text,
  status text not null default 'active' check (status in ('needed', 'active', 'archived')),
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_resources_workspace_id_id_key unique (workspace_id, id),
  constraint project_resources_url_check check (url is null or url ~* '^https?://[^[:space:]]+$'),
  constraint project_resources_no_embedded_credentials_check check (url is null or url !~* '^https?://[^/[:space:]]+@'),
  constraint project_resources_active_url_check check (status <> 'active' or url is not null),
  constraint project_resources_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade
);

create index project_resources_project_type_idx
  on public.project_resources (workspace_id, project_id, resource_type);
create unique index project_resources_one_primary_type_idx
  on public.project_resources (project_id, resource_type)
  where is_primary and status <> 'archived';

create table public.commercial_terms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null unique,
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  contract_value_cents bigint check (contract_value_cents is null or contract_value_cents >= 0),
  monthly_revenue_cents bigint check (monthly_revenue_cents is null or monthly_revenue_cents >= 0),
  maintenance_billing_cycle text
    check (maintenance_billing_cycle is null or maintenance_billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual', 'one-time')),
  maintenance_status text not null default 'planned'
    check (maintenance_status in ('planned', 'active', 'paused', 'ended')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'partial', 'paid', 'overdue', 'waived')),
  billing_day smallint check (billing_day between 1 and 31),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_terms_workspace_project_key unique (workspace_id, project_id),
  constraint commercial_terms_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade
);

create index commercial_terms_workspace_payment_idx
  on public.commercial_terms (workspace_id, payment_status);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid,
  service_name text not null check (char_length(btrim(service_name)) between 2 and 120),
  plan_name text,
  category text not null
    check (category in ('domain', 'hosting', 'email', 'video', 'software', 'other')),
  billing_cycle text not null
    check (billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual', 'biennial')),
  renewal_date date not null,
  auto_renew boolean not null default false,
  payer text not null default 'agency' check (payer in ('agency', 'client')),
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  reminder_days smallint[] not null default array[30, 7, 1]::smallint[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_workspace_id_id_key unique (workspace_id, id),
  constraint subscriptions_reminders_not_null_check check (array_position(reminder_days, null) is null),
  constraint subscriptions_client_fk foreign key (workspace_id, client_id)
    references public.clients(workspace_id, id) on delete set null (client_id)
);

create index subscriptions_workspace_renewal_idx
  on public.subscriptions (workspace_id, renewal_date)
  where status = 'active';
create index subscriptions_client_idx
  on public.subscriptions (workspace_id, client_id)
  where client_id is not null;

create table public.project_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  subscription_id uuid not null,
  created_at timestamptz not null default now(),
  constraint project_subscriptions_project_subscription_key unique (project_id, subscription_id),
  constraint project_subscriptions_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade,
  constraint project_subscriptions_subscription_fk foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade
);

create index project_subscriptions_workspace_project_idx
  on public.project_subscriptions (workspace_id, project_id);
create index project_subscriptions_workspace_subscription_idx
  on public.project_subscriptions (workspace_id, subscription_id);

create table public.subscription_financials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  subscription_id uuid not null unique,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  agency_share_percent numeric(5, 2) not null default 100
    check (agency_share_percent between 0 and 100),
  monthly_cost_cents numeric(16, 2) generated always as (
    round(
      amount_cents::numeric * agency_share_percent / 100 /
      case
        when billing_cycle = 'monthly' then 1
        when billing_cycle = 'quarterly' then 3
        when billing_cycle = 'semiannual' then 6
        when billing_cycle = 'annual' then 12
        when billing_cycle = 'biennial' then 24
      end,
      2
    )
  ) stored,
  billing_cycle text not null
    check (billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual', 'biennial')),
  vault_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_financials_workspace_subscription_key unique (workspace_id, subscription_id),
  constraint subscription_financials_subscription_fk foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade
);

create index subscription_financials_workspace_idx
  on public.subscription_financials (workspace_id);

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  account_email text,
  calendar_id text,
  calendar_name text not null default 'Central da Agência — Prazos',
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'needs_reauth', 'disconnected', 'error')),
  scopes text[] not null default array['https://www.googleapis.com/auth/calendar.app.created']::text[],
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_connections_workspace_key unique (workspace_id),
  constraint calendar_connections_workspace_id_id_key unique (workspace_id, id),
  constraint calendar_connections_scope_check check (
    'https://www.googleapis.com/auth/calendar.app.created' = any(scopes)
  )
);

create table private.calendar_credentials (
  connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
  access_token_ciphertext text not null check (char_length(access_token_ciphertext) > 0),
  refresh_token_ciphertext text,
  encryption_key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index calendar_connections_connected_by_idx
  on public.calendar_connections (connected_by)
  where connected_by is not null;

create table public.calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  calendar_connection_id uuid not null,
  deadline_id uuid,
  subscription_id uuid,
  google_event_id text not null check (char_length(btrim(google_event_id)) > 0),
  content_hash text,
  status text not null default 'pending' check (status in ('pending', 'synced', 'failed', 'deleting')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_mappings_one_source_check
    check (num_nonnulls(deadline_id, subscription_id) = 1),
  constraint calendar_event_mappings_connection_fk foreign key (workspace_id, calendar_connection_id)
    references public.calendar_connections(workspace_id, id) on delete cascade,
  constraint calendar_event_mappings_deadline_fk foreign key (workspace_id, deadline_id)
    references public.deadlines(workspace_id, id) on delete cascade,
  constraint calendar_event_mappings_subscription_fk foreign key (workspace_id, subscription_id)
    references public.subscriptions(workspace_id, id) on delete cascade,
  constraint calendar_event_mappings_google_event_key unique (calendar_connection_id, google_event_id)
);

create unique index calendar_event_mappings_deadline_key
  on public.calendar_event_mappings (calendar_connection_id, deadline_id)
  where deadline_id is not null;
create unique index calendar_event_mappings_subscription_key
  on public.calendar_event_mappings (calendar_connection_id, subscription_id)
  where subscription_id is not null;
create index calendar_event_mappings_workspace_status_idx
  on public.calendar_event_mappings (workspace_id, status);
create index calendar_event_mappings_deadline_fk_idx
  on public.calendar_event_mappings (workspace_id, deadline_id)
  where deadline_id is not null;
create index calendar_event_mappings_subscription_fk_idx
  on public.calendar_event_mappings (workspace_id, subscription_id)
  where subscription_id is not null;

create table public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  calendar_connection_id uuid not null,
  deadline_id uuid,
  subscription_id uuid,
  operation text not null check (operation in ('upsert', 'delete')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 8 check (max_attempts between 1 and 30),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sync_jobs_one_source_check
    check (num_nonnulls(deadline_id, subscription_id) = 1),
  constraint calendar_sync_jobs_attempt_limit_check check (attempts <= max_attempts),
  constraint calendar_sync_jobs_connection_fk foreign key (workspace_id, calendar_connection_id)
    references public.calendar_connections(workspace_id, id) on delete cascade
);

create unique index calendar_sync_jobs_pending_deadline_key
  on public.calendar_sync_jobs (calendar_connection_id, deadline_id)
  where status = 'pending' and deadline_id is not null;
create unique index calendar_sync_jobs_pending_subscription_key
  on public.calendar_sync_jobs (calendar_connection_id, subscription_id)
  where status = 'pending' and subscription_id is not null;
create index calendar_sync_jobs_ready_idx
  on public.calendar_sync_jobs (available_at, created_at)
  where status in ('pending', 'failed');
create index calendar_sync_jobs_workspace_status_idx
  on public.calendar_sync_jobs (workspace_id, status, available_at);
create index calendar_sync_jobs_connection_fk_idx
  on public.calendar_sync_jobs (workspace_id, calendar_connection_id);

create table public.project_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 2 and 80),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint project_activity_project_fk foreign key (workspace_id, project_id)
    references public.projects(workspace_id, id) on delete cascade
);

create index project_activity_project_created_idx
  on public.project_activity (workspace_id, project_id, created_at desc);
create index project_activity_actor_idx
  on public.project_activity (actor_id)
  where actor_id is not null;

-- Generic timestamp maintenance. Trigger functions are private and never an API.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspaces_set_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger workspace_members_set_updated_at before update on public.workspace_members
  for each row execute function private.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger board_columns_set_updated_at before update on public.board_columns
  for each row execute function private.set_updated_at();
create trigger project_templates_set_updated_at before update on public.project_templates
  for each row execute function private.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
  for each row execute function private.set_updated_at();
create trigger checklist_items_set_updated_at before update on public.checklist_items
  for each row execute function private.set_updated_at();
create trigger deadlines_set_updated_at before update on public.deadlines
  for each row execute function private.set_updated_at();
create trigger project_resources_set_updated_at before update on public.project_resources
  for each row execute function private.set_updated_at();
create trigger commercial_terms_set_updated_at before update on public.commercial_terms
  for each row execute function private.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger subscription_financials_set_updated_at before update on public.subscription_financials
  for each row execute function private.set_updated_at();
create trigger calendar_connections_set_updated_at before update on public.calendar_connections
  for each row execute function private.set_updated_at();
create trigger calendar_credentials_set_updated_at before update on private.calendar_credentials
  for each row execute function private.set_updated_at();
create trigger calendar_event_mappings_set_updated_at before update on public.calendar_event_mappings
  for each row execute function private.set_updated_at();
create trigger calendar_sync_jobs_set_updated_at before update on public.calendar_sync_jobs
  for each row execute function private.set_updated_at();

-- Auth metadata is copied only for display. Authorization never relies on it.
create or replace function private.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_saved
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function private.sync_profile_from_auth();

insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users as u
on conflict (id) do nothing;

create or replace function private.set_checklist_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.completed_at is null then
    new.completed_by := null;
  elsif new.completed_by is null then
    new.completed_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger checklist_items_set_completion
  before insert or update of completed_at on public.checklist_items
  for each row execute function private.set_checklist_completion();

create or replace function private.set_deadline_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, (select auth.uid()));
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

create trigger deadlines_set_completion
  before insert or update of status on public.deadlines
  for each row execute function private.set_deadline_completion();

-- RLS membership helpers live outside exposed schemas and use a fixed path.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_members as wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = (select auth.uid())
        and wm.status = 'active'
    );
$$;

create or replace function private.has_workspace_role(p_workspace_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.workspace_members as wm
      where wm.workspace_id = p_workspace_id
        and wm.user_id = (select auth.uid())
        and wm.status = 'active'
        and wm.role = any(p_roles)
    );
$$;

create or replace function private.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) = p_profile_id
    or exists (
      select 1
      from public.workspace_members as viewer
      join public.workspace_members as target
        on target.workspace_id = viewer.workspace_id
       and target.status = 'active'
      where viewer.user_id = (select auth.uid())
        and viewer.status = 'active'
        and target.user_id = p_profile_id
    );
$$;

-- A workspace may start empty, but after the first membership mutation it must
-- retain at least one active owner. The deferred check supports role transfers.
create or replace function private.ensure_workspace_has_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  if exists (select 1 from public.workspaces where id = v_workspace_id)
     and not exists (
       select 1
       from public.workspace_members
       where workspace_id = v_workspace_id
         and role = 'owner'
         and status = 'active'
     ) then
    raise exception 'workspace % must retain an active owner', v_workspace_id
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger workspace_members_require_owner
  after insert or update or delete on public.workspace_members
  deferrable initially deferred
  for each row execute function private.ensure_workspace_has_owner();

-- Copy template blueprints atomically when a project is created.
create or replace function private.instantiate_project_template()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.template_id is null then
    return new;
  end if;

  if (select auth.uid()) is not null
     and not private.is_workspace_member(new.workspace_id) then
    raise exception 'not a member of workspace %', new.workspace_id
      using errcode = '42501';
  end if;

  insert into public.checklist_items (
    workspace_id, project_id, template_item_key, title, description, position
  )
  select
    new.workspace_id,
    new.id,
    item.value ->> 'key',
    item.value ->> 'title',
    item.value ->> 'description',
    coalesce((item.value ->> 'position')::integer, item.ordinality::integer - 1)
  from public.project_templates as template
  cross join lateral jsonb_array_elements(template.checklist_blueprint)
    with ordinality as item(value, ordinality)
  where template.workspace_id = new.workspace_id
    and template.id = new.template_id;

  insert into public.project_resources (
    workspace_id, project_id, resource_type, label, status, is_primary
  )
  select
    new.workspace_id,
    new.id,
    coalesce(item.value ->> 'type', 'other'),
    coalesce(item.value ->> 'label', 'Link a cadastrar'),
    'needed',
    coalesce((item.value ->> 'primary')::boolean, false)
  from public.project_templates as template
  cross join lateral jsonb_array_elements(template.resource_blueprint) as item(value)
  where template.workspace_id = new.workspace_id
    and template.id = new.template_id;

  return new;
end;
$$;

create trigger projects_instantiate_template
  after insert on public.projects
  for each row execute function private.instantiate_project_template();

create or replace function private.sync_project_billing_model()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
  v_project_id uuid := coalesce(new.project_id, old.project_id);
  v_contract bigint := coalesce(new.contract_value_cents, 0);
  v_monthly bigint := coalesce(new.monthly_revenue_cents, 0);
begin
  if (select auth.uid()) is not null
     and not private.has_workspace_role(v_workspace_id, array['owner', 'admin']) then
    raise exception 'financial role required' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    update public.projects set billing_model = 'none' where id = v_project_id;
  else
    update public.projects
    set billing_model = case
      when v_contract > 0 and v_monthly > 0 then 'hybrid'
      when v_monthly > 0 then 'recurring'
      when v_contract > 0 then 'one_time'
      else 'none'
    end
    where id = v_project_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger commercial_terms_sync_billing_model
  after insert or update or delete on public.commercial_terms
  for each row execute function private.sync_project_billing_model();

-- Queue calendar work transactionally. Job source IDs intentionally do not use
-- foreign keys so a remote delete can still run after its local source is gone.
create or replace function private.enqueue_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_source_id uuid;
  v_connection_id uuid;
  v_operation text;
  v_google_event_id text;
  v_payload jsonb;
begin
  v_workspace_id := case when tg_op = 'DELETE' then old.workspace_id else new.workspace_id end;
  v_source_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if (select auth.uid()) is not null
     and not private.is_workspace_member(v_workspace_id) then
    raise exception 'not a member of workspace %', v_workspace_id
      using errcode = '42501';
  end if;

  select connection.id
    into v_connection_id
  from public.calendar_connections as connection
  where connection.workspace_id = v_workspace_id
    and connection.status in ('connected', 'needs_reauth', 'error');

  if v_connection_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'deadlines' then
    if tg_op = 'DELETE' then
      v_operation := 'delete';
    elsif new.status <> 'open' or not new.sync_enabled then
      v_operation := 'delete';
    else
      v_operation := 'upsert';
    end if;

    select mapping.google_event_id into v_google_event_id
    from public.calendar_event_mappings as mapping
    where mapping.calendar_connection_id = v_connection_id
      and mapping.deadline_id = v_source_id;

    update public.calendar_event_mappings
      set status = case when v_operation = 'delete' then 'deleting' else 'pending' end,
          last_error = null
    where calendar_connection_id = v_connection_id
      and deadline_id = v_source_id;

    v_payload := jsonb_build_object(
      'source_type', 'deadline',
      'source_id', v_source_id,
      'google_event_id', v_google_event_id
    );

    insert into public.calendar_sync_jobs (
      workspace_id, calendar_connection_id, deadline_id, operation, payload
    ) values (
      v_workspace_id, v_connection_id, v_source_id, v_operation, v_payload
    )
    on conflict (calendar_connection_id, deadline_id)
      where status = 'pending' and deadline_id is not null
    do update set
      operation = excluded.operation,
      payload = excluded.payload,
      attempts = 0,
      available_at = now(),
      last_error = null,
      updated_at = now();
  elsif tg_table_name = 'subscriptions' then
    if tg_op = 'DELETE' then
      v_operation := 'delete';
    elsif new.status <> 'active' then
      v_operation := 'delete';
    else
      v_operation := 'upsert';
    end if;

    select mapping.google_event_id into v_google_event_id
    from public.calendar_event_mappings as mapping
    where mapping.calendar_connection_id = v_connection_id
      and mapping.subscription_id = v_source_id;

    update public.calendar_event_mappings
      set status = case when v_operation = 'delete' then 'deleting' else 'pending' end,
          last_error = null
    where calendar_connection_id = v_connection_id
      and subscription_id = v_source_id;

    v_payload := jsonb_build_object(
      'source_type', 'subscription',
      'source_id', v_source_id,
      'google_event_id', v_google_event_id
    );

    insert into public.calendar_sync_jobs (
      workspace_id, calendar_connection_id, subscription_id, operation, payload
    ) values (
      v_workspace_id, v_connection_id, v_source_id, v_operation, v_payload
    )
    on conflict (calendar_connection_id, subscription_id)
      where status = 'pending' and subscription_id is not null
    do update set
      operation = excluded.operation,
      payload = excluded.payload,
      attempts = 0,
      available_at = now(),
      last_error = null,
      updated_at = now();
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger deadlines_enqueue_calendar_upsert
  after insert or update on public.deadlines
  for each row execute function private.enqueue_calendar_sync();
create trigger deadlines_enqueue_calendar_delete
  before delete on public.deadlines
  for each row execute function private.enqueue_calendar_sync();
create trigger subscriptions_enqueue_calendar_upsert
  after insert or update on public.subscriptions
  for each row execute function private.enqueue_calendar_sync();
create trigger subscriptions_enqueue_calendar_delete
  before delete on public.subscriptions
  for each row execute function private.enqueue_calendar_sync();

create or replace function private.backfill_calendar_sync_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'connected' or new.calendar_id is null then
    return new;
  end if;

  insert into public.calendar_sync_jobs (
    workspace_id, calendar_connection_id, deadline_id, operation,
    status, available_at, payload
  )
  select
    new.workspace_id,
    new.id,
    deadline.id,
    'upsert',
    'pending',
    now(),
    jsonb_build_object('source_type', 'deadline', 'source_id', deadline.id)
  from public.deadlines as deadline
  where deadline.workspace_id = new.workspace_id
    and deadline.status = 'open'
    and deadline.sync_enabled
  on conflict (calendar_connection_id, deadline_id)
    where status = 'pending' and deadline_id is not null
  do update set available_at = now(), attempts = 0, last_error = null, updated_at = now();

  insert into public.calendar_sync_jobs (
    workspace_id, calendar_connection_id, subscription_id, operation,
    status, available_at, payload
  )
  select
    new.workspace_id,
    new.id,
    subscription.id,
    'upsert',
    'pending',
    now(),
    jsonb_build_object('source_type', 'subscription', 'source_id', subscription.id)
  from public.subscriptions as subscription
  where subscription.workspace_id = new.workspace_id
    and subscription.status = 'active'
  on conflict (calendar_connection_id, subscription_id)
    where status = 'pending' and subscription_id is not null
  do update set available_at = now(), attempts = 0, last_error = null, updated_at = now();

  return new;
end;
$$;

create trigger calendar_connections_backfill_jobs
  after insert or update of status, calendar_id on public.calendar_connections
  for each row execute function private.backfill_calendar_sync_jobs();

-- Service-role-only RPCs let trusted server code use encrypted credentials
-- without exposing the private schema through PostgREST.
create or replace function public.upsert_calendar_credentials(
  p_connection_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text default null,
  p_encryption_key_version text default 'v1'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres'
     and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  insert into private.calendar_credentials (
    connection_id,
    access_token_ciphertext,
    refresh_token_ciphertext,
    encryption_key_version
  ) values (
    p_connection_id,
    p_access_token_ciphertext,
    p_refresh_token_ciphertext,
    p_encryption_key_version
  )
  on conflict (connection_id) do update
    set access_token_ciphertext = excluded.access_token_ciphertext,
        refresh_token_ciphertext = coalesce(
          excluded.refresh_token_ciphertext,
          private.calendar_credentials.refresh_token_ciphertext
        ),
        encryption_key_version = excluded.encryption_key_version,
        updated_at = now();
end;
$$;

create or replace function public.get_calendar_credentials(p_connection_id uuid)
returns table (
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  encryption_key_version text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres'
     and coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  return query
  select
    credentials.access_token_ciphertext,
    credentials.refresh_token_ciphertext,
    credentials.encryption_key_version
  from private.calendar_credentials as credentials
  where credentials.connection_id = p_connection_id;
end;
$$;

-- Revoke function execution before granting the narrow allow-list below.
revoke execute on all functions in schema private from public, anon, authenticated, service_role;
revoke execute on function public.upsert_calendar_credentials(uuid, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.get_calendar_credentials(uuid)
  from public, anon, authenticated;

grant usage on schema private to authenticated, service_role;
grant execute on function private.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function private.has_workspace_role(uuid, text[]) to authenticated, service_role;
grant execute on function private.can_view_profile(uuid) to authenticated, service_role;
grant select, insert, update, delete on private.calendar_credentials to service_role;
grant execute on function public.upsert_calendar_credentials(uuid, text, text, text) to service_role;
grant execute on function public.get_calendar_credentials(uuid) to service_role;

-- Row-level security is enabled on every exposed table and on credential storage
-- as defense in depth. The service role remains server-only and bypasses RLS.
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.board_columns enable row level security;
alter table public.project_templates enable row level security;
alter table public.projects enable row level security;
alter table public.checklist_items enable row level security;
alter table public.deadlines enable row level security;
alter table public.project_resources enable row level security;
alter table public.commercial_terms enable row level security;
alter table public.subscriptions enable row level security;
alter table public.project_subscriptions enable row level security;
alter table public.subscription_financials enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_event_mappings enable row level security;
alter table public.calendar_sync_jobs enable row level security;
alter table public.project_activity enable row level security;
alter table private.calendar_credentials enable row level security;

create policy workspaces_select_member on public.workspaces
  for select to authenticated
  using ((select private.is_workspace_member(id)));
create policy workspaces_update_admin on public.workspaces
  for update to authenticated
  using ((select private.has_workspace_role(id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(id, array['owner', 'admin'])));

create policy profiles_select_colleague on public.profiles
  for select to authenticated
  using ((select private.can_view_profile(id)));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy workspace_members_select_member on public.workspace_members
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy workspace_members_insert_owner on public.workspace_members
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner'])));
create policy workspace_members_update_owner on public.workspace_members
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner'])));
create policy workspace_members_delete_owner on public.workspace_members
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner'])));

create policy clients_select_member on public.clients
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy clients_insert_member on public.clients
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy clients_update_member on public.clients
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy board_columns_select_member on public.board_columns
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy board_columns_insert_admin on public.board_columns
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy board_columns_update_admin on public.board_columns
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy board_columns_delete_admin on public.board_columns
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy project_templates_select_member on public.project_templates
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy project_templates_insert_admin on public.project_templates
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy project_templates_update_admin on public.project_templates
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy project_templates_delete_admin on public.project_templates
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy projects_select_member on public.projects
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy projects_insert_member on public.projects
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy projects_update_member on public.projects
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));

create policy checklist_items_select_member on public.checklist_items
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy checklist_items_insert_member on public.checklist_items
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy checklist_items_update_member on public.checklist_items
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy checklist_items_delete_member on public.checklist_items
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy deadlines_select_member on public.deadlines
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy deadlines_insert_member on public.deadlines
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy deadlines_update_member on public.deadlines
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy deadlines_delete_member on public.deadlines
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy project_resources_select_member on public.project_resources
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy project_resources_insert_member on public.project_resources
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_resources_update_member on public.project_resources
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_resources_delete_member on public.project_resources
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy commercial_terms_select_finance on public.commercial_terms
  for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy commercial_terms_insert_finance on public.commercial_terms
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy commercial_terms_update_finance on public.commercial_terms
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy commercial_terms_delete_finance on public.commercial_terms
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy subscriptions_select_member on public.subscriptions
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy subscriptions_insert_member on public.subscriptions
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy subscriptions_update_member on public.subscriptions
  for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy subscriptions_delete_admin on public.subscriptions
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy project_subscriptions_select_member on public.project_subscriptions
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy project_subscriptions_insert_member on public.project_subscriptions
  for insert to authenticated
  with check ((select private.is_workspace_member(workspace_id)));
create policy project_subscriptions_delete_member on public.project_subscriptions
  for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy subscription_financials_select_finance on public.subscription_financials
  for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy subscription_financials_insert_finance on public.subscription_financials
  for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy subscription_financials_update_finance on public.subscription_financials
  for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy subscription_financials_delete_finance on public.subscription_financials
  for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy calendar_connections_select_admin on public.calendar_connections
  for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy calendar_event_mappings_select_admin on public.calendar_event_mappings
  for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy calendar_sync_jobs_select_admin on public.calendar_sync_jobs
  for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

create policy project_activity_select_member on public.project_activity
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy project_activity_insert_self on public.project_activity
  for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and actor_id = (select auth.uid())
  );

-- Explicit Data API grants. anon receives no access to this private application.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, update on public.workspaces to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update, delete on public.board_columns to authenticated;
grant select, insert, update, delete on public.project_templates to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update, delete on public.checklist_items to authenticated;
grant select, insert, update, delete on public.deadlines to authenticated;
grant select, insert, update, delete on public.project_resources to authenticated;
grant select, insert, update, delete on public.commercial_terms to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, delete on public.project_subscriptions to authenticated;
grant select, insert, update, delete on public.subscription_financials to authenticated;
grant select on public.calendar_connections to authenticated;
grant select on public.calendar_event_mappings to authenticated;
grant select on public.calendar_sync_jobs to authenticated;
grant select, insert on public.project_activity to authenticated;

grant select, insert, update, delete on table
  public.workspaces,
  public.profiles,
  public.workspace_members,
  public.clients,
  public.board_columns,
  public.project_templates,
  public.projects,
  public.checklist_items,
  public.deadlines,
  public.project_resources,
  public.commercial_terms,
  public.subscriptions,
  public.project_subscriptions,
  public.subscription_financials,
  public.calendar_connections,
  public.calendar_event_mappings,
  public.calendar_sync_jobs,
  public.project_activity
to service_role;

-- Baseline workspace, workflow and templates. IDs are stable for reproducible
-- preview/production databases and do not encode credentials or user IDs.
insert into public.workspaces (id, name, slug, currency, timezone)
values (
  '00000000-0000-4000-8000-000000000001',
  'Central da Agência',
  'central-da-agencia',
  'BRL',
  'America/Sao_Paulo'
)
on conflict (id) do nothing;

insert into public.board_columns (id, workspace_id, name, key, position, color, is_terminal)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Entrada', 'entrada', 0, '#64748B', false),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Briefing', 'briefing', 1, '#3B82F6', false),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Em produção', 'em-producao', 2, '#2563EB', false),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Aguardando cliente', 'aguardando-cliente', 3, '#F59E0B', false),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Revisão', 'revisao', 4, '#8B5CF6', false),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Publicado', 'publicado', 5, '#10B981', true),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Manutenção', 'manutencao', 6, '#0F766E', false)
on conflict (id) do nothing;

insert into public.project_templates (
  id, workspace_id, key, name, description, project_type,
  checklist_blueprint, resource_blueprint
)
values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    'site-institucional',
    'Site institucional',
    'Fluxo base para sites institucionais responsivos.',
    'site_institutional',
    $json$[
      {"key":"briefing","title":"Validar briefing e objetivos","position":0},
      {"key":"conteudo","title":"Receber textos, fotos e identidade visual","position":1},
      {"key":"prototipo","title":"Aprovar arquitetura e protótipo","position":2},
      {"key":"desenvolvimento","title":"Desenvolver páginas responsivas","position":3},
      {"key":"seo","title":"Configurar SEO, analytics e formulários","position":4},
      {"key":"qa","title":"Revisar acessibilidade e desempenho","position":5},
      {"key":"homologacao","title":"Homologar com o cliente","position":6},
      {"key":"publicacao","title":"Publicar e validar produção","position":7}
    ]$json$::jsonb,
    $json$[
      {"type":"production","label":"Site em produção","primary":true},
      {"type":"staging","label":"Homologação","primary":true},
      {"type":"admin","label":"Painel administrativo","primary":true},
      {"type":"github","label":"Repositorio GitHub","primary":true},
      {"type":"figma","label":"Design no Figma","primary":true},
      {"type":"drive","label":"Pasta do projeto","primary":true}
    ]$json$::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    'plataforma-cursos',
    'Plataforma de cursos',
    'Fluxo base para área de membros, aulas e lançamento.',
    'course_platform',
    $json$[
      {"key":"escopo","title":"Mapear produtos, trilhas e perfis de acesso","position":0},
      {"key":"conteudo","title":"Organizar aulas, materiais e capas","position":1},
      {"key":"experiencia","title":"Aprovar experiência do aluno","position":2},
      {"key":"acesso","title":"Configurar autenticação e permissões","position":3},
      {"key":"pagamentos","title":"Integrar pagamentos e e-mails transacionais","position":4},
      {"key":"carga","title":"Cadastrar conteúdo piloto","position":5},
      {"key":"qa","title":"Testar matrícula, progresso e recuperação de acesso","position":6},
      {"key":"lancamento","title":"Treinar a equipe e publicar","position":7}
    ]$json$::jsonb,
    $json$[
      {"type":"production","label":"Plataforma em produção","primary":true},
      {"type":"staging","label":"Ambiente de homologação","primary":true},
      {"type":"admin","label":"Painel da plataforma","primary":true},
      {"type":"github","label":"Repositorio GitHub","primary":true},
      {"type":"drive","label":"Conteudos no Drive","primary":true},
      {"type":"documentation","label":"Documentação de operação","primary":true}
    ]$json$::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000001',
    'manutencao',
    'Manutenção',
    'Rotina recorrente de saúde, segurança e pequenas evoluções.',
    'maintenance',
    $json$[
      {"key":"backup","title":"Validar backup recente","position":0},
      {"key":"atualizacoes","title":"Aplicar atualizações e correções","position":1},
      {"key":"jornadas","title":"Verificar formulários e jornadas críticas","position":2},
      {"key":"desempenho","title":"Revisar disponibilidade e desempenho","position":3},
      {"key":"relatorio","title":"Registrar alterações e pendências","position":4}
    ]$json$::jsonb,
    $json$[
      {"type":"production","label":"Site em produção","primary":true},
      {"type":"github","label":"Repositorio GitHub","primary":true},
      {"type":"admin","label":"Painel administrativo","primary":true},
      {"type":"documentation","label":"Documentação técnica","primary":true}
    ]$json$::jsonb
  )
on conflict (id) do nothing;

insert into public.clients (
  id, workspace_id, name, company_name, status, notes
)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000001',
  'Náutica Engenharia',
  'Náutica Engenharia',
  'active',
  'Registro inicial. Contatos e dados contratuais devem ser cadastrados pela equipe.'
)
on conflict (id) do nothing;

insert into public.projects (
  id, workspace_id, client_id, board_column_id, template_id, name,
  project_type, description, next_action, blocked, published_at
)
values (
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000107',
  '00000000-0000-4000-8000-000000000203',
  'Site institucional',
  'site_institutional',
  'Site publicado e atualmente acompanhado em manutenção.',
  'Revisar desempenho no fechamento do mês.',
  false,
  now()
)
on conflict (id) do nothing;

update public.project_resources
set
  label = case resource_type
    when 'production' then 'Site publicado'
    when 'github' then 'Repositório do site'
    else label
  end,
  url = case resource_type
    when 'production' then 'https://www.nauticaengenharia.com'
    when 'github' then 'https://github.com/RafaelADSdev/Nautica-engenharia'
    else url
  end,
  status = case when resource_type in ('production', 'github') then 'active' else status end
where project_id = '00000000-0000-4000-8000-000000000302'
  and resource_type in ('production', 'github');

insert into public.project_activity (
  id, workspace_id, project_id, actor_id, action, entity_type, entity_id, metadata
)
values (
  '00000000-0000-4000-8000-000000000303',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000302',
  null,
  'project_seeded',
  'project',
  '00000000-0000-4000-8000-000000000302',
  '{"note":"Projeto inicial importado; valores e assinaturas aguardam cadastro real"}'::jsonb
)
on conflict (id) do nothing;

comment on schema private is 'Non-exposed helpers and encrypted server-side integration data.';
comment on table public.workspaces is 'Tenant boundary and workspace-wide locale settings.';
comment on table public.profiles is 'Display profile mirrored from Supabase Auth; never used as a role source.';
comment on table public.workspace_members is 'Authoritative owner/admin/member authorization mapping.';
comment on table public.clients is 'Client directory scoped to a workspace.';
comment on table public.board_columns is 'Ordered project Kanban stages.';
comment on table public.project_templates is 'Project checklist/resource blueprints instantiated on project creation.';
comment on table public.projects is 'Operational project record and Kanban card source.';
comment on table public.checklist_items is 'Project checklist items, including template-instantiated work.';
comment on table public.deadlines is 'Project dates synchronized one-way to the agency Google calendar.';
comment on table public.project_resources is 'Typed project links; credentials and passwords are forbidden here.';
comment on table public.commercial_terms is 'Restricted project revenue and payment information.';
comment on table public.subscriptions is 'Operational subscription and renewal metadata without monetary values.';
comment on table public.project_subscriptions is 'Many-to-many link between projects and shared subscriptions.';
comment on table public.subscription_financials is 'Restricted subscription costs and vault references.';
comment on table public.calendar_connections is 'Google calendar connection metadata; contains no OAuth token values.';
comment on table private.calendar_credentials is 'Server-encrypted Google OAuth token ciphertext; service role only.';
comment on table public.calendar_event_mappings is 'Idempotency mapping between local dates/renewals and Google events.';
comment on table public.calendar_sync_jobs is 'Retryable calendar synchronization queue.';
comment on table public.project_activity is 'Append-only project history written by authenticated team members.';
comment on column public.project_resources.url is 'HTTP(S) link only. Never store credentials in a URL.';
comment on column public.subscription_financials.vault_reference is 'Reference to an external vault entry; never the secret itself.';
comment on column public.subscription_financials.monthly_cost_cents is 'Normalized monthly agency cost in cents, derived from cycle and share.';
comment on column public.calendar_connections.account_email is 'Optional because calendar.app.created does not grant email identity.';
comment on column public.calendar_sync_jobs.deadline_id is 'Logical source ID retained after local deletion; intentionally not a foreign key.';
comment on column public.calendar_sync_jobs.subscription_id is 'Logical source ID retained after local deletion; intentionally not a foreign key.';

commit;
