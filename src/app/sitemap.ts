import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://event-wave.ru",
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}