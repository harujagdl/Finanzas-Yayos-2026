import { buildCardLogicalKey } from './cardCanonicalKey.js';

const CONFIG_FIELDS = [
  'closingDay', 'dueDay', 'cutDay', 'payDay', 'cycleMode', 'limit', 'balance',
  'payGoal', 'paymentTarget', 'paymentGoal', 'paymentToAvoidInterest', 'montoCiclo', 'goal', 'last4'
];
const PAYMENT_TARGET_FIELDS = ['paymentToAvoidInterest', 'payGoal', 'paymentGoal', 'paymentTarget', 'montoCiclo', 'goal'];
const UPDATED_FIELDS = ['updatedAt', 'modifiedAt', 'lastUpdatedAt', 'createdAt'];
const present = (value) => value !== null && value !== undefined && value !== '';
const finite = (value) => present(value) && Number.isFinite(Number(value));
const validDay = (value) => finite(value) && Number(value) >= 1 && Number(value) <= 31;

const paymentTarget = (card) => {
  let fallback = null;
  for (const field of PAYMENT_TARGET_FIELDS) {
    if (!finite(card?.[field])) continue;
    const value = Number(card[field]);
    if (value > 0) return value;
    if (fallback === null) fallback = value;
  }
  return fallback;
};

const timestampMillis = (value) => {
  if (!present(value)) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (finite(value?.seconds)) return Number(value.seconds) * 1000;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rankCard = (card) => {
  const completeness = CONFIG_FIELDS.reduce((score, field) => score + (present(card?.[field]) ? 1 : 0), 0);
  const closingDay = card?.closingDay ?? card?.cutDay;
  const dueDay = card?.dueDay ?? card?.payDay;
  const updatedAt = UPDATED_FIELDS.reduce((latest, field) => Math.max(latest, timestampMillis(card?.[field])), 0);
  return {
    completeness,
    validCycle: validDay(closingDay) && validDay(dueDay),
    positivePaymentTarget: (paymentTarget(card) ?? 0) > 0,
    updatedAt
  };
};

const stableIdTieBreak = (a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
const compareConfigurationCandidates = (a, b) => {
  const ar = rankCard(a), br = rankCard(b);
  return Number(br.positivePaymentTarget) - Number(ar.positivePaymentTarget)
    || Number(br.validCycle) - Number(ar.validCycle)
    || br.updatedAt - ar.updatedAt
    || br.completeness - ar.completeness
    || stableIdTieBreak(a, b);
};

const chooseFieldSource = (group, isValid, { preferPaymentTarget = false } = {}) => [...group]
  .filter(isValid)
  .sort((a, b) => {
    const ar = rankCard(a), br = rankCard(b);
    return (preferPaymentTarget
      ? Number(br.positivePaymentTarget) - Number(ar.positivePaymentTarget)
      : 0)
      || br.updatedAt - ar.updatedAt
      || br.completeness - ar.completeness
      || stableIdTieBreak(a, b);
  })[0];

/**
 * Resolves the current financial configuration independently from logical identity.
 * Values are selected, never added: historical transactions are the only additive data.
 */
export const resolveLogicalCardConfiguration = (group = []) => {
  if (!group.length) return {};
  const configurationSource = [...group].sort(compareConfigurationCandidates)[0];
  const targetSource = chooseFieldSource(group, (card) => (paymentTarget(card) ?? 0) > 0)
    ?? chooseFieldSource(group, (card) => finite(paymentTarget(card)))
    ?? configurationSource;
  const daySource = (primary, legacy) => chooseFieldSource(
    group,
    (card) => validDay(card?.[primary] ?? card?.[legacy]),
    { preferPaymentTarget: true }
  );
  const closingSource = daySource('closingDay', 'cutDay') ?? configurationSource;
  const dueSource = daySource('dueDay', 'payDay') ?? configurationSource;
  // Balance and limit are snapshots, not additive amounts. Prefer a valid value
  // from the same semantically-current (positive-target) configuration.
  const moneySource = (field) => chooseFieldSource(
    group,
    (card) => finite(card?.[field]),
    { preferPaymentTarget: true }
  ) ?? configurationSource;
  const resolvedTarget = paymentTarget(targetSource);
  const closingDay = closingSource?.closingDay ?? closingSource?.cutDay ?? null;
  const dueDay = dueSource?.dueDay ?? dueSource?.payDay ?? null;

  return {
    ...configurationSource,
    configurationSourceId: configurationSource?.id,
    paymentTargetSourceId: targetSource?.id,
    payGoal: finite(resolvedTarget) ? resolvedTarget : 0,
    closingDay: validDay(closingDay) ? Number(closingDay) : null,
    cutDay: validDay(closingDay) ? Number(closingDay) : null,
    dueDay: validDay(dueDay) ? Number(dueDay) : null,
    payDay: validDay(dueDay) ? Number(dueDay) : null,
    cycleMode: configurationSource?.cycleMode === 'billing' ? 'billing' : 'calendar',
    limit: finite(moneySource('limit')?.limit) ? Number(moneySource('limit').limit) : 0,
    balance: finite(moneySource('balance')?.balance) ? Number(moneySource('balance').balance) : 0
  };
};

/** Builds a non-destructive logical view while retaining every source document. */
export const consolidateCards = (documents = [], { warn = console.warn } = {}) => {
  const originalCards = [...documents];
  const groups = new Map();
  originalCards.forEach((card) => {
    const logicalKey = buildCardLogicalKey(card?.owner, card?.name);
    const key = logicalKey || `__invalid__${card?.id ?? groups.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });

  const logicalCards = [];
  const cardAliasToCanonical = {};
  for (const [logicalKey, group] of groups) {
    // Identity is deliberately independent of mutable financial configuration.
    const canonical = [...group].sort(stableIdTieBreak)[0];
    const configuration = resolveLogicalCardConfiguration(group);
    const aliasIds = group.map((card) => card.id).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    aliasIds.forEach((id) => { cardAliasToCanonical[id] = canonical.id; });
    logicalCards.push({ ...canonical, ...configuration, id: canonical.id, canonicalId: canonical.id, aliasIds, logicalKey });
    if (group.length > 1 && !logicalKey.startsWith('__invalid__')) {
      warn('Duplicate card documents detected', { logicalKey, ids: aliasIds });
    }
  }
  return { originalCards, logicalCards, cardAliasToCanonical };
};

export const resolveCanonicalCardId = (cardId, aliases = {}) => aliases[cardId] ?? cardId;

export const resolveTransactionCardAliases = (transaction = {}, aliases = {}) => ({
  ...transaction,
  originalCardId: transaction.originalCardId ?? transaction.cardId,
  originalTargetCardId: transaction.originalTargetCardId ?? transaction.targetCardId,
  cardId: resolveCanonicalCardId(transaction.originalCardId ?? transaction.cardId, aliases),
  targetCardId: resolveCanonicalCardId(transaction.originalTargetCardId ?? transaction.targetCardId, aliases)
});

export const hasLogicalCardName = (cards, owner, name, { excludeIds = [] } = {}) => {
  const key = buildCardLogicalKey(owner, name);
  const excluded = new Set(excludeIds);
  return Boolean(key) && (cards || []).some((card) => !excluded.has(card.id) && buildCardLogicalKey(card.owner, card.name) === key);
};

export const summarizeTransactionsByLogicalCard = (transactions = [], aliases = {}) => {
  const result = {};
  transactions.forEach((transaction) => {
    const id = resolveCanonicalCardId(transaction.cardId ?? transaction.targetCardId, aliases);
    if (!id) return;
    if (!result[id]) result[id] = { cardId: id, amount: 0, count: 0 };
    result[id].amount += Number(transaction.amount || 0);
    result[id].count += 1;
  });
  return result;
};
