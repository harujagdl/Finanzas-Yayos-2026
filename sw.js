const CACHE_NAME = "fyayos-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isShellAsset = url.origin === self.location.origin && ASSETS.includes(url.pathname);

  if (isShellAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
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
