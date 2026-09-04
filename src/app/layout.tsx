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
  themeColor: "#38BDF8",
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
    template: "%s | ADelivo",
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
        // Формат здесь принципиален: JPEG, не WebP.
        //
        // Первая версия бага: в og:image был указан .jpg, которого в public/
        // не было — Telegram получал 404 и рисовал карточку без картинки.
        // VK ошибку не замечал, потому что при недоступном og:image сам
        // сканирует страницу и берёт первую подходящую картинку из вёрстки.
        //
        // Вторая версия: файл заменили на WebP. Формат легче, но превью
        // ссылок в Telegram его разбирает не во всех клиентах — карточка
        // снова оставалась пустой. og-image.webp можно держать для сайта,
        // а в разметку превью отдавать jpg.
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

  manifest: "/manifest.json",

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
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico" },
    ],
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
              offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
            }),
          }}
        />
      </body>
    </html>
  );
}