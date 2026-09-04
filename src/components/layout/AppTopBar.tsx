// src/components/layout/AppTopBar.tsx
// Единая шапка авторизованных разделов: логотип, навигация, профиль.
//
// Прежде она пряталась на /manager и /dashboard, потому что у тех экранов
// была своя шапка со своим набором ссылок. Из-за этого меню отличалось от
// раздела к разделу. Теперь шапка одна и показывается везде, кроме входа
// и курьерских экранов (там своя нижняя навигация).
//
// Дашборд — исключение по месту, а не по составу: там карта на весь экран,
// поэтому он рисует у себя компактный AppMenu с тем же списком разделов.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProfilePanel } from "@/components/ProfilePanel";
import { AppMenu } from "./AppMenu";
import { navFor, isActiveNav } from "./navItems";

type Me = {
  id: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  isSuperAdmin?: boolean;
};

/** Экраны курьера: там своя нижняя навигация, верхняя шапка мешает. */
const COURIER_AREA = "/courier";

/** Дашборд рисует навигацию сам — иначе поверх карты было бы две шапки. */
const OWN_HEADER = ["/dashboard"];

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

  const hidden =
    !me ||
    pathname === "/login" ||
    pathname.startsWith(COURIER_AREA) ||
    OWN_HEADER.includes(pathname);

  if (hidden) return null;

  const items = navFor(me.role, me.isSuperAdmin);
  // В горизонтальной строке — только основные пункты; остальные живут
  // в бургере, который на узком экране заменяет её целиком
  const primary = items.filter((n) => !n.secondary);

  const initials =
    [me.firstName?.[0], me.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <header className="bg-[var(--color-card)] border-b border-[var(--color-border)] px-3 sm:px-6 py-3 flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* На мобиле навигация целиком уезжает в бургер: горизонтальный
            список из шести пунктов на 360px превращался в неудобную
            горизонтальную прокрутку, где половина ссылок была за краем */}
        <div className="md:hidden">
          <AppMenu role={me.role} isSuperAdmin={me.isSuperAdmin} compact />
        </div>

        <Link
          href={me.role === "COURIER" ? "/courier/routes" : "/dashboard"}
          className="font-extrabold text-[15px] tracking-tight text-[var(--color-text)] shrink-0"
        >
          ADelivo
        </Link>

        <nav className="hidden md:flex gap-1">
          {primary.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold whitespace-nowrap transition-colors ${
                isActiveNav(n, pathname, items)
                  ? "bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "text-[var(--color-text-2)] hover:text-[var(--color-text)]"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {/* Второстепенные пункты на широком экране — тоже в бургере */}
        <div className="hidden md:block">
          <AppMenu role={me.role} isSuperAdmin={me.isSuperAdmin} compact />
        </div>
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