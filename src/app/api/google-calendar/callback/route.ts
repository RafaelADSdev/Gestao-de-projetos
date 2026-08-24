import { requireCalendarAdminContext } from "@/lib/google-calendar/auth";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { cookieValue, oauthCookie } from "@/lib/google-calendar/http";
import {
  exchangeAuthorizationCode,
  OAUTH_COOKIE_NAME,
  openOAuthTransaction,
  validateOAuthCallback,
} from "@/lib/google-calendar/oauth";
import { createGoogleCalendarRuntime } from "@/lib/google-calendar/runtime";
import { connectGoogleCalendar } from "@/lib/google-calendar/service";
import type { OAuthTransaction } from "@/lib/google-calendar/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let transaction: OAuthTransaction | null = null;
  try {
    const context = await requireCalendarAdminContext();
    const runtime = createGoogleCalendarRuntime(new URL(request.url).origin);
    const sealedTransaction = cookieValue(request, OAUTH_COOKIE_NAME);
    if (!sealedTransaction) {
      throw new GoogleCalendarError(
        "A autorização não foi iniciada ou expirou.",
        "oauth_transaction_missing",
        400,
      );
    }
    transaction = openOAuthTransaction(
      sealedTransaction,
      runtime.config.encryptionKey,
    );
    const url = new URL(request.url);
    validateOAuthCallback({
      transaction,
      returnedState: url.searchParams.get("state"),
      authenticatedUserId: context.userId,
    });
    const providerError = url.searchParams.get("error");
    if (providerError) {
      throw new GoogleCalendarError(
        providerError === "access_denied"
          ? "A autorização do Google foi cancelada."
          : "O Google não concluiu a autorização.",
        "google_oauth_denied",
        400,
      );
    }
    if (context.workspaceId !== transaction.workspaceId) {
      throw new GoogleCalendarError(
        "O workspace atual não corresponde à autorização iniciada.",
        "oauth_workspace_mismatch",
        403,
      );
    }
    const code = url.searchParams.get("code");
    if (!code) {
      throw new GoogleCalendarError(
        "O Google não retornou o código de autorização.",
        "google_authorization_code_missing",
        400,
      );
    }
    const tokens = await exchangeAuthorizationCode({
      config: runtime.config,
      code,
      codeVerifier: transaction.codeVerifier,
    });
    await connectGoogleCalendar({
      ...runtime,
      workspaceId: transaction.workspaceId,
      userId: context.userId,
      tokens,
    });
    return callbackRedirect(request, transaction.returnTo, null);
  } catch (error) {
    console.error("[google-calendar/callback]", error);
    return callbackRedirect(request, transaction?.returnTo, error);
  }
}

function callbackRedirect(
  request: Request,
  returnTo: string | null | undefined,
  error: unknown,
): Response {
  let target = new URL(returnTo ?? "/configuracoes", request.url);
  if (target.origin !== new URL(request.url).origin) {
    target = new URL("/configuracoes", request.url);
  }
  if (error) {
    target.searchParams.set("calendar", "error");
    target.searchParams.set(
      "reason",
      error instanceof GoogleCalendarError ? error.code : "internal_error",
    );
  } else {
    target.searchParams.set("calendar", "connected");
    target.searchParams.delete("reason");
  }
  const response = Response.redirect(target, 303);
  response.headers.append(
    "Set-Cookie",
    oauthCookie({
      name: OAUTH_COOKIE_NAME,
      value: "",
      requestUrl: request.url,
      maxAge: 0,
    }),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
