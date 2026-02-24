const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

export const safeDay = (year, monthIndex, day) => {
  const fallbackDay = Number.isFinite(Number(day)) ? Math.max(1, Number(day)) : 1;
  const maxDay = daysInMonth(year, monthIndex);
  return new Date(year, monthIndex, Math.min(fallbackDay, maxDay), 0, 0, 0, 0);
};

export const getCycleWindow = (nowDate = new Date(), closingDay = 1) => {
  const now = new Date(nowDate);
  now.setHours(0, 0, 0, 0);

  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const endCandidate = safeDay(nowYear, nowMonth, closingDay);
  const cycleEndExclusive = now < endCandidate
    ? endCandidate
    : safeDay(nowYear, nowMonth + 1, closingDay);

  const cycleStart = safeDay(
    cycleEndExclusive.getFullYear(),
    cycleEndExclusive.getMonth() - 1,
    closingDay
  );

  return { start: cycleStart, endExclusive: cycleEndExclusive };
};
