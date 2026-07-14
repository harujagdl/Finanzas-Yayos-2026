const toLocalDate = (value) => {
  if(value instanceof Date && Number.isFinite(value.getTime())) return new Date(value);
  if(typeof value === 'string'){
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0, 0);
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(NaN);
};

const safeCutoffDate = (year, monthIndex, cutoffDay) => {
  const normalized = Number.isFinite(Number(cutoffDay)) ? Math.max(1, Math.trunc(Number(cutoffDay))) : 1;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(normalized, lastDay), 12, 0, 0, 0);
};

const addLocalMonths = (date, monthsToAdd) => {
  const base = toLocalDate(date);
  const d = new Date(base.getFullYear(), base.getMonth() + Number(monthsToAdd || 0), 1, 12, 0, 0, 0);
  d.setDate(Math.min(base.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
};

const monthsBetweenYearMonth = (from, to) => ((to.getFullYear() - from.getFullYear()) * 12) + (to.getMonth() - from.getMonth());

export const getMsiFirstCycleDate = (purchaseDate, cutoffDay) => {
  const purchase = toLocalDate(purchaseDate);
  if(Number.isNaN(purchase.getTime())) return null;
  const cut = Number(cutoffDay);
  if(!Number.isFinite(cut) || cut < 1 || cut > 31) return null;
  let cycle = safeCutoffDate(purchase.getFullYear(), purchase.getMonth(), cut);
  if(purchase.getDate() > cycle.getDate()) cycle = safeCutoffDate(purchase.getFullYear(), purchase.getMonth() + 1, cut);
  return cycle;
};

export const calculateMsiProgressCore = ({ purchaseDate, totalInstallments, anchorDate = new Date(), cutoffDay = null, currentInstallment = null } = {}) => {
  const term = Number.parseInt(totalInstallments, 10);
  const start = toLocalDate(purchaseDate);
  const anchor = toLocalDate(anchorDate || new Date());
  const manual = currentInstallment === '' || currentInstallment == null ? null : Number.parseInt(currentInstallment, 10);
  if(!Number.isFinite(term) || term <= 0 || Number.isNaN(start.getTime())){
    return { currentInstallment: null, remainingInstallments: null, status: 'REVISAR', estimatedEndDate: null, isEstimated: true, firstCycleDate: null, lastCycleDate: null };
  }

  const hasCutoff = Number.isFinite(Number(cutoffDay)) && Number(cutoffDay) >= 1 && Number(cutoffDay) <= 31;
  const firstCycleDate = hasCutoff ? getMsiFirstCycleDate(start, cutoffDay) : new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  let generatedCycles = 0;
  if(!Number.isNaN(anchor.getTime())){
    if(hasCutoff){
      for(let i = 0; i < term; i += 1){
        const cycle = safeCutoffDate(firstCycleDate.getFullYear(), firstCycleDate.getMonth() + i, cutoffDay);
        if(cycle <= anchor) generatedCycles = i + 1;
      }
    }else{
      generatedCycles = monthsBetweenYearMonth(firstCycleDate, anchor);
    }
  }

  const automaticCurrent = Math.min(Math.max(generatedCycles, 0), term);
  const boundedManual = Number.isFinite(manual) ? Math.min(Math.max(manual, 0), term) : null;
  const effectiveCurrent = boundedManual != null ? boundedManual : automaticCurrent;
  const lastCycleDate = hasCutoff ? safeCutoffDate(firstCycleDate.getFullYear(), firstCycleDate.getMonth() + term - 1, cutoffDay) : addLocalMonths(firstCycleDate, term - 1);

  return {
    currentInstallment: effectiveCurrent,
    remainingInstallments: Math.max(term - effectiveCurrent, 0),
    status: effectiveCurrent >= term ? 'LIQUIDADO' : (hasCutoff ? 'ACTIVO' : 'REVISAR'),
    estimatedEndDate: lastCycleDate,
    isEstimated: !hasCutoff,
    firstCycleDate,
    lastCycleDate
  };
};
