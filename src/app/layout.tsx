import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/lib/cron";
import { GlobalChatWrapper } from "@/components/GlobalChatWrapper";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const viewport: Viewport = {
  themeColor: "#4a7aff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "EventWave",
  description: "Dashboard",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "EventWave" },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        {children}
        <GlobalChatWrapper />
      </body>
    </html>
  );
}