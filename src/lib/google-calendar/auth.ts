import { getOptionalAuthContext } from "@/lib/auth";

import { GoogleCalendarError } from "./errors";
import type { AdminContext } from "./types";

export async function requireCalendarAdminContext(): Promise<AdminContext> {
  const context = await getOptionalAuthContext();
  if (!context) {
    throw new GoogleCalendarError(
      "Autenticação necessária.",
      "authentication_required",
      401,
    );
  }
  if (context.role !== "owner" && context.role !== "admin") {
    throw new GoogleCalendarError(
      "A integração com agenda é restrita a administradores.",
      "admin_required",
      403,
    );
  }
  if (context.demo) {
    throw new GoogleCalendarError(
      "Configure o Supabase antes de conectar uma agenda real.",
      "integration_unavailable_in_demo",
      503,
    );
  }
  return {
    userId: context.userId,
    workspaceId: context.workspaceId,
    role: context.role,
  };
}
