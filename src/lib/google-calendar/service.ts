import { decryptSecret, encryptSecret } from "./crypto";
import {
  buildGoogleCalendarEvents,
  calendarEventContentHash,
  deterministicGoogleEventId,
  deterministicGoogleEventIds,
  shouldDeleteCalendarEvent,
} from "./events";
import {
  GoogleApiError,
  GoogleCalendarError,
  toSafeErrorMessage,
} from "./errors";
import { GoogleCalendarApi } from "./google-api";
import { refreshGoogleAccessToken } from "./oauth";
import {
  GOOGLE_CALENDAR_SCOPE,
  type CalendarConnection,
  type CalendarEventMapping,
  type CalendarSyncJob,
  type CalendarSyncSummary,
  type GoogleCalendarConfig,
  type GoogleCalendarEventInput,
  type GoogleCalendarRepository,
  type GoogleTokenSet,
} from "./types";

const MAX_JOB_ATTEMPTS = 5;
const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;

export async function connectGoogleCalendar(input: {
  repository: GoogleCalendarRepository;
  api: GoogleCalendarApi;
  config: GoogleCalendarConfig;
  workspaceId: string;
  userId: string;
  tokens: GoogleTokenSet;
}): Promise<CalendarConnection> {
  const existing = await input.repository.getConnection(input.workspaceId);
  const existingCredentials = existing
    ? await input.repository.getCredentials(existing.id)
    : null;
  const refreshTokenCiphertext = input.tokens.refreshToken
    ? encryptToken(
        input.tokens.refreshToken,
        input.config.encryptionKey,
        "refresh",
        existing?.id,
      )
    : existingCredentials?.refreshTokenCiphertext;

  if (!refreshTokenCiphertext) {
    throw new GoogleCalendarError(
      "O Google não retornou um token de atualização. Revogue o acesso anterior e conecte novamente.",
      "google_refresh_token_missing",
      422,
    );
  }

  const connection = await input.repository.savePendingConnection({
    workspaceId: input.workspaceId,
    connectedBy: input.userId,
    scopes: normalizeScopes(input.tokens.scope),
    tokenExpiresAt: input.tokens.expiresAt,
  });

  // Bind all ciphertext to the persistent connection id as AES-GCM AAD.
  await input.repository.updateCredentials({
    connectionId: connection.id,
    accessTokenCiphertext: encryptToken(
      input.tokens.accessToken,
      input.config.encryptionKey,
      "access",
      connection.id,
    ),
    refreshTokenCiphertext: input.tokens.refreshToken
      ? encryptToken(
          input.tokens.refreshToken,
          input.config.encryptionKey,
          "refresh",
          connection.id,
        )
      : refreshTokenCiphertext,
    tokenExpiresAt: input.tokens.expiresAt,
  });

  try {
    const canReuseCalendar =
      connection.calendarId !== null &&
      (await input.api.calendarExists(
        input.tokens.accessToken,
        connection.calendarId,
      ));
    const calendarId = canReuseCalendar
      ? connection.calendarId!
      : await input.api.createSecondaryCalendar(input.tokens.accessToken);
    return await input.repository.completeConnection({
      connectionId: connection.id,
      calendarId,
      tokenExpiresAt: input.tokens.expiresAt,
      scopes: normalizeScopes(input.tokens.scope),
    });
  } catch (error) {
    await input.repository.markConnectionError(
      connection.id,
      toSafeErrorMessage(error),
    );
    throw error;
  }
}

