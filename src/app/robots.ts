// src/app/robots.ts
import type { MetadataRoute } from "next";

const SITE_URL = "https://event-wave.ru";

// Приватные разделы: рабочие интерфейсы и API.
// Их индексация бесполезна (за логином) и тратит краулинговый бюджет.
const DISALLOW = [
  "/api/",
  "/login",
  "/dashboard",
  "/manager",
  "/couriers",
  "/courier/",
  "/profile",
  "/_next/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      // Явное разрешение для AI-ботов: llms.txt и посадочные страницы
      // должны быть доступны для цитирования в AI-поиске (GEO).
      { userAgent: "GPTBot", allow: "/", disallow: DISALLOW },
      { userAgent: "OAI-SearchBot", allow: "/", disallow: DISALLOW },
      { userAgent: "PerplexityBot", allow: "/", disallow: DISALLOW },
      { userAgent: "ClaudeBot", allow: "/", disallow: DISALLOW },
      { userAgent: "YandexBot", allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
