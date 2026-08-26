// src/app/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LandingPage } from "@/components/landing/LandingPage";

const SITE_URL = "https://adelive.ru";

// Метаданные переехали сюда из старого src/app/about/page.tsx.
// Отличие одно: canonical теперь "/" — главная стала канонической страницей сайта.
export const metadata: Metadata = {
  title: "ADelive — Система диспетчеризации курьеров для любого бизнеса",
  description:
    "Профессиональная система управления курьерами и заказами. До 1000 заказов в день, интеграция с любой CRM через Webhook, PWA для курьеров на iOS и Android, Push-уведомления без SMS.",
  keywords: [
    "система диспетчеризации курьеров",
    "управление курьерами онлайн",
    "программа для диспетчера доставки",
    "маршрутизация курьеров",
    "crm для курьерской службы",
    "логистика доставки программа",
    "приложение для курьера pwa",
    "диспетчеризация заказов",
    "retailcrm интеграция доставка",
    "стать курьером",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "ADelive — Диспетчеризация курьеров. До 1000 заказов/день",
    description:
      "Система управления курьерами для любого доставочного бизнеса. Умные маршруты, контроль в реальном времени, PWA-приложение для курьеров.",
    url: SITE_URL,
    siteName: "ADelive",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "ADelive — Система диспетчеризации" }],
    locale: "ru_RU",
    type: "website",
  },
};

export default async function RootPage() {
  const user = await getSession();

  // Курьер — в своё приложение
  if (user?.role === "COURIER") redirect("/courier/routes");

  // Оператор — в панель менеджера, админ — в дашборд
  if (user?.role === "OPERATOR") redirect("/manager");
  if (user) redirect("/dashboard");

  // Гость видит лендинг ПРЯМО НА "/" — без редиректа на /about.
  return <LandingPage />;
}
