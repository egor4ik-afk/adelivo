// src/app/about/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

const SITE_URL = "https://event-wave.ru";

export const metadata: Metadata = {
  title: "Event Wave — Система диспетчеризации курьеров для любого бизнеса",
  description:
    "Профессиональная система управления курьерами и заказами. До 1000 заказов в день, интеграция с любой CRM через Webhook, PWA для курьеров на iOS и Android, Push-уведомления без SMS.",
  keywords: [
    "система диспетчеризации курьеров",
    "управление курьерами онлайн",
    "программа для диспетчера доставки",
    "маршрутизация курьеров",
    "crm для курьерской службы",
    "логистика доставки программа",
    "приложение для курьера pwa",
    "диспетчеризация заказов",
    "retailcrm интеграция доставка",
    "стать курьером",
  ],
  alternates: { canonical: "/about" },
  openGraph: {
    title: "Event Wave — Диспетчеризация курьеров. До 1000 заказов/день",
    description:
      "Система управления курьерами для любого доставочного бизнеса. Умные маршруты, контроль в реальном времени, PWA-приложение для курьеров.",
    url: `${SITE_URL}/about`,
    siteName: "Event Wave",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Event Wave — Система диспетчеризации" }],
    locale: "ru_RU",
    type: "website",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Event Wave",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      url: SITE_URL,
      description: "Профессиональная система диспетчеризации и управления курьерами. До 1000 заказов в день.",
      featureList: [
        "Управление заказами и курьерами в реальном времени",
        "Умная маршрутизация с геокодингом",
        "Интеграция с любой CRM через Webhook",
        "PWA-приложение для курьеров (iOS и Android)",
        "Push-уведомления без SMS",
        "Встроенный чат диспетчер–курьер",
      ],
      offers: { "@type": "Offer", priceCurrency: "RUB" },
      provider: { "@type": "Organization", name: "Event Wave", url: SITE_URL },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Для какого бизнеса подходит Event Wave?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Event Wave подходит для любого бизнеса с курьерской доставкой: цветочные магазины, продукты питания, аптеки, экспресс-доставка, интернет-магазины.",
          },
        },
        {
          "@type": "Question",
          name: "Как стать курьером в Event Wave?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Нажмите стать курьером. Привяжите профиль СЗ из консоль. После регистрации вы получите ссылку на вход — код придёт на email, пароль не нужен. Приложение устанавливается на любой смартфон за 30 секунд.",
          },
        },
        {
          "@type": "Question",
          name: "Сколько заказов в день может обработать система?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Event Wave протестирован на реальных нагрузках до 1000 заказов в день. Система масштабируется горизонтально.",
          },
        },
      ],
    },
  ],
};

// ─── Palette ────────────────────────────────────────────────
const C = {
  bg:      "#080C14",
  surface: "#0D1420",
  card:    "#0F1825",
  border:  "rgba(56,189,248,0.12)",
  accent:  "#38BDF8",
  green:   "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  text:    "#E2EBF8",
  muted:   "#64748B",
  sub:     "#94A3B8",
};

