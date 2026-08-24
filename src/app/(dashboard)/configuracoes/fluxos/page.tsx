import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { WorkflowAdmin } from "@/components/settings/workflow-admin";
import { requireAdminContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";

type WorkflowSettingsFilters = {
  fluxo?: string;
};

export default async function WorkflowSettingsPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowSettingsFilters>;
}) {
  const context = await requireAdminContext();
  const [{ data }, filters] = await Promise.all([
    loadAgencyData(context),
    searchParams,
  ]);

  return (
    <>
      <Link className="back-link" href="/configuracoes"><ArrowLeft size={15} /> Voltar às configurações</Link>
      <header className="page-heading page-heading-actions">
        <div>
          <span className="eyebrow">Administração do trabalho</span>
          <h1>Fluxos, sprints e tecnologias</h1>
          <p>Configure quadros independentes como no Jira e mantenha a stack dos projetos consistente.</p>
        </div>
        <span className="heading-status"><GitBranch size={15} /> Alterações restritas a administradores</span>
      </header>
      <WorkflowAdmin data={data} selectedWorkflowId={filters.fluxo} />
    </>
  );
}
