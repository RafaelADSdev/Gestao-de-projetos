import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { SettingsActionForm } from "./action-form";

type DeleteActionResult =
  | { ok: true; demo?: boolean; message?: string }
  | { ok: false; error: string };

export function DeleteActionForm({
  action,
  children,
  itemLabel,
  summaryLabel = "Excluir",
  description = "Esta ação remove o registro permanentemente. A ocorrência continuará disponível no log de auditoria.",
  className = "",
}: {
  action: (formData: FormData) => Promise<DeleteActionResult>;
  children?: ReactNode;
  itemLabel: string;
  summaryLabel?: string;
  description?: string;
  className?: string;
}) {
  return (
    <details className={`delete-disclosure ${className}`.trim()}>
      <summary aria-label={`${summaryLabel} ${itemLabel}`}>
        <Trash2 aria-hidden="true" size={13} />
        <span>{summaryLabel}</span>
      </summary>
      <div className="delete-confirmation">
        <strong>Excluir {itemLabel}?</strong>
        <p>{description}</p>
        <SettingsActionForm
          action={action}
          className="delete-confirmation-form"
          submitLabel="Excluir permanentemente"
          pendingLabel="Excluindo…"
          successMessage="Registro excluído."
          danger
        >
          {children}
        </SettingsActionForm>
      </div>
    </details>
  );
}
