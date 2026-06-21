import type { NextConfig } from "next";
// @ts-ignore
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    importScripts: ["/push-sw.js"], // 🔥 Вот эта строчка объединит PWA и Пуши
  },
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "event-wave-offline-cache",
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60,
        },
        networkTimeoutSeconds: 7,
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