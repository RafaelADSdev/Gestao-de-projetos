import { constantTimeEqual } from "./crypto";
import { GoogleCalendarError } from "./errors";

export function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(pair.slice(separator + 1));
  }
  return null;
}

export function oauthCookie(input: {
  name: string;
  value: string;
  requestUrl: string;
  maxAge: number;
}): string {
  const secure = new URL(input.requestUrl).protocol === "https:";
  return [
    `${input.name}=${encodeURIComponent(input.value)}`,
    "Path=/api/google-calendar",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${input.maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (!constantTimeEqual(origin, expected)) {
    throw new GoogleCalendarError(
      "Origem da requisição inválida.",
      "invalid_origin",
      403,
    );
  }
}

export function isAuthorizedCronRequest(
  request: Request,
  secret: string,
): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice(7), secret);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof GoogleCalendarError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  console.error("[google-calendar]", error);
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Não foi possível concluir a operação do Google Agenda.",
      },
    },
    { status: 500 },
  );
}
