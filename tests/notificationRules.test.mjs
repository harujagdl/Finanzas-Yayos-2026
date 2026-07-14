import assert from 'node:assert/strict';
import { buildCardNotifications, buildBudgetNotification, buildCoverageNotification, calculatePendingPayment, getBudgetLevel, toLocalDateKey } from '../utils/notificationRules.js';

const now = new Date('2026-07-14T14:00:00.000Z');
const prefs = { timezone: 'America/Mexico_City' };
const card = { id: 'costco', name: 'Costco', closingDay: 17, dueDay: 21, paymentToAvoidInterest: 1000, currentCycleSpend: 18430.2 };

assert.equal(toLocalDateKey(now, 'America/Mexico_City'), '2026-07-14');
assert.equal(buildCardNotifications({ cards: [card], preferences: prefs, now }).find((n) => n.type === 'CARD_CUTOFF_REMINDER')?.deduplicationKey, 'cutoff:default:costco:2026-07-17:3');
assert.ok(buildCardNotifications({ cards: [{ ...card, closingDay: 15 }], preferences: prefs, now }).some((n) => n.title.includes('Mañana corta')));
assert.ok(buildCardNotifications({ cards: [{ ...card, closingDay: 14 }], preferences: prefs, now }).some((n) => n.title.includes('Hoy corta')));
assert.ok(buildCardNotifications({ cards: [card], preferences: prefs, now }).some((n) => n.title.includes('Faltan 7 días')));
assert.ok(buildCardNotifications({ cards: [{ ...card, dueDay: 15 }], preferences: prefs, now }).some((n) => n.title.includes('vence mañana')));
assert.ok(!buildCardNotifications({ cards: [{ ...card, dueDay: 15 }], payments: [{ cardId: 'costco', amount: 1000 }], preferences: prefs, now }).some((n) => n.type.includes('PAYMENT')));
assert.ok(buildCardNotifications({ cards: [{ ...card, dueDay: 13 }], preferences: { ...prefs, paymentReminders: { daysBefore: [] } }, now }).some((n) => n.type === 'CARD_PAYMENT_OVERDUE'));
assert.equal(calculatePendingPayment(card, [{ cardId: 'costco', amount: 400 }]), 600);
assert.equal(calculatePendingPayment(card, [{ id: 'p1', cardId: 'costco', amount: 700 }]), 300);
assert.equal(calculatePendingPayment(card, []), 1000);

assert.equal(getBudgetLevel(890, 1000)?.level, undefined);
assert.equal(getBudgetLevel(910, 1000).level, 'warning');
assert.equal(getBudgetLevel(1010, 1000).level, 'exceeded');
assert.equal(getBudgetLevel(1110, 1000).level, 'critical');
assert.ok(buildBudgetNotification({ summary: { monthKey: '2026-07', projectedSpend: 910, monthlyBudget: 1000 }, preferences: prefs, now }));
assert.equal(buildBudgetNotification({ summary: { monthKey: '2026-07', projectedSpend: 910, monthlyBudget: 1000 }, preferences: prefs, now, previousLog: { deduplicationKey: 'budget:default:2026-07:warning', ratio: 0.91 } }), null);
assert.ok(buildBudgetNotification({ summary: { monthKey: '2026-07', projectedSpend: 1010, monthlyBudget: 1000 }, preferences: prefs, now }));
assert.equal(buildCoverageNotification({ summary: { cardsPending: 1000, availableCash: 1000 }, preferences: prefs, now }), null);
assert.equal(buildCoverageNotification({ summary: { cardsPending: 1000, availableCash: 900 }, preferences: prefs, now }).type, 'CARD_COVERAGE_LOW');
assert.equal(buildCoverageNotification({ summary: { cardsPending: 1000, availableCash: 700 }, preferences: prefs, now }).type, 'CARD_COVERAGE_CRITICAL');
assert.equal(buildCoverageNotification({ summary: { cardsPending: 0, availableCash: 0 }, preferences: prefs, now }), null);
assert.equal(buildCardNotifications({ cards: [card], preferences: { ...prefs, enabled: false }, now }).length, 0);
assert.equal(buildCardNotifications({ cards: [{ ...card, closingDay: 31 }], preferences: prefs, now: new Date('2026-02-27T14:00:00Z') }).some((n) => n.deduplicationKey.includes('2026-02-28')), true);
assert.equal(buildCardNotifications({ cards: [{ ...card, closingDay: 31 }], preferences: prefs, now: new Date('2024-02-28T14:00:00Z') }).some((n) => n.deduplicationKey.includes('2024-02-29')), true);
assert.equal(buildCardNotifications({ cards: [{ ...card, closingDay: 2 }], preferences: prefs, now: new Date('2026-12-30T14:00:00Z') }).some((n) => n.deduplicationKey.includes('2027-01-02')), true);
