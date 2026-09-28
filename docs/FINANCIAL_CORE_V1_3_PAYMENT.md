# Financial Core V1.3 — pago mensual

## Qué significa “Pago del mes”

Es el importe esperado por las tarjetas para el periodo consultado. No es lo mismo que compras, saldo total, saldo MSI ni compromiso efectivo. `resolveCardMonthlyPayment()` resuelve una tarjeta y `calculateMonthlyPaymentSummary()` agrega las respuestas sin ocultar la procedencia de cada una.

El resultado por tarjeta incluye `amount`, `source`, `confidence`, `components`, `cardId` y `period`. La agregación incluye `totalAmount`, `sourceStatus` y `cards`.

## Prioridad y estados

1. **`statement` / confirmado:** usa el primer dato bancario positivo disponible en esta precedencia: `paymentToAvoidInterest`, `payGoal`, `paymentGoal`, `paymentTarget`, `montoCiclo`, `goal`. El snapshot sin mes explícito sólo aplica al mes actual, incluso dentro de la vista de estado de cuenta.
2. **`estimated`:** si no hay dato bancario aplicable, suma compras normales del periodo una vez y mensualidades activas una vez.
3. **`insufficient_data`:** si no existe ninguna base para esa tarjeta devuelve `amount: null`; nunca inventa cero.

El total es `confirmed`, `estimated`, `mixed` o `insufficient_data`. Si una tarjeta activa incluida carece de información, el total se etiqueta como datos insuficientes aunque se conserven internamente los importes conocidos.

## MSI y prevención de doble conteo

Una compra con `isMsi=true` no entra como compra corriente. Sólo entra `installmentAmount` del compromiso cuya vigencia incluye el periodo. `msiTotal`, `originalAmount` y `remainingBalance` quedan excluidos. La deduplicación entre `expenses` e `installment_plans` continúa requiriendo un enlace explícito.

## Abonos

Los pagos se asignan a tarjeta por `targetCardId` y, como compatibilidad, `cardId`. Siempre se muestran como `paymentsRecorded`, pero no se restan de la estimación: una compra menos un abono no reconstruye necesariamente el pago bancario. Sólo cuando el pago contiene el `cardCycleId` o `statementId` del periodo se exponen `paid` y `remaining`; así no se descuenta dos veces ni se concilia por coincidencia de fecha o monto.

## Payment frente a commitment

* **Payment** responde lo exigible en el periodo: dato bancario si existe o reconstrucción explícitamente estimada.
* **Household commitment** es la mensualidad completa de compromisos MSI/diferidos del hogar.
* **Effective commitment** aplica ownership a esos compromisos para planeación personal.

Ownership nunca reduce lo que el banco exige. Personal/shared sólo cambia `effectiveCommitment`, no el pago mensual ni `householdCommitment`.

## UI

Resumen muestra el pago como KPI principal. El título y ayuda distinguen confirmado, estimado, mixto o pendiente. El desglose mantiene compras, MSI/diferidos, abonos y compromisos, y añade el pago y su fuente por tarjeta. La cuadrícula usa dos columnas en móvil para los KPI secundarios y ancho completo para el pago principal.

## Periodos y limitaciones

El mes calendario y el ciclo bancario permanecen separados. La vista de estado requiere una tarjeta y día de corte. El modelo actual no conserva historial de estados de cuenta ni garantiza IDs de ciclo en pagos legacy; tampoco garantiza que `payGoal` incluya fecha de vigencia. Por tanto:

* un `payGoal` actual no se proyecta a meses históricos;
* pagos legacy sin vínculo de ciclo no generan un restante supuesto;
* tarjetas activas sin dato bancario ni actividad producen datos pendientes;
* la estimación no sustituye el estado emitido por el banco.

No se introducen migraciones, escrituras automáticas ni cambios de Firestore Rules.
