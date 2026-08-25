import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarRange,
  Columns3,
  Inbox,
  ListFilter,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { WorkItemBacklogBoard } from "@/components/projects/work-item-backlog-board";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildWorkItemCards } from "@/lib/data/view-models";

type BacklogFilters = {
  q?: string;
  responsavel?: string;
  fluxo?: string;
};

function backlogHref(workflowId: string) {
  return `/backlog?fluxo=${workflowId}`;
}

export default async function BacklogPage({ searchParams }: { searchParams: Promise<BacklogFilters> }) {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const filters = await searchParams;
  const workflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const sprintWorkflows = workflows.filter((workflow) => workflow.sprintEnabled);

  if (!workflows.length) {
    return (
      <div className="configuration-empty panel">
        <span><Inbox size={24} /></span>
        <h1>Crie o primeiro fluxo de trabalho</h1>
        <p>O backlog depende de um fluxo com sprints habilitadas para organizar o planejamento.</p>
        {(context.role === "owner" || context.role === "admin") && (
          <Link className="button button-primary" href="/configuracoes/fluxos">Configurar fluxo</Link>
        )}
      </div>
    );
  }

  const preferredWorkflow = sprintWorkflows.find((item) => item.id === filters.fluxo)
    ?? sprintWorkflows.find((item) => item.isDefault)
    ?? sprintWorkflows[0]
    ?? workflows.find((item) => item.id === filters.fluxo)
    ?? workflows.find((item) => item.isDefault)
    ?? workflows[0];

  if (!preferredWorkflow) {
    redirect("/configuracoes/fluxos");
  }

  const workflow = preferredWorkflow;
  const workflowSprints = data.sprints
    .filter((sprint) => sprint.workflowId === workflow.id)
    .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""));
  const query = filters.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const workflowCards = buildWorkItemCards(data, { workflowId: workflow.id });
  const cards = workflowCards.filter((card) => {
    const searchable = `${card.title} ${card.epicName} ${card.clientName} ${card.description ?? ""}`.toLocaleLowerCase("pt-BR");
    const matchesText = !query || searchable.includes(query);
    const matchesAssignee = !filters.responsavel || card.assignees.some((assignee) => assignee.id === filters.responsavel);
    return matchesText && matchesAssignee;
  });
  const backlogCount = workflowCards.filter((card) => card.sprintId === null).length;
  const totalBacklog = sprintWorkflows.reduce((count, item) => {
    return count + buildWorkItemCards(data, { workflowId: item.id }).filter((card) => card.sprintId === null).length;
  }, 0);
  const epics = data.projects
    .filter((project) => project.workflowId === workflow.id && project.archivedAt === null)
    .map((project) => {
      const client = data.clients.find((item) => item.id === project.clientId);
      return { id: project.id, name: project.name, clientName: client?.name ?? "Cliente não informado" };
    });
  const members = data.members.filter((member) => member.active).map((member) => ({ id: member.id, name: member.name }));
  const canAdminister = context.role === "owner" || context.role === "admin";

  return (
    <>
      <header className="page-heading page-heading-actions board-page-heading">
        <div>
          <span className="eyebrow">Planejamento do trabalho</span>
          <h1>Backlog</h1>
          <p>Organize cards por sprint. Cada projeto é um Epic; os cards são as tarefas executáveis.</p>
        </div>
        <div className="heading-button-group">
          <Link href={`/quadro?fluxo=${workflow.id}`} className="button button-secondary"><Columns3 size={16} /> Abrir Kanban</Link>
          {canAdminister && <Link href="/configuracoes/fluxos" className="button button-secondary"><Settings2 size={16} /> Configurar</Link>}
          <Link href="/projetos/novo" className="button button-secondary"><Plus size={17} /> Novo Epic</Link>
        </div>
      </header>

      <section className="compact-stats project-stats" aria-label="Resumo do backlog">
        <div><strong>{totalBacklog}</strong><span>cards no backlog</span></div>
        <div><strong>{cards.length}</strong><span>neste fluxo</span></div>
        <div><strong>{workflowSprints.filter((sprint) => sprint.status !== "completed").length}</strong><span>sprints abertas</span></div>
        <div><strong>{epics.length}</strong><span>epics ativos</span></div>
      </section>

      <section className="workflow-switcher panel" aria-label="Fluxos de trabalho">
        <div className="workflow-switcher-title"><Inbox size={17} /><span>Fluxos</span></div>
        <nav>
          {workflows.map((item) => (
            <Link
              className={item.id === workflow.id ? "active" : ""}
              aria-current={item.id === workflow.id ? "page" : undefined}
              href={backlogHref(item.id)}
              key={item.id}
            >
              {item.name}
              {item.sprintEnabled ? <CalendarRange size={13} /> : null}
            </Link>
          ))}
        </nav>
      </section>

      <section className="board-context-bar">
        <div>
          <span className="eyebrow">{workflow.name}</span>
          <h2>{workflow.sprintEnabled ? "Planejamento por sprint" : "Fluxo contínuo"}</h2>
          <p>
            {workflow.sprintEnabled
              ? "Arraste cards do backlog para uma sprint ou crie novos cards vinculados a um Epic."
              : "Este fluxo não usa backlog. Ative sprints nas configurações para separar planejamento e execução."}
          </p>
        </div>
        {workflow.sprintEnabled && (
          <nav className="board-view-tabs" aria-label="Alternar planejamento">
            <Link href={`/quadro?fluxo=${workflow.id}`}><Columns3 size={14} /> Quadro</Link>
            <Link className="active" href={backlogHref(workflow.id)}><Inbox size={14} /> Backlog <span>{backlogCount}</span></Link>
          </nav>
        )}
      </section>

      {!workflow.sprintEnabled ? (
        <section className="panel backlog-disabled-panel">
          <div className="info-callout">
            <CalendarRange size={17} />
            <p>
              <strong>Sprints desativadas neste fluxo.</strong>{" "}
              {canAdminister
                ? "Ative “Usar sprints” em Configurações → Fluxos para liberar o backlog."
                : "Peça a um administrador para ativar sprints neste fluxo."}
            </p>
          </div>
          {canAdminister && (
            <Link className="button button-primary" href={`/configuracoes/fluxos?fluxo=${workflow.id}`}>
              Configurar fluxo
            </Link>
          )}
        </section>
      ) : (
        <>
          <form className="toolbar board-toolbar" action="/backlog">
            <input type="hidden" name="fluxo" value={workflow.id} />
            <label className="toolbar-search">
              <Search size={16} />
              <span className="sr-only">Buscar no backlog</span>
              <input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar card, Epic ou cliente…" />
            </label>
            <label className="sr-only" htmlFor="backlog-owner">Responsável</label>
            <select className="toolbar-button filter-select" id="backlog-owner" name="responsavel" defaultValue={filters.responsavel ?? ""}>
              <option value="">Todos os responsáveis</option>
              {members.map((member) => (
                <option value={member.id} key={member.id}>{member.name}</option>
              ))}
            </select>
            <button className="button button-secondary" type="submit"><ListFilter size={15} /> Aplicar</button>
          </form>

          <WorkItemBacklogBoard
            key={`${workflow.id}:${filters.q ?? ""}:${filters.responsavel ?? ""}`}
            initialCards={cards}
            sprints={workflowSprints}
            epics={epics}
            members={members}
          />
        </>
      )}
    </>
  );
}
