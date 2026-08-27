begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(110);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname = any(array[
        'workspaces', 'profiles', 'workspace_members', 'clients',
        'board_columns', 'project_templates', 'projects', 'checklist_items',
        'deadlines', 'project_resources', 'commercial_terms', 'subscriptions',
        'project_subscriptions', 'subscription_financials', 'calendar_connections',
        'calendar_event_mappings', 'calendar_sync_jobs', 'project_activity',
        'workflows', 'sprints', 'technologies', 'project_technologies',
        'audit_log'
      ])
  ),
  23::bigint,
  'all application tables exist'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relrowsecurity
      and relation.relname = any(array[
        'workspaces', 'profiles', 'workspace_members', 'clients',
        'board_columns', 'project_templates', 'projects', 'checklist_items',
        'deadlines', 'project_resources', 'commercial_terms', 'subscriptions',
        'project_subscriptions', 'subscription_financials', 'calendar_connections',
        'calendar_event_mappings', 'calendar_sync_jobs', 'project_activity',
        'workflows', 'sprints', 'technologies', 'project_technologies',
        'audit_log'
      ])
  ),
  23::bigint,
  'RLS is enabled on every public application table'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname = any(array[
        'workspaces', 'profiles', 'workspace_members', 'clients',
        'board_columns', 'project_templates', 'projects', 'checklist_items',
        'deadlines', 'project_resources', 'commercial_terms', 'subscriptions',
        'project_subscriptions', 'subscription_financials', 'calendar_connections',
        'calendar_event_mappings', 'calendar_sync_jobs', 'project_activity',
        'workflows', 'sprints', 'technologies', 'project_technologies',
        'audit_log'
      ])
      and has_table_privilege('anon', format('%I.%I', namespace.nspname, relation.relname), 'select')
  ),
  0::bigint,
  'anon has no table read access'
);

select is(
  (
    select count(*)::bigint
    from unnest(array[
      'public.workflows', 'public.sprints',
      'public.technologies', 'public.project_technologies'
    ]) as table_name
    where has_table_privilege('authenticated', table_name, 'select')
      and has_table_privilege('authenticated', table_name, 'insert')
      and has_table_privilege('authenticated', table_name, 'update')
      and has_table_privilege('authenticated', table_name, 'delete')
  ),
  4::bigint,
  'authenticated receives explicit Data API grants on every new table'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'workflows', 'sprints', 'technologies', 'project_technologies'
      ])
  ),
  16::bigint,
  'new tables define explicit select, insert, update and delete policies'
);

select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'board_columns' and column_name = 'workflow_id' and is_nullable = 'NO')
        or (table_name = 'board_columns' and column_name in ('description', 'archived_at') and is_nullable = 'YES')
        or (table_name = 'projects' and column_name = 'workflow_id' and is_nullable = 'NO')
        or (table_name = 'projects' and column_name = 'sprint_id' and is_nullable = 'YES')
      )
  ),
  5::bigint,
  'workflow, sprint and board archive columns have the expected nullability'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = any(array[
        'board_columns_workspace_workflow_fk',
        'sprints_workspace_workflow_fk',
        'projects_workflow_fk',
        'projects_board_column_workflow_fk',
        'projects_sprint_workflow_fk',
        'project_technologies_project_fk',
        'project_technologies_technology_fk'
      ])
      and contype = 'f'
  ),
  7::bigint,
  'composite tenant and workflow foreign keys are installed'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in (
        'board_columns_workspace_key_key',
        'board_columns_workspace_position_key'
      )
  )
  and (
    select count(*)
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in (
        'board_columns_workspace_workflow_id_key',
        'board_columns_workflow_key_key',
        'board_columns_workflow_position_key'
      )
      and contype = 'u'
  ) = 3,
  'board uniqueness is scoped to a workflow instead of the whole workspace'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname = any(array[
        'workflows_set_updated_at',
        'sprints_set_updated_at',
        'technologies_set_updated_at'
      ])
  ),
  3::bigint,
  'new mutable entities reuse the updated_at trigger'
);

select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audit_log'
      and column_name = any(array[
        'id', 'workspace_id', 'actor_id', 'actor_name', 'actor_email',
        'action', 'entity_type', 'entity_id', 'entity_label', 'project_id',
        'changed_fields', 'created_at'
      ])
  ),
  12::bigint,
  'audit_log exposes the complete immutable snapshot contract'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint
    where conrelid = 'public.audit_log'::regclass
      and contype = 'f'
  ),
  0::bigint,
  'audit snapshots have no destructive foreign keys'
);

