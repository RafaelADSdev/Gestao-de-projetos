import { describe, expect, it } from "vitest";

import {
  buildGoogleCalendarEvent,
  buildGoogleCalendarEvents,
  deterministicGoogleEventId,
} from "./events";

describe("Google Calendar event projection", () => {
  it("creates an all-day deadline with exclusive end and D-7/D-2/day reminders", () => {
    const event = buildGoogleCalendarEvent({
      sourceType: "deadline",
      id: "deadline-1",
      workspaceId: "workspace-1",
      projectName: "Náutica",
      title: "Publicar site",
      dueDate: "2026-08-31",
      allDay: true,
    });

    expect(event.summary).toBe("Prazo: Publicar site — Náutica");
    expect(event.start).toEqual({ date: "2026-08-31" });
    expect(event.end).toEqual({ date: "2026-09-01" });
    expect(event.reminders.overrides.map(({ minutes }) => minutes)).toEqual([
      10_080, 2_880, 0,
    ]);
  });

  it("creates a renewal with a D-30 companion plus D-7/D-1 reminders", () => {
    const events = buildGoogleCalendarEvents({
      sourceType: "renewal",
      id: "subscription-1",
      workspaceId: "workspace-1",
      serviceName: "Hostinger",
      renewsOn: "2026-12-31",
      autoRenew: true,
    });

    const [renewal, d30] = events;
    expect(renewal?.end).toEqual({ date: "2027-01-01" });
    expect(renewal?.reminders.overrides.map(({ minutes }) => minutes)).toEqual([
      10_080, 1_440,
    ]);
    expect(d30?.start).toEqual({ date: "2026-12-01" });
    expect(d30?.reminders.overrides).toEqual([{ method: "popup", minutes: 0 }]);
    expect(d30?.id).not.toBe(renewal?.id);
  });

  it("generates stable ids accepted by Google's base32hex constraint", () => {
    const first = deterministicGoogleEventId(
      "workspace-1",
      "deadline",
      "deadline-1",
    );
    const second = deterministicGoogleEventId(
      "workspace-1",
      "deadline",
      "deadline-1",
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-v0-9]{5,1024}$/);
  });
});
