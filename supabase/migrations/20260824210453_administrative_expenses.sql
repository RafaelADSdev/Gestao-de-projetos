-- Workspace-scoped overhead costs, kept separate from project subscriptions.
create table public.administrative_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text not null check (category in (
    'people', 'software', 'marketing', 'office', 'taxes', 'banking', 'other'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_cycle text not null default 'monthly' check (
    billing_cycle in ('monthly', 'quarterly', 'semiannual', 'annual', 'one-time')
  ),
  due_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'canceled')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index administrative_expenses_workspace_status_idx
  on public.administrative_expenses (workspace_id, status, due_date);
create index administrative_expenses_workspace_category_idx
  on public.administrative_expenses (workspace_id, category);

create trigger administrative_expenses_set_updated_at
  before update on public.administrative_expenses
  for each row execute function private.set_updated_at();

alter table public.administrative_expenses enable row level security;

create policy administrative_expenses_select_finance
  on public.administrative_expenses for select to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy administrative_expenses_insert_finance
  on public.administrative_expenses for insert to authenticated
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy administrative_expenses_update_finance
  on public.administrative_expenses for update to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])))
  with check ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));
create policy administrative_expenses_delete_finance
  on public.administrative_expenses for delete to authenticated
  using ((select private.has_workspace_role(workspace_id, array['owner', 'admin'])));

revoke all on table public.administrative_expenses from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.administrative_expenses to authenticated, service_role;

create trigger administrative_expenses_capture_audit
  after insert or update or delete on public.administrative_expenses
  for each row execute function private.capture_audit_event();

comment on table public.administrative_expenses is 'Owner/admin-only overhead costs separate from project subscriptions.';
comment on column public.administrative_expenses.amount_cents is 'Protected BRL amount; normalized to monthly equivalent in application calculations.';
