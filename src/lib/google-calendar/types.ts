import { APP_NAME } from "../domain/constants";

export const GOOGLE_CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.app.created" as const;

export const GOOGLE_CALENDAR_NAME = `${APP_NAME} — Prazos`;
export const GOOGLE_CALENDAR_TIME_ZONE = "America/Sao_Paulo" as const;

export type WorkspaceRole = "owner" | "admin" | "member";

export interface AdminContext {
  userId: string;
  workspaceId: string;
  role: Extract<WorkspaceRole, "owner" | "admin">;
}

export interface OptionalAuthContext {
  userId: string;
  workspaceId?: string;
  role?: WorkspaceRole;
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: string;
}

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  userId: string;
  workspaceId: string;
  returnTo: string;
  expiresAt: number;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope: string;
  tokenType: string;
}

export interface CalendarConnection {
  id: string;
  workspaceId: string;
  connectedBy: string | null;
  calendarId: string | null;
  calendarName: string;
  status: "pending" | "connected" | "needs_reauth" | "disconnected" | "error";
  scopes: string[];
  tokenExpiresAt: string;
  lastError: string | null;
}

export interface CalendarCredentials {
  connectionId: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
}

export type CalendarSourceType = "deadline" | "renewal";
export type CalendarSyncOperation = "upsert" | "delete";

export interface DeadlineCalendarSource {
  sourceType: "deadline";
  id: string;
  workspaceId: string;
  projectId?: string | null;
  projectName?: string | null;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  dueAt?: string | null;
  allDay: boolean;
  syncEnabled?: boolean;
  completedAt?: string | null;
  canceledAt?: string | null;
  deletedAt?: string | null;
}

export interface RenewalCalendarSource {
  sourceType: "renewal";
  id: string;
  workspaceId: string;
  projectId?: string | null;
  projectName?: string | null;
  serviceName: string;
  renewsOn: string;
  autoRenew: boolean;
  deletedAt?: string | null;
}

export type CalendarEventSource = DeadlineCalendarSource | RenewalCalendarSource;

export interface CalendarEventMapping {
  id?: string;
  workspaceId: string;
  connectionId: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  googleEventId: string;
  contentHash: string;
  status: "pending" | "synced" | "failed" | "deleting";
  lastError: string | null;
}

export interface CalendarSyncJob {
  id: string;
  workspaceId: string;
  connectionId?: string | null;
  sourceType: CalendarSourceType;
  sourceId: string;
  googleEventId?: string | null;
  operation: CalendarSyncOperation;
  status: "pending" | "processing" | "succeeded" | "failed" | "dead_letter";
  attempts: number;
  maxAttempts: number;
  availableAt: string;
}

export interface GoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleCalendarEventInput {
  id?: string;
  summary: string;
  description?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  reminders: {
    useDefault: false;
    overrides: Array<{ method: "popup"; minutes: number }>;
  };
  extendedProperties: {
    private: Record<string, string>;
  };
}

export interface GoogleCalendarEventResult {
  id: string;
  htmlLink?: string;
  status?: string;
}

export interface GoogleCalendarRepository {
  getConnection(workspaceId: string): Promise<CalendarConnection | null>;
  getConnectionById(connectionId: string): Promise<CalendarConnection | null>;
  savePendingConnection(input: {
    workspaceId: string;
    connectedBy: string;
    scopes: string[];
    tokenExpiresAt: string;
  }): Promise<CalendarConnection>;
  completeConnection(input: {
    connectionId: string;
    calendarId: string;
    tokenExpiresAt: string;
    scopes: string[];
  }): Promise<CalendarConnection>;
  markConnectionError(
    connectionId: string,
    error: string,
    needsReauthorization?: boolean,
  ): Promise<void>;
  getCredentials(connectionId: string): Promise<CalendarCredentials | null>;
  updateCredentials(input: {
    connectionId: string;
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null;
    tokenExpiresAt: string;
  }): Promise<void>;
  getMapping(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
  }): Promise<CalendarEventMapping | null>;
  saveMapping(mapping: CalendarEventMapping): Promise<void>;
  markMappingError(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
    error: string;
  }): Promise<void>;
  deleteMapping(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
  }): Promise<void>;
  getSource(
    workspaceId: string,
    sourceType: CalendarSourceType,
    sourceId: string,
  ): Promise<CalendarEventSource | null>;
  claimPendingJobs(input: {
    workspaceId?: string;
    limit: number;
    now: string;
  }): Promise<CalendarSyncJob[]>;
  requeueJobs(workspaceId: string): Promise<number>;
  completeJob(jobId: string, connectionId?: string): Promise<void>;
  retryJob(input: {
    jobId: string;
    attempts: number;
    availableAt: string;
    error: string;
    terminal: boolean;
  }): Promise<void>;
}

export interface CalendarSyncSummary {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  skipped: number;
}
