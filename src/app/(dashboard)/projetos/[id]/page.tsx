import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarDays,
  CalendarRange,
  Check,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock3,
  Code2,
  Boxes,
  ExternalLink,
  FileText,
  History,
  Link2,
  LockKeyhole,
  Plus,
  Save,
  Settings2,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  addChecklistItemAction,
  addDeadlineAction,
  addResourceAction,
  addSubscriptionAction,
  assignProjectSprintAction,
  assignProjectWorkflowAction,
  attachProjectTechnologyAction,
  detachProjectTechnologyAction,
  deleteChecklistItemAction,
  deleteCommercialTermsAction,
  deleteDeadlineAction,
  deleteProjectAction,
  deleteResourceAction,
  deleteSubscriptionAction,
  rescheduleSubscriptionAction,
  setDeadlineStateAction,
  setSubscriptionStatusAction,
  setProjectArchivedAction,
  toggleChecklistItemAction,
  updateCommercialTermsAction,
  updateProjectAction,
} from "@/app/(dashboard)/actions";
import { ProjectPlanningFields } from "@/components/projects/project-planning-fields";
import { EpicChildCards } from "@/components/projects/epic-child-cards";
import { EpicQuickLinks } from "@/components/projects/epic-quick-links";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { canSeeFinance, requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { getProjectDetail } from "@/lib/data/view-models";
import {
  formatCurrencyBRL,
  formatDateBR,
  formatDeadlineLabel,
  getMissingResourceTypes,
} from "@/lib/domain";

const tabs = [
  { id: "resumo", label: "Resumo", icon: FileText },
  { id: "entregas", label: "Checklist e prazos", icon: CheckCircle2 },
  { id: "links", label: "Links e GitHub", icon: Link2 },
  { id: "tecnologias", label: "Tecnologias", icon: Boxes },
  { id: "financeiro", label: "Financeiro e assinaturas", icon: WalletCards },
  { id: "historico", label: "Histórico", icon: History },
] as const;

type DetailTab = (typeof tabs)[number]["id"];

const resourceLabels = {
  production: "Produção",
  staging: "Homologação",
  admin: "Painel",
  github: "GitHub",
  figma: "Figma",
  drive: "Drive",
  documentation: "Documentação",
  other: "Outro",
} as const;

const kindLabels = {
  delivery: "Entrega",
  review: "Revisão",
  "client-content": "Conteúdo do cliente",
  launch: "Publicação",
  maintenance: "Manutenção",
  other: "Outro",
} as const;

const technologyCategoryLabels = {
  frontend: "Frontend",
  backend: "Backend",
  database: "Banco de dados",
  infrastructure: "Infraestrutura",
  design: "Design",
  analytics: "Analytics",
  other: "Outro",
} as const;

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const [{ id }, query, context] = await Promise.all([
    params,
    searchParams,
    requireAuthContext(),
  ]);
  const { data, now } = await loadAgencyData(context);
  const detail = getProjectDetail(data, id, now);
  if (!detail) notFound();

  const activeTab = tabs.some((tab) => tab.id === query.aba)
    ? (query.aba as DetailTab)
    : "resumo";
  const nextDeadline = detail.deadlines.find((item) => item.state === "open") ?? null;
  const completed = detail.checklist.filter((item) => item.completed).length;
  const checklistPercent = detail.checklist.length
    ? Math.round((completed / detail.checklist.length) * 100)
    : 0;
  const missingResources = getMissingResourceTypes(
    detail.project.templateId,
    data.resources,
    detail.project.id,
  );
  const activeWorkflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const availableTechnologies = data.technologies.filter((technology) =>
    !technology.archivedAt && !detail.technologies.some((linked) => linked.id === technology.id));

  async function updateProject(formData: FormData) {
    "use server";
    await updateProjectAction(id, formData);
  }

  async function toggleChecklist(formData: FormData) {
    "use server";
    await toggleChecklistItemAction(
      String(formData.get("item_id")),
      formData.get("completed") === "true",
    );
  }

  async function addChecklist(formData: FormData) {
    "use server";
    await addChecklistItemAction(id, formData);
  }

  async function addDeadline(formData: FormData) {
    "use server";
    await addDeadlineAction(id, formData);
  }

  async function setDeadlineState(formData: FormData) {
    "use server";
    const state = String(formData.get("state"));
    if (state !== "open" && state !== "completed" && state !== "canceled") return;
    await setDeadlineStateAction(id, String(formData.get("deadline_id")), state);
  }

  async function addResource(formData: FormData) {
    "use server";
    await addResourceAction(id, formData);
  }

  async function updateFinance(formData: FormData) {
    "use server";
    await updateCommercialTermsAction(id, formData);
  }

  async function addSubscription(formData: FormData) {
    "use server";
    await addSubscriptionAction(id, formData);
  }

  async function rescheduleSubscription(formData: FormData) {
    "use server";
    await rescheduleSubscriptionAction(id, String(formData.get("subscription_id")), formData);
  }

  async function setSubscriptionStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status"));
    if (status !== "active" && status !== "paused" && status !== "canceled") return;
    await setSubscriptionStatusAction(id, String(formData.get("subscription_id")), status);
  }

  async function updatePlanning(formData: FormData) {
    "use server";
    const workflowResult = await assignProjectWorkflowAction(id, formData);
    if (workflowResult.ok) await assignProjectSprintAction(id, formData);
  }

  async function attachTechnology(formData: FormData) {
    "use server";
    await attachProjectTechnologyAction(id, formData);
  }

  async function detachTechnology(formData: FormData) {
    "use server";
    await detachProjectTechnologyAction(id, String(formData.get("technology_id")));
  }

  async function archiveProject() {
    "use server";
    const result = await setProjectArchivedAction(id, true);
    if (result.ok) redirect("/projetos");
  }

  async function restoreProject() {
    "use server";
    await setProjectArchivedAction(id, false);
  }

  async function deleteProject() {
    "use server";
    const result = await deleteProjectAction(id);
    if (result.ok) redirect("/projetos");
    return result;
  }

  async function deleteChecklistItem(formData: FormData) {
    "use server";
    return deleteChecklistItemAction(id, String(formData.get("item_id")));
  }

  async function deleteDeadline(formData: FormData) {
    "use server";
    return deleteDeadlineAction(id, String(formData.get("deadline_id")));
  }

  async function deleteResource(formData: FormData) {
    "use server";
    return deleteResourceAction(id, String(formData.get("resource_id")));
  }

  async function deleteCommercialTerms() {
    "use server";
    return deleteCommercialTermsAction(id);
  }

  async function deleteSubscription(formData: FormData) {
    "use server";
    return deleteSubscriptionAction(String(formData.get("subscription_id")));
  }

  return (
    <div className="project-detail-page">
      <Link href="/projetos" className="back-link">
        <ArrowLeft size={15} /> Voltar aos Epics
      </Link>

      <header className="project-detail-hero">
        <div className="project-detail-main">
          <div className="project-title-row">
            <span className="project-stage-badge">{detail.stage?.label ?? "Sem etapa"}</span>
            <span className="project-stage-badge workflow">{detail.workflow?.name ?? "Sem fluxo"}</span>
            {detail.workflow?.sprintEnabled && <span className="project-stage-badge sprint"><CalendarRange size={12} />{detail.sprint?.name ?? "Backlog"}</span>}
            {detail.project.blocked && (
              <span className="blocked-badge"><AlertTriangle size={13} /> Bloqueado</span>
            )}
          </div>
          <span className="eyebrow">{detail.client?.name ?? "Cliente não informado"} · Epic</span>
          <h1>{detail.project.name}</h1>
          <p>{detail.project.description ?? "Descrição, links (Git, site) e contexto do Epic ficam aqui — os cards do Kanban mostram só a tarefa em execução."}</p>
        </div>
        <div className="project-quick-facts" aria-label="Informações rápidas">
          <div><UserRound size={16} /><span><small>Responsável</small><strong>{detail.member?.name ?? "Não definido"}</strong></span></div>
          <div><CalendarDays size={16} /><span><small>Próximo prazo</small><strong>{nextDeadline ? formatDeadlineLabel(nextDeadline.dueDate, now) : "Sem prazo"}</strong></span></div>
          <div><Clock3 size={16} /><span><small>Próxima ação</small><strong>{detail.project.nextAction ?? "Definir ação"}</strong></span></div>
        </div>
      </header>

      {detail.project.archivedAt && (
        <div className="project-archived-alert" role="status">
          <Archive size={18} />
          <div><strong>Projeto arquivado</strong><p>Ele não aparece nos quadros nem no portfólio ativo, mas todo o conteúdo continua disponível.</p></div>
          <form action={restoreProject}><button className="button button-secondary" type="submit">Restaurar projeto</button></form>
        </div>
      )}

      {detail.project.blocked && (
        <div className="project-blocker-alert" role="status">
          <AlertTriangle size={18} />
          <div><strong>Este projeto precisa de atenção</strong><p>{detail.project.blockerReason ?? "O motivo do bloqueio ainda não foi registrado."}</p></div>
        </div>
      )}

      <nav className="detail-tabs" aria-label="Seções do projeto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={`/projetos/${id}?aba=${tab.id}`}
              className={activeTab === tab.id ? "active" : ""}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <Icon size={15} /> {tab.label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "resumo" && (
        <section className="detail-two-column">
          <div className="detail-main-stack">
          <form action={updateProject} className="panel detail-panel detail-form">
            <div className="panel-heading"><div><span className="panel-icon blue"><FileText size={18} /></span><div><h2>Resumo do Epic</h2><p>Contexto, links e próxima ação macro</p></div></div></div>
            <div className="form-grid two">
              <label className="form-field full"><span>Nome do projeto</span><input className="input" name="name" required defaultValue={detail.project.name} /></label>
              <label className="form-field full"><span>Próxima ação</span><input className="input" name="next_action" defaultValue={detail.project.nextAction ?? ""} placeholder="Qual é o próximo passo concreto?" /></label>
              <label className="form-field full"><span>Descrição</span><textarea className="input" name="description" defaultValue={detail.project.description ?? ""} /></label>
              <label className="form-field full"><span>Responsável</span><select className="input" name="responsible_id" defaultValue={detail.project.ownerId}>{data.members.filter((member) => member.active).map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label>
              <label className="toggle-field full"><input type="checkbox" name="blocked" defaultChecked={detail.project.blocked} /><span><strong>Projeto bloqueado</strong><small>Marque quando depender de uma decisão ou material externo.</small></span></label>
              <label className="form-field full"><span>Motivo do bloqueio</span><input className="input" name="blocker_reason" defaultValue={detail.project.blockerReason ?? ""} placeholder="Ex.: aguardando textos aprovados pelo cliente" /></label>
            </div>
            <div className="form-actions"><button className="button button-primary" type="submit"><Save size={15} /> Salvar alterações</button></div>
          </form>

          <EpicChildCards cards={detail.workItems} />
          </div>

          <aside className="detail-side-stack">
            <EpicQuickLinks resources={detail.resources} />
            <article className="panel project-health-card">
              <div className="panel-heading"><div><span className="panel-icon teal"><CheckCircle2 size={18} /></span><div><h2>Andamento</h2><p>Leitura rápida da entrega</p></div></div></div>
              <div className="large-progress"><span><strong>{checklistPercent}%</strong><small>do checklist concluído</small></span><i><em style={{ width: `${checklistPercent}%` }} /></i></div>
              <dl className="project-facts-list">
                <div><dt>Cliente</dt><dd>{detail.client?.name ?? "Não informado"}</dd></div>
                <div><dt>Etapa</dt><dd>{detail.stage?.label ?? "Não definida"}</dd></div>
                <div><dt>Fluxo</dt><dd>{detail.workflow?.name ?? "Não definido"}</dd></div>
                <div><dt>Planejamento</dt><dd>{detail.workflow?.sprintEnabled ? detail.sprint?.name ?? "Backlog" : "Contínuo"}</dd></div>
                <div><dt>Tecnologias</dt><dd>{detail.technologies.length ? detail.technologies.map((technology) => technology.name).join(", ") : "Não informadas"}</dd></div>
                <div><dt>Início</dt><dd>{detail.project.startedAt ? formatDateBR(detail.project.startedAt.slice(0, 10)) : "Não informado"}</dd></div>
                <div><dt>Publicação</dt><dd>{detail.project.publishedAt ? formatDateBR(detail.project.publishedAt.slice(0, 10)) : "Ainda não publicado"}</dd></div>
              </dl>
            </article>
            <form action={updatePlanning} className="panel project-planning-card">
              <div className="panel-heading"><div><span className="panel-icon violet"><CalendarRange size={18} /></span><div><h2>Fluxo e planejamento</h2><p>Etapa, sprint ou backlog</p></div></div></div>
              <ProjectPlanningFields
                workflows={activeWorkflows.map((workflow) => ({ id: workflow.id, name: workflow.name, description: workflow.description, sprintEnabled: workflow.sprintEnabled }))}
                stages={data.boardStages.filter((stage) => !stage.archivedAt).map((stage) => ({ id: stage.id, workflowId: stage.workflowId, name: stage.label }))}
                sprints={data.sprints.map((sprint) => ({ id: sprint.id, workflowId: sprint.workflowId, name: sprint.name, status: sprint.status }))}
                defaultWorkflowId={detail.project.workflowId}
                defaultStageId={detail.project.stageId}
                defaultSprintId={detail.project.sprintId}
              />
              <button className="button button-secondary button-block" type="submit">Atualizar planejamento</button>
            </form>
            <article className="panel next-action-card"><span className="eyebrow">Foco da equipe</span><h2>Próxima ação</h2><p>{detail.project.nextAction ?? "Defina uma próxima ação pequena, clara e atribuível."}</p></article>
            {!detail.project.archivedAt && <details className="panel archive-project-card">
              <summary><Archive size={14} /> Arquivar projeto</summary>
              <p>O projeto sairá do portfólio e dos quadros, mas todo o histórico será preservado.</p>
              <form action={archiveProject}><button className="button button-secondary" type="submit">Confirmar arquivamento</button></form>
            </details>}
            <article className="panel project-delete-card">
              <span className="eyebrow">Zona de perigo</span>
              <h2>Exclusão permanente</h2>
              <p>Remove o projeto, checklist, prazos, links, vínculos e dados financeiros. O log de auditoria continuará disponível.</p>
              <DeleteActionForm
                action={deleteProject}
                className="danger-zone"
                itemLabel={detail.project.name}
                summaryLabel="Excluir projeto"
                description="Todos os dados vinculados a este projeto serão removidos permanentemente. O autor e o horário desta ação permanecerão no log imutável."
              />
            </article>
          </aside>
        </section>
      )}

      {activeTab === "entregas" && (
        <section className="detail-two-column wide-left">
          <article className="panel detail-panel">
            <div className="panel-heading"><div><span className="panel-icon teal"><CheckCircle2 size={18} /></span><div><h2>Checklist</h2><p>{completed} de {detail.checklist.length} itens concluídos</p></div></div><span className="completion-pill">{checklistPercent}%</span></div>
            <div className="checklist-progress"><span style={{ width: `${checklistPercent}%` }} /></div>
            <div className="detail-checklist">
              {detail.checklist.map((item) => (
                <div className={`checklist-row ${item.completed ? "completed" : ""}`} key={item.id}>
                  <form action={toggleChecklist} className="checklist-toggle">
                    <input type="hidden" name="item_id" value={item.id} />
                    <input type="hidden" name="completed" value={String(!item.completed)} />
                    <button type="submit" aria-label={item.completed ? `Reabrir ${item.title}` : `Concluir ${item.title}`}>
                      {item.completed ? <Check size={15} /> : <Circle size={15} />}
                    </button>
                  </form>
                  <span><strong>{item.title}</strong>{item.description && <small>{item.description}</small>}</span>
                  <div className="checklist-row-actions">
                    {item.completed && <em>Concluído</em>}
                    <DeleteActionForm action={deleteChecklistItem} itemLabel={item.title}>
                      <input type="hidden" name="item_id" value={item.id} />
                    </DeleteActionForm>
                  </div>
                </div>
              ))}
              {!detail.checklist.length && <EmptyState text="O checklist ainda está vazio." />}
            </div>
            <form action={addChecklist} className="inline-create-form">
              <label className="form-field"><span>Novo item</span><input className="input" name="title" required placeholder="Descreva uma entrega verificável" /></label>
              <button className="button button-secondary" type="submit"><Plus size={15} /> Adicionar</button>
            </form>
          </article>

          <aside className="detail-side-stack">
            <article className="panel detail-panel">
              <div className="panel-heading"><div><span className="panel-icon amber"><CalendarDays size={18} /></span><div><h2>Prazos</h2><p>Alertas D-7, D-2 e no dia</p></div></div></div>
              <div className="deadline-list">
                {detail.deadlines.map((deadline) => (
                  <div className={`deadline-row ${deadline.state}`} key={deadline.id}>
                    <span className="deadline-icon"><CalendarDays size={15} /></span>
                    <div><strong>{deadline.title}</strong><small>{kindLabels[deadline.kind]} · {formatDateBR(deadline.dueDate)}{deadline.dueTime ? ` às ${deadline.dueTime.slice(0, 5)}` : ""}</small></div>
                    <div className="deadline-actions">
                      <span className="deadline-state">{deadline.state === "completed" ? "Concluído" : deadline.state === "canceled" ? "Cancelado" : formatDeadlineLabel(deadline.dueDate, now)}</span>
                      <div className="deadline-command-row">
                        <div className="deadline-state-actions">
                          <form action={setDeadlineState}><input type="hidden" name="deadline_id" value={deadline.id} /><input type="hidden" name="state" value={deadline.state === "open" ? "completed" : "open"} /><button type="submit">{deadline.state === "open" ? "Concluir" : "Reabrir"}</button></form>
                          {deadline.state === "open" && <form action={setDeadlineState}><input type="hidden" name="deadline_id" value={deadline.id} /><input type="hidden" name="state" value="canceled" /><button type="submit">Cancelar</button></form>}
                        </div>
                        <DeleteActionForm action={deleteDeadline} itemLabel={deadline.title}>
                          <input type="hidden" name="deadline_id" value={deadline.id} />
                        </DeleteActionForm>
                      </div>
                    </div>
                  </div>
                ))}
                {!detail.deadlines.length && <EmptyState text="Nenhum prazo cadastrado." />}
              </div>
            </article>
            <form action={addDeadline} className="panel compact-create-card">
              <h3><Plus size={15} /> Novo prazo</h3>
              <label className="form-field"><span>Título</span><input className="input" name="title" required placeholder="Ex.: Aprovação final" /></label>
              <div className="form-grid two">
                <label className="form-field"><span>Data</span><input className="input" type="date" name="due_date" required /></label>
                <label className="form-field"><span>Horário opcional</span><input className="input" type="time" name="due_time" /></label>
              </div>
              <label className="form-field"><span>Tipo</span><select className="input" name="kind" defaultValue="delivery">{Object.entries(kindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="simple-check"><input type="checkbox" name="sync_enabled" defaultChecked /> Enviar ao Google Agenda</label>
              <button className="button button-primary button-block" type="submit">Cadastrar prazo</button>
            </form>
          </aside>
        </section>
      )}

      {activeTab === "links" && (
        <section className="detail-two-column wide-left">
          <article className="panel detail-panel">
            <div className="panel-heading"><div><span className="panel-icon blue"><Link2 size={18} /></span><div><h2>Links e repositórios</h2><p>Atalhos seguros; nunca salve senhas aqui</p></div></div></div>
            <div className="project-resource-grid">
              {detail.resources.map((resource) => (
                <article className="project-resource-card" key={resource.id}>
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    <span className={`resource-type-icon ${resource.type}`}>{resource.type === "github" ? <Code2 size={18} /> : <Link2 size={18} />}</span>
                    <span><small>{resourceLabels[resource.type]}</small><strong>{resource.label}</strong><em>{new URL(resource.url).hostname}</em></span>
                    <ExternalLink size={15} />
                  </a>
                  <DeleteActionForm action={deleteResource} itemLabel={resource.label}>
                    <input type="hidden" name="resource_id" value={resource.id} />
                  </DeleteActionForm>
                </article>
              ))}
              {!detail.resources.length && <EmptyState text="Nenhum link cadastrado." />}
            </div>
            {missingResources.length > 0 && (
              <div className="missing-resources"><AlertTriangle size={16} /><p><strong>Recursos esperados pelo modelo:</strong> {missingResources.map((type) => resourceLabels[type]).join(", ")}.</p></div>
            )}
          </article>
          <form action={addResource} className="panel compact-create-card">
            <h3><Plus size={15} /> Adicionar recurso</h3>
            <label className="form-field"><span>Tipo</span><select className="input" name="resource_type" defaultValue="production">{Object.entries(resourceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="form-field"><span>Nome do link</span><input className="input" name="label" required placeholder="Ex.: Site publicado" /></label>
            <label className="form-field"><span>URL completa</span><input className="input" name="url" type="url" required placeholder="https://" /></label>
            <p className="form-security-note"><LockKeyhole size={14} /> Somente links. Credenciais devem permanecer no cofre.</p>
            <button className="button button-primary button-block" type="submit">Salvar recurso</button>
          </form>
        </section>
      )}

      {activeTab === "tecnologias" && (
        <section className="detail-two-column wide-left">
          <article className="panel detail-panel">
            <div className="panel-heading">
              <div><span className="panel-icon violet"><Boxes size={18} /></span><div><h2>Stack do projeto</h2><p>Tecnologias, serviços técnicos e ferramentas de criação</p></div></div>
              {(context.role === "owner" || context.role === "admin") && <Link href="/configuracoes/fluxos">Gerenciar catálogo</Link>}
            </div>
            <div className="project-technology-grid">
              {detail.technologies.map((technology) => (
                <article key={technology.id}>
                  <span className="technology-mark" style={{ backgroundColor: technology.color }}>{technology.name.slice(0, 1)}</span>
                  <div><small>{technologyCategoryLabels[technology.category]}</small><strong>{technology.name}</strong>{technology.websiteUrl && <a href={technology.websiteUrl} target="_blank" rel="noreferrer">Site oficial <ExternalLink size={12} /></a>}</div>
                  <form action={detachTechnology}>
                    <input type="hidden" name="technology_id" value={technology.id} />
                    <button type="submit" aria-label={`Remover ${technology.name} do projeto`}>Remover</button>
                  </form>
                </article>
              ))}
              {!detail.technologies.length && <EmptyState text="Nenhuma tecnologia vinculada. Use o formulário ao lado para documentar a stack." />}
            </div>
          </article>
          <form action={attachTechnology} className="panel compact-create-card">
            <h3><Plus size={15} /> Vincular tecnologia</h3>
            <label className="form-field"><span>Tecnologia</span><select className="input" name="technology_id" defaultValue="" required><option value="" disabled>Selecione no catálogo</option>{availableTechnologies.map((technology) => <option value={technology.id} key={technology.id}>{technology.name} · {technologyCategoryLabels[technology.category]}</option>)}</select></label>
            <p className="form-security-note"><Boxes size={14} /> A stack ajuda a localizar projetos semelhantes e orientar manutenção.</p>
            <button className="button button-primary button-block" type="submit" disabled={!availableTechnologies.length}>Vincular ao projeto</button>
            {!availableTechnologies.length && <p className="muted-copy">Todas as tecnologias ativas já estão vinculadas.</p>}
          </form>
        </section>
      )}

      {activeTab === "financeiro" && (
        canSeeFinance(context.role) ? (
          <section className="detail-two-column wide-left">
            <div className="detail-side-stack">
              <form action={updateFinance} className="panel detail-panel">
                <div className="panel-heading"><div><span className="panel-icon teal"><CircleDollarSign size={18} /></span><div><h2>Condições comerciais</h2><p>Visível apenas para owner e admin</p></div></div></div>
                <div className="form-grid two">
                  <label className="form-field"><span>Valor do projeto (R$)</span><input className="input" type="number" min="0" step="0.01" name="project_value" defaultValue={detail.terms?.projectValueCents ? detail.terms.projectValueCents / 100 : ""} placeholder="0,00" /></label>
                  <label className="form-field"><span>Mensalidade (R$)</span><input className="input" type="number" min="0" step="0.01" name="monthly_revenue" defaultValue={detail.terms?.maintenanceFeeCents ? detail.terms.maintenanceFeeCents / 100 : ""} placeholder="0,00" /></label>
                  <label className="form-field"><span>Ciclo</span><select className="input" name="billing_cycle" defaultValue={detail.terms?.maintenanceBillingCycle ?? "monthly"}><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option><option value="annual">Anual</option></select></label>
                  <label className="form-field"><span>Status da manutenção</span><select className="input" name="maintenance_status" defaultValue={detail.terms?.maintenanceStatus ?? "planned"}><option value="planned">Planejada</option><option value="active">Ativa</option><option value="paused">Pausada</option><option value="ended">Encerrada</option></select></label>
                  <label className="form-field"><span>Pagamento do projeto</span><select className="input" name="payment_status" defaultValue="pending"><option value="pending">Pendente</option><option value="partial">Parcial</option><option value="paid">Pago</option><option value="overdue">Atrasado</option><option value="waived">Dispensado</option></select></label>
                  <label className="form-field full"><span>Observações</span><textarea className="input" name="notes" defaultValue={detail.terms?.notes ?? ""} /></label>
                </div>
                <div className="form-actions"><button className="button button-primary" type="submit"><Save size={15} /> Salvar condições</button></div>
              </form>
              {detail.terms && (
                <article className="panel compact-danger-card">
                  <DeleteActionForm
                    action={deleteCommercialTerms}
                    className="danger-zone"
                    itemLabel="as condições comerciais"
                    description="Valores, mensalidade, status e observações comerciais serão removidos deste projeto. A exclusão permanecerá no log imutável."
                  />
                </article>
              )}
              <article className="panel detail-panel">
                <div className="panel-heading"><div><span className="panel-icon blue"><WalletCards size={18} /></span><div><h2>Assinaturas vinculadas</h2><p>Receita e custos continuam separados</p></div></div></div>
                <div className="project-subscriptions">
                  {detail.subscriptions.map((subscription) => (
                    <div key={subscription.id}>
                      <span className="subscription-logo">{subscription.serviceName.slice(0, 1)}</span>
                      <div><strong>{subscription.serviceName}</strong><small>{subscription.planName ?? "Plano não informado"} · {subscription.renewalLabel}</small></div>
                      <span className="subscription-value"><strong>{formatCurrencyBRL(subscription.monthlyCents, { showCents: false })}</strong><small>equiv. mensal</small></span>
                      <details className="subscription-manage">
                        <summary><Settings2 size={13} /> Gerenciar</summary>
                        <div>
                          <form action={rescheduleSubscription} className="subscription-reschedule"><input type="hidden" name="subscription_id" value={subscription.id} /><label className="form-field"><span>Próxima renovação</span><input className="input" type="date" name="renewal_date" defaultValue={subscription.renewalDate} required /></label><button className="button button-secondary" type="submit">Atualizar data</button></form>
                          <form action={setSubscriptionStatus} className="subscription-status-actions"><input type="hidden" name="subscription_id" value={subscription.id} /><button name="status" value={subscription.status === "active" ? "paused" : "active"} type="submit">{subscription.status === "active" ? "Pausar" : "Reativar"}</button>{subscription.status !== "canceled" && <button className="danger-link" name="status" value="canceled" type="submit">Encerrar</button>}</form>
                          <DeleteActionForm
                            action={deleteSubscription}
                            itemLabel={subscription.serviceName}
                            description="A assinatura será excluída do sistema e removida do calendário quando houver uma renovação sincronizada."
                          >
                            <input type="hidden" name="subscription_id" value={subscription.id} />
                          </DeleteActionForm>
                        </div>
                      </details>
                    </div>
                  ))}
                  {!detail.subscriptions.length && <EmptyState text="Nenhuma assinatura vinculada. Os valores da Náutica permanecem vazios até o cadastro real." />}
                </div>
              </article>
            </div>
            <form action={addSubscription} className="panel compact-create-card subscription-create-card">
              <h3><Plus size={15} /> Nova assinatura</h3>
              <label className="form-field"><span>Serviço</span><input className="input" name="service_name" required placeholder="Ex.: Hostinger" /></label>
              <label className="form-field"><span>Plano</span><input className="input" name="plan_name" placeholder="Opcional" /></label>
              <div className="form-grid two">
                <label className="form-field"><span>Categoria</span><select className="input" name="category" defaultValue="hosting"><option value="domain">Domínio</option><option value="hosting">Hospedagem</option><option value="email">E-mail</option><option value="video">Vídeo</option><option value="software">Software</option><option value="other">Outro</option></select></label>
                <label className="form-field"><span>Ciclo</span><select className="input" name="billing_cycle" defaultValue="annual"><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option><option value="annual">Anual</option><option value="biennial">Bienal</option></select></label>
              </div>
              <label className="form-field"><span>Próxima renovação</span><input className="input" type="date" name="renewal_date" required /></label>
              <div className="form-grid two">
                <label className="form-field"><span>Valor do ciclo (R$)</span><input className="input" type="number" min="0" step="0.01" name="amount" placeholder="0,00" /></label>
                <label className="form-field"><span>Pagador</span><select className="input" name="payer" defaultValue="agency"><option value="agency">Agência</option><option value="client">Cliente</option></select></label>
              </div>
              <label className="form-field"><span>Referência no cofre</span><input className="input" name="vault_reference" placeholder="Ex.: 1Password / Hostinger Náutica" /></label>
              <label className="simple-check"><input type="checkbox" name="auto_renew" /> Renovação automática</label>
              <button className="button button-primary button-block" type="submit">Cadastrar assinatura</button>
            </form>
          </section>
        ) : (
          <section className="detail-two-column wide-left">
            <article className="panel detail-panel">
              <div className="panel-heading"><div><span className="panel-icon blue"><WalletCards size={18} /></span><div><h2>Serviços vinculados</h2><p>Informações operacionais sem valores</p></div></div></div>
              <div className="operational-subscriptions">
                {detail.subscriptions.map((subscription) => <div key={subscription.id}><span className="subscription-logo">{subscription.serviceName.slice(0, 1)}</span><div><strong>{subscription.serviceName}</strong><small>{subscription.planName ?? "Plano não informado"}</small></div><span>{subscription.renewalLabel}</span></div>)}
                {!detail.subscriptions.length && <EmptyState text="Nenhum serviço vinculado a este projeto." />}
              </div>
            </article>
            <div className="restricted-page inline-restricted"><span><LockKeyhole size={28} /></span><h2>Valores protegidos</h2><p>Seu perfil acompanha serviços e renovações, mas somente proprietários e administradores acessam custos, receita e margem.</p></div>
          </section>
        )
      )}

      {activeTab === "historico" && (
        <section className="panel detail-panel history-panel">
          <div className="panel-heading"><div><span className="panel-icon blue"><History size={18} /></span><div><h2>Histórico do projeto</h2><p>Registro cronológico das mudanças importantes</p></div></div></div>
          <div className="project-history">
            {detail.activity.map((entry) => {
              const actor = data.members.find((member) => member.id === entry.actorId);
              return <div key={entry.id}><span className="history-marker" /><div><strong>{entry.summary}</strong><p>{actor?.name ?? "Sistema"} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(entry.createdAt))}</p></div></div>;
            })}
            {!detail.activity.length && <EmptyState text="Ainda não há atividades registradas." />}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="detail-empty"><Circle size={13} /><span>{text}</span></div>;
}
