// src/components/CourierNav.tsx
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { GlobalChat } from "./GlobalChat";

// 🔥 Экспортируем константу высоты навбара для использования в страницах
export const NAV_HEIGHT = 56;

export function CourierNav({ currentUserId }: { currentUserId: string }) {
  const pathname = usePathname();

  // Вкладка биржи не всем нужна: курьер, который возит только свои маршруты,
  // выключает её в профиле. Право брать заказы это не отбирает.
  const [showExchange, setShowExchange] = useState(false);
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setShowExchange(d?.showExchange ?? false))
      .catch(() => setShowExchange(false));
  }, []);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const handleUnread = (e: any) => setUnread(e.detail);
    window.addEventListener("chat-unread", handleUnread);
    return () => window.removeEventListener("chat-unread", handleUnread);
  }, []);

  // Устанавливаем CSS-переменную --nav-height на :root при маунте
  useEffect(() => {
    document.documentElement.style.setProperty("--nav-height", `${NAV_HEIGHT}px`);
  }, []);

  // 🔥 ЛОГИКА СЛЕЖЕНИЯ ЗА ГЕОПОЗИЦИЕЙ КУРЬЕРА
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) return;

    const sendLocation = async (lat: number, lng: number) => {
      try {
        await fetch("/api/courier/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
      } catch (err) {
        console.error("Ошибка отправки локации:", err);
      }
    };

    // 1. watchPosition реагирует на движение устройства и работает в фоне
    const watchId = navigator.geolocation.watchPosition(
      (position) => sendLocation(position.coords.latitude, position.coords.longitude),
      (err) => console.warn("Ошибка геолокации:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );

    // 2. Для надежности дублируем запрос каждые 2 минуты (если курьер стоит на месте)
    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => sendLocation(position.coords.latitude, position.coords.longitude),
        (err) => console.warn("Ошибка геолокации (интервал):", err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }, 120000); // 120 000 мс = 2 минуты

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
    };
  }, []);

  const navItems = [
    { href: "/courier/points", icon: "📍", label: "Карта" },
    { href: "/courier/routes", icon: "📋", label: "Маршруты" },
    ...(showExchange ? [{ href: "/courier/exchange", icon: "🌐", label: "Биржа" }] : []),
    { href: "/courier/profile", icon: "👤", label: "Профиль" },
  ];

  return (
    <>
      <nav style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        background: "var(--color-nav-bg)",
        backdropFilter: "blur(10px)",
        borderTop: "1px solid var(--color-border)",
        height: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
        zIndex: 1000,
        boxShadow: "var(--color-nav-shadow)",
        alignItems: "flex-start", 
      }}>
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              flex: 1,
              height: NAV_HEIGHT,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              color: isActive ? "var(--color-nav-active)" : "var(--color-text-3)",
              gap: 2,
            }}>
              <div style={{
                fontSize: 20,
                filter: isActive ? "none" : "grayscale(100%) opacity(0.5)",
                transition: "all 0.2s",
              }}>
                {item.icon}
              </div>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, transition: "all 0.2s" }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={() => window.dispatchEvent(new Event("open-chat"))}
          style={{
            flex: 1,
            height: NAV_HEIGHT,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            color: "var(--color-text-3)",
            gap: 2,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <div style={{ fontSize: 20, position: "relative", filter: "grayscale(100%) opacity(0.5)" }}>
            💬
            {unread > 0 && (
              <span style={{
                position: "absolute",
                top: -4,
                right: -8,
                background: "#ef4444",
                color: "#fff",
                borderRadius: 8,
                padding: "1px 4px",
                fontSize: 9,
                fontWeight: 700,
              }}>
                {unread}
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Чат</span>
        </button>
      </nav>

      <GlobalChat currentUserId={currentUserId} isCourier={true} />
    </>
  );
}