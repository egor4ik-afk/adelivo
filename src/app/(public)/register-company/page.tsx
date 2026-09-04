// src/app/(public)/register-company/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  SITE_URL, SeoShell, Label, H2, Desc, Steps, CheckList, Prose,
  FaqSection, Related, breadcrumbJsonLd, faqJsonLd, type Faq, type Crumb,
} from "@/components/seo/ui";
import { CompanyRegisterForm } from "@/components/company/CompanyRegisterForm";
import { HeroVideo } from "@/components/landing/HeroVideo";
import { getSession } from "@/lib/auth";

const PATH = "/register-company";

export const metadata: Metadata = {
  title: "Регистрация компании — попробовать ADelivo бесплатно",
  description:
    "Заведите компанию за пару минут: подключите свой магазин к RetailCRM, Битрикс24 или 1С, пригласите сотрудников по ссылке и начните собирать маршруты. Подключение бесплатно.",
  keywords: [
    "попробовать систему доставки бесплатно",
    "регистрация в системе управления курьерами",
    "подключить crm к доставке",
    "автоматизация доставки регистрация",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "Регистрация компании — ADelivo",
    description: "Свой магазин, свои сотрудники, своя диспетчерская. Подключение бесплатно.",
    url: `${SITE_URL}${PATH}`,
    siteName: "ADelivo",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Регистрация компании в ADelivo" }],
    locale: "ru_RU",
    type: "website",
  },
};

const crumbs: Crumb[] = [{ name: "Регистрация компании", href: PATH }];

const faq: Faq[] = [
  {
    q: "Сколько это стоит?",
    a: "Регистрация, подключение магазина и настройка — бесплатно. Оплата начинается только с фактических заказов, прошедших через платформу, по выбранному тарифу.",
  },
  {
    q: "Нужна ли карта при регистрации?",
    a: "Нет. Карта не запрашивается ни на регистрации, ни при подключении магазина — платёжных данных мы на этом этапе не собираем вообще.",
  },
  {
    q: "Что если у нас нет CRM?",
    a: "Тогда выберите тип подключения «Свой вебхук» или заводите заказы вручную через кабинет менеджера. CRM можно подключить позже, ничего не переделывая.",
  },
  {
    q: "Как добавить сотрудников?",
    a: "После регистрации в разделе «Компания» появится ссылка-приглашение вида adelivo.ru/join/ваш-адрес. Все, кто войдёт по ней, попадут в вашу компанию. Роль по умолчанию — курьер, поменять можно в управлении доступом.",
  },
  {
    q: "Видят ли другие компании наши заказы?",
    a: "Нет. Заказы привязаны к магазину, магазин — к компании. Доступ сотрудников к магазинам настраивается матрицей в админке.",
  },
];

export default async function Page() {
  // Уже вошедшего пользователя незачем гонять по регистрации
  const user = await getSession();
  if (user) redirect("/company");

  return (
    <SeoShell jsonLd={[breadcrumbJsonLd(crumbs), faqJsonLd(faq)]}>
      <section className="sec hero">
        <div className="hero-glow" />
        <div className="wrap hero-inner">
          <div className="g2r" style={{ marginTop: "1.5rem", alignItems: "flex-start" }}>
            <div>
              <Label t="Бесплатный доступ" />
              <h1 className="h1">Попробуйте<br /><span>на своих заказах</span></h1>
              <p className="lead">
                Заведите компанию, подключите магазин к своей системе и пригласите
                сотрудников по ссылке. Ни карты, ни договора на этом этапе не нужно.
              </p>
              <CheckList
                items={[
                  "Регистрация по коду с почты, без пароля",
                  "RetailCRM, Битрикс24, 1С или свой вебхук",
                  "Ссылка-приглашение для курьеров и менеджеров",
                  "Заказы можно заводить вручную, пока CRM не подключена",
                ]}
              />
            </div>
            <CompanyRegisterForm />
          </div>
        </div>
      </section>

      {/* Оба ролика здесь, на целевой странице пробного периода.
          На лендинге они были разбросаны по середине страницы, а на
          /company стояли под авторизацией — рекламировать продукт тому,
          кто им уже пользуется, смысла нет. */}
      <div className="divider" />
      <section className="sec">
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <Label t="Как это выглядит" />
            <H2>Две стороны системы за 20 секунд</H2>
          </div>

          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <div>
              <HeroVideo
                src="https://cdn.relaxdev.ru/admin/2.mp4"
                poster="/og-image.jpg"
                caption="Кабинет компании и оператора"
              />
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-3)", marginTop: "0.7rem", lineHeight: 1.6 }}>
                Подключение магазина, распределение заказов по курьерам, карта и зоны.
              </p>
            </div>
            <div>
              <HeroVideo
                src="https://cdn.relaxdev.ru/admin/1.mp4"
                poster="/og-image.jpg"
                caption="Менеджер и курьер в работе"
              />
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-3)", marginTop: "0.7rem", lineHeight: 1.6 }}>
                Сборка маршрута, приложение курьера, статусы и фото доставки.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />
      <section className="sec-alt">
        <div className="wrap">
          <Label t="Что дальше" />
          <H2>Четыре шага после регистрации</H2>
          <Desc>
            Всё делается в кабинете, разработчик со стороны компании не нужен —
            кроме случая, когда система самописная и заказы приходят вебхуком.
          </Desc>
          <Steps
            items={[
              { t: "Создайте магазин", d: "В разделе «Компания» → «+ Магазин». Магазин — это точка, от лица которой приходят заказы. Их может быть несколько." },
              { t: "Подключите свою систему", d: "Выберите RetailCRM, Битрикс24 или 1С, вставьте ключ и нажмите «Проверить подключение» — покажем, сколько заказов видим." },
              { t: "Пригласите команду", d: "Скопируйте ссылку-приглашение и отправьте курьерам и менеджерам. Роли назначаются в управлении доступом." },
              { t: "Соберите первый маршрут", d: "Заказы появятся в диспетчерском экране, AI разложит их по курьерам, курьеры получат push." },
            ]}
          />
          <Prose>
            <p>
              Если что-то не сходится — напишите в{" "}
              <a href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer">Telegram</a>,
              поможем с подключением и настройкой зон.
            </p>
          </Prose>
        </div>
      </section>

      <FaqSection items={faq} title="О регистрации" />
      <Related
        items={[
          { href: "/sistema-upravleniya-kurerami", t: "Как устроена платформа", d: "Путь от заказа до выплаты." },
          { href: "/integracii", t: "Интеграции", d: "RetailCRM, Битрикс24, 1С, карты, выплаты." },
          { href: "/keysy/bunch", t: "Кейс «Банч»", d: "700 заказов в день на этой же системе." },
        ]}
      />
    </SeoShell>
  );
}