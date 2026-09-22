import { addMonths, getLocalMonthKey } from './monthKey.js';

const asCents = (value) => Math.round((Number(value) || 0) * 100);
const fromCents = (value) => Math.round(value) / 100;
const clampPercent = (value, fallback = 100) => Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : fallback));

export const normalizeCard = (card = {}) => ({
  ...card,
  name: card.name || card.nombre || 'Tarjeta sin nombre',
  bank: card.bank || card.banco || '',
  lastDigits: card.lastDigits || card.ultimosDigitos || '',
  type: card.type === 'debit' ? 'debit' : 'credit',
  ownershipType: card.ownershipType === 'shared' || card.owner === 'both' ? 'shared' : 'personal',
  creditLimit: Number(card.creditLimit ?? card.limit ?? 0),
  currentBalance: Number(card.currentBalance ?? card.balance ?? 0),
  paymentToAvoidInterest: Number(card.paymentToAvoidInterest ?? card.payGoal ?? 0),
  statementClosingDay: card.statementClosingDay ?? card.closingDay ?? card.cutDay ?? null,
  paymentDueDay: card.paymentDueDay ?? card.dueDay ?? card.payDay ?? null,
  active: card.active !== false
});

export const normalizeInstallmentPlan = (plan = {}) => {
  const total = Math.max(0, Math.trunc(Number(plan.totalInstallments ?? plan.msiMonths ?? 0)));
  const current = Math.min(total, Math.max(0, Math.trunc(Number(plan.currentInstallment ?? plan.msiInstallmentNumber ?? 0))));
  const remaining = Math.max(0, Math.trunc(Number(plan.remainingInstallments ?? (total - current))));
  const ownershipType = plan.ownershipType === 'shared' || plan.owner === 'both' ? 'shared' : 'personal';
  return {
    ...plan,
    originalAmount: Number(plan.originalAmount ?? plan.msiTotal ?? 0),
    installmentAmount: Number(plan.installmentAmount ?? plan.msiMonthly ?? 0),
    remainingBalance: Number(plan.remainingBalance ?? ((plan.installmentAmount ?? plan.msiMonthly ?? 0) * remaining)),
    totalInstallments: total,
    currentInstallment: current,
    remainingInstallments: remaining,
    interestType: plan.interestType === 'interest' ? 'interest' : 'none',
    ownershipType,
    ownerSharePercentage: ownershipType === 'shared' ? clampPercent(plan.ownerSharePercentage, 50) : 100,
    active: plan.active !== false && remaining > 0
  };
};

export const calculateCostToFreeOneMonthlyPeso = (plan) => {
  const normalized = normalizeInstallmentPlan(plan);
  return normalized.installmentAmount > 0 ? normalized.remainingBalance / normalized.installmentAmount : null;
};

