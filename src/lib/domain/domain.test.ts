import { describe, expect, it } from "vitest";

import { DEMO_AGENCY_DATA, DEMO_NOW } from "../../data";
import {
  BOARD_STAGES,
  buildDashboardSnapshot,
  calculateFinancialSummary,
  calculateMonthlyRecurringCosts,
  calculateMonthlyAdministrativeExpenses,
  differenceInCalendarDays,
  filterProjects,
  formatCurrencyBRL,
  formatDateBR,
  formatDeadlineLabel,
  formatRelativeDateLabel,
  formatRenewalLabel,
  getDeadlineHealth,
  getMissingResourceTypes,
  getProjectHealth,
  getRenewalHealth,
  getUpcomingRenewals,
  groupProjectsByStage,
  instantiateTemplateChecklist,
  monthlyEquivalentCents,
  searchProjects,
  shouldSendDeadlineReminder,
  shouldSendRenewalReminder,
  sortProjectsByAttention,
  toISODate,
} from "./index";
import type { AdministrativeExpense, Deadline, Subscription } from "./types";

const project = (id: string) => {
  const found = DEMO_AGENCY_DATA.projects.find((item) => item.id === id);
  if (!found) throw new Error(`Fixture de projeto ausente: ${id}`);
  return found;
};

const deadline = (id: string) => {
  const found = DEMO_AGENCY_DATA.deadlines.find((item) => item.id === id);
  if (!found) throw new Error(`Fixture de prazo ausente: ${id}`);
  return found;
};

const subscription = (id: string) => {
  const found = DEMO_AGENCY_DATA.subscriptions.find((item) => item.id === id);
  if (!found) throw new Error(`Fixture de assinatura ausente: ${id}`);
  return found;
};

describe("datas e apresentação brasileira", () => {
  it("observa a data civil em São Paulo em vez de usar o dia UTC", () => {
    expect(toISODate("2026-08-25T01:30:00.000Z")).toBe("2026-08-24");
    expect(differenceInCalendarDays("2026-08-28", DEMO_NOW)).toBe(4);
  });

  it("produz rótulos relativos claros e com plural correto", () => {
    expect(formatRelativeDateLabel("2026-08-23", DEMO_NOW)).toBe("Ontem");
    expect(formatRelativeDateLabel("2026-08-24", DEMO_NOW)).toBe("Hoje");
    expect(formatRelativeDateLabel("2026-08-25", DEMO_NOW)).toBe("Amanhã");
    expect(formatDeadlineLabel("2026-08-22", DEMO_NOW)).toBe("Atrasado há 2 dias");
    expect(formatRenewalLabel("2026-09-12", DEMO_NOW)).toBe("Renova em 19 dias");
  });

  it("formata datas e valores no locale pt-BR", () => {
    expect(formatDateBR("2026-08-24")).toBe("24/08/2026");
    expect(formatDateBR("2026-08-24", { long: true })).toBe("24 de agosto de 2026");
    expect(formatCurrencyBRL(49_000).replace(/\s/g, " ")).toBe("R$ 490,00");
  });

  it("rejeita datas civis impossíveis", () => {
    expect(() => differenceInCalendarDays("2026-02-30", DEMO_NOW)).toThrow(RangeError);
  });
});

