// src/components/theme/AppThemeRow.tsx
"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
type Mode = Theme | "system";

/**
 * Строка переключателя темы для панели профиля в кабинетах.
 * Три положения: системная / светлая / тёмная.
 * «Системная» ничего не пишет в localStorage — тема следует за настройкой ОС.
 */
export function AppThemeRow({ rowStyle }: { rowStyle?: React.CSSProperties }) {
  const [mode, setMode] = useState<Mode>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("ew-theme"); } catch { /* приватный режим */ }
    setMode(saved === "light" || saved === "dark" ? saved : "system");
    setReady(true);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      let s: string | null = null;
      try { s = localStorage.getItem("ew-theme"); } catch { /* ignore */ }
      if (s) return; // ручной выбор важнее системы
      apply(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const apply = (t: Theme) => {
    document.documentElement.setAttribute("data-ew-theme", t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0B111C" : "#f5f4f0");
  };

  const choose = (m: Mode) => {
    setMode(m);
    if (m === "system") {
      try { localStorage.removeItem("ew-theme"); } catch { /* ignore */ }
      apply(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      try { localStorage.setItem("ew-theme", m); } catch { /* ignore */ }
      apply(m);
    }
  };

  const label: Record<Mode, string> = { system: "Как в системе", light: "Светлая", dark: "Тёмная" };

  const btn = (m: Mode): React.CSSProperties => ({
    padding: "5px 9px",
    borderRadius: 7,
    border: `1px solid ${mode === m ? "var(--color-accent)" : "var(--color-border)"}`,
    background: mode === m ? "var(--color-accent-soft)" : "transparent",
    color: mode === m ? "var(--color-accent)" : "var(--color-text-3)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1.2,
  });

  return (
    <div style={rowStyle}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text)" }}>Тема оформления</div>
        <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 2 }}>
          {ready ? label[mode] : "…"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <button type="button" style={btn("system")} onClick={() => choose("system")} title="Как в системе">Авто</button>
        <button type="button" style={btn("light")} onClick={() => choose("light")} title="Светлая тема" aria-label="Светлая тема">☀</button>
        <button type="button" style={btn("dark")} onClick={() => choose("dark")} title="Тёмная тема" aria-label="Тёмная тема">☾</button>
      </div>
    </div>
  );
}
