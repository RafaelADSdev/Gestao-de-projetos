import { requireCalendarAdminContext } from "@/lib/google-calendar/auth";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { assertSameOrigin, errorResponse } from "@/lib/google-calendar/http";
import { createGoogleCalendarRuntime } from "@/lib/google-calendar/runtime";
import { processCalendarSyncQueue } from "@/lib/google-calendar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const context = await requireCalendarAdminContext();
    const runtime = createGoogleCalendarRuntime(new URL(request.url).origin);
    const body = await readBody(request);
    const requeued = body.retryFailed
      ? await runtime.repository.requeueJobs(context.workspaceId)
      : 0;
    const summary = await processCalendarSyncQueue({
      repository: runtime.repository,
      config: runtime.config,
      workspaceId: context.workspaceId,
      limit: body.limit,
    });
    if (isFormSubmission(request)) {
      const target = new URL("/calendario", request.url);
      target.searchParams.set("sync", summary.failed ? "partial" : "completed");
      target.searchParams.set("completed", String(summary.completed));
      target.searchParams.set("failed", String(summary.failed));
      return Response.redirect(target, 303);
    }
    return Response.json(
      { ok: true, requeued, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isFormSubmission(request)) {
      const target = new URL("/calendario", request.url);
      target.searchParams.set("sync", "error");
      return Response.redirect(target, 303);
    }
    return errorResponse(error);
  }
}

function isFormSubmission(request: Request): boolean {
  return Boolean(
    request.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded"),
  );
}

async function readBody(
  request: Request,
): Promise<{ retryFailed: boolean; limit?: number }> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { retryFailed: false };
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    throw new GoogleCalendarError(
      "Corpo JSON inválido.",
      "invalid_json_body",
      400,
    );
  }
  const rawLimit = body.limit;
  if (
    rawLimit !== undefined &&
    (typeof rawLimit !== "number" || !Number.isInteger(rawLimit))
  ) {
    throw new GoogleCalendarError(
      "O limite de sincronizações é inválido.",
      "invalid_sync_limit",
      400,
    );
  }
  return {
    retryFailed: body.retryFailed === true,
    limit: typeof rawLimit === "number" ? rawLimit : undefined,
  };
}