select ok(
  has_table_privilege('authenticated', 'public.audit_log', 'select')
  and not has_table_privilege('authenticated', 'public.audit_log', 'insert')
  and not has_table_privilege('authenticated', 'public.audit_log', 'update')
  and not has_table_privilege('authenticated', 'public.audit_log', 'delete')
  and not has_table_privilege('authenticated', 'public.audit_log', 'truncate'),
  'authenticated has read-only audit table privileges'
);

select ok(
  has_table_privilege('service_role', 'public.audit_log', 'select')
  and not has_table_privilege('service_role', 'public.audit_log', 'insert')
  and not has_table_privilege('service_role', 'public.audit_log', 'update')
  and not has_table_privilege('service_role', 'public.audit_log', 'delete')
  and not has_table_privilege('service_role', 'public.audit_log', 'truncate'),
  'service_role also has read-only audit table privileges'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'capture_audit_event'
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
  ),
  1::bigint,
  'audit trigger function is SECURITY DEFINER with an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'private.capture_audit_event()', 'execute')
  and not has_function_privilege('authenticated', 'private.capture_audit_event()', 'execute')
  and not has_function_privilege('service_role', 'private.capture_audit_event()', 'execute'),
  'Data API roles cannot invoke the private audit trigger function'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname like '%_capture_audit'
  ),
  17::bigint,
  'all requested operational tables capture audit events automatically'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname = any(array[
        'audit_log_reject_update_delete',
        'audit_log_reject_truncate',
        'project_activity_reject_update_delete',
        'project_activity_reject_truncate'
      ])
  ),
  4::bigint,
  'both history tables reject row mutations and truncation'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint
    where conrelid = 'public.project_activity'::regclass
      and contype = 'f'
  ),
  0::bigint,
  'project_activity keeps snapshot IDs without destructive foreign keys'
);

select ok(
  has_table_privilege('authenticated', 'public.project_activity', 'select')
  and has_table_privilege('authenticated', 'public.project_activity', 'insert')
  and not has_table_privilege('authenticated', 'public.project_activity', 'update')
  and not has_table_privilege('authenticated', 'public.project_activity', 'delete')
  and not has_table_privilege('authenticated', 'public.project_activity', 'truncate')
  and has_table_privilege('service_role', 'public.project_activity', 'select')
  and has_table_privilege('service_role', 'public.project_activity', 'insert')
  and not has_table_privilege('service_role', 'public.project_activity', 'update')
  and not has_table_privilege('service_role', 'public.project_activity', 'delete')
  and not has_table_privilege('service_role', 'public.project_activity', 'truncate'),
  'project_activity is append-only for authenticated and service roles'
);

select ok(
  has_table_privilege('authenticated', 'public.clients', 'delete')
  and has_table_privilege('authenticated', 'public.projects', 'delete')
  and (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and policyname in ('clients_delete_member', 'projects_delete_member')
      and cmd = 'DELETE'
  ) = 2,
  'clients and projects expose member-scoped DELETE operations'
);

