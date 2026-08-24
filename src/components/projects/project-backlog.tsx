import Link from "next/link";
import { ArrowUpRight, CalendarRange, GripVertical, Inbox, Layers3 } from "lucide-react";
import { assignProjectSprintAction } from "@/app/(dashboard)/actions";
import type { ProjectCardData } from "./types";

type SprintOption = {
  id: string;
  name: string;
  status: "planned" | "active" | "completed";
  startDate: string | null;
  endDate: string | null;
};

const sprintStatus = {
  planned: "Planejada",
  active: "Ativa",
  completed: "Concluída",
} as const;

export function ProjectBacklog({
  projects,
  sprints,
}: {
  projects: readonly ProjectCardData[];
  sprints: readonly SprintOption[];
}) {
  async function assignToSprint(projectId: string, formData: FormData) {
    "use server";
    await assignProjectSprintAction(projectId, formData);
  }

  return (
    <section className="backlog-layout">
      <div className="backlog-main panel">
        <header className="backlog-header">
          <div><span className="panel-icon violet"><Inbox size={18} /></span><div><h2>Backlog</h2><p>Projetos ainda não comprometidos com uma sprint.</p></div></div>
          <span>{projects.length} {projects.length === 1 ? "item" : "itens"}</span>
        </header>
        <div className="backlog-list">
          {projects.map((project) => {
            const assignSprint = assignToSprint.bind(null, project.id);
            return (
              <article className="backlog-row" key={project.id}>
                <GripVertical size={16} className="backlog-grip" aria-hidden="true" />
                <span className="project-monogram">{project.name.slice(0, 1)}</span>
                <div className="backlog-project">
                  <small>{project.clientName}</small>
                  <Link href={`/projetos/${project.id}`}>{project.name}</Link>
                  <p>{project.nextAction}</p>
                  <div className="technology-chips">
                    {project.technologies.slice(0, 3).map((technology) => <span key={technology.id}><i style={{ backgroundColor: technology.color }} />{technology.name}</span>)}
                  </div>
                </div>
                <span className="backlog-stage"><Layers3 size={13} />{project.stageName}</span>
                <form action={assignSprint} className="backlog-sprint-form">
                  <label className="sr-only" htmlFor={`sprint-${project.id}`}>Planejar {project.name} na sprint</label>
                  <select id={`sprint-${project.id}`} className="input" name="sprint_id" defaultValue="">
                    <option value="">Continuar no backlog</option>
                    {sprints.filter((sprint) => sprint.status !== "completed").map((sprint) => (
                      <option value={sprint.id} key={sprint.id}>{sprint.name} · {sprintStatus[sprint.status]}</option>
                    ))}
                  </select>
                  <button className="button button-secondary" type="submit">Planejar</button>
                </form>
                <Link className="portfolio-open" href={`/projetos/${project.id}`} aria-label={`Abrir ${project.name}`}><ArrowUpRight size={17} /></Link>
              </article>
            );
          })}
          {!projects.length && (
            <div className="backlog-empty">
              <span><Inbox size={22} /></span>
              <h3>Backlog em dia</h3>
              <p>Todos os projetos deste fluxo já estão planejados.</p>
            </div>
          )}
        </div>
      </div>
      <aside className="panel sprint-guide">
        <span className="panel-icon blue"><CalendarRange size={18} /></span>
        <h2>Sprints disponíveis</h2>
        <p>Planeje somente o que a equipe consegue concluir no período.</p>
        <div>
          {sprints.filter((sprint) => sprint.status !== "completed").map((sprint) => (
            <article key={sprint.id}>
              <span className={`sprint-status ${sprint.status}`}>{sprintStatus[sprint.status]}</span>
              <strong>{sprint.name}</strong>
              <small>{sprint.startDate && sprint.endDate ? `${sprint.startDate.split("-").reverse().join("/")} — ${sprint.endDate.split("-").reverse().join("/")}` : "Período aberto"}</small>
            </article>
          ))}
          {!sprints.some((sprint) => sprint.status !== "completed") && <p className="muted-copy">Crie uma sprint nas configurações do fluxo.</p>}
        </div>
      </aside>
    </section>
  );
}
