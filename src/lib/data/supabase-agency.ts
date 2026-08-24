import "server-only";

import { canSeeFinance, type AuthContext } from "@/lib/auth";
import type {
  ActivityEntry,
  AgencyData,
  AuditLogEntry,
  BillingCycle,
  BoardStage,
  BoardStageId,
  CalendarConnection,
  CalendarEventMapping,
  CalendarSyncJob,
  CommercialTerms,
  CurrencyCode,
  Deadline,
  Member,
  Project,
  ProjectTemplateId,
  ResourceType,
  Sprint,
  Subscription,
  Technology,
  TechnologyCategory,
  Workflow,
  WorkspaceBoardStage,
  WorkspaceRole,
} from "@/lib/domain";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type QueryError = { message?: string; code?: string };
type QueryResult<T> = { data: T | null; error: QueryError | null };

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  created_at: string;
};

type ProfileRow = {
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type WorkspaceMemberRow = {
  workspace_id: string;
  user_id: string;
  role: string;
  status: string;
  pin_changed_at: string | null;
  profiles: ProfileRow | ProfileRow[] | null;
};

type ClientRow = {
  id: string;
  workspace_id: string;
  name: string;
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

type WorkflowRow = {
  id: string;
  workspace_id: string;
  name: string;
  key: string;
  description: string | null;
  sprint_enabled: boolean;
  is_default: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type BoardColumnRow = {
  id: string;
  workspace_id: string;
  workflow_id: string;
  name: string;
  key: string;
  description: string | null;
  position: number;
  color: string;
  is_terminal: boolean;
  archived_at: string | null;
};

type SprintRow = {
  id: string;
  workspace_id: string;
  workflow_id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
};

type TechnologyRow = {
  id: string;
  workspace_id: string;
  name: string;
  category: string;
  color: string;
  website_url: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectTechnologyRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  technology_id: string;
  created_at: string;
};

type ProjectTemplateRow = {
  id: string;
  key: string;
  project_type: string;
};

type ProjectRow = {
  id: string;
  workspace_id: string;
  client_id: string;
  board_column_id: string;
  workflow_id: string | null;
  sprint_id: string | null;
  template_id: string | null;
  project_type: string;
  billing_model: string;
  name: string;
  description: string | null;
  responsible_id: string | null;
  next_action: string | null;
  blocked: boolean;
  blocker_reason: string | null;
  started_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChecklistRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  description: string | null;
  position: number;
  completed_at: string | null;
  completed_by: string | null;
};

type DeadlineRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  kind: string;
  due_date: string;
  due_time: string | null;
  all_day: boolean;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ResourceRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  resource_type: string;
  label: string;
  url: string | null;
  status: string;
  created_at: string;
};

type CommercialTermsRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  currency: string;
  contract_value_cents: number | string | null;
  monthly_revenue_cents: number | string | null;
  maintenance_billing_cycle: string | null;
  maintenance_status: string;
  notes: string | null;
};

type SubscriptionRow = {
  id: string;
  workspace_id: string;
  service_name: string;
  plan_name: string | null;
  category: string;
  billing_cycle: string;
  renewal_date: string;
  auto_renew: boolean;
  payer: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type SubscriptionFinancialRow = {
  subscription_id: string;
  amount_cents: number | string;
  currency: string;
  agency_share_percent: number | string;
  billing_cycle: string;
  vault_reference: string | null;
};

type ProjectSubscriptionRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  subscription_id: string;
};

type ActivityRow = {
  id: string;
  workspace_id: string;
  project_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  project_id: string | null;
  changed_fields: unknown;
  created_at: string;
};

type CalendarConnectionRow = {
  id: string;
  workspace_id: string;
  account_email: string | null;
  calendar_id: string | null;
  calendar_name: string;
  status: string;
  connected_by: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type CalendarEventMappingRow = {
  id: string;
  workspace_id: string;
  calendar_connection_id: string;
  deadline_id: string | null;
  subscription_id: string | null;
  google_event_id: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};

type CalendarSyncJobRow = {
  id: string;
  workspace_id: string;
  deadline_id: string | null;
  subscription_id: string | null;
  operation: string;
  status: string;
  attempts: number;
  available_at: string;
  processed_at: string | null;
  last_error: string | null;
};

/**
 * Loads a complete, workspace-scoped snapshot for Server Components. Every
 * query includes workspace_id even though RLS already enforces the tenant
 * boundary; this both narrows the request and provides defense in depth.
 */
export async function loadSupabaseAgencyData(
  context: AuthContext,
): Promise<AgencyData> {
  const supabase = await createServerSupabaseClient();
  const workspaceId = context.workspaceId;

  const [
    workspaceResult,
    membersResult,
    clientsResult,
    workflowsResult,
    columnsResult,
    sprintsResult,
    technologiesResult,
    projectTechnologiesResult,
    templatesResult,
    projectsResult,
    checklistResult,
    deadlinesResult,
    resourcesResult,
    subscriptionsResult,
    projectSubscriptionsResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("id, name, slug, currency, timezone, created_at")
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select(
        "workspace_id, user_id, role, status, pin_changed_at, profiles(email, full_name, avatar_url)",
      )
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("clients")
      .select(
        "id, workspace_id, name, company_name, contact_name, email, phone, notes, created_at",
      )
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("workflows")
      .select(
        "id, workspace_id, name, key, description, sprint_enabled, is_default, archived_at, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("board_columns")
      .select(
        "id, workspace_id, workflow_id, name, key, description, position, color, is_terminal, archived_at",
      )
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true }),
    supabase
      .from("sprints")
      .select(
        "id, workspace_id, workflow_id, name, goal, status, start_date, end_date, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("start_date", { ascending: false }),
    supabase
      .from("technologies")
      .select(
        "id, workspace_id, name, category, color, website_url, archived_at, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true }),
    supabase
      .from("project_technologies")
      .select("id, workspace_id, project_id, technology_id, created_at")
      .eq("workspace_id", workspaceId),
    supabase
      .from("project_templates")
      .select("id, key, project_type")
      .eq("workspace_id", workspaceId),
    supabase
      .from("projects")
      .select(
        "id, workspace_id, client_id, board_column_id, workflow_id, sprint_id, template_id, project_type, billing_model, name, description, responsible_id, next_action, blocked, blocker_reason, started_at, published_at, archived_at, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("checklist_items")
      .select(
        "id, workspace_id, project_id, title, description, position, completed_at, completed_by",
      )
      .eq("workspace_id", workspaceId)
      .order("position", { ascending: true }),
    supabase
      .from("deadlines")
      .select(
        "id, workspace_id, project_id, title, kind, due_date, due_time, all_day, status, completed_at, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("due_date", { ascending: true }),
    supabase
      .from("project_resources")
      .select(
        "id, workspace_id, project_id, resource_type, label, url, status, created_at",
      )
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .order("created_at", { ascending: true }),
    supabase
      .from("subscriptions")
      .select(
        "id, workspace_id, service_name, plan_name, category, billing_cycle, renewal_date, auto_renew, payer, status, created_at, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("renewal_date", { ascending: true }),
    supabase
      .from("project_subscriptions")
      .select("id, workspace_id, project_id, subscription_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("project_activity")
      .select(
        "id, workspace_id, project_id, actor_id, action, entity_type, entity_id, metadata, created_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  const workspace = requireRecord<WorkspaceRow>(workspaceResult, "workspace");
  const members = requireRows<WorkspaceMemberRow>(membersResult, "equipe").map(
    mapMember,
  );
  const clients = requireRows<ClientRow>(clientsResult, "clientes").map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.created_at,
  }));

  const workflows = requireRows<WorkflowRow>(workflowsResult, "fluxos").map(
    mapWorkflow,
  );
  const boardStages = requireRows<BoardColumnRow>(
    columnsResult,
    "colunas do quadro",
  ).map(mapBoardStage);
  const columnByDatabaseId = new Map(
    boardStages.map((stage) => [stage.databaseId ?? stage.id, stage]),
  );
  const sprints = requireRows<SprintRow>(sprintsResult, "sprints").map(mapSprint);
  const technologies = requireRows<TechnologyRow>(
    technologiesResult,
    "tecnologias",
  ).map(mapTechnology);
  const projectTechnologies = requireRows<ProjectTechnologyRow>(
    projectTechnologiesResult,
    "tecnologias dos projetos",
  ).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    technologyId: row.technology_id,
    createdAt: row.created_at,
  }));
  const templates = requireRows<ProjectTemplateRow>(templatesResult, "modelos de projeto");
  const templateById = new Map(templates.map((row) => [row.id, row]));

  const projects = requireRows<ProjectRow>(projectsResult, "projetos").map((row) =>
    mapProject(row, columnByDatabaseId, templateById),
  );
  const checklistItems = requireRows<ChecklistRow>(
    checklistResult,
    "checklists",
  ).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    position: row.position,
    completed: row.completed_at !== null,
    completedAt: row.completed_at,
    // The current schema records who completed an item. It is the closest
    // persisted equivalent to the domain's assignee field.
    assigneeId: row.completed_by,
  }));
  const deadlines = requireRows<DeadlineRow>(deadlinesResult, "prazos").map(
    mapDeadline,
  );
  const resources = requireRows<ResourceRow>(resourcesResult, "recursos")
    .filter(
      (row): row is ResourceRow & { url: string } =>
        row.status === "active" && typeof row.url === "string" && row.url.length > 0,
    )
    .map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      type: resourceType(row.resource_type),
      label: row.label,
      url: row.url,
      createdAt: row.created_at,
    }));

  const subscriptionRows = requireRows<SubscriptionRow>(
    subscriptionsResult,
    "assinaturas",
  );
  const projectSubscriptions = requireRows<ProjectSubscriptionRow>(
    projectSubscriptionsResult,
    "vinculos de assinaturas",
  ).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    subscriptionId: row.subscription_id,
  }));
  const activity = requireRows<ActivityRow>(activityResult, "historico").map(
    mapActivity,
  );

  let commercialTerms: CommercialTerms[] = [];
  let subscriptionFinancials: SubscriptionFinancialRow[] = [];
  let auditLog: AuditLogEntry[] = [];
  let calendarConnections: CalendarConnection[] = [];
  let calendarEventMappings: CalendarEventMapping[] = [];
  let calendarSyncQueue: CalendarSyncJob[] = [];

  // Members must not even issue financial-table requests. RLS remains the
  // authoritative backstop, while this branch avoids accidental disclosure in
  // logs, timing, or future relaxed policies.
  if (canSeeFinance(context.role)) {
    const [termsResult, financialsResult] = await Promise.all([
      supabase
        .from("commercial_terms")
        .select(
          "id, workspace_id, project_id, currency, contract_value_cents, monthly_revenue_cents, maintenance_billing_cycle, maintenance_status, notes",
        )
        .eq("workspace_id", workspaceId),
      supabase
        .from("subscription_financials")
        .select(
          "subscription_id, amount_cents, currency, agency_share_percent, billing_cycle, vault_reference",
        )
        .eq("workspace_id", workspaceId),
    ]);

    commercialTerms = requireRows<CommercialTermsRow>(
      termsResult,
      "condicoes comerciais",
    ).map(mapCommercialTerms);
    subscriptionFinancials = requireRows<SubscriptionFinancialRow>(
      financialsResult,
      "custos de assinaturas",
    );
  }

  // Calendar integration metadata is admin-only in the database policy.
  if (context.role === "owner" || context.role === "admin") {
    const [connectionsResult, mappingsResult, jobsResult, auditLogResult] = await Promise.all([
      supabase
        .from("calendar_connections")
        .select(
          "id, workspace_id, account_email, calendar_id, calendar_name, status, connected_by, last_sync_at, last_error, created_at, updated_at",
        )
        .eq("workspace_id", workspaceId),
      supabase
        .from("calendar_event_mappings")
        .select(
          "id, workspace_id, calendar_connection_id, deadline_id, subscription_id, google_event_id, status, last_synced_at, last_error",
        )
        .eq("workspace_id", workspaceId),
      supabase
        .from("calendar_sync_jobs")
        .select(
          "id, workspace_id, deadline_id, subscription_id, operation, status, attempts, available_at, processed_at, last_error",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("audit_log")
        .select(
          "id, workspace_id, actor_id, actor_name, actor_email, action, entity_type, entity_id, entity_label, project_id, changed_fields, created_at",
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    calendarConnections = requireRows<CalendarConnectionRow>(
      connectionsResult,
      "conexao do calendario",
    ).map(mapCalendarConnection);
    calendarEventMappings = requireRows<CalendarEventMappingRow>(
      mappingsResult,
      "eventos do calendario",
    ).map(mapCalendarEventMapping);
    calendarSyncQueue = requireRows<CalendarSyncJobRow>(
      jobsResult,
      "fila do calendario",
    ).map(mapCalendarSyncJob);
    auditLog = requireRows<AuditLogRow>(auditLogResult, "log de auditoria").map(
      mapAuditLogEntry,
    );
  }

  const financialBySubscription = new Map(
    subscriptionFinancials.map((row) => [row.subscription_id, row]),
  );
  const subscriptions = subscriptionRows.map((row) =>
    mapSubscription(row, financialBySubscription.get(row.id) ?? null),
  );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      currency: currency(workspace.currency),
      timeZone: workspace.timezone,
      createdAt: workspace.created_at,
    },
    members,
    clients,
    workflows,
    boardStages,
    sprints,
    technologies,
    projectTechnologies,
    projects,
    checklistItems,
    deadlines,
    resources,
    commercialTerms,
    subscriptions,
    projectSubscriptions,
    activity,
    auditLog,
    calendarConnections,
    calendarEventMappings,
    calendarSyncQueue,
  };
}

function mapWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    key: row.key,
    description: row.description,
    sprintEnabled: row.sprint_enabled,
    isDefault: row.is_default,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBoardStage(row: BoardColumnRow): WorkspaceBoardStage {
  const key = boardStage(row.key);
  return {
    // Kanban APIs move projects by key. Keep id/key equal and expose the UUID
    // separately for writes that need the persisted board_columns.id.
    id: key,
    key,
    databaseId: row.id,
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    label: row.name,
    description: row.description ?? "",
    position: row.position,
    color: row.color,
    accent: colorAccent(row.color),
    isTerminal: row.is_terminal,
    archivedAt: row.archived_at,
  };
}

function mapSprint(row: SprintRow): Sprint {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    workflowId: row.workflow_id,
    name: row.name,
    goal: row.goal,
    status:
      row.status === "active" || row.status === "completed"
        ? row.status
        : "planned",
    startDate: row.start_date,
    endDate: row.end_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTechnology(row: TechnologyRow): Technology {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    category: technologyCategory(row.category),
    color: row.color,
    websiteUrl: row.website_url,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMember(row: WorkspaceMemberRow): Member {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const email = profile?.email?.trim() ?? "";
  const name =
    profile?.full_name?.trim() || email.split("@")[0]?.trim() || "Integrante";

  return {
    // responsible_id and actor_id reference profiles/auth user IDs, so the
    // domain member ID must use user_id rather than workspace_members.id.
    id: row.user_id,
    workspaceId: row.workspace_id,
    name,
    email,
    role: workspaceRole(row.role),
    avatarUrl: profile?.avatar_url ?? null,
    pinChangedAt: row.pin_changed_at,
    active: row.status === "active",
  };
}

function mapProject(
  row: ProjectRow,
  columnByDatabaseId: ReadonlyMap<string, BoardStage>,
  templateById: ReadonlyMap<string, ProjectTemplateRow>,
): Project {
  const stage = columnByDatabaseId.get(row.board_column_id);
  if (!stage) {
    throw new Error(`Projeto ${row.id} referencia uma coluna inexistente.`);
  }
  const workflowId = row.workflow_id ?? stage.workflowId;
  if (!workflowId) {
    throw new Error(`Projeto ${row.id} nao possui fluxo configurado.`);
  }

  const template = row.template_id ? templateById.get(row.template_id) : undefined;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id,
    name: row.name,
    description: row.description,
    workflowId,
    stageId: stage.key ?? stage.id,
    sprintId: row.sprint_id,
    templateId: projectTemplateId(template?.key, template?.project_type ?? row.project_type),
    billingModel: projectBillingModel(row.billing_model),
    ownerId: row.responsible_id ?? "",
    nextAction: row.next_action,
    blocked: row.blocked,
    blockerReason: row.blocker_reason,
    startedAt: dateOnly(row.started_at),
    publishedAt: dateOnly(row.published_at),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDeadline(row: DeadlineRow): Deadline {
  const state: Deadline["state"] =
    row.status === "completed" || row.status === "canceled" ? row.status : "open";
  const kind: Deadline["kind"] =
    row.kind === "delivery" ||
    row.kind === "review" ||
    row.kind === "client-content" ||
    row.kind === "launch" ||
    row.kind === "maintenance"
      ? row.kind
      : "other";

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    title: row.title,
    kind,
    dueDate: row.due_date,
    dueTime: row.due_time?.slice(0, 5) ?? null,
    allDay: row.all_day,
    state,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCommercialTerms(row: CommercialTermsRow): CommercialTerms {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    currency: currency(row.currency),
    projectValueCents: nullableCents(row.contract_value_cents),
    maintenanceFeeCents: nullableCents(row.monthly_revenue_cents),
    maintenanceBillingCycle: commercialCycle(row.maintenance_billing_cycle),
    maintenanceStatus:
      row.maintenance_status === "active" ||
      row.maintenance_status === "paused" ||
      row.maintenance_status === "ended"
        ? row.maintenance_status
        : "planned",
    notes: row.notes,
  };
}

function mapSubscription(
  row: SubscriptionRow,
  financial: SubscriptionFinancialRow | null,
): Subscription {
  let amountCents = financial
    ? Math.round(
        cents(financial.amount_cents) *
          (finiteNumber(financial.agency_share_percent, 100) / 100),
      )
    : 0;
  let billingCycle: Subscription["billingCycle"];

  if (row.billing_cycle === "biennial") {
    // The current domain has no biennial value. Normalize the financial amount
    // to an annual equivalent so all dashboard monthly calculations stay exact
    // to the cent (subject only to the domain's documented per-line rounding).
    amountCents = Math.round(amountCents / 2);
    billingCycle = "annual";
  } else {
    billingCycle = recurringCycle(row.billing_cycle);
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    serviceName: row.service_name,
    planName: row.plan_name,
    category:
      row.category === "domain" ||
      row.category === "hosting" ||
      row.category === "email" ||
      row.category === "video" ||
      row.category === "software"
        ? row.category
        : "other",
    amountCents,
    currency: financial ? currency(financial.currency) : "BRL",
    billingCycle,
    renewalDate: row.renewal_date,
    autoRenew: row.auto_renew,
    payer: row.payer === "client" ? "client" : "agency",
    vaultReference: financial?.vault_reference ?? null,
    status:
      row.status === "paused" || row.status === "canceled" ? row.status : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapActivity(row: ActivityRow): ActivityEntry {
  const action = activityAction(row.action);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    actorId: row.actor_id ?? "",
    entityType: activityEntityType(row.entity_type),
    entityId: row.entity_id ?? row.project_id,
    action,
    summary:
      metadataString(row.metadata, "summary") ??
      metadataString(row.metadata, "note") ??
      defaultActivitySummary(action),
    createdAt: row.created_at,
  };
}

function mapAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    actorName: row.actor_name.trim() || "Conta removida",
    actorEmail: row.actor_email?.trim() ?? "",
    action: auditLogAction(row.action),
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label.trim() || `${row.entity_type} ${row.entity_id}`,
    projectId: row.project_id,
    changedFields: safeChangedFieldNames(row.changed_fields),
    createdAt: row.created_at,
  };
}

function mapCalendarConnection(row: CalendarConnectionRow): CalendarConnection {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectedByMemberId: row.connected_by ?? "",
    accountEmail: row.account_email ?? "",
    calendarId: row.calendar_id ?? "",
    calendarName: row.calendar_name,
    status:
      row.status === "connected"
        ? "connected"
        : row.status === "disconnected" || row.status === "pending"
          ? "disconnected"
          : "needs-reauthorization",
    lastSyncedAt: row.last_sync_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCalendarEventMapping(row: CalendarEventMappingRow): CalendarEventMapping {
  const sourceType = row.deadline_id ? "deadline" : "renewal";
  const sourceId = row.deadline_id ?? row.subscription_id;
  if (!sourceId) throw new Error(`Vinculo de calendario ${row.id} sem origem.`);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    connectionId: row.calendar_connection_id,
    sourceType,
    sourceId,
    googleEventId: row.google_event_id,
    syncState:
      row.status === "synced" ? "synced" : row.status === "failed" ? "failed" : "pending",
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
  };
}

function mapCalendarSyncJob(row: CalendarSyncJobRow): CalendarSyncJob {
  const sourceType = row.deadline_id ? "deadline" : "renewal";
  const sourceId = row.deadline_id ?? row.subscription_id;
  if (!sourceId) throw new Error(`Job de calendario ${row.id} sem origem.`);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceType,
    sourceId,
    operation: row.operation === "delete" ? "delete" : "upsert",
    state:
      row.status === "processing"
        ? "processing"
        : row.status === "succeeded"
          ? "completed"
          : row.status === "failed" || row.status === "dead_letter"
            ? "failed"
            : "pending",
    attempts: row.attempts,
    availableAt: row.available_at,
    processedAt: row.processed_at,
    lastError: row.last_error,
  };
}

function requireRows<T>(result: unknown, label: string): T[] {
  const typed = result as QueryResult<T[]>;
  assertQuery(typed.error, label);
  return typed.data ?? [];
}

function requireRecord<T>(result: unknown, label: string): T {
  const typed = result as QueryResult<T>;
  assertQuery(typed.error, label);
  if (!typed.data) throw new Error(`Nenhum registro encontrado para ${label}.`);
  return typed.data;
}

function assertQuery(error: QueryError | null, label: string): void {
  if (!error) return;
  const details = [error.code, error.message].filter(Boolean).join(" ");
  throw new Error(`Nao foi possivel carregar ${label}${details ? `: ${details}` : "."}`);
}

function workspaceRole(value: string): WorkspaceRole {
  return value === "owner" || value === "admin" ? value : "member";
}

function boardStage(value: string): BoardStageId {
  const key = value.trim();
  if (!key) throw new Error("Coluna de quadro sem chave configurada.");
  return key;
}

function colorAccent(value: string): string {
  const accents: Record<string, string> = {
    "#94a3b8": "slate",
    "#3b82f6": "blue",
    "#2563eb": "blue",
    "#8b5cf6": "violet",
    "#f59e0b": "amber",
    "#06b6d4": "cyan",
    "#10b981": "green",
    "#14b8a6": "teal",
  };
  return accents[value.toLowerCase()] ?? "custom";
}

function technologyCategory(value: string): TechnologyCategory {
  return value === "frontend" ||
    value === "backend" ||
    value === "database" ||
    value === "infrastructure" ||
    value === "design" ||
    value === "analytics"
    ? value
    : "other";
}

function projectTemplateId(
  templateKey: string | undefined,
  projectType: string,
): ProjectTemplateId {
  if (templateKey === "site-institucional") return "site-institucional";
  if (templateKey === "plataforma-cursos" || templateKey === "plataforma-de-cursos") {
    return "plataforma-cursos";
  }
  if (templateKey === "manutencao") return "manutencao";

  if (projectType === "course_platform") return "plataforma-cursos";
  if (projectType === "maintenance") return "manutencao";
  return "site-institucional";
}

function projectBillingModel(value: string): Project["billingModel"] {
  if (value === "one_time") return "one-time";
  if (value === "recurring" || value === "hybrid") return value;
  return "none";
}

function resourceType(value: string): ResourceType {
  return value === "production" ||
    value === "staging" ||
    value === "admin" ||
    value === "github" ||
    value === "figma" ||
    value === "drive" ||
    value === "documentation"
    ? value
    : "other";
}

function commercialCycle(value: string | null): BillingCycle | null {
  return value === "monthly" ||
    value === "quarterly" ||
    value === "semiannual" ||
    value === "annual" ||
    value === "one-time"
    ? value
    : null;
}

function recurringCycle(value: string): Subscription["billingCycle"] {
  return value === "quarterly" || value === "semiannual" || value === "annual"
    ? value
    : "monthly";
}

function activityAction(value: string): ActivityEntry["action"] {
  if (value === "moved" || value === "stage_changed" || value.includes("move")) {
    return "moved";
  }
  if (value === "completed" || value.includes("complete")) return "completed";
  if (value === "archived" || value.includes("archive")) return "archived";
  if (value === "synced" || value.includes("sync")) return "synced";
  if (value === "created" || value.includes("create") || value.includes("seed")) {
    return "created";
  }
  return "updated";
}

function auditLogAction(value: string): AuditLogEntry["action"] {
  if (value === "created" || value === "updated" || value === "deleted") {
    return value;
  }
  throw new Error(`Acao desconhecida no log de auditoria: ${value}.`);
}

function safeChangedFieldNames(value: unknown): string[] {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.keys(value)
      : [];
  const sensitive = /password|senha|secret|token|credential|cipher|private.?key|authorization|cookie/i;
  return [...new Set(
    candidates
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item.length <= 120 && !sensitive.test(item)),
  )].slice(0, 50);
}

function activityEntityType(value: string | null): ActivityEntry["entityType"] {
  if (value === "client") return "client";
  if (value === "checklist" || value === "checklist_item") return "checklist";
  if (value === "deadline") return "deadline";
  if (value === "resource" || value === "project_resource") return "resource";
  if (value === "commercial-terms" || value === "commercial_terms") {
    return "commercial-terms";
  }
  if (value === "subscription") return "subscription";
  if (value === "calendar" || value === "calendar_connection") return "calendar";
  return "project";
}

function defaultActivitySummary(action: ActivityEntry["action"]): string {
  const summaries: Record<ActivityEntry["action"], string> = {
    created: "Criou um registro no projeto.",
    updated: "Atualizou o projeto.",
    moved: "Moveu o projeto no quadro.",
    completed: "Concluiu uma etapa do projeto.",
    archived: "Arquivou um registro do projeto.",
    synced: "Sincronizou um registro do projeto.",
  };
  return summaries[action];
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function currency(value: string): CurrencyCode {
  if (value !== "BRL") {
    throw new Error(`Moeda ainda nao suportada pelo MVP: ${value}.`);
  }
  return "BRL";
}

function nullableCents(value: number | string | null): number | null {
  return value === null ? null : cents(value);
}

function cents(value: number | string): number {
  const parsed = finiteNumber(value, Number.NaN);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Valor financeiro invalido ou fora do limite seguro.");
  }
  return parsed;
}

function finiteNumber(value: number | string, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
