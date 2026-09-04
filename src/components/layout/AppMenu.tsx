// src/components/layout/AppMenu.tsx
// Компактное меню-бургер. Состав пунктов берётся из общего navItems,
// чтобы в бургере и в горизонтальной шапке было одно и то же.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navFor, isActiveNav } from "./navItems";

export function AppMenu({
  isAdmin,
  role,
  isSuperAdmin,
  compact,
}: {
  /** Оставлен для обратной совместимости со старым вызовом из дашборда. */
  isAdmin?: boolean;
  role?: string;
  isSuperAdmin?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

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

  const effectiveRole = role ?? (isAdmin ? "ADMIN" : "OPERATOR");
  const items = navFor(effectiveRole, isSuperAdmin);

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
            // На узком экране панель фиксированной ширины вылезала за край:
            // ограничиваем по вьюпорту с отступом
            width: "min(268px, calc(100vw - 24px))",
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            boxShadow: "var(--color-card-shadow, 0 12px 40px rgba(0,0,0,0.35))",
            padding: 8,
            maxHeight: "calc(100vh - 90px)",
            overflowY: "auto",
          }}
        >
          {items.map((item) => {
            const active = isActiveNav(item, pathname, items);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "9px 10px", borderRadius: 10, textDecoration: "none",
                  color: "var(--color-text)",
                  background: active ? "var(--color-surface)" : "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = active ? "var(--color-surface)" : "transparent")}
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
            );
          })}
        </div>
      )}
    </div>
  );
}