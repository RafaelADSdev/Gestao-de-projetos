import type { CSSProperties } from "react";
import Link from "next/link";
import {
  Clock3,
  History,
  ListFilter,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { AuditLogAction, AuditLogEntry } from "@/lib/domain";

export type AuditLogFilters = {
  q: string;
  action: string;
  entity: string;
  actor: string;
};

type AuditLogViewProps = {
  entries: readonly AuditLogEntry[];
  filters: AuditLogFilters;
};

const timelineGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
};

const timelineCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const metadataRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 6,
};

const changedFieldsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  maxWidth: 320,
};

const readonlyNoticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  margin: "14px 0",
};

const ACTION_LABELS: Record<AuditLogAction, string> = {
  created: "Criação",
  updated: "Edição",
  deleted: "Exclusão",
};

function actionStyle(action: AuditLogAction): CSSProperties {
  if (action === "created") return { color: "#0B7A6E", background: "#E6F8F5" };
  if (action === "deleted") return { color: "#B43A3A", background: "#FDECEC" };
  return { color: "#315FCA", background: "#EAF0FF" };
}

function ActionIcon({ action }: { action: AuditLogAction }) {
  if (action === "created") return <Plus size={13} aria-hidden="true" />;
  if (action === "deleted") return <Trash2 size={13} aria-hidden="true" />;
  return <Pencil size={13} aria-hidden="true" />;
}

function ActionBadge({ action }: { action: AuditLogAction }) {
  return (
    <span className="role-badge" style={actionStyle(action)}>
      <ActionIcon action={action} />
      {ACTION_LABELS[action]}
    </span>
  );
}

function actorKey(entry: AuditLogEntry): string {
  return (entry.actorId ?? entry.actorEmail) || entry.actorName;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function entityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    board_column: "Etapa",
    board_columns: "Etapa",
    checklist_item: "Checklist",
    checklist_items: "Checklist",
    client: "Cliente",
    clients: "Cliente",
    commercial_terms: "Condição comercial",
    deadline: "Prazo",
    deadlines: "Prazo",
    project: "Projeto",
    projects: "Projeto",
    project_subscriptions: "Vínculo de assinatura",
    project_technologies: "Vínculo de tecnologia",
    project_templates: "Modelo de projeto",
    project_resource: "Recurso",
    project_resources: "Recurso",
    sprint: "Sprint",
    sprints: "Sprint",
    subscription: "Assinatura",
    subscriptions: "Assinatura",
    subscription_financials: "Custo de assinatura",
    technology: "Tecnologia",
    technologies: "Tecnologia",
    workflow: "Fluxo",
    workflows: "Fluxo",
    workspace_members: "Integrante",
    calendar_connections: "Conexão do calendário",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    avatar_url: "foto de perfil",
    auto_renew: "renovação automática",
    blocker_reason: "motivo do bloqueio",
    board_column_id: "etapa",
    company_name: "razão social",
    contact_name: "contato",
    due_date: "data do prazo",
    end_date: "data final",
    full_name: "nome completo",
    name: "nome completo",
    next_action: "próxima ação",
    pin_changed_at: "PIN alterado",
    reminder_days: "alertas",
    responsible_id: "responsável",
    role: "papel",
    sprint_id: "sprint",
    start_date: "data inicial",
    status: "status de acesso",
    workflow_id: "fluxo",
  };
  return labels[field] ?? field.replaceAll("_", " ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function matchesFilters(entry: AuditLogEntry, filters: AuditLogFilters): boolean {
  const query = filters.q.trim().toLocaleLowerCase("pt-BR");
  const searchable = [
    entry.actorName,
    entry.actorEmail,
    entry.entityType,
    entityTypeLabel(entry.entityType),
    entry.entityLabel,
    entry.entityId,
    ...entry.changedFields,
  ].join(" ").toLocaleLowerCase("pt-BR");

  return (!query || searchable.includes(query))
    && (!filters.action || entry.action === filters.action)
    && (!filters.entity || entry.entityType === filters.entity)
    && (!filters.actor || actorKey(entry) === filters.actor);
}

