import type { SupabaseClient } from "@supabase/supabase-js";

import { GOOGLE_CALENDAR_NAME, GOOGLE_CALENDAR_SCOPE } from "./types";
import type {
  CalendarConnection,
  CalendarCredentials,
  CalendarEventMapping,
  CalendarEventSource,
  CalendarSourceType,
  CalendarSyncJob,
  GoogleCalendarRepository,
} from "./types";

type Row = Record<string, unknown>;

/**
 * Service-role repository for Google Calendar only. Authorization must happen
 * before constructing it; browser code must never import this adapter.
 *
 * Tokens live in private.calendar_credentials and are accessed only through
 * service-role-only RPCs. The private schema itself is not exposed to PostgREST.
 */
export class SupabaseGoogleCalendarRepository
  implements GoogleCalendarRepository
{
  constructor(private readonly client: SupabaseClient) {}

  async getConnection(workspaceId: string): Promise<CalendarConnection | null> {
    const { data, error } = await this.client
      .from("calendar_connections")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", "google")
      .maybeSingle();
    assertNoError(error, "buscar conexão de agenda");
    return data ? connectionFromRow(data as Row) : null;
  }

  async getConnectionById(
    connectionId: string,
  ): Promise<CalendarConnection | null> {
    const { data, error } = await this.client
      .from("calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle();
    assertNoError(error, "buscar conexão de agenda");
    return data ? connectionFromRow(data as Row) : null;
  }

  async savePendingConnection(input: {
    workspaceId: string;
    connectedBy: string;
    scopes: string[];
    tokenExpiresAt: string;
  }): Promise<CalendarConnection> {
    const existing = await this.getConnection(input.workspaceId);
    const values = {
      workspace_id: input.workspaceId,
      provider: "google",
      calendar_name: GOOGLE_CALENDAR_NAME,
      status: "pending",
      scopes: input.scopes,
      connected_by: input.connectedBy,
      connected_at: new Date().toISOString(),
      token_expires_at: input.tokenExpiresAt,
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    const query = existing
      ? this.client
          .from("calendar_connections")
          .update(values)
          .eq("id", existing.id)
      : this.client.from("calendar_connections").insert(values);
    const { data, error } = await query.select("*").single();
    assertNoError(error, "salvar conexão de agenda");
    return connectionFromRow(data as Row);
  }

  async completeConnection(input: {
    connectionId: string;
    calendarId: string;
    tokenExpiresAt: string;
    scopes: string[];
  }): Promise<CalendarConnection> {
    const { data, error } = await this.client
      .from("calendar_connections")
      .update({
        calendar_id: input.calendarId,
        calendar_name: GOOGLE_CALENDAR_NAME,
        status: "connected",
        scopes: input.scopes,
        token_expires_at: input.tokenExpiresAt,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.connectionId)
      .select("*")
      .single();
    assertNoError(error, "concluir conexão de agenda");
    return connectionFromRow(data as Row);
  }

  async markConnectionError(
    connectionId: string,
    errorMessage: string,
    needsReauthorization = false,
  ): Promise<void> {
    const { error } = await this.client
      .from("calendar_connections")
      .update({
        status: needsReauthorization ? "needs_reauth" : "error",
        last_error: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId);
    assertNoError(error, "registrar falha da conexão de agenda");
  }

  async getCredentials(connectionId: string): Promise<CalendarCredentials | null> {
    const { data, error } = await this.client
      .rpc("get_calendar_credentials", { p_connection_id: connectionId })
      .maybeSingle();
    assertNoError(error, "buscar credenciais de agenda");
    if (!data) return null;
    const row = data as Row;
    return {
      connectionId,
      accessTokenCiphertext: stringValue(row.access_token_ciphertext),
      refreshTokenCiphertext: nullableString(row.refresh_token_ciphertext),
    };
  }

  async updateCredentials(input: {
    connectionId: string;
    accessTokenCiphertext: string;
    refreshTokenCiphertext?: string | null;
    tokenExpiresAt: string;
  }): Promise<void> {
    const { error: credentialError } = await this.client.rpc(
      "upsert_calendar_credentials",
      {
        p_connection_id: input.connectionId,
        p_access_token_ciphertext: input.accessTokenCiphertext,
        p_refresh_token_ciphertext: input.refreshTokenCiphertext ?? null,
        p_encryption_key_version: "v1",
      },
    );
    assertNoError(credentialError, "salvar credenciais de agenda");

    const { error: connectionError } = await this.client
      .from("calendar_connections")
      .update({
        token_expires_at: input.tokenExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.connectionId);
    assertNoError(connectionError, "atualizar validade da conexão de agenda");
  }

  async getMapping(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
  }): Promise<CalendarEventMapping | null> {
    let query = this.client
      .from("calendar_event_mappings")
      .select("*")
      .eq("calendar_connection_id", input.connectionId);
    query = query.eq(sourceColumn(input.sourceType), input.sourceId);
    const { data, error } = await query.maybeSingle();
    assertNoError(error, "buscar vínculo de evento");
    return data ? mappingFromRow(data as Row) : null;
  }

  async saveMapping(mapping: CalendarEventMapping): Promise<void> {
    const values = {
      workspace_id: mapping.workspaceId,
      calendar_connection_id: mapping.connectionId,
      deadline_id:
        mapping.sourceType === "deadline" ? mapping.sourceId : null,
      subscription_id:
        mapping.sourceType === "renewal" ? mapping.sourceId : null,
      google_event_id: mapping.googleEventId,
      content_hash: mapping.contentHash,
      status: mapping.status,
      last_synced_at: new Date().toISOString(),
      last_error: mapping.lastError,
      updated_at: new Date().toISOString(),
    };
    const existing = await this.getMapping({
      connectionId: mapping.connectionId,
      sourceType: mapping.sourceType,
      sourceId: mapping.sourceId,
    });
    if (existing?.id) {
      const { error } = await this.client
        .from("calendar_event_mappings")
        .update(values)
        .eq("id", existing.id);
      assertNoError(error, "atualizar vínculo de evento");
      return;
    }

    const { error } = await this.client
      .from("calendar_event_mappings")
      .insert(values);
    if (error?.code === "23505") {
      const raced = await this.getMapping({
        connectionId: mapping.connectionId,
        sourceType: mapping.sourceType,
        sourceId: mapping.sourceId,
      });
      if (raced?.id) {
        const { error: updateError } = await this.client
          .from("calendar_event_mappings")
          .update(values)
          .eq("id", raced.id);
        assertNoError(updateError, "atualizar vínculo de evento concorrente");
        return;
      }
    }
    assertNoError(error, "salvar vínculo de evento");
  }

  async deleteMapping(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
  }): Promise<void> {
    let query = this.client
      .from("calendar_event_mappings")
      .delete()
      .eq("calendar_connection_id", input.connectionId);
    query = query.eq(sourceColumn(input.sourceType), input.sourceId);
    const { error } = await query;
    assertNoError(error, "remover vínculo de evento");
  }

  async markMappingError(input: {
    connectionId: string;
    sourceType: CalendarSourceType;
    sourceId: string;
    error: string;
  }): Promise<void> {
    let query = this.client
      .from("calendar_event_mappings")
      .update({
        status: "failed",
        last_error: input.error,
        updated_at: new Date().toISOString(),
      })
      .eq("calendar_connection_id", input.connectionId);
    query = query.eq(sourceColumn(input.sourceType), input.sourceId);
    const { error } = await query;
    assertNoError(error, "registrar falha do vínculo de evento");
  }

  async getSource(
    workspaceId: string,
    sourceType: CalendarSourceType,
    sourceId: string,
  ): Promise<CalendarEventSource | null> {
    if (sourceType === "deadline") {
      const { data, error } = await this.client
        .from("deadlines")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", sourceId)
        .maybeSingle();
      assertNoError(error, "buscar prazo para sincronização");
      return data ? deadlineFromRow(data as Row) : null;
    }

    const { data, error } = await this.client
      .from("subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", sourceId)
      .maybeSingle();
    assertNoError(error, "buscar assinatura para sincronização");
    return data ? renewalFromRow(data as Row) : null;
  }

  async claimPendingJobs(input: {
    workspaceId?: string;
    limit: number;
    now: string;
  }): Promise<CalendarSyncJob[]> {
    const staleLock = new Date(new Date(input.now).getTime() - 15 * 60_000).toISOString();
    let staleQuery = this.client
      .from("calendar_sync_jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        available_at: input.now,
        updated_at: input.now,
      })
      .eq("status", "processing")
      .lt("locked_at", staleLock);
    if (input.workspaceId) {
      staleQuery = staleQuery.eq("workspace_id", input.workspaceId);
    }
    const { error: staleError } = await staleQuery;
    assertNoError(staleError, "recuperar sincronizações interrompidas");

    let query = this.client
      .from("calendar_sync_jobs")
      .select("*")
      .in("status", ["pending", "failed"])
      .lte("available_at", input.now)
      .order("available_at", { ascending: true })
      .limit(input.limit);
    if (input.workspaceId) query = query.eq("workspace_id", input.workspaceId);
    const { data, error } = await query;
    assertNoError(error, "buscar fila de sincronização");

    const claimed: CalendarSyncJob[] = [];
    for (const candidate of (data ?? []) as Row[]) {
      const { data: locked, error: lockError } = await this.client
        .from("calendar_sync_jobs")
        .update({
          status: "processing",
          locked_at: input.now,
          locked_by: workerId(),
          updated_at: input.now,
        })
        .eq("id", stringValue(candidate.id))
        .eq("status", stringValue(candidate.status))
        .select("*")
        .maybeSingle();
      assertNoError(lockError, "reservar sincronização");
      if (locked) claimed.push(jobFromRow(locked as Row));
    }
    return claimed;
  }

  async requeueJobs(workspaceId: string): Promise<number> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("calendar_sync_jobs")
      .update({
        status: "failed",
        attempts: 0,
        available_at: now,
        locked_at: null,
        locked_by: null,
        processed_at: null,
        last_error: null,
        updated_at: now,
      })
      .eq("workspace_id", workspaceId)
      .in("status", ["failed", "dead_letter"])
      .select("id");
    assertNoError(error, "recolocar sincronizações na fila");
    return data?.length ?? 0;
  }

  async completeJob(jobId: string, connectionId?: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("calendar_sync_jobs")
      .update({
        status: "succeeded",
        processed_at: now,
        locked_at: null,
        locked_by: null,
        last_error: null,
        updated_at: now,
      })
      .eq("id", jobId);
    assertNoError(error, "concluir sincronização");
    if (connectionId) {
      const { error: connectionError } = await this.client
        .from("calendar_connections")
        .update({ last_sync_at: now, updated_at: now })
        .eq("id", connectionId);
      if (connectionError) {
        console.error(
          "[google-calendar] Falha ao registrar last_sync_at:",
          connectionError.code,
        );
      }
    }
  }

  async retryJob(input: {
    jobId: string;
    attempts: number;
    availableAt: string;
    error: string;
    terminal: boolean;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("calendar_sync_jobs")
      .update({
        status: input.terminal ? "dead_letter" : "failed",
        attempts: input.attempts,
        available_at: input.availableAt,
        locked_at: null,
        locked_by: null,
        processed_at: input.terminal ? now : null,
        last_error: input.error,
        updated_at: now,
      })
      .eq("id", input.jobId);
    assertNoError(error, "reagendar sincronização");
  }
}

function connectionFromRow(row: Row): CalendarConnection {
  const rawStatus = nullableString(row.status) ?? "error";
  const status: CalendarConnection["status"] =
    rawStatus === "connected"
      ? "connected"
      : rawStatus === "pending"
        ? "pending"
        : rawStatus === "needs_reauth" ||
            rawStatus === "reauthorization_required" ||
            rawStatus === "needs_reauthorization" ||
            rawStatus === "needs-reauthorization"
          ? "needs_reauth"
          : rawStatus === "disconnected"
            ? "disconnected"
            : "error";
  return {
    id: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    connectedBy: nullableString(row.connected_by),
    calendarId: nullableString(row.calendar_id),
    calendarName: nullableString(row.calendar_name) ?? GOOGLE_CALENDAR_NAME,
    status,
    scopes: Array.isArray(row.scopes)
      ? row.scopes.filter((value): value is string => typeof value === "string")
      : [GOOGLE_CALENDAR_SCOPE],
    tokenExpiresAt:
      nullableString(row.token_expires_at) ?? "1970-01-01T00:00:00.000Z",
    lastError: nullableString(row.last_error),
  };
}

function mappingFromRow(row: Row): CalendarEventMapping {
  const deadlineId = nullableString(row.deadline_id);
  const sourceType: CalendarSourceType = deadlineId ? "deadline" : "renewal";
  return {
    id: nullableString(row.id) ?? undefined,
    workspaceId: stringValue(row.workspace_id),
    connectionId: stringValue(row.calendar_connection_id),
    sourceType,
    sourceId: deadlineId ?? stringValue(row.subscription_id),
    googleEventId: stringValue(row.google_event_id),
    contentHash: nullableString(row.content_hash) ?? "",
    status: mappingStatus(row.status),
    lastError: nullableString(row.last_error),
  };
}

function jobFromRow(row: Row): CalendarSyncJob {
  const deadlineId = nullableString(row.deadline_id);
  const sourceType: CalendarSourceType = deadlineId ? "deadline" : "renewal";
  const payload =
    row.payload && typeof row.payload === "object" ? (row.payload as Row) : {};
  return {
    id: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    connectionId: nullableString(row.calendar_connection_id),
    sourceType,
    sourceId: deadlineId ?? stringValue(row.subscription_id),
    googleEventId: nullableString(payload.google_event_id),
    operation: row.operation === "delete" ? "delete" : "upsert",
    status: jobStatus(row.status),
    attempts: numberValue(row.attempts),
    maxAttempts: numberValue(row.max_attempts) || 5,
    availableAt: stringValue(row.available_at),
  };
}

function deadlineFromRow(row: Row): CalendarEventSource {
  const dueDate = nullableString(row.due_date);
  const dueTime = nullableString(row.due_time);
  const rawState = nullableString(row.status) ?? nullableString(row.state) ?? "open";
  return {
    sourceType: "deadline",
    id: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    projectId: nullableString(row.project_id),
    title: stringValue(row.title),
    description: nullableString(row.description),
    dueDate,
    dueAt:
      nullableString(row.due_at) ??
      (dueDate && dueTime ? `${dueDate}T${dueTime}-03:00` : null),
    allDay: row.all_day !== false,
    syncEnabled: row.sync_enabled !== false,
    completedAt: nullableString(row.completed_at),
    canceledAt:
      rawState === "canceled" || rawState === "cancelled"
        ? nullableString(row.updated_at) ?? "1970-01-01T00:00:00.000Z"
        : null,
    deletedAt: nullableString(row.deleted_at),
  };
}

function renewalFromRow(row: Row): CalendarEventSource {
  const rawStatus = nullableString(row.status) ?? "active";
  return {
    sourceType: "renewal",
    id: stringValue(row.id),
    workspaceId: stringValue(row.workspace_id),
    serviceName: stringValue(row.service_name),
    renewsOn: stringValue(row.renewal_date ?? row.renews_on),
    autoRenew: row.auto_renew === true,
    deletedAt:
      rawStatus === "active"
        ? nullableString(row.deleted_at)
        : nullableString(row.updated_at) ?? "1970-01-01T00:00:00.000Z",
  };
}

function sourceColumn(sourceType: CalendarSourceType): string {
  return sourceType === "deadline" ? "deadline_id" : "subscription_id";
}

function mappingStatus(value: unknown): CalendarEventMapping["status"] {
  return value === "pending" ||
    value === "failed" ||
    value === "deleting" ||
    value === "synced"
    ? value
    : "failed";
}

function jobStatus(value: unknown): CalendarSyncJob["status"] {
  return value === "pending" ||
    value === "processing" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "dead_letter"
    ? value
    : "dead_letter";
}

function stringValue(value: unknown): string {
  if (typeof value !== "string" || !value) {
    throw new Error("Registro do Google Agenda possui campo obrigatório inválido.");
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function workerId(): string {
  return (
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_REGION ??
    "calendar-worker"
  ).slice(0, 200);
}

function assertNoError(
  error: { message?: string; code?: string } | null,
  operation: string,
): void {
  if (!error) return;
  throw new Error(
    `Não foi possível ${operation}: ${error.code ?? "database_error"} ${error.message ?? ""}`.trim(),
  );
}
