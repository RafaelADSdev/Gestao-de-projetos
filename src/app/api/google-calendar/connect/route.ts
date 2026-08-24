import { requireCalendarAdminContext } from "@/lib/google-calendar/auth";
import { getGoogleCalendarConfig } from "@/lib/google-calendar/config";
import { errorResponse, oauthCookie } from "@/lib/google-calendar/http";
import {
  buildGoogleAuthorizationUrl,
  createOAuthTransaction,
  OAUTH_COOKIE_NAME,
  OAUTH_TRANSACTION_TTL_SECONDS,
  sealOAuthTransaction,
} from "@/lib/google-calendar/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireCalendarAdminContext();
    const config = getGoogleCalendarConfig(new URL(request.url).origin);
    const transaction = createOAuthTransaction({
      userId: context.userId,
      workspaceId: context.workspaceId,
      returnTo:
        new URL(request.url).searchParams.get("returnTo") ??
        "/configuracoes?calendar=connected",
    });
    const response = Response.redirect(
      buildGoogleAuthorizationUrl(config, transaction),
      302,
    );
    response.headers.append(
      "Set-Cookie",
      oauthCookie({
        name: OAUTH_COOKIE_NAME,
        value: sealOAuthTransaction(transaction, config.encryptionKey),
        requestUrl: request.url,
        maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
      }),
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
