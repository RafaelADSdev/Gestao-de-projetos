import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="system-state-page">
      <span><SearchX size={29} /></span>
      <p className="eyebrow">Erro 404</p>
      <h1>Não encontramos esta página</h1>
      <p>O projeto pode ter sido arquivado, ou o endereço não pertence a este workspace.</p>
      <Link href="/" className="button button-primary"><ArrowLeft size={15} /> Voltar à visão geral</Link>
    </main>
  );
}
