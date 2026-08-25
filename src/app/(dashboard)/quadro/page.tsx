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
import { BoardCreateCardButton } from "@/components/projects/board-create-card-button";
import { WorkItemBacklogBoard } from "@/components/projects/work-item-backlog-board";
import { WorkItemKanban } from "@/components/projects/work-item-kanban";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildBoardStages, buildWorkItemCards } from "@/lib/data/view-models";

type BoardFilters = {
  q?: string;
  responsavel?: string;
  fluxo?: string;
  sprint?: string;
  visao?: "quadro" | "backlog";
};

function boardHref(workflowId: string, options?: { sprintId?: string | null; visao?: "quadro" | "backlog" }) {
  const params = new URLSearchParams({ fluxo: workflowId });
  if (options?.sprintId) params.set("sprint", options.sprintId);
  if (options?.visao === "backlog") params.set("visao", "backlog");
  return `/quadro?${params.toString()}`;
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<BoardFilters> }) {
  const context = await requireAuthContext();
  const filters = await searchParams;
  const isBacklogView = filters.visao === "backlog";

  const { data } = await loadAgencyData(context);
  const workflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const sprintWorkflows = workflows.filter((workflow) => workflow.sprintEnabled);

  if (!workflows.length) {
    return (
      <div className="configuration-empty panel">
        <span><Columns3 size={24} /></span>
        <h1>Crie o primeiro fluxo de trabalho</h1>
        <p>O Kanban precisa de um fluxo e ao menos uma etapa para organizar os cards.</p>
        {(context.role === "owner" || context.role === "admin") && (
          <Link className="button button-primary" href="/configuracoes/fluxos">Configurar fluxo</Link>
        )}
      </div>
    );
  }

  const workflow = workflows.find((item) => item.id === filters.fluxo)
    ?? sprintWorkflows.find((item) => item.isDefault)
    ?? sprintWorkflows[0]
    ?? workflows.find((item) => item.isDefault)
    ?? workflows[0];

  if (!workflow) {
    redirect("/configuracoes/fluxos");
  }

  const workflowSprints = data.sprints
    .filter((sprint) => sprint.workflowId === workflow.id)
    .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""));
  const openSprints = workflowSprints.filter((sprint) => sprint.status !== "completed");
  const sprintFilter = filters.sprint ?? "todos";
  const selectedSprint = sprintFilter === "todos"
    ? null
    : workflowSprints.find((sprint) => sprint.id === sprintFilter) ?? null;
  const query = filters.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const workflowCards = buildWorkItemCards(data, { workflowId: workflow.id });
  const backlogCount = workflowCards.filter((card) => card.sprintId === null).length;
  const filteredCards = workflowCards.filter((card) => {
    const searchable = `${card.title} ${card.epicName} ${card.clientName} ${card.description ?? ""}`.toLocaleLowerCase("pt-BR");
    const matchesText = !query || searchable.includes(query);
    const matchesAssignee = !filters.responsavel || card.assignees.some((assignee) => assignee.id === filters.responsavel);
    return matchesText && matchesAssignee;
  });
  const kanbanCards = workflow.sprintEnabled
    ? filteredCards.filter((card) => {
      if (sprintFilter === "todos") return card.sprintId !== null;
      return selectedSprint ? card.sprintId === selectedSprint.id : false;
    })
    : filteredCards;
  const stages = buildBoardStages(data, workflow.id);
  const epics = data.projects
    .filter((project) => project.workflowId === workflow.id && project.archivedAt === null)
    .map((project) => {
      const client = data.clients.find((item) => item.id === project.clientId);
      return { id: project.id, name: project.name, clientName: client?.name ?? "Cliente não informado" };
    });
  const members = data.members
    .filter((member) => member.active)
    .map((member) => ({ id: member.id, name: member.name, avatarUrl: member.avatarUrl }));
  const sprintOptions = openSprints.map((sprint) => ({ id: sprint.id, name: sprint.name }));
  const defaultSprintId = isBacklogView ? null : (selectedSprint?.id ?? null);
  const canAdminister = context.role === "owner" || context.role === "admin";

  return (
    <>
      <header className="page-heading page-heading-actions board-page-heading">
        <div>
          <span className="eyebrow">{isBacklogView ? "Planejamento do trabalho" : "Execução do trabalho"}</span>
          <h1>{isBacklogView ? "Backlog" : "Kanban"}</h1>
          <p>
            {isBacklogView
              ? "Organize cards por sprint. Cada projeto é um Epic; os cards são as tarefas executáveis."
              : "Execute os cards da sprint por etapa. Cada card pertence a um Epic (projeto)."}
          </p>
        </div>
        <div className="heading-button-group">
          {canAdminister && <Link href="/configuracoes/fluxos" className="button button-secondary"><Settings2 size={16} /> Configurar</Link>}
          <BoardCreateCardButton
            epics={epics}
            members={members}
            sprints={sprintOptions}
            defaultSprintId={defaultSprintId}
          />
          <Link href="/projetos/novo" className="button button-secondary"><Plus size={17} /> Novo Epic</Link>
        </div>
      </header>

      <section className="workflow-switcher panel" aria-label="Fluxos de trabalho">
        <div className="workflow-switcher-title"><Columns3 size={17} /><span>Fluxos</span></div>
        <nav>
          {workflows.map((item) => (
            <Link
              className={item.id === workflow.id ? "active" : ""}
              aria-current={item.id === workflow.id ? "page" : undefined}
              href={boardHref(item.id, { visao: isBacklogView ? "backlog" : undefined, sprintId: sprintFilter !== "todos" ? sprintFilter : undefined })}
              key={item.id}
            >
              {item.name}
              {item.sprintEnabled && <CalendarRange size={13} />}
            </Link>
          ))}
        </nav>
      </section>

      <section className="board-context-bar">
        <div>
          <span className="eyebrow">{workflow.name}</span>
          <h2>{isBacklogView ? "Planejamento por sprint" : (selectedSprint?.name ?? "Todas as sprints")}</h2>
          <p>
            {isBacklogView
              ? "Arraste cards do backlog para uma sprint ou crie novos cards vinculados a um Epic."
              : (selectedSprint?.goal ?? workflow.description ?? "Visualize e mova os cards entre as etapas.")}
          </p>
        </div>
        {workflow.sprintEnabled && (
          <nav className="board-view-tabs" aria-label="Alternar visualização">
            <Link className={isBacklogView ? "" : "active"} href={boardHref(workflow.id, { sprintId: sprintFilter !== "todos" ? sprintFilter : undefined })}>
              <Columns3 size={14} /> Quadro
            </Link>
            <Link className={isBacklogView ? "active" : ""} href={boardHref(workflow.id, { visao: "backlog" })}>
              <Inbox size={14} /> Backlog <span>{backlogCount}</span>
            </Link>
          </nav>
        )}
      </section>

      {!workflow.sprintEnabled && isBacklogView ? (
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
          <form className="toolbar board-toolbar" action="/quadro">
            <input type="hidden" name="fluxo" value={workflow.id} />
            {isBacklogView && <input type="hidden" name="visao" value="backlog" />}
            <label className="toolbar-search">
              <Search size={16} />
              <span className="sr-only">Buscar no quadro</span>
              <input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar card, Epic ou cliente…" />
            </label>
            {workflow.sprintEnabled && !isBacklogView && (
              <label className="toolbar-control">
                <span>Sprint</span>
                <select className="toolbar-button filter-select" name="sprint" defaultValue={sprintFilter}>
                  <option value="todos">Todas as sprints</option>
                  {workflowSprints.map((sprint) => (
                    <option value={sprint.id} key={sprint.id}>
                      {sprint.name}{sprint.status === "active" ? " · ativa" : sprint.status === "completed" ? " · concluída" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="sr-only" htmlFor="board-owner">Responsável</label>
            <select className="toolbar-button filter-select" id="board-owner" name="responsavel" defaultValue={filters.responsavel ?? ""}>
              <option value="">Todos os responsáveis</option>
              {members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
            </select>
            <button className="button button-secondary" type="submit"><ListFilter size={15} /> Aplicar</button>
          </form>

          <section className="content-section full-board configurable-board">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{isBacklogView ? "Organização" : workflow.sprintEnabled ? "Sprint em foco" : "Fluxo contínuo"}</span>
                <h2>{isBacklogView ? `${filteredCards.length} cards` : `${kanbanCards.length} ${kanbanCards.length === 1 ? "card" : "cards"}`}</h2>
              </div>
              <div className="section-actions">
                <span>{isBacklogView ? "Arraste entre backlog e sprints" : "Arraste os cards ou use o seletor de etapa"}</span>
              </div>
            </div>
            {isBacklogView ? (
              <WorkItemBacklogBoard
                key={`backlog:${workflow.id}:${filters.q ?? ""}:${filters.responsavel ?? ""}`}
                initialCards={filteredCards}
                sprints={workflowSprints}
                stages={stages}
                members={members}
                epics={epics}
              />
            ) : (
              <WorkItemKanban
                key={`kanban:${workflow.id}:${sprintFilter}:${filters.q ?? ""}:${filters.responsavel ?? ""}`}
                stages={stages}
                initialCards={kanbanCards}
                members={members}
                sprints={sprintOptions}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
