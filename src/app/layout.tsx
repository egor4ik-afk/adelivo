import type { Metadata } from "next";
import "./globals.css";

if (typeof window === "undefined") {
  import("@/lib/cron").catch(console.error);
}

export const metadata: Metadata = {
  title: "FlowerOps — Управление доставкой",
  description: "Платформа оператора цветочной доставки",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}