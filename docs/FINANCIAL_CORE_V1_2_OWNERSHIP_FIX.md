# Financial Core V1.2 — corrección de ownership por MSI

## Decisión

El ownership se resuelve exclusivamente desde cada movimiento/compromiso mediante la función pura `resolveCommitmentOwnership()`. No recibe ni consulta tarjetas y no infiere a partir de nombre de tarjeta, comercio, descripción o monto.

## Precedencia

1. `ownershipType=personal|shared` explícito en el compromiso.
2. Evidencia legacy shared del mismo compromiso: `scope=shared`, `owner=both`, `shared=true` o `isShared=true`.
3. Evidencia legacy personal: `scope=personal`, `shared=false` o `isShared=false`.
4. Sin evidencia: estado derivado `unknown`, `needsClassification=true`.

Para shared, el porcentaje válido se toma de `ownerSharePercentage` y después del alias compatible `splitPercentage`. Debe ser mayor que 0 y menor o igual que 100. Si el registro es explícitamente shared y no tiene porcentaje válido, sólo ese registro usa el fallback legacy de 50%. Personal siempre produce 100%, aunque haya un porcentaje residual contradictorio.

`owner=yair|haru` no clasifica: ese campo identifica el documento para consultas/reglas. `familyOwner` tampoco clasifica: sigue siendo responsable en Familia. El ownership configurado en una tarjeta permanece independiente.

## Ambiguos y cálculo efectivo

Un MSI sin evidencia se conserva en household por el 100% de su mensualidad. No se inventa 50%: se excluye temporalmente del total efectivo conocido, y Resumen/Planeación marcan el total como **parcial** junto con el número de compromisos por clasificar. El modelo normalizado expone `unclassifiedCommitment`, `unclassifiedCommitmentCount` y `effectiveCommitmentPartial`.

Esta elección privilegia un número efectivo explícitamente incompleto sobre una cifra falsa. No oculta el compromiso, no lo elimina de household y no persiste `unknown` automáticamente.

## UI y edición

* El detalle MSI muestra `Personal`, `Compartido · N%` o `Por clasificar` por compra.
* Si hay ambiguos, una llamada no bloqueante “Revisa la clasificación de tus MSI” muestra el número pendiente.
* “Editar ownership” reutiliza el formulario de edición del movimiento.
* Un MSI nuevo se guarda con `ownershipType` explícito. Personal guarda 100%; Compartido revela “Tu participación” y valida `> 0` y `<= 100`.
* Al abrir un legacy ambiguo, el selector muestra `Por clasificar`; para confirmar la edición el usuario debe elegir Personal o Compartido. Sólo esa confirmación escribe la clasificación. No hay escritura al abrir o listar.
* Los listeners existentes de `expenses` vuelven a renderizar MSI, Resumen y Planeación después del update; no se requiere reload.

## Household y temporalidad

La mensualidad completa sigue alimentando `householdCommitment`, con independencia de ownership. Cambiar Personal/Compartido o el porcentaje sólo altera `effectiveMultiplier` y por ello `effectiveCommitment` (y el flujo efectivo liberado), nunca monto original, mensualidad, saldo, plazos, tarjeta o fechas.

No se modificaron `resolveInstallmentPosition`, la selección de `billingStartMonth`, la posición de `endingPlans` ni la regla que registra `releasedFlow` en el mes posterior al último pago. La deduplicación por enlaces explícitos tampoco cambió.

## Reactividad y persistencia

No hay migración masiva, batch de ownership ni write-on-read. Los documentos legacy conservan su forma hasta que el usuario edita y guarda el MSI. La actualización normal de Firestore dispara los listeners ya existentes y recalcula las tres vistas desde el mismo compromiso normalizado.

## Cobertura

Los tests cubren personal 100%, shared 50/70/30, mezcla en una tarjeta, independencia del nombre y cantidad de tarjetas, fallback shared legacy, ambiguous unknown, cambios de ownership sin cambio de household, consistencia MSI–Resumen–Planeación, fixture `$4,871.60`, último pago, liberación posterior y deduplicación.

## Limitaciones

* Los registros que contienen `scope=shared` son evidencia legacy explícita y conservan fallback 50% si no tienen porcentaje. Dado que versiones anteriores seleccionaban ese scope por defecto, el sistema no puede distinguir técnicamente entre una selección consciente y el default histórico; por eso se muestran como compartidos y el usuario puede corregirlos progresivamente.
* `unknown` es derivado, no un tercer valor persistido. Esto evita romper consumidores que esperan sólo personal/shared.
* Familia continúa usando `familyOwner` para responsable/proyección; no se convirtió en una segunda fuente de porcentaje.
* El contenedor de QA no incluye Chromium/Chrome ni Playwright, por lo que no fue posible generar capturas o ejecutar validación visual automatizada desktop/mobile. Se validaron estructura HTML (IDs únicos) y sintaxis del módulo embebido; la revisión visual queda pendiente en un navegador conectado a datos de prueba.
