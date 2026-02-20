# Plan de implementación — QR Link SIEMPRE a PWA Vercel

> Contexto detectado: este repositorio (`Finanzas-Yayos-2026`) no contiene los paths mencionados en el pedido (`haruja-tiendanube-embedded-app-main`, `functions/`, `app/lealtad/index.html`).
> 
> Este documento deja un plan ejecutable para aplicar exactamente los EPICs en el repo objetivo cuando esté disponible.

## Objetivo

- Generar `qrLink` siempre con base `https://haruja-panel.vercel.app`.
- Bloquear `run.app` como origen válido.
- Garantizar fallback en UI para clientes legacy.
- (Opcional) ejecutar backfill para corregir datos persistidos.

---

## EPIC 1 — Backend como fuente de verdad (Vercel)

### 1) Configuración de base pública
- Definir: `BASE_PUBLIC_URL=https://haruja-panel.vercel.app`
- Prioridad sugerida:
  1. `process.env.BASE_PUBLIC_URL`
  2. `functions config` (`loyalty.base_public_url`) si está en uso
  3. fallback constante hardcoded en código

### 2) Hardening de URL base
Implementar helpers:

- `DEFAULT_PUBLIC_BASE_URL = "https://haruja-panel.vercel.app"`
- `sanitizeBaseUrl(url)`
  - trim
  - remover slash final
  - devolver vacío si incluye `run.app`

### 3) Constructor de links
- `buildPublicBaseUrl()` debe devolver solo URL válida (nunca `run.app`).
- `buildQrLink(token)` debe generar:
  - `${buildPublicBaseUrl()}/tarjeta-lealtad.html?token=${encodeURIComponent(token)}`

### 4) Flujo de alta de cliente
Validar que el endpoint de registro:
- guarda `token`
- guarda `qrLink` construido con Vercel
- retorna `qrLink` al frontend

### 5) Deploy Functions
```bash
firebase functions:config:set loyalty.base_public_url="https://haruja-panel.vercel.app"
firebase deploy --only functions
```

### Validación EPIC 1
- Registrar cliente nuevo.
- Verificar en respuesta API + Firestore que `qrLink` apunta a Vercel.

---

## EPIC 2 — Fallback UI para datos legacy

Archivo objetivo: `app/lealtad/index.html`

### 1) Base pública frontend
```js
const PWA_PUBLIC_BASE_URL = "https://haruja-panel.vercel.app";
```

### 2) Helper de fallback
```js
function buildPwaQrLink(client) {
  const token = String(client?.token || "").trim();
  if (!token) return "#";
  return `${PWA_PUBLIC_BASE_URL}/tarjeta-lealtad.html?token=${encodeURIComponent(token)}`;
}
```

### 3) Normalización de `client.qrLink`
```js
const raw = String(client?.qrLink || "").trim();
const qrLink = (!raw || raw.includes("run.app")) ? buildPwaQrLink(client) : raw;
```

### 4) Reusar `qrLink` normalizado
- Mostrar link en UI.
- Copiar al clipboard.
- Generar QR imagen/canvas.

### 5) Deploy Hosting
```bash
firebase deploy --only hosting
```

### Validación EPIC 2
- Abrir cliente viejo con `run.app`.
- Confirmar que UI muestra y usa URL Vercel.

---

## EPIC 3 (Opcional) — Backfill en Firestore

### Endpoint temporal admin
- `POST /api/loyalty/backfillQrLinks`
- Recorrer `loyalty_clients`.
- Si `qrLink` vacío o contiene `run.app`:
  - recalcular con `buildQrLink(token)`
  - persistir Vercel

### Cierre seguro
- Ejecutar 1 vez.
- Auditar cantidad de docs actualizados.
- Eliminar o proteger endpoint tras ejecución.

### Validación EPIC 3
- Verificar docs en Firestore corregidos.

---

## Criterios de Done

- Clientes nuevos: `qrLink` siempre con `haruja-panel.vercel.app`.
- Clientes legacy: UI ya no muestra `run.app`.
- (Si se ejecuta backfill) Firestore queda saneado.
- No reaparece `run.app/tarjeta-lealtad.html` en ningún flujo.

---

## Checklist de ejecución rápida (repo objetivo)

1. Aplicar cambios en backend (`functions/loyalty.js` o equivalente).
2. Aplicar fallback frontend (`app/lealtad/index.html`).
3. Desplegar Functions + Hosting.
4. Validar cliente nuevo.
5. Validar cliente legacy.
6. (Opcional) correr backfill y retirar endpoint.
