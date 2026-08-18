import { buildCardLogicalKey } from './cardCanonicalKey.js';

const CONFIG_FIELDS = ['closingDay', 'dueDay', 'cutDay', 'payDay', 'cycleMode', 'limit', 'balance', 'payGoal', 'last4'];
const present = (value) => value !== null && value !== undefined && value !== '';
const finite = (value) => present(value) && Number.isFinite(Number(value));

const rankCard = (card) => {
  const completeness = CONFIG_FIELDS.reduce((score, field) => score + (present(card?.[field]) ? 1 : 0), 0);
  const validCycle = finite(card?.closingDay ?? card?.cutDay) && finite(card?.dueDay ?? card?.payDay);
  const validMoney = finite(card?.balance) && finite(card?.limit);
  return { completeness, validity: Number(validCycle) + Number(validMoney) };
};

const compareCanonicalCandidates = (a, b) => {
  const ar = rankCard(a), br = rankCard(b);
  return br.completeness - ar.completeness || br.validity - ar.validity || String(a.id).localeCompare(String(b.id));
};

/** Builds a non-destructive logical view while retaining every source document. */
export const consolidateCards = (documents = [], { warn = console.warn } = {}) => {
  const originalCards = [...documents];
  const groups = new Map();
  originalCards.forEach((card) => {
    const logicalKey = buildCardLogicalKey(card?.owner, card?.name);
    // Invalid records remain independently visible instead of being accidentally merged.
    const key = logicalKey || `__invalid__${card?.id ?? groups.size}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  });

  const logicalCards = [];
  const cardAliasToCanonical = {};
  for (const [logicalKey, group] of groups) {
    const ranked = [...group].sort(compareCanonicalCandidates);
    const canonical = ranked[0];
    const aliasIds = ranked.map((card) => card.id).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
    aliasIds.forEach((id) => { cardAliasToCanonical[id] = canonical.id; });
    logicalCards.push({ ...canonical, canonicalId: canonical.id, aliasIds, logicalKey });
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
