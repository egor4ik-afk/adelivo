// public/sw.js

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "EventWave", body: event.data?.text() ?? "" };
  }

  const title = data.title ?? "EventWave";
  const options = {
    body: data.body ?? "",
    icon: "/web-app-manifest-192x192.png",
    badge: "/web-app-manifest-192x192.png",
    data: {
      url: data.url ?? null,
      role: data.role ?? null,
      orderId: data.orderId ?? null,
    },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: data.tag || (data.orderId ? `order-${data.orderId}` : "eventwave"),
    renotify: true,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: "PUSH_RECEIVED",
            orderId: data.orderId ?? null,
          });
        }
      }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { url, role, orderId } = event.notification.data ?? {};

  let targetPath;
  if (role === "COURIER") {
    targetPath = "/courier/routes";
  } else if (url) {
    targetPath = url;
  } else {
    targetPath = orderId ? `/dashboard?orderId=${orderId}` : "/dashboard";
  }

  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find(
          (c) => c.url.startsWith(self.location.origin) && "focus" in c
        );

        if (existing) {
          existing.postMessage({ type: "NOTIFICATION_CLICK", orderId, role });
          // 🔥 Безопасный переход
          return existing.focus().then((c) => {
            if (c.navigate) return c.navigate(targetUrl);
          });
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// 🔥 Исправленная переподписка с проверкой ключа
self.addEventListener("pushsubscriptionchange", (event) => {
  const appKey = event.oldSubscription?.options?.applicationServerKey;
  if (!appKey) return; 

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    }).then((newSubscription) => {
      return fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubscription.toJSON()),
      });
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 🔥 ОДИН ЕДИНСТВЕННЫЙ обработчик fetch
self.addEventListener("fetch", (event) => {
  // Игнорируем запросы к FCM
  if (event.request.url.includes('fcm.googleapis.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});