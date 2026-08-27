import { GoogleCalendarError } from "./errors";
import type { GoogleCalendarConfig } from "./types";

const OAUTH_ENV_NAMES = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_ENCRYPTION_KEY",
] as const;

function envValue(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function requireEnv(
  name: string,
  code = "calendar_oauth_not_configured",
): string {
  const value = envValue(name);
  if (!value) {
    throw new GoogleCalendarError(
      `Variável de ambiente obrigatória ausente: ${name}.`,
      code,
      503,
    );
  }
  return value;
}

function validateRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new GoogleCalendarError(
      "GOOGLE_CALENDAR_REDIRECT_URI deve usar HTTPS fora de localhost.",
      "calendar_oauth_not_configured",
      503,
    );
  }
  return url.toString();
}

export function isGoogleCalendarConfigured(): boolean {
  return OAUTH_ENV_NAMES.every((name) => Boolean(envValue(name)));
}

export function getGoogleCalendarConfig(
  origin?: string,
): GoogleCalendarConfig {
  const configuredRedirect = envValue("GOOGLE_CALENDAR_REDIRECT_URI");
  const redirectUri = configuredRedirect
    ? validateRedirectUri(configuredRedirect)
    : validateRedirectUri(
        new URL("/api/google-calendar/callback", origin ?? requireEnv("APP_URL"))
          .toString(),
      );

  return {
    clientId: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    redirectUri,
    encryptionKey: requireEnv("GOOGLE_CALENDAR_ENCRYPTION_KEY"),
  };
}

export function getCronSecret(): string {
  return requireEnv("CRON_SECRET", "cron_secret_missing");
}
