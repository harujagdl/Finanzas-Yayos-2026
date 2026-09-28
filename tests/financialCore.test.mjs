import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinancialCommitments, calculateMonthlyFinancialSummary, resolveInstallmentPosition, resolveCardMonthlyPayment, calculateMonthlyPaymentSummary } from '../utils/financialCore.js';
import { projectInstallments, calculateSafeAvailable, simulateNewPurchase } from '../utils/planningEngine.js';
import { resolveCommitmentOwnership } from '../utils/commitmentOwnership.js';

const legacy = (overrides = {}) => ({ id:'expense-1', type:'expense', isMsi:true, concept:'SharkNinja', cardId:'free', msiTotal:5280, msiMonthly:440, msiMonths:12, currentInstallment:11, msiStart:new Date(2025,9,1), owner:'yair', ownershipType:'personal', ...overrides });
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
  const result=simulateNewPurchase(commitments,{amount:6000,totalInstallments:12,ownershipType:'personal'},{months:12});
  assert.deepEqual(commitments,before); assert.equal(result.after[0].effectiveCommitment-result.before[0].effectiveCommitment,500);
});

test('disponible seguro pendiente nunca inventa cero', () => assert.equal(calculateSafeAvailable({incomeAvailable:''}).availableSafeMonth,null));
test('plan manual permanece en Planeación', () => assert.equal(normalizeFinancialCommitments({installmentPlans:[explicit()],asOfMonth:'2026-09'})[0].sourceType,'installment_plan'));
test('legacy sin enlace se conserva y no se deduplica peligrosamente por monto', () => assert.equal(normalizeFinancialCommitments({expenses:[legacy()],installmentPlans:[explicit({installmentAmount:440})],asOfMonth:'2026-09'}).length,2));

test('ownership se calcula por compromiso: personal 100%, shared 50% y mezcla 1500', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[
    explicit({id:'personal',installmentAmount:1000,totalInstallments:1,remainingInstallments:1,ownershipType:'personal'}),
    explicit({id:'shared',installmentAmount:1000,totalInstallments:1,remainingInstallments:1,ownershipType:'shared',ownerSharePercentage:50})
  ],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'});
  assert.equal(summary.householdCommitment,2000);
  assert.equal(summary.effectiveCommitment,1500);
});

test('fallback 50% sólo aplica a legacy explícitamente shared y el ambiguo queda pendiente', () => {
  const unknown=normalizeFinancialCommitments({expenses:[legacy({id:'unknown',owner:'yair',scope:undefined,ownershipType:undefined})],asOfMonth:'2026-09'})[0];
  const shared=normalizeFinancialCommitments({expenses:[legacy({id:'shared',owner:'yair',scope:'shared',ownershipType:undefined})],asOfMonth:'2026-09'})[0];
  assert.deepEqual([unknown.ownershipType,unknown.ownerSharePercentage,unknown.needsClassification],['unknown',null,true]);
  assert.deepEqual([shared.ownershipType,shared.ownerSharePercentage],['shared',50]);
});

test('personal 100%, shared 50%, shared 70% y porcentajes no globales', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[
    explicit({id:'personal',cardId:'card-a',installmentAmount:1000,ownershipType:'personal'}),
    explicit({id:'shared-50',cardId:'card-a',installmentAmount:1000,ownershipType:'shared',ownerSharePercentage:50}),
    explicit({id:'shared-70',cardId:'card-b',installmentAmount:1000,ownershipType:'shared',ownerSharePercentage:70})
  ],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'});
  assert.equal(summary.householdCommitment,3000);
  assert.equal(summary.effectiveCommitment,2200);
});

test('nombres Costco y Like U no infieren ownership ni cambian precedencia', () => {
  assert.equal(resolveCommitmentOwnership({cardName:'Costco'}).ownershipType,'unknown');
  assert.equal(resolveCommitmentOwnership({cardName:'Like U'}).ownershipType,'unknown');
  assert.equal(resolveCommitmentOwnership({cardName:'Costco',ownershipType:'personal'}).effectiveMultiplier,1);
  assert.equal(resolveCommitmentOwnership({cardName:'Like U',ownershipType:'shared',ownerSharePercentage:30}).effectiveMultiplier,.3);
});

