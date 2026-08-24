import Link from "next/link";
import {
  Boxes,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Columns3,
  GitBranch,
  Inbox,
  Plus,
  Settings2,
} from "lucide-react";
import {
  completeSprintAction,
  createBoardStageAction,
  createSprintAction,
  createTechnologyAction,
  createWorkflowAction,
  deleteBoardStageAction,
  deleteSprintAction,
  deleteTechnologyAction,
  deleteWorkflowAction,
  updateBoardStageAction,
  updateSprintAction,
  updateTechnologyAction,
  updateWorkflowAction,
} from "@/app/(dashboard)/actions";
import type { AgencyData, BoardStage, Sprint, Technology } from "@/lib/domain";
import { SettingsActionForm } from "./action-form";
import { DeleteActionForm } from "./delete-action-form";

type ConfigurableStage = BoardStage & { archivedAt?: string | null };

const CATEGORY_LABELS: Record<Technology["category"], string> = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Banco de dados",
  infrastructure: "Infraestrutura",
  design: "Design",
  analytics: "Analytics",
  other: "Outro",
};

const STATUS_LABELS: Record<Sprint["status"], string> = {
  planned: "Planejada",
  active: "Ativa",
  completed: "Concluída",
};

const cardStyle = {
  border: "1px solid #e3e7ee",
  borderRadius: 12,
  padding: 14,
  background: "#fbfcfd",
} as const;

const mutedStyle = { color: "#858fa2", fontSize: 9, lineHeight: 1.55 } as const;

function StageEditor({
  stage,
  replacementStages,
}: {
  stage: ConfigurableStage;
  replacementStages: readonly ConfigurableStage[];
}) {
  return (
    <article style={cardStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr) auto", alignItems: "center", gap: 10 }}>
        <strong aria-label={`Posição ${stage.position + 1}`} style={{ color: "#657087", fontSize: 10 }}>
          {stage.position + 1}
        </strong>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 99, background: stage.color ?? stage.accent }} />
            <strong style={{ fontSize: 10 }}>{stage.label}</strong>
            {stage.isTerminal && <span className="integration-status connected">Final</span>}
          </div>
          <p style={{ ...mutedStyle, margin: "4px 0 0" }}>{stage.description || "Sem descrição."}</p>
        </div>
        <Settings2 aria-hidden="true" size={15} color="#8790a2" />
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ color: "#4969ad", cursor: "pointer", fontSize: 9, fontWeight: 800 }}>Editar etapa e posição</summary>
        <div style={{ marginTop: 12 }}>
          <SettingsActionForm
            action={updateBoardStageAction.bind(null, stage.databaseId ?? stage.id)}
            className="form-grid two"
            submitLabel="Salvar etapa"
          >
            <label className="form-field"><span>Nome</span><input className="input" name="name" defaultValue={stage.label} minLength={2} maxLength={80} required /></label>
            <label className="form-field"><span>Chave</span><input className="input" name="key" defaultValue={stage.key ?? stage.id} maxLength={64} inputMode="text" /></label>
            <label className="form-field full"><span>Descrição</span><textarea className="input" name="description" defaultValue={stage.description} maxLength={400} /></label>
            <label className="form-field"><span>Cor hexadecimal</span><input className="input" name="color" defaultValue={stage.color ?? stage.accent} pattern="#[0-9A-Fa-f]{6}" required /></label>
            <label className="form-field"><span>Posição</span><input className="input" name="position" type="number" min={0} max={99} defaultValue={stage.position} required /></label>
            <label className="toggle-field full"><input name="is_terminal" type="checkbox" defaultChecked={stage.isTerminal} /><span><strong>Etapa terminal</strong><small>Projetos nesta etapa são considerados encerrados no fluxo.</small></span></label>
          </SettingsActionForm>
        </div>
      </details>

      <div style={{ marginTop: 10 }}>
        <DeleteActionForm
          action={deleteBoardStageAction.bind(null, stage.databaseId ?? stage.id)}
          itemLabel={`a etapa ${stage.label}`}
          description="Se houver projetos nesta etapa, escolha outra coluna do mesmo fluxo. Os projetos serão movidos antes da exclusão; o log continuará preservado."
        >
          <label className="form-field">
            <span>Etapa de destino (quando necessária)</span>
            <select className="input" name="replacement_board_column_id" defaultValue="">
              <option value="">Nenhuma — somente se estiver vazia</option>
              {replacementStages.map((replacement) => <option value={replacement.databaseId ?? replacement.id} key={replacement.databaseId ?? replacement.id}>{replacement.label}</option>)}
            </select>
          </label>
        </DeleteActionForm>
      </div>
    </article>
  );
}

