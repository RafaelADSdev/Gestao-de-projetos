import type { ClockValue } from "./dates";
import { getProjectHealth, type ProjectHealthStatus } from "./health";
import type {
  BoardStageId,
  Client,
  CommercialTerms,
  Deadline,
  Project,
} from "./types";

export interface ProjectFilterContext {
  clients: readonly Client[];
  deadlines: readonly Deadline[];
  commercialTerms?: readonly CommercialTerms[];
  now?: ClockValue;
}

export interface ProjectFilters {
  query?: string;
  stageIds?: readonly BoardStageId[];
  clientIds?: readonly string[];
  ownerIds?: readonly string[];
  healthStatuses?: readonly ProjectHealthStatus[];
  onlyBlocked?: boolean;
  onlyActive?: boolean;
  hasRecurringRevenue?: boolean;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function searchProjects(
  projects: readonly Project[],
  query: string,
  clients: readonly Client[] = [],
): Project[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [...projects];
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));

  return projects.filter((project) => {
    const haystack = normalizeSearchText(
      [
        project.name,
        project.description ?? "",
        project.nextAction ?? "",
        project.blockerReason ?? "",
        clientNames.get(project.clientId) ?? "",
      ].join(" "),
    );
    return haystack.includes(normalizedQuery);
  });
}

export function filterProjects(
  projects: readonly Project[],
  filters: ProjectFilters,
  context: ProjectFilterContext,
): Project[] {
  const termsByProject = new Map(
    (context.commercialTerms ?? []).map((terms) => [terms.projectId, terms]),
  );
  const candidates = filters.query
    ? searchProjects(projects, filters.query, context.clients)
    : [...projects];

  return candidates.filter((project) => {
    if (filters.onlyActive !== false && project.archivedAt !== null) return false;
    if (filters.stageIds?.length && !filters.stageIds.includes(project.stageId)) return false;
    if (filters.clientIds?.length && !filters.clientIds.includes(project.clientId)) return false;
    if (filters.ownerIds?.length && !filters.ownerIds.includes(project.ownerId)) return false;
    if (filters.onlyBlocked && !project.blocked) return false;

    if (filters.healthStatuses?.length) {
      const health = getProjectHealth(project, context.deadlines, context.now);
      if (!filters.healthStatuses.includes(health.status)) return false;
    }

    if (filters.hasRecurringRevenue !== undefined) {
      const terms = termsByProject.get(project.id);
      const hasRevenue =
        terms?.maintenanceStatus === "active" &&
        terms.maintenanceFeeCents !== null &&
        terms.maintenanceFeeCents > 0 &&
        terms.maintenanceBillingCycle !== null;
      if (hasRevenue !== filters.hasRecurringRevenue) return false;
    }

    return true;
  });
}

const HEALTH_PRIORITY: Readonly<Record<ProjectHealthStatus, number>> = {
  overdue: 0,
  blocked: 1,
  "due-soon": 2,
  unscheduled: 3,
  "on-track": 4,
  completed: 5,
  archived: 6,
};

export function sortProjectsByAttention(
  projects: readonly Project[],
  deadlines: readonly Deadline[],
  now: ClockValue = new Date(),
): Project[] {
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return [...projects].sort((left, right) => {
    const leftHealth = getProjectHealth(left, deadlines, now);
    const rightHealth = getProjectHealth(right, deadlines, now);
    const priority = HEALTH_PRIORITY[leftHealth.status] - HEALTH_PRIORITY[rightHealth.status];
    if (priority !== 0) return priority;

    const leftDays = leftHealth.daysUntilNextDeadline ?? Number.POSITIVE_INFINITY;
    const rightDays = rightHealth.daysUntilNextDeadline ?? Number.POSITIVE_INFINITY;
    if (leftDays !== rightDays) return leftDays - rightDays;
    return collator.compare(left.name, right.name);
  });
}

export function groupProjectsByStage(
  projects: readonly Project[],
): Record<BoardStageId, Project[]> {
  const grouped: Record<BoardStageId, Project[]> = {
    entrada: [],
    briefing: [],
    "em-producao": [],
    "aguardando-cliente": [],
    revisao: [],
    publicado: [],
    manutencao: [],
  };
  for (const project of projects) grouped[project.stageId].push(project);
  return grouped;
}
