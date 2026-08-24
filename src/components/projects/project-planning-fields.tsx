"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Columns3, Inbox } from "lucide-react";

type WorkflowOption = {
  id: string;
  name: string;
  description: string | null;
  sprintEnabled: boolean;
};

type StageOption = {
  id: string;
  workflowId: string;
  name: string;
};

type SprintOption = {
  id: string;
  workflowId: string;
  name: string;
  status: "planned" | "active" | "completed";
};

export function ProjectPlanningFields({
  workflows,
  stages,
  sprints,
  defaultWorkflowId,
  defaultStageId,
  defaultSprintId,
}: {
  workflows: readonly WorkflowOption[];
  stages: readonly StageOption[];
  sprints: readonly SprintOption[];
  defaultWorkflowId: string;
  defaultStageId?: string;
  defaultSprintId?: string | null;
}) {
  const [workflowId, setWorkflowId] = useState(defaultWorkflowId);
  const availableStages = useMemo(() => stages.filter((stage) => stage.workflowId === workflowId), [stages, workflowId]);
  const availableSprints = useMemo(
    () => sprints.filter((sprint) => sprint.workflowId === workflowId && (sprint.status !== "completed" || sprint.id === defaultSprintId)),
    [defaultSprintId, sprints, workflowId],
  );
  const selectedWorkflow = workflows.find((workflow) => workflow.id === workflowId);
  const [stageId, setStageId] = useState(defaultStageId ?? availableStages[0]?.id ?? "");
  const [sprintId, setSprintId] = useState(defaultSprintId ?? "");

  function changeWorkflow(nextWorkflowId: string) {
    setWorkflowId(nextWorkflowId);
    setStageId(stages.find((stage) => stage.workflowId === nextWorkflowId)?.id ?? "");
    setSprintId("");
  }

  return (
    <fieldset className="planning-fields full">
      <legend>Planejamento do trabalho</legend>
      <div className="planning-fields-grid">
        <label className="form-field">
          <span><Columns3 size={13} /> Fluxo de trabalho</span>
          <select className="input" name="workflow_id" value={workflowId} onChange={(event) => changeWorkflow(event.target.value)} required>
            {workflows.map((workflow) => <option value={workflow.id} key={workflow.id}>{workflow.name}</option>)}
          </select>
        </label>
        <label className="form-field">
          <span>Etapa inicial</span>
          <select className="input" name="board_column_id" value={stageId} onChange={(event) => setStageId(event.target.value)} required>
            {availableStages.map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>)}
          </select>
        </label>
        {selectedWorkflow?.sprintEnabled ? (
          <label className="form-field full">
            <span><CalendarRange size={13} /> Sprint opcional</span>
            <select className="input" name="sprint_id" value={sprintId} onChange={(event) => setSprintId(event.target.value)}>
              <option value="">Backlog — planejar depois</option>
              {availableSprints.map((sprint) => <option value={sprint.id} key={sprint.id}>{sprint.name}{sprint.status === "active" ? " · ativa" : sprint.status === "completed" ? " · concluída" : ""}</option>)}
            </select>
          </label>
        ) : (
          <div className="planning-continuous-note full"><Inbox size={15} /><span><strong>Fluxo contínuo</strong><small>Este fluxo não usa backlog nem sprints.</small></span></div>
        )}
      </div>
      {selectedWorkflow?.description && <p>{selectedWorkflow.description}</p>}
    </fieldset>
  );
}
