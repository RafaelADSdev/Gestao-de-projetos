import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./config";

export function createAdminSupabaseClient() {
  const { url } = getPublicSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY não configurada.");
  }

  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
