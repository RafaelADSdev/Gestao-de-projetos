"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" width="14" height="14">
      <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.258c-.806.54-1.835.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.957v2.332A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.963 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.708V4.96H.957A9 9 0 0 0 0 9c0 1.452.347 2.827.957 4.04l3.006-2.332Z" />
      <path fill="#EA4335" d="M9 3.58c1.322 0 2.508.455 3.442 1.346l2.581-2.581C13.463.892 11.425 0 9 0A9 9 0 0 0 .957 4.96l3.006 2.332C4.672 5.163 6.656 3.58 9 3.58Z" />
    </svg>
  );
}

export function GoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      const normalizedMessage = authError.message.toLocaleLowerCase("pt-BR");
      setError(
        normalizedMessage.includes("provider is not enabled")
          ? "O login com Google ainda não está habilitado no Supabase. Ative o provedor Google e tente novamente."
          : "Não foi possível iniciar o login. Confira a configuração do Google no Supabase.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" className="google-button" onClick={signIn} disabled={loading}>
        <span className="google-g"><GoogleLogo /></span>
        {loading ? "Abrindo Google…" : "Continuar com Google"}
        <span aria-hidden="true" />
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
