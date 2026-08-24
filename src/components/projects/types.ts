export type ProjectHealth = "late" | "attention" | "on-track" | "waiting";

export type ProjectResourceView = {
  id: string;
  label: string;
  type: "production" | "staging" | "admin" | "github" | "figma" | "drive" | "docs" | "other";
  url: string;
};

export type ProjectTechnologyView = {
  id: string;
  name: string;
  category: string;
  color: string;
};

export type ProjectCardData = {
  id: string;
  name: string;
  clientName: string;
  workflowId: string;
  workflowName: string;
  stageId: string;
  stageName: string;
  sprintId: string | null;
  sprintName: string | null;
  responsibleName: string;
  responsibleAvatarUrl: string | null;
  nextAction: string;
  deadlineLabel: string;
  deadlineDate: string | null;
  health: ProjectHealth;
  blocked: boolean;
  archived?: boolean;
  hasRecurringRevenue: boolean;
  projectType: string;
  technologies: ProjectTechnologyView[];
  resources: ProjectResourceView[];
};

export type BoardStageData = {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  color: string;
  position: number;
  isTerminal?: boolean;
};
