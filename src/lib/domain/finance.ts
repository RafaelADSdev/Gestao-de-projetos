import { DEFAULT_LOCALE } from "./constants";
import type {
  AdministrativeExpense,
  BillingCycle,
  CommercialTerms,
  CurrencyCode,
  Subscription,
} from "./types";

const MONTHS_PER_CYCLE: Readonly<Record<BillingCycle, number | null>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
  "one-time": null,
};

/**
 * Converts a recurring charge to a monthly amount. Rounding happens per line
 * item, which matches how the dashboard can explain each normalized cost.
 */
export function monthlyEquivalentCents(amountCents: number, cycle: BillingCycle): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new RangeError("O valor deve ser um inteiro não negativo em centavos.");
  }

  const months = MONTHS_PER_CYCLE[cycle];
  return months === null ? 0 : Math.round(amountCents / months);
}

export function formatCurrencyBRL(
  amountCents: number,
  options: { showCents?: boolean } = {},
): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: options.showCents === false ? 0 : 2,
    maximumFractionDigits: options.showCents === false ? 0 : 2,
  }).format(amountCents / 100);
}

export function calculateMonthlyRecurringRevenue(
  terms: readonly CommercialTerms[],
): number {
  return terms.reduce((total, item) => {
    if (
      item.maintenanceStatus !== "active" ||
      item.maintenanceFeeCents === null ||
      item.maintenanceBillingCycle === null
    ) {
      return total;
    }

    return total + monthlyEquivalentCents(item.maintenanceFeeCents, item.maintenanceBillingCycle);
  }, 0);
}

export function calculateMonthlyRecurringCosts(
  subscriptions: readonly Subscription[],
  options: { payer?: Subscription["payer"] | "all" } = {},
): number {
  const payer = options.payer ?? "agency";
  return subscriptions.reduce((total, subscription) => {
    if (
      subscription.status !== "active" ||
      (payer !== "all" && subscription.payer !== payer)
    ) {
      return total;
    }

    return total + monthlyEquivalentCents(subscription.amountCents, subscription.billingCycle);
  }, 0);
}

export function calculateMonthlyAdministrativeExpenses(
  expenses: readonly AdministrativeExpense[],
): number {
  return expenses.reduce((total, expense) => {
    if (expense.status !== "active") return total;
    return total + monthlyEquivalentCents(expense.amountCents, expense.billingCycle);
  }, 0);
}

export interface FinancialSummary {
  currency: CurrencyCode;
  monthlyRecurringRevenueCents: number;
  monthlyRecurringCostCents: number;
  monthlyMarginCents: number;
  marginPercent: number | null;
}

export function calculateFinancialSummary(
  terms: readonly CommercialTerms[],
  subscriptions: readonly Subscription[],
  administrativeExpenses: readonly AdministrativeExpense[] = [],
): FinancialSummary {
  const monthlyRecurringRevenueCents = calculateMonthlyRecurringRevenue(terms);
  const monthlyRecurringCostCents =
    calculateMonthlyRecurringCosts(subscriptions) +
    calculateMonthlyAdministrativeExpenses(administrativeExpenses);
  const monthlyMarginCents = monthlyRecurringRevenueCents - monthlyRecurringCostCents;
  const marginPercent =
    monthlyRecurringRevenueCents === 0
      ? null
      : Math.round((monthlyMarginCents / monthlyRecurringRevenueCents) * 10_000) / 100;

  return {
    currency: "BRL",
    monthlyRecurringRevenueCents,
    monthlyRecurringCostCents,
    monthlyMarginCents,
    marginPercent,
  };
}

export function calculateMonthlyCostsByCategory(
  subscriptions: readonly Subscription[],
  administrativeExpenses: readonly AdministrativeExpense[] = [],
): Record<string, number> {
  const result: Record<string, number> = {
    domain: 0,
    hosting: 0,
    email: 0,
    video: 0,
    software: 0,
    other: 0,
    people: 0,
    marketing: 0,
    office: 0,
    taxes: 0,
    banking: 0,
  };

  for (const subscription of subscriptions) {
    if (subscription.status === "active" && subscription.payer === "agency") {
      result[subscription.category] += monthlyEquivalentCents(
        subscription.amountCents,
        subscription.billingCycle,
      );
    }
  }

  for (const expense of administrativeExpenses) {
    if (expense.status === "active") {
      result[expense.category] += monthlyEquivalentCents(expense.amountCents, expense.billingCycle);
    }
  }

  return result;
}
