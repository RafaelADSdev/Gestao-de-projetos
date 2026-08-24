import { PROJECT_TEMPLATE_BY_ID } from "./constants";
import type {
  ChecklistItem,
  ProjectResource,
  ProjectTemplateId,
  ResourceType,
} from "./types";

export interface InstantiateChecklistInput {
  workspaceId: string;
  projectId: string;
  templateId: ProjectTemplateId;
  assigneeId?: string | null;
  createId?: (position: number) => string;
}

/** Builds a deterministic, unsaved checklist. Callers may inject database IDs. */
export function instantiateTemplateChecklist({
  workspaceId,
  projectId,
  templateId,
  assigneeId = null,
  createId = (position) => `${projectId}-check-${position + 1}`,
}: InstantiateChecklistInput): ChecklistItem[] {
  return PROJECT_TEMPLATE_BY_ID[templateId].checklist.map((item) => ({
    id: createId(item.position),
    workspaceId,
    projectId,
    title: item.title,
    description: item.description,
    position: item.position,
    completed: false,
    completedAt: null,
    assigneeId,
  }));
}

export function getMissingResourceTypes(
  templateId: ProjectTemplateId,
  resources: readonly ProjectResource[],
  projectId: string,
): ResourceType[] {
  const existing = new Set(
    resources.filter((resource) => resource.projectId === projectId).map((resource) => resource.type),
  );
  return PROJECT_TEMPLATE_BY_ID[templateId].expectedResourceTypes.filter(
    (resourceType) => !existing.has(resourceType),
  );
}