describe("saúde de prazos, projetos e renovações", () => {
  it("distingue atraso, bloqueio, proximidade e manutenção saudável", () => {
    const casa = getProjectHealth(project("project-casa-norte"), DEMO_AGENCY_DATA.deadlines, DEMO_NOW);
    const horizonte = getProjectHealth(project("project-horizonte"), DEMO_AGENCY_DATA.deadlines, DEMO_NOW);
    const aurora = getProjectHealth(project("project-aurora"), DEMO_AGENCY_DATA.deadlines, DEMO_NOW);
    const nautica = getProjectHealth(project("project-nautica"), DEMO_AGENCY_DATA.deadlines, DEMO_NOW);

    expect(casa.status).toBe("overdue");
    expect(casa.daysUntilNextDeadline).toBe(-2);
    expect(horizonte.status).toBe("blocked");
    expect(horizonte.isBlocked).toBe(true);
    expect(aurora.status).toBe("due-soon");
    expect(nautica.status).toBe("on-track");
  });

  it("não trata prazo concluído como acionável", () => {
    const result = getDeadlineHealth(deadline("deadline-nautica-publish"), DEMO_NOW);
    expect(result.timing).toBe("completed");
    expect(result.actionable).toBe(false);
    expect(result.overdue).toBe(false);
  });

  it("encontra somente renovações ativas dentro dos próximos 30 dias", () => {
    expect(getUpcomingRenewals(DEMO_AGENCY_DATA.subscriptions, DEMO_NOW).map((item) => item.id)).toEqual([
      "subscription-hostinger",
      "subscription-domain-horizonte",
    ]);
    expect(getRenewalHealth(subscription("subscription-hostinger"), DEMO_NOW)).toMatchObject({
      timing: "due-soon",
      daysUntilRenewal: 19,
    });
  });

  it("usa os offsets de lembrete definidos para cada tipo", () => {
    const deadlineAtD7: Deadline = {
      ...deadline("deadline-aurora-beta"),
      dueDate: "2026-08-31",
    };
    const renewalAtD30: Subscription = {
      ...subscription("subscription-hostinger"),
      renewalDate: "2026-09-23",
    };
    expect(shouldSendDeadlineReminder(deadlineAtD7, DEMO_NOW)).toBe(true);
    expect(shouldSendRenewalReminder(renewalAtD30, DEMO_NOW)).toBe(true);
  });
});

