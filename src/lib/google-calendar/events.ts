import { createHash } from "node:crypto";
import { APP_NAME } from "../domain/constants";

import { GoogleCalendarError } from "./errors";
import {
  GOOGLE_CALENDAR_TIME_ZONE,
  type CalendarEventSource,
  type GoogleCalendarEventInput,
} from "./types";

const DEADLINE_REMINDERS = [7 * 24 * 60, 2 * 24 * 60, 0] as const;
const RENEWAL_REMINDERS = [7 * 24 * 60, 24 * 60] as const;

export function deterministicGoogleEventId(
  workspaceId: string,
  sourceType: CalendarEventSource["sourceType"],
  sourceId: string,
  variant = "primary",
): string {
  const digest = createHash("sha256")
    .update(`${workspaceId}:${sourceType}:${sourceId}:${variant}`, "utf8")
    .digest("hex");
  // Hex is a valid subset of Google's required base32hex alphabet.
  return `ca${digest.slice(0, 50)}`;
}

export function shouldDeleteCalendarEvent(source: CalendarEventSource): boolean {
  return Boolean(
    source.deletedAt ||
      (source.sourceType === "deadline" &&
        (source.completedAt ||
          source.canceledAt ||
          source.syncEnabled === false)),
  );
}

export function buildGoogleCalendarEvent(
  source: CalendarEventSource,
): GoogleCalendarEventInput {
  const eventId = deterministicGoogleEventId(
    source.workspaceId,
    source.sourceType,
    source.id,
  );
  const projectSuffix = source.projectName ? ` — ${source.projectName}` : "";

  if (source.sourceType === "deadline") {
    const dates = eventDates(source.dueDate, source.dueAt, source.allDay);
    return {
      id: eventId,
      summary: `Prazo: ${source.title}${projectSuffix}`,
      description: source.description || undefined,
      ...dates,
      reminders: reminders(DEADLINE_REMINDERS),
      extendedProperties: privateProperties(source),
    };
  }

  return {
    id: eventId,
    summary: `Renovação: ${source.serviceName}${projectSuffix}`,
    description: source.autoRenew
      ? `Renovação automática cadastrada na ${APP_NAME}.`
      : `Renovação manual cadastrada na ${APP_NAME}.`,
    start: { date: requireDate(source.renewsOn) },
    end: { date: addDays(requireDate(source.renewsOn), 1) },
    reminders: reminders(RENEWAL_REMINDERS),
    extendedProperties: privateProperties(source),
  };
}

/**
 * Google caps reminder overrides at 28 days. A renewal therefore uses a
 * companion all-day event on D-30 plus the main event's D-7/D-1 reminders.
 */
export function buildGoogleCalendarEvents(
  source: CalendarEventSource,
): GoogleCalendarEventInput[] {
  const primary = buildGoogleCalendarEvent(source);
  if (source.sourceType !== "renewal") return [primary];

  const noticeDate = addDays(requireDate(source.renewsOn), -30);
  const projectSuffix = source.projectName ? ` — ${source.projectName}` : "";
  return [
    primary,
    {
      id: deterministicGoogleEventId(
        source.workspaceId,
        source.sourceType,
        source.id,
        "d30",
      ),
      summary: `Renovação em 30 dias: ${source.serviceName}${projectSuffix}`,
      description:
        `Aviso antecipado de renovação cadastrado na ${APP_NAME}.`,
      start: { date: noticeDate },
      end: { date: addDays(noticeDate, 1) },
      reminders: reminders([0]),
      extendedProperties: {
        private: {
          ...privateProperties(source).private,
          notice: "d30",
        },
      },
    },
  ];
}

export function deterministicGoogleEventIds(input: {
  workspaceId: string;
  sourceType: CalendarEventSource["sourceType"];
  sourceId: string;
}): string[] {
  const primary = deterministicGoogleEventId(
    input.workspaceId,
    input.sourceType,
    input.sourceId,
  );
  return input.sourceType === "renewal"
    ? [
        primary,
        deterministicGoogleEventId(
          input.workspaceId,
          input.sourceType,
          input.sourceId,
          "d30",
        ),
      ]
    : [primary];
}

export function calendarEventContentHash(
  event: GoogleCalendarEventInput | readonly GoogleCalendarEventInput[],
): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

function eventDates(
  dueDate: string | null | undefined,
  dueAt: string | null | undefined,
  allDay: boolean,
): Pick<GoogleCalendarEventInput, "start" | "end"> {
  if (allDay || (!dueAt && dueDate)) {
    const date = requireDate(dueDate ?? dueAt?.slice(0, 10));
    return { start: { date }, end: { date: addDays(date, 1) } };
  }
  if (!dueAt) {
    throw new GoogleCalendarError(
      "O prazo não possui data para sincronização.",
      "deadline_without_date",
      422,
    );
  }
  const start = new Date(dueAt);
  if (Number.isNaN(start.getTime())) {
    throw new GoogleCalendarError(
      "A data do prazo é inválida.",
      "invalid_deadline_date",
      422,
    );
  }
  const end = new Date(start.getTime() + 30 * 60 * 1_000);
  return {
    start: {
      dateTime: start.toISOString(),
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    },
  };
}

function reminders(
  values: readonly number[],
): GoogleCalendarEventInput["reminders"] {
  return {
    useDefault: false,
    overrides: values.map((minutes) => ({ method: "popup", minutes })),
  };
}

function privateProperties(
  source: CalendarEventSource,
): GoogleCalendarEventInput["extendedProperties"] {
  return {
    private: {
      managedBy: "central-da-agencia",
      workspaceId: source.workspaceId,
      sourceType: source.sourceType,
      sourceId: source.id,
    },
  };
}

function requireDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new GoogleCalendarError(
      "A data do evento é inválida.",
      "invalid_event_date",
      422,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GoogleCalendarError(
      "A data do evento é inválida.",
      "invalid_event_date",
      422,
    );
  }
  return value;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
