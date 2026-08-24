import type { GoogleCalendarConfig } from "./types";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function validateRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(
      "GOOGLE_CALENDAR_REDIRECT_URI deve usar HTTPS fora de localhost.",
    );
  }
  return url.toString();
}

export function getGoogleCalendarConfig(
  origin?: string,
): GoogleCalendarConfig {
  const configuredRedirect = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
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
  return requireEnv("CRON_SECRET");
}
