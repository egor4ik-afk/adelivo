import type { NextConfig } from "next";
// @ts-ignore - игнорируем отсутствие типов у next-pwa
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Не кэшируем при локальной разработке
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst", // Сначала пытаемся загрузить из сети, если нет - из кэша
      options: {
        cacheName: "event-wave-offline-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // Храним кэш 24 часа
        },
        networkTimeoutSeconds: 7, // Ждем сеть 7 секунд, потом показываем кэш
      },
    },
  ],
});

const nextConfig: NextConfig = {
  experimental: { 
    workerThreads: false, 
    cpus: 2 
  },
};

export default withPWA(nextConfig);