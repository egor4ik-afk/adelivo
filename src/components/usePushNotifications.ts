// src/components/usePushNotifications.ts
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

export async function doSubscribe(): Promise<boolean> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) { console.error("[Push] VAPID key не задан"); return false; }

  // Проверяем — может подписка уже есть
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    // Переотправляем на сервер на случай если протухла
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing.toJSON()),
    });
    return true;
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

  return res.ok;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  // 🔥 Нужен ли баннер — автоподписка не сработала
  const [needsBanner, setNeedsBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }

    const perm = Notification.permission as PushState;
    setState(perm);

    if (perm === "granted") {
      // Подписка уже есть — проверяем что жива
      doSubscribe().catch(console.error);
      return;
    }

    if (perm === "denied") return;

    // perm === "default" — пробуем автоподписку (работает в Chrome PWA)
    doSubscribe()
      .then(ok => {
        if (ok) {
          setState("granted");
          setNeedsBanner(false);
        } else {
          // Не сработало (Яндекс браузер) — показываем баннер
          setNeedsBanner(true);
        }
      })
      .catch(() => {
        // Яндекс/Safari заблокировал без жеста — показываем баннер
        setNeedsBanner(true);
      });
  }, []);

  const subscribe = async () => {
    try {
      const ok = await doSubscribe();
      if (ok) {
        setState("granted");
        setNeedsBanner(false);
      } else {
        setState(Notification.permission as PushState);
      }
    } catch (error) {
      console.error("[Push] Ошибка подписки:", error);
      setState(Notification.permission as PushState);
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
      setNeedsBanner(true); // После отписки показываем баннер снова
    } catch (error) {
      console.error("[Push] Ошибка отписки:", error);
    }
  };

  return { state, subscribe, unsubscribe, needsBanner };
}