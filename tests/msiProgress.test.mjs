import assert from 'node:assert/strict';
import { calculateMsiProgressCore } from '../utils/msiProgress.js';

const iso = (date) => date.toISOString().slice(0, 10);

{
  const result = calculateMsiProgressCore({
    purchaseDate: '2025-11-19',
    totalInstallments: 9,
    anchorDate: '2026-07-14',
    cutoffDay: 20
  });
  assert.equal(result.currentInstallment, 8);
  assert.equal(result.remainingInstallments, 1);
  assert.equal(result.status, 'ACTIVO');
  assert.equal(iso(result.lastCycleDate), '2026-07-20');
}

{
  const result = calculateMsiProgressCore({ purchaseDate: '2026-01-10', totalInstallments: 3, anchorDate: '2026-01-15', cutoffDay: 15 });
  assert.equal(result.currentInstallment, 1);
}

{
  const result = calculateMsiProgressCore({ purchaseDate: '2026-01-16', totalInstallments: 3, anchorDate: '2026-01-20', cutoffDay: 15 });
  assert.equal(result.currentInstallment, 0);
  assert.equal(iso(result.firstCycleDate), '2026-02-15');
}

{
  const result = calculateMsiProgressCore({ purchaseDate: '2024-02-29', totalInstallments: 2, anchorDate: '2024-03-31', cutoffDay: 31 });
  assert.equal(result.currentInstallment, 2);
  assert.equal(result.remainingInstallments, 0);
  assert.equal(result.status, 'LIQUIDADO');
}

{
  const result = calculateMsiProgressCore({ purchaseDate: '2025-11-19', totalInstallments: 9, anchorDate: '2026-07-14', cutoffDay: 20, currentInstallment: 99 });
  assert.equal(result.currentInstallment, 9);
  assert.equal(result.remainingInstallments, 0);
}

{
  const result = calculateMsiProgressCore({ purchaseDate: '2025-11-19', totalInstallments: 9, anchorDate: '2026-07-14' });
  assert.equal(result.currentInstallment, 8);
  assert.equal(result.isEstimated, true);
  assert.equal(result.status, 'REVISAR');
}
