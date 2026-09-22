import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCard, normalizeInstallmentPlan, projectInstallments, calculateSafeAvailable,
  simulateNewPurchase, simulatePlanPayoff, calculateCostToFreeOneMonthlyPeso, getReleasedFlowBetween
} from '../utils/planningEngine.js';

const plan=(overrides={})=>({id:'p1',owner:'yair',cardId:'a',description:'Compra',originalAmount:1186.55,remainingBalance:988.79,installmentAmount:197.76,totalInstallments:6,currentInstallment:1,remainingInstallments:5,interestType:'none',active:true,ownershipType:'personal',ownerSharePercentage:100,...overrides});

test('MSI 1/6 genera cinco pagos futuros y luego desaparece',()=>{ const rows=projectInstallments([plan()],{startMonth:'2026-09',months:7}); assert.deepEqual(rows.map(r=>r.totalCommitment),[197.76,197.76,197.76,197.76,197.76,0,0]); assert.equal(rows[4].endingPlans.length,1); });
test('MSI 11/12 genera solo un pago futuro',()=>{ const rows=projectInstallments([plan({totalInstallments:12,currentInstallment:11,remainingInstallments:1,installmentAmount:440})],{startMonth:'2026-09',months:3}); assert.deepEqual(rows.map(r=>r.totalCommitment),[440,0,0]); });
test('MSI 3/3 no genera pagos',()=>assert.ok(projectInstallments([plan({totalInstallments:3,currentInstallment:3,remainingInstallments:0})],{months:3}).every(r=>r.totalCommitment===0)));
test('compra compartida 50/50 conserva deuda de tarjeta y reduce compromiso efectivo',()=>{ const row=projectInstallments([plan({installmentAmount:1000,ownershipType:'shared',ownerSharePercentage:50})],{months:1})[0]; assert.equal(row.householdCommitment,1000); assert.equal(row.effectiveCommitment,500); });
test('compra personal conserva 100%',()=>assert.equal(projectInstallments([plan({installmentAmount:823.23})],{months:1})[0].effectiveCommitment,823.23));
test('se distinguen MSI e interés y se suma liberación por rango',()=>{ const rows=projectInstallments([plan({remainingInstallments:1}),plan({id:'p2',interestType:'interest',installmentAmount:208.95,remainingInstallments:2})],{startMonth:'2026-09',months:3}); assert.equal(rows[0].msiCommitment,197.76); assert.equal(rows[0].interestCommitment,208.95); assert.equal(getReleasedFlowBetween(rows,'2026-09','2026-10'),406.71); });
test('simular compra no muta planes y cambia proyección temporal',()=>{ const plans=[plan()]; const snapshot=structuredClone(plans); const result=simulateNewPurchase(plans,{amount:12000,totalInstallments:12,ownershipType:'personal'},{months:12}); assert.deepEqual(plans,snapshot); assert.equal(result.plan.installmentAmount,1000); assert.equal(result.after[0].effectiveCommitment-result.before[0].effectiveCommitment,1000); });
test('liquidación hipotética no muta y elimina su proyección',()=>{ const plans=[plan()]; const result=simulatePlanPayoff(plans,'p1',{months:2}); assert.equal(result.before[0].totalCommitment,197.76); assert.equal(result.after[0].totalCommitment,0); assert.equal(plans[0].active,true); assert.match(result.warning,/banco/); });
test('tarjeta legacy se normaliza sin romper aliases',()=>{ const card=normalizeCard({name:'Legacy',limit:10000,balance:123,cutDay:5,payDay:20}); assert.equal(card.creditLimit,10000); assert.equal(card.currentBalance,123); assert.equal(card.type,'credit'); assert.equal(card.active,true); });
test('dinero usa centavos y evita 0.1 + 0.2',()=>{ const row=projectInstallments([plan({id:'a',installmentAmount:.1}),plan({id:'b',installmentAmount:.2})],{months:1})[0]; assert.equal(row.totalCommitment,.3); });
test('disponible seguro reporta faltantes y descuenta objetivo',()=>{ assert.ok(calculateSafeAvailable({incomeAvailable:100}).missing.includes('fixedExpenses')); assert.deepEqual(calculateSafeAvailable({incomeAvailable:10000,fixedExpenses:2000,currentSpending:1000,currentCardPayments:500,goalsReserved:500,buffer:1000,nextInstallments:1000,reductionTarget:1500}),{availableSafeMonth:2500,availableSafeWeek:625,missing:[]}); });
test('normalización y costo para liberar flujo',()=>{ const p=normalizeInstallmentPlan(plan({remainingBalance:1000,installmentAmount:250})); assert.equal(calculateCostToFreeOneMonthlyPeso(p),4); });

test('fixture representativo separa deuda household y participación personal', async()=>{ const { representativePlanningPlans }=await import('./fixtures/planningPlans.mjs'); const row=projectInstallments(representativePlanningPlans,{months:1})[0]; assert.equal(row.householdCommitment,266.33); assert.equal(row.effectiveCommitment,2828.45); assert.equal(row.interestCommitment,208.95); });