select is(
  (select count(*) from public.workspaces where id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'baseline workspace is seeded'
);

select is(
  (
    select count(*)
    from public.workflows
    where id = '00000000-0000-4000-8000-000000000301'
      and workspace_id = '00000000-0000-4000-8000-000000000001'
      and key = 'operacao-padrao'
      and is_default
  ),
  1::bigint,
  'baseline workspace receives the stable default workflow'
);

select is(
  (
    select count(*)
    from public.board_columns
    where workspace_id = '00000000-0000-4000-8000-000000000001'
      and workflow_id = '00000000-0000-4000-8000-000000000301'
  ),
  7::bigint,
  'seven Kanban columns are migrated to the default workflow'
);

select is(
  (select count(*) from public.project_templates where workspace_id = '00000000-0000-4000-8000-000000000001'),
  3::bigint,
  'three project templates are seeded'
);

select is(
  (
    select count(*)
    from public.projects
    where id = '00000000-0000-4000-8000-000000000302'
      and board_column_id = '00000000-0000-4000-8000-000000000107'
      and workflow_id = '00000000-0000-4000-8000-000000000301'
      and sprint_id is null
      and published_at is not null
  ),
  1::bigint,
  'Nautica project is seeded as published maintenance'
);

select is(
  (select count(*) from public.checklist_items where project_id = '00000000-0000-4000-8000-000000000302'),
  5::bigint,
  'maintenance template instantiated its checklist'
);

select is(
  (select count(*) from public.project_resources where project_id = '00000000-0000-4000-8000-000000000302'),
  4::bigint,
  'maintenance template instantiated resource slots'
);

select is(
  (
    select count(*)
    from public.project_resources
    where project_id = '00000000-0000-4000-8000-000000000302'
      and status = 'active'
      and (
        (resource_type = 'production' and url = 'https://www.nauticaengenharia.com')
        or (resource_type = 'github' and url = 'https://github.com/RafaelADSdev/Nautica-engenharia')
      )
  ),
  2::bigint,
  'Nautica production and GitHub links are seeded with verified URLs'
);

select is(
  (
    select count(*)
    from public.technologies
    where workspace_id = '00000000-0000-4000-8000-000000000001'
      and name = any(array[
        'Next.js', 'TypeScript', 'Tailwind CSS', 'Supabase', 'Vercel', 'Figma'
      ])
  ),
  6::bigint,
  'baseline technology catalog contains the six requested entries'
);

select is(
  (
    select count(*)
    from public.project_technologies
    where project_id = '00000000-0000-4000-8000-000000000302'
  ),
  0::bigint,
  'Nautica receives no technology links without verified facts'
);

select ok(
  not has_table_privilege('authenticated', 'private.calendar_credentials', 'select'),
  'authenticated cannot read encrypted calendar credentials'
);

select ok(
  not has_function_privilege('authenticated', 'public.get_calendar_credentials(uuid)', 'execute'),
  'authenticated cannot call the credential reader RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.upsert_calendar_credentials(uuid,text,text,text)',
    'execute'
  ),
  'authenticated cannot call the credential writer RPC'
);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'member@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'outsider@example.test');

insert into public.workspaces (id, name, slug)
values ('20000000-0000-4000-8000-000000000001', 'Other Workspace', 'other-workspace');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner'),
  ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'owner');

insert into public.workflows (
  id, workspace_id, name, key, sprint_enabled, is_default
)
values
  (
    '60000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000001',
    'Delivery',
    'delivery',
    true,
    false
  ),
  (
    '60000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000001',
    'Other default',
    'operacao-padrao',
    true,
    true
  );

insert into public.sprints (
  id, workspace_id, workflow_id, name, status, start_date, end_date
)
values
  (
    '60000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000301',
    'Baseline sprint',
    'active',
    current_date,
    current_date + 14
  ),
  (
    '60000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000101',
    'Delivery sprint',
    'planned',
    current_date + 15,
    current_date + 29
  ),
  (
    '60000000-0000-4000-8000-000000000203',
    '20000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000102',
    'Other sprint',
    'active',
    current_date,
    current_date + 14
  );

insert into public.technologies (
  id, workspace_id, name, category, color
)
values (
  '60000000-0000-4000-8000-000000000301',
  '20000000-0000-4000-8000-000000000001',
  'Other technology',
  'other',
  '#64748B'
);

insert into public.commercial_terms (
  workspace_id, project_id, contract_value_cents, monthly_revenue_cents,
  maintenance_billing_cycle, maintenance_status
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000302',
  100000,
  10000,
  'monthly',
  'active'
);

insert into public.subscriptions (
  id, workspace_id, service_name, category, billing_cycle, renewal_date, payer
)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'Example Hosting',
  'hosting',
  'annual',
  current_date + 20,
  'agency'
);

insert into public.subscription_financials (
  workspace_id, subscription_id, amount_cents, billing_cycle, agency_share_percent
)
values (
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  120000,
  'annual',
  100
);

insert into public.calendar_connections (
  id, workspace_id, calendar_id, status, connected_by, connected_at
)
values (
  '40000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'agency-deadlines@example.test',
  'connected',
  '10000000-0000-4000-8000-000000000001',
  now()
);

select lives_ok(
  $$
    insert into public.board_columns (
      id, workspace_id, workflow_id, name, key, position
    ) values (
      '60000000-0000-4000-8000-000000000401',
      '00000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000101',
      'Entrada delivery',
      'entrada',
      0
    )
  $$,
  'the same board key and position can be reused in another workflow'
);

