-- Jira-like collaboration attached directly to executable work item cards.

create table public.work_item_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_item_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 240),
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_item_checklist_items_workspace_id_id_key
    unique (workspace_id, id),
  constraint work_item_checklist_items_work_item_fk
    foreign key (workspace_id, work_item_id)
    references public.work_items(workspace_id, id) on delete cascade
);

create index work_item_checklist_items_card_position_idx
  on public.work_item_checklist_items (workspace_id, work_item_id, position, created_at);
create index work_item_checklist_items_completed_by_idx
  on public.work_item_checklist_items (completed_by)
  where completed_by is not null;

create table public.work_item_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_item_id uuid not null,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_item_comments_workspace_id_id_key
    unique (workspace_id, id),
  constraint work_item_comments_work_item_fk
    foreign key (workspace_id, work_item_id)
    references public.work_items(workspace_id, id) on delete cascade
);

create index work_item_comments_card_created_idx
  on public.work_item_comments (workspace_id, work_item_id, created_at);
create index work_item_comments_author_idx
  on public.work_item_comments (author_id)
  where author_id is not null;

create trigger work_item_checklist_items_set_updated_at
  before update on public.work_item_checklist_items
  for each row execute function private.set_updated_at();
create trigger work_item_comments_set_updated_at
  before update on public.work_item_comments
  for each row execute function private.set_updated_at();

alter table public.work_item_checklist_items enable row level security;
alter table public.work_item_comments enable row level security;

create policy work_item_checklist_items_select_member
  on public.work_item_checklist_items for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy work_item_checklist_items_insert_member
  on public.work_item_checklist_items for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and created_by = (select auth.uid())
  );
create policy work_item_checklist_items_update_member
  on public.work_item_checklist_items for update to authenticated
  using ((select private.is_workspace_member(workspace_id)))
  with check ((select private.is_workspace_member(workspace_id)));
create policy work_item_checklist_items_delete_member
  on public.work_item_checklist_items for delete to authenticated
  using ((select private.is_workspace_member(workspace_id)));

create policy work_item_comments_select_member
  on public.work_item_comments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy work_item_comments_insert_self
  on public.work_item_comments for insert to authenticated
  with check (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  );
create policy work_item_comments_update_self
  on public.work_item_comments for update to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  )
  with check (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  );
create policy work_item_comments_delete_self
  on public.work_item_comments for delete to authenticated
  using (
    (select private.is_workspace_member(workspace_id))
    and author_id = (select auth.uid())
  );

revoke all on table public.work_item_checklist_items
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.work_item_checklist_items
  to authenticated, service_role;

revoke all on table public.work_item_comments
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.work_item_comments
  to authenticated, service_role;

comment on table public.work_item_checklist_items is
  'Ordered checklist entries attached to an executable work item card.';
comment on table public.work_item_comments is
  'Team discussion attached to an executable work item card.';
