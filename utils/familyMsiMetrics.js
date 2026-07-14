const toFiniteNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const parseDateValue = (value) => {
  if(value instanceof Date && Number.isFinite(value.getTime())) return value;
  if(typeof value === 'string' && value.trim()){
    const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0, 0);
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
};

const formatDateKey = (date) => {
  if(!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const calculateFilteredFamilyMsiMetrics = (filteredMsiItems = [], { familyMonthlyLoad = 0 } = {}) => {
  const items = Array.isArray(filteredMsiItems) ? filteredMsiItems : [];
  const endDates = items
    .map((item) => parseDateValue(item?.endDate))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const monthlyLoad = items.reduce((sum, item) => sum + toFiniteNumber(item?.monthlyPayment), 0);
  const pendingBalance = items.reduce((sum, item) => {
    const remaining = Number.isFinite(Number(item?.remainingInstallments))
      ? Number(item.remainingInstallments)
      : Number.isFinite(Number(item?.remaining))
        ? Number(item.remaining)
        : Math.max(0, toFiniteNumber(item?.monthsTotal) - toFiniteNumber(item?.monthsPaid));
    return sum + (toFiniteNumber(item?.monthlyPayment) * Math.max(0, remaining));
  }, 0);
  const familyLoad = toFiniteNumber(familyMonthlyLoad);

  return {
    monthlyLoad,
    activeCount: items.length,
    pendingBalance,
    nearestEndDate: endDates.length ? formatDateKey(endDates[0]) : '',
    latestEndDate: endDates.length ? formatDateKey(endDates[endDates.length - 1]) : '',
    familyLoadShare: familyLoad > 0 ? (monthlyLoad / familyLoad) * 100 : null
  };
};
