# Financial Core V1 — Implementación

## Arquitectura

`utils/financialCore.js` es la capa común entre datos y UI. `normalizeFinancialCommitments` adapta, sin escribir, MSI legacy de `expenses` y otros compromisos de `installment_plans`. `calculateMonthlyFinancialSummary` entrega compras, MSI sin interés, diferidos con interés, abonos, compromiso household/effective, conteo y desglose por tarjeta. `planningEngine` sigue siendo el único motor de proyección y simulación.

## Prevención de doble conteo

1. La compra MSI sigue siendo un **movimiento**, pero no se agrega como compra corriente al compromiso mensual.
2. Su mensualidad normalizada es el **compromiso** del periodo.
3. El saldo restante es informativo y no se suma a mensualidades.
4. Financial Core prefiere `installment_plans` cuando existe enlace explícito a `expenses` (`linkedExpenseId`, `linkedInstallmentPlanId`, o `sourceType/sourceId`).
5. Sin vínculo explícito se conservan ambas fuentes: deduplicar sólo por importe, descripción o tarjeta podría ocultar deudas legítimas.

No se crean documentos espejo y no hay migración destructiva.

## Flujo MSI → Resumen → Planeación

- El listener de `expenses` y el de `installment_plans` vuelven a construir el mismo array normalizado.
- Resumen calendario filtra movimientos y compromisos por mes/tarjeta; muestra compras, MSI/diferidos, abonos, compromiso efectivo y movimientos por separado.
- Planeación proyecta ese array completo. Por tanto, un MSI registrado en Movimientos/MSI aparece automáticamente sin usar “Otro compromiso”.
- `endingPlans` permanece en el último mes cobrado. `releasedFlow` se genera en el índice siguiente y refleja la participación efectiva.

## Propiedad e interés

`householdCommitment` siempre conserva la mensualidad total. `effectiveCommitment` aplica `ownerSharePercentage`; personal es 100%. Shared legacy sin porcentaje conserva el fallback histórico de 50%, no un supuesto basado en Costco u otra tarjeta. `interestType=none` y `interestType=interest` permanecen separados internamente aunque Resumen los agrupe visualmente.

## Disponible seguro

Automático: compras corrientes conocidas del mes, abonos conocidos y compromiso efectivo normalizado. Manual cuando no existe una fuente fiable: ingreso disponible, gastos fijos externos, metas/apartados y colchón. Si falta cualquiera, el resultado es `null`/“Datos pendientes”; nunca se presenta `$0` como cálculo válido.

## Simuladores y “Otro compromiso”

“¿Qué pasa si compro?” agrega sólo una copia en memoria al array normalizado e informa mensualidad, compromiso antes/después y primer mes posterior al pago (o fuera del horizonte). “¿Qué pasa si liquido?” clona los planes, informa saldo/costo modelado y mensualidad que desaparecería, y conserva la advertencia de confirmar el tratamiento con el banco. Ninguno escribe en Firestore.

El botón antes llamado “+ Plan” ahora dice “+ Otro compromiso” y queda para préstamos, deuda externa, recurrentes o planes excepcionales no registrados como MSI. Los documentos existentes de `installment_plans` siguen funcionando.

## Limitaciones conocidas

- Registros históricos sin enlace explícito no pueden conciliarse con seguridad; deben enlazarse para dedupe garantizado.
- Un MSI legacy compartido sin porcentaje conserva 50% por compatibilidad; conviene completar el porcentaje en origen cuando el producto habilite edición.
- Los supuestos externos (ingreso, fijos, reserva de metas y colchón) no se inventan.
- La vista “estado de cuenta” conserva sus reglas de ventana bancaria preexistentes; la unificación V1 cubre el periodo calendario y la proyección.
