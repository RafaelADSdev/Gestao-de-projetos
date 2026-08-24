import type {
  AdministrativeExpense,
  ActivityEntry,
  AgencyData,
  Client,
  Project,
  Subscription,
  Technology,
  Workflow,
} from "@/lib/domain";
import {
  BOARD_STAGES,
  buildDashboardSnapshot,
  calculateMonthlyCostsByCategory,
  formatCurrencyBRL,
  formatDeadlineLabel,
  formatRenewalLabel,
  getNextDeadline,
  getProjectHealth,
  getRenewalHealth,
  monthlyEquivalentCents,
} from "@/lib/domain";
import type { DashboardMetric, AgendaItemView, FinanceSummaryView, ActivityView } from "@/components/dashboard/dashboard-view";
import type { BoardStageData, ProjectCardData, ProjectHealth } from "@/components/projects/types";

const defaultStageColors: Record<string, string> = {
  entrada: "#94a3b8",
  briefing: "#3b82f6",
  "em-producao": "#8b5cf6",
  "aguardando-cliente": "#f59e0b",
  revisao: "#06b6d4",
  publicado: "#10b981",
  manutencao: "#14b8a6",
};

function healthToCard(status: ReturnType<typeof getProjectHealth>["status"]): ProjectHealth {
  if (status === "overdue") return "late";
  if (status === "blocked") return "waiting";
  if (status === "due-soon") return "attention";
  return "on-track";
}

function friendlyTemplate(template: Project["templateId"]) {
  return template === "site-institucional" ? "Site institucional" : template === "plataforma-cursos" ? "Plataforma de cursos" : "Manutenção";
}

export type BoardStageView = BoardStageData & {
  key: string;
  databaseId: string | null;
  workflowId: string;
  isTerminal: boolean;
};

export function getDefaultWorkflow(data: AgencyData): Workflow | null {
  return data.workflows.find((workflow) => workflow.isDefault && !workflow.archivedAt)
    ?? data.workflows.find((workflow) => !workflow.archivedAt)
    ?? null;
}

/** Returns the ordered columns for one workflow. */
export function buildBoardStages(
  data?: AgencyData,
  workflowId?: string,
): BoardStageView[] {
  if (!data) {
    return BOARD_STAGES.map((stage) => ({
      id: stage.id,
      key: stage.key ?? stage.id,
      databaseId: stage.databaseId ?? null,
      workflowId: stage.workflowId ?? "legacy-default",
      name: stage.label,
      description: stage.description,
      color: stage.color ?? defaultStageColors[stage.id] ?? "#64748B",
      position: stage.position,
      isTerminal: stage.isTerminal ?? stage.id === "publicado",
    }));
  }

  const selectedWorkflowId = workflowId ?? getDefaultWorkflow(data)?.id;
  return data.boardStages
    .filter(
      (stage) =>
        !stage.archivedAt &&
        (!selectedWorkflowId || stage.workflowId === selectedWorkflowId),
    )
    .sort((left, right) => left.position - right.position)
    .map((stage) => ({
      id: stage.id,
      key: stage.key ?? stage.id,
      databaseId: stage.databaseId ?? null,
      workflowId: stage.workflowId ?? selectedWorkflowId ?? "legacy-default",
      name: stage.label,
      description: stage.description,
      color: stage.color ?? defaultStageColors[stage.id] ?? "#64748B",
      position: stage.position,
      isTerminal: stage.isTerminal ?? stage.id === "publicado",
    }));
}

export type ProjectCardView = ProjectCardData & {
  workflowId: string;
  workflowName: string;
  sprintId: string | null;
  sprintName: string | null;
  sprintStatus: "planned" | "active" | "completed" | null;
  isBacklog: boolean;
  technologies: Technology[];
  technologyNames: string[];
};

export type ProjectCardFilters = {
  workflowId?: string;
  /** Pass null explicitly to return only the workflow backlog. */
  sprintId?: string | null;
  includeArchived?: boolean;
};

