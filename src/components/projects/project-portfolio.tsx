import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  UserRound,
} from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { ProjectCardData, ProjectHealth } from "./types";

const healthLabels: Record<ProjectHealth, string> = {
  late: "Atrasado",
  attention: "Prazo próximo",
  "on-track": "No prazo",
  waiting: "Bloqueado",
};

function HealthIcon({ health }: { health: ProjectHealth }) {
  if (health === "late" || health === "waiting") return <AlertCircle size={14} />;
  if (health === "attention") return <Clock3 size={14} />;
  return <CheckCircle2 size={14} />;
}

export function ProjectPortfolio({ projects }: { projects: readonly ProjectCardData[] }) {
  if (!projects.length) {
    return (
      <div className="portfolio-empty panel">
        <span><Layers3 size={22} /></span>
        <h2>Nenhum projeto encontrado</h2>
        <p>Ajuste os filtros ou crie um novo projeto para começar.</p>
        <Link href="/projetos/novo" className="button button-primary">Criar projeto</Link>
      </div>
    );
  }

  return (
    <section className="panel portfolio-panel" aria-label="Portfólio de projetos">
      <div className="portfolio-table-head" aria-hidden="true">
        <span>Projeto</span>
        <span>Fluxo e planejamento</span>
        <span>Responsável</span>
        <span>Prazo</span>
        <span />
      </div>
      <div className="portfolio-list">
        {projects.map((project) => (
          <article className="portfolio-row" key={project.id}>
            <div className="portfolio-project-cell">
              <span className="project-monogram" aria-hidden="true">{project.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <small>{project.clientName}</small>
                <Link href={`/projetos/${project.id}`}>{project.name}{project.archived && <span className="archived-inline-badge">Arquivado</span>}</Link>
                <p>{project.nextAction}</p>
                {project.technologies.length > 0 && (
                  <div className="technology-chips" aria-label="Tecnologias">
                    {project.technologies.slice(0, 3).map((technology) => (
                      <span key={technology.id}><i style={{ backgroundColor: technology.color }} />{technology.name}</span>
                    ))}
                    {project.technologies.length > 3 && <span>+{project.technologies.length - 3}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="portfolio-planning-cell">
              <span><Layers3 size={13} />{project.workflowName}</span>
              <strong>{project.stageName}</strong>
              <small>{project.sprintName ?? "Backlog"}</small>
            </div>
            <div className="portfolio-owner-cell">
              <ProfileAvatar className="assignee" name={project.responsibleName} src={project.responsibleAvatarUrl} size={22} />
              <span><UserRound size={13} />{project.responsibleName}</span>
            </div>
            <div className={`portfolio-deadline-cell ${project.health}`}>
              <span><HealthIcon health={project.health} />{healthLabels[project.health]}</span>
              <small><CalendarDays size={12} />{project.deadlineLabel}</small>
            </div>
            <Link href={`/projetos/${project.id}`} className="portfolio-open" aria-label={`Abrir ${project.name}`}>
              <ArrowUpRight size={17} />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
