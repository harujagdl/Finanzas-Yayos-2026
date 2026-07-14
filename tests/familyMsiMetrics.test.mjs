import assert from 'node:assert/strict';
import { calculateFilteredFamilyMsiMetrics } from '../utils/familyMsiMetrics.js';

const items = [
  { title: 'Costco Yair', monthlyPayment: 1000, remaining: 3, endDate: '2026-09-15' },
  { title: 'Estufa', monthlyPayment: 750.5, remainingInstallments: 1, endDate: '2026-07-20' },
  { title: 'Liquidado', monthlyPayment: 250, remaining: 0, endDate: '2026-06-01' }
];

{
  const result = calculateFilteredFamilyMsiMetrics(items.slice(0, 2), { familyMonthlyLoad: 7002 });
  assert.equal(result.monthlyLoad, 1750.5);
  assert.equal(result.activeCount, 2);
  assert.equal(result.pendingBalance, 3750.5);
  assert.equal(result.nearestEndDate, '2026-07-20');
  assert.equal(result.latestEndDate, '2026-09-15');
  assert.equal(Math.round(result.familyLoadShare * 10) / 10, 25);
}

{
  const result = calculateFilteredFamilyMsiMetrics([]);
  assert.equal(result.monthlyLoad, 0);
  assert.equal(result.activeCount, 0);
  assert.equal(result.pendingBalance, 0);
  assert.equal(result.nearestEndDate, '');
  assert.equal(result.latestEndDate, '');
  assert.equal(result.familyLoadShare, null);
}

{
  const result = calculateFilteredFamilyMsiMetrics([items[2]], { familyMonthlyLoad: 0 });
  assert.equal(result.monthlyLoad, 250);
  assert.equal(result.activeCount, 1);
  assert.equal(result.pendingBalance, 0);
  assert.equal(result.nearestEndDate, '2026-06-01');
  assert.equal(result.familyLoadShare, null);
}