select throws_ok(
  $$
    insert into public.board_columns (
      id, workspace_id, workflow_id, name, key, position
    ) values (
      '60000000-0000-4000-8000-000000000402',
      '00000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000101',
      'Duplicate delivery entry',
      'entrada',
      0
    )
  $$,
  '23505',
  null,
  'board key and position remain unique inside one workflow'
);

select throws_ok(
  $$
    update public.projects
    set workflow_id = '60000000-0000-4000-8000-000000000101'
    where id = '00000000-0000-4000-8000-000000000302'
  $$,
  '23503',
  null,
  'a project cannot point to a board column from another workflow'
);

select throws_ok(
  $$
    update public.projects
    set sprint_id = '60000000-0000-4000-8000-000000000202'
    where id = '00000000-0000-4000-8000-000000000302'
  $$,
  '23503',
  null,
  'a project cannot point to a sprint from another workflow'
);

select throws_ok(
  $$
    insert into public.project_technologies (
      workspace_id, project_id, technology_id
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      '60000000-0000-4000-8000-000000000301'
    )
  $$,
  '23503',
  null,
  'a project cannot link a technology from another workspace'
);

select is(
  (select count(*) from public.profiles where id::text like '10000000-%'),
  3::bigint,
  'Auth trigger creates display profiles'
);

select ok(
  exists (
    select 1
    from public.audit_log
    where actor_id is null
      and actor_name = 'Sistema'
      and action = 'created'
  ),
  'service and migration operations receive the Sistema actor snapshot'
);

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';

select is(
  (select count(*) from public.projects),
  1::bigint,
  'member sees operational projects in their workspace'
);

select is(
  (select count(*) from public.workflows),
  2::bigint,
  'member reads only workflows in their workspace'
);

select is(
  (select count(*) from public.sprints),
  2::bigint,
  'member reads only sprints in their workspace'
);

select is(
  (select count(*) from public.technologies),
  6::bigint,
  'member reads only technologies in their workspace'
);

select throws_ok(
  $$
    insert into public.workflows (
      id, workspace_id, name, key
    ) values (
      '60000000-0000-4000-8000-000000000501',
      '00000000-0000-4000-8000-000000000001',
      'Member workflow',
      'member-workflow'
    )
  $$,
  '42501',
  null,
  'member cannot create an administrative workflow'
);

select throws_ok(
  $$
    insert into public.sprints (
      id, workspace_id, workflow_id, name, start_date, end_date
    ) values (
      '60000000-0000-4000-8000-000000000502',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000301',
      'Member sprint',
      current_date,
      current_date + 7
    )
  $$,
  '42501',
  null,
  'member cannot create an administrative sprint'
);

select throws_ok(
  $$
    insert into public.technologies (
      id, workspace_id, name, category, color
    ) values (
      '60000000-0000-4000-8000-000000000503',
      '00000000-0000-4000-8000-000000000001',
      'Member technology',
      'other',
      '#64748B'
    )
  $$,
  '42501',
  null,
  'member cannot create an administrative technology entry'
);

update public.workflows
set name = 'Member changed workflow'
where id = '00000000-0000-4000-8000-000000000301';

select is(
  (
    select name
    from public.workflows
    where id = '00000000-0000-4000-8000-000000000301'
  ),
  'Operação padrão'::text,
  'member cannot update an administrative workflow'
);

delete from public.technologies
where id = '00000000-0000-4000-8000-000000000401';

select is(
  (
    select count(*)
    from public.technologies
    where id = '00000000-0000-4000-8000-000000000401'
  ),
  1::bigint,
  'member cannot delete an administrative technology entry'
);

select lives_ok(
  $$
    insert into public.project_technologies (
      id, workspace_id, project_id, technology_id
    ) values (
      '60000000-0000-4000-8000-000000000504',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      '00000000-0000-4000-8000-000000000401'
    )
  $$,
  'member can attach a catalog technology to an operational project'
);

select lives_ok(
  $$
    delete from public.project_technologies
    where id = '60000000-0000-4000-8000-000000000504'
  $$,
  'member can detach a technology from an operational project'
);

select throws_ok(
  $$
    insert into public.project_technologies (
      workspace_id, project_id, technology_id
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      '60000000-0000-4000-8000-000000000301'
    )
  $$,
  '42501',
  null,
  'member cannot attach technologies through another workspace'
);

