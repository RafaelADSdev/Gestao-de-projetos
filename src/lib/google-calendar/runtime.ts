import { createAdminSupabaseClient } from "@/lib/supabase/admin";

import { getGoogleCalendarConfig } from "./config";
import { GoogleCalendarApi } from "./google-api";
import { processCalendarSyncQueue } from "./service";
import { SupabaseGoogleCalendarRepository } from "./supabase-repository";

export function createGoogleCalendarRuntime(origin?: string) {
  return {
    config: getGoogleCalendarConfig(origin),
    api: new GoogleCalendarApi(),
    repository: new SupabaseGoogleCalendarRepository(
      createAdminSupabaseClient(),
    ),
  };
}

/** Call after a deadline/subscription save; database triggers enqueue the job. */
export async function syncGoogleCalendarWorkspace(
  workspaceId: string,
  options: { origin?: string; limit?: number } = {},
) {
  const runtime = createGoogleCalendarRuntime(options.origin);
  return processCalendarSyncQueue({
    repository: runtime.repository,
    config: runtime.config,
    workspaceId,
    limit: options.limit ?? 10,
  });
}
