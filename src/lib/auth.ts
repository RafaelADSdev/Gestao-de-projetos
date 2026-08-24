import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/domain/constants";

export type WorkspaceRole = "owner" | "admin" | "member";

export type AuthContext = {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  demo: boolean;
};

const demoContext: AuthContext = {
  userId: "demo-user",
  email: "equipe@central.local",
  name: "Rafael",
  avatarUrl: null,
  workspaceId: "00000000-0000-0000-0000-000000000001",
  workspaceName: APP_NAME,
  role: "owner",
  demo: true,
};

export const getOptionalAuthContext = cache(async (): Promise<AuthContext | null> => {
  if (!isSupabaseConfigured()) return demoContext;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) return null;

  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name), profiles(email, full_name, avatar_url)")
    .eq("user_id", claims.sub)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error || !membership) return null;

  const workspace = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces;
  const profile = Array.isArray(membership.profiles)
    ? membership.profiles[0]
    : membership.profiles;
  const email = profile?.email?.trim()
    || (typeof claims.email === "string" ? claims.email : "");

  return {
    userId: claims.sub,
    email,
    name:
      profile?.full_name?.trim()
      || (typeof claims.name === "string"
        ? claims.name
        : typeof claims.email === "string"
          ? claims.email.split("@")[0]
          : "Integrante"),
    avatarUrl: profile?.avatar_url ?? null,
    workspaceId: membership.workspace_id,
    workspaceName: workspace?.name ?? APP_NAME,
    role: membership.role as WorkspaceRole,
    demo: false,
  };
});

export async function requireAuthContext() {
  const context = await getOptionalAuthContext();
  if (!context) redirect("/entrar");
  return context;
}

export async function requireAdminContext() {
  const context = await requireAuthContext();
  if (context.role === "member") throw new Error("Acesso restrito a administradores.");
  return context;
}

export async function requireOwnerContext() {
  const context = await requireAuthContext();
  if (context.role !== "owner") throw new Error("Acesso restrito ao proprietário do workspace.");
  return context;
}

export function canSeeFinance(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}
