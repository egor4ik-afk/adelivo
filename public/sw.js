self.addEventListener("push", (event) => {
    if (!event.data) return;
    let data;
    try { data = event.data.json(); } catch { data = { title: "FlowerOps", body: event.data.text() }; }
    event.waitUntil(
      self.registration.showNotification(data.title ?? "FlowerOps", {
        body: data.body ?? "",
        icon: "/icon-192.png",
        data: data.data ?? {},
        tag: data.data?.type ?? "default",
        renotify: true,
      })
    );
  });
  
  self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const orderId = event.notification.data?.orderId;
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({ type: "NOTIFICATION_CLICK", orderId });
            return;
          }
        }
        return clients.openWindow(orderId ? `/?order=${orderId}` : "/");
      })
    );
  });
  
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));