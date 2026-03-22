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
    <nav style={{ 
      position: "fixed", 
      bottom: 0, 
      left: 0, 
      right: 0, 
      display: "flex", 
      background: "rgba(255, 255, 255, 0.95)", // Полупрозрачный фон
      backdropFilter: "blur(10px)", // Красивое размытие, как в iOS
      borderTop: "1px solid #e8e6df", 
      paddingBottom: "env(safe-area-inset-bottom)", // Учет "челки" на iPhone
      height: 56, // 🔥 Сделали компактнее
      zIndex: 1000,
      boxShadow: "0 -2px 10px rgba(0,0,0,0.03)"
    }}>
      {navItems.map(item => {
        const isActive = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textDecoration: "none", color: isActive ? "#4a7aff" : "#a8a49c", gap: 2 }}>
            <div style={{ fontSize: 20, filter: isActive ? "none" : "grayscale(100%) opacity(0.5)", transition: "all 0.2s" }}>
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