function SprintEditor({ sprint }: { sprint: Sprint }) {
  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <strong style={{ fontSize: 10 }}>{sprint.name}</strong>
            <span className={`integration-status ${sprint.status === "active" || sprint.status === "completed" ? "connected" : ""}`}>{STATUS_LABELS[sprint.status]}</span>
          </div>
          <p style={{ ...mutedStyle, margin: "5px 0 0" }}>{sprint.startDate} → {sprint.endDate}{sprint.goal ? ` · ${sprint.goal}` : ""}</p>
        </div>
        {sprint.status !== "completed" && (
          <SettingsActionForm
            action={completeSprintAction.bind(null, sprint.id)}
            className=""
            submitLabel="Concluir"
            pendingLabel="Concluindo…"
            successMessage="Sprint concluída."
            secondary
          />
        )}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ color: "#4969ad", cursor: "pointer", fontSize: 9, fontWeight: 800 }}>Editar sprint</summary>
        <div style={{ marginTop: 12 }}>
          <SettingsActionForm action={updateSprintAction.bind(null, sprint.id)} className="form-grid two" submitLabel="Salvar sprint">
            <label className="form-field full"><span>Nome</span><input className="input" name="name" defaultValue={sprint.name} minLength={2} maxLength={120} required /></label>
            <label className="form-field full"><span>Objetivo</span><textarea className="input" name="goal" defaultValue={sprint.goal ?? ""} maxLength={500} /></label>
            <label className="form-field"><span>Início</span><input className="input" name="start_date" type="date" defaultValue={sprint.startDate} required /></label>
            <label className="form-field"><span>Fim</span><input className="input" name="end_date" type="date" defaultValue={sprint.endDate} required /></label>
            <label className="form-field full"><span>Status</span><select className="input" name="status" defaultValue={sprint.status}><option value="planned">Planejada</option><option value="active">Ativa</option><option value="completed">Concluída</option></select></label>
          </SettingsActionForm>
        </div>
      </details>
      <div style={{ marginTop: 10 }}>
        <DeleteActionForm
          action={deleteSprintAction.bind(null, sprint.id)}
          itemLabel={`a sprint ${sprint.name}`}
          description="Os projetos desta sprint voltarão automaticamente ao backlog. A exclusão continuará registrada no log."
        />
      </div>
    </article>
  );
}

function TechnologyEditor({ technology }: { technology: Technology }) {
  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <i aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 99, background: technology.color }} />
        <div style={{ minWidth: 0, flex: 1 }}><strong style={{ fontSize: 10 }}>{technology.name}</strong><p style={{ ...mutedStyle, margin: "3px 0 0" }}>{CATEGORY_LABELS[technology.category]}</p></div>
      </div>
      <details style={{ marginTop: 10 }}>
        <summary style={{ color: "#4969ad", cursor: "pointer", fontSize: 9, fontWeight: 800 }}>Editar tecnologia</summary>
        <div style={{ marginTop: 12 }}>
          <SettingsActionForm action={updateTechnologyAction.bind(null, technology.id)} className="form-grid two" submitLabel="Salvar tecnologia">
            <label className="form-field"><span>Nome</span><input className="input" name="name" defaultValue={technology.name} minLength={2} maxLength={80} required /></label>
            <label className="form-field"><span>Categoria</span><select className="input" name="category" defaultValue={technology.category}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Cor hexadecimal</span><input className="input" name="color" defaultValue={technology.color} pattern="#[0-9A-Fa-f]{6}" required /></label>
            <label className="form-field"><span>Site oficial</span><input className="input" name="website_url" type="url" defaultValue={technology.websiteUrl ?? ""} placeholder="https://…" /></label>
          </SettingsActionForm>
        </div>
      </details>
      <div style={{ marginTop: 10 }}>
        <DeleteActionForm
          action={deleteTechnologyAction.bind(null, technology.id)}
          itemLabel={technology.name}
          description="A tecnologia será removida do catálogo e desvinculada dos projetos. A ocorrência ficará no log de auditoria."
        />
      </div>
    </article>
  );
}

