"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { moveWorkItemAction } from "@/app/(dashboard)/actions";
import { WorkItemCard } from "@/components/projects/work-item-card";
import { WorkItemDetailModal } from "@/components/projects/work-item-detail-modal";
import type { BoardStageData, WorkItemCardData } from "./types";

type MemberOption = { id: string; name: string; avatarUrl?: string | null };
type SprintOption = { id: string; name: string };

export function WorkItemKanban({
  stages,
  initialCards,
  members,
  sprints,
}: {
  stages: BoardStageData[];
  initialCards: WorkItemCardData[];
  members: MemberOption[];
  sprints: SprintOption[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [selectedCard, setSelectedCard] = useState<WorkItemCardData | null>(null);
  const [moveError, setMoveError] = useState("");
  const [pending, startTransition] = useTransition();

  const byStage = useMemo(() => {
    const grouped = new Map(stages.map((stage) => [stage.id, [] as WorkItemCardData[]]));
    cards.forEach((card) => grouped.get(card.stageId)?.push(card));
    return grouped;
  }, [cards, stages]);

  function patchCard(updated: WorkItemCardData) {
    setCards((current) => current.map((card) => (card.id === updated.id ? updated : card)));
    setSelectedCard(updated);
  }

  function move(cardId: string, stageId: string) {
    const previous = cards;
    const stage = stages.find((item) => item.id === stageId);
    setMoveError("");
    setCards((current) => current.map((card) =>
      card.id === cardId ? { ...card, stageId, stageName: stage?.name ?? card.stageName, stageColor: stage?.color ?? card.stageColor } : card,
    ));
    startTransition(async () => {
      const result = await moveWorkItemAction(cardId, stageId);
      if (!result.ok) {
        setCards(previous);
        setMoveError(result.error);
      }
    });
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination || result.destination.droppableId === result.source.droppableId) return;
    move(result.draggableId, result.destination.droppableId);
  }

  return (
    <>
      {moveError && <p className="kanban-error" role="alert">{moveError}</p>}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban" aria-label="Quadro de cards" aria-busy={pending}>
          {stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            return (
              <section className="kanban-column" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
                <header className="kanban-column-head" title={stage.description}>
                  <div>
                    <span className="stage-dot" style={{ background: stage.color }} />
                    <h3 id={`stage-${stage.id}`}>{stage.name}</h3>
                    <span className="column-count">{items.length}</span>
                  </div>
                </header>
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div className={`kanban-drop ${snapshot.isDraggingOver ? "drag-over" : ""}`} ref={provided.innerRef} {...provided.droppableProps}>
                      {items.map((card, index) => (
                        <Draggable draggableId={card.id} index={index} key={card.id}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              className={`work-item-kanban-card ${dragSnapshot.isDragging ? "dragging" : ""}`}
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                            >
                              <WorkItemCard
                                card={card}
                                dragHandleProps={dragProvided.dragHandleProps}
                                onOpen={() => setSelectedCard(card)}
                              />
                              <label className="sr-only" htmlFor={`move-card-${card.id}`}>Mover {card.title} para</label>
                              <div className="work-item-stage-field" onClick={(event) => event.stopPropagation()}>
                                <span className="stage-dot" style={{ background: stages.find((s) => s.id === card.stageId)?.color }} aria-hidden />
                                <select
                                  id={`move-card-${card.id}`}
                                  className="work-item-stage-select"
                                  value={card.stageId}
                                  onChange={(event) => move(card.id, event.target.value)}
                                >
                                  {stages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                                </select>
                              </div>
                            </article>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {!items.length && <div className="column-empty">Nenhum card nesta etapa</div>}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </DragDropContext>

      <WorkItemDetailModal
        card={selectedCard}
        open={Boolean(selectedCard)}
        onClose={() => setSelectedCard(null)}
        onChange={patchCard}
        stages={stages}
        members={members}
        sprints={sprints}
      />
    </>
  );
}
