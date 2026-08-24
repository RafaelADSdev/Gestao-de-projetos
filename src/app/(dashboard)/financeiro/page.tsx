import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CircleDollarSign, CreditCard, LockKeyhole, Pencil, Plus, ReceiptText, TrendingUp, WalletCards } from "lucide-react";
import { createAdministrativeExpenseAction, deleteAdministrativeExpenseAction, deleteSubscriptionAction, updateAdministrativeExpenseAction } from "@/app/(dashboard)/actions";
import { SettingsActionForm } from "@/components/settings/action-form";
import { DeleteActionForm } from "@/components/settings/delete-action-form";
import { canSeeFinance, requireAuthContext } from "@/lib/auth";
import { loadAgencyData } from "@/lib/data/agency";
import { buildAdministrativeExpenses, buildCostsByCategory, buildFinanceSummary, buildSubscriptions } from "@/lib/data/view-models";
import { formatCurrencyBRL } from "@/lib/domain";

const categoryNames: Record<string, string> = {
  domain: "Domínios",
  hosting: "Hospedagem",
  email: "E-mail",
  video: "Vídeo",
  software: "Software",
  people: "Pessoas",
  marketing: "Marketing",
  office: "Operação",
  taxes: "Impostos",
  banking: "Bancário",
  other: "Outros",
};

const cycleNames: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  "one-time": "Única",
};

const expenseCategories = ["people", "software", "marketing", "office", "taxes", "banking", "other"] as const;
const expenseCycles = ["monthly", "quarterly", "semiannual", "annual", "one-time"] as const;

function formatDateOnly(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export default async function FinancePage() {
  const context = await requireAuthContext();
  if (!canSeeFinance(context.role)) return <RestrictedFinance />;
  const { data, now } = await loadAgencyData(context);
  const finance = buildFinanceSummary(data, now);
  const subscriptions = buildSubscriptions(data, now);
  const administrativeExpenses = buildAdministrativeExpenses(data);
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
      <section className="panel administrative-expenses-panel">
        <div className="panel-heading">
          <div><span className="panel-icon amber"><ReceiptText size={18} /></span><div><h2>Despesas administrativas</h2><p>Custos da operação que não pertencem a um projeto</p></div></div>
          <span className="finance-section-note"><Plus size={13} /> Nova despesa</span>
        </div>
        <div className="administrative-expenses-body">
          <SettingsActionForm action={createAdministrativeExpenseAction} className="form-grid two admin-expense-form" submitLabel="Adicionar despesa" successMessage="Despesa administrativa criada.">
            <label className="form-field"><span>Nome da despesa</span><input className="input" name="name" placeholder="Ex.: Contabilidade" required minLength={2} maxLength={120} /></label>
            <label className="form-field"><span>Categoria</span><select className="input" name="category" defaultValue="software">{expenseCategories.map((category) => <option key={category} value={category}>{categoryNames[category]}</option>)}</select></label>
            <label className="form-field"><span>Valor (BRL)</span><input className="input" name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" required /></label>
            <label className="form-field"><span>Ciclo</span><select className="input" name="billing_cycle" defaultValue="monthly">{expenseCycles.map((cycle) => <option key={cycle} value={cycle}>{cycleNames[cycle]}</option>)}</select></label>
            <label className="form-field"><span>Próximo vencimento</span><input className="input" name="due_date" type="date" /></label>
            <label className="form-field"><span>Status</span><select className="input" name="status" defaultValue="active"><option value="active">Ativa</option><option value="paused">Pausada</option><option value="canceled">Cancelada</option></select></label>
            <label className="form-field full"><span>Observações (opcional)</span><textarea className="input" name="notes" rows={2} maxLength={500} placeholder="Detalhes, fornecedor ou referência interna" /></label>
          </SettingsActionForm>

          <div className="admin-expense-list">
            {administrativeExpenses.map((expense) => {
              const dueDate = formatDateOnly(expense.dueDate);
              return <article className="admin-expense-card" key={expense.id}>
                <div className="admin-expense-summary">
                  <span className="finance-kpi-icon amber"><ReceiptText size={16} /></span>
                  <div><strong>{expense.name}</strong><small>{categoryNames[expense.category] ?? "Outros"} · {cycleNames[expense.billingCycle] ?? expense.billingCycle}{expense.status !== "active" ? ` · ${expense.status === "paused" ? "Pausada" : "Cancelada"}` : ""}</small>{dueDate && <small>Vencimento: {dueDate}</small>}</div>
                  <strong className="admin-expense-amount">{formatCurrencyBRL(expense.monthlyCents, { showCents: false })}<small>por mês</small></strong>
                </div>
                <div className="admin-expense-actions">
                  <details className="admin-expense-edit">
                    <summary><Pencil size={13} /> Editar</summary>
                    <SettingsActionForm action={updateAdministrativeExpenseAction.bind(null, expense.id)} className="form-grid two" submitLabel="Salvar despesa" successMessage="Despesa administrativa atualizada.">
                      <label className="form-field"><span>Nome da despesa</span><input className="input" name="name" defaultValue={expense.name} required minLength={2} maxLength={120} /></label>
                      <label className="form-field"><span>Categoria</span><select className="input" name="category" defaultValue={expense.category}>{expenseCategories.map((category) => <option key={category} value={category}>{categoryNames[category]}</option>)}</select></label>
                      <label className="form-field"><span>Valor (BRL)</span><input className="input" name="amount" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={(expense.amountCents / 100).toFixed(2)} required /></label>
                      <label className="form-field"><span>Ciclo</span><select className="input" name="billing_cycle" defaultValue={expense.billingCycle}>{expenseCycles.map((cycle) => <option key={cycle} value={cycle}>{cycleNames[cycle]}</option>)}</select></label>
                      <label className="form-field"><span>Próximo vencimento</span><input className="input" name="due_date" type="date" defaultValue={expense.dueDate ?? ""} /></label>
                      <label className="form-field"><span>Status</span><select className="input" name="status" defaultValue={expense.status}><option value="active">Ativa</option><option value="paused">Pausada</option><option value="canceled">Cancelada</option></select></label>
                      <label className="form-field full"><span>Observações (opcional)</span><textarea className="input" name="notes" rows={2} maxLength={500} defaultValue={expense.notes ?? ""} /></label>
                    </SettingsActionForm>
                  </details>
                  <DeleteActionForm action={deleteAdministrativeExpenseAction.bind(null, expense.id)} className="table-delete" itemLabel={expense.name} description="A despesa será removida permanentemente; a exclusão continuará disponível no log de auditoria." />
                </div>
              </article>;
            })}
            {!administrativeExpenses.length && <div className="table-empty compact">Nenhuma despesa administrativa cadastrada. Use o formulário acima para começar.</div>}
          </div>
        </div>
      </section>
    </>
  );
}

function RestrictedFinance() {
  return <div className="restricted-page"><span><LockKeyhole size={28} /></span><h1>Financeiro protegido</h1><p>Seu perfil pode acompanhar projetos, prazos e serviços, mas não possui acesso aos valores da agência.</p></div>;
}