export function projectInstallments(plans = [], { startMonth = getLocalMonthKey(), months = 12 } = {}) {
  const horizon = Math.max(1, Math.trunc(months));
  const rows = Array.from({ length: horizon }, (_, index) => ({
    monthKey: addMonths(startMonth, index), totalCommitmentCents: 0, msiCommitmentCents: 0,
    interestCommitmentCents: 0, personalCommitmentCents: 0, sharedHouseholdCommitmentCents: 0,
    effectiveCommitmentCents: 0, releasedFlowCents: 0, byCardCents: {}, endingPlans: []
  }));

  plans.map(normalizeInstallmentPlan).filter((plan) => plan.active).forEach((plan) => {
    const count = Math.min(plan.remainingInstallments, horizon);
    const monthlyCents = asCents(plan.installmentAmount);
    const effectiveCents = Math.round(monthlyCents * plan.ownerSharePercentage / 100);
    for(let index = 0; index < count; index += 1){
      const row = rows[index];
      row.totalCommitmentCents += monthlyCents;
      row[plan.interestType === 'interest' ? 'interestCommitmentCents' : 'msiCommitmentCents'] += monthlyCents;
      row[plan.ownershipType === 'shared' ? 'sharedHouseholdCommitmentCents' : 'personalCommitmentCents'] += monthlyCents;
      row.effectiveCommitmentCents += effectiveCents;
      const cardKey = plan.cardId || 'unassigned';
      row.byCardCents[cardKey] = (row.byCardCents[cardKey] || 0) + monthlyCents;
      if(index === count - 1 && plan.remainingInstallments <= horizon){
        row.releasedFlowCents += effectiveCents;
        row.endingPlans.push({ id: plan.id, description: plan.description || 'Plan sin descripción', releasedMonthlyAmount: fromCents(effectiveCents) });
      }
    }
  });

  return rows.map((row) => ({
    monthKey: row.monthKey,
    totalCommitment: fromCents(row.totalCommitmentCents),
    msiCommitment: fromCents(row.msiCommitmentCents),
    interestCommitment: fromCents(row.interestCommitmentCents),
    personalCommitment: fromCents(row.personalCommitmentCents),
    householdCommitment: fromCents(row.sharedHouseholdCommitmentCents),
    effectiveCommitment: fromCents(row.effectiveCommitmentCents),
    releasedFlow: fromCents(row.releasedFlowCents),
    byCard: Object.fromEntries(Object.entries(row.byCardCents).map(([key, cents]) => [key, fromCents(cents)])),
    endingPlans: row.endingPlans
  }));
}

export const getCommitmentForMonth = (projection, monthKey) => projection.find((row) => row.monthKey === monthKey) || null;
export const getReleasedFlowBetween = (projection, fromMonth, toMonth) => fromCents(projection.reduce((sum, row) => row.monthKey >= fromMonth && row.monthKey <= toMonth ? sum + asCents(row.releasedFlow) : sum, 0));

export function calculateSafeAvailable(input = {}) {
  const required = ['incomeAvailable', 'fixedExpenses', 'currentSpending', 'currentCardPayments', 'goalsReserved', 'buffer'];
  const missing = required.filter((key) => input[key] === '' || input[key] == null || !Number.isFinite(Number(input[key])));
  if(missing.length) return { availableSafeMonth: null, availableSafeWeek: null, missing };
  const commitment = Number(input.nextInstallments ?? 0);
  const target = Number(input.reductionTarget ?? 0);
  const cents = asCents(input.incomeAvailable) - ['fixedExpenses', 'currentSpending', 'currentCardPayments', 'goalsReserved', 'buffer'].reduce((sum, key) => sum + asCents(input[key]), 0) - asCents(commitment) - asCents(target);
  return { availableSafeMonth: fromCents(cents), availableSafeWeek: fromCents(Math.floor(cents / 4)), missing: [] };
}

export function simulateNewPurchase(plans = [], purchase = {}, options = {}) {
  const installments = Math.max(1, Math.trunc(Number(purchase.totalInstallments || 1)));
  const amountCents = asCents(purchase.amount);
  const installmentCents = Math.round(amountCents / installments);
  const simulatedPlan = normalizeInstallmentPlan({
    ...purchase, id: purchase.id || '__simulation_purchase__', originalAmount: fromCents(amountCents),
    remainingBalance: fromCents(amountCents), installmentAmount: fromCents(installmentCents),
    totalInstallments: installments, currentInstallment: 0, remainingInstallments: installments, active: true
  });
  return { plan: simulatedPlan, before: projectInstallments(plans, options), after: projectInstallments([...plans, simulatedPlan], options) };
}

export function simulatePlanPayoff(plans = [], planId, options = {}) {
  const before = projectInstallments(plans, options);
  const simulatedPlans = plans.map((plan) => plan.id === planId ? { ...plan, active: false, remainingInstallments: 0, remainingBalance: 0 } : { ...plan });
  return { before, after: projectInstallments(simulatedPlans, options), plans: simulatedPlans, warning: 'Confirma con el banco que el pago anticipado cancela el plan y libera la mensualidad.' };
}