test('cambiar ownership sólo cambia effective: shared 50 → personal y personal → shared 30', () => {
  const summarize=(ownership)=>calculateMonthlyFinancialSummary({commitments:normalizeFinancialCommitments({installmentPlans:[explicit({installmentAmount:1000,...ownership})],asOfMonth:'2026-09'}),monthKey:'2026-09'});
  const shared=summarize({ownershipType:'shared',ownerSharePercentage:50});
  const personal=summarize({ownershipType:'personal',ownerSharePercentage:100});
  const shared30=summarize({ownershipType:'shared',ownerSharePercentage:30});
  assert.deepEqual([shared.householdCommitment,personal.householdCommitment,shared30.householdCommitment],[1000,1000,1000]);
  assert.deepEqual([shared.effectiveCommitment,personal.effectiveCommitment,shared30.effectiveCommitment],[500,1000,300]);
});

test('ambiguo conserva household y marca effective parcial sin inventar 50%', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy({ownershipType:undefined,scope:undefined,msiMonthly:1000})],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'});
  const planning=projectInstallments(commitments,{startMonth:'2026-09',months:1})[0];
  assert.deepEqual([summary.householdCommitment,summary.effectiveCommitment,summary.unclassifiedCommitmentCount],[1000,0,1]);
  assert.deepEqual([planning.householdCommitment,planning.effectiveCommitment,planning.unclassifiedCommitmentCount],[1000,0,1]);
});

test('una tarjeta admite MSI personal y shared sin heredar ownership de tarjeta', () => {
  const commitments=normalizeFinancialCommitments({expenses:[
    legacy({id:'p',cardId:'same',msiMonthly:1000,ownershipType:'personal'}),
    legacy({id:'s',cardId:'same',msiMonthly:1000,ownershipType:'shared',ownerSharePercentage:25})
  ],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09',cardId:'same'});
  assert.equal(summary.householdCommitment,2000);
  assert.equal(summary.effectiveCommitment,1250);
});

test('fixture 4871.60 coincide entre MSI normalizado, Resumen y Planeación', async () => {
  const {regressionExpenses,regressionHousehold,regressionMonth}=await import('./fixtures/financialCoreRegression.mjs');
  const commitments=normalizeFinancialCommitments({expenses:regressionExpenses,asOfMonth:regressionMonth});
  const msiTotal=commitments.reduce((sum,item)=>sum+item.installmentAmount,0);
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:regressionMonth});
  const planning=projectInstallments(commitments,{startMonth:regressionMonth,months:1})[0];
  assert.equal(msiTotal,regressionHousehold);
  assert.equal(summary.householdCommitment,regressionHousehold);
  assert.equal(planning.householdCommitment,regressionHousehold);
});

