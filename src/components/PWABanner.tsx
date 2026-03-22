// src/components/PWABanner.tsx
"use client";
import { useState, useEffect } from "react";

export function PWABanner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // По умолчанию true, чтобы не моргал при загрузке
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    // Проверяем, установлено ли уже приложение (PWA)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in window.navigator && (window.navigator as any).standalone);
    setIsStandalone(standalone);

    if (standalone) return;

    // Перехват установки для Android / Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Проверка на iOS / Safari
    const ua = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      setShowIOSHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  if (isStandalone || closed) return null;

  // Баннер для Android (Кнопка "Установить")
  if (deferredPrompt) {
    return (
      <div style={{ background: "#4a7aff", color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10000 }}>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>Установите приложение для быстрой работы</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }} style={{ background: "#fff", color: "#4a7aff", border: "none", padding: "6px 12px", borderRadius: 8, fontWeight: 700, fontSize: 12 }}>Установить</button>
          <button onClick={() => setClosed(true)} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, padding: 0 }}>✕</button>
        </div>
      </div>
    );
  }

  // Баннер для iPhone (Инструкция)
  if (showIOSHint) {
    return (
      <div style={{ background: "#facc15", color: "#1a1a18", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10000 }}>
        <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>
          Для работы Push-уведомлений на iPhone: нажмите <b>«Поделиться» ⍐</b> в браузере, а затем <b>«На экран Домой» ➕</b>
        </div>
        <button onClick={() => setClosed(true)} style={{ background: "none", border: "none", color: "#1a1a18", fontSize: 20, padding: "0 0 0 10px" }}>✕</button>
      </div>
    );
  }

  return null;
}