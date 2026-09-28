# Financial Core V1.2 — auditoría de ownership

## Alcance y base auditada

La auditoría se hizo sobre `5708c178e783ad6a65a90e37209c0cde4d445bd3` (merge de Financial Core V1.1, PR #114), antes de modificar comportamiento. Se revisaron `utils/financialCore.js`, `utils/planningEngine.js`, `index.html`, fixtures y tests del Financial Core, Planeación, MSI, Familia, consolidación de tarjetas e importación/reparación legacy.

## Campos reales encontrados

| Campo | Colección/flujo | Valores observados o admitidos | Semántica actual |
| --- | --- | --- | --- |
| `owner` | todos los documentos; tarjetas; planes; movimientos | `yair`, `haru`; legacy `both` | Principalmente identidad/partición de Firestore. Financial Core V1.1 también aceptaba `both` como alias legacy de shared. Un `owner` personal **no** demuestra ownership financiero personal. |
| `scope` | movimientos (`expenses`) y filtros de pareja | `shared`, `personal`; ausente en legacy | Nuevo movimiento lo escribe. `normalizeScope()` convertía cualquier valor ausente/desconocido a `shared`. Financial Core aceptaba sólo `scope=shared` como evidencia shared y trataba lo demás como personal. |
| `ownershipType` | tarjetas, `installment_plans`, fixtures | `personal`, `shared` | En planes define participación. En tarjetas describe la tarjeta, pero no debe heredarse a compras. Antes de V1.2 Nuevo movimiento/MSI no lo escribía. |
| `ownerSharePercentage` | `installment_plans`, fixtures | número 0–100; normalmente 50 o 100 | Porcentaje efectivo de un compromiso shared. Nuevo movimiento/MSI no lo escribía. |
| `familyOwner` | edición de Familia sobre `expenses` | `yair`, `haru`, `shared` | Responsable de visualización/proyección familiar. No es porcentaje ni debe decidir ownership financiero. |
| `includeInFamilyProjection` | Familia sobre `expenses` | booleano | Inclusión en proyección familiar; no define participación efectiva. |
| `shared`, `isShared`, `split`, `splitPercentage` | búsqueda global | no existen en documentos ni normalizadores de la aplicación | No influyen actualmente. No se deben inventar como datos existentes. |
| `card.ownershipType`, `card.owner` | `cards` | `personal`/`shared`; `yair`/`haru`/legacy `both` | Propiedad administrativa de la tarjeta. No es evidencia sobre una compra MSI concreta. |

## Qué escribe cada flujo antes del fix

### Nuevo movimiento y MSI

El formulario ofrece `scope` con **Compartido seleccionado por defecto** y el texto “Por defecto es compartido”. Al guardar cualquier gasto escribe ese `scope`. Si es MSI también escribe `isMsi`, `msiMonths`, `msiStart`, `msiTotal`, `msiMonthly`, `currentInstallment`, `installmentsPaid` y `msiInstallmentNumber`, pero **no** escribe `ownershipType` ni `ownerSharePercentage`. La edición reutiliza el mismo formulario y vuelve a guardar `scope`; para registros sin `scope`, `normalizeScope(undefined)` los presenta como shared.

### Otros compromisos (`installment_plans`)

El formulario de Planeación escribe `ownershipType=personal|shared` y `ownerSharePercentage=100|50`. La UI sólo ofrece “Compartida 50/50”; no admite otro porcentaje. No hay edición de ownership para estos planes.

### Familia

Familia deriva responsable desde `familyOwner || owner` y permite escribir `familyOwner` e `includeInFamilyProjection`. Esta abstracción sirve para responsable/filtro familiar, no para participación efectiva: no incluye porcentaje y `shared` no prueba una distribución concreta.

### Importaciones y normalizadores legacy

La reparación MSI sólo completa forma temporal/económica (`msiMonths`, `msiStart`, `msiTotal`, `msiMonthly`, `amount`, estado de revisión). No completa ownership. No se encontró una importación que escriba porcentajes de ownership. `normalizeScope()` sí convierte scope ausente en shared para varias vistas, pero eso es un fallback de UI/filtro, no evidencia persistida.

## Qué interpreta Financial Core V1.1

1. Para un expense MSI, `ownershipType=shared`, `scope=shared` u `owner=both` lo vuelve shared.
2. Un shared sin `ownerSharePercentage` recibe 50%.
3. Todo lo demás se vuelve personal 100%, incluso si no existe evidencia explícita.
4. Para `installment_plans`, el normalizador vuelve shared a `ownershipType=shared` u `owner=both`; si falta porcentaje aplica 50%; cualquier otro registro queda personal.
5. No consulta la tarjeta al normalizar el compromiso. Por tanto Costco, Like U, Free, comercio, descripción y monto no son reglas en el motor.

## Causa exacta del ≈50% observado

Es una combinación de **formulario + dato persistido + fallback legacy**, no un multiplicador global del motor:

* Nuevo movimiento seleccionaba Compartido por defecto y persistía `scope=shared` en cada MSI creado/confirmado desde ese formulario.
* No persistía `ownerSharePercentage`.
* Financial Core interpretaba correctamente esa evidencia explícita como shared y, al faltar porcentaje, aplicaba el fallback compatible de 50% por registro.
* Una población compuesta casi totalmente por esos MSI produce un efectivo cercano a la mitad del household. Diferencias de centavos pueden surgir del redondeo por mensualidad/registro.

La tarjeta no causa el 50% y no debe usarse para “corregirlo”. El problema de producto es que el formulario creó evidencia shared sin capturar la participación y que el normalizador no representaba el caso verdaderamente ambiguo.

## Clasificación del problema

* **Datos persistidos:** sí; los MSI creados con el default contienen `scope=shared` sin porcentaje.
* **Formulario:** sí; default shared y ausencia de porcentaje/ownership explícito de MSI.
* **Fallback legacy:** sí; el 50% se activa correctamente ante shared explícito, pero se vuelve dominante por lo que escribió el formulario.
* **Normalización:** sí, adicionalmente; un MSI sin ninguna evidencia se convertía a personal 100% en vez de conservar una señal `unknown/needsClassification`.
* **Tarjetas:** no; el core no hereda su ownership y V1.2 debe preservar esa separación.

## Restricciones para el fix

El fix debe centralizar la precedencia por compromiso, conservar 50% sólo para shared explícito sin porcentaje, derivar `unknown` cuando falte evidencia, mantener siempre la mensualidad completa en household y no escribir/migrar documentos al leerlos. `familyOwner` y ownership de tarjeta no participarán en la resolución. La semántica temporal (`billingStartMonth`, último pago, `endingPlans`, `releasedFlow`) queda fuera del cambio.
