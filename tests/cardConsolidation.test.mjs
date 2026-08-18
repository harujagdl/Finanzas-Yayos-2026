import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCardLogicalKey } from '../utils/cardCanonicalKey.js';
import { consolidateCards, hasLogicalCardName, resolveTransactionCardAliases, summarizeTransactionsByLogicalCard } from '../utils/cardConsolidation.js';

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