export function buildProjectCards(
  data: AgencyData,
  now: Date | string,
  filters: ProjectCardFilters = {},
): ProjectCardView[] {
  return data.projects
    .filter((project) => filters.includeArchived || project.archivedAt === null)
    .filter((project) => !filters.workflowId || project.workflowId === filters.workflowId)
    .filter(
      (project) => filters.sprintId === undefined || project.sprintId === filters.sprintId,
    )
    .map((project) => {
    const client = data.clients.find((item) => item.id === project.clientId);
    const member = data.members.find((item) => item.id === project.ownerId);
    const stage = data.boardStages.find(
      (item) => item.workflowId === project.workflowId && item.id === project.stageId,
    );
    const workflow = data.workflows.find((item) => item.id === project.workflowId);
    const sprint = project.sprintId
      ? data.sprints.find((item) => item.id === project.sprintId)
      : null;
    const technologyIds = new Set(
      data.projectTechnologies
        .filter((item) => item.projectId === project.id)
        .map((item) => item.technologyId),
    );
    const technologies = data.technologies.filter((item) => technologyIds.has(item.id));
    const health = getProjectHealth(project, data.deadlines, now);
    const nextDeadline = getNextDeadline(project.id, data.deadlines);
    return {
      id: project.id,
      name: project.name,
      clientName: client?.name ?? "Cliente não informado",
      stageId: project.stageId,
      stageName: stage?.label ?? project.stageId,
      workflowId: project.workflowId,
      workflowName: workflow?.name ?? "Fluxo não informado",
      sprintId: project.sprintId,
      sprintName: sprint?.name ?? null,
      sprintStatus: sprint?.status ?? null,
      isBacklog: Boolean(workflow?.sprintEnabled && project.sprintId === null),
      technologies,
      technologyNames: technologies.map((technology) => technology.name),
      responsibleName: member?.name ?? "Sem responsável",
      responsibleAvatarUrl: member?.avatarUrl ?? null,
      nextAction: project.nextAction ?? "Definir próxima ação",
      deadlineLabel: nextDeadline ? formatDeadlineLabel(nextDeadline.dueDate, now) : "Sem prazo",
      deadlineDate: nextDeadline?.dueDate ?? null,
      health: healthToCard(health.status),
      blocked: project.blocked,
      archived: project.archivedAt !== null,
      hasRecurringRevenue: project.billingModel === "recurring" || project.billingModel === "hybrid",
      projectType: friendlyTemplate(project.templateId),
      resources: data.resources.filter((item) => item.projectId === project.id).map((resource) => ({
        id: resource.id,
        label: resource.label,
        type: resource.type === "documentation" ? "docs" : resource.type,
        url: resource.url,
      })),
    };
  });
}

export function buildDashboardMetrics(data: AgencyData, now: Date | string): DashboardMetric[] {
  const snapshot = buildDashboardSnapshot(data, now);
  return [
    { label: "Projetos atrasados", value: String(snapshot.overdueProjects), note: "Precisam de uma nova ação hoje", tone: "danger", kind: "late" },
    { label: "Próximos 7 dias", value: String(snapshot.deadlinesDueNext7Days), note: "Entregas e revisões no radar", tone: "warning", kind: "upcoming" },
    { label: "Projetos bloqueados", value: String(snapshot.blockedProjects), note: "Precisam de decisão ou material", tone: "warning", kind: "blocked" },
    { label: "Aguardando cliente", value: String(snapshot.waitingClientProjects), note: "Dependem de retorno externo", tone: "blue", kind: "waiting" },
    { label: "Renovações em 30 dias", value: String(snapshot.renewalsNext30Days), note: "Domínios e serviços recorrentes", tone: "teal", kind: "renewal" },
  ];
}

function dateParts(date: string) {
  const value = new Date(`${date}T12:00:00-03:00`);
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "America/Sao_Paulo" }).format(value),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" }).format(value).replace(".", ""),
  };
}

export function buildAgenda(data: AgencyData, now: Date | string, limit = 4): AgendaItemView[] {
  const deadlines = data.deadlines.filter((item) => item.state === "open").map((deadline) => {
    const project = data.projects.find((item) => item.id === deadline.projectId);
    const health = getProjectHealth(project!, [deadline], now);
    const parts = dateParts(deadline.dueDate);
    return {
      id: deadline.id,
      sortDate: deadline.dueDate,
      date: parts.day,
      month: parts.month,
      title: deadline.title,
      project: project?.name ?? "Projeto",
      label: formatDeadlineLabel(deadline.dueDate, now),
      tone: (health.status === "overdue" ? "danger" : health.status === "due-soon" ? "warning" : "normal") as AgendaItemView["tone"],
    };
  });
  const renewals = data.subscriptions.filter((item) => item.status === "active").map((subscription) => {
    const parts = dateParts(subscription.renewalDate);
    const health = getRenewalHealth(subscription, now, 30);
    return {
      id: subscription.id,
      sortDate: subscription.renewalDate,
      date: parts.day,
      month: parts.month,
      title: `Renovação · ${subscription.serviceName}`,
      project: subscription.planName ?? "Assinatura da agência",
      label: formatRenewalLabel(subscription.renewalDate, now),
      tone: (health.timing === "overdue" ? "danger" : health.dueWithinWindow ? "warning" : "normal") as AgendaItemView["tone"],
    };
  });
  return [...deadlines, ...renewals]
    .sort((left, right) => left.sortDate.localeCompare(right.sortDate))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      date: item.date,
      month: item.month,
      title: item.title,
      project: item.project,
      label: item.label,
      tone: item.tone,
    }));
}

