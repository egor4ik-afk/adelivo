// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "@/lib/cron";
import { GlobalChatWrapper } from "@/components/GlobalChatWrapper";
import OfflineIndicator from "@/components/OfflineIndicator";
import ScrollToTop from "@/components/ScrollToTop";
import { ThemeScript } from "@/components/theme/ThemeScript";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const SITE_URL = "https://adelivo.ru";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "./" },

  title: {
    default: "ADelivo — Система диспетчеризации и управления курьерами",
    // Раньше здесь было "%s | ADelivo". Заголовки страниц уже содержат
    // бренд, и в выдаче получалось «Система диспетчеризации … | ADelivo»
    // с дублем и обрезанием хвоста: Google показывает около 60 символов,
    // а лишние 10 съедала повторная приписка.
    template: "%s",
  },

  description:
    "ADelivo — профессиональная система диспетчеризации и логистики для любого курьерного бизнеса. Умная маршрутизация, контроль заказов в реальном времени, PWA для курьеров, интеграция с любой CRM через Webhook. До 1000 заказов в день.",
  

  verification: {
    google: "googlecee020f869c68a59",
    yandex: "34ef7d504acdd967",
  },

  applicationName: "ADelivo",
  authors: [{ name: "ADelivo", url: SITE_URL }],
  creator: "ADelivo",
  publisher: "ADelivo",


  openGraph: {
    title: "ADelivo — Диспетчеризация и управление курьерами",
    description:
      "Контролируйте курьеров, маршруты и заказы в одной системе. Интеграция с любой CRM, PWA для курьеров, Push-уведомления. До 1000 заказов в день.",
    url: SITE_URL,
    siteName: "ADelivo",
    images: [
      {
        // Стандартный размер превью: 1200×630, соотношение 1.91:1.
        //
        url: "/og-image.webp",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "ADelivo — Система диспетчеризации и логистики",
      },
    ],
    locale: "ru_RU",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: "ADelivo — Диспетчеризация курьеров",
    description:
      "Система управления курьерами и доставкой в реальном времени. Интеграция с любой CRM.",
    images: ["/og-image.webp"],
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

  // site.webmanifest, а не manifest.json. Оба файла лежат в public/ и оба
  // прописаны в precache-листе public/sw.js — удалять ни один нельзя:
  // отсутствующий файл роняет precacheAndRoute целиком, service worker не
  // ставится, и вместе с ним отваливаются иконки и офлайн-режим.
  manifest: "/site.webmanifest",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ADelivo",
  },

  formatDetection: {
    telephone: false,
  },

  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      // sizes: "any" у .ico обязателен, иначе браузер считает его иконкой
      // неизвестного размера и в части случаев предпочитает ему ничего
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    // Строкой Next отдаёт apple-touch-icon без sizes и type. iOS такой
    // тег берёт, но масштабирует наугад; с явными 180×180 берёт как есть.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        {/* Ставит data-ew-theme на <html> до первxxой отрисовки — и в публичной части,
            и в кабинетах. Без этого светлая тема мигает тёмной при загрузке. */}
        <ThemeScript />
      </head>
      <body className={inter.className}>
        <ScrollToTop />
        <OfflineIndicator />

        {children}

        <GlobalChatWrapper />

        {/* Яндекс Метрика */}
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=112000735', 'ym');
            ym(112000735, 'init', {
              ssr:true, webvisor:true, clickmap:true,
              ecommerce:"dataLayer", referrer: document.referrer,
              url: location.href, accurateTrackBounce:true, trackLinks:true
            });
          `}
        </Script>
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/112000735" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>

        {/* Schema.org */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "ADelivo",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, iOS, Android",
              url: SITE_URL,
              description: "Профессиональная система диспетчеризации и управления курьерами. До 1000 заказов в день, интеграция с любой CRM.",
              provider: { "@type": "Organization", name: "ADelivo", url: SITE_URL },
              // Бесплатного тарифа нет — есть бесплатная пробная неделя.
              // price: "0" без пояснения Google трактует как «продукт
              // бесплатен», и в выдаче появлялась некорректная плашка.
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "RUB",
                description: "Пробный период 7 дней без оплаты и без банковской карты. Далее — оплата за фактические заказы, от 10 ₽ за заказ.",
                url: `${SITE_URL}/register-company`,
                availability: "https://schema.org/InStock",
              },
              inLanguage: "ru-RU",
              // Прямая ссылка на целевое действие: поисковики и AI-ассистенты
              // используют её как «где попробовать»
              potentialAction: {
                "@type": "RegisterAction",
                name: "Попробовать 7 дней бесплатно",
                target: `${SITE_URL}/register-company`,
              },
            }),
          }}
        />
      </body>
    </html>
  );
}