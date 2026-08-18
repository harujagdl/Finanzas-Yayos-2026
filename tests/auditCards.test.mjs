import assert from 'node:assert/strict';
import test from 'node:test';
import { auditCards, normalizeExport } from '../scripts/audit-cards.mjs';
import { buildCardCanonicalKey, normalizeCardName } from '../utils/cardCanonicalKey.js';

test('normaliza espacios, mayúsculas, acentos y puntuación', () => {
  assert.equal(normalizeCardName('  LÍKE   U! '), 'likeu');
  assert.equal(buildCardCanonicalKey(' Yáir ', ' Costco '), 'yair__costco');
});

test('separa la misma tarjeta para owners diferentes', () => {
  assert.notEqual(buildCardCanonicalKey('yair', 'Costco'), buildCardCanonicalKey('haru', 'Costco'));
});

test('cuenta referencias por ID y evita propuesta ante conflicto', () => {
  const report = auditCards({
    cards: [
      { id: 'a', owner: 'yair', name: 'Costco', balance: 0 },
      { id: 'b', owner: 'yair', name: ' COSTCO ', balance: 100 }
    ],
    expenses: [
      { id: 'e1', owner: 'yair', cardId: 'a', isMsi: true },
      { id: 'e2', owner: 'yair', targetCardId: 'b', type: 'card_payment' }
    ]
  });
  assert.equal(report.summary.duplicateGroups, 1);
  assert.equal(report.duplicateGroups[0].documents[0].references.total, 1);
  assert.equal(report.duplicateGroups[0].status, 'REQUIRES_MANUAL_REVIEW');
  assert.deepEqual(report.duplicateGroups[0].proposedMapping, {});
});

test('acepta documentos con formato REST de Firestore', () => {
  const result = normalizeExport({ cards: { documents: [{ name: 'projects/p/databases/(default)/documents/cards/a', fields: { owner: { stringValue: 'yair' }, name: { stringValue: 'Free' } } }] } });
  assert.deepEqual(result.cards[0], { id: 'a', owner: 'yair', name: 'Free', _collection: 'cards' });
});
