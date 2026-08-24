"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerContext, type WorkspaceRole } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AccessActionResult =
  | { ok: true; demo?: boolean; message?: string }
  | { ok: false; error: string };

const PIN_PATTERN = /^\d{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function role(value: string): WorkspaceRole | null {
  return value === "owner" || value === "admin" || value === "member" ? value : null;
}

function revalidateAccessViews() {
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/acessos");
  revalidatePath("/configuracoes/log");
  revalidatePath("/projetos");
  revalidatePath("/quadro");
}

export async function createMemberAccessAction(formData: FormData): Promise<AccessActionResult> {
  const context = await requireOwnerContext();
  const fullName = text(formData, "full_name");
  const email = text(formData, "email").toLocaleLowerCase("pt-BR");
  const pin = text(formData, "pin");
  const memberRole = role(text(formData, "role"));

  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Informe o nome completo com 2 a 120 caracteres." };
  }
  if (!EMAIL_PATTERN.test(email)) return { ok: false, error: "Informe um e-mail válido." };
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: "O PIN precisa ter exatamente seis dígitos." };
  if (!memberRole) return { ok: false, error: "Selecione um papel de acesso válido." };

  if (context.demo) {
    revalidateAccessViews();
    return { ok: true, demo: true, message: "Acesso simulado na demonstração." };
  }

  let admin;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { ok: false, error: "A chave secreta do Supabase precisa estar configurada para criar acessos." };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return { ok: false, error: "Não foi possível criar o acesso. Verifique se o e-mail já existe e se o projeto permite PIN de seis dígitos." };
  }

  const supabase = await createServerSupabaseClient();
  const { error: membershipError } = await supabase.from("workspace_members").insert({
    workspace_id: context.workspaceId,
    user_id: created.user.id,
    role: memberRole,
    status: "active",
    name: fullName,
    avatar_url: null,
    pin_changed_at: new Date().toISOString(),
  });

  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "O usuário foi revertido porque não foi possível vinculá-lo ao workspace." };
  }

  revalidateAccessViews();
  return { ok: true, message: `Acesso de ${fullName} criado.` };
}

export async function updateMemberAccessAction(userId: string, formData: FormData): Promise<AccessActionResult> {
  const context = await requireOwnerContext();
  const fullName = text(formData, "full_name");
  const memberRole = role(text(formData, "role"));
  const status = text(formData, "status");

  if (!userId) return { ok: false, error: "Integrante não informado." };
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Informe o nome completo com 2 a 120 caracteres." };
  }
  if (!memberRole || (status !== "active" && status !== "suspended")) {
    return { ok: false, error: "Papel ou status inválido." };
  }
  if (context.demo) {
    revalidateAccessViews();
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: target, error: targetError } = await supabase
    .from("workspace_members")
    .select("user_id, role, status")
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError || !target) return { ok: false, error: "Integrante não encontrado neste workspace." };
  if (userId === context.userId && (memberRole !== target.role || status !== target.status)) {
    return { ok: false, error: "Você pode alterar seu nome, mas não pode mudar o próprio papel ou status." };
  }

  if (target.role === "owner" && (memberRole !== "owner" || status !== "active")) {
    const { count } = await supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspaceId)
      .eq("role", "owner")
      .eq("status", "active");
    if ((count ?? 0) <= 1) return { ok: false, error: "O workspace precisa manter ao menos um proprietário ativo." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (profileError) return { ok: false, error: "Não foi possível atualizar o nome do integrante." };

  const { data: updated, error: membershipError } = await supabase
    .from("workspace_members")
    .update({ role: memberRole, status })
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();
  if (membershipError || !updated) return { ok: false, error: "O nome foi salvo, mas não foi possível atualizar o nível de acesso." };

  revalidateAccessViews();
  return { ok: true, message: "Acesso atualizado." };
}

export async function resetMemberPinAction(userId: string, formData: FormData): Promise<AccessActionResult> {
  const context = await requireOwnerContext();
  const pin = text(formData, "pin");
  if (!userId) return { ok: false, error: "Integrante não informado." };
  if (!PIN_PATTERN.test(pin)) return { ok: false, error: "O novo PIN precisa ter exatamente seis dígitos." };

  if (context.demo) {
    revalidateAccessViews();
    return { ok: true, demo: true, message: "Redefinição simulada." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Integrante não encontrado neste workspace." };

  let admin;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { ok: false, error: "A chave secreta do Supabase precisa estar configurada para redefinir PINs." };
  }
  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password: pin });
  if (passwordError) return { ok: false, error: "O Supabase recusou o novo PIN. Confira a política de senhas do projeto." };

  const { error: auditError } = await supabase
    .from("workspace_members")
    .update({ pin_changed_at: new Date().toISOString() })
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId);
  if (auditError) return { ok: false, error: "O PIN foi alterado, mas o registro de auditoria não pôde ser atualizado." };

  revalidateAccessViews();
  return { ok: true, message: "PIN redefinido sem armazenar seu valor no painel." };
}

export async function deleteMemberAccessAction(userId: string): Promise<AccessActionResult> {
  const context = await requireOwnerContext();
  if (!userId) return { ok: false, error: "Integrante não informado." };
  if (userId === context.userId) return { ok: false, error: "Você não pode excluir o próprio acesso enquanto estiver conectado." };

  if (context.demo) {
    revalidateAccessViews();
    return { ok: true, demo: true, message: "Exclusão simulada." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: target } = await supabase
    .from("workspace_members")
    .select("user_id, role, name")
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Integrante não encontrado neste workspace." };

  if (target.role === "owner") {
    const { count } = await supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", context.workspaceId)
      .eq("role", "owner")
      .eq("status", "active");
    if ((count ?? 0) <= 1) return { ok: false, error: "O último proprietário não pode ser excluído." };
  }

  const { error: membershipError } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", userId);
  if (membershipError) return { ok: false, error: "Não foi possível remover o acesso do workspace." };

  let authRemoved = false;
  try {
    const admin = createAdminSupabaseClient();
    await admin.storage.from("avatars").remove([`${userId}/avatar`]);
    const { error } = await admin.auth.admin.deleteUser(userId);
    authRemoved = !error;
  } catch {
    authRemoved = false;
  }

  revalidateAccessViews();
  return {
    ok: true,
    message: authRemoved
      ? `Acesso de ${target.name ?? "integrante"} excluído.`
      : "O acesso ao workspace foi removido. A conta de autenticação precisa ser revisada no Supabase.",
  };
}
