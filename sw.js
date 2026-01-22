const CACHE_VERSION = "v1.0.0"; // actualizar en cada deploy
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

const isIndexRequest = (request) => {
  if (request.mode === "navigate") return true;
  const url = new URL(request.url);
  return url.origin === self.location.origin && (url.pathname === "/" || url.pathname === "/index.html");
};

const isCacheableStaticAsset = (request) => {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (STATIC_ASSETS.includes(url.pathname)) return true;
  return /\.(?:css|js|png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname);
};

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key !== STATIC_CACHE ? caches.delete(key) : null))
      )
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (isIndexRequest(event.request)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put("/index.html", networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await caches.match("/index.html");
          if (cachedResponse) return cachedResponse;
          return caches.match(event.request);
        }
      })()
    );
    return;
  }

  if (isCacheableStaticAsset(event.request)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const responseClone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, responseClone));
            }
            return response;
          })
          .catch(() => cached);
      })
    );
  }
});

// =========================
// 🔔 Firebase Cloud Messaging (background)
// =========================
// Usamos compat dentro del SW (es lo más estable en SW)
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDTDnao-bkiC4yxmV-mGryBmmvlWOvMIpg",
  authDomain: "finanzas-yayos-1738b.firebaseapp.com",
  projectId: "finanzas-yayos-1738b",
  storageBucket: "finanzas-yayos-1738b.firebasestorage.app",
  messagingSenderId: "821972200592",
  appId: "1:821972200592:web:de809935c39a319ff4bc15"
});

const messaging = firebase.messaging();

// Cuando llega push con app cerrada / background
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Recordatorio de pago";
  const body  = payload?.notification?.body  || "";
  const url   = payload?.data?.url || "/index.html";

  self.registration.showNotification(title, {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url }
  });
});

// Click en notificación
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/index.html";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// =========================
// 📌 Documentación rápida
// =========================
// CACHE_VERSION: v1.0.0
// Static cache: /manifest.json, /icons/icon-192.png, /icons/icon-512.png
// Validación:
// 1) Abrir PWA instalada
// 2) Hacer deploy con cambio visible y subir CACHE_VERSION
// 3) Recargar: ver cambio sin reinstalar
// 4) Activar modo avión: la app sigue abriendo si ya cargó antes
