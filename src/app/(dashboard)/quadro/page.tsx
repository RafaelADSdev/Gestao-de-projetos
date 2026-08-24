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
import { ProjectKanban } from "@/components/projects/project-kanban";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildBoardStages, buildProjectCards } from "@/lib/data/view-models";

type BoardFilters = {
  q?: string;
  responsavel?: string;
  situacao?: string;
  fluxo?: string;
  sprint?: string;
  visao?: "quadro" | "backlog";
};

function boardHref(workflowId: string, sprintId?: string | null) {
  const params = new URLSearchParams({ fluxo: workflowId });
  if (sprintId) params.set("sprint", sprintId);
  return `/quadro?${params.toString()}`;
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<BoardFilters> }) {
  const context = await requireAuthContext();
  const filters = await searchParams;

  if (filters.visao === "backlog") {
    const params = new URLSearchParams();
    if (filters.fluxo) params.set("fluxo", filters.fluxo);
    if (filters.q) params.set("q", filters.q);
    if (filters.responsavel) params.set("responsavel", filters.responsavel);
    if (filters.situacao) params.set("situacao", filters.situacao);
    redirect(`/backlog?${params.toString()}`);
  }

  const { data, now } = await loadAgencyData(context);
  const workflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const workflow = workflows.find((item) => item.id === filters.fluxo)
    ?? workflows.find((item) => item.isDefault)
    ?? workflows[0];

  if (!workflow) {
    return (
      <div className="configuration-empty panel">
        <span><Columns3 size={24} /></span>
        <h1>Crie o primeiro fluxo de trabalho</h1>
        <p>O Kanban precisa de um fluxo e ao menos uma etapa para organizar os projetos.</p>
        {(context.role === "owner" || context.role === "admin") && <Link className="button button-primary" href="/configuracoes/fluxos">Configurar fluxo</Link>}
      </div>
    );
  }

  const workflowSprints = data.sprints
    .filter((sprint) => sprint.workflowId === workflow.id)
    .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? ""));
  const activeSprint = workflowSprints.find((sprint) => sprint.status === "active") ?? workflowSprints.find((sprint) => sprint.status === "planned") ?? null;
  const selectedSprint = filters.sprint === "todos"
    ? null
    : workflowSprints.find((sprint) => sprint.id === filters.sprint) ?? activeSprint;
  const query = filters.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const workflowCards = buildProjectCards(data, now).filter((project) => project.workflowId === workflow.id);
  const backlogCards = workflowCards.filter((project) => project.sprintId === null);
  const plannedCards = workflow.sprintEnabled
    ? workflowCards.filter((project) => filters.sprint === "todos" ? project.sprintId !== null : selectedSprint ? project.sprintId === selectedSprint.id : project.sprintId !== null)
    : workflowCards;
  const cards = plannedCards.filter((project) => {
    const source = data.projects.find((item) => item.id === project.id);
    const searchable = `${project.name} ${project.clientName} ${project.technologies.map((item) => item.name).join(" ")}`.toLocaleLowerCase("pt-BR");
    const matchesText = !query || searchable.includes(query);
    const matchesOwner = !filters.responsavel || source?.ownerId === filters.responsavel;
    const matchesSituation = !filters.situacao
      || (filters.situacao === "atrasado" && project.health === "late")
      || (filters.situacao === "proximo" && project.health === "attention")
      || (filters.situacao === "bloqueado" && project.blocked)
      || (filters.situacao === "cliente" && project.stageName.toLocaleLowerCase("pt-BR").includes("cliente"));
    return matchesText && matchesOwner && matchesSituation;
  });
  const stages = buildBoardStages(data, workflow.id);
  const canAdminister = context.role === "owner" || context.role === "admin";

  return (
    <>
      <header className="page-heading page-heading-actions board-page-heading">
        <div>
          <span className="eyebrow">Execução do trabalho</span>
          <h1>Kanban</h1>
          <p>Concentre a equipe em um fluxo, uma sprint e o trabalho de cada responsável.</p>
        </div>
        <div className="heading-button-group">
          {canAdminister && <Link href="/configuracoes/fluxos" className="button button-secondary"><Settings2 size={16} /> Configurar</Link>}
          <Link href="/projetos/novo" className="button button-primary"><Plus size={17} /> Novo projeto</Link>
        </div>
      </header>

      <section className="workflow-switcher panel" aria-label="Fluxos de trabalho">
        <div className="workflow-switcher-title"><Columns3 size={17} /><span>Fluxos</span></div>
        <nav>
          {workflows.map((item) => (
            <Link className={item.id === workflow.id ? "active" : ""} aria-current={item.id === workflow.id ? "page" : undefined} href={boardHref(item.id)} key={item.id}>
              {item.name}
              {item.sprintEnabled && <CalendarRange size={13} />}
            </Link>
          ))}
        </nav>
      </section>

      <section className="board-context-bar">
        <div>
          <span className="eyebrow">{workflow.name}</span>
          <h2>{selectedSprint?.name ?? "Quadro contínuo"}</h2>
          <p>{selectedSprint?.goal ?? workflow.description ?? "Visualize e mova os projetos entre as etapas."}</p>
        </div>
        {workflow.sprintEnabled && (
          <nav className="board-view-tabs" aria-label="Planejamento do fluxo">
            <Link className="active" href={boardHref(workflow.id, selectedSprint?.id)}><Columns3 size={14} /> Quadro</Link>
            <Link href={`/backlog?fluxo=${workflow.id}`}><Inbox size={14} /> Backlog <span>{backlogCards.length}</span></Link>
          </nav>
        )}
      </section>

      <form className="toolbar board-toolbar" action="/quadro">
        <input type="hidden" name="fluxo" value={workflow.id} />
        <label className="toolbar-search"><Search size={16} /><span className="sr-only">Buscar no quadro</span><input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar projeto, cliente ou tecnologia…" /></label>
        {workflow.sprintEnabled && (
          <label className="toolbar-control"><span>Sprint</span><select className="toolbar-button filter-select" name="sprint" defaultValue={filters.sprint ?? selectedSprint?.id ?? "todos"}>
            <option value="todos">Todos os planejados</option>
            {workflowSprints.map((sprint) => <option value={sprint.id} key={sprint.id}>{sprint.name}{sprint.status === "active" ? " · ativa" : sprint.status === "completed" ? " · concluída" : ""}</option>)}
          </select></label>
        )}
        <label className="sr-only" htmlFor="board-owner">Responsável</label>
        <select className="toolbar-button filter-select" id="board-owner" name="responsavel" defaultValue={filters.responsavel ?? ""}><option value="">Todos os responsáveis</option>{data.members.filter((member) => member.active).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>
        <label className="sr-only" htmlFor="board-state">Situação</label>
        <select className="toolbar-button filter-select" id="board-state" name="situacao" defaultValue={filters.situacao ?? ""}><option value="">Todas as situações</option><option value="atrasado">Atrasados</option><option value="proximo">Prazo próximo</option><option value="bloqueado">Bloqueados</option><option value="cliente">Aguardando cliente</option></select>
        <button className="button button-secondary" type="submit"><ListFilter size={15} /> Aplicar</button>
      </form>

      <section className="content-section full-board configurable-board">
        <div className="section-heading"><div><span className="eyebrow">{workflow.sprintEnabled ? "Sprint em foco" : "Fluxo contínuo"}</span><h2>{cards.length} {cards.length === 1 ? "projeto" : "projetos"}</h2></div><div className="section-actions"><span>Arraste os cartões ou use o seletor de etapa</span></div></div>
        <ProjectKanban
          key={`${workflow.id}:${filters.sprint ?? selectedSprint?.id ?? "all"}:${filters.q ?? ""}:${filters.responsavel ?? ""}:${filters.situacao ?? ""}`}
          stages={stages}
          initialProjects={cards}
        />
      </section>
    </>
  );
}
