"use client";

import { useActionState, type ReactNode } from "react";

type SettingsActionResult =
  | { ok: true; demo?: boolean; message?: string }
  | { ok: false; error: string };

type FormState = {
  tone: "idle" | "success" | "error";
  message: string;
};

const INITIAL_STATE: FormState = { tone: "idle", message: "" };

export function SettingsActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Salvando…",
  successMessage = "Alteração salva.",
  className = "form-grid",
  secondary = false,
  danger = false,
  encType,
}: {
  action: (formData: FormData) => Promise<SettingsActionResult>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  successMessage?: string;
  className?: string;
  secondary?: boolean;
  danger?: boolean;
  encType?: "multipart/form-data";
}) {
  const [state, dispatch, pending] = useActionState<FormState, FormData>(
    async (_previous, formData) => {
      const result = await action(formData);
      if (!result.ok) return { tone: "error", message: result.error };
      return {
        tone: "success",
        message: result.message ?? (result.demo ? "Demonstração atualizada apenas nesta visualização." : successMessage),
      };
    },
    INITIAL_STATE,
  );

  return (
    <form action={dispatch} className={className} encType={encType}>
      {children}
      <div className="form-actions" style={{ alignItems: "center", gap: 12, gridColumn: "1 / -1" }}>
        <span
          aria-live="polite"
          role={state.tone === "error" ? "alert" : "status"}
          style={{
            color: state.tone === "error" ? "#b83232" : "#0b8174",
            fontSize: 9,
            marginRight: "auto",
          }}
        >
          {state.message}
        </span>
        <button
          className={`button ${danger ? "button-danger" : secondary ? "button-secondary" : "button-primary"}`}
          disabled={pending}
          type="submit"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
