import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";
import { AssigneeStack } from "@/components/projects/assignee-stack";
import type { WorkItemCardData } from "@/components/projects/types";

export function EpicChildCards({ cards }: { cards: WorkItemCardData[] }) {
  const terminalStages = new Set(["publicado", "manutencao", "concluido", "concluído"]);
  const completed = cards.filter((card) => terminalStages.has(card.stageId)).length;
  const percent = cards.length ? Math.round((completed / cards.length) * 100) : 0;

  return (
    <article className="panel detail-panel epic-child-cards">
      <div className="panel-heading">
        <div>
          <span className="panel-icon violet"><Layers3 size={18} /></span>
          <div>
            <h2>Cards de trabalho</h2>
            <p>Tarefas executáveis vinculadas a este Epic</p>
          </div>
        </div>
        <span className="completion-pill">{percent}%</span>
      </div>
      <div className="checklist-progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="epic-child-list">
        {cards.map((card) => (
          <div className="epic-child-row" key={card.id}>
            <div>
              <strong>{card.title}</strong>
              <small>{card.stageName}{card.sprintName ? ` · ${card.sprintName}` : ""}</small>
            </div>
            <AssigneeStack assignees={card.assignees} />
            <span className={`epic-child-stage ${card.stageId}`}>{card.stageName}</span>
          </div>
        ))}
        {!cards.length && <p className="muted-copy">Nenhum card criado ainda. Use o backlog para adicionar tarefas a este Epic.</p>}
      </div>
      <Link href="/backlog" className="quiet-link epic-child-link">Ver backlog <ArrowRight size={13} /></Link>
    </article>
  );
}
