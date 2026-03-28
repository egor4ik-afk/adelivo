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
    // Сохраняем ВСЁ нужное в data уведомления
    data: {
      url: data.url ?? null,       // целевой путь (передаём с сервера)
      role: data.role ?? null,     // "COURIER" | "OPERATOR" | "ADMIN"
      orderId: data.orderId ?? null,
    },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: data.orderId ? `order-${data.orderId}` : "eventwave",
    renotify: true,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),

      // Уведомляем открытые вкладки, чтобы они обновились
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

  // ── Определяем куда вести ──
  // Курьер → всегда /courier/routes (его заказы там)
  // Оператор/Админ → /dashboard с опциональным orderId
  let targetPath;

  if (role === "COURIER") {
    // У курьера нет /dashboard — ведём на маршруты
    targetPath = "/courier/routes";
  } else if (url) {
    // Сервер прислал конкретный url — используем его
    targetPath = url;
  } else {
    // Фолбэк для оператора/админа
    targetPath = orderId ? `/dashboard?orderId=${orderId}` : "/dashboard";
  }

  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Ищем уже открытое окно/PWA с нашим origin
        const existing = clients.find(
          (c) => c.url.startsWith(self.location.origin) && "focus" in c
        );

        if (existing) {
          // Сообщаем открытой вкладке о клике и навигируем
          existing.postMessage({ type: "NOTIFICATION_CLICK", orderId, role });
          return existing.focus().then((c) => c.navigate(targetUrl));
        }

        // Открываем новое окно — если PWA установлена, откроется в ней
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Намеренно пусто — не кэшируем, но регистрация SW работает корректно
});