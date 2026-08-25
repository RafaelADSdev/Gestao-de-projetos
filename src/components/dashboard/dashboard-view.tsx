import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { WorkItemKanban } from "@/components/projects/work-item-kanban";
import type { BoardStageData, WorkItemCardData } from "@/components/projects/types";

export type DashboardMetric = {
  label: string;
  value: string;
  note: string;
  color: string;
  stageId: string;
};

export type AgendaItemView = {
  id: string;
  date: string;
  month: string;
  title: string;
  project: string;
  label: string;
  tone: "danger" | "warning" | "normal";
};

export type FinanceSummaryView = {
  monthlyRevenue: string;
  monthlyCost: string;
  margin: string;
  marginPercent: number;
};

export type ActivityView = { id: string; text: string; actor: string; when: string; tone: string };

export function DashboardView({
  name,
  dateLabel,
  metrics,
  stages,
  cards,
  agenda,
  finance,
  activity,
  showFinance,
}: {
  name: string;
  dateLabel: string;
  metrics: DashboardMetric[];
  stages: BoardStageData[];
  cards: WorkItemCardData[];
  agenda: AgendaItemView[];
  finance: FinanceSummaryView;
  activity: ActivityView[];
  showFinance: boolean;
}) {
  return (
    <>
      <header className="page-heading dashboard-heading">
        <div><span className="eyebrow">{dateLabel}</span><h1>Bom dia, {name.split(" ")[0]}.</h1><p>Aqui está o que precisa de atenção para a agência continuar andando.</p></div>
        <div className="heading-status"><span className="status-pulse" />Todos os sistemas operacionais</div>
      </header>

      <section className="metrics-grid stage-metrics-grid" aria-label="Cards por fase do Kanban">
        {metrics.map((metric) => (
          <Link href="/quadro" className="metric-card stage-metric-card" key={metric.stageId} style={{ color: metric.color }}>
            <span className="metric-icon stage-metric-icon"><span className="stage-dot" style={{ background: metric.color }} /></span>
            <div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></div>
            <ArrowRight className="metric-arrow" size={17} />
          </Link>
        ))}
      </section>

      <section className="content-section board-section">
        <div className="section-heading">
          <div><span className="eyebrow">Fluxo de trabalho</span><h2>Cards em execução</h2></div>
          <div className="section-actions"><span>{cards.length} no fluxo principal</span><Link href="/quadro">Abrir Kanban <ArrowRight size={15} /></Link></div>
        </div>
        <WorkItemKanban stages={stages} initialCards={cards} />
      </section>

      <section className="dashboard-lower-grid">
        <article className="panel agenda-panel">
          <div className="panel-heading"><div><span className="panel-icon blue"><CalendarClock size={18} /></span><div><h2>Próximos compromissos</h2><p>Prazos e renovações mais próximos</p></div></div><Link href="/calendario">Calendário <ExternalLink size={14} /></Link></div>
          <div className="agenda-list">
            {agenda.map((item) => <div className="agenda-row" key={item.id}>
              <div className={`date-block ${item.tone}`}><strong>{item.date}</strong><span>{item.month}</span></div>
              <div><strong>{item.title}</strong><span>{item.project}</span></div>
              <span className={`agenda-label ${item.tone}`}>{item.label}</span>
            </div>)}
            {!agenda.length && <div className="panel-empty">Nenhum prazo ou renovação próximo.</div>}
          </div>
        </article>

        {showFinance ? (
          <article className="panel finance-panel">
            <div className="panel-heading"><div><span className="panel-icon teal"><CircleDollarSign size={18} /></span><div><h2>Saúde recorrente</h2><p>Estimativa mensal da operação</p></div></div><Link href="/financeiro">Detalhes <ArrowRight size={14} /></Link></div>
            <div className="finance-number"><span>Margem estimada</span><strong>{finance.margin}</strong><small><TrendingUp size={14} /> {finance.marginPercent}% sobre a receita</small></div>
            <div className="finance-bars">
              <div><span><b>Receita recorrente</b><b>{finance.monthlyRevenue}</b></span><i><em style={{ width: "100%" }} /></i></div>
              <div><span><b>Custos recorrentes</b><b>{finance.monthlyCost}</b></span><i><em className="cost" style={{ width: `${Math.max(8, 100 - finance.marginPercent)}%` }} /></i></div>
            </div>
          </article>
        ) : (
          <article className="panel private-panel"><UsersRound size={25} /><h2>Financeiro protegido</h2><p>Valores de contratos, custos e margem aparecem somente para administradores.</p></article>
        )}

        <article className="panel activity-panel">
          <div className="panel-heading"><div><span className="panel-icon amber"><CheckCircle2 size={18} /></span><div><h2>Atividade recente</h2><p>O que mudou nos projetos</p></div></div></div>
          <div className="activity-list">
            {activity.map((item) => <div className="activity-row" key={item.id}><span className="activity-dot" style={{ background: item.tone }} /><div><p>{item.text}</p><span>{item.actor} · {item.when}</span></div></div>)}
            {!activity.length && <div className="panel-empty">As mudanças do projeto aparecerão aqui.</div>}
          </div>
        </article>
      </section>
    </>
  );
}
