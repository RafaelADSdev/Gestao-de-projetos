import { describe, expect, it, vi } from "vitest";

import { GoogleCalendarApi } from "./google-api";
import { GOOGLE_CALENDAR_NAME } from "./types";

describe("GoogleCalendarApi", () => {
  it("creates the dedicated secondary calendar", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        summary: GOOGLE_CALENDAR_NAME,
        timeZone: "America/Sao_Paulo",
      });
      return Response.json({ id: "calendar-id" });
    }) as typeof globalThis.fetch;
    const api = new GoogleCalendarApi(fetcher);

    await expect(api.createSecondaryCalendar("access")).resolves.toBe(
      "calendar-id",
    );
    expect(fetcher).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access" }),
      }),
    );
  });

  it("checks an existing calendar by id", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ id: "calendarId", summary: GOOGLE_CALENDAR_NAME }),
    ) as typeof globalThis.fetch;
    const api = new GoogleCalendarApi(fetcher);

    await expect(api.calendarExists("access", "calendarId")).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      "https://www.googleapis.com/calendar/v3/calendars/calendarId",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer access" }),
      }),
    );
  });

  it("treats an already missing event as an idempotent delete", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { message: "Not found" } },
        { status: 404 },
      ),
    ) as typeof globalThis.fetch;
    const api = new GoogleCalendarApi(fetcher);

    await expect(
      api.deleteEvent({
        accessToken: "access",
        calendarId: "calendar",
        eventId: "event",
      }),
    ).resolves.toBeUndefined();
  });
});
