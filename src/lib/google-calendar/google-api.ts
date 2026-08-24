import { APP_NAME } from "../domain/constants";
import { GoogleApiError } from "./errors";
import {
  GOOGLE_CALENDAR_NAME,
  GOOGLE_CALENDAR_TIME_ZONE,
  type GoogleCalendarEventInput,
  type GoogleCalendarEventResult,
} from "./types";

const API_ROOT = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarApi {
  constructor(private readonly fetcher: typeof globalThis.fetch = globalThis.fetch) {}

  async createSecondaryCalendar(accessToken: string): Promise<string> {
    const result = await this.request<{ id?: string }>(
      "/calendars",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          summary: GOOGLE_CALENDAR_NAME,
          description: `Prazos e renovações gerenciados pela ${APP_NAME}.`,
          timeZone: GOOGLE_CALENDAR_TIME_ZONE,
        }),
      },
    );
    if (!result.id) {
      throw new GoogleApiError(
        "O Google não retornou o identificador da agenda criada.",
        502,
        result,
      );
    }
    return result.id;
  }

  async calendarExists(accessToken: string, calendarId: string): Promise<boolean> {
    try {
      await this.request<unknown>(
        `/calendars/${encodeURIComponent(calendarId)}`,
        accessToken,
        { method: "GET" },
      );
      return true;
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        (error.googleStatus === 404 || error.googleStatus === 410)
      ) {
        return false;
      }
      throw error;
    }
  }

  async createEvent(input: {
    accessToken: string;
    calendarId: string;
    event: GoogleCalendarEventInput;
  }): Promise<GoogleCalendarEventResult> {
    return this.request<GoogleCalendarEventResult>(
      `/calendars/${encodeURIComponent(input.calendarId)}/events`,
      input.accessToken,
      { method: "POST", body: JSON.stringify(input.event) },
    );
  }

  async updateEvent(input: {
    accessToken: string;
    calendarId: string;
    eventId: string;
    event: GoogleCalendarEventInput;
  }): Promise<GoogleCalendarEventResult> {
    const body = { ...input.event };
    delete body.id;
    return this.request<GoogleCalendarEventResult>(
      `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
      input.accessToken,
      { method: "PUT", body: JSON.stringify(body) },
    );
  }

  async deleteEvent(input: {
    accessToken: string;
    calendarId: string;
    eventId: string;
  }): Promise<void> {
    try {
      await this.request<undefined>(
        `/calendars/${encodeURIComponent(input.calendarId)}/events/${encodeURIComponent(input.eventId)}`,
        input.accessToken,
        { method: "DELETE" },
      );
    } catch (error) {
      if (
        error instanceof GoogleApiError &&
        (error.googleStatus === 404 || error.googleStatus === 410)
      ) {
        return;
      }
      throw error;
    }
  }

  private async request<T>(
    path: string,
    accessToken: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await this.fetcher(`${API_ROOT}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const details = await response.json().catch(() => undefined);
      throw new GoogleApiError(
        googleErrorMessage(details) ??
          `O Google Agenda respondeu com HTTP ${response.status}.`,
        response.status,
        details,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function googleErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return null;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}
