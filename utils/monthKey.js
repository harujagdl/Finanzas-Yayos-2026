export function getLocalMonthKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isValidMonthKey(value) {
  if(typeof value !== "string") return false;
  const trimmed = value.trim();
  if(!/^\d{4}-\d{2}$/.test(trimmed)) return false;
  const month = Number(trimmed.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function addMonths(monthKey, delta = 0) {
  if(!isValidMonthKey(monthKey)) return getLocalMonthKey();
  const [year, month] = monthKey.split("-").map(Number);
  const base = new Date(year, month - 1, 1, 0, 0, 0, 0);
  base.setMonth(base.getMonth() + Number(delta || 0));
  return getLocalMonthKey(base);
}
