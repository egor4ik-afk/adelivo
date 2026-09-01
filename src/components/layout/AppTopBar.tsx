// src/components/layout/AppTopBar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfilePanel } from "@/components/ProfilePanel";

type Me = {
  id: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
};

/**
 * Разделы, где панель профиля уже встроена в собственную шапку.
 * Проверено по коду: ProfilePanel есть в manager/page.tsx и DashboardClient.
 * Остальные экраны — /couriers, /courier/*, /company, /admin, формы заказа —
 * своей панели не имели, попасть в профиль оттуда было нельзя.
 */
const OWN_HEADER = ["/manager", "/dashboard"];

/** Экраны курьера: там своя нижняя навигация, верхняя шапка мешает. */
const COURIER_AREA = "/courier";

const NAV = [
  { href: "/dashboard", label: "Дашборд", roles: ["ADMIN", "OPERATOR"] },
  { href: "/manager", label: "Менеджер", roles: ["ADMIN", "OPERATOR"] },
  { href: "/couriers", label: "Курьеры", roles: ["ADMIN", "OPERATOR"] },
  { href: "/courier/routes", label: "Мои маршруты", roles: ["COURIER"] },
  { href: "/company", label: "Компания", roles: ["ADMIN"] },
  { href: "/admin", label: "Пользователи", roles: ["ADMIN"] },
];

export function AppTopBar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  // На страницах с собственной шапкой и на экранах входа не показываем
  const hidden =
    !me ||
    pathname === "/login" ||
    pathname.startsWith(COURIER_AREA) ||
    // Форма заказа лежит внутри /manager, но своей шапки с профилем не имеет —
    // поэтому исключаем только сам /manager, а не всё поддерево
    pathname === "/manager" ||
    OWN_HEADER.includes(pathname);

  if (hidden) return null;

  const initials =
    [me.firstName?.[0], me.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <header className="bg-[var(--color-card)] border-b border-[var(--color-border)] px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <Link href={me.role === "COURIER" ? "/courier/routes" : "/dashboard"} className="font-extrabold text-[15px] tracking-tight text-[var(--color-text)] shrink-0">
          ADelivo
        </Link>
        <nav className="flex gap-1 overflow-x-auto hide-scrollbar">
          {NAV.filter((n) => n.roles.includes(me.role)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-colors ${
                pathname.startsWith(n.href)
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text)]"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="relative shrink-0">
        <button
          onClick={() => setOpen(!open)}
          title="Профиль"
          aria-label="Профиль"
          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border)] text-[12px] font-bold text-[var(--color-text-2)] hover:border-[var(--color-accent)] transition-colors"
        >
          {me.avatarUrl ? (
            // обычный img, а не next/image: аватар приходит из внешнего хранилища
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-12 z-50">
            <ProfilePanel onClose={() => setOpen(false)} />
          </div>
        )}
      </div>
    </header>
  );
}
