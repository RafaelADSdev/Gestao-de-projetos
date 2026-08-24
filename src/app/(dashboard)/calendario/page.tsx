import { AlertCircle, CalendarCheck, CalendarDays, CheckCircle2, Clock3, ExternalLink, RefreshCw } from "lucide-react";
import { requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildAgenda } from "@/lib/data/view-models";
import { GOOGLE_CALENDAR_NAME } from "@/lib/google-calendar/types";

export default async function CalendarPage() {
  const context = await requireAuthContext();
  const { data, now } = await loadAgencyData(context);
  const agenda = buildAgenda(data, now, 50);
  const connection = data.calendarConnections[0] ?? null;
  const connected = connection?.status === "connected";
  const canManageCalendar = context.role === "owner" || context.role === "admin";
  const pendingCount = data.calendarSyncQueue.filter((job) => job.state === "pending" || job.state === "processing").length;
  const failedCount = data.calendarSyncQueue.filter((job) => job.state === "failed").length;
  return (
    <>
      <header className="page-heading page-heading-actions"><div><span className="eyebrow">Prazos sincronizados</span><h1>Calendário</h1><p>Entregas e renovações com o sistema como fonte de verdade.</p></div><a className="button button-secondary" href="https://calendar.google.com" target="_blank" rel="noreferrer">Abrir Google Agenda <ExternalLink size={15} /></a></header>
      <section className="calendar-layout">
        <div className="panel calendar-timeline">
          <div className="panel-heading"><div><span className="panel-icon blue"><CalendarDays size={18} /></span><div><h2>Próximos eventos</h2><p>Fuso America/Sao_Paulo</p></div></div><span className="sync-legend"><span /> Sincronização unidirecional</span></div>
          <div className="timeline-list">
            {agenda.map((item) => {
              const mapping = data.calendarEventMappings.find((entry) => entry.sourceId === item.id);
              const job = data.calendarSyncQueue.find((entry) => entry.sourceId === item.id && entry.state !== "completed");
              const syncState = !connected ? "disconnected" : mapping?.syncState === "synced" ? "synced" : mapping?.syncState === "failed" || job?.state === "failed" ? "failed" : "pending";
              return <div className="timeline-item" key={item.id}>
              <div className={`timeline-date ${item.tone}`}><strong>{item.date}</strong><span>{item.month}</span></div>
              <span className="timeline-line" />
              <div><span className={`agenda-label ${item.tone}`}>{item.label}</span><h3>{item.title}</h3><p>{item.project}</p></div>
              <span className={`sync-state ${syncState}`}>{syncState === "synced" ? <CheckCircle2 size={13} /> : syncState === "failed" ? <AlertCircle size={13} /> : <Clock3 size={13} />}{syncState === "synced" ? "Sincronizado" : syncState === "failed" ? "Falhou" : connected ? "Pendente" : "Aguardando conexão"}</span>
            </div>})}
            {!agenda.length && <div className="calendar-empty"><CalendarCheck size={20} /><strong>Nenhum evento próximo</strong><span>Cadastre um prazo ou assinatura dentro de um projeto.</span></div>}
          </div>
        </div>
        <aside className="calendar-side">
          <article className="panel connection-card">
            <span className={`connection-icon ${connected ? "connected" : ""}`}><CalendarCheck size={24} /></span>
            <h2>{connected ? "Google Agenda conectado" : canManageCalendar ? "Conecte o Google Agenda" : "Agenda administrada pela equipe"}</h2>
            <p>{connected ? `Eventos enviados para ${connection.calendarName}. ${pendingCount} pendente(s) e ${failedCount} falha(s).` : canManageCalendar ? `Criaremos um calendário separado chamado “${GOOGLE_CALENDAR_NAME}”.` : "Você acompanha os prazos aqui; um administrador cuida da conexão e dos reenvios."}</p>
            {connected ? <form action="/api/google-calendar/sync" method="post"><button className="button button-secondary button-block" type="submit"><RefreshCw size={15} /> Sincronizar agora</button></form> : context.demo || !canManageCalendar ? <span className="button button-secondary button-block disabled-button" aria-disabled="true">{canManageCalendar ? "Disponível após configurar" : "Somente administradores"}</span> : <a className="button button-primary button-block" href="/api/google-calendar/connect">Conectar conta Google</a>}
            <small>Somente proprietários e administradores podem alterar esta integração.</small>
          </article>
          <article className="panel reminder-card"><h3>Alertas configurados</h3><div><span><CalendarDays size={15} />Prazos</span><strong>D-7 · D-2 · no dia</strong></div><div><span><RefreshCw size={15} />Renovações</span><strong>D-30 · D-7 · D-1</strong></div></article>
          {!connected && canManageCalendar && <div className="info-callout"><AlertCircle size={17} /><p>Em modo de teste externo, o token do Google pode expirar em sete dias. Publique a tela de consentimento para uso contínuo.</p></div>}
        </aside>
      </section>
    </>
  );
}