export function AuditLogView({ entries, filters }: AuditLogViewProps) {
  const sorted = [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const filtered = sorted.filter((entry) => matchesFilters(entry, filters));
  const authors = [...new Map(sorted.map((entry) => [actorKey(entry), entry])).entries()]
    .sort(([, left], [, right]) => left.actorName.localeCompare(right.actorName, "pt-BR"));
  const entityTypes = [...new Set(sorted.map((entry) => entry.entityType))]
    .sort((left, right) => entityTypeLabel(left).localeCompare(entityTypeLabel(right), "pt-BR"));
  const updates = filtered.filter((entry) => entry.action === "updated").length;
  const deletions = filtered.filter((entry) => entry.action === "deleted").length;
  const activeAuthors = new Set(filtered.map(actorKey)).size;

  return (
    <>
      <div className="panel" style={readonlyNoticeStyle} role="note">
        <span className="panel-icon teal"><ShieldCheck size={18} /></span>
        <div>
          <strong>Histórico imutável e somente leitura</strong>
          <p style={{ margin: "4px 0 0", color: "#7A8498", fontSize: 10, lineHeight: 1.5 }}>
            Esta tela registra quem alterou cada item. Não existem controles para editar ou apagar eventos do log.
          </p>
        </div>
      </div>

      <div className="compact-stats" aria-label="Resumo do log filtrado">
        <div><strong>{filtered.length}</strong><span>eventos exibidos</span></div>
        <div><strong>{updates}</strong><span>edições</span></div>
        <div><strong>{deletions}</strong><span>exclusões</span></div>
        <div><strong>{activeAuthors}</strong><span>autores</span></div>
      </div>

      <form className="toolbar" action="/configuracoes/log" method="get" aria-label="Filtros do log">
        <label className="toolbar-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Buscar no log</span>
          <input name="q" defaultValue={filters.q} placeholder="Buscar registro, pessoa ou campo…" />
        </label>
        <label className="sr-only" htmlFor="audit-action">Ação</label>
        <select className="toolbar-button filter-select" id="audit-action" name="acao" defaultValue={filters.action}>
          <option value="">Todas as ações</option>
          <option value="created">Criações</option>
          <option value="updated">Edições</option>
          <option value="deleted">Exclusões</option>
        </select>
        <label className="sr-only" htmlFor="audit-entity">Entidade</label>
        <select className="toolbar-button filter-select" id="audit-entity" name="entidade" defaultValue={filters.entity}>
          <option value="">Todas as entidades</option>
          {entityTypes.map((type) => <option value={type} key={type}>{entityTypeLabel(type)}</option>)}
        </select>
        <label className="sr-only" htmlFor="audit-actor">Autor</label>
        <select className="toolbar-button filter-select" id="audit-actor" name="autor" defaultValue={filters.actor}>
          <option value="">Todos os autores</option>
          {authors.map(([key, entry]) => <option value={key} key={key}>{entry.actorName}</option>)}
        </select>
        <button className="button button-primary" type="submit"><ListFilter size={15} /> Aplicar</button>
        <Link className="button button-secondary" href="/configuracoes/log"><RotateCcw size={15} /> Limpar</Link>
      </form>

      <section className="panel" aria-labelledby="audit-table-title">
        <div className="panel-heading">
          <div>
            <span className="panel-icon blue"><History size={18} /></span>
            <div><h2 id="audit-table-title">Registros de auditoria</h2><p>Mais recentes primeiro · até 500 eventos</p></div>
          </div>
          <span className="settings-helper">{filtered.length} resultado(s)</span>
        </div>
        <div className="table-scroll" style={{ margin: "14px -17px -17px" }}>
          <table className="data-table">
            <thead><tr><th>Quando</th><th>Ação</th><th>Registro</th><th>Campos</th><th>Responsável</th></tr></thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td><span className="renewal-cell"><Clock3 size={13} />{formatDate(entry.createdAt)}</span></td>
                  <td><ActionBadge action={entry.action} /></td>
                  <td>
                    <strong>{entry.entityLabel}</strong>
                    <span className="table-subline">{entityTypeLabel(entry.entityType)} · {entry.entityId}</span>
                  </td>
                  <td>
                    {entry.changedFields.length ? (
                      <span style={changedFieldsStyle}>
                        {entry.changedFields.map((field) => <span className="role-badge" key={field}>{fieldLabel(field)}</span>)}
                      </span>
                    ) : <span className="table-subline">Sem campos aplicáveis</span>}
                  </td>
                  <td>
                    <span className="client-cell">
                      <span className="entity-avatar">{initials(entry.actorName)}</span>
                      <span><strong>{entry.actorName}</strong><small>{entry.actorEmail || "Conta sem e-mail"}</small></span>
                    </span>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={5}><div className="table-empty">Nenhum evento corresponde aos filtros informados.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {filtered.length > 0 && (
        <section style={{ marginTop: 20 }} aria-labelledby="audit-timeline-title">
          <div className="section-heading">
            <div><span className="eyebrow">Leitura rápida</span><h2 id="audit-timeline-title">Linha do tempo recente</h2></div>
            <span className="heading-status"><UsersRound size={14} /> Últimos {Math.min(6, filtered.length)} eventos filtrados</span>
          </div>
          <div style={timelineGridStyle}>
            {filtered.slice(0, 6).map((entry) => (
              <article className="panel" style={timelineCardStyle} key={`timeline-${entry.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <ActionBadge action={entry.action} />
                  <time className="table-subline" dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                </div>
                <div>
                  <strong>{entry.entityLabel}</strong>
                  <p style={{ margin: "4px 0 0", color: "#7E889B", fontSize: 9 }}>{entityTypeLabel(entry.entityType)}</p>
                </div>
                <div style={metadataRowStyle}>
                  <span className="entity-avatar">{initials(entry.actorName)}</span>
                  <span style={{ display: "grid" }}><strong style={{ fontSize: 9 }}>{entry.actorName}</strong><small>{entry.changedFields.length ? `${entry.changedFields.length} campo(s)` : "registro completo"}</small></span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
