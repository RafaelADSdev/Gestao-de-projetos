"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createWorkItemAction } from "@/app/(dashboard)/actions";

type EpicOption = { id: string; name: string; clientName: string };
type MemberOption = { id: string; name: string };
type SprintOption = { id: string; name: string };

export function CreateWorkItemModal({
  open,
  onClose,
  epics,
  members,
  sprints,
  defaultSprintId = null,
}: {
  open: boolean;
  onClose: () => void;
  epics: EpicOption[];
  members: MemberOption[];
  sprints: SprintOption[];
  defaultSprintId?: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await createWorkItemAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <dialog ref={dialogRef} className="work-item-modal" onClose={onClose} onClick={(event) => {
      if (event.target === dialogRef.current) onClose();
    }}>
      <form action={submit} className="work-item-modal-card">
        <header>
          <div>
            <span className="eyebrow">Novo card</span>
            <h2>Criar card de trabalho</h2>
            <p>Escolha o Epic (projeto) e defina quem vai executar esta tarefa.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <label className="form-field">
          <span>Epic (projeto)</span>
          <select className="input" name="project_id" required defaultValue="">
            <option value="" disabled>Selecione o Epic</option>
            {epics.map((epic) => (
              <option value={epic.id} key={epic.id}>{epic.name} · {epic.clientName}</option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Título do card</span>
          <input className="input" name="title" placeholder="Ex.: Implementar checkout" required minLength={2} maxLength={200} />
        </label>

        <label className="form-field">
          <span>Descrição</span>
          <textarea className="input textarea" name="description" rows={3} placeholder="Contexto, critérios ou links úteis" />
        </label>

        <fieldset className="assignee-picker">
          <legend>Responsáveis</legend>
          <div className="assignee-picker-grid">
            {members.map((member) => (
              <label key={member.id} className="assignee-picker-option">
                <input type="checkbox" name="assignee_ids" value={member.id} />
                <span>{member.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="form-field">
          <span>Sprint inicial</span>
          <select className="input" name="sprint_id" defaultValue={defaultSprintId ?? ""}>
            <option value="">Backlog (sem sprint)</option>
            {sprints.map((sprint) => (
              <option value={sprint.id} key={sprint.id}>{sprint.name}</option>
            ))}
          </select>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <footer>
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-primary" disabled={pending}>
            <Plus size={16} /> {pending ? "Criando…" : "Criar card"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
