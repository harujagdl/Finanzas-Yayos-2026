# Arquitectura de notificaciones financieras

## Hallazgos del código actual

- La PWA ya registra `sw.js` al cargar la aplicación y usa Firebase Web SDK 9.22.0.
- El service worker ya inicializa Firebase Cloud Messaging en modo compat para mensajes en segundo plano.
- Las tarjetas almacenan días de corte/pago con `closingDay`/`cutDay` y `dueDay`/`payDay`.
- Los abonos se identifican como movimientos de pago y se asocian a tarjeta mediante `cardId`/`targetCardId`.
- La vista actual de cobertura usa el presupuesto mensual y la función `renderCardsCycleBudget`.
- La predicción mensual se calcula en cliente con `computeMonthlyPrediction`; las notificaciones deben usar resúmenes backend en `/workspaces/{workspaceId}/monthlySummaries/{YYYY-MM}` para no confiar en montos del navegador.

## Diseño implementado en esta fase

- `utils/notificationRules.js` contiene reglas puras y testeables para corte, pago, vencidos, presupuesto, cobertura, privacidad y deduplicación.
- `sw.js` acepta payloads con `targetRoute`, enfoca una ventana existente y navega la app al tocar la notificación.
- La pantalla `Configuración > Notificaciones` registra preferencias en Firestore, solicita permiso solo por acción explícita del usuario y permite enviar una notificación local de prueba.
- Las reglas de Firestore protegen preferencias, dispositivos push y hacen `notificationLog` de solo lectura para clientes.

## Siguiente paso backend

Crear Cloud Functions con una función programada diaria a las 08:00 `America/Mexico_City` que:

1. Lea usuarios con preferencias activas.
2. Lea tokens activos en `pushDevices`.
3. Lea tarjetas, pagos aplicados y `monthlySummaries`.
4. Evalúe `utils/notificationRules.js` o una copia compartida equivalente.
5. Cree documentos en `notificationLog` usando `deduplicationKey` como control idempotente.
6. Envíe por Firebase Cloud Messaging y elimine tokens rechazados/expirados.
