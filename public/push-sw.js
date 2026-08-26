// public/sw.js
      
      self.addEventListener("push", (event) => {
        console.log("[SW] Получен пуш от сервера!");
      
        let data = {};
        try {
          if (event.data) {
            data = event.data.json();
         }
        } catch (e) {
          console.error("[SW] Ошибка парсинга JSON, падаем на текст:", e);
          data = { title: "Событие", body: event.data ? event.data.text() : "Новое уведомление" };
        }
      
        const title = data.title || "ADelivo";
        const options = {
          body: data.body || "",
          icon: "/web-app-manifest-192x192.png",
          badge: "/web-app-manifest-192x192.png",
          data: {
            url: data.url || null,
            role: data.role || null,
            orderId: data.orderId || null,
          },
          vibrate: [200, 100, 200],
          // 🔥 Заставляет пуш висеть на экране менеджера, пока он его не смахнет
          requireInteraction: true,
        };
      
        // Безопасное добавление тега
        const tagStr = data.tag || (data.orderId ? `order-${data.orderId}` : null);
        if (tagStr) {
          options.tag = tagStr;
          options.renotify = true;
        }
      
        event.waitUntil(
          Promise.all([
            // 1. Показываем всплывашку
            self.registration.showNotification(title, options).catch(err => console.error("[SW] Ошибка отрисовки:", err)),
            
            // 2. Отправляем сигнал на открытые вкладки (чтобы Дашборд обновился)
            self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
              for (const client of clients) {
                client.postMessage({
                  type: "PUSH_RECEIVED",
                  orderId: data.orderId || null,
                  role: data.role || null
                });
              }
            }),
          ])
        );
      });
      
      self.addEventListener("notificationclick", (event) => {
        event.notification.close();
      
        const { url, role, orderId } = event.notification.data || {};
      
        let targetPath;
        if (role === "COURIER") {
          targetPath = "/courier/routes";
        } else if (url) {
          targetPath = url;
        } else {
          targetPath = orderId ? `/dashboard?orderId=${orderId}` : "/manager";
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
         }).catch(err => console.error("[SW] Ошибка переподписки:", err))
       );
     });
     
     self.addEventListener("install", () => self.skipWaiting());
     
     self.addEventListener("activate", (event) => {
       event.waitUntil(self.clients.claim());
     });