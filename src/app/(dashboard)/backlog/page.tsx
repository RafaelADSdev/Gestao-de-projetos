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
import { ProjectBacklog } from "@/components/projects/project-backlog";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildProjectCards } from "@/lib/data/view-models";

type BacklogFilters = {
  q?: string;
  responsavel?: string;
  situacao?: string;
  fluxo?: string;
};

function backlogHref(workflowId: string) {
  return `/backlog?fluxo=${workflowId}`;
}

function filterCards(
  cards: ReturnType<typeof buildProjectCards>,
  data: Awaited<ReturnType<typeof loadAgencyData>>["data"],
  filters: BacklogFilters,
) {
  const query = filters.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  return cards.filter((project) => {
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
}

export default async function BacklogPage({ searchParams }: { searchParams: Promise<BacklogFilters> }) {
  const context = await requireAuthContext();
  const { data, now } = await loadAgencyData(context);
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
  const workflowCards = buildProjectCards(data, now, { workflowId: workflow.id });
  const backlogCards = workflow.sprintEnabled
    ? workflowCards.filter((project) => project.sprintId === null)
    : [];
  const cards = filterCards(backlogCards, data, filters);
  const totalBacklog = sprintWorkflows.reduce((count, item) => {
    const items = buildProjectCards(data, now, { workflowId: item.id }).filter((project) => project.sprintId === null);
    return count + items.length;
  }, 0);
  const canAdminister = context.role === "owner" || context.role === "admin";

  return (
    <>
      <header className="page-heading page-heading-actions board-page-heading">
        <div>
          <span className="eyebrow">Planejamento do trabalho</span>
          <h1>Backlog</h1>
          <p>Priorize o que ainda não entrou em uma sprint e distribua o trabalho da equipe.</p>
        </div>
        <div className="heading-button-group">
          <Link href={`/quadro?fluxo=${workflow.id}`} className="button button-secondary"><Columns3 size={16} /> Abrir Kanban</Link>
          {canAdminister && <Link href="/configuracoes/fluxos" className="button button-secondary"><Settings2 size={16} /> Configurar</Link>}
          <Link href="/projetos/novo" className="button button-primary"><Plus size={17} /> Novo projeto</Link>
        </div>
      </header>

      <section className="compact-stats project-stats" aria-label="Resumo do backlog">
        <div><strong>{totalBacklog}</strong><span>aguardando sprint</span></div>
        <div><strong>{cards.length}</strong><span>neste fluxo</span></div>
        <div><strong>{workflowSprints.filter((sprint) => sprint.status !== "completed").length}</strong><span>sprints abertas</span></div>
        <div><strong>{sprintWorkflows.length}</strong><span>fluxos com sprint</span></div>
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
          <h2>{workflow.sprintEnabled ? "Itens fora da sprint" : "Fluxo contínuo"}</h2>
          <p>
            {workflow.sprintEnabled
              ? "Projetos sem sprint definida ficam aqui até serem planejados."
              : "Este fluxo não usa backlog. Ative sprints nas configurações para separar planejamento e execução."}
          </p>
        </div>
        {workflow.sprintEnabled && (
          <nav className="board-view-tabs" aria-label="Alternar planejamento">
            <Link href={`/quadro?fluxo=${workflow.id}`}><Columns3 size={14} /> Quadro</Link>
            <Link className="active" href={backlogHref(workflow.id)}><Inbox size={14} /> Backlog <span>{backlogCards.length}</span></Link>
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
              <input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar projeto, cliente ou tecnologia…" />
            </label>
            <label className="sr-only" htmlFor="backlog-owner">Responsável</label>
            <select className="toolbar-button filter-select" id="backlog-owner" name="responsavel" defaultValue={filters.responsavel ?? ""}>
              <option value="">Todos os responsáveis</option>
              {data.members.filter((member) => member.active).map((member) => (
                <option value={member.id} key={member.id}>{member.name}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="backlog-state">Situação</label>
            <select className="toolbar-button filter-select" id="backlog-state" name="situacao" defaultValue={filters.situacao ?? ""}>
              <option value="">Todas as situações</option>
              <option value="atrasado">Atrasados</option>
              <option value="proximo">Prazo próximo</option>
              <option value="bloqueado">Bloqueados</option>
              <option value="cliente">Aguardando cliente</option>
            </select>
            <button className="button button-secondary" type="submit"><ListFilter size={15} /> Aplicar</button>
          </form>

          <ProjectBacklog projects={cards} sprints={workflowSprints} />
        </>
      )}
    </>
  );
}
