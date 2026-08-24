import { describe, expect, it, vi } from "vitest";
import { DEMO_AGENCY_DATA, DEMO_NOW } from "../../data";

vi.mock("@/lib/domain", async () => import("../domain"));

import {
  buildBoardStages,
  buildProjectCards,
  getDefaultWorkflow,
  getProjectDetail,
} from "./view-models";

describe("workflow, sprint and technology view models", () => {
  it("selects the configured default workflow and its ordered columns", () => {
    const workflow = getDefaultWorkflow(DEMO_AGENCY_DATA);
    expect(workflow).toMatchObject({
      id: "workflow-entrega",
      name: "Entrega de projetos",
      sprintEnabled: true,
    });

    const stages = buildBoardStages(DEMO_AGENCY_DATA);
    expect(stages.map((stage) => stage.id)).toEqual([
      "entrada",
      "briefing",
      "em-producao",
      "aguardando-cliente",
      "revisao",
      "publicado",
    ]);
    expect(stages.every((stage) => stage.workflowId === "workflow-entrega")).toBe(true);
  });

  it("distinguishes an active sprint from the backlog", () => {
    const sprintCards = buildProjectCards(DEMO_AGENCY_DATA, DEMO_NOW, {
      workflowId: "workflow-entrega",
      sprintId: "sprint-agosto-2",
    });
    expect(sprintCards.map((card) => card.id)).toEqual([
      "project-aurora",
      "project-casa-norte",
      "project-studio-viva",
    ]);
    expect(sprintCards.every((card) => card.sprintStatus === "active")).toBe(true);

    const backlog = buildProjectCards(DEMO_AGENCY_DATA, DEMO_NOW, {
      workflowId: "workflow-entrega",
      sprintId: null,
    });
    expect(backlog.map((card) => card.id)).toEqual(["project-horizonte"]);
    expect(backlog[0]?.isBacklog).toBe(true);
  });

  it("exposes linked technologies without inventing a stack for Nautica", () => {
    const aurora = getProjectDetail(DEMO_AGENCY_DATA, "project-aurora", DEMO_NOW);
    expect(aurora?.technologies.map((technology) => technology.name)).toEqual([
      "Next.js",
      "TypeScript",
      "Supabase",
    ]);
    expect(aurora?.workflow?.name).toBe("Entrega de projetos");
    expect(aurora?.sprint?.status).toBe("active");

    const nautica = getProjectDetail(DEMO_AGENCY_DATA, "project-nautica", DEMO_NOW);
    expect(nautica?.technologies).toEqual([]);
    expect(nautica?.workflow?.name).toBe("Manutenção contínua");
    expect(nautica?.sprint).toBeNull();
  });
});
