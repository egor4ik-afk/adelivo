// src/app/about/page.tsx
import Image from "next/image";
import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";

const SITE_URL = "https://adelivo.ru";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
  "@type": "SoftwareApplication",
  name: "ADelivo",
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
      provider: { "@type": "Organization", name: "ADelivo", url: SITE_URL },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Для какого бизнеса подходит ADelivo?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "ADelivo подходит для любого бизнеса с курьерской доставкой: цветочные магазины, продукты питания, аптеки, экспресс-доставка, интернет-магазины.",
          },
        },
        {
          "@type": "Question",
          name: "Как стать курьером в ADelivo?",
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
            text: "ADelivo протестирован на реальных нагрузках до 1000 заказов в день. Система масштабируется горизонтально.",
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
  purple:  "#A78BFA",
  text:    "#E2EBF8",
  muted:   "#64748B",
  sub:     "#94A3B8",
};

const css = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  .ew{background:${C.bg};color:${C.text};font-family:'Golos Text',sans-serif;min-height:100vh}
  .ew a{color:inherit;text-decoration:none}
  .ew .wrap{max-width:1160px;margin:0 auto;padding:0 1.5rem}
  .ew .sec{padding:5rem 0}
  .ew .sec-alt{padding:5rem 0;background:${C.surface}}
  .ew .divider{height:1px;background:linear-gradient(90deg,transparent,${C.border},transparent)}
  .ew .g2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start}
  .ew .g3{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
  .ew .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}
  .ew .g2r{display:grid;grid-template-columns:1fr 1.1fr;gap:3.5rem;align-items:center}

  /* buttons */
  .btn-pri{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.9rem;letter-spacing:0.03em;background:${C.accent};color:#080C14;transition:opacity 0.2s;white-space:nowrap}
  .btn-pri:hover{opacity:0.88}
  .btn-ghost{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:600;font-size:0.9rem;border:1px solid ${C.border};color:${C.text};transition:border-color 0.2s;white-space:nowrap}
  .btn-ghost:hover{border-color:${C.accent}}
  .btn-big{display:inline-flex;align-items:center;justify-content:center;gap:0.6rem;width:100%;padding:0.9rem 1.5rem;border-radius:12px;font-weight:700;font-size:0.88rem;background:${C.green};color:#fff;transition:opacity 0.2s}
  .btn-big:hover{opacity:0.88}

  /* stats */
  .stat-row{display:flex;gap:2rem;flex-wrap:wrap}
  .stat-v{font-family:'Bebas Neue',sans-serif;font-size:2rem;color:${C.accent};letter-spacing:0.05em;line-height:1}
  .stat-l{font-size:0.72rem;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em;margin-top:0.15rem}
  .stat-s{font-size:0.65rem;color:${C.muted};opacity:0.6}

  /* feat pills */
  .fpill{display:flex;align-items:flex-start;gap:0.8rem;padding:1rem;background:${C.card};border:1px solid ${C.border};border-radius:12px;margin-bottom:0.6rem;transition:border-color 0.2s}
  .fpill:hover{border-color:rgba(56,189,248,0.3)}
  .fpill-icon{width:32px;height:32px;border-radius:8px;background:rgba(56,189,248,0.1);display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0}
  .fpill-t{font-weight:700;font-size:0.88rem;color:${C.text};margin-bottom:0.2rem}
  .fpill-d{font-size:0.78rem;color:${C.muted};line-height:1.6}

  /* feature card */
  .feat-card{background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:1.4rem;display:flex;flex-direction:column;gap:0.7rem;transition:border-color 0.2s}
  .feat-card:hover{border-color:rgba(56,189,248,0.25)}
  .feat-icon{font-size:1.6rem}
  .feat-t{font-weight:700;font-size:0.9rem;color:${C.text};margin-bottom:0.25rem}
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

  /* accounting block */
  .acc-card{background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:1.5rem;position:relative;overflow:hidden}
  .acc-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,${C.accent},${C.green})}
  .acc-badge{display:inline-flex;align-items:center;gap:0.4rem;padding:0.25rem 0.7rem;border-radius:20px;font-size:0.72rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:0.8rem}
  .acc-title{font-weight:800;font-size:1rem;color:${C.text};margin-bottom:0.5rem}
  .acc-desc{font-size:0.8rem;color:${C.muted};line-height:1.7}
  .acc-list{list-style:none;margin-top:0.8rem;display:flex;flex-direction:column;gap:0.35rem}
  .acc-list li{font-size:0.79rem;color:${C.sub};display:flex;align-items:flex-start;gap:0.5rem}
  .acc-list li::before{content:'✓';color:${C.green};font-weight:700;flex-shrink:0}

  /* pricing */
  .price-card{background:${C.card};border:1px solid ${C.border};border-radius:20px;padding:2rem 1.5rem;display:flex;flex-direction:column;gap:1rem;position:relative;overflow:hidden;transition:border-color 0.2s,transform 0.2s}
  .price-card:hover{border-color:rgba(56,189,248,0.3);transform:translateY(-2px)}
  .price-card.featured{border-color:rgba(56,189,248,0.4);background:linear-gradient(135deg,${C.card},rgba(56,189,248,0.04))}
  .price-card.featured::before{content:'Популярный';position:absolute;top:12px;right:12px;background:${C.accent};color:#080C14;font-size:0.65rem;font-weight:800;padding:0.2rem 0.6rem;border-radius:20px;letter-spacing:0.08em;text-transform:uppercase}
  .price-name{font-weight:800;font-size:0.85rem;color:${C.muted};text-transform:uppercase;letter-spacing:0.1em}
  .price-amount{font-family:'Bebas Neue',sans-serif;font-size:3rem;color:${C.text};line-height:1;letter-spacing:0.02em}
  .price-unit{font-size:0.78rem;color:${C.muted};margin-top:0.2rem}
  .price-desc{font-size:0.82rem;color:${C.sub};line-height:1.65}
  .price-features{list-style:none;display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem}
  .price-features li{font-size:0.8rem;color:${C.sub};display:flex;align-items:flex-start;gap:0.5rem}
  .price-features li .check{color:${C.green};font-weight:700;flex-shrink:0}
  .price-features li .x{color:${C.muted};opacity:0.5;flex-shrink:0}

  /* form */
  .form-wrap{background:${C.card};border:1px solid ${C.border};border-radius:24px;padding:2.5rem;max-width:680px;margin:0 auto}
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
  .form-group{display:flex;flex-direction:column;gap:0.4rem}
  .form-group.full{grid-column:1/-1}
  .form-label{font-size:0.75rem;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:0.08em}
  .form-input{background:rgba(255,255,255,0.04);border:1px solid ${C.border};border-radius:10px;padding:0.7rem 1rem;color:${C.text};font-size:0.88rem;font-family:inherit;outline:none;transition:border-color 0.2s;width:100%}
  .form-input:focus{border-color:${C.accent}}
  .form-input::placeholder{color:${C.muted};opacity:0.6}
  .form-select{background:rgba(255,255,255,0.04);border:1px solid ${C.border};border-radius:10px;padding:0.7rem 1rem;color:${C.text};font-size:0.88rem;font-family:inherit;outline:none;transition:border-color 0.2s;width:100%;cursor:pointer;appearance:none}
  .form-select:focus{border-color:${C.accent}}
  .form-select option{background:#0D1420;color:${C.text}}
  .cb-group{display:flex;flex-direction:column;gap:0.6rem;margin-top:0.2rem}
  .cb-item{display:flex;align-items:flex-start;gap:0.7rem;padding:0.8rem 1rem;background:rgba(255,255,255,0.02);border:1px solid ${C.border};border-radius:10px;cursor:pointer;transition:border-color 0.2s}
  .cb-item:hover{border-color:rgba(56,189,248,0.3)}
  .cb-item input[type=radio]{accent-color:${C.accent};margin-top:0.15rem;flex-shrink:0}
  .cb-item-label{font-size:0.83rem;color:${C.text};font-weight:600;margin-bottom:0.15rem}
  .cb-item-desc{font-size:0.75rem;color:${C.muted}}
  .form-btn{width:100%;padding:0.9rem;border-radius:12px;border:none;background:linear-gradient(135deg,${C.accent},#0EA5E9);color:#080C14;font-weight:800;font-size:0.95rem;cursor:pointer;font-family:inherit;transition:opacity 0.2s;display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-top:1rem}
  .form-btn:hover{opacity:0.88}
  .form-note{font-size:0.72rem;color:${C.muted};text-align:center;margin-top:0.8rem;line-height:1.6}

  /* phone mockup */
  .phone{width:210px;border-radius:32px;background:#0A1628;border:2px solid rgba(56,189,248,0.2);box-shadow:0 32px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(56,189,248,0.06);padding:0.7rem;position:relative}
  .phone-notch{width:80px;height:22px;background:#080C14;border-radius:12px;margin:0 auto 0.7rem;display:flex;align-items:center;justify-content:center}
  .phone-body{background:#fff;border-radius:22px;padding:1rem;min-height:380px;max-width:580px}

  /* ew-tbl mockup */
  .ew-tbl{background:#0A1628;border-radius:12px;padding:1rem;border:1px solid rgba(56,189,248,0.1);font-size:0.72rem}
  .ew-tbl-bar{display:flex;align-items:center;gap:6px;margin-bottom:0.8rem;padding-bottom:0.6rem;border-bottom:1px solid rgba(56,189,248,0.08)}
  .dot{width:10px;height:10px;border-radius:50%}
  .ew-tbl-row{display:grid;grid-template-columns:80px 1fr 70px 60px;gap:0.4rem;padding:0.4rem 0.5rem;border-radius:6px;align-items:center}
  .ew-tbl-row:hover{background:rgba(56,189,248,0.04)}
  .b-new{background:rgba(56,189,248,0.12);color:${C.accent};padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.66rem}
  .b-go{background:rgba(16,185,129,0.12);color:#10B981;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.66rem}
  .b-done{background:rgba(100,116,139,0.15);color:${C.muted};padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.66rem}
  .b-err{background:rgba(239,68,68,0.12);color:#EF4444;padding:2px 6px;border-radius:4px;font-weight:700;font-size:0.66rem}

  @media(max-width:900px){
    .ew .g2,.ew .g3,.ew .g4,.ew .g2r{grid-template-columns:1fr}
    .phone{width:180px}
    .ew .sec,.ew .sec-alt{padding:3.5rem 0}
    .form-grid{grid-template-columns:1fr}
  }
  @media(max-width:500px){
    .stat-row{flex-direction:column}
    .ew .g2r{gap:2rem}
  }

`;

function Label({ t }: { t: string }) {
  return <p className="label">{t}</p>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="h2">{children}</h2>;
}
function Desc({ children }: { children: React.ReactNode }) {
  return <p className="desc">{children}</p>;
}

export function LandingPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Golos+Text:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="ew">
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
                <div>
                  <Label t="Платформа диспетчеризации и логистики" />
                  <h1 style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: "clamp(3.5rem,7vw,6.5rem)",
                    letterSpacing: "0.06em", lineHeight: 0.95,
                    color: C.text, marginBottom: "1.5rem",
                  }}>
                    Agent<br /><span style={{ color: C.accent }}>Delivo</span>
                  </h1>
                  <p style={{ color: C.sub, fontSize: "clamp(0.9rem,1.5vw,1.05rem)", lineHeight: 1.8, marginBottom: "2rem", maxWidth: 460 }}>
                    Единая платформа для управления курьерами и заказами.
                    Интеграция с CRM и Консоль.Про — <strong style={{ color: C.text }}>вся бухгалтерия на нас</strong>.
                    Работа в белую: СЗ, ИП, ГПХ.
                  </p>
                  <div style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", marginBottom: "3rem" }}>
                    <a href="#request" className="btn-pri">Оставить заявку →</a>
                    <a href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer" className="btn-ghost">Написать в Telegram</a>
                  </div>
                  <div className="stat-row">
                    {[
                      { v: "1 000", l: "Заказов/день", s: "реальная нагрузка" },
                      { v: "< 1с", l: "Синх. с CRM", s: "через API и Webhook" },
                      { v: "5 мин", l: "Онбординг", s: "нового курьера" },
                      { v: "0 ₽", l: "Старт", s: "без абонплаты" },
                    ].map((s) => (
                      <div key={s.l}>
                        <div className="stat-v">{s.v}</div>
                        <div className="stat-l">{s.l}</div>
                        <div className="stat-s">{s.s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dashboard mockup */}
                <div>
                <Image
                    src="/og-image.png"
                    alt="ADelivo — интерфейс системы диспетчеризации курьеров"
                    width={1200} height={630}
                    style={{ width: "100%", height: "auto", display: "block" }}
                    priority
                  />
                  <div className="ew-tbl">
                    <div className="ew-tbl-bar">
                      <div className="dot" style={{ background: "#EF4444" }} />
                      <div className="dot" style={{ background: "#F59E0B" }} />
                      <div className="dot" style={{ background: "#10B981" }} />
                      <span style={{ fontSize: "0.68rem", color: C.muted, marginLeft: "0.5rem" }}>Дашборд — 24 заказа сегодня</span>
                    </div>
                    {[
                      { id: "#8821", a: "ул. Ленина, 42 кв. 7", t: "09:00", cls: "b-new", l: "Новый", c: "Антон" },
                      { id: "#8819", a: "пр. Мира, 15", t: "10:30", cls: "b-go", l: "В пути", c: "Дима" },
                      { id: "#8815", a: "Садовая, 3 — адрес?", t: "11:00", cls: "b-err", l: "Адрес?", c: "—" },
                      { id: "#8809", a: "б-р Строителей, 8/2", t: "11:30", cls: "b-done", l: "Доставлен", c: "Антон" },
                      { id: "#8802", a: "Советская ул., 101", t: "12:00", cls: "b-new", l: "Новый", c: "—" },
                    ].map((r) => (
                      <div key={r.id} className="ew-tbl-row">
                        <span style={{ color: C.muted, fontFamily: "monospace" }}>{r.id}</span>
                        <span style={{ color: C.sub, fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.a}</span>
                        <span className={r.cls}>{r.l}</span>
                        <span style={{ color: C.muted }}>{r.c}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: "1.2rem", padding: "0.8rem", background: "rgba(56,189,248,0.05)", borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: "0.68rem", color: C.accent, fontWeight: 700, marginBottom: "0.4rem" }}>💰 Расчёт ЗП — Неделя</div>
                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.7rem", color: C.muted }}>
                        <span>Антон · 12 заказов · <strong style={{ color: C.text }}>6 360 ₽</strong></span>
                        <span>Дима · 8 заказов · <strong style={{ color: C.text }}>4 240 ₽</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Кому подходит ── */}
          <div className="divider" />
          <section className="sec-alt">
            <div className="wrap">
              <Label t="Для кого" />
              <H2>Для любого доставочного бизнеса</H2>
              <Desc>Если есть курьеры и заказы — система подойдёт. Масштабируется от 10 до 1 000 заказов в день.</Desc>
              <div className="g3" style={{ marginTop: "2.5rem" }}>
                {[
                  { i: "🌸", t: "Цветочные магазины", d: "Срочные доставки, временные слоты, авто-распределение по районам." },
                  { i: "🍕", t: "Рестораны и еда", d: "Горячие заказы в реальном времени, контроль на карте." },
                  { i: "💊", t: "Аптеки и фарма", d: "Срочные маршруты, контроль каждой точки, контроль получателя." },
                  { i: "📦", t: "Интернет-магазины", d: "Сотни адресов, зонирование, автоматический маршрутный лист." },
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
                <div>
                  <Label t="Платформа" />
                  <H2>Всё что нужно диспетчеру</H2>
                  <Desc>От получения заказа до выплаты курьеру — один инструмент без Excel и мессенджеров.</Desc>
                  <div style={{ marginTop: "1.8rem" }}>
                    {[
                      { i: "📍", t: "Геокодинг + карта", d: "Автоматическое определение координат, AI-исправление кривых адресов." },
                      { i: "🗺️", t: "Умные маршруты", d: "Группировка по курьерам и слотам. Ссылка в Яндекс.Навигатор автоматически." },
                      { i: "🔔", t: "Push без SMS", d: "Курьеры получают уведомления о маршруте и изменениях заказа мгновенно." },
                      { i: "💬", t: "Встроенный чат", d: "Общий чат и личные сообщения между диспетчером и курьером." },
                      { i: "🔄", t: "Синхронизация с CRM", d: "Двусторонний Webhook. Статусы, курьеры, комментарии — за доли секунды." },
                      { i: "💰", t: "Расчёт ЗП и себестоимости", d: "Авто-подсчёт выплат по заказам с учётом надбавок. Себестоимость в CRM одной кнопкой." },
                    ].map((f) => (
                      <div key={f.t} className="fpill">
                        <div className="fpill-icon">{f.i}</div>
                        <div>
                          <p className="fpill-t">{f.t}</p>
                          <p className="fpill-d">{f.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="ew-tbl">
                  <div className="ew-tbl-bar">
                    <div className="dot" style={{ background: "#EF4444" }} />
                    <div className="dot" style={{ background: "#F59E0B" }} />
                    <div className="dot" style={{ background: "#10B981" }} />
                    <span style={{ fontSize: "0.68rem", color: C.muted, marginLeft: "0.5rem" }}>Маршруты — Антон · 29.03</span>
                  </div>
                  {[
                    { n: 1, a: "ул. Ленина, 42 кв. 7", s: "🚀 В пути", p: "500 ₽" },
                    { n: 2, a: "пр. Мира, 15", s: "⏳ Назначен", p: "900 ₽" },
                    { n: 3, a: "Садовая, 3", s: "⏳ Назначен", p: "500 ₽" },
                    { n: 4, a: "б-р Строителей, 8/2", s: "⏳ Назначен", p: "1 300 ₽" },
                  ].map((r) => (
                    <div key={r.n} style={{ display: "grid", gridTemplateColumns: "24px 1fr 70px 60px", gap: "0.5rem", padding: "0.5rem", borderRadius: 6, alignItems: "center", marginBottom: 2 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.accent, color: "#080C14", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800 }}>{r.n}</span>
                      <span style={{ color: C.sub, fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.a}</span>
                      <span style={{ fontSize: "0.66rem", color: C.muted }}>{r.s}</span>
                      <span style={{ fontSize: "0.72rem", color: C.green, fontWeight: 700 }}>{r.p}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: "0.8rem", padding: "0.7rem", background: "rgba(16,185,129,0.07)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)", fontSize: "0.72rem", color: C.muted }}>
                    Итого: 4 заказа · <strong style={{ color: C.green }}>3 390 ₽</strong> · x1.06 = <strong style={{ color: C.accent }}>3 593 ₽</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Бухгалтерия и Консоль.Про ── */}
          <div className="divider" />
          <section id="accounting" className="sec-alt">
            <div className="wrap">
              <Label t="Бухгалтерия и юридика" />
              <H2>Работа в белую —<br />всё на нас</H2>
              <Desc>Интеграция с Консоль.Про берёт на себя всё: создание заданий, акты, подписание, выплаты. Вы просто нажимаете «Оплатить».</Desc>

              <div className="g3" style={{ marginTop: "3rem" }}>
                {/* СЗ */}
                <div className="acc-card">
                  <div className="acc-badge" style={{ background: "rgba(56,189,248,0.1)", color: C.accent }}>⭐ Рекомендуем</div>
                  <div className="acc-title">Самозанятые (СЗ)</div>
                  <div className="acc-desc">Наиболее удобный формат. Курьер регистрируется как самозанятый — мы берём на себя всё: задания, акты, выплаты через Консоль.Про.</div>
                  <ul className="acc-list">
                    <li>Автоматическое создание задания в Консоль.Про</li>
                    <li>Расчёт суммы по фактическим заказам (+6% налог)</li>
                    <li>Финализация и подписание акта одной кнопкой</li>
                    <li>Автооплата на банковскую карту курьера</li>
                    <li>Чек в налоговую — автоматически через Консоль</li>
                    <li>Уведомление курьеру при выплате</li>
                  </ul>
                </div>

                {/* ИП */}
                <div className="acc-card">
                  <div className="acc-badge" style={{ background: "rgba(167,139,250,0.1)", color: C.purple }}>ИП</div>
                  <div className="acc-title">Индивидуальные предприниматели</div>
                  <div className="acc-desc">Для курьеров с ИП — договор ГПХ через Консоль.Про или напрямую. Гибкие условия оплаты.</div>
                  <ul className="acc-list">
                    <li>Создание заданий и актов в Консоль.Про</li>
                    <li>Оплата по акту через систему</li>
                    <li>Учёт в общей таблице расчёта ЗП</li>
                    <li>Настраиваемые ставки по договору</li>
                  </ul>
                </div>

                {/* ГПХ */}
                <div className="acc-card">
                  <div className="acc-badge" style={{ background: "rgba(16,185,129,0.1)", color: C.green }}>ГПХ</div>
                  <div className="acc-title">Договор ГПХ</div>
                  <div className="acc-desc">Для физических лиц без статуса СЗ или ИП — договор гражданско-правового характера. Мы ведём учёт и расчёты.</div>
                  <ul className="acc-list">
                    <li>Учёт смен и выплат в системе</li>
                    <li>Расчёт НДФЛ и взносов</li>
                    <li>Ведомость выплат по периодам</li>
                  </ul>
                </div>
              </div>

              {/* Pipeline */}
              <div style={{ marginTop: "3rem", background: C.card, borderRadius: 20, border: `1px solid ${C.border}`, padding: "2rem" }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.5rem" }}>Как это работает — от заказа до выплаты</div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  {[
                    { e: "📦", t: "Заказ выполнен" },
                    { e: "→", t: "" },
                    { e: "🔁", t: "Пересчёт суммы" },
                    { e: "→", t: "" },
                    { e: "📄", t: "Финализация акта" },
                    { e: "→", t: "" },
                    { e: "✍️", t: "Подписание" },
                    { e: "→", t: "" },
                    { e: "💳", t: "Автооплата" },
                    { e: "→", t: "" },
                    { e: "🔔", t: "Уведомление" },
                  ].map((s, i) => s.t ? (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
                      <span style={{ fontSize: "1.4rem" }}>{s.e}</span>
                      <span style={{ fontSize: "0.65rem", color: C.muted, textAlign: "center", maxWidth: 80 }}>{s.t}</span>
                    </div>
                  ) : (
                    <span key={i} style={{ color: C.accent, fontSize: "1.2rem", opacity: 0.5 }}>→</span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Как это работает (шаги) ── */}
          <div className="divider" />
          <section className="sec">
            <div className="wrap">
              <div className="g2" style={{ gap: "4rem" }}>
                <div>
                  <Label t="Процесс" />
                  <H2>Как это работает</H2>
                  <Desc>От нового заказа до уведомления курьера — весь процесс автоматизирован.</Desc>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
                  {[
                    { n: "01", t: "Заказ создаётся в CRM", d: "RetailCRM или любая система присылает Webhook в ADelivo — статус, адрес, слот, курьер." },
                    { n: "02", t: "Автоматическое геокодирование", d: "Координаты через Яндекс API. Проблемные адреса подсвечиваются, AI исправляет за один клик." },
                    { n: "03", t: "Диспетчер собирает маршруты", d: "Назначение курьеров и группировка заказов. Ссылка на маршрут — автоматически." },
                    { n: "04", t: "Курьер получает Push", d: "При назначении маршрута — мгновенное Push-уведомление в PWA без SMS." },
                    { n: "05", t: "Статус обновляется везде", d: "Курьер меняет статус — данные уходят обратно в CRM за доли секунды." },
                    { n: "06", t: "Расчёт и выплата", d: "Система считает сумму по заказам, создаёт акт в Консоль.Про, подписывает и отправляет в оплату." },
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
                  <Desc>
                    PWA устанавливается на iPhone и Android за 30 секунд без App Store. Вход по коду из email —
                    пароль не нужен.{'( '}
                    <Link href="/design" style={{ textDecoration: 'underline', color: C.accent }}>
                      Посмотрите мокап
                    </Link>
                    , чтобы оценить, как выглядит экран курьера с заказами и маршрутами.
                  </Desc>
                  <div style={{ marginTop: "1.8rem" }}>
                    {[
                      { i: "📋", t: "Только свои заказы", d: "Маршруты этого курьера, отсортированные по слотам." },
                      { i: "🧭", t: "Яндекс.Навигатор в тап", d: "Маршрут строится автоматически — без ручного ввода адреса." },
                      { i: "✅", t: "Смена статуса заказа", d: "«В пути» → «Доставлен» прямо из карточки заказа." },
                      { i: "🔔", t: "Push-уведомления", d: "Изменение адреса, времени, комментария — сразу на экран." },
                      { i: "📅", t: "График смен", d: "Курьер отмечает рабочие дни — диспетчер видит доступность." },
                      { i: "🚗", t: "Режим авто / пеший", d: "Переключение типа доставки прямо в профиле — влияет на маршрут и ставку." },
                      { i: "📍", t: "Геолокация в реальном времени", d: "Диспетчер видит положение курьера на карте. Курьер управляет видимостью." },
                      { i: "💬", t: "Встроенный чат", d: "Личные сообщения с диспетчером и общий чат команды прямо в приложении." },
                      { i: "💰", t: "Расчёт выплат", d: "Курьер видит сумму заработка за неделю — количество заказов и итоговую сумму." },
                      { i: "🧾", t: "Привязка Консоль.Про", d: "Самозанятый привязывает статус СЗ в профиле — выплаты идут автоматически на карту." },
                      { i: "🔐", t: "Вход без пароля", d: "Одноразовый код на email. Ничего помнить не нужно." },
                    ].map((f) => (
                      <div key={f.t} className="fpill">
                        <div className="fpill-icon">{f.i}</div>
                        <div>
                          <p className="fpill-t">{f.t}</p>
                          <p className="fpill-d">{f.d}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="courier-cta" style={{ marginTop: "2rem" }}>
                    <p className="courier-cta-t">Хотите работать курьером?</p>
                    <p className="courier-cta-d">Напишите нам — расскажем об условиях и зарегистрируем в системе. Приложение установите сами за 30 секунд.</p>
                    <a href="/login" className="btn-big">🚀 Стать курьером — зарегистрироваться</a>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "1rem" }}>
                  <div className="phone">
                    <div className="phone-notch" />
                    <div className="phone-body">
                      <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#1A1A18", display: "flex", justifyContent: "space-between", marginBottom: "0.6rem", paddingBottom: "0.5rem", borderBottom: "1px solid #E8E6DF" }}>
                        <span>Мои маршруты</span>
                        <span style={{ color: "#A8A49C", fontWeight: 400 }}>4 заказа</span>
                      </div>
                      {[
                        { s: "🚀 В пути", a: "ул. Ленина, 42", m: "#8821 · 09:00–12:00", c: "#4A7AFF" },
                        { s: "⏳ Назначен", a: "пр. Мира, 15", m: "#8819 · 12:00–14:00", c: "#F59E0B" },
                        { s: "⏳ Назначен", a: "Садовая, 3", m: "#8815 · 14:00–16:00", c: "#F59E0B" },
                      ].map((o, i) => (
                        <div key={i} style={{ marginBottom: "0.5rem", padding: "0.5rem 0.6rem", background: "#F8F7F4", borderRadius: 8 }}>
                          <div style={{ fontSize: "0.62rem", fontWeight: 700, color: o.c, marginBottom: "0.15rem" }}>{o.s}</div>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#1A1A18" }}>{o.a}</div>
                          <div style={{ fontSize: "0.62rem", color: "#A8A49C", marginTop: "0.1rem" }}>{o.m}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── ТАРИФЫ ── */}
          <div className="divider" />
          <section id="pricing" className="sec">
            <div className="wrap">
              <Label t="Тарифы" />
              <H2>Прозрачное ценообразование</H2>
              <Desc>Выберите формат сотрудничества который подходит вашему бизнесу. Платите только за реальные заказы.</Desc>

              <div className="g4" style={{ marginTop: "3rem" }}>
                {/* Полный аутсорс */}
                <div className="price-card">
                  <div className="price-name">Полный аутсорс</div>
                  <div>
                    <div className="price-amount">~200</div>
                    <div className="price-unit">₽ за заказ</div>
                  </div>
                  <div className="price-desc">Всё на нас: операторы, логисты, курьеры, бухгалтерия. Вы только принимаете заказы.</div>
                  <ul className="price-features">
                    <li><span className="check">✓</span>Операторы и диспетчеры</li>
                    <li><span className="check">✓</span>Курьеры в штате</li>
                    <li><span className="check">✓</span>Маршрутизация</li>
                    <li><span className="check">✓</span>Расчёт ЗП и акты</li>
                    <li><span className="check">✓</span>Интеграция с CRM</li>
                  </ul>
                </div>

                {/* Только платформа */}
                <div className="price-card featured">
                  <div className="price-name">Только платформа</div>
                  <div>
                    <div className="price-amount">от 10</div>
                    <div className="price-unit">₽ за заказ</div>
                  </div>
                  <div className="price-desc">Свои операторы, логисты и курьеры. Вам нужна только платформа и инструменты.</div>
                  <ul className="price-features">
                    <li><span className="x">—</span>Ваши операторы</li>
                    <li><span className="x">—</span>Ваши курьеры</li>
                    <li><span className="check">✓</span>Дашборд и маршруты</li>
                    <li><span className="check">✓</span>PWA для курьеров</li>
                    <li><span className="check">✓</span>Синх. с CRM</li>
                    <li><span className="check">✓</span>Расчёт ЗП</li>
                  </ul>
                </div>

                {/* Есть логисты */}
                <div className="price-card">
                  <div className="price-name">Есть логисты</div>
                  <div>
                    <div className="price-amount">от 50</div>
                    <div className="price-unit">₽ за заказ</div>
                  </div>
                  <div className="price-desc">Есть логисты и операторы — нужны курьеры и бухгалтерия по СЗ/ИП/ГПХ.</div>
                  <ul className="price-features">
                    <li><span className="x">—</span>Ваши логисты</li>
                    <li><span className="check">✓</span>Наши курьеры</li>
                    <li><span className="check">✓</span>Расчёт ЗП</li>
                    <li><span className="check">✓</span>Акты и выплаты</li>
                    <li><span className="check">✓</span>Консоль.Про</li>
                  </ul>
                </div>

                {/* Есть курьеры */}
                <div className="price-card">
                  <div className="price-name">Есть курьеры</div>
                  <div>
                    <div className="price-amount">от 100</div>
                    <div className="price-unit">₽ за заказ</div>
                  </div>
                  <div className="price-desc">Есть курьеры — нужны логисты, операторы и платформа для управления.</div>
                  <ul className="price-features">
                    <li><span className="check">✓</span>Наши логисты</li>
                    <li><span className="x">—</span>Ваши курьеры</li>
                    <li><span className="check">✓</span>Дашборд</li>
                    <li><span className="check">✓</span>Маршрутизация</li>
                    <li><span className="check">✓</span>Синх. с CRM</li>
                  </ul>
                </div>
              </div>

              <div style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.82rem", color: C.muted }}>
                Смешанный формат — договорная. Обсудим в Telegram.
              </div>
            </div>
          </section>

          {/* ── Кейсы ── */}
          <div className="divider" />
          <section id="cases" className="sec-alt">
            <div className="wrap">
              <Label t="Кейсы" />
              <H2>Реальные результаты</H2>
              <div className="g3" style={{ marginTop: "2.5rem" }}>
                {[
                  {
                    t: "🌸 Цветочный магазин «Банч»",
                    m: [{ v: "700", l: "Заказов/день" }, { v: "100 ", l: "Курьеров/8 марта " }, { v: "0", l: "SMS" }],
                    d: "Полная автоматизация: RetailCRM → ADelivo → Консоль.Про. Все Push-уведомления заменили SMS. Операторы и диспетчеры работают параллельно без конфликтов. Расчёт ЗП и подписание актов — без бухгалтера.",
                  },
                  {
                    t: "📦 Интернет-магазин",
                    m: [{ v: "40%", l: "Меньше ошибок" }, { v: "3×", l: "Быстрее диспетч." }, { v: "100%", l: "Белая работа" }],
                    d: "Автогеокодинг устранил ошибки ручного ввода. Маршруты собираются за минуту вместо 20. Все курьеры оформлены как СЗ через Консоль.Про — никакого серого нала.",
                  },
                  {
                    t: "🚚 Курьерская служба",
                    m: [{ v: "СЗ", l: "Все курьеры" }, { v: "1 клик", l: "Выплата" }, { v: "0", l: "Бухгалтеров" }],
                    d: "Перешли с наличного расчёта на выплаты через Консоль.Про. Система сама считает сумму, создаёт акт, подписывает и отправляет деньги на карту. Курьер получает Push при выплате.",
                  },
                ].map((c) => (
                  <div key={c.t} className="case-card">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                      <strong className="case-t">{c.t}</strong>
                    </div>
                    <div className="case-metrics">
                      {c.m.map((m) => (
                        <div key={m.l} className="case-m">
                          <p className="case-mv">{m.v}</p>
                          <p className="case-ml">{m.l}</p>
                        </div>
                      ))}
                    </div>
                    <p className="case-d">{c.d}</p>
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
                  { i: "🔄", n: "RetailCRM", note: "Webhook двусторонний" },
                  { i: "💼", n: "Консоль.Про", note: "Задания, акты, выплаты" },
                  { i: "🗺️", n: "Яндекс Карты", note: "Геокодинг + навигация" },
                  { i: "📲", n: "Web Push API", note: "Push без SMS" },
                  { i: "📱", n: "PWA", note: "iOS + Android" },
                  { i: "🌐", n: "Webhook API", note: "Любая CRM" },
                  { i: "📧", n: "Email-уведомления", note: "SMTP" },
                  { i: "🤖", n: "Telegram Bot", note: "Уведомления операторам" },
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

          {/* ── ФОРМА ЗАЯВКИ ── */}
          <div className="divider" />
          <section id="request" className="sec-alt">
            <div className="wrap">
              <div style={{ textAlign: "center", marginBottom: "3rem" }}>
                <Label t="Оставить заявку" />
                <H2>Расчёт под ваш бизнес</H2>
                <p style={{ color: C.muted, fontSize: "0.95rem", lineHeight: 1.8, maxWidth: 560, margin: "0 auto" }}>
                  Заполните форму — наш менеджер свяжется в Telegram и рассчитает стоимость под ваши объёмы.
                </p>
              </div>

              <div className="form-wrap">
                <RequestForm />
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <div className="divider" />
          <section id="faq" className="sec">
            <div className="wrap">
              <div className="g2" style={{ gap: "4rem" }}>
                <div>
                  <Label t="Вопросы и ответы" />
                  <H2>FAQ</H2>
                  <Desc>Отвечаем на самые частые вопросы.</Desc>
                </div>
                <div>
                  {[
                    { q: "Для какого бизнеса подходит ADelivo?", a: "Для любого бизнеса с курьерской доставкой: цветочные магазины, еда, аптеки, интернет-магазины, курьерские службы. Если есть курьеры и заказы — система подойдёт." },
                    { q: "Что такое работа в белую через СЗ?", a: "Курьер оформляется как самозанятый. Мы через Консоль.Про автоматически создаём задание, рассчитываем сумму по заказам, формируем акт, подписываем его и отправляем выплату на карту. Налоговый чек выписывается автоматически." },
                    { q: "Как стать курьером?", a: "Зарегистрируйтесь на платформе или напишите нам в Telegram. После регистрации придёт ссылка и код на email — пароль не нужен. Приложение устанавливается на любой смартфон за 30 секунд." },
                    { q: "Работает ли с RetailCRM?", a: "Да. Двусторонняя синхронизация через Webhook — статусы, курьеры, комментарии обновляются в обе стороны за доли секунды." },
                    { q: "Что такое Консоль.Про?", a: "Сервис для работы с самозанятыми и фрилансерами. Мы интегрируем его для автоматического создания заданий, формирования актов и выплат на карты СЗ-курьеров." },
                    { q: "Сколько времени занимает внедрение?", a: "Базовая настройка с RetailCRM — 1–3 дня. Курьер начинает работать через 5 минут после регистрации." },
                    { q: "Можно ли подключить другую CRM?", a: "Да. ADelivo принимает Webhook в JSON или form-urlencoded от любой системы. Поможем с настройкой." },
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
                  position: "absolute", width: 500, height: 400, borderRadius: "50%",
                  background: "radial-gradient(ellipse,rgba(56,189,248,0.06) 0%,transparent 70%)",
                  top: -150, left: "50%", transform: "translateX(-50%)", pointerEvents: "none",
                }} />
                <Label t="Старт" />
                <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(2rem,5vw,3.5rem)", letterSpacing: "0.05em", color: C.text, marginBottom: "1rem" }}>
                  Готовы попробовать?
                </h2>
                <p style={{ color: C.muted, fontSize: "0.92rem", lineHeight: 1.75, maxWidth: 460, margin: "0 auto 2rem" }}>
                  Свяжитесь с нами в Telegram — расскажем о возможностях и поможем с настройкой интеграции под ваш бизнес.
                </p>
                <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                  <a href="#request" className="btn-pri">Оставить заявку →</a>
                  <a href="https://t.me/adelivo" target="_blank" rel="noopener noreferrer" className="btn-ghost">Написать в Telegram</a>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </>
  );
}
