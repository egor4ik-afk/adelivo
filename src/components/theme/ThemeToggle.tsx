// src/components/theme/ThemeToggle.tsx
"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

export function ThemeToggle({ className = "btn-hdr-icon" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  // Тему уже проставил ThemeScript — просто читаем её с <html>
  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-ew-theme") as Theme) || "dark";
    setTheme(current);
    setReady(true);

    // Если пользователь не делал выбор — следуем за системой
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystemChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem("ew-theme")) return; // выбор пользователя важнее
      } catch { /* localStorage может быть недоступен */ }
      const next: Theme = e.matches ? "light" : "dark";
      document.documentElement.setAttribute("data-ew-theme", next);
      setTheme(next);
    };
    mq.addEventListener("change", onSystemChange);
    return () => mq.removeEventListener("change", onSystemChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-ew-theme", next);
    setTheme(next);
    try { localStorage.setItem("ew-theme", next); } catch { /* приватный режим */ }

    // цвет системной панели браузера под тему
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#FFFFFF" : "#080C14");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
      // до гидратации показываем нейтральную иконку, чтобы не мигало
      suppressHydrationWarning
    >
      {ready && theme === "light" ? (
        // луна — предложить тёмную
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // солнце — предложить светлую
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  );
}
