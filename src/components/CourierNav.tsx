// src/components/CourierNav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function CourierNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/courier/points", icon: "📍", label: "Карта" },
    { href: "/courier/routes", icon: "📋", label: "Маршруты" },
    { href: "/courier/profile", icon: "👤", label: "Профиль" },
  ];

  return (
    <nav style={{ display: "flex", background: "#fff", borderTop: "1px solid #e8e6df", paddingBottom: "env(safe-area-inset-bottom)", flexShrink: 0, zIndex: 100 }}>
      {navItems.map(item => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ flex: 1, padding: "10px 0", textAlign: "center", textDecoration: "none", color: isActive ? "#4a7aff" : "#a8a49c", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 22, filter: isActive ? "none" : "grayscale(100%) opacity(0.5)", transition: "all 0.2s" }}>
              {item.icon}
            </div>
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, transition: "all 0.2s" }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}