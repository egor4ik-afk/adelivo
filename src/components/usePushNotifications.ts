"use client";

import { useState, useEffect } from "react";

export type PushState = "loading" | "unsupported" | "denied" | "default" | "granted";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    // Проверяем поддержку уведомлений в браузере при загрузке
    if (typeof window !== "undefined") {
      if (!("Notification" in window)) {
        setState("unsupported");
      } else {
        setState(Notification.permission as PushState);
      }
    }
  }, []);

  const subscribe = async () => {
    if (!("Notification" in window)) return;
    
    try {
      const permission = await Notification.requestPermission();
      setState(permission as PushState);
      
      if (permission === "granted") {
        console.log("[Push] Разрешение получено. Здесь будет подписка Service Worker.");
        // TODO: Добавить логику Service Worker и отправку ключей на сервер
      }
    } catch (error) {
      console.error("[Push] Ошибка при запросе разрешения:", error);
    }
  };

  const unsubscribe = async () => {
    console.log("[Push] Отписка от уведомлений...");
    // TODO: Добавить логику удаления подписки из Service Worker и БД
    
    // Временно меняем стейт для UI (в реальности браузер не дает программно 
    // сбросить permission обратно на default, это делается в настройках сайта)
    setState("default");
  };

  return { state, subscribe, unsubscribe };
}