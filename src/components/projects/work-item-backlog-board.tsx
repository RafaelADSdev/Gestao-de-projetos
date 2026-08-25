"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Inbox, Layers3 } from "lucide-react";
import { assignWorkItemSprintAction } from "@/app/(dashboard)/actions";
import { WorkItemCard } from "@/components/projects/work-item-card";
import type { WorkItemCardData } from "./types";

type SprintColumn = {
  id: string;
  name: string;
  status: "planned" | "active" | "completed";
};

const sprintStatus = {
  planned: "Planejada",
  active: "Ativa",
  completed: "Concluída",
} as const;

const BACKLOG_COLUMN_ID = "backlog";

export function WorkItemBacklogBoard({
  initialCards,
  sprints,
}: {
  initialCards: WorkItemCardData[];
  sprints: readonly SprintColumn[];
  epics?: { id: string; name: string; clientName: string }[];
  members?: { id: string; name: string }[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [moveError, setMoveError] = useState("");
  const [pending, startTransition] = useTransition();

  const openSprints = useMemo(
    () => sprints.filter((sprint) => sprint.status !== "completed"),
    [sprints],
  );

  const columns = useMemo(() => {
    const grouped = new Map<string, WorkItemCardData[]>();
    grouped.set(BACKLOG_COLUMN_ID, []);
    openSprints.forEach((sprint) => grouped.set(sprint.id, []));
    cards.forEach((card) => {
      const columnId = card.sprintId ?? BACKLOG_COLUMN_ID;
      grouped.get(columnId)?.push(card);
    });
    return grouped;
  }, [cards, openSprints]);

  function assignSprint(cardId: string, sprintId: string | null) {
    const previous = cards;
    setMoveError("");
    setCards((current) => current.map((card) => {
      if (card.id !== cardId) return card;
      const sprint = sprintId ? openSprints.find((item) => item.id === sprintId) : null;
      return { ...card, sprintId, sprintName: sprint?.name ?? null };
    }));
    startTransition(async () => {
      const result = await assignWorkItemSprintAction(cardId, sprintId);
      if (!result.ok) {
        setCards(previous);
        setMoveError(result.error);
      }
    });
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const sprintId = result.destination.droppableId === BACKLOG_COLUMN_ID
      ? null
      : result.destination.droppableId;
    if ((result.source.droppableId === BACKLOG_COLUMN_ID && sprintId === null)
      || result.source.droppableId === result.destination.droppableId) {
      return;
    }
    assignSprint(result.draggableId, sprintId);
  }

  const columnDefs = [
    { id: BACKLOG_COLUMN_ID, name: "Backlog", status: null as SprintColumn["status"] | null },
    ...openSprints.map((sprint) => ({ id: sprint.id, name: sprint.name, status: sprint.status })),
  ];

  return (
    <>
      {moveError && <p className="kanban-error" role="alert">{moveError}</p>}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="backlog-board" aria-busy={pending}>
          {columnDefs.map((column) => {
            const items = columns.get(column.id) ?? [];
            return (
              <section className="backlog-board-column" key={column.id}>
                <header>
                  <div>
                    {column.id === BACKLOG_COLUMN_ID ? <Inbox size={16} /> : <Layers3 size={16} />}
                    <h3>{column.name}</h3>
                  </div>
                  <span className="column-count">{items.length}</span>
                  {column.status && <small className={`sprint-status ${column.status}`}>{sprintStatus[column.status]}</small>}
                </header>
                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`backlog-board-drop ${snapshot.isDraggingOver ? "drag-over" : ""}`}
                    >
                      {items.map((card, index) => (
                        <Draggable draggableId={card.id} index={index} key={card.id}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`work-item-card ${dragSnapshot.isDragging ? "dragging" : ""}`}
                            >
                              <WorkItemCard card={card} dragHandleProps={dragProvided.dragHandleProps} />
                            </article>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {!items.length && <div className="column-empty">Solte cards aqui</div>}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </DragDropContext>
    </>
  );
}
