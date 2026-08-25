import type { CSSProperties, HTMLAttributes, KeyboardEvent } from "react";
import Link from "next/link";
import { GripVertical, Layers2 } from "lucide-react";
import { AssigneeStack } from "@/components/projects/assignee-stack";
import type { WorkItemCardData } from "./types";

type WorkItemCardProps = {
  card: WorkItemCardData;
  dragHandleProps?: HTMLAttributes<HTMLButtonElement> | null;
  trailing?: React.ReactNode;
  /** Hide sprint badge when the column already represents sprint grouping. */
  showSprint?: boolean;
  onOpen?: () => void;
};

export function WorkItemCard({
  card,
  dragHandleProps,
  trailing,
  showSprint = true,
  onOpen,
}: WorkItemCardProps) {
  function openFromKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen?.();
    }
  }

  return (
    <>
      <div className="work-item-card-top">
        {dragHandleProps && (
          <button
            type="button"
            className="drag-handle work-item-drag-handle"
            aria-label={`Arrastar ${card.title}`}
            {...dragHandleProps}
          >
            <GripVertical size={14} />
          </button>
        )}
        <Link
          href={`/projetos/${card.projectId}`}
          className="epic-pill"
          title={`Epic: ${card.epicName}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Layers2 size={10} aria-hidden />
          <span>{card.epicName}</span>
        </Link>
      </div>

      <button
        type="button"
        className={`work-item-card-open ${onOpen ? "is-clickable" : ""}`}
        onClick={onOpen}
        onKeyDown={openFromKeyboard}
        disabled={!onOpen}
        aria-label={onOpen ? `Abrir detalhes de ${card.title}` : undefined}
      >
        <span className="work-item-card-title">{card.title}</span>

        <div className="work-item-card-meta">
          <AssigneeStack assignees={card.assignees} />
          <div className="work-item-card-trailing">
            {showSprint && card.sprintName && (
              <span className="work-item-sprint">{card.sprintName}</span>
            )}
            <span
              className="work-item-stage-chip"
              style={{ "--stage-color": card.stageColor } as CSSProperties}
            >
              <i aria-hidden />
              {card.stageName}
            </span>
            {trailing}
          </div>
        </div>
      </button>
    </>
  );
}
