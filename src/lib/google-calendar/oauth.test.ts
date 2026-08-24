import { describe, expect, it, vi } from "vitest";

import type { GoogleCalendarConfig } from "./types";
import {
  buildGoogleAuthorizationUrl,
  createCodeChallenge,
  createOAuthTransaction,
  exchangeAuthorizationCode,
  openOAuthTransaction,
  sealOAuthTransaction,
  validateOAuthCallback,
} from "./oauth";
import { GOOGLE_CALENDAR_SCOPE } from "./types";

const config: GoogleCalendarConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://agency.example/api/google-calendar/callback",
  encryptionKey: "test-only-secret-with-more-than-thirty-two-characters",
};

describe("Google OAuth", () => {
  it("requests only the app-created calendar scope and uses PKCE", () => {
    const transaction = createOAuthTransaction({
      userId: "user-1",
      workspaceId: "workspace-1",
      returnTo: "/configuracoes",
      now: new Date("2026-08-24T12:00:00Z"),
    });
    const url = new URL(buildGoogleAuthorizationUrl(config, transaction));

    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createCodeChallenge(transaction.codeVerifier),
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe(transaction.state);
  });

  it("seals state and verifier, then validates state, user, and expiry", () => {
    const now = new Date("2026-08-24T12:00:00Z");
    const transaction = createOAuthTransaction({
      userId: "user-1",
      workspaceId: "workspace-1",
      returnTo: "https://attacker.example",
      now,
    });
    const sealed = sealOAuthTransaction(transaction, config.encryptionKey);
    const opened = openOAuthTransaction(sealed, config.encryptionKey);

    expect(opened.returnTo).toContain("/configuracoes");
    expect(() =>
      validateOAuthCallback({
        transaction: opened,
        returnedState: opened.state,
        authenticatedUserId: "user-1",
        now,
      }),
    ).not.toThrow();
    expect(() =>
      validateOAuthCallback({
        transaction: opened,
        returnedState: "wrong",
        authenticatedUserId: "user-1",
        now,
      }),
    ).toThrow(/Estado OAuth/);
  });

  it("exchanges a code with the verifier and accepts any successful 2xx", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(URLSearchParams);
      expect((init?.body as URLSearchParams).get("code_verifier")).toBe(
        "verifier",
      );
      return new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          scope: GOOGLE_CALENDAR_SCOPE,
          token_type: "Bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof globalThis.fetch;

    const tokens = await exchangeAuthorizationCode({
      config,
      code: "code",
      codeVerifier: "verifier",
      fetch: fetcher,
      now: new Date("2026-08-24T12:00:00Z"),
    });

    expect(tokens).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: "2026-08-24T13:00:00.000Z",
    });
  });
});
