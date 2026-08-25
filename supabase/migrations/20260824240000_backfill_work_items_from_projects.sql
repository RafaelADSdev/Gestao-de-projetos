-- Cria cards iniciais para Epics que ainda não possuem tarefas executáveis.

insert into public.work_items (
  workspace_id,
  project_id,
  workflow_id,
  board_column_id,
  sprint_id,
  title,
  created_by,
  updated_by
)
select
  p.workspace_id,
  p.id,
  p.workflow_id,
  p.board_column_id,
  p.sprint_id,
  left(
    coalesce(nullif(btrim(p.next_action), ''), nullif(btrim(p.name), ''), 'Primeira tarefa'),
    200
  ),
  p.responsible_id,
  p.responsible_id
from public.projects p
where p.archived_at is null
  and not exists (
    select 1
    from public.work_items w
    where w.workspace_id = p.workspace_id
      and w.project_id = p.id
      and w.archived_at is null
  );

insert into public.work_item_assignees (work_item_id, workspace_id, member_id)
select w.id, w.workspace_id, p.responsible_id
from public.work_items w
join public.projects p
  on p.workspace_id = w.workspace_id
 and p.id = w.project_id
where p.responsible_id is not null
  and p.archived_at is null
  and not exists (
    select 1
    from public.work_item_assignees a
    where a.work_item_id = w.id
      and a.member_id = p.responsible_id
  );

-- Alinha sprint e etapa dos cards existentes ao planejamento atual do Epic.
update public.work_items w
set
  sprint_id = p.sprint_id,
  board_column_id = p.board_column_id,
  workflow_id = p.workflow_id,
  updated_at = now()
from public.projects p
where p.workspace_id = w.workspace_id
  and p.id = w.project_id
  and p.archived_at is null
  and w.archived_at is null
  and (
    w.sprint_id is distinct from p.sprint_id
    or w.board_column_id is distinct from p.board_column_id
    or w.workflow_id is distinct from p.workflow_id
  );
