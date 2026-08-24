"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Code2,
  GripVertical,
  Layers3,
  UserRound,
  X,
} from "lucide-react";
import { moveProjectAction } from "@/app/(dashboard)/actions";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { BoardStageData, ProjectCardData, ProjectHealth, ProjectResourceView } from "./types";

const healthCopy: Record<ProjectHealth, { label: string; icon: typeof Clock3 }> = {
  late: { label: "Atrasado", icon: AlertCircle },
  attention: { label: "Prazo próximo", icon: Clock3 },
  "on-track": { label: "No prazo", icon: CheckCircle2 },
  waiting: { label: "Aguardando", icon: Clock3 },
};

export function ProjectKanban({ stages, initialProjects }: { stages: BoardStageData[]; initialProjects: ProjectCardData[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [selected, setSelected] = useState<ProjectCardData | null>(null);
  const [moveError, setMoveError] = useState("");
  const [pending, startTransition] = useTransition();

  const byStage = useMemo(() => {
    const grouped = new Map(stages.map((stage) => [stage.id, [] as ProjectCardData[]]));
    projects.forEach((project) => grouped.get(project.stageId)?.push(project));
    return grouped;
  }, [projects, stages]);

  function move(projectId: string, stageId: string) {
    const previous = projects;
    const stage = stages.find((item) => item.id === stageId);
    setMoveError("");
    setProjects((current) => current.map((project) =>
      project.id === projectId ? { ...project, stageId, stageName: stage?.name ?? project.stageName } : project,
    ));
    startTransition(async () => {
      const result = await moveProjectAction(projectId, stageId);
      if (!result.ok) {
        setProjects(previous);
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
        <div className="kanban" aria-label="Quadro de projetos" aria-busy={pending}>
          {stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            return (
              <section className="kanban-column" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
                <header className="kanban-column-head" title={stage.description}>
                  <div><span className="stage-dot" style={{ background: stage.color }} /><h3 id={`stage-${stage.id}`}>{stage.name}</h3><span className="column-count">{items.length}</span></div>
                </header>
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div className={`kanban-drop ${snapshot.isDraggingOver ? "drag-over" : ""}`} ref={provided.innerRef} {...provided.droppableProps}>
                      {items.map((project, index) => (
                        <Draggable draggableId={project.id} index={index} key={project.id}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              className={`project-card ${dragSnapshot.isDragging ? "dragging" : ""}`}
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                            >
                              <div className="project-card-top">
                                <button className="drag-handle" aria-label={`Arrastar ${project.name}`} {...dragProvided.dragHandleProps}><GripVertical size={16} /></button>
                                <span className={`health-badge ${project.health}`}>{project.blocked && <AlertCircle size={12} />}{healthCopy[project.health].label}</span>
                                {project.hasRecurringRevenue && <span className="recurring-mark" title="Receita recorrente"><CircleDollarSign size={15} /></span>}
                              </div>
                              <button className="card-open" onClick={() => setSelected(project)} aria-label={`Abrir resumo de ${project.name}`}>
                                <small>{project.clientName}</small>
                                <h4>{project.name}</h4>
                                <p>{project.nextAction}</p>
                              </button>
                              <div className="project-card-plan">
                                {project.sprintName && <span><CalendarRange size={12} />{project.sprintName}</span>}
                                {project.technologies.slice(0, 2).map((technology) => <span key={technology.id}><i style={{ backgroundColor: technology.color }} />{technology.name}</span>)}
                              </div>
                              <div className="project-card-meta">
                                <ProfileAvatar className="assignee" name={project.responsibleName} src={project.responsibleAvatarUrl} size={22} />
                                <span className={`deadline ${project.health}`}><CalendarDays size={13} />{project.deadlineLabel}</span>
                              </div>
                              <label className="sr-only" htmlFor={`move-${project.id}`}>Mover {project.name} para</label>
                              <select id={`move-${project.id}`} className="stage-select" value={project.stageId} onChange={(event) => move(project.id, event.target.value)}>
                                {stages.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                              </select>
                            </article>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {items.length === 0 && <div className="column-empty">Solte um projeto aqui</div>}
                    </div>
                  )}
                </Droppable>
              </section>
            );
          })}
        </div>
      </DragDropContext>
      {selected && <ProjectDrawer project={selected} stages={stages} onClose={() => setSelected(null)} onMove={(stageId) => { move(selected.id, stageId); setSelected((current) => current ? { ...current, stageId, stageName: stages.find((stage) => stage.id === stageId)?.name ?? current.stageName } : current); }} />}
    </>
  );
}

function ResourceIcon({ resource }: { resource: ProjectResourceView }) {
  return resource.type === "github" ? <Code2 size={16} /> : <ExternalLink size={16} />;
}

function ProjectDrawer({ project, stages, onClose, onMove }: { project: ProjectCardData; stages: BoardStageData[]; onClose: () => void; onMove: (stageId: string) => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="project-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header>
          <div><span className={`health-badge ${project.health}`}>{healthCopy[project.health].label}</span><small>{project.clientName}</small></div>
          <button ref={closeButtonRef} className="icon-button" onClick={onClose} aria-label="Fechar resumo"><X size={19} /></button>
        </header>
        <h2 id="drawer-title">{project.name}</h2>
        <p className="drawer-type">{project.projectType}</p>
        <div className="drawer-grid">
          <div><span>Responsável</span><strong><UserRound size={15} />{project.responsibleName}</strong></div>
          <div><span>Próximo prazo</span><strong><CalendarDays size={15} />{project.deadlineLabel}</strong></div>
          <div><span>Fluxo</span><strong><Layers3 size={15} />{project.workflowName}</strong></div>
          <div><span>Planejamento</span><strong><CalendarRange size={15} />{project.sprintName ?? "Backlog"}</strong></div>
        </div>
        <label className="field-label" htmlFor="drawer-stage">Etapa atual</label>
        <select id="drawer-stage" className="input" value={project.stageId} onChange={(event) => onMove(event.target.value)}>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
        <section className="drawer-section">
          <div className="section-mini-head"><h3>Tecnologias</h3><span>{project.technologies.length}</span></div>
          <div className="technology-chips drawer-technologies">
            {project.technologies.map((technology) => <span key={technology.id}><i style={{ backgroundColor: technology.color }} />{technology.name}</span>)}
            {project.technologies.length === 0 && <p className="muted-copy">Nenhuma tecnologia vinculada.</p>}
          </div>
        </section>
        <section className="drawer-section">
          <div className="section-mini-head"><h3>Próxima ação</h3><span>{project.blocked ? "Bloqueado" : "Em andamento"}</span></div>
          <p className="next-action-box">{project.nextAction}</p>
        </section>
        <section className="drawer-section">
          <div className="section-mini-head"><h3>Links rápidos</h3><span>{project.resources.length}</span></div>
          <div className="resource-list">
            {project.resources.map((resource) => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><ResourceIcon resource={resource} /><span>{resource.label}</span><ArrowUpRight size={14} /></a>)}
            {project.resources.length === 0 && <p className="muted-copy">Nenhum link cadastrado.</p>}
          </div>
        </section>
        <Link href={`/projetos/${project.id}`} className="button button-primary button-block">Abrir projeto completo <ChevronRight size={17} /></Link>
      </aside>
    </div>
  );
}
