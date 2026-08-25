import Link from "next/link";
import { Code2, ExternalLink, Link2 } from "lucide-react";
import type { ProjectResource } from "@/lib/domain";

const resourceLabels: Record<ProjectResource["type"], string> = {
  production: "Site",
  staging: "Homologação",
  admin: "Painel",
  github: "GitHub",
  figma: "Figma",
  drive: "Drive",
  documentation: "Docs",
  other: "Link",
};

const priorityOrder: ProjectResource["type"][] = ["github", "production", "staging", "admin", "figma", "drive", "documentation", "other"];

export function EpicQuickLinks({ resources }: { resources: readonly ProjectResource[] }) {
  const sorted = [...resources].sort(
    (left, right) => priorityOrder.indexOf(left.type) - priorityOrder.indexOf(right.type),
  );

  if (!sorted.length) {
    return (
      <article className="panel epic-quick-links">
        <div className="panel-heading">
          <div>
            <span className="panel-icon blue"><Link2 size={18} /></span>
            <div>
              <h2>Links do Epic</h2>
              <p>Git, site e outros atalhos ficam aqui</p>
            </div>
          </div>
        </div>
        <p className="muted-copy">Nenhum link cadastrado. Adicione repositório, site e homologação na aba Links.</p>
      </article>
    );
  }

  return (
    <article className="panel epic-quick-links">
      <div className="panel-heading">
        <div>
          <span className="panel-icon blue"><Link2 size={18} /></span>
          <div>
            <h2>Links do Epic</h2>
            <p>Git, site e ambiente de produção</p>
          </div>
        </div>
      </div>
      <div className="epic-quick-links-grid">
        {sorted.map((resource) => (
          <a href={resource.url} target="_blank" rel="noreferrer" key={resource.id} className="epic-quick-link">
            <span className={`resource-type-icon ${resource.type}`}>
              {resource.type === "github" ? <Code2 size={16} /> : <ExternalLink size={16} />}
            </span>
            <span>
              <small>{resourceLabels[resource.type]}</small>
              <strong>{resource.label}</strong>
            </span>
          </a>
        ))}
      </div>
    </article>
  );
}
