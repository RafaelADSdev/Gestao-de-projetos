import type { HTMLAttributes } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { AssigneeStack } from "@/components/projects/assignee-stack";
import type { WorkItemCardData } from "./types";

type WorkItemCardProps = {
  card: WorkItemCardData;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement> | null;
  trailing?: React.ReactNode;
};

export function WorkItemCard({ card, dragHandleProps, trailing }: WorkItemCardProps) {
  return (
    <>
      <div className="work-item-card-top">
        {dragHandleProps && (
          <button
            type="button"
            className="drag-handle"
            aria-label={`Arrastar ${card.title}`}
            {...dragHandleProps}
          >
            <GripVertical size={15} />
          </button>
        )}
        <div className="work-item-epic-row">
          <span className="work-item-parent-label">Pai</span>
          <Link href={`/projetos/${card.projectId}`} className="epic-pill" title={`Abrir Epic: ${card.epicName}`}>
            {card.epicName}
          </Link>
        </div>
      </div>
      <p className="work-item-card-title">{card.title}</p>
      <div className="work-item-card-meta">
        <AssigneeStack assignees={card.assignees} />
        <div className="work-item-card-trailing">
          {card.sprintName && <span className="work-item-sprint">{card.sprintName}</span>}
          <span className="backlog-stage">{card.stageName}</span>
          {trailing}
        </div>
      </div>
    </>
  );
}
