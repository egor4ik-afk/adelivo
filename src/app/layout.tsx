import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script"; // 🔥 Импорт скрипта для Метрики
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

  // 🔥 Расширил описание для лучшего сниппета в поисковиках
  description:
    "Продвинутая система логистики и диспетчеризации курьеров Event Wave. Умная маршрутизация, контроль заказов и доставки в реальном времени. Интеграция с любой CRM.",

  // 🔥 Добавил ключевые слова для поисковиков
  keywords: [
    "логистика",
    "диспетчеризация",
    "управление курьерами",
    "маршрутизация",
    "программа для логистов",
    "crm для доставки",
    "доставка",
    "маршрутный лист",
    "Event Wave",
  ],

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

        {/* 🟢 ЯНДЕКС МЕТРИКА (Оптимизировано для Next.js) 🟢 */}
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108276874', 'ym');

            ym(108276874, 'init', {
              ssr:true, 
              webvisor:true, 
              clickmap:true, 
              ecommerce:"dataLayer", 
              referrer: document.referrer, 
              url: location.href, 
              accurateTrackBounce:true, 
              trackLinks:true
            });
          `}
        </Script>
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/108276874" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
        {/* 🔴 КОНЕЦ ЯНДЕКС МЕТРИКИ 🔴 */}

        {/* 🟢 Микроразметка Schema.org для SEO 🟢 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Event Wave",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, iOS, Android", // Подчеркиваем PWA-сущность
              url: SITE_URL,
              description:
                "Система логистики и диспетчеризации курьеров в реальном времени",
              provider: {
                "@type": "Organization",
                name: "Event Wave",
                url: SITE_URL
              },
              offers: {
                "@type": "Offer",
                price: "0", // Заглушка, чтобы Google Search Console не ругался на отсутствие цены в SoftwareApplication
                priceCurrency: "RUB"
              }
            }),
          }}
        />
      </body>
    </html>
  );
}