// ─── Shared CSS ──────────────────────────────────────────────
const css = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}

  /* base — override globals only inside landing */
  .ew{background:${C.bg};color:${C.text};font-family:'Golos Text',sans-serif;min-height:100vh}
  .ew a{color:inherit;text-decoration:none}

  /* layout */
  .ew .wrap{max-width:1160px;margin:0 auto;padding:0 1.5rem}
  .ew .sec{padding:5rem 0}
  .ew .sec-alt{padding:5rem 0;background:${C.surface}}
  .ew .divider{height:1px;background:linear-gradient(90deg,transparent,${C.border},transparent)}

  /* grids */
  .ew .g2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start}
  .ew .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
  .ew .g2r{display:grid;grid-template-columns:1fr 1.1fr;gap:3.5rem;align-items:center}

  /* header */
  .ew-hdr{position:sticky;top:0;z-index:100;background:rgba(8,12,20,0.9);backdrop-filter:blur(16px);border-bottom:1px solid ${C.border}}
  .ew-hdr .inner{height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .ew-logo{display:flex;align-items:center;gap:10px;text-decoration:none;flex-shrink:0}
  .ew-logo-txt{font-weight:800;font-size:1.1rem;color:${C.text};letter-spacing:0.05em}
  .ew-logo-txt span{color:${C.accent}}
  .ew-nav{display:flex;gap:1.6rem;list-style:none}
  .ew-nav a{color:${C.muted};font-size:0.83rem;font-weight:500;transition:color 0.2s}
  .ew-nav a:hover{color:${C.text}}
  .ew-hbtns{display:flex;gap:0.6rem;flex-shrink:0}

  /* buttons */
  .btn-pri{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.9rem;letter-spacing:0.03em;background:${C.accent};color:#080C14;transition:all 0.2s;white-space:nowrap}
  .btn-pri:hover{box-shadow:0 0 28px rgba(56,189,248,0.35);transform:translateY(-1px)}
  .btn-ghost{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.9rem;letter-spacing:0.03em;background:transparent;color:${C.accent};border:1px solid rgba(56,189,248,0.32);white-space:nowrap;transition:all 0.2s}
  .btn-ghost:hover{background:rgba(56,189,248,0.07)}
  .btn-hdr-ghost{display:inline-flex;align-items:center;padding:0.52rem 1.1rem;border-radius:8px;font-size:0.82rem;font-weight:600;color:${C.accent};border:1px solid rgba(56,189,248,0.28)}
  .btn-hdr-pri{display:inline-flex;align-items:center;padding:0.52rem 1.2rem;border-radius:8px;font-size:0.82rem;font-weight:700;background:${C.accent};color:#080C14}
  .btn-big{display:block;text-align:center;width:100%;padding:1.1rem 2rem;border-radius:12px;font-weight:800;font-size:0.98rem;letter-spacing:0.04em;background:${C.green};color:#fff}

  /* stats */
  .stat-row{display:flex;gap:1rem;flex-wrap:wrap}
  .stat-box{flex:1 1 130px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.18);border-radius:14px;padding:1.3rem 1.5rem;text-align:center}
  .stat-val{font-family:'Bebas Neue',sans-serif;font-size:clamp(1.8rem,3.5vw,2.8rem);color:${C.accent};line-height:1;letter-spacing:0.04em}
  .stat-lbl{font-size:0.8rem;font-weight:700;color:${C.text};margin-top:0.25rem}
  .stat-sub{font-size:0.68rem;color:${C.muted};margin-top:0.1rem}

  /* mockup table */
  .ew-tbl{background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden}
  .ew-tbl-bar{padding:0.7rem 1rem;border-bottom:1px solid rgba(56,189,248,0.08);display:flex;align-items:center;gap:0.4rem}
  .dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
  .ew-tr{display:flex;align-items:center;gap:0.6rem;padding:0.65rem 1rem;font-size:0.78rem;border-bottom:1px solid rgba(56,189,248,0.05);color:${C.text}}
  .ew-tr:last-child{border-bottom:none}
  .ew-tr:hover{background:rgba(56,189,248,0.03)}
  .tid{color:${C.muted};font-family:monospace;width:50px;flex-shrink:0;font-size:0.74rem}
  .taddr{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ttime{color:${C.accent};font-size:0.7rem;width:42px;flex-shrink:0;text-align:right}
  .tbadge{padding:2px 8px;border-radius:4px;font-size:0.62rem;font-weight:700;letter-spacing:0.04em;flex-shrink:0;width:64px;text-align:center}
  .b-new{background:rgba(56,189,248,0.14);color:#38BDF8}
  .b-go{background:rgba(16,185,129,0.14);color:#10B981}
  .b-done{background:rgba(100,116,139,0.14);color:#94A3B8}
  .b-err{background:rgba(239,68,68,0.12);color:#EF4444}
  .tcour{width:46px;font-size:0.7rem;color:${C.muted};text-align:right;flex-shrink:0}

  /* feature pill list */
  .fpill{display:flex;align-items:flex-start;gap:0.8rem;padding:0.75rem 0;border-bottom:1px solid rgba(56,189,248,0.07)}
  .fpill:last-child{border-bottom:none}
  .fpill-icon{font-size:1.15rem;flex-shrink:0;margin-top:1px}
  .fpill-t{font-weight:700;font-size:0.86rem;color:${C.text};margin-bottom:0.15rem}
  .fpill-d{font-size:0.78rem;color:${C.muted};line-height:1.62}

  /* phone */
  .phone{width:210px;margin:0 auto;background:#FAFAF8;border:6px solid #1A1A18;border-radius:32px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.55)}
  .phone-notch{height:20px;background:#1A1A18;border-bottom-left-radius:14px;border-bottom-right-radius:14px;width:90px;margin:0 auto}
  .phone-body{padding:0.8rem;background:#F5F4F0;min-height:340px}
  .pcard{background:#fff;border-radius:12px;padding:0.75rem;margin-bottom:0.5rem;border:1px solid #E8E6DF}
  .pstatus{font-size:0.58rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.25rem}
  .paddr{font-size:0.75rem;font-weight:700;color:#1A1A18;line-height:1.3;margin-bottom:0.3rem}
  .pmeta{font-size:0.62rem;color:#A8A49C}
  .pbtn{background:#4A7AFF;color:#fff;border-radius:8px;padding:0.5rem;text-align:center;font-size:0.7rem;font-weight:700;margin-top:0.5rem}

  /* cards */
  .feat-card{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:1.35rem 1.5rem;display:flex;gap:1rem;align-items:flex-start}
  .feat-icon{font-size:1.35rem;flex-shrink:0;line-height:1}
  .feat-t{font-weight:700;font-size:0.88rem;color:${C.text};margin-bottom:0.25rem}
  .feat-d{font-size:0.79rem;color:${C.muted};line-height:1.65}

  /* case card */
  .case-card{background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:1.8rem;display:flex;flex-direction:column;gap:1rem}
  .case-metrics{display:flex;gap:0.7rem;flex-wrap:wrap}
  .case-m{background:rgba(56,189,248,0.08);border-radius:10px;padding:0.5rem 1rem;text-align:center}
  .case-mv{font-family:'Bebas Neue',sans-serif;font-size:1.5rem;color:${C.accent};line-height:1}
  .case-ml{font-size:0.64rem;color:${C.muted};text-transform:uppercase;letter-spacing:0.07em;margin-top:0.1rem}
  .case-t{font-weight:700;font-size:0.95rem;color:${C.text}}
  .case-d{font-size:0.81rem;color:${C.sub};line-height:1.72}

  /* step */
  .step{display:flex;gap:1rem;align-items:flex-start;padding:1.1rem 1.4rem;background:${C.card};border:1px solid ${C.border};border-radius:14px}
  .step-n{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:rgba(56,189,248,0.1);color:${C.accent};font-weight:800;font-size:0.78rem;display:flex;align-items:center;justify-content:center}
  .step-t{font-weight:700;font-size:0.87rem;color:${C.text};margin-bottom:0.2rem}
  .step-d{font-size:0.79rem;color:${C.muted};line-height:1.65}

  /* faq */
  .faq-item{border-bottom:1px solid ${C.border};padding-bottom:1.15rem;margin-bottom:1.15rem}
  .faq-q{font-weight:700;font-size:0.92rem;color:${C.text};margin-bottom:0.45rem}
  .faq-a{font-size:0.83rem;color:${C.muted};line-height:1.75}

  /* int pill */
  .ipill{display:flex;align-items:center;gap:0.6rem;padding:0.6rem 1.2rem;background:${C.card};border:1px solid ${C.border};border-radius:8px;font-size:0.82rem;font-weight:600;color:${C.text}}
  .ipill .note{color:${C.muted};font-size:0.74rem;font-weight:400}

  /* section headings */
  .label{font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:${C.accent};margin-bottom:0.6rem;font-weight:700}
  .h2{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,4.5vw,3.8rem);letter-spacing:0.04em;line-height:1.05;color:${C.text};margin-bottom:1rem}
  .desc{color:${C.muted};font-size:0.95rem;line-height:1.8;max-width:580px}

  /* hero img */
  .hero-img-wrap{border-radius:16px;overflow:hidden;border:1px solid rgba(56,189,248,0.15);box-shadow:0 32px 80px rgba(0,0,0,0.6)}

  /* courier CTA box */
  .courier-cta{background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.22);border-radius:16px;padding:1.5rem}
  .courier-cta-t{font-weight:700;font-size:0.95rem;color:${C.text};margin-bottom:0.4rem}
  .courier-cta-d{font-size:0.82rem;color:${C.muted};margin-bottom:1rem;line-height:1.65}

  /* responsive */
  @media(max-width:900px){
    .ew .g2,.ew .g3,.ew .g2r{grid-template-columns:1fr}
    .ew-nav{display:none}
    .phone{width:180px}
    .ew .sec,.ew .sec-alt{padding:3.5rem 0}
  }
  @media(max-width:500px){
    .stat-row{flex-direction:column}
    .btn-hdr-ghost{display:none}
    .ew .g2r{gap:2rem}
  }
`;

// ─── Tiny server-only sub-components ────────────────────────

function Label({ t }: { t: string }) {
  return <p className="label">{t}</p>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="h2">{children}</h2>;
}
function Desc({ children }: { children: React.ReactNode }) {
  return <p className="desc">{children}</p>;
}

// ─── Page ───────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Golos+Text:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="ew">

        {/* ── HEADER ── */}
        <header className="ew-hdr">
          <div className="wrap">
            <div className="inner">
              <Link href="/about" className="ew-logo" aria-label="Event Wave">
                <Image src="/web-app-manifest-192x192.png" alt="Event Wave" width={32} height={32} style={{ borderRadius: 8 }} />
                <span className="ew-logo-txt">Event<span>Wave</span></span>
              </Link>

              <nav aria-label="Навигация по странице">
                <ul className="ew-nav">
                  <li><a href="#features">Возможности</a></li>
                  <li><a href="#courier-app">Курьерам</a></li>
                  <li><a href="#cases">Кейсы</a></li>
                  <li><a href="#integrations">Интеграции</a></li>
                  <li><a href="#faq">FAQ</a></li>
                </ul>
              </nav>

              <div className="ew-hbtns">
                <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" className="btn-hdr-ghost">Telegram</a>
                <Link href="/login" className="btn-hdr-pri">Войти →</Link>
              </div>
            </div>
          </div>
        </header>

        <main>

          {/* ── HERO ── */}
          <section className="sec" style={{ position: "relative", overflow: "hidden" }}>
            <div style={{
              position: "absolute", width: 800, height: 500, borderRadius: "50%",
              background: "radial-gradient(ellipse,rgba(56,189,248,0.07) 0%,transparent 70%)",
              top: -180, left: "50%", transform: "translateX(-50%)", pointerEvents: "none",
            }} />
            <div className="wrap" style={{ position: "relative" }}>
              <div className="g2r" style={{ gap: "4rem" }}>

                {/* text */}
                <div>
                  <Label t="Система диспетчеризации и логистики" />
                  <h1 style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: "clamp(3.5rem,7vw,6.5rem)",
                    letterSpacing: "0.06em", lineHeight: 0.95,
                    color: C.text, marginBottom: "1.5rem",
                  }}>
                    EVENT<br /><span style={{ color: C.accent }}>WAVE</span>
                  </h1>
                  <p style={{ color: C.sub, fontSize: "clamp(0.9rem,1.5vw,1.05rem)", lineHeight: 1.8, marginBottom: "2rem", maxWidth: 460 }}>
                    Единая платформа для управления курьерами и заказами —
                    для <strong style={{ color: C.text }}>любого доставочного бизнеса</strong>.
                    Умные маршруты, контроль в реальном времени, интеграция с любой CRM.
                  </p>
                  <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginBottom: "3rem" }}>
                    <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" className="btn-pri">Попробовать бесплатно →</a>
                    <a href="#cases" className="btn-ghost">Смотреть кейсы</a>
                  </div>
                  <div className="stat-row">
                    {[
                      { v: "1 000", l: "Заказов/день", s: "реальная нагрузка" },
                      { v: "< 1с", l: "Синх. с CRM", s: "Webhook" },
                      { v: "PWA", l: "Приложение", s: "iOS + Android" },
                    ].map((s) => (
                      <div key={s.l} className="stat-box">
                        <p className="stat-val">{s.v}</p>
                        <p className="stat-lbl">{s.l}</p>
                        <p className="stat-sub">{s.s}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* og-image */}
                <div className="hero-img-wrap">
                  <Image
                    src="/og-image.jpg"
                    alt="Event Wave — интерфейс системы диспетчеризации курьеров"
                    width={1200} height={630}
                    style={{ width: "100%", height: "auto", display: "block" }}
                    priority
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Для кого ── */}
          <div className="divider" />
          <section className="sec-alt">
            <div className="wrap">
              <Label t="Аудитория" />
              <H2>Для любого бизнеса с доставкой</H2>
              <Desc>Event Wave не привязан к нише. Если у вас есть курьеры и заказы — система подойдёт.</Desc>
              <div className="g3" style={{ marginTop: "2.5rem" }}>
                {[
                  { i: "🌸", t: "Цветочные магазины", d: "Праздничные пики, срочная доставка, несколько временных слотов в день." },
                  { i: "🍕", t: "Еда и рестораны", d: "Горячая доставка с жёсткими дедлайнами, быстрая смена статусов." },
                  { i: "💊", t: "Аптеки и фармацевтика", d: "Срочные заказы, маршруты по районам, контроль каждой точки." },
                  { i: "📦", t: "Интернет-магазины", d: "Сотни адресов в день, зонирование, автоматический маршрутный лист." },
                  { i: "🚚", t: "Курьерские службы", d: "Мультиклиентский режим, расчёт выплат, нагрузка на курьера." },
                  { i: "🏪", t: "Розничные сети", d: "Доставка из магазина, click & collect, контроль последней мили." },
                ].map((f) => (
                  <div key={f.t} className="feat-card">
                    <span className="feat-icon">{f.i}</span>
                    <div>
                      <p className="feat-t">{f.t}</p>
                      <p className="feat-d">{f.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Возможности ── */}
          <div className="divider" />
          <section id="features" className="sec">
            <div className="wrap">
              <div className="g2r">
                {/* таблица-макет */}
                <div>
                  <div className="ew-tbl">
                    <div className="ew-tbl-bar">
                      <div className="dot" style={{ background: "#EF4444" }} />
                      <div className="dot" style={{ background: "#F59E0B" }} />
                      <div className="dot" style={{ background: "#10B981" }} />
                      <span style={{ fontSize: "0.68rem", color: C.muted, marginLeft: "0.5rem" }}>Дашборд — 18 заказов сегодня</span>
                    </div>
                    {[
                      { id: "#8821", a: "ул. Ленина, 42 кв. 7",      t: "09:00", cls: "b-new",  l: "Новый",    c: "Антон" },
                      { id: "#8819", a: "пр. Мира, 15",              t: "10:30", cls: "b-go",   l: "В пути",   c: "Дима"  },
                      { id: "#8815", a: "Садовая, 3 — адрес?",       t: "11:00", cls: "b-err",  l: "Адрес?",   c: "—"     },
                      { id: "#8809", a: "б-р Строителей, 8/2",       t: "11:30", cls: "b-done", l: "Доставлен",c: "Антон" },
                      { id: "#8802", a: "Советская ул., 101",        t: "12:00", cls: "b-new",  l: "Новый",    c: "—"     },
                      { id: "#8797", a: "пл. Победы, 3 кв. 42",      t: "13:00", cls: "b-go",   l: "В пути",   c: "Марина"},
                    ].map((r) => (
                      <div key={r.id} className="ew-tr">
                        <span className="tid">{r.id}</span>
                        <span className="taddr">{r.a}</span>
                        <span className="ttime">{r.t}</span>
                        <span className={`tbadge ${r.cls}`}>{r.l}</span>
                        <span className="tcour">{r.c}</span>
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: "0.72rem", color: C.muted, textAlign: "center", marginTop: "0.8rem" }}>
                    Живой дашборд — данные обновляются без перезагрузки
                  </p>
                </div>

                {/* features list */}
                <div>
                  <Label t="Платформа" />
                  <H2>Всё что нужно<br />диспетчеру</H2>
                  <Desc>Создан под реальные задачи: праздничные пики, сотни адресов, курьеры без гаджетов.</Desc>
                  <div style={{ marginTop: "1.8rem" }}>
                    {[
                      { i: "📊", t: "Дашборд диспетчера", d: "Все заказы дня в одной таблице. Сортировка по времени, статусу, курьеру — один клик." },
                      { i: "🗺️", t: "Карта с геокодингом", d: "Автоматические координаты через Яндекс. Проблемные адреса — AI-исправление." },
                      { i: "🚗", t: "Умные маршруты", d: "Группировка по курьерам и слотам. Ссылка на Яндекс.Навигатор — автоматически." },
                      { i: "🔔", t: "Push без SMS", d: "Курьеры получают уведомления о маршруте и изменениях заказа мгновенно." },
                      { i: "💬", t: "Встроенный чат", d: "Общий чат и личные сообщения между диспетчером и курьером." },
                      { i: "🔄", t: "Синхронизация с CRM", d: "Двусторонний Webhook. Статусы, курьеры, комментарии — за доли секунды." },
                    ].map((f) => (
                      <div key={f.t} className="fpill">
                        <span className="fpill-icon">{f.i}</span>
                        <div>
                          <p className="fpill-t">{f.t}</p>
                          <p className="fpill-d">{f.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Курьерам ── */}
          <div className="divider" />
          <section id="courier-app" className="sec-alt">
            <div className="wrap">
              <div className="g2r">
                <div>
                  <Label t="Для курьеров" />
                  <H2>Приложение прямо<br />в кармане</H2>
                  <Desc>PWA устанавливается на iPhone и Android за 30 секунд — без App Store. Вход по коду из email.</Desc>

                  <div style={{ marginTop: "1.8rem" }}>
                    {[
                      { i: "📋", t: "Только свои заказы",         d: "Маршруты этого курьера, отсортированные по слотам." },
                      { i: "🧭", t: "Яндекс.Навигатор в тап",     d: "Маршрут строится автоматически, без ручного ввода адреса." },
                      { i: "✅", t: "Смена статуса заказа",        d: "«В пути» → «Доставлен» прямо из карточки заказа." },
                      { i: "🔔", t: "Push-уведомления",           d: "Изменение адреса, времени, комментария — сразу на экран." },
                      { i: "📅", t: "График смен",                 d: "Курьер отмечает рабочие дни — диспетчер видит доступность." },
                      { i: "🔐", t: "Вход без пароля",             d: "Одноразовый код на email. Ничего помнить не нужно." },
                    ].map((f) => (
                      <div key={f.t} className="fpill">
                        <span className="fpill-icon">{f.i}</span>
                        <div>
                          <p className="fpill-t">{f.t}</p>
                          <p className="fpill-d">{f.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* BIG CTA */}
                  <div className="courier-cta" style={{ marginTop: "2rem" }}>
                    <p className="courier-cta-t">Хотите работать курьером?</p>
                    <p className="courier-cta-d">
                      Напишите нам — расскажем об условиях и зарегистрируем в системе.
                      Приложение установите сами за 30 секунд.
                    </p>
                    <a href="/login" target="_blank" rel="noopener noreferrer" className="btn-big">
                      🚀 Стать курьером — зарегистрироваться
                    </a>
                  </div>
                </div>

                {/* Phone */}
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "1rem" }}>
                  <div className="phone">
                    <div className="phone-notch" />
                    <div className="phone-body">
                      <div style={{
                        fontSize: "0.68rem", fontWeight: 800, color: "#1A1A18",
                        display: "flex", justifyContent: "space-between",
                        marginBottom: "0.6rem", paddingBottom: "0.5rem", borderBottom: "1px solid #E8E6DF",
                      }}>
                        <span>Мои маршруты</span>
                        <span style={{ color: "#A8A49C", fontWeight: 400 }}>3 заказа</span>
                      </div>
                      {[
                        { s: "🚀 В пути",    a: "ул. Ленина, 42 кв. 7",  m: "#8821 · 09:00–12:00", c: "#4A7AFF" },
                        { s: "⏳ Назначен",  a: "пр. Мира, 15",           m: "#8819 · 12:00–15:00", c: "#F59E0B" },
                        { s: "⏳ Назначен",  a: "б-р Строителей, 8",      m: "#8809 · 15:00–18:00", c: "#F59E0B" },
                      ].map((c) => (
                        <div key={c.m} className="pcard">
                          <p className="pstatus" style={{ color: c.c }}>{c.s}</p>
                          <p className="paddr">{c.a}</p>
                          <p className="pmeta">{c.m}</p>
                        </div>
                      ))}
                      <div className="pbtn">📍 Открыть в Навигаторе</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Кейсы ── */}
          <div className="divider" />
          <section id="cases" className="sec">
            <div className="wrap">
              <Label t="Реальные кейсы" />
              <H2>Работает на практике</H2>
              <Desc>Не демо и не тест — реальные бизнесы, реальная нагрузка.</Desc>
              <div className="g3" style={{ marginTop: "2.5rem" }}>
                {[
                  {
                    emoji: "🌸", title: "Цветочный ритейл, Москва",
                    metrics: [{ v: "800+", l: "заказов/день" }, { v: "100", l: "курьеров" }, { v: "8 марта", l: "пик нагрузки" }],
                    desc: "В праздничный пик — более 800 заказов за день. Диспетчер видел статус каждого курьера в реальном времени. Время сборки маршрута: с 40 минут до 5.",
                  },
                  {
                    emoji: "🚀", title: "Экспресс-доставка, ритейл",
                    metrics: [{ v: "1 000", l: "заказов/день" }, { v: "< 3с", l: "обновление CRM" }, { v: "0 SMS", l: "уведомлений" }],
                    desc: "Двусторонняя синхронизация с RetailCRM через Webhook. Все Push-уведомления заменили SMS. Операторы и диспетчеры работают параллельно без конфликтов.",
                  },
                  {
                    emoji: "📦", title: "Онбординг курьеров",
                    metrics: [{ v: "5 мин", l: "онбординг" }, { v: "30 сек", l: "установка PWA" }, { v: "0", l: "паролей" }],
                    desc: "Новый курьер начинает работать через 5 минут: ссылка → код из email → PWA установлено. Без App Store, без паролей, без звонков от диспетчера.",
                  },
                ].map((c) => (
                  <div key={c.title} className="case-card">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                      <span style={{ fontSize: "1.6rem" }}>{c.emoji}</span>
                      <strong className="case-t">{c.title}</strong>
                    </div>
                    <div className="case-metrics">
                      {c.metrics.map((m) => (
                        <div key={m.l} className="case-m">
                          <p className="case-mv">{m.v}</p>
                          <p className="case-ml">{m.l}</p>
                        </div>
                      ))}
                    </div>
                    <p className="case-d">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Как работает ── */}
          <div className="divider" />
          <section className="sec-alt">
            <div className="wrap">
              <Label t="Процесс" />
              <H2>Как это работает</H2>
              <Desc>От нового заказа до уведомления курьера — весь процесс автоматизирован.</Desc>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem", maxWidth: 720, marginTop: "2.5rem" }}>
                {[
                  { n: "01", t: "Заказ создаётся в CRM",        d: "RetailCRM или любая другая система присылает Webhook в Event Wave в момент создания или изменения заказа." },
                  { n: "02", t: "Автоматическое геокодирование", d: "Система определяет координаты через Яндекс API. Проблемные адреса подсвечиваются — AI исправляет за один клик." },
                  { n: "03", t: "Диспетчер собирает маршруты",  d: "Назначение курьеров и группировка заказов по маршрутам в удобном интерфейсе." },
                  { n: "04", t: "Курьер получает Push",          d: "При назначении маршрута курьер мгновенно получает Push-уведомление в PWA — без SMS." },
                  { n: "05", t: "Курьер едет с навигатором",    d: "В карточке заказа — кнопка «Открыть в Яндекс.Навигаторе» с готовым маршрутом от базы до адреса." },
                  { n: "06", t: "Статус обновляется везде",     d: "Курьер меняет статус в приложении — данные синхронизируются обратно в CRM автоматически." },
                ].map((s) => (
                  <div key={s.n} className="step">
                    <div className="step-n">{s.n}</div>
                    <div>
                      <p className="step-t">{s.t}</p>
                      <p className="step-d">{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Интеграции ── */}
          <div className="divider" />
          <section id="integrations" className="sec">
            <div className="wrap">
              <Label t="Интеграции" />
              <H2>Работает с вашими инструментами</H2>
              <Desc>Открытый Webhook API — подключите любую CRM или учётную систему.</Desc>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "2.5rem" }}>
                {[
                  { i: "🔄", n: "RetailCRM",           note: "Webhook двусторонний" },
                  { i: "🗺️", n: "Яндекс Карты",        note: "Геокодинг + навигация" },
                  { i: "📲", n: "Web Push API",         note: "Push без SMS" },
                  { i: "📱", n: "PWA",                  note: "iOS + Android" },
                  { i: "🌐", n: "Webhook API",          note: "Любая CRM" },
                  { i: "📧", n: "Email-уведомления",    note: "SMTP" },
                ].map((p) => (
                  <div key={p.n} className="ipill">
                    <span style={{ fontSize: "1.1rem" }}>{p.i}</span>
                    <span>{p.n}</span>
                    <span className="note">— {p.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <div className="divider" />
          <section id="faq" className="sec-alt">
            <div className="wrap">
              <div className="g2" style={{ gap: "4rem" }}>
                <div>
                  <Label t="Вопросы и ответы" />
                  <H2>FAQ</H2>
                  <Desc>Отвечаем на самые частые вопросы.</Desc>
                </div>
                <div>
                  {[
                    { q: "Для какого бизнеса подходит Event Wave?", a: "Для любого бизнеса с курьерской доставкой: цветочные магазины, еда, аптеки, интернет-магазины, курьерские службы. Если есть курьеры и заказы — система подойдёт." },
                    { q: "Как стать курьером?", a: "Просто зарегистрируйтесь или напишите нам в Telegram. После регистрации придёт ссылка и код на email — пароль не нужен. Приложение устанавливается на любой смартфон за 30 секунд." },
                    { q: "Сколько заказов в день?", a: "Протестировано на реальных нагрузках до 1 000 заказов в день. Система масштабируется горизонтально." },
                    { q: "Работает ли с RetailCRM?", a: "Да. Двусторонняя синхронизация через Webhook — статусы, курьеры, комментарии обновляются в обе стороны за доли секунды." },
                    { q: "Нужно ли скачивать приложение?", a: "Нет. Курьер открывает сайт в браузере → нажимает «Установить» или «На экран Домой» на iPhone. 30 секунд, без App Store." },
                    { q: "Можно ли подключить другую CRM?", a: "Да. Event Wave принимает Webhook в JSON или form-urlencoded от любой системы. Поможем с настройкой." },
                    { q: "Сколько времени занимает внедрение?", a: "Базовая настройка с RetailCRM — 1–3 дня. Курьер начинает работать через 5 минут после регистрации." },
                  ].map((f) => (
                    <div key={f.q} className="faq-item">
                      <p className="faq-q">{f.q}</p>
                      <p className="faq-a">{f.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── CTA ── */}
          <section className="sec">
            <div className="wrap">
              <div style={{
                maxWidth: 720, margin: "0 auto",
                background: C.card, border: "1px solid rgba(56,189,248,0.2)",
                borderRadius: 24, padding: "4rem 2.5rem",
                textAlign: "center", position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", width: 500, height: 400,
                  borderRadius: "50%",
                  background: "radial-gradient(ellipse,rgba(56,189,248,0.06) 0%,transparent 70%)",
                  top: -150, left: "50%", transform: "translateX(-50%)", pointerEvents: "none",
                }} />
                <Label t="Старт" />
                <h2 style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "clamp(2rem,5vw,3.5rem)",
                  letterSpacing: "0.05em", color: C.text, marginBottom: "1rem",
                }}>
                  Готовы попробовать?
                </h2>
                <p style={{ color: C.muted, fontSize: "0.92rem", lineHeight: 1.75, maxWidth: 460, margin: "0 auto 2rem" }}>
                  Свяжитесь с нами в Telegram — расскажем о возможностях
                  и поможем с настройкой интеграции под ваш бизнес.
                </p>
                <div style={{ display: "flex", gap: "0.8rem", justifyContent: "center", flexWrap: "wrap" }}>
                  <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" className="btn-pri">Написать в Telegram →</a>
                  <Link href="/login" className="btn-ghost">Войти в систему</Link>
                </div>
              </div>
            </div>
          </section>

        </main>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: "2rem 1.5rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 2 }}>
            <strong style={{ color: C.sub }}>Event Wave</strong> — система диспетчеризации и управления курьерами
            {" · "}
            <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>Telegram</a>
            {" · "}
            <Link href="/login" style={{ color: C.muted }}>Войти</Link>
            {" · "}
            © {new Date().getFullYear()} Event Wave
          </p>
          <p style={{ fontSize: "0.75rem", color: C.muted, lineHeight: 2, marginTop: "1rem" }}>
            Сделано и размещено на <a href="https://relaxdev.ru" target="_blank" rel="noopener noreferrer" style={{ color: C.accent }}>relaxdev.ru</a>
          </p>
        </footer>

      </div>
    </>
  );
}
