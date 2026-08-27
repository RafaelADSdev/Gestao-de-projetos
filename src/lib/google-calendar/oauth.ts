import { createHash, randomBytes } from "node:crypto";

import { constantTimeEqual, decryptSecret, encryptSecret } from "./crypto";
import { GoogleCalendarError } from "./errors";
import {
  GOOGLE_CALENDAR_SCOPE,
  googleCalendarAuthorizationScope,
  hasCalendarWriteScope,
  type GoogleCalendarConfig,
  type GoogleTokenSet,
  type OAuthTransaction,
} from "./types";

export const OAUTH_COOKIE_NAME = "agency_google_calendar_oauth";
export const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;
const OAUTH_COOKIE_PURPOSE = "google-calendar-oauth-transaction";

export function createOAuthTransaction(input: {
  userId: string;
  workspaceId: string;
  returnTo: string;
  now?: Date;
}): OAuthTransaction {
  const now = input.now ?? new Date();
  return {
    state: randomBytes(32).toString("base64url"),
    codeVerifier: randomBytes(64).toString("base64url"),
    userId: input.userId,
    workspaceId: input.workspaceId,
    returnTo: safeReturnTo(input.returnTo),
    expiresAt: now.getTime() + OAUTH_TRANSACTION_TTL_SECONDS * 1_000,
  };
}

export function createCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

export function buildGoogleAuthorizationUrl(
  config: GoogleCalendarConfig,
  transaction: OAuthTransaction,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: googleCalendarAuthorizationScope(),
    access_type: "offline",
    prompt: "consent",
    state: transaction.state,
    code_challenge: createCodeChallenge(transaction.codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function sealOAuthTransaction(
  transaction: OAuthTransaction,
  encryptionSecret: string,
): string {
  return encryptSecret(
    JSON.stringify(transaction),
    encryptionSecret,
    OAUTH_COOKIE_PURPOSE,
  );
}

export function openOAuthTransaction(
  value: string,
  encryptionSecret: string,
): OAuthTransaction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      decryptSecret(value, encryptionSecret, OAUTH_COOKIE_PURPOSE),
    );
  } catch {
    throw new GoogleCalendarError(
      "A autorização expirou ou é inválida. Tente conectar novamente.",
      "invalid_oauth_transaction",
      400,
    );
  }

  if (!isOAuthTransaction(parsed)) {
    throw new GoogleCalendarError(
      "A autorização expirou ou é inválida. Tente conectar novamente.",
      "invalid_oauth_transaction",
      400,
    );
  }
  return parsed;
}

export function validateOAuthCallback(input: {
  transaction: OAuthTransaction;
  returnedState: string | null;
  authenticatedUserId: string;
  now?: Date;
}): void {
  const now = input.now ?? new Date();
  if (input.transaction.expiresAt <= now.getTime()) {
    throw new GoogleCalendarError(
      "A autorização expirou. Tente conectar novamente.",
      "expired_oauth_transaction",
      400,
    );
  }
  if (
    !input.returnedState ||
    !constantTimeEqual(input.transaction.state, input.returnedState)
  ) {
    throw new GoogleCalendarError(
      "Estado OAuth inválido.",
      "oauth_state_mismatch",
      400,
    );
  }
  if (
    !constantTimeEqual(
      input.transaction.userId,
      input.authenticatedUserId,
    )
  ) {
    throw new GoogleCalendarError(
      "A sessão atual não corresponde à autorização iniciada.",
      "oauth_user_mismatch",
      403,
    );
  }
}

export async function exchangeAuthorizationCode(input: {
  config: GoogleCalendarConfig;
  code: string;
  codeVerifier: string;
  fetch?: typeof globalThis.fetch;
  now?: Date;
}): Promise<GoogleTokenSet> {
  const fetcher = input.fetch ?? globalThis.fetch;
  const body = new URLSearchParams({
    client_id: input.config.clientId,
    client_secret: input.config.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: input.config.redirectUri,
  });
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new GoogleCalendarError(
      "O Google recusou a troca do código de autorização.",
      "google_token_exchange_failed",
      502,
      response.status >= 500,
      payload,
    );
  }

  return parseTokenResponse(payload, input.now ?? new Date());
}

export async function refreshGoogleAccessToken(input: {
  config: GoogleCalendarConfig;
  refreshToken: string;
  fetch?: typeof globalThis.fetch;
  now?: Date;
}): Promise<GoogleTokenSet> {
  const fetcher = input.fetch ?? globalThis.fetch;
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const invalidGrant = payload.error === "invalid_grant";
    throw new GoogleCalendarError(
      invalidGrant
        ? "A autorização do Google expirou ou foi revogada. Reconecte a agenda."
        : "Não foi possível renovar o acesso ao Google Agenda.",
      invalidGrant ? "google_reauthorization_required" : "google_refresh_failed",
      invalidGrant ? 401 : 502,
      !invalidGrant && response.status >= 500,
      payload,
    );
  }

  return {
    ...parseTokenResponse(payload, input.now ?? new Date()),
    refreshToken: input.refreshToken,
  };
}

function parseTokenResponse(
  payload: Record<string, unknown>,
  now: Date,
): GoogleTokenSet {
  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token : "";
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : 0;
  const scope = typeof payload.scope === "string" ? payload.scope : "";
  const tokenType =
    typeof payload.token_type === "string" ? payload.token_type : "Bearer";
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GoogleCalendarError(
      "A resposta de tokens do Google é inválida.",
      "invalid_google_token_response",
      502,
    );
  }
  if (scope && !hasCalendarWriteScope(scope)) {
    throw new GoogleCalendarError(
      "A permissão mínima do Google Agenda não foi concedida.",
      "google_scope_not_granted",
      403,
    );
  }

  return {
    accessToken,
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : undefined,
    expiresAt: new Date(now.getTime() + expiresIn * 1_000).toISOString(),
    scope: scope || GOOGLE_CALENDAR_SCOPE,
    tokenType,
  };
}

function safeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/configuracoes?calendar=connected";
  }
  return value;
}

function isOAuthTransaction(value: unknown): value is OAuthTransaction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.state === "string" &&
    typeof candidate.codeVerifier === "string" &&
    typeof candidate.userId === "string" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.returnTo === "string" &&
    typeof candidate.expiresAt === "number"
  );
}
