// src/components/layout/AppMenu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Item = { href: string; icon: string; label: string; hint?: string };

const SECTIONS: { title: string; items: Item[]; adminOnly?: boolean }[] = [
  {
    title: "Работа",
    items: [
      { href: "/orders", icon: "≡", label: "Заказы", hint: "Все заказы списком" },
      { href: "/couriers", icon: "🚚", label: "Курьеры", hint: "Смены, выплаты, геолокация" },
      { href: "/manager", icon: "📋", label: "Менеджер", hint: "Маршруты и изменения" },
      { href: "/manager/orders/new", icon: "＋", label: "Создать заказ", hint: "Вручную или вставкой текста" },
    ],
  },
  {
    title: "Управление",
    adminOnly: true,
    items: [
      { href: "/company", icon: "🏢", label: "Компания", hint: "Магазины, подключения, Telegram" },
      { href: "/admin", icon: "👥", label: "Пользователи", hint: "Роли сотрудников" },
      { href: "/admin/access", icon: "🔑", label: "Доступы", hint: "Кто какие магазины видит" },
    ],
  },
];

export function AppMenu({ isAdmin, compact }: { isAdmin: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Клик мимо меню закрывает его. Без этого на дашборде, где под меню
  // лежит карта, оно остаётся открытым и мешает работать.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <div ref={boxRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Меню"
        aria-expanded={open}
        title="Меню"
        style={{
          width: compact ? 34 : 36,
          height: compact ? 34 : 36,
          borderRadius: 9,
          border: "1px solid var(--color-border)",
          background: open ? "var(--color-surface)" : "transparent",
          color: "var(--color-text-2)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          transition: "background .15s, border-color .15s",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round">
          {open ? (
            <>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </>
          ) : (
            <>
              <path d="M3 6h18" />
              <path d="M3 12h18" />
              <path d="M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 0,
            zIndex: 200,
            width: 268,
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--color-card-shadow, 0 12px 40px rgba(0,0,0,0.35))",
            padding: 8,
            maxHeight: "calc(100vh - 90px)",
            overflowY: "auto",
          }}
        >
          {sections.map((section, i) => (
            <div key={section.title} style={{ marginTop: i === 0 ? 0 : 8 }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "var(--color-text-3)",
                padding: "8px 10px 6px",
              }}>
                {section.title}
              </div>

              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "9px 10px", borderRadius: 10, textDecoration: "none",
                    color: "var(--color-text)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 15, lineHeight: "18px", width: 18, textAlign: "center", flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                    {item.hint && (
                      <span style={{ display: "block", fontSize: 11, color: "var(--color-text-3)", marginTop: 1 }}>
                        {item.hint}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}