export async function processCalendarSyncQueue(input: {
  repository: GoogleCalendarRepository;
  config: GoogleCalendarConfig;
  workspaceId?: string;
  limit?: number;
  now?: Date;
  fetch?: typeof globalThis.fetch;
}): Promise<CalendarSyncSummary> {
  const now = input.now ?? new Date();
  const jobs = await input.repository.claimPendingJobs({
    workspaceId: input.workspaceId,
    limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
    now: now.toISOString(),
  });
  const summary: CalendarSyncSummary = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
  };
  const api = new GoogleCalendarApi(input.fetch);
  const accessTokens = new Map<string, Promise<string>>();

  for (const job of jobs) {
    try {
      const connection = job.connectionId
        ? await input.repository.getConnectionById(job.connectionId)
        : await input.repository.getConnection(job.workspaceId);
      if (!connection?.calendarId || connection.status !== "connected") {
        throw new GoogleCalendarError(
          "O workspace não possui uma agenda conectada.",
          "calendar_not_connected",
          409,
        );
      }
      const connectedConnection: CalendarConnection & { calendarId: string } = {
        ...connection,
        calendarId: connection.calendarId,
      };

      let accessTokenPromise = accessTokens.get(connection.id);
      if (!accessTokenPromise) {
        accessTokenPromise = getValidAccessToken({
          repository: input.repository,
          config: input.config,
          connection,
          now,
          fetch: input.fetch,
        });
        accessTokens.set(connection.id, accessTokenPromise);
      }
      let accessToken = await accessTokenPromise;
      let result: Awaited<ReturnType<typeof processJob>>;
      try {
        result = await processJob({
          repository: input.repository,
          api,
          connection: connectedConnection,
          accessToken,
          job,
        });
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.googleStatus !== 401) {
          throw error;
        }
        const refreshed = getValidAccessToken({
          repository: input.repository,
          config: input.config,
          connection,
          now,
          fetch: input.fetch,
          forceRefresh: true,
        });
        accessTokens.set(connection.id, refreshed);
        accessToken = await refreshed;
        result = await processJob({
          repository: input.repository,
          api,
          connection: connectedConnection,
          accessToken,
          job,
        });
      }
      await input.repository.completeJob(job.id, connection.id);
      summary.completed += 1;
      if (result === "skipped") summary.skipped += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const terminal =
        isTerminalError(error) ||
        attempts >= (job.maxAttempts || MAX_JOB_ATTEMPTS);
      const needsReauthorization =
        (error instanceof GoogleCalendarError &&
          error.code === "google_reauthorization_required") ||
        (error instanceof GoogleApiError && error.googleStatus === 401);
      const annotations: Promise<void>[] = [];
      if (needsReauthorization && job.connectionId) {
        annotations.push(
          input.repository.markConnectionError(
            job.connectionId,
            toSafeErrorMessage(error),
            true,
          ),
        );
      }
      if (job.connectionId) {
        annotations.push(
          input.repository.markMappingError({
            connectionId: job.connectionId,
            sourceType: job.sourceType,
            sourceId: job.sourceId,
            error: toSafeErrorMessage(error),
          }),
        );
      }
      await Promise.allSettled(annotations);
      await input.repository.retryJob({
        jobId: job.id,
        attempts,
        availableAt: new Date(
          now.getTime() + retryDelayMilliseconds(attempts),
        ).toISOString(),
        error: toSafeErrorMessage(error),
        terminal,
      });
      if (terminal) summary.failed += 1;
      else summary.retried += 1;
    }
  }

  return summary;
}

async function processJob(input: {
  repository: GoogleCalendarRepository;
  api: GoogleCalendarApi;
  connection: CalendarConnection & { calendarId: string };
  accessToken: string;
  job: CalendarSyncJob;
}): Promise<"synced" | "deleted" | "skipped"> {
  const mappingKey = {
    connectionId: input.connection.id,
    sourceType: input.job.sourceType,
    sourceId: input.job.sourceId,
  } as const;
  const [mapping, source] = await Promise.all([
    input.repository.getMapping(mappingKey),
    input.repository.getSource(
      input.job.workspaceId,
      input.job.sourceType,
      input.job.sourceId,
    ),
  ]);
  const primaryEventId =
    mapping?.googleEventId ??
    input.job.googleEventId ??
    deterministicGoogleEventId(
      input.job.workspaceId,
      input.job.sourceType,
      input.job.sourceId,
    );
  const mustDelete =
    input.job.operation === "delete" ||
    !source ||
    shouldDeleteCalendarEvent(source);

  if (mustDelete) {
    const eventIds = deterministicGoogleEventIds({
      workspaceId: input.job.workspaceId,
      sourceType: input.job.sourceType,
      sourceId: input.job.sourceId,
    });
    eventIds[0] = primaryEventId;
    for (const eventId of eventIds) {
      await input.api.deleteEvent({
        accessToken: input.accessToken,
        calendarId: input.connection.calendarId,
        eventId,
      });
    }
    if (mapping) await input.repository.deleteMapping(mappingKey);
    return "deleted";
  }

  const events = buildGoogleCalendarEvents(source);
  const contentHash = calendarEventContentHash(events);
  if (mapping?.contentHash === contentHash && mapping.status === "synced") {
    return "skipped";
  }

  for (const event of events) {
    await upsertEvent({
      api: input.api,
      accessToken: input.accessToken,
      calendarId: input.connection.calendarId,
      eventId: event.id ?? primaryEventId,
      event,
      mappingExists: Boolean(mapping),
    });
  }
  const updatedMapping: CalendarEventMapping = {
    workspaceId: input.job.workspaceId,
    connectionId: input.connection.id,
    sourceType: input.job.sourceType,
    sourceId: input.job.sourceId,
    googleEventId: events[0]?.id ?? primaryEventId,
    contentHash,
    status: "synced",
    lastError: null,
  };
  await input.repository.saveMapping(updatedMapping);
  return "synced";
}

