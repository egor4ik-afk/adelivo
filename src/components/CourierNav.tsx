"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { GlobalChat } from "./GlobalChat";

export function CourierNav({ currentUserId }: { currentUserId: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Слушаем счетчик из GlobalChat
  useEffect(() => {
    const handleUnread = (e: any) => setUnread(e.detail);
    window.addEventListener("chat-unread", handleUnread);
    return () => window.removeEventListener("chat-unread", handleUnread);
  }, []);

  const navItems = [
    { href: "/courier/points", icon: "📍", label: "Карта" },
    { href: "/courier/routes", icon: "📋", label: "Маршруты" },
    { href: "/courier/profile", icon: "👤", label: "Профиль" },
  ];

  return (
    <>
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, display: "flex",
        background: "rgba(255, 255, 255, 0.95)", backdropFilter: "blur(10px)",
        borderTop: "1px solid #e8e6df", paddingBottom: "env(safe-area-inset-bottom)",
        height: 56, zIndex: 1000, boxShadow: "0 -2px 10px rgba(0,0,0,0.03)"
      }}>
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", textDecoration: "none",
              color: isActive ? "#4a7aff" : "#a8a49c", gap: 2
            }}>
              <div style={{ fontSize: 20, filter: isActive ? "none" : "grayscale(100%) opacity(0.5)", transition: "all 0.2s" }}>
                {item.icon}
              </div>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, transition: "all 0.2s" }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Кнопка Чата */}
        <button onClick={() => window.dispatchEvent(new Event("open-chat"))} style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "none", border: "none", color: "#a8a49c", gap: 2, cursor: "pointer", padding: 0
        }}>
          <div style={{ fontSize: 20, position: "relative", filter: "grayscale(100%) opacity(0.5)" }}>
            💬
            {unread > 0 && (
              <span style={{ position: "absolute", top: -4, right: -8, background: "#ef4444", color: "#fff", borderRadius: 8, padding: "1px 4px", fontSize: 9, fontWeight: 700 }}>
                {unread}
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 500 }}>Чат</span>
        </button>
      </nav>

      {/* Отрисовываем сам компонент чата, он скроет свою плавающую кнопку на телефонах благодаря CSS */}
      <GlobalChat currentUserId={currentUserId} />
    </>
  );
}