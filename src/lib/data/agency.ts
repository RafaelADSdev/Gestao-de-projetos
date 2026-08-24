import "server-only";

import { DEMO_AGENCY_DATA, DEMO_NOW } from "@/data";
import type { AuthContext } from "@/lib/auth";
import type { AgencyData } from "@/lib/domain";

export type LoadedAgencyData = { data: AgencyData; now: string; source: "demo" | "supabase" };

/**
 * The database mapper is kept behind this boundary. Until a configured
 * workspace is available, only the non-sensitive demonstration snapshot is
 * returned. A configured deployment must never silently mix demo and real rows.
 */
export async function loadAgencyData(context: AuthContext): Promise<LoadedAgencyData> {
  if (context.demo) return { data: DEMO_AGENCY_DATA, now: DEMO_NOW, source: "demo" };

  const { loadSupabaseAgencyData } = await import("./supabase-agency");
  return {
    data: await loadSupabaseAgencyData(context),
    now: new Date().toISOString(),
    source: "supabase",
  };
}
