import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/lib/cron";
import { GlobalChatWrapper } from "@/components/GlobalChatWrapper";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const viewport: Viewport = {
  themeColor: "#E86A1A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const SITE_URL = "https://event-wave.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: "Event Wave — Логистика и диспетчеризация курьеров",
    template: "%s | Event Wave",
  },

  description:
    "Event Wave — система логистики и диспетчеризации курьеров. Контроль заказов, маршрутов и доставки в реальном времени.",


  applicationName: "Event Wave",
  authors: [{ name: "Event Wave" }],
  creator: "Event Wave",
  publisher: "Event Wave",

  alternates: {
    canonical: "/",
  },

  openGraph: {
    title: "Event Wave — Логистика в реальном времени",
    description:
      "Контролируйте курьеров, маршруты и заказы в одной системе. Полная диспетчеризация доставки.",
    url: SITE_URL,
    siteName: "Event Wave",
    images: [
      {
        url: "/og-image.jpg", // ← твоя картинка
        width: 1200,
        height: 630,
        alt: "Event Wave — система логистики",
      },
    ],
    locale: "ru_RU",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "Event Wave — Логистика и диспетчеризация",
    description:
      "Система управления курьерами и доставкой в реальном времени.",
    images: ["/og-image.jpg"],
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },

  manifest: "/manifest.json",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Event Wave",
  },

  formatDetection: {
    telephone: false,
  },

  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        {children}
        <GlobalChatWrapper />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Event Wave",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: "https://event-wave.ru",
              description:
                "Система логистики и диспетчеризации курьеров в реальном времени",
              provider: {
                "@type": "Organization",
                name: "Event Wave",
              },
            }),
          }}
        />
      </body>
    </html>
  );
}
