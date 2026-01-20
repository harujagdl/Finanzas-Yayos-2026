// sw.js (Finanzas Yayos) ✅ Copiar y pegar
const CACHE_NAME = "fyayos-v4";

// Usa rutas ABSOLUTAS (más estable en GitHub Pages)
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate (limpia caches viejos)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch (cache-first para lo estático)
self.addEventListener("fetch", (event) => {
  // Solo cachea GET
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((resp) => {
            // Guarda en cache solo si es respuesta válida
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return resp;
          })
          .catch(() => cached) // si falla fetch, regresa cache si existe
      );
    })
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch (e) {
    data = { title: "Recordatorio", body: event.data?.text() || "" };
  }

  const title = data.title || "Recordatorio de pago";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // url a abrir al tocar la notificación
    data: data.url || "/",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en notificación
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/";

  event.waitUntil(
    (async () => {
      // Si ya hay una pestaña abierta, enfócala
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      // Si no, abre nueva
      if (clients.openWindow) return clients.openWindow(url);
    })()
  );
});