describe("financeiro recorrente", () => {
  it("normaliza ciclos para o equivalente mensal em centavos", () => {
    expect(monthlyEquivalentCents(71_988, "annual")).toBe(5_999);
    expect(monthlyEquivalentCents(30_000, "quarterly")).toBe(10_000);
    expect(monthlyEquivalentCents(50_000, "one-time")).toBe(0);
  });

  it("soma apenas receitas ativas e custos pagos pela agência", () => {
    expect(calculateFinancialSummary(
      DEMO_AGENCY_DATA.commercialTerms,
      DEMO_AGENCY_DATA.subscriptions,
    )).toEqual({
      currency: "BRL",
      monthlyRecurringRevenueCents: 81_000,
      monthlyRecurringCostCents: 36_065,
      monthlyMarginCents: 44_935,
      marginPercent: 55.48,
    });

    const clientPaid: Subscription = {
      ...subscription("subscription-hostinger"),
      id: "subscription-client-paid",
      payer: "client",
    };
    expect(calculateMonthlyRecurringCosts([clientPaid])).toBe(0);
    expect(calculateMonthlyRecurringCosts([clientPaid], { payer: "all" })).toBe(5_999);
  });

  it("normaliza despesas administrativas e ignora as pausadas", () => {
    const expenses: AdministrativeExpense[] = [
      {
        id: "expense-accounting",
        workspaceId: "workspace",
        name: "Contabilidade",
        category: "taxes",
        amountCents: 36_000,
        currency: "BRL",
        billingCycle: "annual",
        dueDate: null,
        status: "active",
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "expense-paused",
        workspaceId: "workspace",
        name: "Ferramenta pausada",
        category: "software",
        amountCents: 12_000,
        currency: "BRL",
        billingCycle: "monthly",
        dueDate: null,
        status: "paused",
        notes: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    expect(calculateMonthlyAdministrativeExpenses(expenses)).toBe(3_000);
    expect(calculateFinancialSummary([], [], expenses).monthlyRecurringCostCents).toBe(3_000);
  });

  it("recusa dinheiro negativo ou com fração de centavo", () => {
    expect(() => monthlyEquivalentCents(-1, "monthly")).toThrow(RangeError);
    expect(() => monthlyEquivalentCents(10.5, "monthly")).toThrow(RangeError);
  });
});

describe("busca, filtros e ordenação", () => {
  it("faz busca sem diferenciar acentos ou maiúsculas", () => {
    expect(searchProjects(DEMO_AGENCY_DATA.projects, "nautica", DEMO_AGENCY_DATA.clients)).toHaveLength(1);
    expect(searchProjects(DEMO_AGENCY_DATA.projects, "JURIDICO", DEMO_AGENCY_DATA.clients)[0]?.id).toBe(
      "project-horizonte",
    );
  });

  it("combina filtros de etapa, responsável, saúde e receita", () => {
    expect(
      filterProjects(
        DEMO_AGENCY_DATA.projects,
        { stageIds: ["em-producao"], ownerIds: ["member-rafael"], healthStatuses: ["overdue"] },
        { clients: DEMO_AGENCY_DATA.clients, deadlines: DEMO_AGENCY_DATA.deadlines, now: DEMO_NOW },
      ).map((item) => item.id),
    ).toEqual(["project-casa-norte"]);

    expect(
      filterProjects(
        DEMO_AGENCY_DATA.projects,
        { hasRecurringRevenue: true },
        {
          clients: DEMO_AGENCY_DATA.clients,
          deadlines: DEMO_AGENCY_DATA.deadlines,
          commercialTerms: DEMO_AGENCY_DATA.commercialTerms,
          now: DEMO_NOW,
        },
      ).map((item) => item.id),
    ).toEqual(["project-aurora", "project-studio-viva"]);
  });

  it("prioriza atrasados e mantém todas as sete colunas", () => {
    expect(sortProjectsByAttention(DEMO_AGENCY_DATA.projects, DEMO_AGENCY_DATA.deadlines, DEMO_NOW)[0]?.id).toBe(
      "project-casa-norte",
    );
    const grouped = groupProjectsByStage(DEMO_AGENCY_DATA.projects);
    expect(Object.keys(grouped)).toEqual(BOARD_STAGES.map((stage) => stage.id));
    expect(grouped["em-producao"]).toHaveLength(2);
    expect(grouped.entrada).toEqual([]);
  });
});

describe("templates e snapshot do dashboard", () => {
  it("instancia checklist determinístico e aponta recursos ausentes", () => {
    const checklist = instantiateTemplateChecklist({
      workspaceId: "workspace-test",
      projectId: "project-test",
      templateId: "manutencao",
    });
    expect(checklist[0]).toMatchObject({
      id: "project-test-check-1",
      title: "Validar backup recente",
      completed: false,
    });
    expect(checklist).toHaveLength(5);

    expect(
      getMissingResourceTypes("manutencao", DEMO_AGENCY_DATA.resources, "project-nautica"),
    ).toEqual(["admin", "documentation"]);
  });

  it("resume exatamente os itens que exigem atenção na data fixa", () => {
    expect(buildDashboardSnapshot(DEMO_AGENCY_DATA, DEMO_NOW)).toEqual({
      activeProjects: 5,
      overdueProjects: 1,
      blockedProjects: 1,
      waitingClientProjects: 1,
      deadlinesDueNext7Days: 3,
      renewalsNext30Days: 2,
      financial: {
        currency: "BRL",
        monthlyRecurringRevenueCents: 81_000,
        monthlyRecurringCostCents: 36_065,
        monthlyMarginCents: 44_935,
        marginPercent: 55.48,
      },
    });
  });

  it("mantém a Náutica publicada, com repositório, mas sem valores inventados", () => {
    const nautica = project("project-nautica");
    expect(nautica.stageId).toBe("manutencao");
    expect(nautica.publishedAt).not.toBeNull();
    expect(
      DEMO_AGENCY_DATA.resources.filter((resource) => resource.projectId === nautica.id).map((item) => item.type),
    ).toEqual(["production", "github"]);
    expect(DEMO_AGENCY_DATA.commercialTerms.some((terms) => terms.projectId === nautica.id)).toBe(false);
    expect(DEMO_AGENCY_DATA.projectSubscriptions.some((link) => link.projectId === nautica.id)).toBe(false);
  });

  it("é serializável sem perder o snapshot", () => {
    expect(JSON.parse(JSON.stringify(DEMO_AGENCY_DATA))).toEqual(DEMO_AGENCY_DATA);
  });
});