export function buildFinanceSummary(data: AgencyData, now: Date | string): FinanceSummaryView {
  const snapshot = buildDashboardSnapshot(data, now).financial;
  return {
    monthlyRevenue: formatCurrencyBRL(snapshot.monthlyRecurringRevenueCents, { showCents: false }),
    monthlyCost: formatCurrencyBRL(snapshot.monthlyRecurringCostCents, { showCents: false }),
    margin: formatCurrencyBRL(snapshot.monthlyMarginCents, { showCents: false }),
    marginPercent: Math.max(0, Math.round(snapshot.marginPercent ?? 0)),
  };
}

export function buildActivity(data: AgencyData, now: Date | string): ActivityView[] {
  return [...data.activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((entry) => {
    const member = data.members.find((item) => item.id === entry.actorId);
    const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
    const hours = Math.round((new Date(entry.createdAt).getTime() - new Date(now).getTime()) / 3_600_000);
    const days = Math.round(hours / 24);
    const when = Math.abs(hours) < 24
      ? relative.format(hours, "hour")
      : Math.abs(days) < 8
        ? relative.format(days, "day")
        : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(entry.createdAt));
    return { id: entry.id, text: entry.summary, actor: member?.name.split(" ")[0] ?? "Equipe", when, tone: entry.action === "completed" ? "#14b8a6" : entry.action === "moved" ? "#8b5cf6" : "#3b82f6" };
  });
}

export type ClientListItem = Client & { activeProjects: number; recurringRevenueCents: number; nextProject: string | null };
export function buildClientList(data: AgencyData): ClientListItem[] {
  return data.clients.map((client) => {
    const projects = data.projects.filter((project) => project.clientId === client.id && project.archivedAt === null);
    const revenue = data.commercialTerms.filter((term) => projects.some((project) => project.id === term.projectId) && term.maintenanceStatus === "active").reduce((sum, term) => sum + monthlyEquivalentCents(term.maintenanceFeeCents ?? 0, term.maintenanceBillingCycle ?? "monthly"), 0);
    return { ...client, activeProjects: projects.length, recurringRevenueCents: revenue, nextProject: projects[0]?.name ?? null };
  });
}

export type SubscriptionView = Subscription & { projects: string[]; monthlyCents: number; renewalLabel: string };
export function buildSubscriptions(data: AgencyData, now: Date | string): SubscriptionView[] {
  return data.subscriptions.map((subscription) => {
    const linked = data.projectSubscriptions.filter((item) => item.subscriptionId === subscription.id);
    return {
      ...subscription,
      projects: linked.map((link) => data.projects.find((project) => project.id === link.projectId)?.name).filter((name): name is string => Boolean(name)),
      monthlyCents: monthlyEquivalentCents(subscription.amountCents, subscription.billingCycle),
      renewalLabel: formatRenewalLabel(subscription.renewalDate, now),
    };
  });
}

export type AdministrativeExpenseView = AdministrativeExpense & { monthlyCents: number };

export function buildAdministrativeExpenses(data: AgencyData): AdministrativeExpenseView[] {
  return data.administrativeExpenses.map((expense) => ({
    ...expense,
    monthlyCents: monthlyEquivalentCents(expense.amountCents, expense.billingCycle),
  }));
}

export function getProjectDetail(data: AgencyData, id: string, now: Date | string) {
  const project = data.projects.find((item) => item.id === id);
  if (!project) return null;
  const technologyIds = new Set(
    data.projectTechnologies
      .filter((item) => item.projectId === id)
      .map((item) => item.technologyId),
  );
  return {
    project,
    client: data.clients.find((item) => item.id === project.clientId) ?? null,
    member: data.members.find((item) => item.id === project.ownerId) ?? null,
    workflow: data.workflows.find((item) => item.id === project.workflowId) ?? null,
    stage: data.boardStages.find(
      (item) => item.workflowId === project.workflowId && item.id === project.stageId,
    ) ?? null,
    sprint: project.sprintId
      ? data.sprints.find((item) => item.id === project.sprintId) ?? null
      : null,
    isBacklog: Boolean(
      data.workflows.find((item) => item.id === project.workflowId)?.sprintEnabled &&
      project.sprintId === null,
    ),
    technologies: data.technologies.filter((item) => technologyIds.has(item.id)),
    checklist: data.checklistItems.filter((item) => item.projectId === id).sort((a, b) => a.position - b.position),
    deadlines: data.deadlines.filter((item) => item.projectId === id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    resources: data.resources.filter((item) => item.projectId === id),
    terms: data.commercialTerms.find((item) => item.projectId === id) ?? null,
    subscriptions: buildSubscriptions(data, now).filter((item) => data.projectSubscriptions.some((link) => link.projectId === id && link.subscriptionId === item.id)),
    activity: data.activity.filter((item: ActivityEntry) => item.projectId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export function buildCostsByCategory(data: AgencyData) {
  return calculateMonthlyCostsByCategory(data.subscriptions, data.administrativeExpenses);
}