select is(
  (select count(*) from public.commercial_terms),
  0::bigint,
  'member cannot read project financial values'
);

select is(
  (select count(*) from public.subscription_financials),
  0::bigint,
  'member cannot read subscription costs or vault references'
);

select is(
  (select count(*) from public.calendar_connections),
  0::bigint,
  'member cannot inspect workspace integrations'
);

select lives_ok(
  $$
    insert into public.clients (workspace_id, name)
    values ('00000000-0000-4000-8000-000000000001', 'Member Client')
  $$,
  'member can create operational data in their workspace'
);

select is(
  (
    select count(*)
    from public.audit_log
    where workspace_id = '00000000-0000-4000-8000-000000000001'
      and actor_id = '10000000-0000-4000-8000-000000000002'
      and actor_name = 'member@example.test'
      and actor_email = 'member@example.test'
      and action = 'created'
      and entity_type = 'clients'
      and entity_label = 'Member Client'
      and changed_fields @> array['name']::text[]
  ),
  1::bigint,
  'created audit snapshots the authenticated actor and entity label'
);

select lives_ok(
  $$
    update public.clients
    set name = 'Member Client Updated'
    where name = 'Member Client'
  $$,
  'member can update a client while the trigger records the change'
);

select is(
  (
    select count(*)
    from public.audit_log
    where actor_id = '10000000-0000-4000-8000-000000000002'
      and action = 'updated'
      and entity_type = 'clients'
      and entity_label = 'Member Client Updated'
      and changed_fields @> array['name']::text[]
      and not exists (
        select 1
        from unnest(changed_fields) as changed(field_name)
        where changed.field_name ~* '(token|secret|password|credential|cipher|vault|amount|revenue|cost|price|value)'
      )
  ),
  1::bigint,
  'updated audit contains only safe changed-field names'
);

select lives_ok(
  $$
    delete from public.clients
    where name = 'Member Client Updated'
  $$,
  'member can delete an unreferenced client'
);

select is(
  (
    select count(*)
    from public.audit_log
    where actor_id = '10000000-0000-4000-8000-000000000002'
      and action = 'deleted'
      and entity_type = 'clients'
      and entity_label = 'Member Client Updated'
  ),
  1::bigint,
  'deleted client remains represented in the immutable audit log'
);

select throws_ok(
  $$
    insert into public.clients (workspace_id, name)
    values ('20000000-0000-4000-8000-000000000001', 'Cross Tenant Client')
  $$,
  '42501',
  null,
  'member cannot create rows in another workspace'
);

insert into public.clients (id, workspace_id, name)
values (
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'History fixture client'
);

insert into public.projects (
  id, workspace_id, client_id, workflow_id, board_column_id, name
)
values (
  '70000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101',
  'History fixture project'
);

insert into public.project_activity (
  id, workspace_id, project_id, actor_id, action
)
values (
  '70000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  'fixture_created'
);

select lives_ok(
  $$
    delete from public.projects
    where id = '70000000-0000-4000-8000-000000000002'
  $$,
  'member can delete a project through the new policy and grant'
);

