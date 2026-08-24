import { describe, expect, it, vi } from "vitest";

import { encryptSecret } from "./crypto";
import { deterministicGoogleEventId } from "./events";
import { processCalendarSyncQueue } from "./service";
import type {
  CalendarConnection,
  CalendarSyncJob,
  GoogleCalendarConfig,
  GoogleCalendarRepository,
} from "./types";

const config: GoogleCalendarConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://agency.example/api/google-calendar/callback",
  encryptionKey: "test-only-secret-with-more-than-thirty-two-characters",
};
const connection: CalendarConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  connectedBy: "user-1",
  calendarId: "calendar-1",
  calendarName: "Central da Agência — Prazos",
  status: "connected",
  scopes: ["https://www.googleapis.com/auth/calendar.app.created"],
  tokenExpiresAt: "2026-08-24T14:00:00.000Z",
  lastError: null,
};
const job: CalendarSyncJob = {
  id: "job-1",
  workspaceId: "workspace-1",
  connectionId: connection.id,
  sourceType: "deadline",
  sourceId: "deadline-1",
  operation: "upsert",
  status: "processing",
  attempts: 0,
  maxAttempts: 8,
  availableAt: "2026-08-24T12:00:00.000Z",
};

describe("calendar queue processor", () => {
  it("refreshes an expired token and persists the replacement before syncing", async () => {
    const repository = repositoryMock({
      connection: {
        ...connection,
        tokenExpiresAt: "2026-08-24T11:00:00.000Z",
      },
    });
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        return Response.json({
          access_token: "fresh-access",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/calendar.app.created",
          token_type: "Bearer",
        });
      }
      return Response.json({ id: "event-1" });
    }) as typeof globalThis.fetch;

    const summary = await processCalendarSyncQueue({
      repository,
      config,
      now: new Date("2026-08-24T12:00:00.000Z"),
      fetch: fetcher,
    });

    expect(summary.completed).toBe(1);
    expect(repository.updateCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: connection.id,
        tokenExpiresAt: "2026-08-24T13:00:00.000Z",
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries a transient Google outage with backoff", async () => {
    const repository = repositoryMock();
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { message: "temporarily unavailable" } },
        { status: 503 },
      ),
    ) as typeof globalThis.fetch;

    const summary = await processCalendarSyncQueue({
      repository,
      config,
      now: new Date("2026-08-24T12:00:00.000Z"),
      fetch: fetcher,
    });

    expect(summary).toMatchObject({ retried: 1, failed: 0, completed: 0 });
    expect(repository.retryJob).toHaveBeenCalledWith({
      jobId: job.id,
      attempts: 1,
      availableAt: "2026-08-24T12:05:00.000Z",
      error: "temporarily unavailable",
      terminal: false,
    });
  });

  it("recovers idempotently when create committed but Google returns a conflict", async () => {
    const repository = repositoryMock();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "already exists" } },
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ id: "event-1" })) as typeof globalThis.fetch;

    const summary = await processCalendarSyncQueue({
      repository,
      config,
      now: new Date("2026-08-24T12:00:00.000Z"),
      fetch: fetcher,
    });

    expect(summary.completed).toBe(1);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/events"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        `/events/${deterministicGoogleEventId("workspace-1", "deadline", "deadline-1")}`,
      ),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

function repositoryMock(
  overrides: { connection?: CalendarConnection } = {},
): GoogleCalendarRepository & Record<string, ReturnType<typeof vi.fn>> {
  const activeConnection = overrides.connection ?? connection;
  const accessPurpose = `google-calendar-access-token:${activeConnection.id}`;
  const refreshPurpose = `google-calendar-refresh-token:${activeConnection.id}`;
  return {
    getConnection: vi.fn(async () => activeConnection),
    getConnectionById: vi.fn(async () => activeConnection),
    savePendingConnection: vi.fn(async () => activeConnection),
    completeConnection: vi.fn(async () => activeConnection),
    markConnectionError: vi.fn(async () => undefined),
    getCredentials: vi.fn(async () => ({
      connectionId: activeConnection.id,
      accessTokenCiphertext: encryptSecret(
        "access",
        config.encryptionKey,
        accessPurpose,
      ),
      refreshTokenCiphertext: encryptSecret(
        "refresh",
        config.encryptionKey,
        refreshPurpose,
      ),
    })),
    updateCredentials: vi.fn(async () => undefined),
    getMapping: vi.fn(async () => null),
    saveMapping: vi.fn(async () => undefined),
    markMappingError: vi.fn(async () => undefined),
    deleteMapping: vi.fn(async () => undefined),
    getSource: vi.fn(async () => ({
      sourceType: "deadline" as const,
      id: job.sourceId,
      workspaceId: job.workspaceId,
      title: "Publicar site",
      dueDate: "2026-08-30",
      allDay: true,
      syncEnabled: true,
    })),
    claimPendingJobs: vi.fn(async () => [job]),
    requeueJobs: vi.fn(async () => 0),
    completeJob: vi.fn(async () => undefined),
    retryJob: vi.fn(async () => undefined),
  } as GoogleCalendarRepository & Record<string, ReturnType<typeof vi.fn>>;
}
