# Auditoría previa — Financial Core V1.1

**Base auditada:** `e7fa0900fc59d648c3f8289247c6d0b60e91bc01`, merge de Financial Core V1 (#113). La inspección y este diagnóstico precedieron al cambio de implementación.

## Fuentes y esquemas observados

- `expenses` MSI legacy: `type=expense`, `isMsi=true`, `msiMonths`, `msiStart` (o `date`), `msiTotal`, `msiMonthly` (o `amount`), `currentInstallment`/`installmentsPaid`, tarjeta en `cardId`, y ownership del movimiento en `ownershipType` o aliases legacy explícitos (`scope=shared`, `owner=both`).
- `installment_plans`: `totalInstallments`, `currentInstallment`, `remainingInstallments`, `installmentAmount`, `remainingBalance`, `startDate`/`scheduleStartMonth`, `active`, `interestType`, `cardId`, `ownershipType` y `ownerSharePercentage`. Puede enlazar un expense mediante `linkedExpenseId`; el enlace inverso es `linkedInstallmentPlanId`.
- `cards`: identidad y aliases, límite/saldo/pago, corte/vencimiento y un ownership propio de la tarjeta. Ese ownership **no prueba** el ownership de una compra.

No se consultaron ni modificaron datos de producción. Los importes reportados se reprodujeron sólo con aliases en una fixture.

## Traza anterior al fix

1. **MSI — “$X al mes”.** `selectMsiPurchases`/`getMsiMeta` calculaban `msiTotal / msiMonths` (o leían `msiMonthly`) y obtenían el avance con `calculateMsiProgressCore`.
2. **Resumen — MSI/diferidos.** `getFinancialCommitments` adaptaba las dos fuentes; `calculateMonthlyFinancialSummary` seleccionaba compromisos por `billingStartMonth..billingEndMonth` y sumaba `installmentAmount`.
3. **Resumen — household.** Sumaba la mensualidad completa de cada compromiso activo.
4. **Resumen — effective.** Multiplicaba cada mensualidad por el porcentaje normalizado.
5. **Planeación — effective.** `projectInstallments` sumaba el porcentaje de todos los planes normalizados activos en su fila cero.
6. **Planeación — household.** La UI usaba `totalCommitment`, pero la propiedad pública `householdCommitment` del motor contenía sólo `sharedHouseholdCommitment`; dos significados distintos convivían bajo nombres parecidos.
7. **Calendario.** Financial Core asignaba a legacy un rango de resumen basado en la fecha original, pero un rango de proyección que arrancaba en `asOfMonth`. Además, `projectInstallments` ignoraba ambos rangos y colocaba todo plan activo desde la fila cero.

## Causas raíz

### Ownership / 50%

No había un multiplicador global en la suma, pero la normalización aceptaba aliases legacy de shared y aplicaba 50% cuando ese compromiso shared no tenía porcentaje. Como resultado, una población de movimientos guardados con evidencia shared y sin porcentaje parecía un 50% global. El riesgo adicional era atribuir significado al owner de una tarjeta. La regla definitiva es por registro: personal (incluido legacy sin evidencia shared) vale 100%; sólo `ownershipType=shared`, `scope=shared` legacy o `owner=both` legacy habilita shared; únicamente ese registro usa su porcentaje o el fallback compatible de 50%. Nunca se consulta ownership de `cards`.

### Diferencia $4,871.60 vs $5,602.06

La causa estructural demostrada fue el calendario doble: Resumen filtraba `billingStartMonth/billingEndMonth`, mientras Planeación ignoraba esas fechas y proyectaba todos los registros con saldo desde su primer mes. Por ello un compromiso fuera del periodo de Resumen podía sumar en Planeación. La diferencia observada de $730.46 es consistente con un compromiso adicional activado por ese camino; sin acceso a Firestore de producción no es responsable atribuirla a un documento concreto.

También existía una inconsistencia de API: `projection.householdCommitment` sólo incluía shared, mientras `projection.totalCommitment` era el household real. La UI mostraba este último. Se unifica el significado.

## Semántica temporal encontrada y adoptada

- `currentInstallment`: cantidad de mensualidades **ya cubiertas antes de `asOfMonth`**. Un valor 11/12 deja una mensualidad pendiente en `asOfMonth`.
- `remainingInstallments`: cantidad de mensualidades aún por cobrar, **incluyendo la correspondiente a `asOfMonth`** si el plan ya comenzó. Si está persistido se respeta; si falta es `totalInstallments - currentInstallment`.
- `msiStart`: mes del primer pago/ciclo. Sin `currentInstallment`, los meses calendario anteriores a `asOfMonth` se consideran transcurridos; el pago de `asOfMonth` sigue incluido.
- Rango pendiente: comienza en el mayor entre `msiStart` y `asOfMonth`, y termina después de `remainingInstallments - 1` meses. Un plan futuro no aparece antes de comenzar.
- Último pago y liberación: el último mes permanece comprometido (`endingPlans`); `releasedFlow` aparece exclusivamente en el siguiente.

## Disponible seguro

La fórmula auditada resta flujos de categorías distintas: compras corrientes no-MSI (`currentSpending`), abonos de tarjeta (`currentCardPayments`) y el compromiso MSI/diferido próximo (`nextInstallments`), además de fijos, metas, colchón y objetivo. Una compra MSI no entra en `currentSpending`, por lo que no se duplica allí con `nextInstallments`. Un abono es un movimiento de caja independiente, no la compra original.

La aplicación no contiene conciliación bancaria que permita decidir qué componente de un abono liquidó cada cargo. Por ello se conserva la fórmula y se documenta su semántica: las entradas deben representar flujos disjuntos del horizonte. La prueba verifica que cada componente se descuenta exactamente una vez; no hay base demostrada para alterar la fórmula.

## Hallazgos no modificados

- Dedupe permanece exclusivamente por enlaces explícitos; monto/nombre no demuestran identidad.
- El modo “estado de cuenta” conserva ventanas bancarias distintas; la unificación se aplica a Resumen calendario y Planeación.
- No se requiere cambiar Auth, reglas, colecciones ni datos persistidos.
