"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CalendarRange,
  Layers2,
  Save,
  UserRound,
  X,
} from "lucide-react";
import {
  assignWorkItemSprintAction,
  moveWorkItemAction,
  updateWorkItemAction,
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

  if (!card) return null;

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

  return (
    <dialog
      ref={dialogRef}
      className="work-item-modal work-item-detail-modal"
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

            <div className="work-item-detail-section work-item-detail-activity">
              <h3>Atividade</h3>
              <p className="muted-copy">
                Comentários e histórico detalhado chegam em breve. Por enquanto, alterações de etapa e sprint são registradas no Epic.
              </p>
            </div>
          </section>

          <aside className="work-item-detail-sidebar">
            <div className="work-item-detail-status">
              <label htmlFor="work-item-detail-stage">Status</label>
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

            <div className="work-item-detail-field">
              <span className="work-item-detail-label"><UserRound size={14} /> Responsáveis</span>
              <div className="work-item-detail-assignees">
                {members.map((member) => {
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
                })}
              </div>
            </div>

            <div className="work-item-detail-field">
              <span className="work-item-detail-label"><Layers2 size={14} /> Epic</span>
              <Link href={`/projetos/${card.projectId}`} className="work-item-detail-link-row">
                <span>{card.epicName}</span>
                <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="work-item-detail-field">
              <span className="work-item-detail-label"><Building2 size={14} /> Cliente</span>
              <span>{card.clientName}</span>
            </div>

            <div className="work-item-detail-field">
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
