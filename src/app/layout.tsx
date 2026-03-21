import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/lib/cron"
// 🔥 Правильно инициализируем шрифт (добавил кириллицу для русского языка)
const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const viewport: Viewport = {
  themeColor: "#4a7aff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "EwentWave", // Поменял на EwentWave (или верни EwentWave, если нужно)
  description: "Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EwentWave",
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      {/* 🔥 Применяем класс шрифта к body */}
      <body className={inter.className}>{children}</body>
    </html>
  );
}