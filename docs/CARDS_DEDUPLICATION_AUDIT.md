# Auditoría de duplicados de tarjetas — Fases 1–4

**Estado:** `AUDIT_ONLY / STOP`
**Fecha:** 2026-08-18
**Producción modificada:** no.

## Resultado ejecutivo

La causa raíz confirmada en código es una operación *check-then-create* no atómica en `seedPresetCards`: primero lee todas las tarjetas y después crea cada preset faltante con un ID aleatorio. Dos pestañas, dispositivos, reconexiones o ejecuciones simultáneas pueden observar la misma ausencia y crear ambas el mismo preset. La comparación usada (`lowercase + trim`) tampoco elimina acentos, puntuación o espacios internos y no existe una llave única persistida. Firestore Rules solamente valida `owner`; no impone unicidad.

El selector y los resúmenes recorren cada documento de `cards`, por lo que exponen y suman ambos documentos. Esto confirma que ocultar nombres repetidos no repararía las relaciones.

## Bloqueo de datos y STOP

Se intentó una lectura HTTP **GET** de la colección de producción (sin operación de escritura), pero el proxy del entorno respondió `403 Forbidden` antes de alcanzar Firestore. El repositorio no contiene un export de datos ni credenciales administrativas. En consecuencia, no es posible afirmar IDs, conteos ni conflictos reales sin inventar información.

Estado del reporte de datos:

```text
Total cards: UNKNOWN (production export required)
Logical unique cards: UNKNOWN
Duplicate groups: UNKNOWN
Documents proposed for merge: 0
Classification: DATA_ACCESS_BLOCKED
```

No se propone mapping hasta procesar un export real: `{}`. En particular, Costco, Free, Like u y Mercado Pago son grupos **reportados por usuarios pero no verificados por ID**.

## Mapa del modelo confirmado

| Ruta | Relación con tarjeta | Notas |
| --- | --- | --- |
| `cards/{cardId}` | entidad raíz | Campos escritos/leídos: `name`, `owner`, `cutDay`, `payDay`, `closingDay`, `dueDay`, `cycleMode`, `limit`, `balance`, `payGoal`; documentos antiguos pueden carecer de `owner`; no hay `createdAt`/`updatedAt` garantizados. |
| `expenses/{id}` | `cardId -> cards/{id}` para gastos/MSI | MSI no es una colección: vive en movimientos con `isMsi`, `msiMonths`, `msiStart`, `msiTotal`, `msiMonthly`, `currentInstallment` e `installmentsPaid`. |
| `expenses/{id}` | `targetCardId -> cards/{id}` para abonos | Conserva también `cardName`/`targetCardName`; ciclos pueden guardar `cardCycleId`, `statementId` y `cardStatementId`, todos derivados del ID. |
| `goals/{id}` | ninguna referencia a tarjeta confirmada | Metas usan `owner`; no se encontró `cardId`. |
| `goal_contributions/{id}` | `goalId -> goals/{id}` | Sin referencia de tarjeta confirmada. Además, las reglas actuales no incluyen esta colección, riesgo operativo independiente. |
| `monthly_summaries/{id}` | ninguna referencia persistida | Se deriva desde `expenses` y agrupa categoría/owner, no tarjeta. |
| `budgets/{monthKey}` | ninguna referencia de tarjeta confirmada | Estado de efectivo mensual; las reglas actuales tampoco incluyen esta colección. |
| `categories/{id}` | ninguna | Sin referencia de tarjeta; reglas actuales no incluyen la colección. |

Campos equivalentes que la aplicación tolera en memoria: `card`, `creditCardId`, `accountId`, `cardName`, `targetCardName`, `bank` y `bankName`. La auditoría cuenta referencias estables por `cardId`, `targetCardId`, `creditCardId` y `accountId`, y separa coincidencias que existen solamente por nombre.

## Ciclo de vida de tarjetas

