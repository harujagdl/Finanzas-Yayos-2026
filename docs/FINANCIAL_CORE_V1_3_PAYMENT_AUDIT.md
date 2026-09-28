# Financial Core V1.3 — auditoría previa de pago mensual

**Base auditada:** `8803f5587097df3a3eb1e7f38e72e21765f86f98` (merge de Financial Core V1.2). El checkout entregado usa la rama `work`; no existe una referencia local ni remota llamada `main`, por lo que el SHA de `HEAD` es la base verificable.

## Alcance revisado antes de modificar

Se revisaron `utils/financialCore.js`, `utils/planningEngine.js`, `utils/commitmentOwnership.js`, `utils/billingCycle.js`, `utils/cardConsolidation.js`, `index.html`, todos los tests y fixtures, y la documentación V1/V1.1/V1.2. También se rastrearon las lecturas y escrituras de `cards`, `expenses`, `installment_plans`, Resumen, Tarjetas y pagos.

## Fuentes reales encontradas

| Concepto | Campos/colección reales | Observación |
| --- | --- | --- |
| Pago para no generar intereses | `cards.paymentToAvoidInterest`; alias vigente `cards.payGoal`; aliases sólo de lectura/consolidación: `paymentGoal`, `paymentTarget`, `montoCiclo`, `goal` | El formulario escribe simultáneamente `paymentToAvoidInterest` y `payGoal`. Los presets sólo crean `payGoal: 0`. Es un snapshot mutable y no contiene mes/ciclo de origen. |
| Saldo corriente | `cards.currentBalance`; alias persistido `cards.balance` | Snapshot informativo; no equivale al pago del periodo. |
| Saldo al corte | `cards.statementBalance` | El formulario lo permite, pero la UI anterior no lo usaba para responder cuánto pagar. |
| Pago mínimo | `cards.minimumPayment` | Informativo y opcional; no es el monto para no generar intereses. |
| Corte | `statementClosingDay` en normalizador; persistidos `closingDay`/`cutDay` | La UI guarda día, no una fecha histórica de cada corte. |
| Vencimiento | `paymentDueDay` en normalizador; persistidos `dueDay`/`payDay` | La fecha concreta se deriva para el ciclo activo. |
| Periodo de estado | No existe un historial de estados. En movimientos pueden existir `cardCycleId`, `statementId` y `cardStatementId`; también se derivan `cutDate`/`dueDate` en memoria. | No se puede aplicar con certeza el `payGoal` actual a un mes histórico. |
| Compra normal | `expenses`, `type=expense`, `amount`, `date`, `cardId`; `isMsi!==true` | Es movimiento corriente. |
| Compra MSI | `expenses`, `type=expense`, `isMsi=true`, `msiTotal`, `msiMonthly`, `msiMonths`, `msiStart` y posición | `amount` puede representar mensualidad; el precio original no debe sumarse al pago mensual. |
| Otros diferidos | `installment_plans`, con `installmentAmount`, vigencia y `cardId` | Se reserva para compromisos externos; dedupe sólo por enlace explícito. |
| Abono/pago de tarjeta | `expenses`, `type=card_payment` (también aliases `payment`/`isCardPayment`), `amount`, `date`, destino `targetCardId`/`targetCardName` | Puede tener IDs de ciclo/estado, pero no están garantizados en legacy. |

No se encontró `minimumPlusInstallments` ni una colección persistida de estados de cuenta.

## Comportamiento anterior y causa de la limitación

Resumen separaba compras, mensualidades y abonos, mientras Tarjetas calculaba `payGoal - pagos del ciclo`. No había una función única del Financial Core para escoger entre dato bancario y reconstrucción. La vista de estado de cuenta calculaba además `compras del ciclo - abonos`; ese saldo era cashflow registrado, no un monto bancario confirmado y podía mezclar semánticas.

Los $14,000 de referencia son la suma de movimientos `card_payment` del periodo y se atribuyen por `targetCardId` (o `cardId` legacy). Sin un `cardCycleId`/`statementId` coincidente no es seguro afirmar que reducen el estado seleccionado. Por ello V1.3 los reporta como **Abonos** y como `paymentsRecorded`, pero sólo calcula `paid` y `remaining` cuando existe vínculo explícito con el ciclo.

## Decisión de periodos

* **Mes:** movimientos del mes calendario y mensualidades activas del mismo `monthKey`. Un `payGoal` sin periodo sólo es confiable para el mes actual; para meses históricos se estima o queda pendiente.
* **Estado de cuenta:** ventana real derivada del corte de una tarjeta seleccionada. El dato bancario actual puede usarse para esa vista; los movimientos se filtran por la ventana.
* Un campo futuro `statementPeriod`, `statementMonth` o `paymentPeriod` puede acreditar explícitamente el periodo sin migrar documentos existentes.

Esta auditoría no modifica datos, reglas ni esquema de Firestore.
