const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const NOTIFICATION_TYPES = Object.freeze({
  CARD_CUTOFF_REMINDER: 'CARD_CUTOFF_REMINDER',
  CARD_PAYMENT_REMINDER: 'CARD_PAYMENT_REMINDER',
  CARD_PAYMENT_DUE_TODAY: 'CARD_PAYMENT_DUE_TODAY',
  CARD_PAYMENT_OVERDUE: 'CARD_PAYMENT_OVERDUE',
  BUDGET_WARNING: 'BUDGET_WARNING',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  BUDGET_CRITICAL: 'BUDGET_CRITICAL',
  CARD_COVERAGE_LOW: 'CARD_COVERAGE_LOW',
  CARD_COVERAGE_CRITICAL: 'CARD_COVERAGE_CRITICAL'
});

export const defaultNotificationPreferences = Object.freeze({
  enabled: true,
  timezone: 'America/Mexico_City',
  cutoffReminders: { enabled: true, daysBefore: [3, 1, 0] },
  paymentReminders: { enabled: true, daysBefore: [7, 3, 1, 0] },
  overdueAlerts: { enabled: true, daysAfter: [1, 3] },
  positiveCoveredPaymentAlerts: { enabled: false },
  budgetAlerts: { enabled: true, warningThreshold: 0.9, exceededThreshold: 1, criticalThreshold: 1.1, resendDeltaRatio: 0.05 },
  coverageAlerts: { enabled: true, lowThreshold: 0.8, criticalThreshold: 0.8 },
  quietHours: { enabled: true, start: '21:00', end: '08:00' },
  notificationPrivacy: 'full'
});

export const mergeNotificationPreferences = (preferences = {}) => ({
  ...defaultNotificationPreferences,
  ...preferences,
  cutoffReminders: { ...defaultNotificationPreferences.cutoffReminders, ...(preferences.cutoffReminders || {}) },
  paymentReminders: { ...defaultNotificationPreferences.paymentReminders, ...(preferences.paymentReminders || {}) },
  overdueAlerts: { ...defaultNotificationPreferences.overdueAlerts, ...(preferences.overdueAlerts || {}) },
  budgetAlerts: { ...defaultNotificationPreferences.budgetAlerts, ...(preferences.budgetAlerts || {}) },
  coverageAlerts: { ...defaultNotificationPreferences.coverageAlerts, ...(preferences.coverageAlerts || {}) },
  quietHours: { ...defaultNotificationPreferences.quietHours, ...(preferences.quietHours || {}) },
  positiveCoveredPaymentAlerts: { ...defaultNotificationPreferences.positiveCoveredPaymentAlerts, ...(preferences.positiveCoveredPaymentAlerts || {}) }
});

export const toLocalDateKey = (date = new Date(), timezone = 'America/Mexico_City') => new Intl.DateTimeFormat('en-CA', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);

export const toMonthKey = (date = new Date(), timezone = 'America/Mexico_City') => toLocalDateKey(date, timezone).slice(0, 7);

