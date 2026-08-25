"use client";

import { useMemo, useState } from "react";
import { Building2, Mail, Pencil, Phone, Plus, Search } from "lucide-react";
import { deleteClientAction } from "@/app/(dashboard)/actions";
import { ClientFormModal, type ClientFormData } from "@/components/clients/client-form-modal";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { ProfileAvatar } from "@/components/profile-avatar";
import { formatCurrencyBRL } from "@/lib/domain";

type ClientRow = ClientFormData & {
  recurringRevenueCents: number;
  nextProject: string | null;
};

export function ClientsManager({
  clients,
  initialQuery = "",
}: {
  clients: ClientRow[];
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientFormData | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.companyName ?? ""} ${client.contactName ?? ""} ${client.email ?? ""} ${client.notes ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [clients, query]);

  function openCreate() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client: ClientRow) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingClient(null);
  }

  return (
    <>
      <header className="page-heading page-heading-actions">
        <div>
          <span className="eyebrow">Relacionamentos</span>
          <h1>Clientes</h1>
          <p>Contatos, projetos ativos e receita recorrente por cliente.</p>
        </div>
        <button type="button" className="button button-primary" onClick={openCreate}>
          <Plus size={17} /> Novo cliente
        </button>
      </header>

      <section className="clients-layout clients-layout-single">
        <div className="panel clients-panel">
          <div className="list-toolbar clients-toolbar">
            <label className="toolbar-search">
              <Search size={16} />
              <span className="sr-only">Buscar cliente</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente, empresa ou contato…"
              />
            </label>
            <span>{filtered.length} clientes</span>
          </div>

          <div className="clients-table-wrap">
            <table className="data-table clients-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Projetos</th>
                  <th>Recorrência</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <div className="client-cell">
                        <ProfileAvatar className="entity-avatar" name={client.name} src={client.avatarUrl} size={36} />
                        <span>
                          <strong>{client.name}</strong>
                          <small>{client.companyName ?? "Pessoa física"}</small>
                          {client.notes && <em className="client-notes-preview">{client.notes}</em>}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="contact-stack">
                        {client.contactName && <span><Building2 size={12} />{client.contactName}</span>}
                        {client.email && <span><Mail size={12} />{client.email}</span>}
                        {client.phone && <span><Phone size={12} />{client.phone}</span>}
                        {!client.contactName && !client.email && !client.phone && <small>Sem contato</small>}
                      </div>
                    </td>
                    <td>
                      <span className="count-badge">{client.activeProjects}</span>
                      <small className="table-subline">{client.nextProject ?? "Nenhum ativo"}</small>
                    </td>
                    <td>
                      <strong>{formatCurrencyBRL(client.recurringRevenueCents, { showCents: false })}</strong>
                      <small className="table-subline">por mês</small>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button type="button" className="button button-secondary table-edit" onClick={() => openEdit(client)}>
                          <Pencil size={14} /> Editar
                        </button>
                        <DeleteActionForm
                          action={deleteClientAction.bind(null, client.id)}
                          className="table-delete"
                          itemLabel={client.name}
                          description={client.activeProjects > 0
                            ? "Antes de excluir este cliente, exclua os projetos vinculados. A tentativa será bloqueada enquanto houver dependências."
                            : "O cliente será removido permanentemente. A autoria e o horário continuarão disponíveis no log de auditoria."}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">Nenhum cliente encontrado.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ClientFormModal open={modalOpen} onClose={closeModal} client={editingClient} />
    </>
  );
}
