import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { AuditLogView, type AuditLogFilters } from "@/components/audit/audit-log-view";
import { requireAdminContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";

type AuditLogSearchParams = {
  q?: string | string[];
  acao?: string | string[];
  entidade?: string | string[];
  autor?: string | string[];
};

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogSearchParams>;
}) {
  const context = await requireAdminContext();
  const [{ data }, query] = await Promise.all([
    loadAgencyData(context),
    searchParams,
  ]);
  const filters: AuditLogFilters = {
    q: firstValue(query.q),
    action: firstValue(query.acao),
    entity: firstValue(query.entidade),
    actor: firstValue(query.autor),
  };

  return (
    <>
      <Link className="back-link" href="/configuracoes"><ArrowLeft size={15} /> Voltar às configurações</Link>
      <header className="page-heading page-heading-actions">
        <div>
          <span className="eyebrow">Segurança e rastreabilidade</span>
          <h1>Log de auditoria</h1>
          <p>Consulte criações, edições e exclusões registradas no workspace.</p>
        </div>
        <span className="heading-status"><LockKeyhole size={15} /> Somente leitura · acesso administrativo</span>
      </header>
      <AuditLogView entries={data.auditLog} filters={filters} />
    </>
  );
}
