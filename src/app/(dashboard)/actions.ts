"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext, requireAuthContext } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; demo?: boolean; id?: string; message?: string } | { ok: false; error: string };

const WORKFLOW_REVALIDATION_PATHS = ["/quadro", "/backlog", "/projetos", "/configuracoes/fluxos"] as const;
const TECHNOLOGY_CATEGORIES = new Set(["frontend", "backend", "database", "infrastructure", "design", "analytics", "other"]);
const SPRINT_STATUSES = new Set(["planned", "active", "completed"]);
const ADMINISTRATIVE_EXPENSE_CATEGORIES = new Set(["people", "software", "marketing", "office", "taxes", "banking", "other"]);
const ADMINISTRATIVE_EXPENSE_CYCLES = new Set(["monthly", "quarterly", "semiannual", "annual", "one-time"]);
const ADMINISTRATIVE_EXPENSE_STATUSES = new Set(["active", "paused", "canceled"]);

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function moneyInCents(formData: FormData, key: string) {
  const raw = text(formData, key).replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

function isSafeResourceUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

function safeKey(value: string, fallback: string) {
  const normalized = (value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return normalized || fallback;
}

async function uniqueKey(
  requested: string,
  exists: (candidate: string) => Promise<boolean>,
) {
  const base = safeKey(requested, "fluxo");
  if (!(await exists(base))) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base.slice(0, Math.max(1, 63 - String(suffix).length))}-${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base.slice(0, 48)}-${Date.now().toString(36)}`;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function administrativeExpenseValues(formData: FormData) {
  const name = text(formData, "name");
  const category = text(formData, "category") || "other";
  const amountCents = moneyInCents(formData, "amount");
  const billingCycle = text(formData, "billing_cycle") || "monthly";
  const dueDate = optionalText(formData, "due_date");
  const status = text(formData, "status") || "active";
  const notes = optionalText(formData, "notes");

  if (name.length < 2 || name.length > 120) {
    return { ok: false as const, error: "Informe um nome de despesa entre 2 e 120 caracteres." };
  }
  if (amountCents === null) {
    return { ok: false as const, error: "Informe um valor v\u00e1lido para a despesa." };
  }
  if (!ADMINISTRATIVE_EXPENSE_CATEGORIES.has(category)) {
    return { ok: false as const, error: "Escolha uma categoria de despesa v\u00e1lida." };
  }
  if (!ADMINISTRATIVE_EXPENSE_CYCLES.has(billingCycle)) {
    return { ok: false as const, error: "Escolha um ciclo de cobran\u00e7a v\u00e1lido." };
  }
  if (!ADMINISTRATIVE_EXPENSE_STATUSES.has(status)) {
    return { ok: false as const, error: "Escolha um status v\u00e1lido." };
  }
  if (dueDate && !validIsoDate(dueDate)) {
    return { ok: false as const, error: "Informe uma data de vencimento v\u00e1lida." };
  }
  if (notes && notes.length > 500) {
    return { ok: false as const, error: "As observa\u00e7\u00f5es podem ter no m\u00e1ximo 500 caracteres." };
  }

  return {
    ok: true as const,
    value: {
      name,
      category,
      amount_cents: amountCents,
      currency: "BRL",
      billing_cycle: billingCycle,
      due_date: dueDate,
      status,
      notes,
    },
  };
}

function administrativeExpenseMigrationMessage(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" && error.message?.includes("administrative_expenses")
    ? "A tabela de despesas ainda não foi criada no Supabase. Execute a migração administrative_expenses antes de cadastrar."
    : null;
}

function validHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function formValues(formData: FormData, key: string) {
  return formData.getAll(key).filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
}

function revalidateWorkflowViews() {
  WORKFLOW_REVALIDATION_PATHS.forEach((path) => revalidatePath(path));
}

function revalidateProjectViews(projectId: string) {
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/projetos");
  revalidatePath("/quadro");
  revalidatePath("/backlog");
  revalidatePath("/portfolio");
  revalidatePath("/");
}

function revalidateWorkItemViews(projectId?: string) {
  revalidatePath("/backlog");
  revalidatePath("/quadro");
  if (projectId) revalidatePath(`/projetos/${projectId}`);
}

async function tryImmediateCalendarSync(workspaceId: string) {
  try {
    const { syncGoogleCalendarWorkspace } = await import("@/lib/google-calendar/runtime");
    await syncGoogleCalendarWorkspace(workspaceId, { limit: 5 });
  } catch {
    // The database queue is the durable fallback. The calendar screen exposes
    // pending/failed work and the daily cron retries it.
  }
}

export async function moveProjectAction(projectId: string, stageId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId || !stageId) return { ok: false, error: "Projeto e etapa são obrigatórios." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, workflow_id")
    .eq("id", projectId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (!project) return { ok: false, error: "Projeto não encontrado neste workspace." };

  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, key")
    .eq("workspace_id", context.workspaceId)
    .eq("workflow_id", project.workflow_id)
    .is("archived_at", null);
  const column = columns?.find((item) => item.id === stageId || item.key === stageId);
  if (!column) return { ok: false, error: "A etapa informada não existe." };
  const { error } = await supabase
    .from("projects")
    .update({ board_column_id: column.id, updated_by: context.userId })
    .eq("id", projectId)
    .eq("workspace_id", context.workspaceId);

  if (error) return { ok: false, error: "Não foi possível mover o projeto." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: "stage_changed",
    entity_type: "project",
    entity_id: projectId,
    metadata: { board_column_id: column.id, stage_key: column.key },
  });
  revalidateProjectViews(projectId);
  return { ok: true };
}

export async function createClientAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const parsed = parseClientForm(formData);
  if (!parsed.ok) return parsed;
  if (context.demo) {
    revalidatePath("/clientes");
    return { ok: true, demo: true, id: `demo-${Date.now()}`, message: "Cliente cadastrado na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("clients").insert({
    workspace_id: context.workspaceId,
    name: parsed.value.name,
    company_name: parsed.value.companyName,
    contact_name: parsed.value.contactName,
    email: parsed.value.email,
    phone: parsed.value.phone,
    notes: parsed.value.notes,
    created_by: context.userId,
  }).select("id").single();
  if (error || !data) return { ok: false, error: "Não foi possível cadastrar o cliente." };

  const avatarResult = await persistClientAvatar(supabase, context.workspaceId, data.id, parsed.value.avatar, parsed.value.removeAvatar);
  if (!avatarResult.ok) return avatarResult;
  if (avatarResult.avatarUrl) {
    await supabase.from("clients").update({ avatar_url: avatarResult.avatarUrl }).eq("id", data.id).eq("workspace_id", context.workspaceId);
  }

  revalidatePath("/clientes");
  return { ok: true, id: data.id, message: "Cliente cadastrado com sucesso." };
}

export async function updateClientAction(clientId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!clientId) return { ok: false, error: "Cliente não informado." };
  const parsed = parseClientForm(formData);
  if (!parsed.ok) return parsed;
  if (context.demo) {
    revalidatePath("/clientes");
    return { ok: true, demo: true, message: "Cliente atualizado na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from("clients")
    .select("id, avatar_url")
    .eq("workspace_id", context.workspaceId)
    .eq("id", clientId)
    .is("archived_at", null)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Cliente não encontrado neste workspace." };

  const avatarResult = await persistClientAvatar(
    supabase,
    context.workspaceId,
    clientId,
    parsed.value.avatar,
    parsed.value.removeAvatar,
    existing.avatar_url,
  );
  if (!avatarResult.ok) return avatarResult;

  const { error } = await supabase.from("clients").update({
    name: parsed.value.name,
    company_name: parsed.value.companyName,
    contact_name: parsed.value.contactName,
    email: parsed.value.email,
    phone: parsed.value.phone,
    notes: parsed.value.notes,
    avatar_url: avatarResult.avatarUrl,
  }).eq("workspace_id", context.workspaceId).eq("id", clientId);
  if (error) return { ok: false, error: "Não foi possível atualizar o cliente." };
  revalidatePath("/clientes");
  return { ok: true, message: "Cliente atualizado com sucesso." };
}

function parseClientForm(formData: FormData):
  | { ok: false; error: string }
  | {
    ok: true;
    value: {
      name: string;
      companyName: string | null;
      contactName: string | null;
      email: string | null;
      phone: string | null;
      notes: string | null;
      avatar: File | null;
      removeAvatar: boolean;
    };
  } {
  const name = text(formData, "name");
  const companyName = optionalText(formData, "company_name");
  const contactName = optionalText(formData, "contact_name");
  const email = optionalText(formData, "email");
  const phone = optionalText(formData, "phone");
  const notes = optionalText(formData, "notes");
  const removeAvatar = formData.get("remove_avatar") === "on";
  const avatarField = formData.get("avatar");
  const avatar = avatarField instanceof File && avatarField.size > 0 ? avatarField : null;

  if (name.length < 2 || name.length > 160) {
    return { ok: false, error: "Informe um nome entre 2 e 160 caracteres." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Informe um e-mail válido." };
  }
  if (notes && notes.length > 2000) {
    return { ok: false, error: "As observações podem ter no máximo 2000 caracteres." };
  }
  if (avatar) {
    if (!ALLOWED_CLIENT_AVATAR_TYPES.has(avatar.type)) {
      return { ok: false, error: "Escolha uma imagem JPG, PNG ou WebP." };
    }
    if (avatar.size > MAX_CLIENT_AVATAR_BYTES) {
      return { ok: false, error: "A foto precisa ter no máximo 2 MB." };
    }
  }

  return {
    ok: true,
    value: { name, companyName, contactName, email, phone, notes, avatar, removeAvatar },
  };
}

const ALLOWED_CLIENT_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CLIENT_AVATAR_BYTES = 2 * 1024 * 1024;

async function persistClientAvatar(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  workspaceId: string,
  clientId: string,
  avatar: File | null,
  removeAvatar: boolean,
  currentUrl: string | null = null,
): Promise<{ ok: true; avatarUrl: string | null } | { ok: false; error: string }> {
  const objectPath = `${workspaceId}/${clientId}/avatar`;
  let avatarUrl = currentUrl;

  if (removeAvatar) {
    const { error } = await supabase.storage.from("client-avatars").remove([objectPath]);
    if (error) return { ok: false, error: "Não foi possível remover a foto do cliente." };
    avatarUrl = null;
  }

  if (avatar) {
    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("client-avatars")
      .upload(objectPath, bytes, {
        cacheControl: "3600",
        contentType: avatar.type,
        upsert: true,
      });
    if (uploadError) return { ok: false, error: "Não foi possível enviar a foto do cliente." };
    const publicUrl = supabase.storage.from("client-avatars").getPublicUrl(objectPath).data.publicUrl;
    avatarUrl = `${publicUrl}?v=${Date.now()}`;
  }

  return { ok: true, avatarUrl };
}

export async function createProjectAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const name = text(formData, "name");
  const clientId = text(formData, "client_id");
  const requestedWorkflowId = optionalText(formData, "workflow_id");
  const requestedColumnId = optionalText(formData, "board_column_id");
  const requestedSprintId = optionalText(formData, "sprint_id");
  const technologyIds = [...new Set([
    ...formValues(formData, "technology_ids"),
    ...formValues(formData, "technology_ids[]"),
  ])];
  const dueDate = optionalText(formData, "due_date");
  if (name.length < 2 || name.length > 180 || !clientId) return { ok: false, error: "Preencha projeto e cliente." };
  if (dueDate && !validIsoDate(dueDate)) return { ok: false, error: "Informe um prazo válido." };

  if (context.demo) redirect("/projetos/project-nautica");
  const supabase = await createServerSupabaseClient();
  const templateKey = text(formData, "project_type") || "site-institucional";
  const [{ data: client }, { data: template }, { data: responsible }] = await Promise.all([
    supabase.from("clients").select("id").eq("workspace_id", context.workspaceId).eq("id", clientId).is("archived_at", null).maybeSingle(),
    supabase.from("project_templates").select("id, project_type").eq("workspace_id", context.workspaceId).eq("key", templateKey).eq("active", true).maybeSingle(),
    supabase.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", optionalText(formData, "responsible_id") ?? context.userId).eq("status", "active").maybeSingle(),
  ]);
  if (!client || !template || !responsible) return { ok: false, error: "Cliente, modelo ou responsável inválido para este workspace." };

  let workflowQuery = supabase
    .from("workflows")
    .select("id, sprint_enabled")
    .eq("workspace_id", context.workspaceId)
    .is("archived_at", null);
  if (requestedWorkflowId) workflowQuery = workflowQuery.eq("id", requestedWorkflowId);
  else workflowQuery = workflowQuery.eq("is_default", true);
  let { data: workflow } = await workflowQuery.limit(1).maybeSingle();
  if (!workflow && !requestedWorkflowId) {
    const fallback = await supabase.from("workflows").select("id, sprint_enabled").eq("workspace_id", context.workspaceId).is("archived_at", null).order("created_at", { ascending: true }).limit(1).maybeSingle();
    workflow = fallback.data;
  }
  if (!workflow) return { ok: false, error: "Nenhum fluxo ativo foi encontrado." };

  const { data: availableColumns } = await supabase
    .from("board_columns")
    .select("id, key")
    .eq("workspace_id", context.workspaceId)
    .eq("workflow_id", workflow.id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const column = requestedColumnId
    ? availableColumns?.find((item) => item.id === requestedColumnId || item.key === requestedColumnId)
    : availableColumns?.[0];
  if (!column) return { ok: false, error: requestedColumnId ? "A etapa não pertence ao fluxo selecionado." : "O fluxo ainda não possui uma etapa ativa." };

  let sprintId: string | null = null;
  if (requestedSprintId) {
    if (!workflow.sprint_enabled) return { ok: false, error: "Este fluxo não utiliza sprints." };
    const { data: sprint } = await supabase.from("sprints").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", workflow.id).eq("id", requestedSprintId).neq("status", "completed").maybeSingle();
    if (!sprint) return { ok: false, error: "A sprint não pertence ao fluxo selecionado ou já foi concluída." };
    sprintId = sprint.id;
  }

  if (technologyIds.length > 0) {
    const { data: technologies } = await supabase.from("technologies").select("id").eq("workspace_id", context.workspaceId).in("id", technologyIds).is("archived_at", null);
    if (!technologies || technologies.length !== technologyIds.length) return { ok: false, error: "Uma ou mais tecnologias não pertencem a este workspace." };
  }
  if (!column || !template) return { ok: false, error: "Etapa ou modelo de projeto inválido." };
  const { data, error } = await supabase.from("projects").insert({
    workspace_id: context.workspaceId,
    client_id: clientId,
    workflow_id: workflow.id,
    board_column_id: column.id,
    sprint_id: sprintId,
    template_id: template.id,
    name,
    project_type: template.project_type,
    responsible_id: optionalText(formData, "responsible_id") ?? context.userId,
    next_action: optionalText(formData, "next_action"),
    description: optionalText(formData, "description"),
    blocked: false,
    created_by: context.userId,
    updated_by: context.userId,
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar o projeto." };

  if (technologyIds.length > 0) {
    const { error: technologiesError } = await supabase.from("project_technologies").insert(
      technologyIds.map((technologyId) => ({
        workspace_id: context.workspaceId,
        project_id: data.id,
        technology_id: technologyId,
      })),
    );
    if (technologiesError) return { ok: false, error: "Projeto criado, mas não foi possível vincular as tecnologias." };
  }

  if (dueDate) {
    await supabase.from("deadlines").insert({
      workspace_id: context.workspaceId,
      project_id: data.id,
      title: "Entrega do projeto",
      due_date: dueDate,
      all_day: true,
      sync_enabled: true,
    });
  }

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: data.id,
    actor_id: context.userId,
    action: "project_created",
    entity_type: "project",
    entity_id: data.id,
    metadata: {},
  });

  if (dueDate) await tryImmediateCalendarSync(context.workspaceId);

  revalidateProjectViews(data.id);
  redirect(`/projetos/${data.id}`);
}

export async function updateProjectAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const name = text(formData, "name");
  const responsibleValue = formData.get("responsible_id");
  const responsibleWasSubmitted = typeof responsibleValue === "string";
  const responsibleId = responsibleWasSubmitted ? responsibleValue.trim() || null : null;
  if (name.length < 2 || name.length > 180) return { ok: false, error: "Informe um nome de projeto válido." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  if (responsibleId) {
    const { data: member } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", responsibleId).eq("status", "active").maybeSingle();
    if (!member) return { ok: false, error: "O responsável precisa ser um membro ativo deste workspace." };
  }
  const payload: Record<string, string | boolean | null> = {
    name,
    next_action: optionalText(formData, "next_action"),
    description: optionalText(formData, "description"),
    blocked: formData.get("blocked") === "on",
    blocker_reason: formData.get("blocked") === "on" ? optionalText(formData, "blocker_reason") : null,
    updated_by: context.userId,
  };
  if (responsibleWasSubmitted) payload.responsible_id = responsibleId;
  const { data: updatedProject, error } = await supabase.from("projects").update(payload).eq("id", projectId).eq("workspace_id", context.workspaceId).select("id").maybeSingle();
  if (!updatedProject && !error) return { ok: false, error: "Projeto não encontrado neste workspace." };
  if (error) return { ok: false, error: "Não foi possível atualizar o projeto." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: "project_updated",
    entity_type: "project",
    entity_id: projectId,
    metadata: { summary: "Atualizou o resumo e a próxima ação do projeto." },
  });
  revalidateProjectViews(projectId);
  return { ok: true };
}

export async function toggleChecklistItemAction(itemId: string, completed: boolean): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("checklist_items").update({
    completed_at: completed ? new Date().toISOString() : null,
    completed_by: completed ? context.userId : null,
  }).eq("id", itemId).eq("workspace_id", context.workspaceId).select("project_id").single();
  if (error) return { ok: false, error: "Não foi possível atualizar o checklist." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: data.project_id,
    actor_id: context.userId,
    action: completed ? "checklist_completed" : "checklist_reopened",
    entity_type: "checklist_item",
    entity_id: itemId,
    metadata: { summary: completed ? "Concluiu um item do checklist." : "Reabriu um item do checklist." },
  });
  revalidatePath(`/projetos/${data.project_id}`);
  return { ok: true };
}

export async function addChecklistItemAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const title = text(formData, "title");
  if (title.length < 2) return { ok: false, error: "Informe o item do checklist." };
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { data: lastItem } = await supabase
    .from("checklist_items")
    .select("position")
    .eq("workspace_id", context.workspaceId)
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: item, error } = await supabase.from("checklist_items").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    title,
    description: optionalText(formData, "description"),
    position: (lastItem?.position ?? -1) + 1,
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível adicionar o item." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "checklist_created", entity_type: "checklist_item", entity_id: item.id, metadata: { summary: `Adicionou “${title}” ao checklist.` } });
  revalidatePath(`/projetos/${projectId}`);
  return { ok: true };
}

export async function addResourceAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const url = text(formData, "url");
  if (!isSafeResourceUrl(url)) return { ok: false, error: "Informe uma URL HTTP(S) sem credenciais incorporadas." };
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { data: resource, error } = await supabase.from("project_resources").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    label: text(formData, "label") || "Link",
    resource_type: text(formData, "resource_type") || "other",
    url,
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível adicionar o link." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "resource_created", entity_type: "project_resource", entity_id: resource.id, metadata: { summary: `Adicionou o link “${text(formData, "label") || "Link"}”.` } });
  revalidatePath(`/projetos/${projectId}`);
  return { ok: true };
}

export async function addDeadlineAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const title = text(formData, "title");
  const dueDate = text(formData, "due_date");
  if (!title || !dueDate) return { ok: false, error: "Informe título e data." };
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { data: deadline, error } = await supabase.from("deadlines").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    title,
    kind: text(formData, "kind") || "other",
    due_date: dueDate,
    due_time: optionalText(formData, "due_time"),
    all_day: !optionalText(formData, "due_time"),
    sync_enabled: formData.get("sync_enabled") === "on",
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível adicionar o prazo." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "deadline_created", entity_type: "deadline", entity_id: deadline.id, metadata: { summary: `Criou o prazo “${title}”.` } });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/calendario");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true };
}

export async function setDeadlineStateAction(
  projectId: string,
  deadlineId: string,
  state: "open" | "completed" | "canceled",
): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!(["open", "completed", "canceled"] as const).includes(state)) {
    return { ok: false, error: "Estado do prazo inválido." };
  }
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("deadlines").update({ status: state })
    .eq("id", deadlineId)
    .eq("project_id", projectId)
    .eq("workspace_id", context.workspaceId);
  if (error) return { ok: false, error: "Não foi possível atualizar o prazo." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: state === "completed" ? "deadline_completed" : state === "canceled" ? "deadline_canceled" : "deadline_reopened",
    entity_type: "deadline",
    entity_id: deadlineId,
    metadata: { summary: state === "completed" ? "Concluiu um prazo do projeto." : state === "canceled" ? "Cancelou um prazo do projeto." : "Reabriu um prazo do projeto." },
  });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true };
}

export async function updateCommercialTermsAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const projectValue = moneyInCents(formData, "project_value") ?? moneyInCents(formData, "contract_value");
  const monthlyRevenue = moneyInCents(formData, "monthly_revenue");
  const payload = {
    workspace_id: context.workspaceId,
    project_id: projectId,
    contract_value_cents: projectValue,
    monthly_revenue_cents: monthlyRevenue,
    maintenance_billing_cycle: monthlyRevenue ? text(formData, "billing_cycle") || "monthly" : null,
    maintenance_status: monthlyRevenue ? text(formData, "maintenance_status") || "active" : "planned",
    payment_status: text(formData, "payment_status") || "pending",
    currency: "BRL",
    notes: optionalText(formData, "notes"),
  };
  const { error } = await supabase.from("commercial_terms").upsert(payload, { onConflict: "project_id" });
  if (error) return { ok: false, error: "Não foi possível atualizar o financeiro." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "commercial_terms_updated", entity_type: "commercial_terms", entity_id: projectId, metadata: { summary: "Atualizou as condições comerciais do projeto." } });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function addSubscriptionAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const serviceName = text(formData, "service_name");
  const renewalDate = text(formData, "renewal_date");
  const billingCycle = text(formData, "billing_cycle") || "annual";
  if (serviceName.length < 2 || !renewalDate) return { ok: false, error: "Informe serviço e renovação." };
  if (context.demo) return { ok: true, demo: true };

  const supabase = await createServerSupabaseClient();
  const { data: subscription, error } = await supabase.from("subscriptions").insert({
    workspace_id: context.workspaceId,
    service_name: serviceName,
    plan_name: optionalText(formData, "plan_name"),
    category: text(formData, "category") || "other",
    billing_cycle: billingCycle,
    renewal_date: renewalDate,
    auto_renew: formData.get("auto_renew") === "on",
    payer: text(formData, "payer") || "agency",
    status: "active",
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível cadastrar a assinatura." };

  const amountCents = moneyInCents(formData, "amount");
  if (amountCents !== null) {
    const { error: financeError } = await supabase.from("subscription_financials").insert({
      workspace_id: context.workspaceId,
      subscription_id: subscription.id,
      amount_cents: amountCents,
      billing_cycle: billingCycle,
      currency: "BRL",
      vault_reference: optionalText(formData, "vault_reference"),
    });
    if (financeError) return { ok: false, error: "Assinatura criada, mas o custo não pôde ser salvo." };
  }

  const { error: linkError } = await supabase.from("project_subscriptions").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    subscription_id: subscription.id,
  });
  if (linkError) return { ok: false, error: "Assinatura criada, mas não foi vinculada ao projeto." };

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: "subscription_created",
    entity_type: "subscription",
    entity_id: subscription.id,
    metadata: { service_name: serviceName, summary: `Vinculou a assinatura “${serviceName}”.` },
  });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/financeiro");
  revalidatePath("/calendario");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true, id: subscription.id };
}

export async function rescheduleSubscriptionAction(
  projectId: string,
  subscriptionId: string,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireAdminContext();
  const renewalDate = text(formData, "renewal_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) return { ok: false, error: "Informe uma data de renovação válida." };
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("subscriptions").update({ renewal_date: renewalDate })
    .eq("id", subscriptionId)
    .eq("workspace_id", context.workspaceId);
  if (error) return { ok: false, error: "Não foi possível alterar a renovação." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: "subscription_rescheduled",
    entity_type: "subscription",
    entity_id: subscriptionId,
    metadata: { renewal_date: renewalDate, summary: `Reagendou uma renovação para ${renewalDate}.` },
  });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/financeiro");
  revalidatePath("/calendario");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true };
}

export async function setSubscriptionStatusAction(
  projectId: string,
  subscriptionId: string,
  status: "active" | "paused" | "canceled",
): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!(["active", "paused", "canceled"] as const).includes(status)) {
    return { ok: false, error: "Estado da assinatura inválido." };
  }
  if (context.demo) return { ok: true, demo: true };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("subscriptions").update({ status })
    .eq("id", subscriptionId)
    .eq("workspace_id", context.workspaceId);
  if (error) return { ok: false, error: "Não foi possível atualizar a assinatura." };
  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: status === "active" ? "subscription_reactivated" : status === "paused" ? "subscription_paused" : "subscription_canceled",
    entity_type: "subscription",
    entity_id: subscriptionId,
    metadata: { summary: status === "active" ? "Reativou uma assinatura do projeto." : status === "paused" ? "Pausou uma assinatura do projeto." : "Encerrou uma assinatura do projeto." },
  });
  revalidatePath(`/projetos/${projectId}`);
  revalidatePath("/financeiro");
  revalidatePath("/calendario");
  revalidatePath("/");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true };
}

export async function createWorkflowAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const description = optionalText(formData, "description");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe um nome de fluxo entre 2 e 80 caracteres." };
  if (description && description.length > 500) return { ok: false, error: "A descrição pode ter no máximo 500 caracteres." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, id: `demo-workflow-${Date.now()}` };
  }

  const supabase = await createServerSupabaseClient();
  const key = await uniqueKey(text(formData, "key") || name, async (candidate) => {
    const { data } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("key", candidate).limit(1).maybeSingle();
    return Boolean(data);
  });
  const { count } = await supabase.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).is("archived_at", null);
  const shouldBeDefault = formData.get("is_default") === "on" || (count ?? 0) === 0;
  const { data: workflow, error } = await supabase.from("workflows").insert({
    workspace_id: context.workspaceId,
    name,
    key,
    description,
    sprint_enabled: formData.get("sprint_enabled") === "on",
    is_default: false,
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar o fluxo. Verifique se o nome e a chave são únicos." };

  if (shouldBeDefault) {
    const { data: previousDefault } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("is_default", true).neq("id", workflow.id).limit(1).maybeSingle();
    const { error: clearDefaultError } = await supabase.from("workflows").update({ is_default: false }).eq("workspace_id", context.workspaceId).neq("id", workflow.id);
    if (clearDefaultError) return { ok: false, error: "Fluxo criado, mas não foi possível trocar o fluxo padrão." };
    const { error: defaultError } = await supabase.from("workflows").update({ is_default: true }).eq("workspace_id", context.workspaceId).eq("id", workflow.id);
    if (defaultError) {
      if (previousDefault) await supabase.from("workflows").update({ is_default: true }).eq("workspace_id", context.workspaceId).eq("id", previousDefault.id);
      return { ok: false, error: "Fluxo criado, mas não foi possível defini-lo como padrão." };
    }
  }
  revalidateWorkflowViews();
  return { ok: true, id: workflow.id, message: "Fluxo criado." };
}

export async function updateWorkflowAction(workflowId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const description = optionalText(formData, "description");
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe um nome de fluxo entre 2 e 80 caracteres." };
  if (description && description.length > 500) return { ok: false, error: "A descrição pode ter no máximo 500 caracteres." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: current } = await supabase.from("workflows").select("id, key, is_default, sprint_enabled").eq("workspace_id", context.workspaceId).eq("id", workflowId).is("archived_at", null).maybeSingle();
  if (!current) return { ok: false, error: "Fluxo não encontrado neste workspace." };
  const requestedDefault = formData.get("is_default") === "on";
  if (current.is_default && !requestedDefault) {
    const { data: anotherDefault } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("is_default", true).is("archived_at", null).neq("id", workflowId).limit(1).maybeSingle();
    if (!anotherDefault) return { ok: false, error: "Defina outro fluxo como padrão antes de remover esta opção." };
  }
  const key = await uniqueKey(text(formData, "key") || name, async (candidate) => {
    const { data } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("key", candidate).neq("id", workflowId).limit(1).maybeSingle();
    return Boolean(data);
  });
  const sprintEnabled = formData.get("sprint_enabled") === "on";
  let previousDefaultId: string | null = null;
  if (requestedDefault && !current.is_default) {
    const { data: previousDefault } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("is_default", true).is("archived_at", null).limit(1).maybeSingle();
    previousDefaultId = previousDefault?.id ?? null;
    if (previousDefaultId) {
      const { error: clearDefaultError } = await supabase.from("workflows").update({ is_default: false }).eq("workspace_id", context.workspaceId).eq("id", previousDefaultId);
      if (clearDefaultError) return { ok: false, error: "Não foi possível trocar o fluxo padrão." };
    }
  }
  const { error } = await supabase.from("workflows").update({
    name,
    key,
    description,
    sprint_enabled: sprintEnabled,
    is_default: requestedDefault,
  }).eq("workspace_id", context.workspaceId).eq("id", workflowId);
  if (error) {
    if (previousDefaultId) await supabase.from("workflows").update({ is_default: true }).eq("workspace_id", context.workspaceId).eq("id", previousDefaultId);
    return { ok: false, error: "Não foi possível atualizar o fluxo." };
  }

  if (requestedDefault) {
    await supabase.from("workflows").update({ is_default: false }).eq("workspace_id", context.workspaceId).neq("id", workflowId);
  }
  if (current.sprint_enabled && !sprintEnabled) {
    await supabase.from("projects").update({ sprint_id: null, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).not("sprint_id", "is", null);
  }
  revalidateWorkflowViews();
  return { ok: true, message: "Fluxo atualizado." };
}

export async function archiveWorkflowAction(workflowId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: workflow } = await supabase.from("workflows").select("id, is_default").eq("workspace_id", context.workspaceId).eq("id", workflowId).is("archived_at", null).maybeSingle();
  if (!workflow) return { ok: false, error: "Fluxo não encontrado ou já arquivado." };
  if (workflow.is_default) return { ok: false, error: "O fluxo padrão não pode ser arquivado. Defina outro fluxo como padrão primeiro." };
  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).is("archived_at", null);
  if ((count ?? 0) > 0) return { ok: false, error: `Este fluxo ainda possui ${count} projeto(s) ativo(s). Mova ou arquive esses projetos primeiro.` };
  const { error } = await supabase.from("workflows").update({ archived_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", workflowId);
  if (error) return { ok: false, error: "Não foi possível arquivar o fluxo." };
  revalidateWorkflowViews();
  return { ok: true, message: "Fluxo arquivado sem excluir o histórico." };
}

export async function createBoardStageAction(workflowId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const description = optionalText(formData, "description");
  const color = text(formData, "color").toUpperCase();
  const position = Number.parseInt(text(formData, "position"), 10);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe um nome de etapa entre 2 e 80 caracteres." };
  if (description && description.length > 400) return { ok: false, error: "A descrição pode ter no máximo 400 caracteres." };
  if (!validHexColor(color)) return { ok: false, error: "Informe uma cor hexadecimal no formato #2563EB." };
  if (!Number.isInteger(position) || position < 0 || position > 99) return { ok: false, error: "A posição deve estar entre 0 e 99." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, id: `demo-stage-${Date.now()}` };
  }

  const supabase = await createServerSupabaseClient();
  const { data: workflow } = await supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("id", workflowId).is("archived_at", null).maybeSingle();
  if (!workflow) return { ok: false, error: "Fluxo não encontrado neste workspace." };
  const { data: positionConflict } = await supabase.from("board_columns").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).eq("position", position).limit(1).maybeSingle();
  if (positionConflict) return { ok: false, error: "Esta posição já está ocupada neste fluxo." };
  const key = await uniqueKey(text(formData, "key") || name, async (candidate) => {
    const { data } = await supabase.from("board_columns").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).eq("key", candidate).limit(1).maybeSingle();
    return Boolean(data);
  });
  const { data: stage, error } = await supabase.from("board_columns").insert({
    workspace_id: context.workspaceId,
    workflow_id: workflowId,
    name,
    key,
    description,
    position,
    color,
    is_terminal: formData.get("is_terminal") === "on",
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar a etapa." };
  revalidateWorkflowViews();
  return { ok: true, id: stage.id, message: "Etapa criada." };
}

export async function updateBoardStageAction(stageId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const description = optionalText(formData, "description");
  const color = text(formData, "color").toUpperCase();
  const position = Number.parseInt(text(formData, "position"), 10);
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Informe um nome de etapa entre 2 e 80 caracteres." };
  if (description && description.length > 400) return { ok: false, error: "A descrição pode ter no máximo 400 caracteres." };
  if (!validHexColor(color)) return { ok: false, error: "Informe uma cor hexadecimal válida." };
  if (!Number.isInteger(position) || position < 0 || position > 99) return { ok: false, error: "A posição deve estar entre 0 e 99." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: current } = await supabase.from("board_columns").select("id, workflow_id").eq("workspace_id", context.workspaceId).eq("id", stageId).is("archived_at", null).maybeSingle();
  if (!current) return { ok: false, error: "Etapa não encontrada ou já arquivada." };
  const { data: positionConflict } = await supabase.from("board_columns").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", current.workflow_id).eq("position", position).neq("id", stageId).limit(1).maybeSingle();
  if (positionConflict) return { ok: false, error: "Esta posição já está ocupada por outra etapa." };
  const key = await uniqueKey(text(formData, "key") || name, async (candidate) => {
    const { data } = await supabase.from("board_columns").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", current.workflow_id).eq("key", candidate).neq("id", stageId).limit(1).maybeSingle();
    return Boolean(data);
  });
  const { error } = await supabase.from("board_columns").update({
    name,
    key,
    description,
    position,
    color,
    is_terminal: formData.get("is_terminal") === "on",
  }).eq("workspace_id", context.workspaceId).eq("id", stageId);
  if (error) return { ok: false, error: "Não foi possível atualizar a etapa." };
  revalidateWorkflowViews();
  return { ok: true, message: "Etapa atualizada." };
}

export async function archiveBoardStageAction(stageId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const replacementId = optionalText(formData, "replacement_board_column_id");
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: stage } = await supabase.from("board_columns").select("id, workflow_id, name").eq("workspace_id", context.workspaceId).eq("id", stageId).is("archived_at", null).maybeSingle();
  if (!stage) return { ok: false, error: "Etapa não encontrada ou já arquivada." };
  const { count: activeStageCount } = await supabase.from("board_columns").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("workflow_id", stage.workflow_id).is("archived_at", null);
  if ((activeStageCount ?? 0) <= 1) return { ok: false, error: "O fluxo precisa manter ao menos uma etapa ativa." };
  const { count: projectCount } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("board_column_id", stageId).is("archived_at", null);

  let replacement: { id: string; name: string } | null = null;
  if ((projectCount ?? 0) > 0) {
    if (!replacementId) return { ok: false, error: `A etapa contém ${projectCount} projeto(s). Escolha uma etapa de destino.` };
    const result = await supabase.from("board_columns").select("id, name").eq("workspace_id", context.workspaceId).eq("workflow_id", stage.workflow_id).eq("id", replacementId).neq("id", stageId).is("archived_at", null).maybeSingle();
    replacement = result.data;
    if (!replacement) return { ok: false, error: "A etapa de destino precisa estar ativa e pertencer ao mesmo fluxo." };
    const { error: moveError } = await supabase.from("projects").update({ board_column_id: replacement.id, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("board_column_id", stageId).is("archived_at", null);
    if (moveError) return { ok: false, error: "Não foi possível realocar os projetos; a etapa não foi arquivada." };
  }
  const { error } = await supabase.from("board_columns").update({ archived_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", stageId);
  if (error) return { ok: false, error: "Não foi possível arquivar a etapa." };
  revalidateWorkflowViews();
  return { ok: true, message: replacement ? `Etapa arquivada; projetos movidos para ${replacement.name}.` : "Etapa arquivada." };
}

export async function createSprintAction(workflowId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const goal = optionalText(formData, "goal");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const status = text(formData, "status") || "planned";
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Informe um nome de sprint entre 2 e 120 caracteres." };
  if (goal && goal.length > 500) return { ok: false, error: "O objetivo pode ter no máximo 500 caracteres." };
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate) return { ok: false, error: "Informe um intervalo de datas válido para a sprint." };
  if (!SPRINT_STATUSES.has(status) || status === "completed") return { ok: false, error: "O status inicial deve ser planejado ou ativo." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, id: `demo-sprint-${Date.now()}` };
  }

  const supabase = await createServerSupabaseClient();
  const { data: workflow } = await supabase.from("workflows").select("id, sprint_enabled").eq("workspace_id", context.workspaceId).eq("id", workflowId).is("archived_at", null).maybeSingle();
  if (!workflow?.sprint_enabled) return { ok: false, error: "Ative sprints neste fluxo antes de criar um ciclo." };
  if (status === "active") {
    const { data: activeSprint } = await supabase.from("sprints").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).eq("status", "active").limit(1).maybeSingle();
    if (activeSprint) return { ok: false, error: "Conclua a sprint ativa antes de iniciar outra." };
  }
  const { data: sprint, error } = await supabase.from("sprints").insert({
    workspace_id: context.workspaceId,
    workflow_id: workflowId,
    name,
    goal,
    status,
    start_date: startDate,
    end_date: endDate,
  }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar a sprint." };
  revalidateWorkflowViews();
  return { ok: true, id: sprint.id, message: "Sprint criada." };
}

export async function updateSprintAction(sprintId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const name = text(formData, "name");
  const goal = optionalText(formData, "goal");
  const startDate = text(formData, "start_date");
  const endDate = text(formData, "end_date");
  const status = text(formData, "status");
  if (name.length < 2 || name.length > 120) return { ok: false, error: "Informe um nome de sprint entre 2 e 120 caracteres." };
  if (goal && goal.length > 500) return { ok: false, error: "O objetivo pode ter no máximo 500 caracteres." };
  if (!validIsoDate(startDate) || !validIsoDate(endDate) || endDate < startDate) return { ok: false, error: "Informe um intervalo de datas válido para a sprint." };
  if (!SPRINT_STATUSES.has(status)) return { ok: false, error: "Status de sprint inválido." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: sprint } = await supabase.from("sprints").select("id, workflow_id").eq("workspace_id", context.workspaceId).eq("id", sprintId).maybeSingle();
  if (!sprint) return { ok: false, error: "Sprint não encontrada neste workspace." };
  if (status === "active") {
    const { data: activeSprint } = await supabase.from("sprints").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", sprint.workflow_id).eq("status", "active").neq("id", sprintId).limit(1).maybeSingle();
    if (activeSprint) return { ok: false, error: "Este fluxo já possui uma sprint ativa." };
  }
  const { error } = await supabase.from("sprints").update({ name, goal, status, start_date: startDate, end_date: endDate }).eq("workspace_id", context.workspaceId).eq("id", sprintId);
  if (error) return { ok: false, error: "Não foi possível atualizar a sprint." };
  revalidateWorkflowViews();
  return { ok: true, message: status === "completed" ? "Sprint concluída." : "Sprint atualizada." };
}

export async function completeSprintAction(sprintId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: sprint, error } = await supabase.from("sprints").update({ status: "completed" }).eq("workspace_id", context.workspaceId).eq("id", sprintId).neq("status", "completed").select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível concluir a sprint." };
  if (!sprint) return { ok: false, error: "Sprint não encontrada ou já concluída." };
  revalidateWorkflowViews();
  return { ok: true, message: "Sprint concluída." };
}

function technologyInput(formData: FormData) {
  const name = text(formData, "name");
  const category = text(formData, "category") || "other";
  const color = text(formData, "color").toUpperCase();
  const websiteUrl = optionalText(formData, "website_url");
  if (name.length < 2 || name.length > 80) return { error: "Informe um nome de tecnologia entre 2 e 80 caracteres." } as const;
  if (!TECHNOLOGY_CATEGORIES.has(category)) return { error: "Categoria de tecnologia inválida." } as const;
  if (!validHexColor(color)) return { error: "Informe uma cor hexadecimal válida." } as const;
  if (websiteUrl && !isSafeResourceUrl(websiteUrl)) return { error: "Informe uma URL HTTP(S) sem credenciais incorporadas." } as const;
  return { value: { name, category, color, website_url: websiteUrl } } as const;
}

export async function createTechnologyAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const parsed = technologyInput(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error ?? "Dados da tecnologia inválidos." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, id: `demo-technology-${Date.now()}` };
  }
  const supabase = await createServerSupabaseClient();
  const { data: technology, error } = await supabase.from("technologies").insert({ workspace_id: context.workspaceId, ...parsed.value }).select("id").single();
  if (error) return { ok: false, error: "Não foi possível criar a tecnologia. Verifique se o nome já existe." };
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, id: technology.id, message: "Tecnologia criada." };
}

export async function updateTechnologyAction(technologyId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const parsed = technologyInput(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error ?? "Dados da tecnologia inválidos." };
  if (context.demo) {
    revalidateWorkflowViews();
    revalidatePath("/portfolio");
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: technology, error } = await supabase.from("technologies").update(parsed.value).eq("workspace_id", context.workspaceId).eq("id", technologyId).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível atualizar a tecnologia." };
  if (!technology) return { ok: false, error: "Tecnologia não encontrada ou já arquivada." };
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, message: "Tecnologia atualizada." };
}

export async function archiveTechnologyAction(technologyId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (context.demo) {
    revalidateWorkflowViews();
    revalidatePath("/portfolio");
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: technology, error } = await supabase.from("technologies").update({ archived_at: new Date().toISOString() }).eq("workspace_id", context.workspaceId).eq("id", technologyId).is("archived_at", null).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível arquivar a tecnologia." };
  if (!technology) return { ok: false, error: "Tecnologia não encontrada ou já arquivada." };
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, message: "Tecnologia arquivada sem remover seus vínculos históricos." };
}

export async function assignProjectWorkflowAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const workflowId = text(formData, "workflow_id");
  const requestedColumnId = optionalText(formData, "board_column_id");
  if (!workflowId) return { ok: false, error: "Selecione um fluxo." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const [{ data: project }, { data: workflow }] = await Promise.all([
    supabase.from("projects").select("id, sprint_id").eq("workspace_id", context.workspaceId).eq("id", projectId).maybeSingle(),
    supabase.from("workflows").select("id").eq("workspace_id", context.workspaceId).eq("id", workflowId).is("archived_at", null).maybeSingle(),
  ]);
  if (!project || !workflow) return { ok: false, error: "Projeto ou fluxo não encontrado neste workspace." };
  const { data: columns } = await supabase.from("board_columns").select("id, key").eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).is("archived_at", null).order("position", { ascending: true });
  const column = requestedColumnId ? columns?.find((item) => item.id === requestedColumnId || item.key === requestedColumnId) : columns?.[0];
  if (!column) return { ok: false, error: requestedColumnId ? "A etapa escolhida não pertence ao fluxo." : "O fluxo não possui uma etapa ativa." };
  let compatibleSprintId: string | null = null;
  if (project.sprint_id) {
    const { data: sprint } = await supabase.from("sprints").select("id").eq("workspace_id", context.workspaceId).eq("id", project.sprint_id).eq("workflow_id", workflowId).maybeSingle();
    compatibleSprintId = sprint?.id ?? null;
  }
  const { error } = await supabase.from("projects").update({ workflow_id: workflowId, board_column_id: column.id, sprint_id: compatibleSprintId, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("id", projectId);
  if (error) return { ok: false, error: "Não foi possível alterar o fluxo do projeto." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "workflow_changed", entity_type: "project", entity_id: projectId, metadata: { workflow_id: workflowId, board_column_id: column.id, sprint_cleared: Boolean(project.sprint_id && !compatibleSprintId) } });
  revalidateProjectViews(projectId);
  return { ok: true, message: compatibleSprintId ? "Fluxo e etapa atualizados." : "Fluxo atualizado; sprint incompatível removida." };
}

export async function assignProjectSprintAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const sprintId = optionalText(formData, "sprint_id");
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase.from("projects").select("id, workflow_id").eq("workspace_id", context.workspaceId).eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, error: "Projeto não encontrado neste workspace." };
  if (sprintId) {
    const { data: sprint } = await supabase.from("sprints").select("id").eq("workspace_id", context.workspaceId).eq("id", sprintId).eq("workflow_id", project.workflow_id).neq("status", "completed").maybeSingle();
    if (!sprint) return { ok: false, error: "A sprint precisa estar aberta e pertencer ao fluxo do projeto." };
  }
  const { error } = await supabase.from("projects").update({ sprint_id: sprintId, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("id", projectId);
  if (error) return { ok: false, error: "Não foi possível atualizar a sprint do projeto." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: sprintId ? "sprint_assigned" : "moved_to_backlog", entity_type: "project", entity_id: projectId, metadata: { sprint_id: sprintId } });
  revalidateProjectViews(projectId);
  return { ok: true, message: sprintId ? "Projeto incluído na sprint." : "Projeto movido para o backlog." };
}

export async function attachProjectTechnologyAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const technologyId = text(formData, "technology_id");
  if (!technologyId) return { ok: false, error: "Selecione uma tecnologia." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const [{ data: project }, { data: technology }] = await Promise.all([
    supabase.from("projects").select("id").eq("workspace_id", context.workspaceId).eq("id", projectId).maybeSingle(),
    supabase.from("technologies").select("id, name").eq("workspace_id", context.workspaceId).eq("id", technologyId).is("archived_at", null).maybeSingle(),
  ]);
  if (!project || !technology) return { ok: false, error: "Projeto ou tecnologia não encontrado neste workspace." };
  const { error } = await supabase.from("project_technologies").upsert({ workspace_id: context.workspaceId, project_id: projectId, technology_id: technologyId }, { onConflict: "project_id,technology_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Não foi possível vincular a tecnologia." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "technology_attached", entity_type: "technology", entity_id: technologyId, metadata: { technology_name: technology.name } });
  revalidateProjectViews(projectId);
  return { ok: true, message: `${technology.name} vinculada ao projeto.` };
}

export async function detachProjectTechnologyAction(projectId: string, technologyId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId || !technologyId) return { ok: false, error: "Projeto e tecnologia são obrigatórios." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: link, error: readError } = await supabase.from("project_technologies").select("id").eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("technology_id", technologyId).maybeSingle();
  if (readError || !link) return { ok: false, error: "Vínculo não encontrado neste workspace." };
  const { error } = await supabase.from("project_technologies").delete().eq("workspace_id", context.workspaceId).eq("id", link.id);
  if (error) return { ok: false, error: "Não foi possível remover a tecnologia do projeto." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: "technology_detached", entity_type: "technology", entity_id: technologyId, metadata: {} });
  revalidateProjectViews(projectId);
  return { ok: true };
}

export async function setProjectArchivedAction(projectId: string, archived: boolean): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true };
  }
  const supabase = await createServerSupabaseClient();
  const { data: project, error } = await supabase.from("projects").update({ archived_at: archived ? new Date().toISOString() : null, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("id", projectId).select("id").maybeSingle();
  if (error) return { ok: false, error: archived ? "Não foi possível arquivar o projeto." : "Não foi possível restaurar o projeto." };
  if (!project) return { ok: false, error: "Projeto não encontrado neste workspace." };
  await supabase.from("project_activity").insert({ workspace_id: context.workspaceId, project_id: projectId, actor_id: context.userId, action: archived ? "project_archived" : "project_restored", entity_type: "project", entity_id: projectId, metadata: { reversible: true } });
  revalidateProjectViews(projectId);
  return { ok: true, message: archived ? "Projeto arquivado sem exclusão permanente." : "Projeto restaurado." };
}

export async function deleteClientAction(clientId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!clientId) return { ok: false, error: "Cliente não informado." };
  if (context.demo) {
    revalidatePath("/clientes");
    revalidatePath("/projetos");
    revalidatePath("/quadro");
    revalidatePath("/portfolio");
    revalidatePath("/financeiro");
    revalidatePath("/");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: client } = await supabase.from("clients").select("id, name").eq("workspace_id", context.workspaceId).eq("id", clientId).maybeSingle();
  if (!client) return { ok: false, error: "Cliente não encontrado neste workspace." };
  const { count: projectCount, error: dependencyError } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("client_id", clientId);
  if (dependencyError) return { ok: false, error: "Não foi possível verificar os projetos deste cliente." };
  if ((projectCount ?? 0) > 0) return { ok: false, error: `O cliente possui ${projectCount} projeto(s). Exclua ou transfira esses projetos primeiro.` };

  const { data: deleted, error } = await supabase.from("clients").delete().eq("workspace_id", context.workspaceId).eq("id", clientId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir o cliente. Verifique se ainda existem dependências." };
  if (!deleted) return { ok: false, error: "O cliente não foi excluído; confirme suas permissões." };
  revalidatePath("/clientes");
  revalidatePath("/projetos");
  revalidatePath("/quadro");
  revalidatePath("/portfolio");
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: true, message: `${client.name} foi excluído.` };
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId) return { ok: false, error: "Projeto não informado." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    revalidatePath("/calendario");
    revalidatePath("/financeiro");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase.from("projects").select("id, name").eq("workspace_id", context.workspaceId).eq("id", projectId).maybeSingle();
  if (!project) return { ok: false, error: "Projeto não encontrado neste workspace." };
  const { data: deleted, error } = await supabase.from("projects").delete().eq("workspace_id", context.workspaceId).eq("id", projectId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir o projeto e suas dependências." };
  if (!deleted) return { ok: false, error: "O projeto não foi excluído; confirme suas permissões." };
  revalidateProjectViews(projectId);
  revalidatePath("/calendario");
  revalidatePath("/financeiro");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true, message: `${project.name} e seus dados vinculados foram excluídos.` };
}

export async function deleteChecklistItemAction(projectId: string, itemId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId || !itemId) return { ok: false, error: "Projeto e item do checklist são obrigatórios." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    revalidatePath("/calendario");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: item } = await supabase.from("checklist_items").select("id").eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, error: "Item do checklist não encontrado neste projeto." };
  const { data: deleted, error } = await supabase.from("checklist_items").delete().eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", itemId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir o item do checklist." };
  if (!deleted) return { ok: false, error: "O item não foi excluído; confirme suas permissões." };
  revalidateProjectViews(projectId);
  revalidatePath("/calendario");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true, message: "Item do checklist excluído." };
}

export async function deleteDeadlineAction(projectId: string, deadlineId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId || !deadlineId) return { ok: false, error: "Projeto e prazo são obrigatórios." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    revalidatePath("/calendario");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: deadline } = await supabase.from("deadlines").select("id, title").eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", deadlineId).maybeSingle();
  if (!deadline) return { ok: false, error: "Prazo não encontrado neste projeto." };
  const { data: deleted, error } = await supabase.from("deadlines").delete().eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", deadlineId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir o prazo." };
  if (!deleted) return { ok: false, error: "O prazo não foi excluído; confirme suas permissões." };
  revalidateProjectViews(projectId);
  revalidatePath("/calendario");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true, message: `Prazo “${deadline.title}” excluído.` };
}

export async function deleteResourceAction(projectId: string, resourceId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!projectId || !resourceId) return { ok: false, error: "Projeto e recurso são obrigatórios." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: resource } = await supabase.from("project_resources").select("id, label").eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", resourceId).maybeSingle();
  if (!resource) return { ok: false, error: "Recurso não encontrado neste projeto." };
  const { data: deleted, error } = await supabase.from("project_resources").delete().eq("workspace_id", context.workspaceId).eq("project_id", projectId).eq("id", resourceId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir o recurso." };
  if (!deleted) return { ok: false, error: "O recurso não foi excluído; confirme suas permissões." };
  revalidateProjectViews(projectId);
  return { ok: true, message: `Recurso “${resource.label}” excluído.` };
}

export async function deleteCommercialTermsAction(projectId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!projectId) return { ok: false, error: "Projeto não informado." };
  if (context.demo) {
    revalidateProjectViews(projectId);
    revalidatePath("/financeiro");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: terms } = await supabase.from("commercial_terms").select("id").eq("workspace_id", context.workspaceId).eq("project_id", projectId).maybeSingle();
  if (!terms) return { ok: false, error: "Condições comerciais não encontradas para este projeto." };
  const { data: deleted, error } = await supabase.from("commercial_terms").delete().eq("workspace_id", context.workspaceId).eq("project_id", projectId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir as condições comerciais." };
  if (!deleted) return { ok: false, error: "As condições comerciais não foram excluídas; confirme suas permissões." };
  revalidateProjectViews(projectId);
  revalidatePath("/financeiro");
  return { ok: true, message: "Condições comerciais excluídas." };
}

export async function deleteSubscriptionAction(subscriptionId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!subscriptionId) return { ok: false, error: "Assinatura não informada." };
  if (context.demo) {
    revalidatePath("/financeiro");
    revalidatePath("/calendario");
    revalidatePath("/projetos");
    revalidatePath("/quadro");
    revalidatePath("/portfolio");
    revalidatePath("/");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: subscription }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("subscriptions").select("id, service_name").eq("workspace_id", context.workspaceId).eq("id", subscriptionId).maybeSingle(),
    supabase.from("project_subscriptions").select("project_id").eq("workspace_id", context.workspaceId).eq("subscription_id", subscriptionId),
  ]);
  if (!subscription) return { ok: false, error: "Assinatura não encontrada neste workspace." };
  if (linksError) return { ok: false, error: "Não foi possível verificar os projetos vinculados à assinatura." };
  const projectIds = [...new Set((links ?? []).map((link) => link.project_id))];
  const { data: deleted, error } = await supabase.from("subscriptions").delete().eq("workspace_id", context.workspaceId).eq("id", subscriptionId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir a assinatura e seus vínculos." };
  if (!deleted) return { ok: false, error: "A assinatura não foi excluída; confirme suas permissões." };
  projectIds.forEach((projectId) => revalidatePath(`/projetos/${projectId}`));
  revalidatePath("/financeiro");
  revalidatePath("/calendario");
  revalidatePath("/projetos");
  revalidatePath("/quadro");
  revalidatePath("/portfolio");
  revalidatePath("/");
  await tryImmediateCalendarSync(context.workspaceId);
  return { ok: true, message: `Assinatura “${subscription.service_name}” excluída de ${projectIds.length} projeto(s).` };
}

export async function createAdministrativeExpenseAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const parsed = administrativeExpenseValues(formData);
  if (!parsed.ok) return parsed;
  if (context.demo) {
    revalidatePath("/financeiro");
    revalidatePath("/");
    return { ok: true, demo: true, message: "Despesa simulada cadastrada." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("administrative_expenses")
    .insert({ workspace_id: context.workspaceId, ...parsed.value })
    .select("id")
    .single();
  const migrationMessage = administrativeExpenseMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível cadastrar a despesa administrativa." };
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: true, id: data.id, message: "Despesa administrativa criada." };
}

export async function updateAdministrativeExpenseAction(
  expenseId: string,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!expenseId) return { ok: false, error: "Despesa não informada." };
  const parsed = administrativeExpenseValues(formData);
  if (!parsed.ok) return parsed;
  if (context.demo) {
    revalidatePath("/financeiro");
    revalidatePath("/");
    return { ok: true, demo: true, message: "Despesa simulada atualizada." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("administrative_expenses")
    .update(parsed.value)
    .eq("workspace_id", context.workspaceId)
    .eq("id", expenseId)
    .select("id")
    .maybeSingle();
  const migrationMessage = administrativeExpenseMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível atualizar a despesa administrativa." };
  if (!data) return { ok: false, error: "Despesa não encontrada neste workspace." };
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: true, id: data.id, message: "Despesa administrativa atualizada." };
}

export async function deleteAdministrativeExpenseAction(expenseId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!expenseId) return { ok: false, error: "Despesa não informada." };
  if (context.demo) {
    revalidatePath("/financeiro");
    revalidatePath("/");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: expense } = await supabase
    .from("administrative_expenses")
    .select("id, name")
    .eq("workspace_id", context.workspaceId)
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Despesa não encontrada neste workspace." };

  const { data: deleted, error } = await supabase
    .from("administrative_expenses")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("id", expenseId)
    .select("id")
    .maybeSingle();
  const migrationMessage = administrativeExpenseMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível excluir a despesa administrativa." };
  if (!deleted) return { ok: false, error: "A despesa não foi excluída; confirme suas permissões." };
  revalidatePath("/financeiro");
  revalidatePath("/");
  return { ok: true, message: `Despesa “${expense.name}” excluída.` };
}

export async function deleteWorkflowAction(workflowId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!workflowId) return { ok: false, error: "Fluxo não informado." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: workflow } = await supabase.from("workflows").select("id, name, is_default").eq("workspace_id", context.workspaceId).eq("id", workflowId).maybeSingle();
  if (!workflow) return { ok: false, error: "Fluxo não encontrado neste workspace." };
  if (workflow.is_default) return { ok: false, error: "O fluxo padrão não pode ser excluído. Defina outro fluxo como padrão primeiro." };
  const { count: projectCount, error: projectError } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId);
  if (projectError) return { ok: false, error: "Não foi possível verificar os projetos deste fluxo." };
  if ((projectCount ?? 0) > 0) return { ok: false, error: `O fluxo possui ${projectCount} projeto(s). Mova ou exclua esses projetos primeiro.` };

  const { data: columns, error: columnsReadError } = await supabase.from("board_columns").select("id").eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId);
  if (columnsReadError) return { ok: false, error: "Não foi possível verificar as colunas do fluxo." };
  const { data: deletedColumns, error: columnsError } = await supabase.from("board_columns").delete().eq("workspace_id", context.workspaceId).eq("workflow_id", workflowId).select("id");
  if (columnsError) return { ok: false, error: "Não foi possível excluir as colunas do fluxo; o fluxo foi preservado." };
  if ((deletedColumns?.length ?? 0) !== (columns?.length ?? 0)) return { ok: false, error: "Nem todas as colunas puderam ser excluídas; o fluxo foi preservado." };
  const { data: deleted, error } = await supabase.from("workflows").delete().eq("workspace_id", context.workspaceId).eq("id", workflowId).select("id").maybeSingle();
  if (error) return { ok: false, error: "As colunas foram removidas, mas o fluxo não pôde ser excluído. Tente novamente." };
  if (!deleted) return { ok: false, error: "As colunas foram removidas, mas o fluxo não foi excluído; confirme suas permissões e tente novamente." };
  revalidateWorkflowViews();
  return { ok: true, message: `Fluxo “${workflow.name}” e suas sprints foram excluídos.` };
}

export async function deleteBoardStageAction(stageId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAdminContext();
  const replacementId = optionalText(formData, "replacement_board_column_id");
  if (!stageId) return { ok: false, error: "Etapa não informada." };
  if (context.demo) {
    revalidateWorkflowViews();
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: stage } = await supabase.from("board_columns").select("id, workflow_id, name").eq("workspace_id", context.workspaceId).eq("id", stageId).maybeSingle();
  if (!stage) return { ok: false, error: "Etapa não encontrada neste workspace." };
  const { data: projects, error: projectsError } = await supabase.from("projects").select("id").eq("workspace_id", context.workspaceId).eq("board_column_id", stageId);
  if (projectsError) return { ok: false, error: "Não foi possível verificar os projetos desta etapa." };
  const projectIds = (projects ?? []).map((project) => project.id);
  let replacement: { id: string; name: string } | null = null;

  if (projectIds.length > 0) {
    if (!replacementId) return { ok: false, error: `A etapa contém ${projectIds.length} projeto(s). Escolha uma etapa de destino.` };
    const { data } = await supabase.from("board_columns").select("id, name").eq("workspace_id", context.workspaceId).eq("workflow_id", stage.workflow_id).eq("id", replacementId).neq("id", stageId).is("archived_at", null).maybeSingle();
    replacement = data;
    if (!replacement) return { ok: false, error: "A etapa de destino precisa estar ativa e pertencer ao mesmo fluxo." };
    const { error: moveError } = await supabase.from("projects").update({ board_column_id: replacement.id, updated_by: context.userId }).eq("workspace_id", context.workspaceId).eq("board_column_id", stageId);
    if (moveError) return { ok: false, error: "Não foi possível realocar todos os projetos; a etapa foi preservada." };
  }

  const { data: deleted, error } = await supabase.from("board_columns").delete().eq("workspace_id", context.workspaceId).eq("id", stageId).select("id").maybeSingle();
  if (error) return { ok: false, error: replacement ? "Os projetos foram realocados, mas a etapa não pôde ser excluída. Tente novamente." : "Não foi possível excluir a etapa." };
  if (!deleted) return { ok: false, error: replacement ? "Os projetos foram realocados, mas a etapa não foi excluída; confirme suas permissões." : "A etapa não foi excluída; confirme suas permissões." };
  projectIds.forEach((projectId) => revalidatePath(`/projetos/${projectId}`));
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, message: replacement ? `Etapa excluída; projetos movidos para ${replacement.name}.` : `Etapa “${stage.name}” excluída.` };
}

export async function deleteSprintAction(sprintId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!sprintId) return { ok: false, error: "Sprint não informada." };
  if (context.demo) {
    revalidateWorkflowViews();
    revalidatePath("/portfolio");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: sprint }, { data: projects, error: projectsError }] = await Promise.all([
    supabase.from("sprints").select("id, name").eq("workspace_id", context.workspaceId).eq("id", sprintId).maybeSingle(),
    supabase.from("projects").select("id").eq("workspace_id", context.workspaceId).eq("sprint_id", sprintId),
  ]);
  if (!sprint) return { ok: false, error: "Sprint não encontrada neste workspace." };
  if (projectsError) return { ok: false, error: "Não foi possível verificar os projetos desta sprint." };
  const projectIds = (projects ?? []).map((project) => project.id);
  const { data: deleted, error } = await supabase.from("sprints").delete().eq("workspace_id", context.workspaceId).eq("id", sprintId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir a sprint." };
  if (!deleted) return { ok: false, error: "A sprint não foi excluída; confirme suas permissões." };
  projectIds.forEach((projectId) => revalidatePath(`/projetos/${projectId}`));
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, message: `Sprint “${sprint.name}” excluída; ${projectIds.length} projeto(s) voltaram ao backlog.` };
}

export async function deleteTechnologyAction(technologyId: string): Promise<ActionResult> {
  const context = await requireAdminContext();
  if (!technologyId) return { ok: false, error: "Tecnologia não informada." };
  if (context.demo) {
    revalidateWorkflowViews();
    revalidatePath("/portfolio");
    return { ok: true, demo: true, message: "Exclusão simulada na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const [{ data: technology }, { data: links, error: linksError }] = await Promise.all([
    supabase.from("technologies").select("id, name").eq("workspace_id", context.workspaceId).eq("id", technologyId).maybeSingle(),
    supabase.from("project_technologies").select("project_id").eq("workspace_id", context.workspaceId).eq("technology_id", technologyId),
  ]);
  if (!technology) return { ok: false, error: "Tecnologia não encontrada neste workspace." };
  if (linksError) return { ok: false, error: "Não foi possível verificar os projetos vinculados à tecnologia." };
  const projectIds = [...new Set((links ?? []).map((link) => link.project_id))];
  const { data: deleted, error } = await supabase.from("technologies").delete().eq("workspace_id", context.workspaceId).eq("id", technologyId).select("id").maybeSingle();
  if (error) return { ok: false, error: "Não foi possível excluir a tecnologia." };
  if (!deleted) return { ok: false, error: "A tecnologia não foi excluída; confirme suas permissões." };
  projectIds.forEach((projectId) => revalidatePath(`/projetos/${projectId}`));
  revalidateWorkflowViews();
  revalidatePath("/portfolio");
  return { ok: true, message: `Tecnologia “${technology.name}” excluída de ${projectIds.length} projeto(s).` };
}

function workItemMigrationMessage(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST205" && error.message?.includes("work_items")
    ? "A tabela de cards ainda não foi criada no Supabase. Execute a migração work_items antes de continuar."
    : null;
}

export async function createWorkItemAction(formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const projectId = text(formData, "project_id");
  const title = text(formData, "title");
  const description = optionalText(formData, "description");
  const sprintId = optionalText(formData, "sprint_id");
  const assigneeIds = formValues(formData, "assignee_ids");

  if (!projectId) return { ok: false, error: "Selecione o Epic (projeto) do card." };
  if (title.length < 2 || title.length > 200) return { ok: false, error: "Informe um título entre 2 e 200 caracteres." };
  if (context.demo) {
    revalidateWorkItemViews(projectId);
    return { ok: true, demo: true, id: `demo-card-${Date.now()}`, message: "Card criado na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, workflow_id, board_column_id, archived_at")
    .eq("workspace_id", context.workspaceId)
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.archived_at) return { ok: false, error: "Epic não encontrado neste workspace." };

  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, position")
    .eq("workspace_id", context.workspaceId)
    .eq("workflow_id", project.workflow_id)
    .is("archived_at", null)
    .order("position", { ascending: true });
  const firstColumn = columns?.[0];
  const boardColumnId = project.board_column_id ?? firstColumn?.id;
  if (!boardColumnId) return { ok: false, error: "O fluxo do Epic não possui etapas configuradas." };

  if (sprintId) {
    const { data: sprint } = await supabase
      .from("sprints")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("id", sprintId)
      .eq("workflow_id", project.workflow_id)
      .neq("status", "completed")
      .maybeSingle();
    if (!sprint) return { ok: false, error: "A sprint precisa estar aberta e pertencer ao fluxo do Epic." };
  }

  const { data: created, error } = await supabase
    .from("work_items")
    .insert({
      workspace_id: context.workspaceId,
      project_id: projectId,
      workflow_id: project.workflow_id,
      board_column_id: boardColumnId,
      sprint_id: sprintId,
      title,
      description,
      source: "manual",
      created_by: context.userId,
      updated_by: context.userId,
    })
    .select("id")
    .single();
  const migrationMessage = workItemMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error || !created) return { ok: false, error: "Não foi possível criar o card." };

  if (assigneeIds.length) {
    const { error: assigneeError } = await supabase.from("work_item_assignees").insert(
      assigneeIds.map((memberId) => ({
        workspace_id: context.workspaceId,
        work_item_id: created.id,
        member_id: memberId,
      })),
    );
    if (assigneeError) return { ok: false, error: "Card criado, mas não foi possível salvar os responsáveis." };
  }

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: projectId,
    actor_id: context.userId,
    action: "work_item_created",
    entity_type: "work_item",
    entity_id: created.id,
    metadata: { title, sprint_id: sprintId, assignee_ids: assigneeIds },
  });
  revalidateWorkItemViews(projectId);
  return { ok: true, id: created.id, message: "Card criado com sucesso." };
}

export async function assignWorkItemSprintAction(workItemId: string, sprintId: string | null): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!workItemId) return { ok: false, error: "Card inválido." };
  if (context.demo) {
    revalidateWorkItemViews();
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: item } = await supabase
    .from("work_items")
    .select("id, project_id, workflow_id")
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Card não encontrado neste workspace." };

  if (sprintId) {
    const { data: sprint } = await supabase
      .from("sprints")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .eq("id", sprintId)
      .eq("workflow_id", item.workflow_id)
      .neq("status", "completed")
      .maybeSingle();
    if (!sprint) return { ok: false, error: "A sprint precisa estar aberta e pertencer ao fluxo do card." };
  }

  const { error } = await supabase
    .from("work_items")
    .update({ sprint_id: sprintId, updated_by: context.userId })
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId);
  const migrationMessage = workItemMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível mover o card." };

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: item.project_id,
    actor_id: context.userId,
    action: sprintId ? "work_item_sprint_assigned" : "work_item_moved_to_backlog",
    entity_type: "work_item",
    entity_id: workItemId,
    metadata: { sprint_id: sprintId },
  });
  revalidateWorkItemViews(item.project_id);
  return { ok: true, message: sprintId ? "Card incluído na sprint." : "Card movido para o backlog." };
}

export async function moveWorkItemAction(workItemId: string, stageId: string): Promise<ActionResult> {
  const context = await requireAuthContext();
  if (!workItemId || !stageId) return { ok: false, error: "Card e etapa são obrigatórios." };
  if (context.demo) {
    revalidateWorkItemViews();
    return { ok: true, demo: true };
  }

  const supabase = await createServerSupabaseClient();
  const { data: item } = await supabase
    .from("work_items")
    .select("id, project_id, workflow_id")
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Card não encontrado neste workspace." };

  const { data: columns } = await supabase
    .from("board_columns")
    .select("id, key")
    .eq("workspace_id", context.workspaceId)
    .eq("workflow_id", item.workflow_id)
    .is("archived_at", null);
  const column = columns?.find((entry) => entry.id === stageId || entry.key === stageId);
  if (!column) return { ok: false, error: "A etapa informada não existe." };

  const { error } = await supabase
    .from("work_items")
    .update({ board_column_id: column.id, updated_by: context.userId })
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId);
  const migrationMessage = workItemMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível mover o card." };

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: item.project_id,
    actor_id: context.userId,
    action: "work_item_stage_changed",
    entity_type: "work_item",
    entity_id: workItemId,
    metadata: { board_column_id: column.id, stage_key: column.key },
  });
  revalidateWorkItemViews(item.project_id);
  return { ok: true };
}

export async function updateWorkItemAction(workItemId: string, formData: FormData): Promise<ActionResult> {
  const context = await requireAuthContext();
  const title = text(formData, "title");
  const description = optionalText(formData, "description");
  const assigneeIds = formValues(formData, "assignee_ids");

  if (!workItemId) return { ok: false, error: "Card inválido." };
  if (title.length < 2 || title.length > 200) return { ok: false, error: "Informe um título entre 2 e 200 caracteres." };
  if (context.demo) {
    revalidateWorkItemViews();
    return { ok: true, demo: true, message: "Card atualizado na demonstração." };
  }

  const supabase = await createServerSupabaseClient();
  const { data: item } = await supabase
    .from("work_items")
    .select("id, project_id")
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId)
    .is("archived_at", null)
    .maybeSingle();
  if (!item) return { ok: false, error: "Card não encontrado neste workspace." };

  const { error } = await supabase
    .from("work_items")
    .update({
      title,
      description,
      updated_by: context.userId,
    })
    .eq("workspace_id", context.workspaceId)
    .eq("id", workItemId);
  const migrationMessage = workItemMigrationMessage(error);
  if (migrationMessage) return { ok: false, error: migrationMessage };
  if (error) return { ok: false, error: "Não foi possível atualizar o card." };

  await supabase
    .from("work_item_assignees")
    .delete()
    .eq("workspace_id", context.workspaceId)
    .eq("work_item_id", workItemId);

  if (assigneeIds.length) {
    const { error: assigneeError } = await supabase.from("work_item_assignees").insert(
      assigneeIds.map((memberId) => ({
        workspace_id: context.workspaceId,
        work_item_id: workItemId,
        member_id: memberId,
      })),
    );
    if (assigneeError) return { ok: false, error: "Card salvo, mas não foi possível atualizar os responsáveis." };
  }

  await supabase.from("project_activity").insert({
    workspace_id: context.workspaceId,
    project_id: item.project_id,
    actor_id: context.userId,
    action: "work_item_updated",
    entity_type: "work_item",
    entity_id: workItemId,
    metadata: { title, assignee_ids: assigneeIds },
  });
  revalidateWorkItemViews(item.project_id);
  return { ok: true, message: "Card atualizado com sucesso." };
}
