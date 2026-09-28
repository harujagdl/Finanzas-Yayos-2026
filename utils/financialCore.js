import { addMonths, getLocalMonthKey } from './monthKey.js';
import { normalizeInstallmentPlan, projectInstallments } from './planningEngine.js';
import { resolveCommitmentOwnership } from './commitmentOwnership.js';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const monthFrom = (value) => {
  const raw = value?.toDate ? value.toDate() : value;
  const date = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? getLocalMonthKey(date) : null;
};
const isPayment = (item) => item?.type === 'payment' || item?.type === 'card_payment' || item?.isCardPayment === true;
const presentNumber = (value) => value !== '' && value != null && Number.isFinite(Number(value));
const paymentCardId = (item) => item?.targetCardId || item?.cardId;
const movementCardId = (item) => isPayment(item) ? paymentCardId(item) : item?.cardId;

const monthDistance = (from, to) => ((Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12)
  + Number(to.slice(5, 7)) - Number(from.slice(5, 7));

/**
 * `currentInstallment` is the number of installments already covered before
 * `asOfMonth`; consequently `remainingInstallments` includes the payment due
 * in `asOfMonth`. The returned pending range is shared by Summary/Planning.
 */
export function resolveInstallmentPosition({ totalInstallments, currentInstallment, remainingInstallments, firstPaymentMonth, asOfMonth = getLocalMonthKey() } = {}) {
  const total = Math.max(0, Math.trunc(Number(totalInstallments) || 0));
  const first = firstPaymentMonth || asOfMonth;
  const elapsedBeforeAsOf = Math.max(0, monthDistance(first, asOfMonth));
  const suppliedCurrent = currentInstallment === '' || currentInstallment == null ? null : Number(currentInstallment);
  const completed = Number.isFinite(suppliedCurrent)
    ? Math.min(total, Math.max(0, Math.trunc(suppliedCurrent)))
    : Math.min(total, elapsedBeforeAsOf);
  const suppliedRemaining = remainingInstallments === '' || remainingInstallments == null ? null : Number(remainingInstallments);
  const remaining = Number.isFinite(suppliedRemaining)
    ? Math.min(total, Math.max(0, Math.trunc(suppliedRemaining)))
    : Math.max(0, total - completed);
  const pendingStartMonth = first > asOfMonth ? first : asOfMonth;
  return {
    currentInstallment: completed,
    remainingInstallments: remaining,
    pendingStartMonth,
    pendingEndMonth: remaining ? addMonths(pendingStartMonth, remaining - 1) : addMonths(pendingStartMonth, -1)
  };
}

/**
 * Adapts the two non-destructive sources of commitments to one model. Explicit
 * links win; unlinked records are deliberately not matched by amount or name.
 */
export function normalizeFinancialCommitments({ expenses = [], installmentPlans = [], asOfMonth = getLocalMonthKey() } = {}) {
  const plans = installmentPlans.map((raw) => {
    const firstPaymentMonth = raw.scheduleStartMonth || monthFrom(raw.startDate) || asOfMonth;
    const position = resolveInstallmentPosition({ ...raw, firstPaymentMonth, asOfMonth });
    const plan = normalizeInstallmentPlan({ ...raw, ...position });
    return { ...plan, sourceType: raw.sourceType || 'installment_plan', sourceId: raw.sourceId || raw.id,
      startMonth: position.pendingStartMonth, endMonth: position.pendingEndMonth,
      billingStartMonth: position.pendingStartMonth, billingEndMonth: position.pendingEndMonth };
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
      const position = resolveInstallmentPosition({
        totalInstallments: total,
        currentInstallment: item.currentInstallment ?? item.installmentsPaid,
        remainingInstallments: item.remainingInstallments,
        firstPaymentMonth: actualStart || asOfMonth,
        asOfMonth
      });
      const { currentInstallment: current, remainingInstallments: remaining } = position;
      const ownership = resolveCommitmentOwnership(item);
      return normalizeInstallmentPlan({
        ...item, ...ownership, id: `expense:${item.id}`, description: item.concept || item.description || 'MSI sin descripción',
        originalAmount: item.msiTotal, installmentAmount: item.msiMonthly ?? item.amount,
        totalInstallments: total, currentInstallment: current, remainingInstallments: remaining,
        remainingBalance: money((item.msiMonthly ?? item.amount) * remaining), interestType: item.interestType === 'interest' ? 'interest' : 'none',
        active: item.active !== false && remaining > 0, sourceType: 'expense', sourceId: item.id,
        startMonth: position.pendingStartMonth, endMonth: position.pendingEndMonth,
        billingStartMonth: position.pendingStartMonth, billingEndMonth: position.pendingEndMonth
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
  let unclassifiedCommitment = 0, unclassifiedCommitmentCount = 0;
  active.forEach((item) => {
    const amount = money(item.installmentAmount);
    const effective = item.needsClassification ? 0 : money(amount * Number(item.effectiveMultiplier ?? 1));
    const card = ensure(item.cardId, item.cardName);
    if(item.interestType === 'interest'){ interestDeferredCommitment = money(interestDeferredCommitment + amount); card.interestDeferredCommitment = money(card.interestDeferredCommitment + amount); }
    else { installmentCommitment = money(installmentCommitment + amount); card.installmentCommitment = money(card.installmentCommitment + amount); }
    householdCommitment = money(householdCommitment + amount); effectiveCommitment = money(effectiveCommitment + effective);
    card.householdCommitment = money(card.householdCommitment + amount); card.effectiveCommitment = money(card.effectiveCommitment + effective);
    if(item.needsClassification){
      unclassifiedCommitment = money(unclassifiedCommitment + amount);
      unclassifiedCommitmentCount += 1;
    }
  });
  return { purchases, installmentCommitment, interestDeferredCommitment, payments, householdCommitment, effectiveCommitment,
    effectiveCommitmentPartial: unclassifiedCommitmentCount > 0, unclassifiedCommitment, unclassifiedCommitmentCount,
    movementCount: filteredMovements.length, byCard };
}

const normalizePaymentPeriod = (period, fallbackMonth) => {
  if(typeof period === 'string') return { key: period, mode: 'month' };
  return { key: period?.key || period?.monthKey || fallbackMonth, mode: period?.mode === 'statement' ? 'statement' : 'month',
    start: period?.start || period?.startDate || null, end: period?.end || period?.endExclusive || null,
    cycleId: period?.cycleId || null, statementId: period?.statementId || null };
};

const inPaymentPeriod = (item, period) => {
  const raw = item?.date?.toDate ? item.date.toDate() : item?.date;
  const date = raw instanceof Date ? raw : raw ? new Date(raw) : null;
  if(period.start && period.end && date && !Number.isNaN(date.getTime())) return date >= period.start && date < period.end;
  return !date || Number.isNaN(date.getTime()) ? true : monthFrom(date) === period.key;
};

const statementTarget = (card, period, asOfMonth) => {
  const periodField = card?.statementPeriod || card?.statementMonth || card?.paymentPeriod || null;
  const belongsToPeriod = periodField ? periodField === period.key : period.key === asOfMonth;
  if(!belongsToPeriod) return null;
  for(const field of ['paymentToAvoidInterest', 'payGoal', 'paymentGoal', 'paymentTarget', 'montoCiclo', 'goal']){
    if(presentNumber(card?.[field]) && Number(card[field]) > 0) return { amount: money(card[field]), field };
  }
  return null;
};

/**
 * Resolves the amount expected by the bank for one card and period. Payments
 * are reported, but never subtracted without an explicit cycle/statement link.
 */
export function resolveCardMonthlyPayment({ card = {}, movements = [], commitments = [], period, monthKey, asOfMonth = getLocalMonthKey() } = {}) {
  const normalizedPeriod = normalizePaymentPeriod(period, monthKey || asOfMonth);
  const cardId = card.id || card.cardId || null;
  const cardMovements = movements.filter((item) => movementCardId(item) === cardId && inPaymentPeriod(item, normalizedPeriod));
  const purchases = money(cardMovements.filter((item) => item?.type === 'expense' && item?.isMsi !== true && !isPayment(item))
    .reduce((sum, item) => sum + money(item.computedAmount ?? item.amount), 0));
  const payments = money(cardMovements.filter(isPayment).reduce((sum, item) => sum + money(item.computedAmount ?? item.amount), 0));
  const activeCommitments = commitments.filter((item) => item?.cardId === cardId
    && normalizedPeriod.key >= (item.billingStartMonth || item.startMonth)
    && normalizedPeriod.key <= (item.billingEndMonth || item.endMonth));
  const installments = money(activeCommitments.reduce((sum, item) => sum + money(item.installmentAmount), 0));
  const bank = statementTarget(card, normalizedPeriod, asOfMonth);
  const linkedPayments = cardMovements.filter((item) => isPayment(item) && (
    (normalizedPeriod.statementId && item?.statementId === normalizedPeriod.statementId)
    || (normalizedPeriod.cycleId && item?.cardCycleId === normalizedPeriod.cycleId)
  ));
  const reconciledPaid = money(linkedPayments.reduce((sum, item) => sum + money(item.computedAmount ?? item.amount), 0));
  const baseComponents = { purchases, installments, paymentsRecorded: payments,
    paid: linkedPayments.length ? reconciledPaid : null, remaining: null,
    remainingBalanceExcluded: true, msiOriginalAmountsExcluded: true };

  if(bank){
    return { amount: bank.amount, source: 'statement', confidence: 'high', components: {
      ...baseComponents, statementAmount: bank.amount, statementField: bank.field,
      remaining: linkedPayments.length ? money(Math.max(0, bank.amount - reconciledPaid)) : null
    }, cardId, period: normalizedPeriod };
  }
  if(purchases > 0 || installments > 0){
    return { amount: money(purchases + installments), source: 'estimated', confidence: 'medium',
      components: { ...baseComponents, estimatedFromMovements: purchases, estimatedFromInstallments: installments },
      cardId, period: normalizedPeriod };
  }
  return { amount: null, source: 'insufficient_data', confidence: 'none', components: baseComponents, cardId, period: normalizedPeriod };
}

/** Aggregates per-card answers without turning missing information into zero. */
export function calculateMonthlyPaymentSummary({ cards = [], movements = [], commitments = [], period, monthKey, cardId = 'all', asOfMonth = getLocalMonthKey() } = {}) {
  const selectedCards = cards.filter((card) => card?.active !== false && (cardId === 'all' || card.id === cardId));
  const results = selectedCards.map((card) => resolveCardMonthlyPayment({ card, movements, commitments, period, monthKey, asOfMonth }));
  const sources = new Set(results.map((item) => item.source));
  let sourceStatus = 'insufficient_data';
  if(results.length && !sources.has('insufficient_data')){
    if(sources.size > 1) sourceStatus = 'mixed';
    else sourceStatus = sources.has('statement') ? 'confirmed' : 'estimated';
  }else if(sources.has('statement') || sources.has('estimated')) sourceStatus = 'insufficient_data';
  const known = results.filter((item) => item.amount != null);
  return { totalAmount: known.length ? money(known.reduce((sum, item) => sum + item.amount, 0)) : null,
    sourceStatus, cards: results };
}

export function projectFinancialCommitments(sources = {}, options = {}) {
  return projectInstallments(normalizeFinancialCommitments({ ...sources, asOfMonth: options.startMonth }), options);
}
