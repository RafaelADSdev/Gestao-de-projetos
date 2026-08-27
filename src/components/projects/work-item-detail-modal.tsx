"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  Check,
  Layers2,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  addWorkItemChecklistItemAction,
  addWorkItemCommentAction,
  assignWorkItemSprintAction,
  deleteWorkItemChecklistItemAction,
  loadWorkItemCollaborationAction,
  moveWorkItemAction,
  toggleWorkItemChecklistItemAction,
  updateWorkItemAction,
  type WorkItemCollaborationData,
} from "@/app/(dashboard)/actions";
import { ProfileAvatar } from "@/components/profile-avatar";
import type { BoardStageData, WorkItemCardData } from "./types";

type MemberOption = { id: string; name: string; avatarUrl?: string | null };
type SprintOption = { id: string; name: string };

function formatWorkItemKey(id: string): string {
  const compact = id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `CARD-${compact}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export function WorkItemDetailModal({
  card,
  open,
  onClose,
  onChange,
  stages,
  members,
  sprints,
}: {
  card: WorkItemCardData | null;
  open: boolean;
  onClose: () => void;
  onChange: (updated: WorkItemCardData) => void;
  stages: BoardStageData[];
  members: MemberOption[];
  sprints: SprintOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [collaboration, setCollaboration] = useState<WorkItemCollaborationData | null>(null);
  const [collaborationError, setCollaborationError] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [mutatingChecklistIds, setMutatingChecklistIds] = useState<string[]>([]);
  const [collaborationLoading, startCollaborationLoad] = useTransition();
  const [checklistAdding, startChecklistTransition] = useTransition();
  const [commentAdding, startCommentTransition] = useTransition();
  const workItemId = card?.id ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description ?? "");
    setAssigneeIds(card.assignees.map((assignee) => assignee.id));
    setError("");
  }, [card?.id, open]);

  useEffect(() => {
    if (!workItemId || !open) return;
    let active = true;
    startCollaborationLoad(async () => {
      const result = await loadWorkItemCollaborationAction(workItemId);
      if (!active) return;
      if (!result.ok) {
        setCollaborationError(result.error);
        return;
      }
      setCollaboration(result.data);
      setCollaborationError("");
    });
    return () => {
      active = false;
    };
  }, [workItemId, open]);

  if (!card) return null;

  const currentWorkItemId = card.id;
  const collaborationReady = collaboration?.workItemId === currentWorkItemId;
  const checklist = collaborationReady ? collaboration.checklist : [];
  const comments = collaborationReady ? collaboration.comments : [];
  const completedChecklistCount = checklist.filter((item) => item.completedAt !== null).length;
  const checklistPercent = checklist.length > 0
    ? Math.round((completedChecklistCount / checklist.length) * 100)
    : 0;

  function patchCard(patch: Partial<WorkItemCardData>) {
    onChange({ ...card!, ...patch });
  }

  function saveDetails() {
    if (!card) return;
    setError("");
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("description", description);
    assigneeIds.forEach((id) => formData.append("assignee_ids", id));

    startTransition(async () => {
      const result = await updateWorkItemAction(card.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextAssignees = assigneeIds
        .map((id) => members.find((member) => member.id === id))
        .filter((member): member is MemberOption => Boolean(member))
        .map((member) => ({
          id: member.id,
          name: member.name,
          avatarUrl: card.assignees.find((item) => item.id === member.id)?.avatarUrl ?? member.avatarUrl ?? null,
        }));
      patchCard({
        title: title.trim(),
        description: description.trim() || null,
        assignees: nextAssignees,
        updatedAt: new Date().toISOString(),
      });
      router.refresh();
    });
  }

  function changeStage(stageId: string) {
    if (!card) return;
    const stage = stages.find((item) => item.id === stageId);
    if (!stage || stageId === card.stageId) return;
    const previous = card;
    patchCard({ stageId, stageName: stage.name, stageColor: stage.color });
    startTransition(async () => {
      const result = await moveWorkItemAction(card.id, stageId);
      if (!result.ok) {
        onChange(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function changeSprint(sprintId: string) {
    if (!card) return;
    const nextSprintId = sprintId || null;
    if (nextSprintId === card.sprintId) return;
    const sprint = nextSprintId ? sprints.find((item) => item.id === nextSprintId) : null;
    const previous = card;
    patchCard({ sprintId: nextSprintId, sprintName: sprint?.name ?? null });
    startTransition(async () => {
      const result = await assignWorkItemSprintAction(card.id, nextSprintId);
      if (!result.ok) {
        onChange(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  function toggleAssignee(memberId: string) {
    setAssigneeIds((current) => (
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    ));
  }

  function reloadCollaboration() {
    setCollaborationError("");
    startCollaborationLoad(async () => {
      try {
        const result = await loadWorkItemCollaborationAction(currentWorkItemId);
        if (!result.ok) {
          setCollaborationError(result.error);
          return;
        }
        setCollaboration(result.data);
      } catch {
        setCollaborationError("Não foi possível carregar a atividade. Tente novamente.");
      }
    });
  }

  function addChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = checklistTitle.trim();
    if (!nextTitle || !collaborationReady) return;
    const formData = new FormData();
    formData.set("title", nextTitle);
    setCollaborationError("");
    startChecklistTransition(async () => {
      try {
        const result = await addWorkItemChecklistItemAction(currentWorkItemId, formData);
        if (!result.ok) {
          setCollaborationError(result.error);
          return;
        }
        setCollaboration((current) => current?.workItemId === currentWorkItemId
          ? { ...current, checklist: [...current.checklist, result.item] }
          : current);
        setChecklistTitle("");
      } catch {
        setCollaborationError("Não foi possível adicionar o item. Tente novamente.");
      }
    });
  }

  async function toggleChecklistItem(itemId: string, completed: boolean) {
    if (!collaborationReady || mutatingChecklistIds.includes(itemId)) return;
    const previous = collaboration.checklist.find((item) => item.id === itemId);
    if (!previous) return;
    const optimisticCompletedAt = completed ? new Date().toISOString() : null;
    setMutatingChecklistIds((current) => [...current, itemId]);
    setCollaboration((current) => current?.workItemId === currentWorkItemId
      ? {
          ...current,
          checklist: current.checklist.map((item) => item.id === itemId
            ? { ...item, completedAt: optimisticCompletedAt }
            : item),
        }
      : current);
    setCollaborationError("");

    try {
      const result = await toggleWorkItemChecklistItemAction(itemId, completed);
      if (!result.ok) {
        setCollaboration((current) => current?.workItemId === currentWorkItemId
          ? {
              ...current,
              checklist: current.checklist.map((item) => item.id === itemId ? previous : item),
            }
          : current);
        setCollaborationError(result.error);
        return;
      }
      setCollaboration((current) => current?.workItemId === currentWorkItemId
        ? {
            ...current,
            checklist: current.checklist.map((item) => item.id === itemId
              ? { ...item, completedAt: result.completedAt }
              : item),
          }
        : current);
    } catch {
      setCollaboration((current) => current?.workItemId === currentWorkItemId
        ? {
            ...current,
            checklist: current.checklist.map((item) => item.id === itemId ? previous : item),
          }
        : current);
      setCollaborationError("Não foi possível atualizar o checklist. Tente novamente.");
    } finally {
      setMutatingChecklistIds((current) => current.filter((id) => id !== itemId));
    }
  }

  async function deleteChecklistItem(itemId: string) {
    if (!collaborationReady || mutatingChecklistIds.includes(itemId)) return;
    setMutatingChecklistIds((current) => [...current, itemId]);
    setCollaborationError("");
    try {
      const result = await deleteWorkItemChecklistItemAction(itemId);
      if (!result.ok) {
        setCollaborationError(result.error);
        return;
      }
      setCollaboration((current) => current?.workItemId === currentWorkItemId
        ? { ...current, checklist: current.checklist.filter((item) => item.id !== itemId) }
        : current);
    } catch {
      setCollaborationError("Não foi possível excluir o item. Tente novamente.");
    } finally {
      setMutatingChecklistIds((current) => current.filter((id) => id !== itemId));
    }
  }

  function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = commentBody.trim();
    if (!body || !collaborationReady) return;
    const formData = new FormData();
    formData.set("body", body);
    setCollaborationError("");
    startCommentTransition(async () => {
      try {
        const result = await addWorkItemCommentAction(currentWorkItemId, formData);
        if (!result.ok) {
          setCollaborationError(result.error);
          return;
        }
        setCollaboration((current) => current?.workItemId === currentWorkItemId
          ? { ...current, comments: [...current.comments, result.comment] }
          : current);
        setCommentBody("");
      } catch {
        setCollaborationError("Não foi possível publicar o comentário. Tente novamente.");
      }
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="work-item-modal work-item-detail-modal"
      aria-label="Detalhes do card"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="work-item-detail-card">
        <header className="work-item-detail-header">
          <div className="work-item-detail-breadcrumb">
            <Link href={`/projetos/${card.projectId}`} className="work-item-detail-epic-link">
              <Layers2 size={13} aria-hidden />
              {card.epicName}
            </Link>
            <span aria-hidden>·</span>
            <span className="work-item-detail-key">{formatWorkItemKey(card.id)}</span>
          </div>
          <div className="work-item-detail-title-row">
            <input
              className="work-item-detail-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Título do card"
              maxLength={200}
            />
            <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="work-item-detail-body">
          <section className="work-item-detail-main">
            <div className="work-item-detail-section">
              <h3>Descrição</h3>
              <textarea
                className="input textarea work-item-detail-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Adicione contexto, critérios de aceite ou links úteis…"
                rows={8}
              />
            </div>

            <div className="work-item-detail-section work-item-detail-checklist">
              <div className="work-item-detail-section-title-row">
                <h3><ListChecks size={16} aria-hidden /> Checklist</h3>
                {collaborationReady && checklist.length > 0 && (
                  <span>{completedChecklistCount} de {checklist.length} concluídos</span>
                )}
              </div>

              {collaborationError && (
                <div className="work-item-collaboration-error" role="alert">
                  <span>{collaborationError}</span>
                  <button type="button" onClick={reloadCollaboration} disabled={collaborationLoading}>
                    Tentar novamente
                  </button>
                </div>
              )}

              {!collaborationReady && !collaborationError && (
                <div className="work-item-collaboration-loading" role="status">
                  <Loader2 size={16} aria-hidden /> Carregando checklist e comentários…
                </div>
              )}

              {collaborationReady && (
                <>
                  {checklist.length > 0 && (
                    <div
                      className="work-item-checklist-progress"
                      role="progressbar"
                      aria-label="Progresso do checklist"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={checklistPercent}
                    >
                      <span style={{ width: `${checklistPercent}%` }} />
                    </div>
                  )}

                  <div className="work-item-checklist-list" aria-live="polite">
                    {checklist.length === 0 ? (
                      <div className="work-item-collaboration-empty">
                        <ListChecks size={18} aria-hidden />
                        <span>Adicione os passos necessários para concluir este card.</span>
                      </div>
                    ) : checklist.map((item) => {
                      const completed = item.completedAt !== null;
                      const itemPending = mutatingChecklistIds.includes(item.id);
                      return (
                        <div className={`work-item-checklist-row ${completed ? "completed" : ""}`} key={item.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={completed}
                              onChange={(event) => toggleChecklistItem(item.id, event.target.checked)}
                              disabled={itemPending}
                            />
                            <span className="work-item-checklist-checkbox" aria-hidden>
                              {completed && <Check size={12} />}
                            </span>
                            <span className="work-item-checklist-title">{item.title}</span>
                          </label>
                          <button
                            type="button"
                            className="work-item-checklist-delete"
                            onClick={() => deleteChecklistItem(item.id)}
                            disabled={itemPending}
                            aria-label={`Excluir ${item.title}`}
                          >
                            {itemPending ? <Loader2 size={14} aria-hidden /> : <Trash2 size={14} aria-hidden />}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <form className="work-item-checklist-add" onSubmit={addChecklistItem}>
                    <label>
                      <Plus size={15} aria-hidden />
                      <input
                        value={checklistTitle}
                        onChange={(event) => setChecklistTitle(event.target.value)}
                        placeholder="Adicionar item ao checklist"
                        aria-label="Novo item do checklist"
                        maxLength={240}
                      />
                    </label>
                    <button
                      type="submit"
                      className="button button-secondary"
                      disabled={checklistAdding || checklistTitle.trim().length < 2}
                    >
                      {checklistAdding && <Loader2 size={14} aria-hidden />} {checklistAdding ? "Adicionando…" : "Adicionar"}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="work-item-detail-section work-item-detail-activity">
              <div className="work-item-detail-section-title-row">
                <h3><MessageSquare size={16} aria-hidden /> Atividade</h3>
                {collaborationReady && (
                  <span>{comments.length} comentário{comments.length === 1 ? "" : "s"}</span>
                )}
              </div>

              {collaborationReady && (
                <>
                  <form className="work-item-comment-composer" onSubmit={addComment}>
                    <ProfileAvatar
                      name={collaboration.viewer.name}
                      src={collaboration.viewer.avatarUrl}
                      size={30}
                    />
                    <div className="work-item-comment-field">
                      <textarea
                        value={commentBody}
                        onChange={(event) => setCommentBody(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                        placeholder="Adicionar comentário…"
                        aria-label="Comentário"
                        maxLength={4000}
                        rows={3}
                      />
                      <div className="work-item-comment-actions">
                        <span>Ctrl + Enter para publicar</span>
                        <button
                          type="submit"
                          className="button button-primary"
                          disabled={commentAdding || commentBody.trim().length === 0}
                        >
                          {commentAdding ? <Loader2 size={14} aria-hidden /> : <Send size={14} aria-hidden />}
                          {commentAdding ? "Publicando…" : "Comentar"}
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="work-item-comments" aria-live="polite">
                    {comments.length === 0 ? (
                      <div className="work-item-collaboration-empty compact">
                        <MessageSquare size={17} aria-hidden />
                        <span>Nenhum comentário ainda. Inicie a conversa sobre este card.</span>
                      </div>
                    ) : comments.map((comment) => (
                      <article className="work-item-comment" key={comment.id}>
                        <ProfileAvatar
                          name={comment.authorName}
                          src={comment.authorAvatarUrl}
                          size={28}
                        />
                        <div>
                          <header>
                            <strong>{comment.authorName}</strong>
                            <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                          </header>
                          <p>{comment.body}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <aside className="work-item-detail-sidebar">
            <div className="work-item-detail-sidebar-heading">Detalhes</div>

            <div className="work-item-detail-property work-item-detail-status">
              <label className="work-item-detail-label" htmlFor="work-item-detail-stage">Status</label>
              <div className="work-item-detail-status-field">
                <span className="stage-dot" style={{ background: card.stageColor }} aria-hidden />
                <select
                  id="work-item-detail-stage"
                  className="work-item-detail-select"
                  value={card.stageId}
                  onChange={(event) => changeStage(event.target.value)}
                  disabled={pending}
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="work-item-detail-property">
              <span className="work-item-detail-label"><UserRound size={14} /> Responsáveis</span>
              <div className="work-item-detail-assignees">
                {members.length > 0 ? members.map((member) => {
                    const checked = assigneeIds.includes(member.id);
                    const avatar = card.assignees.find((item) => item.id === member.id);
                    return (
                      <label key={member.id} className={`work-item-detail-assignee ${checked ? "active" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignee(member.id)}
                        />
                        <ProfileAvatar
                          name={member.name}
                          src={avatar?.avatarUrl ?? member.avatarUrl ?? null}
                          size={24}
                        />
                        <span>{member.name}</span>
                      </label>
                    );
                  }) : (
                    <span className="work-item-detail-empty">Nenhum responsável disponível</span>
                  )}
              </div>
            </div>

            <div className="work-item-detail-property">
              <span className="work-item-detail-label"><Layers2 size={14} /> Epic</span>
              <Link href={`/projetos/${card.projectId}`} className="work-item-detail-link-row">
                <span>{card.epicName}</span>
                <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="work-item-detail-property">
              <span className="work-item-detail-label"><Building2 size={14} /> Cliente</span>
              <span className="work-item-detail-value">{card.clientName}</span>
            </div>

            <div className="work-item-detail-property">
              <span className="work-item-detail-label"><CalendarRange size={14} /> Sprint</span>
              <select
                className="work-item-detail-select"
                value={card.sprintId ?? ""}
                onChange={(event) => changeSprint(event.target.value)}
                disabled={pending}
              >
                <option value="">Backlog (sem sprint)</option>
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                ))}
              </select>
            </div>

            <div className="work-item-detail-meta">
              <p>Criado em {formatDateTime(card.createdAt)}</p>
              <p>Atualizado em {formatDateTime(card.updatedAt)}</p>
            </div>
          </aside>
        </div>

        {error && <p className="form-error work-item-detail-error" role="alert">{error}</p>}

        <footer className="work-item-detail-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>Fechar</button>
          <button type="button" className="button button-primary" onClick={saveDetails} disabled={pending || title.trim().length < 2}>
            <Save size={16} /> {pending ? "Salvando…" : "Salvar alterações"}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
