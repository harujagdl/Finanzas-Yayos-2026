# Motor de Planeación Financiera P0 — Implementación

## Modelo final

### `cards` (extendida, retrocompatible)

Los campos canónicos opcionales son `owner`, `name`, `bank`, `lastDigits`, `type`, `ownershipType`, `sharedWith`, `creditLimit`, `statementBalance`, `currentBalance`, `paymentToAvoidInterest`, `minimumPayment`, `statementClosingDay`, `paymentDueDay`, `availableCredit` y `active`. El normalizador acepta los campos históricos `limit`, `balance`, `payGoal`, `cutDay`, `payDay`, `closingDay` y `dueDay`; no se requiere migración.

### `installment_plans` (nueva)

Cada documento contiene `owner`, `cardId`, `description`, `merchant`, `originalAmount`, `remainingBalance`, `installmentAmount`, `totalInstallments`, `currentInstallment`, `remainingInstallments`, `startDate`, `estimatedEndDate`, `interestType`, `annualInterestRate`, `active`, `ownershipType`, `ownerSharePercentage`, `notes` y timestamps. Los importes públicos se guardan en MXN; el motor los convierte inmediatamente a centavos enteros para sumar.

`interestType=none` representa MSI; `interestType=interest` representa diferidos con interés. El saldo corriente continúa en `cards.currentBalance`/`balance`, separado de los planes.

## Cálculos

`projectInstallments` produce 12 meses por defecto con compromiso MSI, compromiso con interés, total por tarjeta, total personal, deuda compartida del hogar, participación efectiva individual, flujo liberado y planes que terminan. La mensualidad actual pendiente aparece en el primer mes proyectado; por ello 1/6 produce cinco pagos y 11/12 uno. `endingPlans` identifica el mes del último pago, mientras que `releasedFlow` se registra en el mes siguiente, cuando el dinero efectivamente deja de estar comprometido.

Para planes compartidos, la deuda total de la tarjeta se conserva y `effectiveCommitment` aplica `ownerSharePercentage`. `costToFreeOneMonthlyPeso = remainingBalance / installmentAmount` es informativo y nunca una recomendación.

El disponible seguro requiere ingreso, gastos fijos, gasto corriente, pagos corrientes TDC, metas y colchón; descuenta además el próximo compromiso efectivo y el objetivo de reducción. Si falta cualquier base devuelve una lista de faltantes y ningún total.

Los escenarios clonan/derivan arreglos en memoria. Nueva compra agrega un plan únicamente a la proyección; liquidación lo desactiva únicamente en la copia y siempre advierte que se confirme el tratamiento con el banco.

## Interfaz

La pantalla **Planeación** reutiliza tarjetas, botones, colores y tipografía existentes. Prioriza disponible seguro, compromiso efectivo y próxima liberación; debajo presenta timeline horizontal móvil, supuestos explicables, simulador y detalle de planes. El alta explícita de un plan escribe Firestore sólo al enviar el formulario. Las simulaciones nunca guardan.

## Seguridad

Las reglas nuevas llaman a los helpers estrictos existentes: lectura sólo de recursos con owner permitido, creación con owner permitido y actualización sin cambio de owner. No existe ninguna regla abierta. La limitación heredada es importante: la app aún no usa Firebase Auth, por lo que `owner` valida aislamiento de datos pero no identidad de persona.

## Compatibilidad y tests

No se borran ni migran `expenses`, `cards`, `goals` o `monthly_summaries`. Los MSI históricos dentro de movimientos siguen alimentando las pantallas preexistentes; los planes explícitos alimentan Planeación. Los tests cubren conteo de pagos, terminación, personal/compartido, separación MSI/interés, precisión monetaria, legacy, disponible seguro, compra simulada, liquidación inmutable y presencia de reglas estrictas.

## Limitaciones conocidas

- No hay conciliación automática entre MSI históricos de `expenses` y `installment_plans`; se evita así duplicar deuda sin confirmación humana.
- `annualInterestRate` se almacena, pero P0 proyecta la mensualidad capturada y no recalcula tablas de amortización bancarias.
- La aproximación semanal divide el margen mensual entre cuatro.
- Liquidar anticipadamente sólo modela flujo potencial; el banco puede aplicar el abono de otra forma.
- La colección requiere publicar `firebase/firestore.rules` antes de usarla en producción.

## Próximos pasos P1

1. Incorporar Firebase Auth y vincular UID con workspaces/owners autorizados.
2. Asistente de conciliación no destructiva entre MSI de movimientos y planes explícitos.
3. Configuración persistente de supuestos de disponible seguro por owner.
4. Tablas de amortización por producto/banco y reglas confirmadas de prepago.
5. Tests de reglas en Emulator Suite y pruebas E2E de la PWA offline.
