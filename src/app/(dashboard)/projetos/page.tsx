import Link from "next/link";
import { Columns3, ListFilter, Plus, Search, Settings2 } from "lucide-react";
import { ProjectPortfolio } from "@/components/projects/project-portfolio";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildProjectCards } from "@/lib/data/view-models";

type ProjectFilters = {
  q?: string;
  responsavel?: string;
  situacao?: string;
  fluxo?: string;
};

const healthOrder = { late: 0, waiting: 1, attention: 2, "on-track": 3 } as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<ProjectFilters> }) {
  const context = await requireAuthContext();
  const { data, now } = await loadAgencyData(context);
  const filters = await searchParams;
  const query = filters.q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const allCards = buildProjectCards(data, now);
  const candidateCards = filters.situacao === "arquivado"
    ? buildProjectCards(data, now, { includeArchived: true }).filter((project) => data.projects.find((item) => item.id === project.id)?.archivedAt)
    : allCards;
  const cards = candidateCards.filter((project) => {
    const source = data.projects.find((item) => item.id === project.id);
    const searchable = `${project.name} ${project.clientName} ${project.technologies.map((item) => item.name).join(" ")}`
      .toLocaleLowerCase("pt-BR");
    const matchesText = !query || searchable.includes(query);
    const matchesOwner = !filters.responsavel || source?.ownerId === filters.responsavel;
    const matchesWorkflow = !filters.fluxo || project.workflowId === filters.fluxo;
    const matchesSituation = !filters.situacao
      || (filters.situacao === "atrasado" && project.health === "late")
      || (filters.situacao === "proximo" && project.health === "attention")
      || (filters.situacao === "bloqueado" && project.blocked)
      || (filters.situacao === "backlog" && project.sprintId === null)
      || (filters.situacao === "recorrente" && project.hasRecurringRevenue)
      || filters.situacao === "arquivado";
    return matchesText && matchesOwner && matchesWorkflow && matchesSituation;
  }).sort((left, right) => healthOrder[left.health] - healthOrder[right.health] || left.name.localeCompare(right.name, "pt-BR"));

  const late = allCards.filter((item) => item.health === "late").length;
  const blocked = allCards.filter((item) => item.blocked).length;
  const backlog = allCards.filter((item) => item.sprintId === null).length;
  const canAdminister = context.role === "owner" || context.role === "admin";

  return (
    <>
      <header className="page-heading page-heading-actions">
        <div>
          <span className="eyebrow">Organização do portfólio</span>
          <h1>Projetos</h1>
          <p>Encontre contexto, responsáveis, tecnologias e planejamento sem entrar no quadro.</p>
        </div>
        <div className="heading-button-group">
          <Link href="/quadro" className="button button-secondary"><Columns3 size={17} /> Abrir Kanban</Link>
          <Link href="/projetos/novo" className="button button-primary"><Plus size={17} /> Novo projeto</Link>
        </div>
      </header>

      <section className="compact-stats project-stats" aria-label="Resumo dos projetos">
        <div><strong>{allCards.length}</strong><span>ativos</span></div>
        <div><strong>{late}</strong><span>atrasados</span></div>
        <div><strong>{blocked}</strong><span>bloqueados</span></div>
        <div><Link href="/backlog"><strong>{backlog}</strong></Link><span>no backlog</span></div>
      </section>

      <form className="toolbar portfolio-toolbar" action="/projetos">
        <label className="toolbar-search">
          <Search size={16} />
          <span className="sr-only">Buscar projetos</span>
          <input name="q" defaultValue={filters.q ?? ""} placeholder="Buscar projeto, cliente ou tecnologia…" />
        </label>
        <label className="sr-only" htmlFor="filter-workflow">Fluxo</label>
        <select className="toolbar-button filter-select" id="filter-workflow" name="fluxo" defaultValue={filters.fluxo ?? ""}>
          <option value="">Todos os fluxos</option>
          {data.workflows.filter((workflow) => !workflow.archivedAt).map((workflow) => (
            <option value={workflow.id} key={workflow.id}>{workflow.name}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-owner">Responsável</label>
        <select className="toolbar-button filter-select" id="filter-owner" name="responsavel" defaultValue={filters.responsavel ?? ""}>
          <option value="">Todos os responsáveis</option>
          {data.members.filter((member) => member.active).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="filter-state">Situação</label>
        <select className="toolbar-button filter-select" id="filter-state" name="situacao" defaultValue={filters.situacao ?? ""}>
          <option value="">Todas as situações</option>
          <option value="atrasado">Atrasados</option>
          <option value="proximo">Prazo próximo</option>
          <option value="bloqueado">Bloqueados</option>
          <option value="backlog">No backlog</option>
          <option value="recorrente">Com mensalidade</option>
          <option value="arquivado">Arquivados</option>
        </select>
        <button className="button button-secondary" type="submit"><ListFilter size={15} /> Filtrar</button>
      </form>

      <div className="portfolio-result-heading">
        <p><strong>{cards.length}</strong> {cards.length === 1 ? "projeto encontrado" : "projetos encontrados"}</p>
        {canAdminister && <Link href="/configuracoes/fluxos"><Settings2 size={14} /> Administrar fluxos e tecnologias</Link>}
      </div>
      <ProjectPortfolio projects={cards} />
    </>
  );
}
