# Finanzas-Yayos-2026

## Migración de documentos legacy sin `owner`

Este repo deja dos versiones de reglas:

- `firebase/firestore.rules`: modo estricto final (uso normal).
- `firebase/firestore.maintenance.rules`: ventana temporal de mantenimiento para reclamar documentos legacy sin `owner`.

### Fase 1 — Publicar rules temporales (maintenance)

1. Copia temporalmente las maintenance rules sobre las activas:

   ```bash
   cp firebase/firestore.maintenance.rules firebase/firestore.rules
   ```

2. Publica reglas en el proyecto correcto (desde consola Firebase o CLI):

   ```bash
   firebase deploy --only firestore:rules
   ```

### Fase 2 — Ejecutar reparación desde la app

1. Haz hard refresh de la app (`Ctrl+Shift+R`).
2. Ejecuta `repairLegacyOwnerData()` (botón **Reparar owner** o desde consola).
3. El script recorre `cards`, `goals`, `expenses`, `monthly_summaries` y hace:

   - `set({ owner: currentOwner }, { merge: true })` para docs sin `owner`.
   - Log de documentos escaneados/reparados por colección.

4. Verifica que desaparezcan errores de permisos en snapshots.

### Fase 3 — Volver a modo estricto final

1. Restaura reglas estrictas y publica:

   ```bash
   git checkout -- firebase/firestore.rules
   firebase deploy --only firestore:rules
   ```

2. QA recomendado:

   - La app carga `cards`/`goals` sin errores.
   - Guardar movimientos y editar tarjetas funciona.
   - `monthly_summaries` solo se escribe/lee para owners permitidos (`haru`/`yair`).