select is(
  (
    select count(*)
    from public.project_activity
    where id = '70000000-0000-4000-8000-000000000003'
      and project_id = '70000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'project_activity survives deletion of its project'
);

select is(
  (
    select count(*)
    from public.audit_log
    where action = 'deleted'
      and entity_type = 'projects'
      and entity_id = '70000000-0000-4000-8000-000000000002'
      and project_id = '70000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'project deletion remains discoverable in the global audit log'
);

select throws_ok(
  $$
    insert into public.audit_log (
      workspace_id, actor_name, action, entity_type, entity_id, entity_label
    ) values (
      '00000000-0000-4000-8000-000000000001',
      'Forged actor',
      'created',
      'clients',
      'forged',
      'Forged audit entry'
    )
  $$,
  '42501',
  null,
  'authenticated application role cannot forge audit rows'
);

select throws_ok(
  $$
    update public.project_activity
    set action = 'tampered'
    where id = '70000000-0000-4000-8000-000000000003'
  $$,
  '42501',
  null,
  'authenticated application role cannot mutate project history'
);

select lives_ok(
  $$
    insert into public.deadlines (
      id, workspace_id, project_id, title, due_date, sync_enabled
    ) values (
      '50000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      'Test delivery',
      current_date + 5,
      true
    )
  $$,
  'member can create a deadline and enqueue calendar sync'
);

select is(
  (select count(*) from public.calendar_sync_jobs),
  0::bigint,
  'member cannot inspect calendar jobs'
);

select throws_ok(
  $$
    insert into public.project_activity (
      workspace_id, project_id, actor_id, action
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      '10000000-0000-4000-8000-000000000001',
      'spoofed_activity'
    )
  $$,
  '42501',
  null,
  'member cannot spoof another activity actor'
);

select lives_ok(
  $$
    insert into public.project_activity (
      workspace_id, project_id, actor_id, action
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000302',
      '10000000-0000-4000-8000-000000000002',
      'deadline_created'
    )
  $$,
  'member can append truthful project activity'
);

select is(
  (select count(*) from public.profiles),
  2::bigint,
  'member sees only profiles shared through a workspace'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select is(
  (select count(*) from public.commercial_terms),
  1::bigint,
  'owner can read commercial terms'
);

select is(
  (select count(*) from public.subscription_financials),
  1::bigint,
  'owner can read subscription financials'
);

select is(
  (select count(*) from public.calendar_connections),
  1::bigint,
  'owner can inspect calendar integration metadata'
);

select is(
  (
    select count(*)
    from public.calendar_sync_jobs
    where deadline_id = '50000000-0000-4000-8000-000000000001'
      and operation = 'upsert'
      and status = 'pending'
  ),
  1::bigint,
  'deadline save creates one deduplicated pending job'
);

select is(
  (
    select count(*)
    from public.calendar_sync_jobs
    where subscription_id = '30000000-0000-4000-8000-000000000001'
      and operation = 'upsert'
      and status = 'pending'
  ),
  1::bigint,
  'connecting a calendar backfills active renewals'
);

select results_eq(
  $$
    select monthly_cost_cents
    from public.subscription_financials
    where subscription_id = '30000000-0000-4000-8000-000000000001'
  $$,
  $$ values (10000.00::numeric) $$,
  'annual costs are normalized to their monthly equivalent'
);

select lives_ok(
  $$
    update public.commercial_terms
    set monthly_revenue_cents = 15000
    where project_id = '00000000-0000-4000-8000-000000000302'
  $$,
  'owner can update financial values'
);

select is(
  (
    select count(*)
    from public.audit_log
    where action = 'updated'
      and entity_type = 'commercial_terms'
      and project_id = '00000000-0000-4000-8000-000000000302'
      and not changed_fields && array[
        'contract_value_cents',
        'monthly_revenue_cents',
        'amount_cents',
        'monthly_cost_cents',
        'vault_reference'
      ]::text[]
  ),
  1::bigint,
  'financial audit records the event without sensitive field names or values'
);

reset role;

select throws_ok(
  $$
    update public.audit_log
    set entity_label = 'Tampered audit'
    where id = (select id from public.audit_log order by created_at limit 1)
  $$,
  '55000',
  null,
  'audit_log rejects UPDATE even for the database owner'
);

select throws_ok(
  $$
    delete from public.audit_log
    where id = (select id from public.audit_log order by created_at limit 1)
  $$,
  '55000',
  null,
  'audit_log rejects DELETE even for the database owner'
);

select throws_ok(
  $$ truncate table public.audit_log $$,
  '55000',
  null,
  'audit_log rejects TRUNCATE even for the database owner'
);

select throws_ok(
  $$
    update public.project_activity
    set action = 'tampered_by_owner'
    where id = '70000000-0000-4000-8000-000000000003'
  $$,
  '55000',
  null,
  'project_activity rejects UPDATE even for the database owner'
);

select throws_ok(
  $$
    delete from public.project_activity
    where id = '70000000-0000-4000-8000-000000000003'
  $$,
  '55000',
  null,
  'project_activity rejects DELETE even for the database owner'
);

select throws_ok(
  $$ truncate table public.project_activity $$,
  '55000',
  null,
  'project_activity rejects TRUNCATE even for the database owner'
);

set local role service_role;
set local request.jwt.claim.sub = '';

select throws_ok(
  $$
    update public.audit_log
    set entity_label = 'Service tamper'
    where id = (select id from public.audit_log order by created_at limit 1)
  $$,
  '42501',
  null,
  'service_role cannot mutate audit_log despite bypassing RLS'
);

select throws_ok(
  $$
    update public.project_activity
    set action = 'service_tamper'
    where id = '70000000-0000-4000-8000-000000000003'
  $$,
  '42501',
  null,
  'service_role cannot mutate project_activity despite bypassing RLS'
);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';

select is(
  (select count(*) from public.projects),
  0::bigint,
  'another workspace cannot read projects'
);

select is(
  (select count(*) from public.workflows),
  1::bigint,
  'another workspace sees only its workflow'
);

select is(
  (select count(*) from public.sprints),
  1::bigint,
  'another workspace sees only its sprint'
);

select is(
  (select count(*) from public.technologies),
  1::bigint,
  'another workspace sees only its technology catalog'
);

select ok(
  (select count(*) from public.audit_log) > 0
  and not exists (
    select 1
    from public.audit_log
    where workspace_id <> '20000000-0000-4000-8000-000000000001'
  ),
  'audit RLS exposes only the current member workspace'
);

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'another workspace sees only its own colleague set'
);

reset role;

select is(
  (
    select count(*)::bigint
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_members'
      and column_name = any(array['name', 'avatar_url', 'pin_changed_at'])
  ),
  3::bigint,
  'workspace members expose only non-secret access and avatar metadata'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'avatars'
      and public
      and file_size_limit = 2097152
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ),
  'avatar bucket is public for reads and restricted to supported images'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = any(array[
        'avatars_select_own', 'avatars_insert_own',
        'avatars_update_own', 'avatars_delete_own'
      ])
  ),
  4::bigint,
  'avatar object operations have explicit owner-scoped policies'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'can_manage_profile'
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
  ),
  'profile management helper is privileged with an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'private.can_manage_profile(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.can_manage_profile(uuid)', 'execute'),
  'only authenticated application roles can use the profile policy helper'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'mark_own_pin_changed'
      and procedure.prosecdef
      and procedure.proconfig @> array['search_path=""']::text[]
  ),
  'PIN audit marker is privileged with an empty search path'
);