async function upsertEvent(input: {
  api: GoogleCalendarApi;
  accessToken: string;
  calendarId: string;
  eventId: string;
  event: GoogleCalendarEventInput;
  mappingExists: boolean;
}): Promise<void> {
  if (input.mappingExists) {
    try {
      await input.api.updateEvent(input);
      return;
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.googleStatus !== 404) {
        throw error;
      }
    }
  }

  try {
    await input.api.createEvent(input);
  } catch (error) {
    // A deterministic id makes a retry safe even when the first response was
    // lost after Google committed the event.
    if (!(error instanceof GoogleApiError) || error.googleStatus !== 409) {
      throw error;
    }
    await input.api.updateEvent(input);
  }
}

async function getValidAccessToken(input: {
  repository: GoogleCalendarRepository;
  config: GoogleCalendarConfig;
  connection: CalendarConnection;
  now: Date;
  fetch?: typeof globalThis.fetch;
  forceRefresh?: boolean;
}): Promise<string> {
  const credentials = await input.repository.getCredentials(input.connection.id);
  if (!credentials) {
    throw new GoogleCalendarError(
      "As credenciais criptografadas da agenda não foram encontradas.",
      "calendar_credentials_missing",
      409,
    );
  }
  const accessToken = decryptToken(
    credentials.accessTokenCiphertext,
    input.config.encryptionKey,
    "access",
    input.connection.id,
  );
  if (
    !input.forceRefresh &&
    new Date(input.connection.tokenExpiresAt).getTime() >
    input.now.getTime() + ACCESS_TOKEN_EXPIRY_SKEW_MS
  ) {
    return accessToken;
  }
  if (!credentials.refreshTokenCiphertext) {
    throw new GoogleCalendarError(
      "O token de atualização do Google não foi encontrado.",
      "google_reauthorization_required",
      401,
    );
  }
  const refreshToken = decryptToken(
    credentials.refreshTokenCiphertext,
    input.config.encryptionKey,
    "refresh",
    input.connection.id,
  );
  const tokens = await refreshGoogleAccessToken({
    config: input.config,
    refreshToken,
    fetch: input.fetch,
    now: input.now,
  });
  await input.repository.updateCredentials({
    connectionId: input.connection.id,
    accessTokenCiphertext: encryptToken(
      tokens.accessToken,
      input.config.encryptionKey,
      "access",
      input.connection.id,
    ),
    refreshTokenCiphertext: credentials.refreshTokenCiphertext,
    tokenExpiresAt: tokens.expiresAt,
  });
  return tokens.accessToken;
}

function encryptToken(
  value: string,
  secret: string,
  kind: "access" | "refresh",
  connectionId = "pending",
): string {
  return encryptSecret(
    value,
    secret,
    `google-calendar-${kind}-token:${connectionId}`,
  );
}

function decryptToken(
  value: string,
  secret: string,
  kind: "access" | "refresh",
  connectionId: string,
): string {
  return decryptSecret(
    value,
    secret,
    `google-calendar-${kind}-token:${connectionId}`,
  );
}

function normalizeScopes(scope: string): string[] {
  const scopes = scope.split(/\s+/).filter(Boolean);
  return scopes.length ? scopes : [GOOGLE_CALENDAR_SCOPE];
}

function retryDelayMilliseconds(attempts: number): number {
  return Math.min(5 * 60_000 * 2 ** Math.max(attempts - 1, 0), 24 * 60 * 60_000);
}

function isTerminalError(error: unknown): boolean {
  if (error instanceof GoogleCalendarError) {
    if (error.code === "google_reauthorization_required") return true;
    if (error instanceof GoogleApiError) return !error.retryable;
    return error.status >= 400 && error.status < 500;
  }
  return false;
}
