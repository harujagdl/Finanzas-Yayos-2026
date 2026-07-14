import assert from 'node:assert/strict';
import { groupMsiByCard } from '../utils/groupMsiByCard.js';

const grouped = groupMsiByCard([
  { concept: 'Airbnb', cardId: 'like-1', cardName: 'LIKE U', monthlyPayment: 100, remainingInstallments: 2, endDate: '2026-08-01', status: 'active' },
  { concept: 'TV', cardId: 'like-1', cardName: 'LIKE U', monthlyPayment: 200, remainingInstallments: 10, endDate: '2027-04-01', status: 'active' },
  { concept: 'Jungle', cardId: 'costco-1', cardName: 'COSTCO', monthlyPayment: 50, remainingInstallments: 1, endDate: '2026-07-20', status: 'active' },
  { concept: 'Banco A', cardId: 'bbva-1', cardName: 'BBVA', monthlyPayment: 25, remainingInstallments: 3, status: 'active' },
  { concept: 'Banco B', cardId: 'bbva-2', cardName: 'BBVA', monthlyPayment: 20, remainingInstallments: 4, status: 'active' },
  { concept: 'Sin ID', cardName: 'Banco Ñ', monthlyPayment: 10, remainingInstallments: 1, status: 'active' }
]);

assert.equal(grouped.length, 5);
assert.equal(grouped[0].cardName, 'LIKE U');
assert.equal(grouped[0].monthlyLoad, 300);
assert.equal(grouped[0].activeCount, 2);
assert.equal(grouped[0].pendingBalance, 2200);
assert.equal(grouped[0].nearestItem.concept, 'Airbnb');
assert.equal(grouped[0].latestItem.concept, 'TV');
assert.equal(grouped.filter((group) => group.cardName === 'BBVA').length, 2);
assert.equal(grouped.find((group) => group.cardName === 'Banco Ñ').usesFallbackKey, true);

const doneOnly = groupMsiByCard([{ cardId: 'done', cardName: 'Done', monthlyPayment: 100, remainingInstallments: 0, status: 'done' }]);
assert.equal(doneOnly.length, 0);
