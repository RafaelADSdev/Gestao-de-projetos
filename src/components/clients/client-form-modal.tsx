"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Save, X } from "lucide-react";
import { createClientAction, updateClientAction } from "@/app/(dashboard)/actions";
import { ProfileAvatar } from "@/components/profile-avatar";

export type ClientFormData = {
  id: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  avatarUrl: string | null;
  activeProjects: number;
};

export function ClientFormModal({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client: ClientFormData | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(client);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) setError("");
  }, [open, client?.id]);

  function submit(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = client
        ? await updateClientAction(client.id, formData)
        : await createClientAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="work-item-modal client-modal"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form action={submit} className="work-item-modal-card client-modal-card" key={client?.id ?? "new"}>
        <header>
          <div>
            <span className="eyebrow">{isEdit ? "Editar cliente" : "Novo cliente"}</span>
            <h2>{isEdit ? client?.name : "Cadastrar cliente"}</h2>
            <p>Informe os dados de contato, foto e observações internas da equipe.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="client-avatar-upload">
          <ProfileAvatar name={client?.name ?? "Cliente"} src={client?.avatarUrl ?? null} size={84} />
          <div>
            <label className="form-field">
              <span>Foto ou logotipo</span>
              <input className="input file-input" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" />
            </label>
            <span className="client-avatar-hint"><Camera size={14} /> JPG, PNG ou WebP · até 2 MB</span>
            {client?.avatarUrl ? (
              <label className="simple-check">
                <input name="remove_avatar" type="checkbox" /> Remover foto atual
              </label>
            ) : null}
          </div>
        </div>

        <div className="client-form-grid">
          <label className="form-field">
            <span>Nome curto</span>
            <input className="input" name="name" required minLength={2} maxLength={160} defaultValue={client?.name ?? ""} placeholder="Ex.: Aurora Cursos" />
          </label>
          <label className="form-field">
            <span>Razão social ou empresa</span>
            <input className="input" name="company_name" defaultValue={client?.companyName ?? ""} placeholder="Opcional" />
          </label>
          <label className="form-field">
            <span>Contato principal</span>
            <input className="input" name="contact_name" defaultValue={client?.contactName ?? ""} placeholder="Nome da pessoa de contato" />
          </label>
          <label className="form-field">
            <span>E-mail</span>
            <input className="input" name="email" type="email" defaultValue={client?.email ?? ""} placeholder="contato@cliente.com" />
          </label>
          <label className="form-field">
            <span>Telefone</span>
            <input className="input" name="phone" defaultValue={client?.phone ?? ""} placeholder="(00) 00000-0000" />
          </label>
        </div>

        <label className="form-field">
          <span>Observações</span>
          <textarea
            className="input textarea"
            name="notes"
            rows={4}
            maxLength={2000}
            defaultValue={client?.notes ?? ""}
            placeholder="Preferências, aprovações, contexto comercial e combinados com o cliente"
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <footer>
          <button type="button" className="button button-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-primary" disabled={pending}>
            <Save size={16} /> {pending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar cliente"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
