# Financial Core V1.1 — corrección de consistencia

## Implementación

`resolveInstallmentPosition` es ahora la única normalización del tramo pendiente para `expenses` MSI e `installment_plans`. Produce `currentInstallment`, `remainingInstallments`, `pendingStartMonth` y `pendingEndMonth`. Resumen filtra ese rango y Planeación respeta el mismo inicio/fin al ubicar pagos en la proyección.

El modelo de ownership sigue siendo no destructivo y por compromiso:

| Compromiso | Household | Effective |
|---|---:|---:|
| Personal $1,000 | $1,000 | $1,000 |
| Shared $1,000 @ 50% | $1,000 | $500 |
| Mezcla anterior | $2,000 | $1,500 |

Un legacy sin evidencia shared se normaliza personal al 100%. Un legacy explícitamente shared sin porcentaje conserva 50% sólo para sí mismo. Una tarjeta puede contener ambos tipos y su metadata no participa en el cálculo.

`projectInstallments.householdCommitment` ahora significa toda la mensualidad del hogar, igual que Resumen. El subtotal anterior se conserva con el nombre explícito `sharedHouseholdCommitment`. `totalCommitment` se mantiene por compatibilidad.

## Regresión temporal

- Un plan futuro produce cero antes de `pendingStartMonth`.
- Un plan terminado no proyecta pagos.
- El último pago conserva `endingPlans` y cero liberación.
- El primer mes posterior recibe `releasedFlow`.
- No se introdujeron offsets arbitrarios; los índices son la distancia entre claves calendario `YYYY-MM`.

## Fixture observada

La fixture usa `Card A/B/C`, sin datos personales, con mensualidades $3,569.42 + $770.76 + $531.42. La suma normalizada, Resumen household y Planeación household para `2026-09` verifican $4,871.60. Estos valores sólo existen en tests.

## Resumen responsive

Los seis KPIs usan columnas mínimas más anchas en pantallas grandes, dos columnas en móvil y tipografía fluida. Los valores permiten wrap controlado y anulan `overflow:hidden`, `white-space:nowrap` y ellipsis heredados de `.kpi-value`; no se eliminan centavos.

## Disponible seguro y compatibilidad

Se conserva la fórmula porque los tres datos automáticos representan compras corrientes no-MSI, abonos de caja y mensualidades MSI/diferidas, respectivamente. La prueba de regresión demuestra una resta por componente. Si en el futuro se dispone de conciliación cargo-abono, deberá modelarse explícitamente en lugar de inferirse por monto.

No se cambiaron Firebase Auth, Firestore Rules, colecciones, persistencia, dedupe por enlaces, simuladores ni la regla de liberación. Tampoco se convirtieron expenses a planes.

## Limitaciones

- Un porcentaje shared ausente conserva 50% por compatibilidad; corregirlo requiere capturar el porcentaje real en el registro fuente.
- Un `remainingInstallments` persistido contradictorio se respeta como dato explícito. La UI puede marcar/revisar esos registros, pero esta corrección no migra datos.
- El modo estado de cuenta conserva su periodo bancario visible y deliberadamente no equivale siempre al mes calendario.
- No se dispone de datos productivos para identificar cuál documento aportaba exactamente los $730.46 observados; se eliminó el camino matemático que lo activaba fuera de mes.
