import { getCronSecret } from "@/lib/google-calendar/config";
import { errorResponse, isAuthorizedCronRequest } from "@/lib/google-calendar/http";
import { createGoogleCalendarRuntime } from "@/lib/google-calendar/runtime";
import { processCalendarSyncQueue } from "@/lib/google-calendar/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  try {
    if (!isAuthorizedCronRequest(request, getCronSecret())) {
      return Response.json(
        { error: { code: "unauthorized", message: "Não autorizado." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const runtime = createGoogleCalendarRuntime(new URL(request.url).origin);
    const summary = await processCalendarSyncQueue({
      repository: runtime.repository,
      config: runtime.config,
      limit: 50,
    });
    return Response.json(
      { ok: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