test('posición temporal común incluye asOf y no adelanta un MSI futuro', () => {
  assert.deepEqual(resolveInstallmentPosition({totalInstallments:3,currentInstallment:1,firstPaymentMonth:'2026-08',asOfMonth:'2026-09'}),{
    currentInstallment:1,remainingInstallments:2,pendingStartMonth:'2026-09',pendingEndMonth:'2026-10'
  });
  const commitments=normalizeFinancialCommitments({expenses:[legacy({msiMonths:2,currentInstallment:0,msiStart:'2026-10-01'})],asOfMonth:'2026-09'});
  assert.equal(calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'}).householdCommitment,0);
  assert.equal(calculateMonthlyFinancialSummary({commitments,monthKey:'2026-10'}).householdCommitment,440);
  assert.deepEqual(projectInstallments(commitments,{startMonth:'2026-09',months:3}).map(row=>row.totalCommitment),[0,440,440]);
});

test('filtro por tarjeta coincide entre Resumen y proyección Financial Core', () => {
  const commitments=normalizeFinancialCommitments({installmentPlans:[explicit({cardId:'a'}),explicit({id:'b',cardId:'b'})],asOfMonth:'2026-09'});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09',cardId:'a'});
  const projection=projectInstallments(commitments.filter(item=>item.cardId==='a'),{startMonth:'2026-09',months:1})[0];
  assert.equal(summary.householdCommitment,projection.householdCommitment);
});

test('disponible seguro resta flujos disjuntos una sola vez', () => {
  const result=calculateSafeAvailable({incomeAvailable:10000,fixedExpenses:1000,currentSpending:1000,currentCardPayments:500,goalsReserved:500,buffer:500,nextInstallments:1000});
  assert.equal(result.availableSafeMonth,5500);
});

test('pago bancario confirmado tiene prioridad sobre reconstrucción', () => {
  const result=resolveCardMonthlyPayment({card:{id:'free',paymentToAvoidInterest:900},movements:[{type:'expense',cardId:'free',amount:300,date:'2026-09-02'}],period:'2026-09',asOfMonth:'2026-09'});
  assert.deepEqual([result.amount,result.source,result.confidence],[900,'statement','high']);
  assert.equal(result.components.statementField,'paymentToAvoidInterest');
});

test('sin dato bancario estima compra normal una vez más mensualidad MSI, no precio ni saldo', () => {
  const commitments=normalizeFinancialCommitments({expenses:[legacy({msiTotal:5280,msiMonthly:440,remainingBalance:4840})],asOfMonth:'2026-09'});
  const result=resolveCardMonthlyPayment({card:{id:'free'},movements:[
    {type:'expense',cardId:'free',amount:300,date:'2026-09-02'},
    legacy({amount:5280,date:'2026-09-03'})
  ],commitments,period:'2026-09'});
  assert.deepEqual([result.amount,result.source,result.components.purchases,result.components.installments],[740,'estimated',300,440]);
  assert.equal(result.components.remainingBalanceExcluded,true);
});

test('tarjeta sin información devuelve insufficient_data y null, no cero', () => {
  const result=resolveCardMonthlyPayment({card:{id:'empty'},period:'2026-09'});
  assert.deepEqual([result.amount,result.source],[null,'insufficient_data']);
});

test('abono se informa pero no descuenta dos veces una estimación', () => {
  const result=resolveCardMonthlyPayment({card:{id:'free'},movements:[
    {type:'expense',cardId:'free',amount:1000,date:'2026-09-02'},
    {type:'card_payment',targetCardId:'free',amount:700,date:'2026-09-10'}
  ],period:'2026-09'});
  assert.equal(result.amount,1000); assert.equal(result.components.paymentsRecorded,700); assert.equal(result.components.remaining,null);
});

test('statement + estimated produce total mixed and respect card filter', () => {
  const input={cards:[{id:'like',payGoal:1000},{id:'costco'}],movements:[{type:'expense',cardId:'costco',amount:250,date:'2026-09-04'}],period:'2026-09',asOfMonth:'2026-09'};
  const mixed=calculateMonthlyPaymentSummary(input);
  assert.deepEqual([mixed.totalAmount,mixed.sourceStatus],[1250,'mixed']);
  const filtered=calculateMonthlyPaymentSummary({...input,cardId:'costco'});
  assert.deepEqual([filtered.totalAmount,filtered.sourceStatus,filtered.cards.length],[250,'estimated',1]);
});

test('pago mensual filtra movimientos por periodo', () => {
  const result=resolveCardMonthlyPayment({card:{id:'free'},movements:[
    {type:'expense',cardId:'free',amount:100,date:'2026-08-31'},
    {type:'expense',cardId:'free',amount:200,date:'2026-09-01'}
  ],period:'2026-09'});
  assert.equal(result.amount,200);
});

test('ownership cambia effective commitment pero no pago exigido del hogar', () => {
  const summarize=(ownership)=>{
    const commitments=normalizeFinancialCommitments({installmentPlans:[explicit({cardId:'like',installmentAmount:1000,...ownership})],asOfMonth:'2026-09'});
    return {
      commitment:calculateMonthlyFinancialSummary({commitments,monthKey:'2026-09'}),
      payment:resolveCardMonthlyPayment({card:{id:'like'},commitments,period:'2026-09'})
    };
  };
  const personal=summarize({ownershipType:'personal'}), shared=summarize({ownershipType:'shared',ownerSharePercentage:30});
  assert.deepEqual([personal.payment.amount,shared.payment.amount],[1000,1000]);
  assert.deepEqual([personal.commitment.effectiveCommitment,shared.commitment.effectiveCommitment],[1000,300]);
});

test('fixture 4871.60 permanece intacto al calcular el nuevo KPI', async () => {
  const {regressionExpenses,regressionHousehold,regressionMonth}=await import('./fixtures/financialCoreRegression.mjs');
  const commitments=normalizeFinancialCommitments({expenses:regressionExpenses,asOfMonth:regressionMonth});
  const summary=calculateMonthlyFinancialSummary({commitments,monthKey:regressionMonth});
  const payment=calculateMonthlyPaymentSummary({cards:[...new Set(commitments.map(item=>item.cardId))].map(id=>({id})),commitments,period:regressionMonth});
  assert.deepEqual([summary.installmentCommitment,summary.householdCommitment,summary.effectiveCommitment],[4871.60,4871.60,4871.60]);
  assert.equal(payment.totalAmount,4871.60);
});

test('pago statement sólo concilia restante con vínculo explícito al ciclo', () => {
  const result=resolveCardMonthlyPayment({card:{id:'free',payGoal:1000},movements:[
    {type:'card_payment',targetCardId:'free',amount:400,date:'2026-09-10',cardCycleId:'free:2026-09'}
  ],period:{key:'2026-09',mode:'statement',cycleId:'free:2026-09'},asOfMonth:'2026-09'});
  assert.deepEqual([result.amount,result.components.paid,result.components.remaining],[1000,400,600]);
});
