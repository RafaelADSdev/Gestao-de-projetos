-- Distinguish manual task cards from legacy Epic mirrors (no longer shown on Kanban).

alter table public.work_items
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'epic_mirror'));

comment on column public.work_items.source is 'manual = executable task card; epic_mirror = legacy auto-sync from Epic (hidden from Kanban).';

-- Archive legacy Epic mirrors created from project next_action / name.
update public.work_items w
set
  source = 'epic_mirror',
  archived_at = coalesce(w.archived_at, now()),
  updated_at = now()
from public.projects p
where w.workspace_id = p.workspace_id
  and w.project_id = p.id
  and w.archived_at is null
  and w.source = 'manual'
  and btrim(w.title) = btrim(coalesce(nullif(p.next_action, ''), p.name));
