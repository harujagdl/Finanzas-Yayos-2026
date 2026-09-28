import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancialCommitments, calculateMonthlyFinancialSummary } from '../utils/financialCore.js';
import { projectInstallments, calculateSafeAvailable, simulateNewPurchase } from '../utils/planningEngine.js';

const legacy = (overrides = {}) => ({ id:'expense-1', type:'expense', isMsi:true, concept:'SharkNinja', cardId:'free', msiTotal:5280, msiMonthly:440, msiMonths:12, currentInstallment:11, msiStart:new Date(2025,9,1), owner:'yair', ...overrides });
const explicit = (overrides = {}) => ({ id:'plan-1', description:'Manual', cardId:'like', originalAmount:1000, installmentAmount:500, totalInstallments:2, currentInstallment:0, remainingInstallments:2, active:true, ownershipType:'personal', ...overrides });

test('MSI legacy alimenta Resumen y Planeación con última mensualidad y liberación posterior', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy()],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'});
  const projection=projectInstallments(commitments,{startMonth:'2026-09',months:2});
  assert.equal(summary.installmentCommitment,440); assert.equal(projection[0].effectiveCommitment,440);
  assert.equal(projection[0].endingPlans[0].description,'SharkNinja'); assert.equal(projection[0].releasedFlow,0); assert.equal(projection[1].releasedFlow,440);
});

test('compartido conserva hogar, aplica participación y libera sólo parte efectiva', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[explicit({installmentAmount:1000,totalInstallments:1,remainingInstallments:1,ownershipType:'shared',ownerSharePercentage:50})],asOfMonth:'2026-10'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-10'}); const rows=projectInstallments(commitments,{startMonth:'2026-10',months:2});
  assert.equal(summary.householdCommitment,1000); assert.equal(summary.effectiveCommitment,500); assert.equal(rows[0].householdCommitment,1000); assert.equal(rows[0].effectiveCommitment,500); assert.equal(rows[1].releasedFlow,500);
});

test('referencia explícita deduplica expense MSI + installment_plan', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy()],installmentPlans:[explicit({linkedExpenseId:'expense-1',installmentAmount:440,remainingInstallments:1,totalInstallments:12,currentInstallment:11})],asOfMonth:'2026-09'});
  assert.equal(commitments.length,1); assert.equal(projectInstallments(commitments,{months:1})[0].totalCommitment,440);
});

test('compra histórica MSI no suma precio o movimiento a compromiso', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy()],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({movements:[legacy({amount:5280})],commitments,monthKey:'2026-09'});
  assert.equal(summary.purchases,0); assert.equal(summary.householdCommitment,440);
});

test('filtro por tarjeta excluye Costco', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[explicit(),explicit({id:'costco',cardId:'costco'})],asOfMonth:'2026-09'});
  assert.equal(calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09',cardId:'like'}).householdCommitment,500);
});

test('periodo incluye último pago y excluye el posterior', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy({msiStart:new Date(2025,10,1),currentInstallment:10})],asOfMonth:'2026-09'});
  assert.equal(calculateMonthlyFinancialSummary({commitments,monthKey:'2026-10'}).householdCommitment,440);
  assert.equal(calculateMonthlyFinancialSummary({commitments,monthKey:'2026-11'}).householdCommitment,0);
});

test('simulación no muta compromisos normalizados', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[explicit()],asOfMonth:'2026-09'}); const before=structuredClone(commitments);
  const result=simulateNewPurchase(commitments,{amount:6000,totalInstallments:12},{months:12});
  assert.deepEqual(commitments,before); assert.equal(result.after[0].effectiveCommitment-result.before[0].effectiveCommitment,500);
});

test('disponible seguro pendiente nunca inventa cero', () => assert.equal(calculateSafeAvailable({incomeAvailable:''}).availableSafeMonth,null));
test('plan manual permanece en Planeación', () => assert.equal(normalizeFinancialCommitments({installmentPlans:[explicit()],asOfMonth:'2026-09'})[0].sourceType,'installment_plan'));
test('legacy sin enlace se conserva y no se deduplica peligrosamente por monto', () => assert.equal(normalizeFinancialCommitments({expenses:[legacy()],installmentPlans:[explicit({installmentAmount:440})],asOfMonth:'2026-09'}).length,2));
