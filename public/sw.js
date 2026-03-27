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
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.data ?? {},
    // Вибрация и звук (где поддерживается)
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: data.data?.orderId ? `order-${data.data.orderId}` : "flowerops",
    renotify: true,
  };

  event.waitUntil(
    Promise.all([
      // Показываем уведомление
      self.registration.showNotification(title, options),

      // Если вкладка открыта — шлём PUSH_RECEIVED чтобы она сразу обновила список
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({
            type: "PUSH_RECEIVED",
            orderId: data.data?.orderId ?? null,
          });
        }
      }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const orderId = event.notification.data?.orderId;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Если вкладка уже открыта — фокусируемся на ней и передаём orderId
        for (const client of clients) {
          if (client.url.includes("/dashboard")) {
            client.focus();
            client.postMessage({ type: "NOTIFICATION_CLICK", orderId });
            return;
          }
        }
        // Иначе открываем новую вкладку
        const url = orderId ? `/dashboard?orderId=${orderId}` : "/dashboard";
        return self.clients.openWindow(url);
      })
  );
});

// Активация SW без ожидания
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Пока оставляем пустым, мы не кэшируем запросы, но браузер будет доволен
});