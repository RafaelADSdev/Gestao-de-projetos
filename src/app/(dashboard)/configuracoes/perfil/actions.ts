"use server";

import { revalidatePath } from "next/cache";
import { requireAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProfileActionResult =
  | { ok: true; demo?: boolean; message?: string }
  | { ok: false; error: string };

const PIN_PATTERN = /^\d{6}$/;
const AVATAR_PATH = "avatar";
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateProfileViews() {
  revalidatePath("/");
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/perfil");
  revalidatePath("/configuracoes/acessos");
  revalidatePath("/configuracoes/log");
}

export async function updateOwnProfileAction(formData: FormData): Promise<ProfileActionResult> {
  const context = await requireAuthContext();
  const fullName = text(formData, "full_name");
  const removeAvatar = formData.get("remove_avatar") === "on";
  const avatar = formData.get("avatar");

  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: "Informe seu nome completo com 2 a 120 caracteres." };
  }
  if (avatar instanceof File && avatar.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.has(avatar.type)) {
      return { ok: false, error: "Escolha uma imagem JPG, PNG ou WebP." };
    }
    if (avatar.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "A foto precisa ter no máximo 2 MB." };
    }
  }

  if (context.demo) {
    revalidateProfileViews();
    return { ok: true, demo: true, message: "Perfil simulado na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const objectPath = `${context.userId}/${AVATAR_PATH}`;
  let avatarUrl = context.avatarUrl;

  if (removeAvatar) {
    const { error } = await supabase.storage.from("avatars").remove([objectPath]);
    if (error) return { ok: false, error: "Não foi possível remover a foto atual." };
    avatarUrl = null;
  }

  if (avatar instanceof File && avatar.size > 0) {
    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(objectPath, bytes, {
        cacheControl: "3600",
        contentType: avatar.type,
        upsert: true,
      });
    if (uploadError) return { ok: false, error: "Não foi possível enviar a foto. Confira as políticas do bucket de avatares." };
    const publicUrl = supabase.storage.from("avatars").getPublicUrl(objectPath).data.publicUrl;
    avatarUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, avatar_url: avatarUrl })
    .eq("id", context.userId)
    .select("id")
    .maybeSingle();

  if (error || !updated) return { ok: false, error: "Não foi possível salvar seu perfil." };
  revalidateProfileViews();
  return { ok: true, message: "Perfil atualizado." };
}

export async function changeOwnPinAction(formData: FormData): Promise<ProfileActionResult> {
  const context = await requireAuthContext();
  const currentPin = text(formData, "current_pin");
  const newPin = text(formData, "new_pin");
  const confirmation = text(formData, "pin_confirmation");

  if (!PIN_PATTERN.test(newPin)) return { ok: false, error: "O novo PIN precisa ter exatamente seis dígitos." };
  if (newPin !== confirmation) return { ok: false, error: "A confirmação do PIN não corresponde." };
  if (currentPin && newPin === currentPin) return { ok: false, error: "Escolha um PIN diferente do atual." };

  if (context.demo) {
    revalidateProfileViews();
    return { ok: true, demo: true, message: "Alteração de PIN simulada." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("pin_changed_at")
    .eq("workspace_id", context.workspaceId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!membership) return { ok: false, error: "Seu acesso ativo não foi encontrado." };

  if (membership.pin_changed_at) {
    if (!PIN_PATTERN.test(currentPin)) return { ok: false, error: "Informe seu PIN atual de seis dígitos." };
    const { error: verificationError } = await supabase.auth.signInWithPassword({
      email: context.email,
      password: currentPin,
    });
    if (verificationError) return { ok: false, error: "O PIN atual está incorreto." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password: newPin });
  if (passwordError) return { ok: false, error: "O Supabase recusou o novo PIN. Confira a política de senhas do projeto." };

  const { error: auditError } = await supabase.rpc("mark_own_pin_changed");
  if (auditError) return { ok: false, error: "O PIN foi alterado, mas não foi possível registrar a data da mudança." };

  revalidateProfileViews();
  return { ok: true, message: membership.pin_changed_at ? "PIN alterado." : "PIN criado. Agora você também pode entrar sem o Google." };
}
