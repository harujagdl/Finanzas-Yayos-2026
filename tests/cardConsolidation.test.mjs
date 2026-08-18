import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCardLogicalKey } from '../utils/cardCanonicalKey.js';
import { consolidateCards, hasLogicalCardName, resolveLogicalCardConfiguration, resolveTransactionCardAliases, summarizeTransactionsByLogicalCard } from '../utils/cardConsolidation.js';

test('variantes de Costco producen la misma logicalKey', () => {
  const variants = ['Costco', 'costco', ' Costco ', 'COSTCO', 'Cost.co!'];
  assert.deepEqual(new Set(variants.map((name) => buildCardLogicalKey('Yair', name))), new Set(['yair__costco']));
});

test('consolida documentos, selector lógico y aliases con canonical estable', () => {
  const cards = [
    { id: 'z', owner: 'yair', name: 'Costco', balance: 10 },
    { id: 'a', owner: 'yair', name: ' COSTCO ', balance: 10 }
  ];
  const { originalCards, logicalCards, cardAliasToCanonical } = consolidateCards(cards, { warn: () => {} });
  assert.equal(originalCards.length, 2);
  assert.equal(logicalCards.length, 1);
  assert.equal(logicalCards[0].id, 'a');
  assert.deepEqual(cardAliasToCanonical, { a: 'a', z: 'a' });
});

test('movimientos de aliases se consolidan una vez en el resumen', () => {
  const aliases = { old: 'canonical', canonical: 'canonical' };
  const normalized = resolveTransactionCardAliases({ id: 't1', cardId: 'old', amount: 4000 }, aliases);
  assert.equal(normalized.cardId, 'canonical');
  const summary = summarizeTransactionsByLogicalCard([
    { id: 't1', cardId: 'old', amount: 4000 },
    { id: 't2', cardId: 'canonical', amount: 4700 }
  ], aliases);
  assert.deepEqual(summary.canonical, { cardId: 'canonical', amount: 8700, count: 2 });
});

test('rechaza duplicado del mismo owner pero permite otro owner', () => {
  const cards = [{ id: 'a', owner: 'yair', name: 'Costco' }];
  assert.equal(hasLogicalCardName(cards, 'yair', ' COSTCO '), true);
  assert.equal(hasLogicalCardName(cards, 'haru', 'costco'), false);
});

test('Costco conserva identidad única, configuración vigente y abonos de todos los aliases', () => {
  const documents = [
    { id: 'costco-a', owner: 'yair', name: 'Costco', payGoal: 0, balance: 0 },
    { id: 'costco-b', owner: 'yair', name: ' COSTCO ', payGoal: 16461.94, closingDay: 8, dueDay: 28, cycleMode: 'billing' }
  ];
  const { logicalCards, cardAliasToCanonical } = consolidateCards(documents, { warn: () => {} });
  const history = summarizeTransactionsByLogicalCard([
    { cardId: 'costco-a', amount: 4000 },
    { cardId: 'costco-b', amount: 4700 }
  ], cardAliasToCanonical);

  assert.equal(logicalCards.length, 1);
  assert.equal(logicalCards[0].canonicalId, 'costco-a');
  assert.equal(logicalCards[0].configurationSourceId, 'costco-b');
  assert.equal(logicalCards[0].payGoal, 16461.94);
  assert.equal(logicalCards[0].closingDay, 8);
  assert.equal(logicalCards[0].dueDay, 28);
  assert.equal(history['costco-a'].amount, 8700);
  assert.equal(Math.round((logicalCards[0].payGoal - history['costco-a'].amount) * 100) / 100, 7761.94);
});

test('Free y Like u toman el objetivo positivo aunque el canonical tenga cero o vacío', () => {
  const { logicalCards } = consolidateCards([
    { id: 'free-a', owner: 'yair', name: 'Free', payGoal: 0 },
    { id: 'free-b', owner: 'yair', name: ' free ', paymentTarget: 324.90 },
    { id: 'like-a', owner: 'yair', name: 'Like u', payGoal: '' },
    { id: 'like-b', owner: 'yair', name: 'LIKE-U', paymentGoal: 10098.59 }
  ], { warn: () => {} });

  assert.equal(logicalCards.length, 2);
  assert.equal(logicalCards.find((card) => card.logicalKey.endsWith('__free')).payGoal, 324.90);
  assert.equal(logicalCards.find((card) => card.logicalKey.endsWith('__likeu')).payGoal, 10098.59);
});

test('Mercado Pago sin conflicto conserva su configuración', () => {
  const card = { id: 'mp', owner: 'yair', name: 'Mercado Pago', payGoal: 5123.88, balance: 1200, limit: 20000 };
  const [logical] = consolidateCards([card], { warn: () => {} }).logicalCards;
  assert.equal(logical.payGoal, 5123.88);
  assert.equal(logical.balance, 1200);
  assert.equal(logical.limit, 20000);
});

test('días válidos prefieren el alias que también tiene objetivo y metadata reciente desempata', () => {
  const resolved = resolveLogicalCardConfiguration([
    { id: 'a', payGoal: 0, closingDay: 2, dueDay: 20, updatedAt: '2026-08-18T00:00:00Z' },
    { id: 'b', payGoal: 100, closingDay: 5, dueDay: 25, updatedAt: '2026-01-01T00:00:00Z' }
  ]);
  assert.equal(resolved.payGoal, 100);
  assert.equal(resolved.closingDay, 5);
  assert.equal(resolved.dueDay, 25);
});
