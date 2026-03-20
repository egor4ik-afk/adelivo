import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google"; // или твой шрифт
import "./globals.css";

// Добавляем Viewport для правильного масштабирования и цвета статус-бара на телефонах
export const viewport: Viewport = {
  themeColor: "#4a7aff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// Добавляем ссылку на manifest и поддержку Apple (iOS)
export const metadata: Metadata = {
  title: "FlowerOps",
  description: "FlowerOps Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlowerOps",
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
      <body>{children}</body>
    </html>
  );
}