- **Creación:** solamente el sembrado automático `seedPresetCards`; usa `addDoc` y IDs aleatorios. No existe formulario de alta manual.
- **Carga:** snapshot de `cards` filtrado por `owner` y ordenado por `name`; cada documento se agrega sin deduplicación al selector y totales.
- **Edición:** `form-card` actualiza nombre, fechas, modo de ciclo, límite, balance y meta de pago. No actualiza `owner` ni valida duplicados.
- **Eliminación:** `deleteCard` elimina inmediatamente el documento después de confirmación. No busca referencias y puede dejar movimientos huérfanos.

## Herramienta de auditoría agregada

`scripts/audit-cards.mjs` es deliberadamente de solo lectura respecto de Firestore: únicamente lee un JSON local y escribe opcionalmente un reporte nuevo (`flag: wx`, nunca sobrescribe). Acepta `{ "collections": { ... } }`, `{ "cards": [], "expenses": [] }` o respuestas REST `{ "documents": [...] }`.

```bash
node scripts/audit-cards.mjs --input firestore-export.json --output cards-audit.json
```

La llave es `normalizedOwner__normalizedName`. La normalización aplica trim, minúsculas, eliminación de diacríticos, compactación de caracteres no alfanuméricos a guion y limpieza de guiones extremos. Cada grupo informa documentos, campos conflictivos, conteos y detalles de referencias por colección. Solo clasifica `SAFE_TO_MERGE` cuando no hay conflictos y el candidato tiene estrictamente más referencias; cualquier empate o dato incompatible queda `REQUIRES_MANUAL_REVIEW` sin mapping.

## Estrategia recomendada para una fase posterior (no implementada)

1. Exportar al menos `cards` y `expenses`, además de todas las colecciones descubiertas mediante Admin SDK/listado del proyecto.
2. Ejecutar este audit, revisar coincidencias solo por nombre y aprobar explícitamente cada mapping.
3. Antes de migrar, decidir reglas para `balance`, `limit`, `payGoal`, fechas/ciclo y los identificadores derivados de ciclo/estado de cuenta.
4. En migración aprobada, actualizar primero referencias ID y metadatos derivados, verificar cero referencias, consolidar campos y eliminar al final.
5. Hacer la migración idempotente, paginada, con `--dry-run`, log durable y precondiciones; respaldar antes de `--apply`.
6. Después, persistir `canonicalKey`, usar IDs deterministas o una transacción/Cloud Function para unicidad, bloquear doble submit, advertir duplicados en UI y agrupar siempre por ID canónico.

## Archivos previstos para fases 5–9

- `index.html`: creación/edición, bloqueo de submit, carga defensiva, selector, pagos, MSI, balances y resumen/exportación.
- `firebase/firestore.rules`: validación compatible con `canonicalKey` (las Rules no pueden consultar unicidad de una colección de forma general; conviene documento índice/ID determinista).
- `scripts/dedupe-cards.mjs`: migración futura, **solo tras aprobación**.
- Tests de integración con Firestore Emulator para concurrencia, migración doble y preservación de movimientos/MSI/pagos.

## Riesgos

- Borrar una tarjeta hoy deja `expenses.cardId` o `expenses.targetCardId` huérfanos.
- `balance`, `limit`, `payGoal` y fechas pueden ser incompatibles; no deben sumarse o sobrescribirse sin decisión humana.
- `cardName`/`targetCardName` están desnormalizados y pueden no coincidir con el documento vigente.
- `cardCycleId`, `statementId` y `cardStatementId` incorporan el ID anterior y requieren política explícita.
- Persistencia offline y múltiples clientes amplifican la carrera del sembrado.
- Los nombres no prueban identidad; dos productos legítimos con nombres normalizados iguales requieren revisión.
- Las reglas publicadas permiten al cliente eliminar tarjetas sin comprobación referencial y no cubren varias colecciones usadas por la app.
- La auditoría estática no puede descubrir colecciones ajenas al repositorio; el inventario de producción debe compararse antes de migrar.

## Punto de control

**STOP obligatorio alcanzado.** No se implementó ni ejecutó migración, eliminación, backfill, `canonicalKey` en producción, defensa UI ni cambio de reglas. Se requiere un export/lectura autorizada y aprobación humana del reporte con IDs antes de continuar.
