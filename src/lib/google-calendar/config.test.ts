import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGoogleCalendarConfig,
  isGoogleCalendarConfigured,
} from "./config";
import { GoogleCalendarError } from "./errors";

describe("Google Calendar config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is ready only when oauth credentials are present", () => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_CALENDAR_ENCRYPTION_KEY", "");
    expect(isGoogleCalendarConfigured()).toBe(false);

    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "client");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "secret");
    vi.stubEnv(
      "GOOGLE_CALENDAR_ENCRYPTION_KEY",
      "test-only-secret-with-more-than-thirty-two-characters",
    );
    expect(isGoogleCalendarConfigured()).toBe(true);
  });

  it("explains a missing oauth client instead of throwing a generic error", () => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "secret");
    vi.stubEnv(
      "GOOGLE_CALENDAR_ENCRYPTION_KEY",
      "test-only-secret-with-more-than-thirty-two-characters",
    );
    vi.stubEnv(
      "GOOGLE_CALENDAR_REDIRECT_URI",
      "http://localhost:3000/api/google-calendar/callback",
    );

    expect(() => getGoogleCalendarConfig()).toThrow(GoogleCalendarError);
    try {
      getGoogleCalendarConfig();
    } catch (error) {
      expect(error).toMatchObject({
        code: "calendar_oauth_not_configured",
        status: 503,
      });
    }
  });
});