select ok(
  has_function_privilege('authenticated', 'public.mark_own_pin_changed()', 'execute')
  and not has_function_privilege('anon', 'public.mark_own_pin_changed()', 'execute')
  and not has_function_privilege('service_role', 'public.mark_own_pin_changed()', 'execute'),
  'only the signed-in user can invoke the PIN audit marker through the Data API'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_workspace_owner'
  ),
  1::bigint,
  'owners receive an explicit policy to update colleague profiles'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_sync_member_snapshots'
      and not tgisinternal
  ),
  1::bigint,
  'profile changes synchronize readable snapshots into immutable access audit events'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname = any(array[
        'work_item_checklist_items', 'work_item_comments'
      ])
  ),
  2::bigint,
  'work item collaboration tables exist'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relrowsecurity
      and relation.relname = any(array[
        'work_item_checklist_items', 'work_item_comments'
      ])
  ),
  2::bigint,
  'RLS is enabled on work item collaboration tables'
);

select is(
  (
    select count(*)::bigint
    from unnest(array[
      'public.work_item_checklist_items', 'public.work_item_comments'
    ]) as table_name
    where has_table_privilege('anon', table_name, 'select')
  ),
  0::bigint,
  'anon cannot read work item collaboration data'
);

select is(
  (
    select count(*)::bigint
    from unnest(array[
      'public.work_item_checklist_items', 'public.work_item_comments'
    ]) as table_name
    where has_table_privilege('authenticated', table_name, 'select')
      and has_table_privilege('authenticated', table_name, 'insert')
      and has_table_privilege('authenticated', table_name, 'update')
      and has_table_privilege('authenticated', table_name, 'delete')
  ),
  2::bigint,
  'authenticated receives explicit collaboration Data API grants'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'work_item_checklist_items', 'work_item_comments'
      ])
  ),
  8::bigint,
  'collaboration tables define explicit CRUD policies'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
      and conname = any(array[
        'work_item_checklist_items_work_item_fk',
        'work_item_comments_work_item_fk'
      ])
      and contype = 'f'
  ),
  2::bigint,
  'collaboration rows use tenant-scoped work item foreign keys'
);

select is(
  (
    select count(*)::bigint
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname = any(array[
        'work_item_checklist_items_set_updated_at',
        'work_item_comments_set_updated_at'
      ])
  ),
  2::bigint,
  'collaboration entities reuse the updated_at trigger'
);

select * from finish();
rollback;
