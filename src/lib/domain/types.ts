/**
 * Domain values intentionally use JSON-safe primitives only. Dates are ISO
 * strings and monetary values are integer cents so the same objects can cross
 * the Server Component boundary or be persisted without custom serializers.
 */
export type ISODate = string;
export type ISODateTime = string;
export type CurrencyCode = "BRL";

export type WorkspaceRole = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  currency: CurrencyCode;
  timeZone: string;
  createdAt: ISODateTime;
}

export interface Member {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  avatarUrl: string | null;
  pinChangedAt: ISODateTime | null;
  active: boolean;
}

export interface Client {
  id: string;
  workspaceId: string;
  name: string;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: ISODateTime;
}

/**
 * Stage keys are workspace-configurable. Default keys such as `publicado` and
 * `manutencao` remain meaningful to the current health rules, but custom
 * workflows are no longer constrained to a compile-time union.
 */
export type BoardStageId = string;

export interface Workflow {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string | null;
  sprintEnabled: boolean;
  isDefault: boolean;
  archivedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BoardStage {
  id: BoardStageId;
  /** Same configurable key used by Project.stageId and Kanban actions. */
  key?: BoardStageId;
  /** Supabase UUID; omitted only by the legacy static fallback constants. */
  databaseId?: string;
  workspaceId?: string;
  workflowId?: string;
  label: string;
  description: string;
  position: number;
  color?: string;
  accent: string;
  isTerminal?: boolean;
  archivedAt?: ISODateTime | null;
}

/** Fully persisted stage shape used by AgencyData. */
export interface WorkspaceBoardStage extends BoardStage {
  key: BoardStageId;
  databaseId: string;
  workspaceId: string;
  workflowId: string;
  color: string;
  isTerminal: boolean;
  archivedAt: ISODateTime | null;
}

export type SprintStatus = "planned" | "active" | "completed";

export interface Sprint {
  id: string;
  workspaceId: string;
  workflowId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: ISODate;
  endDate: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type TechnologyCategory =
  | "frontend"
  | "backend"
  | "database"
  | "infrastructure"
  | "design"
  | "analytics"
  | "other";

export interface Technology {
  id: string;
  workspaceId: string;
  name: string;
  category: TechnologyCategory;
  color: string;
  websiteUrl: string | null;
  archivedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectTechnology {
  id: string;
  workspaceId: string;
  projectId: string;
  technologyId: string;
  createdAt: ISODateTime;
}

export type ProjectTemplateId =
  | "site-institucional"
  | "plataforma-cursos"
  | "manutencao";

export type ResourceType =
  | "production"
  | "staging"
  | "admin"
  | "github"
  | "figma"
  | "drive"
  | "documentation"
  | "other";

export interface ChecklistTemplateItem {
  title: string;
  description: string | null;
  position: number;
}

export interface ProjectTemplate {
  id: ProjectTemplateId;
  name: string;
  description: string;
  checklist: readonly ChecklistTemplateItem[];
  expectedResourceTypes: readonly ResourceType[];
}

export interface Project {
  id: string;
  workspaceId: string;
  clientId: string;
  name: string;
  description: string | null;
  workflowId: string;
  stageId: BoardStageId;
  /** Null means backlog when the selected workflow uses sprints. */
  sprintId: string | null;
  templateId: ProjectTemplateId;
  billingModel: "none" | "one-time" | "recurring" | "hybrid";
  ownerId: string;
  nextAction: string | null;
  blocked: boolean;
  blockerReason: string | null;
  startedAt: ISODate | null;
  publishedAt: ISODate | null;
  archivedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ChecklistItem {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  position: number;
  completed: boolean;
  completedAt: ISODateTime | null;
  assigneeId: string | null;
}

export type DeadlineKind =
  | "delivery"
  | "review"
  | "client-content"
  | "launch"
  | "maintenance"
  | "other";

export type DeadlineState = "open" | "completed" | "canceled";

export interface Deadline {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  kind: DeadlineKind;
  dueDate: ISODate;
  dueTime: string | null;
  allDay: boolean;
  state: DeadlineState;
  completedAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectResource {
  id: string;
  workspaceId: string;
  projectId: string;
  type: ResourceType;
  label: string;
  url: string;
  createdAt: ISODateTime;
}

export type BillingCycle =
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "one-time";

export type CommercialStatus = "planned" | "active" | "paused" | "ended";

export interface CommercialTerms {
  id: string;
  workspaceId: string;
  projectId: string;
  currency: CurrencyCode;
  projectValueCents: number | null;
  maintenanceFeeCents: number | null;
  maintenanceBillingCycle: BillingCycle | null;
  maintenanceStatus: CommercialStatus;
  notes: string | null;
}

export type SubscriptionCategory =
  | "domain"
  | "hosting"
  | "email"
  | "video"
  | "software"
  | "other";

export type SubscriptionPayer = "agency" | "client";
export type SubscriptionStatus = "active" | "paused" | "canceled";

export interface Subscription {
  id: string;
  workspaceId: string;
  serviceName: string;
  planName: string | null;
  category: SubscriptionCategory;
  amountCents: number;
  currency: CurrencyCode;
  billingCycle: Exclude<BillingCycle, "one-time">;
  renewalDate: ISODate;
  autoRenew: boolean;
  payer: SubscriptionPayer;
  vaultReference: string | null;
  status: SubscriptionStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type AdministrativeExpenseCategory =
  | "people"
  | "software"
  | "marketing"
  | "office"
  | "taxes"
  | "banking"
  | "other";

export type AdministrativeExpenseStatus = "active" | "paused" | "canceled";

export interface AdministrativeExpense {
  id: string;
  workspaceId: string;
  name: string;
  category: AdministrativeExpenseCategory;
  amountCents: number;
  currency: CurrencyCode;
  billingCycle: BillingCycle;
  dueDate: ISODate | null;
  status: AdministrativeExpenseStatus;
  notes: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectSubscription {
  id: string;
  workspaceId: string;
  projectId: string;
  subscriptionId: string;
}

export type ActivityEntityType =
  | "client"
  | "project"
  | "checklist"
  | "deadline"
  | "resource"
  | "commercial-terms"
  | "subscription"
  | "calendar";

export interface ActivityEntry {
  id: string;
  workspaceId: string;
  projectId: string | null;
  actorId: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: "created" | "updated" | "moved" | "completed" | "archived" | "synced";
  summary: string;
  createdAt: ISODateTime;
}

export type AuditLogAction = "created" | "updated" | "deleted";

/**
 * Immutable audit metadata. `changedFields` contains field names only; before
 * and after values, credentials and integration tokens never cross this model.
 */
export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  action: AuditLogAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  projectId: string | null;
  changedFields: readonly string[];
  createdAt: ISODateTime;
}

/** Public calendar state. OAuth access/refresh tokens never enter this model. */
export interface CalendarConnection {
  id: string;
  workspaceId: string;
  connectedByMemberId: string;
  accountEmail: string;
  calendarId: string;
  calendarName: string;
  status: "connected" | "needs-reauthorization" | "disconnected";
  lastSyncedAt: ISODateTime | null;
  lastError: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type CalendarSourceType = "deadline" | "renewal";
export type CalendarSyncState = "pending" | "synced" | "failed";

export interface CalendarEventMapping {
  id: string;
  workspaceId: string;
  connectionId: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  googleEventId: string;
  syncState: CalendarSyncState;
  lastSyncedAt: ISODateTime | null;
  lastError: string | null;
}

export interface CalendarSyncJob {
  id: string;
  workspaceId: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  operation: "upsert" | "delete";
  state: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  availableAt: ISODateTime;
  processedAt: ISODateTime | null;
  lastError: string | null;
}

export interface AgencyData {
  workspace: Workspace;
  members: readonly Member[];
  clients: readonly Client[];
  workflows: readonly Workflow[];
  boardStages: readonly WorkspaceBoardStage[];
  sprints: readonly Sprint[];
  technologies: readonly Technology[];
  projectTechnologies: readonly ProjectTechnology[];
  projects: readonly Project[];
  checklistItems: readonly ChecklistItem[];
  deadlines: readonly Deadline[];
  resources: readonly ProjectResource[];
  commercialTerms: readonly CommercialTerms[];
  subscriptions: readonly Subscription[];
  administrativeExpenses: readonly AdministrativeExpense[];
  projectSubscriptions: readonly ProjectSubscription[];
  activity: readonly ActivityEntry[];
  auditLog: readonly AuditLogEntry[];
  calendarConnections: readonly CalendarConnection[];
  calendarEventMappings: readonly CalendarEventMapping[];
  calendarSyncQueue: readonly CalendarSyncJob[];
}
