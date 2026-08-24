import Link from "next/link";
import { ArrowLeft, CalendarDays, Check, ChevronRight, Layers3, Sparkles } from "lucide-react";
import { createProjectAction } from "@/app/(dashboard)/actions";
import { ProjectPlanningFields } from "@/components/projects/project-planning-fields";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { PROJECT_TEMPLATES } from "@/lib/domain";

export default async function NewProjectPage() {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const workflows = data.workflows.filter((workflow) => !workflow.archivedAt);
  const defaultWorkflow = workflows.find((workflow) => workflow.isDefault) ?? workflows[0];

  async function create(formData: FormData) {
    "use server";
    await createProjectAction(formData);
  }

  return (
    <div className="form-page">
      <Link href="/projetos" className="back-link"><ArrowLeft size={15} /> Voltar ao portfólio</Link>
      <header className="page-heading"><div><span className="eyebrow">Novo trabalho</span><h1>Criar projeto</h1><p>Defina o contexto, o fluxo e a tecnologia desde o primeiro dia.</p></div></header>
      <form action={create} className="project-form-layout">
        <section className="form-panel">
          <div className="form-panel-head"><span className="step-number">1</span><div><h2>Informações principais</h2><p>Identifique o projeto e quem cuida dele.</p></div></div>
          <div className="form-grid two">
            <label className="form-field full"><span>Nome do projeto</span><input className="input" name="name" required placeholder="Ex.: Site institucional 2026" /></label>
            <label className="form-field"><span>Cliente</span><select className="input" name="client_id" required defaultValue=""><option value="" disabled>Selecione um cliente</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
            <label className="form-field"><span>Responsável</span><select className="input" name="responsible_id" defaultValue={context.userId}>{data.members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label className="form-field"><span>Prazo de entrega</span><input className="input" type="date" name="due_date" /></label>
            <label className="form-field full"><span>Próxima ação</span><input className="input" name="next_action" placeholder="O passo concreto que faz o projeto avançar" /></label>
            <label className="form-field full"><span>Descrição</span><textarea className="input" name="description" placeholder="Escopo resumido, contexto e observações importantes" /></label>
            {defaultWorkflow && (
              <ProjectPlanningFields
                workflows={workflows.map((workflow) => ({ id: workflow.id, name: workflow.name, description: workflow.description, sprintEnabled: workflow.sprintEnabled }))}
                stages={data.boardStages.map((stage) => ({ id: stage.id, workflowId: stage.workflowId, name: stage.label }))}
                sprints={data.sprints.map((sprint) => ({ id: sprint.id, workflowId: sprint.workflowId, name: sprint.name, status: sprint.status }))}
                defaultWorkflowId={defaultWorkflow.id}
              />
            )}
            <fieldset className="technology-selector full">
              <legend>Tecnologias utilizadas</legend>
              <p>Selecione agora ou ajuste depois na página do projeto.</p>
              <div>
                {data.technologies.filter((technology) => !technology.archivedAt).map((technology) => (
                  <label key={technology.id}>
                    <input type="checkbox" name="technology_ids" value={technology.id} />
                    <i style={{ backgroundColor: technology.color }} />
                    <span><strong>{technology.name}</strong><small>{technology.category}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </section>
        <aside className="template-panel">
          <div className="form-panel-head"><span className="step-number"><Sparkles size={15} /></span><div><h2>Modelo do projeto</h2><p>O checklist será preparado automaticamente.</p></div></div>
          <div className="template-options">
            {PROJECT_TEMPLATES.map((template, index) => <label className="template-option" key={template.id}>
              <input type="radio" name="project_type" value={template.id} defaultChecked={index === 0} />
              <span className="template-icon">{template.id === "plataforma-cursos" ? <Layers3 size={18} /> : template.id === "manutencao" ? <CalendarDays size={18} /> : <Sparkles size={18} />}</span>
              <span><strong>{template.name}</strong><small>{template.description}</small><em><Check size={12} /> {template.checklist.length} itens sugeridos</em></span>
            </label>)}
          </div>
          <div className="form-submit-card"><p>Checklist, fluxo, sprint, tecnologias, links e financeiro poderão ser editados depois.</p><button className="button button-primary button-block" type="submit">Criar projeto <ChevronRight size={16} /></button></div>
        </aside>
      </form>
    </div>
  );
}
