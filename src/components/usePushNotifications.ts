"use client";

import { useState, useEffect } from "react";

export type PushState = "loading" | "unsupported" | "denied" | "default" | "granted";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
  return arr.buffer.slice(0) as ArrayBuffer;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission as PushState);
  }, []);

  const subscribe = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      if (permission !== "granted") return;

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY не задан в .env");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) {
        console.error("[Push] Ошибка сохранения подписки:", await res.json().catch(() => ({})));
        return;
      }

      console.log("[Push] Подписка успешно сохранена");
    } catch (error) {
      console.error("[Push] Ошибка подписки:", error);
      setState("denied");
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();

      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }

      setState("default");
    } catch (error) {
      console.error("[Push] Ошибка отписки:", error);
    }
  };

  return { state, subscribe, unsubscribe };
}