import { DashboardView } from "@/components/dashboard/dashboard-view";
import { canSeeFinance, requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import {
  buildActivity,
  buildAgenda,
  buildBoardStages,
  buildDashboardMetrics,
  buildFinanceSummary,
  buildProjectCards,
} from "@/lib/data/view-models";

export default async function DashboardPage() {
  const context = await requireAuthContext();
  const { data, now } = await loadAgencyData(context);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date(now));
  const defaultWorkflow = data.workflows.find((workflow) => workflow.isDefault && !workflow.archivedAt)
    ?? data.workflows.find((workflow) => !workflow.archivedAt);
  const projects = buildProjectCards(data, now).filter((project) => !defaultWorkflow || project.workflowId === defaultWorkflow.id);

  return <DashboardView
    name={context.name}
    dateLabel={dateLabel}
    metrics={buildDashboardMetrics(data, now)}
    stages={defaultWorkflow ? buildBoardStages(data, defaultWorkflow.id) : []}
    projects={projects}
    agenda={buildAgenda(data, now)}
    finance={buildFinanceSummary(data, now)}
    activity={buildActivity(data, now)}
    showFinance={canSeeFinance(context.role)}
  />;
}
