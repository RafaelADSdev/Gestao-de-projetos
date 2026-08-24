"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="system-state-page">
      <span className="danger"><AlertTriangle size={29} /></span>
      <p className="eyebrow">Falha temporária</p>
      <h1>Não foi possível carregar esta área</h1>
      <p>Confira sua conexão e tente de novo. Se o problema continuar, verifique as variáveis e o status do Supabase.</p>
      <button type="button" className="button button-primary" onClick={reset}><RefreshCw size={15} /> Tentar novamente</button>
    </main>
  );
}
