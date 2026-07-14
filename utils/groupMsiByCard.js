const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, '-');

const parseDateMs = (value) => {
  if(value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if(value && typeof value.toDate === 'function'){
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : Number.POSITIVE_INFINITY;
  }
  if(typeof value === 'string' && value.trim()){
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.getTime() : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
};

const getRemainingInstallments = (item) => {
  const candidates = [item?.remainingInstallments, item?.remaining];
  for(const candidate of candidates){
    const n = Number(candidate);
    if(Number.isFinite(n)) return Math.max(0, n);
  }
  return 0;
};

const getMonthlyPayment = (item) => {
  const candidates = [item?.monthlyPayment, item?.monthly, item?.msiMonthly];
  for(const candidate of candidates){
    const n = Number(candidate);
    if(Number.isFinite(n)) return n;
  }
  return 0;
};

export const getMsiCardGroupKey = (item = {}) => {
  const stableId = item.cardId ?? item.creditCardId ?? item.accountId ?? item.targetCardId ?? null;
  if(stableId != null && String(stableId).trim()) return `card:${String(stableId).trim()}`;
  const fallbackName = item.cardName || item.targetCardName || item.bankName || item.bank || 'Dato no disponible';
  return `fallback:${normalizeKey(fallbackName) || 'dato-no-disponible'}`;
};

const compareNearest = (a, b) => {
  const remainingDiff = getRemainingInstallments(a) - getRemainingInstallments(b);
  if(remainingDiff !== 0) return remainingDiff;
  return parseDateMs(a?.endDate ?? a?.estimatedEndDate) - parseDateMs(b?.endDate ?? b?.estimatedEndDate);
};

const compareLatest = (a, b) => {
  const remainingDiff = getRemainingInstallments(b) - getRemainingInstallments(a);
  if(remainingDiff !== 0) return remainingDiff;
  return parseDateMs(b?.endDate ?? b?.estimatedEndDate) - parseDateMs(a?.endDate ?? a?.estimatedEndDate);
};

export const groupMsiByCard = (items = []) => {
  const groups = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = getMsiCardGroupKey(item);
    if(!groups.has(key)){
      const displayName = item?.cardName || item?.targetCardName || item?.bankName || item?.bank || 'Dato no disponible';
      groups.set(key, {
        key,
        cardId: item?.cardId ?? item?.creditCardId ?? item?.accountId ?? item?.targetCardId ?? null,
        cardName: displayName,
        usesFallbackKey: key.startsWith('fallback:'),
        monthlyLoad: 0,
        activeCount: 0,
        pendingBalance: 0,
        nearestItem: null,
        latestItem: null,
        items: []
      });
    }
    const group = groups.get(key);
    const monthlyPayment = getMonthlyPayment(item);
    const remainingInstallments = getRemainingInstallments(item);
    const status = String(item?.status || (remainingInstallments > 0 ? 'active' : 'done')).toLowerCase();
    group.items.push(item);
    group.monthlyLoad += monthlyPayment;
    group.pendingBalance += monthlyPayment * remainingInstallments;
    if(status === 'active' || remainingInstallments > 0) group.activeCount += 1;
    if(!group.nearestItem || compareNearest(item, group.nearestItem) < 0) group.nearestItem = item;
    if(!group.latestItem || compareLatest(item, group.latestItem) < 0) group.latestItem = item;
  });

  return Array.from(groups.values())
    .filter((group) => group.activeCount > 0)
    .sort((a, b) => (b.monthlyLoad - a.monthlyLoad) || (b.pendingBalance - a.pendingBalance) || String(a.cardName).localeCompare(String(b.cardName), 'es'));
};
