// src/app/sitemap.ts
import type { MetadataRoute } from "next";

const SITE_URL = "https://adelive.ru";

type Entry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
};

// Только публичные страницы. Приватные разделы (/dashboard, /manager,
// /courier/*, /couriers, /login, /api/*) в sitemap не попадают —
// они закрыты в robots.ts.
const pages: Entry[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },      // лендинг
  { path: "/about", priority: 0.6, changeFrequency: "monthly" }, // о компании

  // Пилларные посадочные
  { path: "/sistema-upravleniya-kurerami", priority: 0.9, changeFrequency: "weekly" },
  { path: "/ai-marshrutizaciya", priority: 0.9, changeFrequency: "weekly" },
  { path: "/pochemu-my", priority: 0.8, changeFrequency: "monthly" },

  // Возможности
  { path: "/vozmozhnosti", priority: 0.8, changeFrequency: "monthly" },
  { path: "/vozmozhnosti/zakazy", priority: 0.8, changeFrequency: "monthly" },
  { path: "/vozmozhnosti/kurery", priority: 0.8, changeFrequency: "monthly" },
  { path: "/vozmozhnosti/interfeysy", priority: 0.8, changeFrequency: "monthly" },

  // Интеграции
  { path: "/integracii", priority: 0.9, changeFrequency: "weekly" },
  { path: "/integracii/bitrix24", priority: 0.8, changeFrequency: "monthly" },
  { path: "/integracii/retailcrm", priority: 0.8, changeFrequency: "monthly" },
  { path: "/integracii/telegram", priority: 0.7, changeFrequency: "monthly" },
  { path: "/integracii/konsol-pro", priority: 0.7, changeFrequency: "monthly" },
  { path: "/integracii/yandex-karty", priority: 0.7, changeFrequency: "monthly" },

  // Кейсы
  { path: "/keysy", priority: 0.8, changeFrequency: "monthly" },
  { path: "/keysy/bunch", priority: 0.8, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return pages.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "/" : p.path}`,
    lastModified,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
