import { DashboardView } from "@/components/dashboard/dashboard-view";
import { canSeeFinance, requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import {
  buildActivity,
  buildAgenda,
  buildStageMetrics,
  buildFinanceSummary,
} from "@/lib/data/view-models";

export default async function DashboardPage() {
  const context = await requireAuthContext();
  const { data, now } = await loadAgencyData(context);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date(now));

  return <DashboardView
    name={context.name}
    dateLabel={dateLabel}
    metrics={buildStageMetrics(data)}
    agenda={buildAgenda(data, now)}
    finance={buildFinanceSummary(data, now)}
    activity={buildActivity(data, now)}
    showFinance={canSeeFinance(context.role)}
  />;
}
