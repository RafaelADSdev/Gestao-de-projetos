import { Building2, Mail, Phone, Plus, Search, UserRound } from "lucide-react";
import { createClientAction, deleteClientAction } from "@/app/(dashboard)/actions";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildClientList } from "@/lib/data/view-models";
import { formatCurrencyBRL } from "@/lib/domain";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const query = (await searchParams).q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const clients = buildClientList(data).filter((client) => !query || `${client.name} ${client.companyName ?? ""} ${client.email ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));

  async function create(formData: FormData) {
    "use server";
    await createClientAction(formData);
  }

  return (
    <>
      <header className="page-heading page-heading-actions"><div><span className="eyebrow">Relacionamentos</span><h1>Clientes</h1><p>Contatos, projetos ativos e receita recorrente por cliente.</p></div><a href="#novo-cliente" className="button button-primary"><Plus size={17} /> Novo cliente</a></header>
      <section className="clients-layout">
        <div className="panel clients-panel">
          <form className="list-toolbar" action="/clientes"><label><Search size={16} /><input name="q" defaultValue={query} placeholder="Buscar cliente…" /></label><button className="button button-secondary" type="submit">Buscar</button><span>{clients.length} clientes</span></form>
          <div className="clients-table-wrap">
            <table className="data-table clients-table">
              <thead><tr><th>Cliente</th><th>Contato</th><th>Projetos</th><th>Recorrência</th><th>Ações</th></tr></thead>
              <tbody>{clients.map((client) => <tr key={client.id}>
                <td><div className="client-cell"><span className="entity-avatar">{client.name.slice(0,2).toUpperCase()}</span><span><strong>{client.name}</strong><small>{client.companyName ?? "Pessoa física"}</small></span></div></td>
                <td><div className="contact-stack">{client.email && <span><Mail size={12} />{client.email}</span>}{client.phone && <span><Phone size={12} />{client.phone}</span>}{!client.email && !client.phone && <small>Sem contato</small>}</div></td>
                <td><span className="count-badge">{client.activeProjects}</span><small className="table-subline">{client.nextProject ?? "Nenhum ativo"}</small></td>
                <td><strong>{formatCurrencyBRL(client.recurringRevenueCents, { showCents: false })}</strong><small className="table-subline">por mês</small></td>
                <td>
                  <DeleteActionForm
                    action={deleteClientAction.bind(null, client.id)}
                    className="table-delete"
                    itemLabel={client.name}
                    description={client.activeProjects > 0
                      ? "Antes de excluir este cliente, exclua os projetos vinculados. A tentativa será bloqueada enquanto houver dependências."
                      : "O cliente será removido permanentemente. A autoria e o horário continuarão disponíveis no log de auditoria."}
                  />
                </td>
              </tr>)}{!clients.length && <tr><td colSpan={5}><div className="table-empty">Nenhum cliente encontrado.</div></td></tr>}</tbody>
            </table>
          </div>
        </div>
        <aside className="panel create-client-panel" id="novo-cliente">
          <div className="panel-heading"><div><span className="panel-icon blue"><UserRound size={18} /></span><div><h2>Novo cliente</h2><p>Cadastre o contato principal</p></div></div></div>
          <form action={create} className="stacked-form">
            <label className="form-field"><span>Nome curto</span><input className="input" name="name" required placeholder="Ex.: Aurora Cursos" /></label>
            <label className="form-field"><span>Razão social ou empresa</span><input className="input" name="company_name" placeholder="Opcional" /></label>
            <label className="form-field"><span>E-mail</span><input className="input" name="email" type="email" placeholder="contato@cliente.com" /></label>
            <label className="form-field"><span>Telefone</span><input className="input" name="phone" placeholder="(00) 00000-0000" /></label>
            <label className="form-field"><span>Observações</span><textarea className="input" name="notes" placeholder="Preferências, aprovações e contexto" /></label>
            <button className="button button-primary button-block" type="submit"><Plus size={16} /> Cadastrar cliente</button>
          </form>
          <div className="tip-box"><Building2 size={16} /><p>Depois do cadastro, crie o primeiro projeto e vincule os contatos, prazos e links.</p></div>
        </aside>
      </section>
    </>
  );
}
