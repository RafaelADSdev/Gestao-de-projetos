import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CircleDollarSign, CreditCard, LockKeyhole, TrendingUp, WalletCards } from "lucide-react";
import { deleteSubscriptionAction } from "@/app/(dashboard)/actions";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { canSeeFinance, requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildCostsByCategory, buildFinanceSummary, buildSubscriptions } from "@/lib/data/view-models";
import { formatCurrencyBRL } from "@/lib/domain";

const categoryNames: Record<string, string> = { domain: "Domínios", hosting: "Hospedagem", email: "E-mail", video: "Vídeo", software: "Software", other: "Outros" };

export default async function FinancePage() {
  const context = await requireAuthContext();
  if (!canSeeFinance(context.role)) return <RestrictedFinance />;
  const { data, now } = await loadAgencyData(context);
  const finance = buildFinanceSummary(data, now);
  const subscriptions = buildSubscriptions(data, now);
  const categories = buildCostsByCategory(data);
  const categoryEntries = Object.entries(categories).filter(([, value]) => value > 0).sort((a,b) => b[1]-a[1]);
  const categoryTotal = Object.values(categories).reduce((sum, amount) => sum + amount, 0);
  const projectValue = data.commercialTerms.reduce((sum, item) => sum + (item.projectValueCents ?? 0), 0);

  return (
    <>
      <header className="page-heading"><div><span className="eyebrow">Visão administrativa</span><h1>Financeiro</h1><p>Receita recorrente, custos operacionais e renovações sem virar um sistema de cobrança.</p></div></header>
      <section className="finance-kpis">
        <article><span className="finance-kpi-icon blue"><WalletCards size={19} /></span><div><span>Valor contratado</span><strong>{formatCurrencyBRL(projectValue, { showCents: false })}</strong><small>Projetos cadastrados</small></div></article>
        <article><span className="finance-kpi-icon teal"><ArrowUpRight size={19} /></span><div><span>Receita recorrente</span><strong>{finance.monthlyRevenue}</strong><small>Equivalente mensal</small></div></article>
        <article><span className="finance-kpi-icon amber"><ArrowDownRight size={19} /></span><div><span>Custos recorrentes</span><strong>{finance.monthlyCost}</strong><small>Pagos pela agência</small></div></article>
        <article className="primary"><span className="finance-kpi-icon"><TrendingUp size={19} /></span><div><span>Margem estimada</span><strong>{finance.margin}</strong><small>{finance.marginPercent}% da receita recorrente</small></div></article>
      </section>
      <section className="finance-layout">
        <article className="panel subscriptions-panel">
          <div className="panel-heading"><div><span className="panel-icon teal"><CreditCard size={18} /></span><div><h2>Assinaturas e renovações</h2><p>Custos recorrentes vinculados aos projetos</p></div></div><Link className="button button-secondary" href="/projetos">Vincular no projeto</Link></div>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Serviço</th><th>Projeto</th><th>Renovação</th><th>Pagador</th><th>Equiv. mensal</th><th>Ações</th></tr></thead><tbody>
            {subscriptions.map((item) => <tr key={item.id}><td><div className="service-cell"><span>{item.serviceName.slice(0,1)}</span><div><strong>{item.serviceName}</strong><small>{item.planName ?? categoryNames[item.category]}</small></div></div></td><td>{item.projects.length ? item.projects.join(", ") : "Operação da agência"}</td><td><span className="renewal-cell"><CalendarClock size={13} />{item.renewalLabel}</span></td><td><span className={`payer-badge ${item.payer}`}>{item.payer === "agency" ? "Agência" : "Cliente"}</span></td><td><strong>{formatCurrencyBRL(item.monthlyCents, { showCents: false })}</strong></td><td><DeleteActionForm action={deleteSubscriptionAction.bind(null, item.id)} className="table-delete" itemLabel={item.serviceName} description="A assinatura e seus vínculos serão removidos. A exclusão será enviada ao Google Agenda quando houver evento de renovação." /></td></tr>)}
            {!subscriptions.length && <tr><td colSpan={6}><div className="table-empty">Nenhuma assinatura cadastrada. Adicione uma dentro do projeto correspondente.</div></td></tr>}
          </tbody></table></div>
        </article>
        <aside className="panel category-panel">
          <div className="panel-heading"><div><span className="panel-icon blue"><CircleDollarSign size={18} /></span><div><h2>Custos por categoria</h2><p>Equivalente mensal</p></div></div></div>
          <div className="category-list">{categoryEntries.map(([category, value]) => {
            const percent = categoryTotal ? Math.round(value / categoryTotal * 100) : 0;
            return <div key={category}><span><b>{categoryNames[category]}</b><b>{formatCurrencyBRL(value, { showCents: false })}</b></span><i><em style={{ width: `${percent}%` }} /></i><small>{percent}% dos custos</small></div>;
          })}{!categoryEntries.length && <div className="table-empty compact">Cadastre custos reais para ver a distribuição.</div>}</div>
          <div className="finance-disclaimer"><LockKeyhole size={15} /><p>Valores visíveis somente para proprietários e administradores.</p></div>
        </aside>
      </section>
    </>
  );
}

function RestrictedFinance() {
  return <div className="restricted-page"><span><LockKeyhole size={28} /></span><h1>Financeiro protegido</h1><p>Seu perfil pode acompanhar projetos, prazos e serviços, mas não possui acesso aos valores da agência.</p></div>;
}
