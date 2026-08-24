import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type MockResult = { data: unknown; error: null };
type MockRowStore = Record<string, unknown[]>;

const calls: string[] = [];
const rows: MockRowStore = {};
const workspace = {
  id: "workspace-1",
  name: "Central da Agencia",
  slug: "central-da-agencia",
  currency: "BRL",
  timezone: "America/Sao_Paulo",
  created_at: "2026-08-24T12:00:00.000Z",
};

function makeBuilder(table: string) {
  const collectionResult: MockResult = { data: rows[table] ?? [], error: null };
  const singleResult: MockResult = {
    data: table === "workspaces" ? workspace : (rows[table]?.[0] ?? null),
    error: null,
  };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "neq", "order", "limit"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(singleResult);
  builder.then = (
    onFulfilled: (result: MockResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(collectionResult).then(onFulfilled, onRejected);
  return builder;
}

const from = vi.fn((table: string) => {
  calls.push(table);
  return makeBuilder(table);
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({ from }),
}));

vi.mock("@/lib/auth", () => ({
  canSeeFinance: (role: string) => role === "owner" || role === "admin",
}));

describe("loadSupabaseAgencyData", () => {
  beforeEach(() => {
    calls.length = 0;
    from.mockClear();
    for (const key of Object.keys(rows)) delete rows[key];

    rows.workspace_members = [
      {
        workspace_id: "workspace-1",
        user_id: "user-1",
        role: "member",
        status: "active",
        pin_changed_at: null,
        profiles: {
          email: "ana@example.com",
          full_name: "Ana Lima",
          avatar_url: null,
        },
      },
    ];
    rows.clients = [];
    rows.workflows = [];
    rows.board_columns = [];
    rows.sprints = [];
    rows.technologies = [];
    rows.project_technologies = [];
    rows.project_templates = [];
    rows.projects = [];
    rows.checklist_items = [];
    rows.deadlines = [];
    rows.project_resources = [];
    rows.subscriptions = [
      {
        id: "subscription-1",
        workspace_id: "workspace-1",
        service_name: "Hostinger",
        plan_name: "Business",
        category: "hosting",
        billing_cycle: "biennial",
        renewal_date: "2027-01-10",
        auto_renew: true,
        payer: "agency",
        status: "active",
        created_at: "2026-01-10T12:00:00.000Z",
        updated_at: "2026-08-24T12:00:00.000Z",
      },
    ];
    rows.project_subscriptions = [];
    rows.project_activity = [];
    rows.audit_log = [];
    rows.commercial_terms = [];
    rows.subscription_financials = [
      {
        subscription_id: "subscription-1",
        amount_cents: 240_000,
        currency: "BRL",
        agency_share_percent: 50,
        billing_cycle: "biennial",
        vault_reference: "Cofre > Hostinger",
      },
    ];
    rows.calendar_connections = [];
    rows.calendar_event_mappings = [];
    rows.calendar_sync_jobs = [];
  });

  it("does not query protected finance tables for a member", async () => {
    const { loadSupabaseAgencyData } = await import("./supabase-agency");
    const data = await loadSupabaseAgencyData({
      userId: "user-1",
      email: "ana@example.com",
      name: "Ana Lima",
      avatarUrl: null,
      workspaceId: "workspace-1",
      workspaceName: "Central da Agencia",
      role: "member",
      demo: false,
    });

    expect(calls).not.toContain("commercial_terms");
    expect(calls).not.toContain("subscription_financials");
    expect(calls).not.toContain("audit_log");
    expect(data.commercialTerms).toEqual([]);
    expect(data.auditLog).toEqual([]);
    expect(data.subscriptions[0]).toMatchObject({
      amountCents: 0,
      vaultReference: null,
    });
    expect(data.members[0]).toMatchObject({
      id: "user-1",
      workspaceId: "workspace-1",
      name: "Ana Lima",
      active: true,
    });
  });

  it("loads protected costs for an admin and normalizes biennial charges", async () => {
    const { loadSupabaseAgencyData } = await import("./supabase-agency");
    const data = await loadSupabaseAgencyData({
      userId: "user-1",
      email: "ana@example.com",
      name: "Ana Lima",
      avatarUrl: null,
      workspaceId: "workspace-1",
      workspaceName: "Central da Agencia",
      role: "admin",
      demo: false,
    });

    expect(calls).toContain("commercial_terms");
    expect(calls).toContain("subscription_financials");
    expect(data.subscriptions[0]).toMatchObject({
      amountCents: 60_000,
      billingCycle: "annual",
      vaultReference: "Cofre > Hostinger",
    });
  });

  it("maps configurable stages, sprint and project technologies", async () => {
    rows.workflows = [{
      id: "workflow-1",
      workspace_id: "workspace-1",
      name: "Entrega de projetos",
      key: "entrega-projetos",
      description: "Fluxo principal",
      sprint_enabled: true,
      is_default: true,
      archived_at: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    }];
    rows.board_columns = [{
      id: "column-1",
      workspace_id: "workspace-1",
      workflow_id: "workflow-1",
      name: "Descoberta",
      key: "descoberta",
      description: "Validar a oportunidade",
      position: 0,
      color: "#0EA5E9",
      is_terminal: false,
      archived_at: null,
    }];
    rows.sprints = [{
      id: "sprint-1",
      workspace_id: "workspace-1",
      workflow_id: "workflow-1",
      name: "Sprint 1",
      goal: "Validar escopo",
      status: "active",
      start_date: "2026-08-24",
      end_date: "2026-09-06",
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
    }];
    rows.technologies = [{
      id: "technology-1",
      workspace_id: "workspace-1",
      name: "Next.js",
      category: "frontend",
      color: "#111827",
      website_url: "https://nextjs.org",
      archived_at: null,
      created_at: "2026-08-20T12:00:00.000Z",
      updated_at: "2026-08-20T12:00:00.000Z",
    }];
    rows.project_technologies = [{
      id: "project-technology-1",
      workspace_id: "workspace-1",
      project_id: "project-1",
      technology_id: "technology-1",
      created_at: "2026-08-24T12:00:00.000Z",
    }];
    rows.project_templates = [{
      id: "template-1",
      key: "site-institucional",
      project_type: "site_institutional",
    }];
    rows.projects = [{
      id: "project-1",
      workspace_id: "workspace-1",
      client_id: "client-1",
      board_column_id: "column-1",
      workflow_id: "workflow-1",
      sprint_id: "sprint-1",
      template_id: "template-1",
      project_type: "site_institutional",
      billing_model: "none",
      name: "Novo site",
      description: null,
      responsible_id: "user-1",
      next_action: "Validar briefing",
      blocked: false,
      blocker_reason: null,
      started_at: "2026-08-24T12:00:00.000Z",
      published_at: null,
      archived_at: null,
      created_at: "2026-08-24T12:00:00.000Z",
      updated_at: "2026-08-24T12:00:00.000Z",
    }];

    const { loadSupabaseAgencyData } = await import("./supabase-agency");
    const data = await loadSupabaseAgencyData({
      userId: "user-1",
      email: "ana@example.com",
      name: "Ana Lima",
      avatarUrl: null,
      workspaceId: "workspace-1",
      workspaceName: "Central da Agencia",
      role: "member",
      demo: false,
    });

    expect(data.boardStages[0]).toMatchObject({
      id: "descoberta",
      key: "descoberta",
      databaseId: "column-1",
      workflowId: "workflow-1",
      description: "Validar a oportunidade",
    });
    expect(data.projects[0]).toMatchObject({
      workflowId: "workflow-1",
      stageId: "descoberta",
      sprintId: "sprint-1",
    });
    expect(data.sprints[0]?.status).toBe("active");
    expect(data.technologies[0]?.name).toBe("Next.js");
    expect(data.projectTechnologies[0]).toMatchObject({
      projectId: "project-1",
      technologyId: "technology-1",
    });
  });

  it("maps immutable audit metadata without sensitive changed fields", async () => {
    rows.audit_log = [{
      id: "audit-1",
      workspace_id: "workspace-1",
      actor_id: null,
      actor_name: "Sistema",
      actor_email: null,
      action: "updated",
      entity_type: "project",
      entity_id: "project-1",
      entity_label: "Site institucional",
      project_id: "project-1",
      changed_fields: {
        name: true,
        next_action: true,
        access_token_ciphertext: true,
      },
      created_at: "2026-08-24T12:00:00.000Z",
    }];

    const { loadSupabaseAgencyData } = await import("./supabase-agency");
    const data = await loadSupabaseAgencyData({
      userId: "user-1",
      email: "ana@example.com",
      name: "Ana Lima",
      avatarUrl: null,
      workspaceId: "workspace-1",
      workspaceName: "Central da Agencia",
      role: "admin",
      demo: false,
    });

    expect(calls).toContain("audit_log");
    expect(data.auditLog).toEqual([{
      id: "audit-1",
      workspaceId: "workspace-1",
      actorId: null,
      actorName: "Sistema",
      actorEmail: "",
      action: "updated",
      entityType: "project",
      entityId: "project-1",
      entityLabel: "Site institucional",
      projectId: "project-1",
      changedFields: ["name", "next_action"],
      createdAt: "2026-08-24T12:00:00.000Z",
    }]);
  });
});