export function WorkflowAdmin({ data, selectedWorkflowId }: { data: AgencyData; selectedWorkflowId?: string }) {
  const activeWorkflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const selectedWorkflow = activeWorkflows.find((workflow) => workflow.id === selectedWorkflowId)
    ?? activeWorkflows.find((workflow) => workflow.isDefault)
    ?? activeWorkflows[0]
    ?? null;
  const workflowStages = (data.boardStages as readonly ConfigurableStage[])
    .filter((stage) => stage.workflowId === selectedWorkflow?.id && !stage.archivedAt)
    .sort((left, right) => left.position - right.position);
  const archivedStages = (data.boardStages as readonly ConfigurableStage[])
    .filter((stage) => stage.workflowId === selectedWorkflow?.id && Boolean(stage.archivedAt));
  const workflowSprints = data.sprints
    .filter((sprint) => sprint.workflowId === selectedWorkflow?.id)
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
  const backlogCount = selectedWorkflow
    ? data.projects.filter((project) => project.workflowId === selectedWorkflow.id && project.sprintId === null && !project.archivedAt).length
    : 0;
  const activeTechnologies = data.technologies.filter((technology) => !technology.archivedAt).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const archivedTechnologies = data.technologies.filter((technology) => technology.archivedAt);

  return (
    <>
      <section className="settings-layout">
        <aside className="settings-side">
          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon blue"><GitBranch size={18} /></span><div><h2>Fluxos de trabalho</h2><p>Escolha o quadro que deseja administrar</p></div></div></div>
            <nav aria-label="Fluxos configurados" style={{ display: "grid", gap: 7, marginTop: 15 }}>
              {activeWorkflows.map((workflow) => (
                <Link
                  aria-current={workflow.id === selectedWorkflow?.id ? "page" : undefined}
                  href={`/configuracoes/fluxos?fluxo=${encodeURIComponent(workflow.id)}`}
                  key={workflow.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 8,
                    padding: 11,
                    border: `1px solid ${workflow.id === selectedWorkflow?.id ? "#9db6f2" : "#e3e7ee"}`,
                    borderRadius: 10,
                    background: workflow.id === selectedWorkflow?.id ? "#f4f7fd" : "white",
                  }}
                >
                  <span style={{ display: "grid", gap: 3 }}><strong style={{ fontSize: 10 }}>{workflow.name}</strong><small style={mutedStyle}>{workflow.sprintEnabled ? "Com sprints" : "Fluxo contínuo"}{workflow.isDefault ? " · padrão" : ""}</small></span>
                  <ChevronRight aria-hidden="true" size={15} color="#8790a2" />
                </Link>
              ))}
              {activeWorkflows.length === 0 && <div className="detail-empty"><Inbox size={16} /> Nenhum fluxo ativo.</div>}
            </nav>
            {data.workflows.some((workflow) => workflow.archivedAt) && <p style={{ ...mutedStyle, margin: "12px 0 0" }}>{data.workflows.filter((workflow) => workflow.archivedAt).length} fluxo(s) arquivado(s), preservados no histórico.</p>}
          </article>

          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon teal"><Plus size={18} /></span><div><h2>Novo fluxo</h2><p>Crie um quadro independente</p></div></div></div>
            <SettingsActionForm action={createWorkflowAction} submitLabel="Criar fluxo" successMessage="Fluxo criado." className="stacked-form">
              <label className="form-field"><span>Nome</span><input className="input" name="name" minLength={2} maxLength={80} placeholder="Ex.: Desenvolvimento" required /></label>
              <label className="form-field"><span>Chave opcional</span><input className="input" name="key" maxLength={64} placeholder="Gerada pelo servidor" /></label>
              <label className="form-field"><span>Descrição</span><textarea className="input" name="description" maxLength={500} /></label>
              <label className="toggle-field"><input name="sprint_enabled" type="checkbox" /><span><strong>Usar sprints</strong><small>Habilita backlog e ciclos com datas.</small></span></label>
              <label className="toggle-field"><input name="is_default" type="checkbox" /><span><strong>Fluxo padrão</strong><small>Será a primeira opção para novos projetos.</small></span></label>
            </SettingsActionForm>
          </article>
        </aside>

        <div className="settings-main">
          {!selectedWorkflow ? (
            <article className="panel restricted-page"><span><Columns3 size={26} /></span><h2>Crie o primeiro fluxo</h2><p>Depois dele, você poderá cadastrar etapas ordenadas e sprints.</p></article>
          ) : (
            <>
              <article className="panel settings-card">
                <div className="panel-heading"><div><span className="panel-icon blue"><Settings2 size={18} /></span><div><h2>{selectedWorkflow.name}</h2><p>Identidade e modo de planejamento do fluxo</p></div></div>{selectedWorkflow.isDefault && <span className="integration-status connected"><CheckCircle2 size={12} /> Padrão</span>}</div>
                <div style={{ marginTop: 17 }}>
                  <SettingsActionForm action={updateWorkflowAction.bind(null, selectedWorkflow.id)} className="form-grid two" submitLabel="Salvar fluxo">
                    <label className="form-field"><span>Nome</span><input className="input" name="name" defaultValue={selectedWorkflow.name} minLength={2} maxLength={80} required /></label>
                    <label className="form-field"><span>Chave</span><input className="input" name="key" defaultValue={selectedWorkflow.key} maxLength={64} /></label>
                    <label className="form-field full"><span>Descrição</span><textarea className="input" name="description" defaultValue={selectedWorkflow.description ?? ""} maxLength={500} /></label>
                    <label className="toggle-field"><input name="sprint_enabled" type="checkbox" defaultChecked={selectedWorkflow.sprintEnabled} /><span><strong>Usar sprints</strong><small>Organiza projetos entre backlog e ciclos.</small></span></label>
                    <label className="toggle-field"><input name="is_default" type="checkbox" defaultChecked={selectedWorkflow.isDefault} /><span><strong>Fluxo padrão</strong><small>Usado quando não houver outra seleção.</small></span></label>
                  </SettingsActionForm>
                </div>
                <div style={{ marginTop: 13 }}>
                  <DeleteActionForm
                    action={deleteWorkflowAction.bind(null, selectedWorkflow.id)}
                    itemLabel={`o fluxo ${selectedWorkflow.name}`}
                    description="Só é permitido quando nenhum projeto estiver vinculado e este não for o fluxo padrão. Etapas e sprints serão removidas junto; o log permanecerá."
                  />
                </div>
              </article>

              <article className="panel settings-card">
                <div className="panel-heading"><div><span className="panel-icon teal"><Columns3 size={18} /></span><div><h2>Etapas ordenadas</h2><p>{workflowStages.length} coluna(s) ativa(s) neste fluxo</p></div></div></div>
                <div style={{ display: "grid", gap: 9, marginTop: 15 }}>
                  {workflowStages.map((stage) => <StageEditor key={stage.databaseId ?? stage.id} stage={stage} replacementStages={workflowStages.filter((item) => item.id !== stage.id)} />)}
                  {workflowStages.length === 0 && <div className="detail-empty"><Columns3 size={16} /> Cadastre ao menos uma etapa para usar o Kanban.</div>}
                </div>
                {archivedStages.length > 0 && <p style={{ ...mutedStyle, margin: "12px 0 0" }}>{archivedStages.length} etapa(s) arquivada(s) preservadas para o histórico.</p>}
                <details style={{ marginTop: 14 }} open={workflowStages.length === 0}>
                  <summary className="button button-secondary" style={{ listStyle: "none", width: "fit-content" }}><Plus size={14} /> Nova etapa</summary>
                  <div style={{ ...cardStyle, marginTop: 10 }}>
                    <SettingsActionForm action={createBoardStageAction.bind(null, selectedWorkflow.id)} className="form-grid two" submitLabel="Criar etapa" successMessage="Etapa criada.">
                      <label className="form-field"><span>Nome</span><input className="input" name="name" minLength={2} maxLength={80} required /></label>
                      <label className="form-field"><span>Chave opcional</span><input className="input" name="key" maxLength={64} placeholder="Gerada pelo servidor" /></label>
                      <label className="form-field full"><span>Descrição</span><textarea className="input" name="description" maxLength={400} /></label>
                      <label className="form-field"><span>Cor hexadecimal</span><input className="input" name="color" defaultValue="#64748B" pattern="#[0-9A-Fa-f]{6}" required /></label>
                      <label className="form-field"><span>Posição</span><input className="input" name="position" type="number" min={0} max={99} defaultValue={workflowStages.reduce((highest, stage) => Math.max(highest, stage.position), -1) + 1} required /></label>
                      <label className="toggle-field full"><input name="is_terminal" type="checkbox" /><span><strong>Etapa terminal</strong><small>Marca o encerramento do trabalho neste fluxo.</small></span></label>
                    </SettingsActionForm>
                  </div>
                </details>
              </article>

              <article className="panel settings-card">
                <div className="panel-heading"><div><span className="panel-icon amber"><CalendarRange size={18} /></span><div><h2>Sprints e backlog</h2><p>{selectedWorkflow.sprintEnabled ? `${backlogCount} projeto(s) aguardando planejamento` : "Planejamento contínuo neste fluxo"}</p></div></div></div>
                {!selectedWorkflow.sprintEnabled ? (
                  <div className="info-callout"><CalendarRange size={17} /><p><strong>Sprints desativadas.</strong> Ative “Usar sprints” nas configurações do fluxo para liberar backlog e ciclos.</p></div>
                ) : (
                  <>
                    <div style={{ display: "grid", gap: 9, marginTop: 15 }}>
                      {workflowSprints.map((sprint) => <SprintEditor sprint={sprint} key={sprint.id} />)}
                      {workflowSprints.length === 0 && <div className="detail-empty"><CalendarRange size={16} /> Nenhuma sprint criada.</div>}
                    </div>
                    <details style={{ marginTop: 14 }} open={workflowSprints.length === 0}>
                      <summary className="button button-secondary" style={{ listStyle: "none", width: "fit-content" }}><Plus size={14} /> Nova sprint</summary>
                      <div style={{ ...cardStyle, marginTop: 10 }}>
                        <SettingsActionForm action={createSprintAction.bind(null, selectedWorkflow.id)} className="form-grid two" submitLabel="Criar sprint" successMessage="Sprint criada.">
                          <label className="form-field full"><span>Nome</span><input className="input" name="name" minLength={2} maxLength={120} placeholder="Ex.: Sprint 01" required /></label>
                          <label className="form-field full"><span>Objetivo</span><textarea className="input" name="goal" maxLength={500} /></label>
                          <label className="form-field"><span>Início</span><input className="input" name="start_date" type="date" required /></label>
                          <label className="form-field"><span>Fim</span><input className="input" name="end_date" type="date" required /></label>
                          <label className="form-field full"><span>Status inicial</span><select className="input" name="status" defaultValue="planned"><option value="planned">Planejada</option><option value="active">Ativa</option></select></label>
                        </SettingsActionForm>
                      </div>
                    </details>
                  </>
                )}
              </article>
            </>
          )}
        </div>
      </section>

      <section className="content-section panel settings-card">
        <div className="panel-heading"><div><span className="panel-icon blue"><Boxes size={18} /></span><div><h2>Catálogo de tecnologias</h2><p>Stack reutilizável para classificar e localizar projetos</p></div></div><span className="settings-helper">{activeTechnologies.length} ativa(s)</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 9, marginTop: 15 }}>
          {activeTechnologies.map((technology) => <TechnologyEditor technology={technology} key={technology.id} />)}
          {activeTechnologies.length === 0 && <div className="detail-empty"><Boxes size={16} /> Nenhuma tecnologia cadastrada.</div>}
        </div>
        {archivedTechnologies.length > 0 && <p style={{ ...mutedStyle, margin: "12px 0 0" }}>{archivedTechnologies.length} tecnologia(s) arquivada(s), ainda preservadas nos projetos antigos.</p>}
        <details style={{ marginTop: 14 }} open={activeTechnologies.length === 0}>
          <summary className="button button-secondary" style={{ listStyle: "none", width: "fit-content" }}><Plus size={14} /> Nova tecnologia</summary>
          <div style={{ ...cardStyle, marginTop: 10 }}>
            <SettingsActionForm action={createTechnologyAction} className="form-grid two" submitLabel="Criar tecnologia" successMessage="Tecnologia criada.">
              <label className="form-field"><span>Nome</span><input className="input" name="name" minLength={2} maxLength={80} required /></label>
              <label className="form-field"><span>Categoria</span><select className="input" name="category" defaultValue="other">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="form-field"><span>Cor hexadecimal</span><input className="input" name="color" defaultValue="#2563EB" pattern="#[0-9A-Fa-f]{6}" required /></label>
              <label className="form-field"><span>Site oficial</span><input className="input" name="website_url" type="url" placeholder="https://…" /></label>
            </SettingsActionForm>
          </div>
        </details>
      </section>
    </>
  );
}
