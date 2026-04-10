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
    // 🔥 Берём tag из данных пуша — сервер теперь шлёт уникальные теги
    // chat-conv-<id>, chat-global-<senderId>, order-<id>, eventwave
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
          return existing.focus().then((c) => c.navigate(targetUrl));
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// 🔥 Переподписка если браузер обновил подписку
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
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

self.addEventListener("fetch", () => {});