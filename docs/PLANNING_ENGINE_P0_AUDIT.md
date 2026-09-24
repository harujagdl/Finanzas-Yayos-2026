# Auditoría — Motor de Planeación Financiera P0

## Arquitectura actual relevante

Yayos es una PWA estática, mobile-first, sin bundler: `index.html` contiene la interfaz y la integración Firebase modular por CDN; los cálculos reutilizables viven como módulos ES en `utils/`. Firestore usa snapshots en tiempo real y persistencia IndexedDB. El perfil activo (`haru`/`yair`) se conserva en `localStorage`; no existe Firebase Auth, por lo que `owner` es el límite lógico existente, no una identidad criptográfica.

Las colecciones activas son `cards`, `expenses`, `goals`, `goal_contributions` y `monthly_summaries`. Las compras MSI existentes son campos dentro de `expenses`; ya hay cálculo de avance, agrupación por tarjeta y vista familiar. Las tarjetas aceptan aliases legacy (`cutDay`/`closingDay`, `limit`/`creditLimit`, etc.). La navegación es por secciones del mismo documento.

## Qué se reutiliza

- Firebase/Firestore, snapshots, persistencia offline y selector de owner.
- Componentes, tokens, tarjetas KPI, tipografía y navegación existentes.
- `monthKey.js` y las convenciones existentes de MSI/fechas.
- `cards`, `expenses`, `goals` y `monthly_summaries` sin migrarlas ni reescribirlas.

## Qué se extiende

- `cards`: campos opcionales de producto, saldos, propiedad y estado; los aliases actuales siguen siendo válidos.
- Nueva colección `installment_plans`: fuente explícita para compromisos planeados. No reemplaza destructivamente los MSI históricos en `expenses`.
- Nuevo módulo puro `planningEngine.js`, con aritmética en centavos, proyección, disponible seguro y escenarios inmutables.
- Nueva sección `Planeación`, formularios de plan/simulador y timeline de 12 meses.

## Colecciones afectadas

| Colección | Cambio |
|---|---|
| `cards` | Campos opcionales adicionales, lectura legacy normalizada |
| `installment_plans` | Nueva; lectura/escritura aislada por `owner` |
| `expenses`, `goals`, `monthly_summaries` | Sin cambio destructivo |

## Riesgos

1. La ausencia de Firebase Auth significa que las reglas existentes validan valores de owner pero no autentican a la persona. P0 conserva este contrato y no lo empeora; Auth debe ser P1.
2. MSI guardados históricamente en `expenses` y planes explícitos pueden duplicarse si se migran sin conciliación. P0 no migra automáticamente.
3. La liberación por liquidación anticipada depende del banco; toda salida se etiqueta como simulación y requiere confirmación.
4. Datos incompletos impiden un disponible seguro confiable; el motor devuelve los campos faltantes en vez de inventar importes.

## Plan de implementación

1. Añadir normalizadores/modelos retrocompatibles y motor financiero puro.
2. Proteger `installment_plans` con las mismas reglas estrictas de owner.
3. Suscribir planes del owner y construir pantalla Planeación con alta, proyección y simulación local.
4. Extender editor de tarjeta con campos opcionales.
5. Cubrir casos financieros, legado, precisión e inmutabilidad con tests.
6. Ejecutar suite completa, validación sintáctica y smoke test visual.
