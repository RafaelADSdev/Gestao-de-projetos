import Link from "next/link";
import { ArrowUpRight, CalendarCheck, Camera, CheckCircle2, Clock3, GitBranch, History, KeyRound, Mail, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar/config";
import { GOOGLE_CALENDAR_NAME } from "@/lib/google-calendar/types";

export default async function SettingsPage() {
  const context = await requireAuthContext();
  const { data } = await loadAgencyData(context);
  const connection = data.calendarConnections[0] ?? null;
  const connected = connection?.status === "connected";
  const canManageCalendar = context.role === "owner" || context.role === "admin";
  const calendarConfigured = isGoogleCalendarConfigured();
  return (
    <>
      <header className="page-heading"><div><span className="eyebrow">Administração</span><h1>Configurações</h1><p>Equipe, segurança, integrações e preferências do workspace.</p></div></header>
      <section className="settings-layout">
        <div className="settings-main">
          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon blue"><UsersRound size={18} /></span><div><h2>Equipe e acessos</h2><p>Quem pode entrar e o que cada perfil enxerga</p></div></div>{context.role === "owner" ? <Link className="button button-secondary" href="/configuracoes/acessos"><UserCog size={15} /> Gerenciar</Link> : <span className="settings-helper">Supabase Auth + PIN</span>}</div>
            <div className="member-list">{data.members.map((member) => <div className="member-row" key={member.id}><ProfileAvatar className="entity-avatar" name={member.name} src={member.avatarUrl} size={32} /><div><strong>{member.name}</strong><span><Mail size={11} />{member.email}</span></div><span className={`role-badge ${member.role}`}>{member.role === "owner" ? "Proprietário" : member.role === "admin" ? "Administrador" : "Membro"}</span><span className={`active-member ${member.active ? "" : "suspended"}`}><span />{member.active ? "Ativo" : "Suspenso"}</span></div>)}</div>
          </article>
          <Link href="/configuracoes/perfil" className="panel settings-card settings-link-card">
            <span className="panel-icon blue"><Camera size={18} /></span>
            <span><strong>Meu perfil e PIN</strong><small>Escolha sua foto, atualize o nome completo e altere seu PIN de acesso</small></span>
            <ArrowUpRight size={17} />
          </Link>
          {context.role === "owner" && (
            <Link href="/configuracoes/acessos" className="panel settings-card settings-link-card">
              <span className="panel-icon violet"><UserCog size={18} /></span>
              <span><strong>Gestão de acessos</strong><small>{data.members.filter((member) => member.active).length} ativo(s) · criação, papéis, suspensão, PIN e exclusão</small></span>
              <ArrowUpRight size={17} />
            </Link>
          )}
          {canManageCalendar && (
            <Link href="/configuracoes/fluxos" className="panel settings-card settings-link-card">
              <span className="panel-icon violet"><GitBranch size={18} /></span>
              <span><strong>Fluxos, sprints e tecnologias</strong><small>{data.workflows.filter((workflow) => !workflow.archivedAt).length} fluxos · {data.sprints.filter((sprint) => sprint.status === "active").length} sprint ativa · {data.technologies.filter((technology) => !technology.archivedAt).length} tecnologias</small></span>
              <ArrowUpRight size={17} />
            </Link>
          )}
          {canManageCalendar && (
            <Link href="/configuracoes/log" className="panel settings-card settings-link-card">
              <span className="panel-icon teal"><History size={18} /></span>
              <span><strong>Log de auditoria</strong><small>{data.auditLog.length} evento(s) carregado(s) · criação, edição e exclusão · somente leitura</small></span>
              <ArrowUpRight size={17} />
            </Link>
          )}
          <article className="panel settings-card">
            <div className="panel-heading"><div><span className="panel-icon teal"><CalendarCheck size={18} /></span><div><h2>Google Agenda</h2><p>Calendário dedicado aos prazos e renovações</p></div></div></div>
            <div className="integration-row"><div className="integration-logo">31</div><div><strong>{GOOGLE_CALENDAR_NAME}</strong><p>{connected ? connection.accountEmail ? `Conectado a ${connection.accountEmail}` : "Conta Google autorizada com escopo mínimo" : canManageCalendar ? calendarConfigured ? "Nenhuma conta conectada" : "Falta Client ID e Secret do OAuth do Google Calendar" : "Gerenciado por administradores"}</p></div><span className={`integration-status ${connected ? "connected" : ""}`}>{connected ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{connected ? "Conectado" : "Pendente"}</span>{!connected && canManageCalendar && (context.demo || !calendarConfigured ? <span className="button button-secondary disabled-button" aria-disabled="true">{calendarConfigured ? "Após configurar" : "Falta o OAuth"}</span> : <a className="button button-primary" href="/api/google-calendar/connect">Conectar</a>)}</div>
          </article>
        </div>
        <aside className="settings-side">
          <article className="panel security-card"><span className="security-hero"><ShieldCheck size={25} /></span><h2>Segurança por padrão</h2><ul><li><CheckCircle2 size={14} />RLS separa cada workspace</li><li><CheckCircle2 size={14} />Financeiro protegido por papel</li><li><CheckCircle2 size={14} />Log automático e imutável</li><li><CheckCircle2 size={14} />Tokens criptografados no servidor</li><li><CheckCircle2 size={14} />Nenhuma senha de cliente armazenada</li></ul></article>
          <article className="panel workspace-settings"><h2>Workspace</h2><label className="form-field"><span>Nome</span><input className="input" value={context.workspaceName} readOnly /></label><label className="form-field"><span>Fuso</span><input className="input" value="America/Sao_Paulo" readOnly /></label><label className="form-field"><span>Moeda</span><input className="input" value="BRL — Real brasileiro" readOnly /></label></article>
          <div className="vault-note"><KeyRound size={17} /><p><strong>Credenciais ficam fora daqui.</strong> Use apenas referências para o cofre de senhas da equipe.</p></div>
        </aside>
      </section>
    </>
  );
}