export const safeCycleDateKey = (year, monthIndex, day) => {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const normalizedYear = firstOfMonth.getUTCFullYear();
  const normalizedMonthIndex = firstOfMonth.getUTCMonth();
  const safeDay = Math.min(Math.max(Number.parseInt(day, 10) || 1, 1), new Date(Date.UTC(normalizedYear, normalizedMonthIndex + 1, 0)).getUTCDate());
  return `${normalizedYear}-${String(normalizedMonthIndex + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

const parseDateKeyAsUtc = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export const daysBetweenDateKeys = (fromDateKey, toDateKey) => Math.round((parseDateKeyAsUtc(toDateKey) - parseDateKeyAsUtc(fromDateKey)) / MS_PER_DAY);

export const currentCycleDateKey = (day, todayKey) => {
  const [year, month] = todayKey.split('-').map(Number);
  return safeCycleDateKey(year, month - 1, day);
};

export const nextCycleDateKey = (day, todayKey) => {
  const currentMonthKey = currentCycleDateKey(day, todayKey);
  const [year, month] = todayKey.split('-').map(Number);
  return daysBetweenDateKeys(todayKey, currentMonthKey) >= 0 ? currentMonthKey : safeCycleDateKey(year, month, day);
};

const formatMoney = (amount) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount) || 0);

const sanitize = ({ title, body }, privacy = 'full') => {
  if (privacy === 'private') return { title: 'Tienes una alerta financiera', body: 'Abre PocketFlow para revisar el detalle.' };
  if (privacy === 'limited') return { title, body: 'Abre PocketFlow para revisar importes y detalles.' };
  return { title, body };
};

const cardName = (card) => card?.name || card?.bank || card?.cardName || 'tu tarjeta';
const amount = (value) => Math.max(Number(value) || 0, 0);

export const calculatePendingPayment = (card = {}, payments = []) => {
  const target = amount(card.paymentToAvoidInterest ?? card.payGoal ?? card.paymentGoal ?? card.montoCiclo);
  const cardId = card.id || card.cardId;
  const paid = payments.reduce((sum, payment) => {
    const paymentCardId = payment.targetCardId || payment.cardId || payment.card;
    if (cardId && paymentCardId && paymentCardId !== cardId) return sum;
    return sum + amount(payment.amount ?? payment.monto);
  }, 0);
  return Math.max(target - paid, 0);
};

export const buildCardNotifications = ({ cards = [], payments = [], preferences = {}, now = new Date(), workspaceId = 'default' } = {}) => {
  const prefs = mergeNotificationPreferences(preferences);
  if (!prefs.enabled) return [];
  const todayKey = toLocalDateKey(now, prefs.timezone);
  const notifications = [];

  for (const card of cards.filter((item) => item && item.active !== false)) {
    const name = cardName(card);
    const entityId = card.id || name;
    const privacy = prefs.notificationPrivacy;
    const cutDay = card.closingDay ?? card.cutDay;
    if (prefs.cutoffReminders.enabled && Number.isFinite(Number(cutDay))) {
      const cutKey = nextCycleDateKey(cutDay, todayKey);
      const diff = daysBetweenDateKeys(todayKey, cutKey);
      if ((prefs.cutoffReminders.daysBefore || []).includes(diff)) {
        const text = diff === 0 ? `Hoy corta tu tarjeta ${name}` : diff === 1 ? `Mañana corta tu tarjeta ${name}` : `Faltan ${diff} días para el corte de ${name}`;
        notifications.push({
          type: NOTIFICATION_TYPES.CARD_CUTOFF_REMINDER,
          entityId,
          workspaceId,
          scheduledDate: todayKey,
          targetRoute: `/cards/${entityId}?tab=current-cycle`,
          deduplicationKey: `cutoff:${workspaceId}:${entityId}:${cutKey}:${diff}`,
          ...sanitize({ title: text, body: `Llevas ${formatMoney(card.currentCycleSpend ?? card.balance ?? 0)} registrados en el ciclo actual.` }, privacy)
        });
      }
    }

    const dueDay = card.dueDay ?? card.payDay;
    const pendingPayment = calculatePendingPayment(card, payments);
    if (Number.isFinite(Number(dueDay))) {
      const dueKey = nextCycleDateKey(dueDay, todayKey);
      const diff = daysBetweenDateKeys(todayKey, dueKey);
      if (pendingPayment > 0 && prefs.paymentReminders.enabled && (prefs.paymentReminders.daysBefore || []).includes(diff)) {
        const type = diff === 0 ? NOTIFICATION_TYPES.CARD_PAYMENT_DUE_TODAY : NOTIFICATION_TYPES.CARD_PAYMENT_REMINDER;
        const title = diff === 0 ? `Hoy vence ${name}` : diff === 1 ? `${name} vence mañana` : `Faltan ${diff} días para pagar ${name}`;
        notifications.push({ type, entityId, workspaceId, scheduledDate: todayKey, targetRoute: `/cards/${entityId}`, deduplicationKey: `payment:${workspaceId}:${entityId}:${dueKey}:${diff}:${pendingPayment.toFixed(2)}`, ...sanitize({ title, body: `Pendiente para no generar intereses: ${formatMoney(pendingPayment)}.` }, privacy) });
      }

      const overdueDueKey = currentCycleDateKey(dueDay, todayKey);
      const daysOverdue = daysBetweenDateKeys(overdueDueKey, todayKey);
      if (pendingPayment > 0 && prefs.overdueAlerts.enabled && daysOverdue > 0 && (prefs.overdueAlerts.daysAfter || []).includes(daysOverdue)) {
        notifications.push({ type: NOTIFICATION_TYPES.CARD_PAYMENT_OVERDUE, entityId, workspaceId, scheduledDate: todayKey, targetRoute: `/cards/${entityId}`, deduplicationKey: `overdue:${workspaceId}:${entityId}:${overdueDueKey}:${daysOverdue}:${pendingPayment.toFixed(2)}`, ...sanitize({ title: `Pago pendiente de ${name}`, body: `El vencimiento fue hace ${daysOverdue} día${daysOverdue === 1 ? '' : 's'} y quedan ${formatMoney(pendingPayment)} sin cubrir.` }, privacy) });
      }
    }
  }
  return notifications;
};

export const getBudgetLevel = (projectedSpend, monthlyBudget, thresholds = defaultNotificationPreferences.budgetAlerts) => {
  if (!(monthlyBudget > 0)) return null;
  const ratio = projectedSpend / monthlyBudget;
  if (ratio >= thresholds.criticalThreshold) return { level: 'critical', type: NOTIFICATION_TYPES.BUDGET_CRITICAL, ratio };
  if (ratio >= thresholds.exceededThreshold) return { level: 'exceeded', type: NOTIFICATION_TYPES.BUDGET_EXCEEDED, ratio };
  if (ratio >= thresholds.warningThreshold) return { level: 'warning', type: NOTIFICATION_TYPES.BUDGET_WARNING, ratio };
  return null;
};

export const buildBudgetNotification = ({ summary = {}, preferences = {}, now = new Date(), workspaceId = 'default', previousLog = null } = {}) => {
  const prefs = mergeNotificationPreferences(preferences);
  if (!prefs.enabled || !prefs.budgetAlerts.enabled) return null;
  const monthKey = summary.monthKey || toMonthKey(now, prefs.timezone);
  const level = getBudgetLevel(amount(summary.projectedSpend), amount(summary.monthlyBudget), prefs.budgetAlerts);
  if (!level) return null;
  const deduplicationKey = `budget:${workspaceId}:${monthKey}:${level.level}`;
  if (previousLog?.deduplicationKey === deduplicationKey && Math.abs((level.ratio || 0) - (previousLog.ratio || 0)) < prefs.budgetAlerts.resendDeltaRatio) return null;
  const over = Math.max(amount(summary.projectedSpend) - amount(summary.monthlyBudget), 0);
  const copy = level.level === 'warning'
    ? { title: 'Te estás acercando a tu límite mensual', body: `Al ritmo actual cerrarías en ${formatMoney(summary.projectedSpend)} de un objetivo de ${formatMoney(summary.monthlyBudget)}.` }
    : level.level === 'exceeded'
      ? { title: 'Tu proyección ya supera el presupuesto', body: `Cerrarías en ${formatMoney(summary.projectedSpend)}, aproximadamente ${formatMoney(over)} arriba del objetivo.` }
      : { title: 'Alerta de gasto mensual', body: `Tu proyección es ${formatMoney(summary.projectedSpend)}, ${(level.ratio * 100 - 100).toFixed(1)}% arriba del presupuesto.` };
  return { type: level.type, entityId: monthKey, workspaceId, scheduledDate: toLocalDateKey(now, prefs.timezone), targetRoute: '/budget', deduplicationKey, ratio: level.ratio, ...sanitize(copy, prefs.notificationPrivacy) };
};

export const buildCoverageNotification = ({ summary = {}, preferences = {}, now = new Date(), workspaceId = 'default' } = {}) => {
  const prefs = mergeNotificationPreferences(preferences);
  if (!prefs.enabled || !prefs.coverageAlerts.enabled) return null;
  const pending = amount(summary.cardsPending ?? summary.totalPendingCards);
  const available = amount(summary.availableCash ?? summary.availableForCards);
  if (pending === 0) return null;
  const ratio = available / pending;
  if (ratio >= 1) return null;
  const critical = ratio < 0.8;
  return { type: critical ? NOTIFICATION_TYPES.CARD_COVERAGE_CRITICAL : NOTIFICATION_TYPES.CARD_COVERAGE_LOW, entityId: summary.monthKey || toMonthKey(now, prefs.timezone), workspaceId, scheduledDate: toLocalDateKey(now, prefs.timezone), targetRoute: '/dashboard?section=coverage', deduplicationKey: `coverage:${workspaceId}:${summary.monthKey || toMonthKey(now, prefs.timezone)}:${critical ? 'critical' : 'low'}:${pending.toFixed(2)}:${available.toFixed(2)}`, ratio, ...sanitize({ title: critical ? 'Cobertura crítica de tarjetas' : 'Tu cobertura de tarjetas bajó', body: `Tienes ${formatMoney(available)} disponibles frente a ${formatMoney(pending)} por pagar. Faltan ${formatMoney(pending - available)}.` }, prefs.notificationPrivacy) };
};
