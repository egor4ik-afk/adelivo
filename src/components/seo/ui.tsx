// src/components/seo/ui.tsx
// Общий каркас для всех SEO-посадочных страниц ADelivo.
// Дизайн 1:1 с лендингом на "/" — та же палитра, типографика, сетка.
// Серверный компонент: никакого "use client" (важно для индексации — весь текст в HTML).

import Image from "next/image";
import Link from "next/link";
import { RequestForm } from "@/components/RequestForm";

export const SITE_URL = "https://adelivo.ru";

/* ─── Палитра (совпадает с лендингом) ──────────────────────── */
export const C = {
  bg: "#080C14",
  surface: "#0D1420",
  card: "#0F1825",
  border: "rgba(56,189,248,0.12)",
  accent: "#38BDF8",
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  purple: "#A78BFA",
  text: "#E2EBF8",
  muted: "#64748B",
  sub: "#94A3B8",
};

/* ─── CSS ──────────────────────────────────────────────────── */
const css = `
  .ew,.ew *,.ew *::before,.ew *::after{box-sizing:border-box}
  .ew h1,.ew h2,.ew h3,.ew p,.ew ul,.ew ol,.ew figure{margin:0;padding:0}
  .ew ul,.ew ol{list-style:none}
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

  /* header */
  .ew-hdr{position:sticky;top:0;z-index:100;background:rgba(8,12,20,0.92);backdrop-filter:blur(16px);border-bottom:1px solid ${C.border}}
  .ew-hdr .inner{height:64px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
  .ew-logo{display:flex;align-items:center;gap:10px;flex-shrink:0}
  .ew-logo-txt{font-weight:800;font-size:1.1rem;color:${C.text};letter-spacing:0.05em}
  .ew-logo-txt span{color:${C.accent}}
  .ew-nav{display:flex;gap:1.5rem}
  .ew-nav a{color:${C.muted};font-size:0.83rem;font-weight:500;transition:color .2s}
  .ew-nav a:hover{color:${C.text}}
  .ew-hbtns{display:flex;gap:0.6rem;flex-shrink:0}

  /* buttons */
  .btn-pri{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.9rem;letter-spacing:0.03em;background:${C.accent};color:#080C14;transition:opacity .2s;white-space:nowrap}
  .btn-pri:hover{opacity:0.88}
  .btn-ghost{display:inline-flex;align-items:center;gap:0.5rem;padding:0.85rem 2rem;border-radius:10px;font-weight:600;font-size:0.9rem;border:1px solid ${C.border};color:${C.text};transition:border-color .2s;white-space:nowrap}
  .btn-ghost:hover{border-color:${C.accent}}
  .btn-hdr-pri{padding:0.5rem 1.1rem;border-radius:8px;background:${C.accent};color:#080C14;font-size:0.82rem;font-weight:700}
  .btn-hdr-ghost{padding:0.5rem 1.1rem;border-radius:8px;border:1px solid ${C.border};font-size:0.82rem;font-weight:600;color:${C.text}}

  /* заголовки секций */
  .label{font-size:0.7rem;letter-spacing:0.2em;text-transform:uppercase;color:${C.accent};margin-bottom:0.6rem;font-weight:700}
  .h1{font-family:'Bebas Neue',sans-serif;font-size:clamp(2.6rem,6vw,5rem);letter-spacing:0.04em;line-height:1.02;color:${C.text};margin-bottom:1.2rem}
  .h1 span{color:${C.accent}}
  .h2{font-family:'Bebas Neue',sans-serif;font-size:clamp(2rem,4.5vw,3.6rem);letter-spacing:0.04em;line-height:1.05;color:${C.text};margin-bottom:1rem}
  .h3{font-weight:700;font-size:1.02rem;color:${C.text};margin-bottom:0.5rem}
  .desc{color:${C.muted};font-size:0.95rem;line-height:1.8;max-width:620px}
  .lead{color:${C.sub};font-size:1.02rem;line-height:1.8;max-width:620px}
  .prose{color:${C.sub};font-size:0.92rem;line-height:1.85;max-width:760px}
  .prose p{margin-bottom:1rem}
  .prose strong{color:${C.text}}
  .prose a{color:${C.accent};border-bottom:1px solid rgba(56,189,248,0.35)}

  /* хлебные крошки */
  .crumbs{display:flex;flex-wrap:wrap;gap:0.45rem;align-items:center;font-size:0.74rem;color:${C.muted};padding:1.1rem 0 0}
  .crumbs a:hover{color:${C.accent}}
  .crumbs .sep{opacity:0.45}

  /* карточки */
  .card{background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:1.5rem}
  .card-i{font-size:1.4rem;display:block;margin-bottom:0.7rem}
  .card-d{font-size:0.84rem;color:${C.muted};line-height:1.72}

  /* пилюли-строки */
  .fpill{display:flex;gap:1rem;align-items:flex-start;padding:1rem 1.2rem;background:${C.card};border:1px solid ${C.border};border-radius:14px;margin-bottom:0.7rem}
  .fpill-icon{font-size:1.2rem;line-height:1.4}
  .fpill-t{font-weight:700;font-size:0.9rem;color:${C.text};margin-bottom:0.18rem}
  .fpill-d{font-size:0.82rem;color:${C.muted};line-height:1.65}

  /* шаги */
  .step{display:flex;gap:1rem;align-items:flex-start;padding:1.1rem 1.4rem;background:${C.card};border:1px solid ${C.border};border-radius:14px;margin-bottom:0.7rem}
  .step-n{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:rgba(56,189,248,0.1);color:${C.accent};font-weight:800;font-size:0.78rem;display:flex;align-items:center;justify-content:center}
  .step-t{font-weight:700;font-size:0.88rem;color:${C.text};margin-bottom:0.2rem}
  .step-d{font-size:0.8rem;color:${C.muted};line-height:1.68}

  /* метрики */
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-top:2rem}
  .metric{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:1.3rem}
  .metric-v{font-family:'Bebas Neue',sans-serif;font-size:2.3rem;color:${C.accent};line-height:1;letter-spacing:0.03em}
  .metric-l{font-size:0.68rem;color:${C.muted};text-transform:uppercase;letter-spacing:0.09em;margin-top:0.35rem}

  /* таблица */
  .tbl{width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:1.6rem;overflow:hidden;border-radius:14px;border:1px solid ${C.border}}
  .tbl th{text-align:left;padding:0.85rem 1rem;background:rgba(56,189,248,0.06);color:${C.text};font-weight:700;font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em}
  .tbl td{padding:0.85rem 1rem;border-top:1px solid ${C.border};color:${C.sub};line-height:1.6;vertical-align:top}
  .tbl td strong{color:${C.text}}
  .tbl-wrap{overflow-x:auto}

  /* faq */
  .faq-item{border-bottom:1px solid ${C.border};padding-bottom:1.15rem;margin-bottom:1.15rem}
  .faq-q{font-weight:700;font-size:0.92rem;color:${C.text};margin-bottom:0.45rem}
  .faq-a{font-size:0.84rem;color:${C.muted};line-height:1.78}

  /* чек-лист */
  .ck{display:flex;gap:0.6rem;align-items:flex-start;font-size:0.87rem;color:${C.sub};line-height:1.7;margin-bottom:0.6rem}
  .ck b{color:${C.accent};flex-shrink:0}

  /* пилюли интеграций */
  .ipill{display:inline-flex;align-items:center;gap:0.55rem;padding:0.55rem 1.1rem;background:${C.card};border:1px solid ${C.border};border-radius:8px;font-size:0.82rem;font-weight:600;color:${C.text}}
  .ipill .note{color:${C.muted};font-size:0.74rem;font-weight:400}
  .ipill:hover{border-color:${C.accent}}

  /* блок формы */
  .form-wrap{max-width:760px;margin:0 auto;background:${C.card};border:1px solid ${C.border};border-radius:22px;padding:2rem}

  /* связанные страницы */
  .rel{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:2rem}
  .rel-card{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:1.15rem 1.3rem;transition:border-color .2s}
  .rel-card:hover{border-color:${C.accent}}
  .rel-t{font-weight:700;font-size:0.88rem;color:${C.text};margin-bottom:0.25rem}
  .rel-d{font-size:0.77rem;color:${C.muted};line-height:1.6}

  /* код */
  .codebox{background:#0A1628;border:1px solid ${C.border};border-radius:12px;padding:1.1rem 1.3rem;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.78rem;color:${C.sub};line-height:1.75;overflow-x:auto;white-space:pre;margin-top:1.2rem}
  .codebox .k{color:${C.accent}}

  /* футер */
  .ftr{border-top:1px solid ${C.border};background:${C.bg};padding:3.5rem 0 2.5rem}
  .ftr-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:2rem}
  .ftr-h{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.14em;color:${C.accent};font-weight:700;margin-bottom:0.9rem}
  .ftr-l{display:block;font-size:0.82rem;color:${C.muted};margin-bottom:0.55rem;transition:color .2s}
  .ftr-l:hover{color:${C.text}}
  .ftr-bottom{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid ${C.border};display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;font-size:0.76rem;color:${C.muted}}

  @media(max-width:900px){
    .ew .g2,.ew .g3,.ew .g4,.ew .g2r{grid-template-columns:1fr}
    .ew-nav{display:none}
    .ew .sec,.ew .sec-alt{padding:3.5rem 0}
    .metrics{grid-template-columns:repeat(2,1fr)}
    .rel{grid-template-columns:1fr}
    .ftr-grid{grid-template-columns:1fr 1fr}
    .form-wrap{padding:1.2rem}
  }
  @media(max-width:500px){
    .btn-hdr-ghost{display:none}
    .metrics{grid-template-columns:1fr 1fr}
  }
  @media(prefers-reduced-motion:reduce){.ew *{transition:none!important;animation:none!important}}
`;

