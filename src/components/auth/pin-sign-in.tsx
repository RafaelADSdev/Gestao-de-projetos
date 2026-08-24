"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function PinSignIn() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLocaleLowerCase("pt-BR");
    const password = String(formData.get("pin") ?? "");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError("E-mail ou PIN incorreto. Confira os dados ou peça uma redefinição ao proprietário.");
      setLoading(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="pin-login-form" onSubmit={signIn}>
      <label className="form-field">
        <span>E-mail</span>
        <input className="input" name="email" type="email" autoComplete="email" required placeholder="voce@agencia.com" />
      </label>
      <label className="form-field">
        <span>PIN de seis dígitos</span>
        <span className="pin-input-wrap"><KeyRound size={15} aria-hidden="true" /><input name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder="••••••" /></span>
      </label>
      <button className="button button-primary button-block" disabled={loading} type="submit">
        {loading ? "Entrando…" : "Entrar com PIN"}<ArrowRight size={17} aria-hidden="true" />
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </form>
  );
}
