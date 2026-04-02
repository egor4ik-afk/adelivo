// src/app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://event-wave.ru/about",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}