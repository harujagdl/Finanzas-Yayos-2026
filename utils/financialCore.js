import { addMonths, getLocalMonthKey } from './monthKey.js';
import { normalizeInstallmentPlan, projectInstallments } from './planningEngine.js';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const monthFrom = (value) => {
  const raw = value?.toDate ? value.toDate() : value;
  const date = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? getLocalMonthKey(date) : null;
};
const isPayment = (item) => item?.type === 'payment' || item?.type === 'card_payment' || item?.isCardPayment === true;
const share = (item) => {
  const shared = item?.ownershipType === 'shared' || item?.owner === 'both' || item?.scope === 'shared';
  const supplied = Number(item?.ownerSharePercentage);
  return { ownershipType: shared ? 'shared' : 'personal', ownerSharePercentage: shared && Number.isFinite(supplied) ? Math.min(100, Math.max(0, supplied)) : shared ? 50 : 100 };
};

/**
 * Adapts the two non-destructive sources of commitments to one model. Explicit
 * links win; unlinked records are deliberately not matched by amount or name.
 */
export function normalizeFinancialCommitments({ expenses = [], installmentPlans = [], asOfMonth = getLocalMonthKey() } = {}) {
  const plans = installmentPlans.map((raw) => {
    const plan = normalizeInstallmentPlan(raw);
    const remaining = plan.remainingInstallments;
    const startMonth = raw.scheduleStartMonth || asOfMonth;
    const endMonth = remaining ? addMonths(startMonth, remaining - 1) : addMonths(startMonth, -1);
    return { ...plan, sourceType: raw.sourceType || 'installment_plan', sourceId: raw.sourceId || raw.id, startMonth, endMonth, billingStartMonth: startMonth, billingEndMonth: endMonth };
  });
  const linkedExpenseIds = new Set();
  plans.forEach((plan) => {
    if(plan.linkedExpenseId) linkedExpenseIds.add(String(plan.linkedExpenseId));
    if(plan.sourceType === 'expense' && plan.sourceId) linkedExpenseIds.add(String(plan.sourceId));
  });
  installmentPlans.forEach((plan) => {
    if(plan.linkedExpenseId) linkedExpenseIds.add(String(plan.linkedExpenseId));
  });
  const linkedPlanIds = new Set(installmentPlans.map((plan) => String(plan.id)).filter(Boolean));

  const legacy = expenses.filter((item) => item?.isMsi === true && item?.type === 'expense')
    .filter((item) => !linkedExpenseIds.has(String(item.id)) && !(item.linkedInstallmentPlanId && linkedPlanIds.has(String(item.linkedInstallmentPlanId))))
    .map((item) => {
      const total = Math.max(0, Math.trunc(Number(item.msiMonths || item.totalInstallments || 0)));
      const actualStart = monthFrom(item.msiStart || item.date);
      const suppliedCurrent = Number(item.currentInstallment ?? item.installmentsPaid);
      const elapsedAtAsOf = actualStart ? Math.max(0, ((Number(asOfMonth.slice(0, 4)) - Number(actualStart.slice(0, 4))) * 12) + Number(asOfMonth.slice(5, 7)) - Number(actualStart.slice(5, 7))) : 0;
      const current = Number.isFinite(suppliedCurrent) ? Math.max(0, Math.min(total, Math.trunc(suppliedCurrent))) : Math.min(total, elapsedAtAsOf);
      const remaining = Math.max(0, total - current);
      const ownership = share(item);
      return normalizeInstallmentPlan({
        ...item, ...ownership, id: `expense:${item.id}`, description: item.concept || item.description || 'MSI sin descripción',
        originalAmount: item.msiTotal, installmentAmount: item.msiMonthly ?? item.amount,
        totalInstallments: total, currentInstallment: current, remainingInstallments: remaining,
        remainingBalance: money((item.msiMonthly ?? item.amount) * remaining), interestType: item.interestType === 'interest' ? 'interest' : 'none',
        active: item.active !== false && remaining > 0, sourceType: 'expense', sourceId: item.id,
        startMonth: asOfMonth, endMonth: remaining ? addMonths(asOfMonth, remaining - 1) : addMonths(asOfMonth, -1),
        billingStartMonth: actualStart || asOfMonth, billingEndMonth: actualStart && total ? addMonths(actualStart, total - 1) : (remaining ? addMonths(asOfMonth, remaining - 1) : addMonths(asOfMonth, -1))
      });
    });
  return [...plans, ...legacy];
}

export const buildPlanningCommitments = normalizeFinancialCommitments;

export function calculateMonthlyFinancialSummary({ movements = [], commitments = [], monthKey = getLocalMonthKey(), cardId = 'all' } = {}) {
  const filteredMovements = movements.filter((item) => cardId === 'all' || (isPayment(item) ? (item.targetCardId || item.cardId) : item.cardId) === cardId);
  const active = commitments.filter((item) => (cardId === 'all' || item.cardId === cardId) && monthKey >= (item.billingStartMonth || item.startMonth) && monthKey <= (item.billingEndMonth || item.endMonth));
  const byCard = {};
  const ensure = (id, name) => byCard[id || 'sin-tarjeta'] ||= { cardName: name || 'Sin tarjeta', purchases: 0, installmentCommitment: 0, interestDeferredCommitment: 0, payments: 0, householdCommitment: 0, effectiveCommitment: 0 };
  let purchases = 0, payments = 0;
  filteredMovements.forEach((item) => {
    const amount = money(item.computedAmount ?? item.amount);
    const id = isPayment(item) ? (item.targetCardId || item.cardId) : item.cardId;
    const card = ensure(id, item.targetCardName || item.cardName);
    if(isPayment(item)){ payments = money(payments + amount); card.payments = money(card.payments + amount); }
    else if(item.type === 'expense' && item.isMsi !== true){ purchases = money(purchases + amount); card.purchases = money(card.purchases + amount); }
  });
  let installmentCommitment = 0, interestDeferredCommitment = 0, householdCommitment = 0, effectiveCommitment = 0;
  active.forEach((item) => {
    const amount = money(item.installmentAmount);
    const effective = money(amount * Number(item.ownerSharePercentage ?? 100) / 100);
    const card = ensure(item.cardId, item.cardName);
    if(item.interestType === 'interest'){ interestDeferredCommitment = money(interestDeferredCommitment + amount); card.interestDeferredCommitment = money(card.interestDeferredCommitment + amount); }
    else { installmentCommitment = money(installmentCommitment + amount); card.installmentCommitment = money(card.installmentCommitment + amount); }
    householdCommitment = money(householdCommitment + amount); effectiveCommitment = money(effectiveCommitment + effective);
    card.householdCommitment = money(card.householdCommitment + amount); card.effectiveCommitment = money(card.effectiveCommitment + effective);
  });
  return { purchases, installmentCommitment, interestDeferredCommitment, payments, householdCommitment, effectiveCommitment, movementCount: filteredMovements.length, byCard };
}

export function projectFinancialCommitments(sources = {}, options = {}) {
  return projectInstallments(normalizeFinancialCommitments({ ...sources, asOfMonth: options.startMonth }), options);
}