/* ─── Примитивы ────────────────────────────────────────────── */
export function Label({ t }: { t: string }) {
  return <p className="label">{t}</p>;
}
export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 className="h2" id={id}>{children}</h2>;
}
export function Desc({ children }: { children: React.ReactNode }) {
  return <p className="desc">{children}</p>;
}

export function Metrics({ items }: { items: { v: string; l: string }[] }) {
  return (
    <div className="metrics">
      {items.map((m) => (
        <div key={m.l} className="metric">
          <p className="metric-v">{m.v}</p>
          <p className="metric-l">{m.l}</p>
        </div>
      ))}
    </div>
  );
}

export function Pills({ items }: { items: { i: string; t: string; d: string }[] }) {
  return (
    <div style={{ marginTop: "1.8rem" }}>
      {items.map((f) => (
        <div key={f.t} className="fpill">
          <div className="fpill-icon">{f.i}</div>
          <div>
            <p className="fpill-t">{f.t}</p>
            <p className="fpill-d">{f.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Cards({ items }: { items: { i: string; t: string; d: string }[] }) {
  return (
    <div className="g3" style={{ marginTop: "2.5rem" }}>
      {items.map((c) => (
        <div key={c.t} className="card">
          <span className="card-i">{c.i}</span>
          <h3 className="h3">{c.t}</h3>
          <p className="card-d">{c.d}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <div style={{ marginTop: "2rem" }}>
      {items.map((s, i) => (
        <div key={s.t} className="step">
          <div className="step-n">{String(i + 1).padStart(2, "0")}</div>
          <div>
            <p className="step-t">{s.t}</p>
            <p className="step-d">{s.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <div style={{ marginTop: "1.4rem" }}>
      {items.map((t) => (
        <p key={t} className="ck"><b>✓</b><span>{t}</span></p>
      ))}
    </div>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <div className="prose" style={{ marginTop: "1.4rem" }}>{children}</div>;
}

/* ─── FAQ (визуал + JSON-LD берётся на странице) ───────────── */
export type Faq = { q: string; a: string };
export function FaqSection({ items, title = "Частые вопросы" }: { items: Faq[]; title?: string }) {
  return (
    <>
      <div className="divider" />
      <section className="sec" id="faq">
        <div className="wrap">
          <div className="g2" style={{ gap: "4rem" }}>
            <div>
              <Label t="Вопросы и ответы" />
              <H2>{title}</H2>
              <Desc>Не нашли ответ — напишите в Telegram, отвечаем в течение часа в рабочее время.</Desc>
            </div>
            <div>
              {items.map((f) => (
                <div key={f.q} className="faq-item">
                  <h3 className="faq-q">{f.q}</h3>
                  <p className="faq-a">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Форма заявки (та же, что на лендинге) ────────────────── */
export function RequestSection({
  title = "Подключим бесплатно за 3 дня",
  desc = "Оставьте заявку — менеджер свяжется в Telegram, покажет демо на ваших заказах и рассчитает стоимость под ваши объёмы.",
}: { title?: string; desc?: string }) {
  return (
    <>
      <div className="divider" />
      <section className="sec-alt" id="request">
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <Label t="Оставить заявку" />
            <H2>{title}</H2>
            <p style={{ color: C.muted, fontSize: "0.95rem", lineHeight: 1.8, maxWidth: 600, margin: "0 auto" }}>
              {desc}
            </p>
          </div>
          <div className="form-wrap">
            <RequestForm />
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Связанные страницы (внутренняя перелинковка) ─────────── */
export type RelLink = { href: string; t: string; d: string };
export function Related({ items, title = "Читайте также" }: { items: RelLink[]; title?: string }) {
  return (
    <>
      <div className="divider" />
      <section className="sec">
        <div className="wrap">
          <Label t="Навигация" />
          <H2>{title}</H2>
          <div className="rel">
            {items.map((r) => (
              <Link key={r.href} href={r.href} className="rel-card">
                <p className="rel-t">{r.t} →</p>
                <p className="rel-d">{r.d}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ─── Хлебные крошки ───────────────────────────────────────── */
export type Crumb = { name: string; href: string };
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Хлебные крошки">
      <Link href="/">Главная</Link>
      {items.map((c, i) => (
        <span key={c.href} style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center" }}>
          <span className="sep">/</span>
          {i === items.length - 1 ? <span style={{ color: C.sub }}>{c.name}</span> : <Link href={c.href}>{c.name}</Link>}
        </span>
      ))}
    </nav>
  );
}

export function breadcrumbJsonLd(items: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE_URL}/` },
      ...items.map((c, i) => ({
        "@type": "ListItem",
        position: i + 2,
        name: c.name,
        item: `${SITE_URL}${c.href}`,
      })),
    ],
  };
}

export function faqJsonLd(items: Faq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/* ─── Hero ─────────────────────────────────────────────────── */
export function Hero({
  label, h1, sub, bullets, crumbs,
}: {
  label: string;
  h1: React.ReactNode;
  sub: string;
  bullets?: string[];
  crumbs: Crumb[];
}) {
  return (
    <section className="sec" style={{ position: "relative", overflow: "hidden", paddingTop: "1rem" }}>
      <div style={{
        position: "absolute", width: 900, height: 520, borderRadius: "50%",
        background: "radial-gradient(ellipse,rgba(56,189,248,0.07) 0%,transparent 70%)",
        top: -200, left: "50%", transform: "translateX(-50%)", pointerEvents: "none",
      }} />
      <div className="wrap" style={{ position: "relative" }}>
        <Breadcrumbs items={crumbs} />
        <div style={{ marginTop: "2.2rem", maxWidth: 820 }}>
          <Label t={label} />
          <h1 className="h1">{h1}</h1>
          <p className="lead">{sub}</p>
          {bullets && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", marginTop: "1.6rem" }}>
              {bullets.map((b) => (
                <span key={b} className="ipill">{b}</span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "2rem" }}>
            <a href="#request" className="btn-pri">Оставить заявку →</a>
            <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" className="btn-ghost">Написать в Telegram</a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Оболочка страницы ────────────────────────────────────── */
export function SeoShell({ children, jsonLd }: { children: React.ReactNode; jsonLd?: object[] }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Golos+Text:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {jsonLd?.map((j, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(j) }} />
      ))}

      <div className="ew">
        <header className="ew-hdr">
          <div className="wrap">
            <div className="inner">
              <Link href="/" className="ew-logo" aria-label="ADelivo — главная">
                <Image src="/web-app-manifest-192x192.png" alt="" width={32} height={32} style={{ borderRadius: 8 }} />
                <span className="ew-logo-txt">Agent<span>Delivo</span></span>
              </Link>
              <nav aria-label="Основная навигация">
                <ul className="ew-nav">
                  <li><Link href="/sistema-upravleniya-kurerami">Платформа</Link></li>
                  <li><Link href="/vozmozhnosti/interfeysy">3 экрана</Link></li>
                  <li><Link href="/ai-marshrutizaciya">AI-маршруты</Link></li>
                  <li><Link href="/integracii">Интеграции</Link></li>
                  <li><Link href="/keysy">Кейсы</Link></li>
                  <li><Link href="/#pricing">Тарифы</Link></li>
                </ul>
              </nav>
              <div className="ew-hbtns">
                <a href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer" className="btn-hdr-ghost">Telegram</a>
                <Link href="/login" className="btn-hdr-pri">Войти →</Link>
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="ftr">
          <div className="wrap">
            <div className="ftr-grid">
              <div>
                <div className="ew-logo" style={{ marginBottom: "0.9rem" }}>
                  <span className="ew-logo-txt">Agent<span>Delivo</span></span>
                </div>
                <p style={{ fontSize: "0.82rem", color: C.muted, lineHeight: 1.75, maxWidth: 300 }}>
                  Универсальная платформа диспетчеризации для любой доставки: заказы, маршруты,
                  курьеры, выплаты и бухгалтерия в одном окне. Подключение к любой CRM — бесплатно за 3 дня.
                </p>
              </div>
              <div>
                <p className="ftr-h">Платформа</p>
                <Link className="ftr-l" href="/sistema-upravleniya-kurerami">Система управления курьерами</Link>
                <Link className="ftr-l" href="/vozmozhnosti/zakazy">Заказы и диспетчеризация</Link>
                <Link className="ftr-l" href="/vozmozhnosti/kurery">Курьеры, выплаты, график</Link>
                <Link className="ftr-l" href="/vozmozhnosti/interfeysy">Три интерфейса</Link>
                <Link className="ftr-l" href="/ai-marshrutizaciya">AI-маршрутизация</Link>
              </div>
              <div>
                <p className="ftr-h">Интеграции</p>
                <Link className="ftr-l" href="/integracii">Все интеграции</Link>
                <Link className="ftr-l" href="/integracii/bitrix24">Битрикс24</Link>
                <Link className="ftr-l" href="/integracii/retailcrm">RetailCRM</Link>
                <Link className="ftr-l" href="/integracii/telegram">Telegram</Link>
                <Link className="ftr-l" href="/integracii/yandex-karty">Яндекс Карты</Link>
                <Link className="ftr-l" href="/integracii/konsol-pro">Консоль.Про</Link>
              </div>
              <div>
                <p className="ftr-h">Компания</p>
                <Link className="ftr-l" href="/about">О компании</Link>
                <Link className="ftr-l" href="/pochemu-my">Почему мы</Link>
                <Link className="ftr-l" href="/keysy">Кейсы</Link>
                <Link className="ftr-l" href="/keysy/bunch">Кейс: «Банч»</Link>
                <Link className="ftr-l" href="/#pricing">Тарифы</Link>
                <a className="ftr-l" href="https://t.me/weareventwave" target="_blank" rel="noopener noreferrer">Telegram</a>
              </div>
            </div>
            <div className="ftr-bottom">
              <span>© {new Date().getFullYear()} ADelivo — платформа диспетчеризации и логистики</span>
              <span>Работаем с СЗ, ИП и ГПХ через Консоль.Про</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
