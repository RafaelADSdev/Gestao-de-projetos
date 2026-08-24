import type { ClockValue } from "./dates";
import { calculateFinancialSummary, type FinancialSummary } from "./finance";
import { getDeadlineHealth, getProjectHealth, getUpcomingRenewals } from "./health";
import type { AgencyData } from "./types";

export interface DashboardSnapshot {
  activeProjects: number;
  overdueProjects: number;
  blockedProjects: number;
  waitingClientProjects: number;
  deadlinesDueNext7Days: number;
  renewalsNext30Days: number;
  financial: FinancialSummary;
}

export function buildDashboardSnapshot(
  data: AgencyData,
  now: ClockValue = new Date(),
): DashboardSnapshot {
  const activeProjects = data.projects.filter((project) => project.archivedAt === null);
  const actionableDeadlines = data.deadlines.filter((deadline) => deadline.state === "open");

  return {
    activeProjects: activeProjects.length,
    overdueProjects: activeProjects.filter(
      (project) => getProjectHealth(project, data.deadlines, now).hasOverdueDeadline,
    ).length,
    blockedProjects: activeProjects.filter((project) => project.blocked).length,
    waitingClientProjects: activeProjects.filter(
      (project) => project.stageId === "aguardando-cliente",
    ).length,
    deadlinesDueNext7Days: actionableDeadlines.filter(
      (deadline) => getDeadlineHealth(deadline, now, 7).dueWithinWindow,
    ).length,
    renewalsNext30Days: getUpcomingRenewals(data.subscriptions, now, 30).length,
    financial: calculateFinancialSummary(data.commercialTerms, data.subscriptions),
  };
}

