// src/components/theme/theme.ts
// Единый источник цвета для публичной части сайта (лендинг + SEO-страницы + шапка/футер).
// Все цвета объявлены как CSS-переменные, поэтому смена темы = смена одного атрибута
// на <html data-ew-theme="light|dark"> — без перерисовки React и без мигания.

/* ─── Тёмная тема (по умолчанию) ───────────────────────────── */
const DARK = `
  --ew-bg:#09090A;
  --ew-surface:#0F0F11;
  --ew-card:#141417;
  --ew-border:rgba(255,255,255,0.09);
  --ew-border-2:rgba(255,255,255,0.18);
  --ew-accent:#38BDF8;
  --ew-accent-2:#0EA5E9;
  --ew-accent-contrast:#09090A;
  --ew-accent-rgb:56,189,248;
  --ew-text:#ECECEE;
  --ew-sub:#A0A0A8;
  --ew-muted:#6E6E77;
  --ew-muted-rgb:110,110,119;
  --ew-green:#34D399;
  --ew-green-rgb:52,211,153;
  --ew-amber:#FBBF24;
  --ew-red:#F87171;
  --ew-red-rgb:248,113,113;
  --ew-purple:#A78BFA;
  --ew-purple-rgb:167,139,250;
  --ew-hdr-bg:rgba(9,9,10,0.92);
  --ew-tint:rgba(255,255,255,0.04);
  --ew-tint-2:rgba(255,255,255,0.02);
  --ew-code-bg:#111114;
  --ew-code-fg:#A0A0A8;
  --ew-glow:rgba(56,189,248,0.05);
  --ew-shadow:0 32px 80px rgba(0,0,0,0.7);
  --ew-shadow-soft:0 20px 50px rgba(0,0,0,0.5);
  color-scheme:dark;
`;

/* ─── Светлая тема ─────────────────────────────────────────────
   Бренд-голубой #38BDF8 на белом не проходит по контрасту (≈1.9:1),
   поэтому в светлой теме акцент затемнён до #0284C7 (≈4.6:1).
   Текст и фон меняются местами, код остаётся тёмным — так читаемее.  */
const LIGHT = `
  --ew-bg:#FFFFFF;
  --ew-surface:#F1F6FB;
  --ew-card:#FFFFFF;
  --ew-border:rgba(15,23,42,0.12);
  --ew-border-2:rgba(2,132,199,0.35);
  --ew-accent:#0284C7;
  --ew-accent-2:#0369A1;
  --ew-accent-contrast:#FFFFFF;
  --ew-accent-rgb:2,132,199;
  --ew-text:#0F172A;
  --ew-sub:#334155;
  --ew-muted:#5B6B7F;
  --ew-muted-rgb:91,107,127;
  --ew-green:#047857;
  --ew-green-rgb:4,120,87;
  --ew-amber:#B45309;
  --ew-red:#DC2626;
  --ew-red-rgb:220,38,38;
  --ew-purple:#7C3AED;
  --ew-purple-rgb:124,58,237;
  --ew-hdr-bg:rgba(255,255,255,0.92);
  --ew-tint:rgba(15,23,42,0.035);
  --ew-tint-2:rgba(15,23,42,0.018);
  --ew-code-bg:#0F172A;
  --ew-code-fg:#CBD5E1;
  --ew-glow:rgba(2,132,199,0.10);
  --ew-shadow:0 24px 60px rgba(15,23,42,0.14);
  --ew-shadow-soft:0 16px 40px rgba(15,23,42,0.10);
  color-scheme:light;
`;

export const THEME_CSS = `
  :root{${DARK}}
  :root[data-ew-theme="light"]{${LIGHT}}
  /* плавное переключение, но без анимации у тех, кто её отключил */
  :root[data-ew-theme] body{transition:background-color .25s ease,color .25s ease}
  @media(prefers-reduced-motion:reduce){:root[data-ew-theme] body{transition:none}}
`;

/* ─── Палитра для кода ─────────────────────────────────────────
   Значения — ссылки на переменные, поэтому и CSS-строки, и инлайн-стили
   переключаются вместе с темой автоматически.                        */
export const C = {
  bg: "var(--ew-bg)",
  surface: "var(--ew-surface)",
  card: "var(--ew-card)",
  border: "var(--ew-border)",
  border2: "var(--ew-border-2)",
  accent: "var(--ew-accent)",
  accent2: "var(--ew-accent-2)",
  accentContrast: "var(--ew-accent-contrast)",
  text: "var(--ew-text)",
  sub: "var(--ew-sub)",
  muted: "var(--ew-muted)",
  green: "var(--ew-green)",
  amber: "var(--ew-amber)",
  red: "var(--ew-red)",
  purple: "var(--ew-purple)",
  tint: "var(--ew-tint)",
  tint2: "var(--ew-tint-2)",
  codeBg: "var(--ew-code-bg)",
  codeFg: "var(--ew-code-fg)",
  glow: "var(--ew-glow)",
  shadow: "var(--ew-shadow)",
};

/** Прозрачный акцент: a(0.12) → rgba(var(--ew-accent-rgb),0.12) */
export const a = (alpha: number) => `rgba(var(--ew-accent-rgb),${alpha})`;
export const green = (alpha: number) => `rgba(var(--ew-green-rgb),${alpha})`;
export const red = (alpha: number) => `rgba(var(--ew-red-rgb),${alpha})`;
export const purple = (alpha: number) => `rgba(var(--ew-purple-rgb),${alpha})`;
