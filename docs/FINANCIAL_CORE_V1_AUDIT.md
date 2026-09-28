# Auditoría previa — Financial Core V1

**Base auditada:** rama de trabajo basada en `main`, SHA `532b23b37cdea5f80a3a921aaa9eae27bc402de3` (28 de septiembre de 2026). Esta auditoría se realizó antes de implementar el core.

## Inventario del modelo anterior

- **`expenses`** era la fuente de todos los movimientos. Un gasto normal usa `type=expense`, `amount`, `date`, `owner`, `scope`, categoría y, si aplica, `cardId/cardName`. Un abono se normaliza como `type=card_payment`, `isCardPayment=true` y apunta a la tarjeta con `targetCardId/targetCardName`.
- **MSI legacy** no tenía colección propia: era un documento `expenses` con `isMsi`, `msiMonths`, `msiStart`, `msiTotal`, `msiMonthly`, `currentInstallment`/`installmentsPaid` y `msiInstallmentNumber`. El formulario sustituía `amount` por la mensualidad. Las vistas MSI usaban `msiProgress`, expansión mensual y agrupación por tarjeta.
- **`installment_plans`** contenía planes explícitos del P0: monto original/restante, mensualidad, total/actual/restantes, fechas, tipo de interés, estado, tarjeta y ownership. Planeación sólo leía esta colección, por lo cual ignoraba MSI ya conocidos en `expenses`.
- **`cards`** contenía identidad, owner, límites, saldo, pago para no generar interés y días de corte/pago, con aliases legacy normalizados. El saldo de tarjeta vive aquí, no en el plan.
- **`monthly_summaries`** era un cache/derivado por owner, periodo y scope: totales por categoría/scope, conteo y highlights. No era fuente de deuda ni tenía referencia persistida a tarjetas.
- **Resumen** expandía MSI legacy para el periodo y los mezclaba con gastos en `buildMonthlyCardSummary`; mostraba Gastos/Abonos/Neto/Movimientos. No consumía `installment_plans` ni distinguía movimiento de compromiso.
- **MSI** leía los campos MSI de `expenses`; calculaba avance, saldo estimado y carga mensual. Los filtros familiares operaban por owner/scope/tarjeta.
- **Planeación** (`planningEngine.js`, `renderPlanning`, `subscribeInstallmentPlans`) proyectaba únicamente `installmentPlans`. `calculatePlanningSafe` requería seis entradas manuales. Los simuladores trabajaban sobre arrays clonados y no escribían a Firestore.
- **Semántica P0:** `currentInstallment` se interpreta como pagos ya cubiertos; `remainingInstallments=total-current`. `endingPlans` aparece en el último pago y `releasedFlow` en el primer mes posterior.
- **Ownership:** tarjeta/plan usa `ownershipType`; MSI legacy podía expresar compartido mediante `owner=both` o `scope=shared`. Sólo `installment_plans` tenía normalmente `ownerSharePercentage`; el fallback legacy compartido era 50%, comportamiento histórico que debe quedar visible y no inferirse por tarjeta.
- **Filtros:** Resumen tenía mes/estado de cuenta y tarjeta; couple mode agregaba scope. La selección de tarjeta no alcanzaba planes explícitos porque no se leían.
- **Dedupe anterior:** existía consolidación de tarjetas/aliases, pero no conciliación entre MSI en `expenses` e `installment_plans`. La documentación P0 advertía expresamente ese riesgo.

## Source of Truth Matrix

| Dato | Fuente de verdad |
|---|---|
| Movimiento normal | `expenses` |
| MSI existente | `expenses` con `isMsi=true` |
| Otro compromiso no originado por compra/MSI | `installment_plans` |
| Saldo tarjeta | `cards.currentBalance`/`balance` |
| Pago mensual MSI | `expenses.msiMonthly` (adaptado, no copiado) |
| Pago mensual de otro compromiso | `installment_plans.installmentAmount` |
| Propiedad personal/compartida | El compromiso: `ownershipType`/`ownerSharePercentage`; aliases legacy documentados |
| Abono | `expenses` tipo `card_payment`, enlazado por `targetCardId` |
| Proyección | Derivada por Financial Core + `planningEngine` |
| Released flow | Derivado; primer mes posterior al último pago |
| Disponible seguro | Derivado de datos conocidos + supuestos manuales faltantes |
| `monthly_summaries` | Cache analítico, nunca fuente de deuda |

## Riesgos y decisiones

1. No se migran ni reescriben documentos históricos.
2. La coincidencia segura entre fuentes requiere `linkedExpenseId`, `linkedInstallmentPlanId` o `sourceType=expense` + `sourceId`. Nombre o monto iguales **no** prueban identidad y no se usan para deduplicar.
3. Un MSI legacy sin porcentaje explícito y marcado compartido conserva el fallback histórico 50%; la limitación se documenta en implementación.
4. Estado de cuenta tiene ventanas de corte/pago distintas al resumen calendario y conserva su lógica preexistente; el Financial Core gobierna el resumen mensual calendario y Planeación.
