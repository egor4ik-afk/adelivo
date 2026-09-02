// src/lib/order-parse.ts
// Разбор свободного текста заказа в поля формы.
//
// Используется и формой создания заказа, и приёмом сообщений из Telegram.
//
// Двухслойная схема: сначала регулярки, потом AI поверх них.
// Регулярки надёжны на телефонах, датах и времени — там строгий формат.
// AI нужен для того, что формализовать нельзя: где адрес, где имя получателя,
// а где заказчика, и что из этого состав заказа.
//
// Порядок важен: если AI недоступен или вернул мусор, форма всё равно
// получит телефон, дату и слот — а это половина полей.

import { callAI, hasAIKey } from "./ai";

export type ParsedOrder = {
  externalId: string | null;
  address: string | null;
  deliveryDate: string | null;   // YYYY-MM-DD
  slotFrom: string | null;       // HH:MM
  slotTo: string | null;
  name: string | null;           // получатель
  recipientPhone: string | null;
  customerName: string | null;   // заказчик
  customerPhone: string | null;
  items: string | null;
  comment: string | null;
  price: number | null;
};

const EMPTY: ParsedOrder = {
  externalId: null, address: null, deliveryDate: null, slotFrom: null, slotTo: null,
  name: null, recipientPhone: null, customerName: null, customerPhone: null,
  items: null, comment: null, price: null,
};

/* ── Слой 1: регулярки ─────────────────────────────────────── */

function normPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const x = d.length === 11 && d.startsWith("8") ? "7" + d.slice(1) : d;
  return x.length === 10 ? "+7" + x : "+" + x;
}

/** Все телефоны в тексте, в порядке появления. */
function findPhones(text: string): string[] {
  const re = /(?:\+7|8|7)[\s\-(]*\d{3}[\s\-)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/g;
  return [...new Set((text.match(re) || []).map(normPhone))];
}

const MONTHS: Record<string, number> = {
  январ: 1, феврал: 2, март: 3, апрел: 4, ма: 5, июн: 6,
  июл: 7, август: 8, сентябр: 9, октябр: 10, ноябр: 11, декабр: 12,
};

/** «12.03», «12 марта», «завтра», «сегодня» → YYYY-MM-DD */
function findDate(text: string): string | null {
  const now = new Date();
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  if (/\bсегодня\b/i.test(text)) return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
  if (/\bзавтра\b/i.test(text)) {
    const t = new Date(now.getTime() + 86_400_000);
    return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  const numeric = text.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    let y = numeric[3] ? Number(numeric[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    if (d <= 31 && m <= 12) return iso(y, m, d);
  }

  const verbal = text.match(/\b(\d{1,2})\s+([а-яё]{3,})/i);
  if (verbal) {
    const d = Number(verbal[1]);
    const word = verbal[2].toLowerCase();
    const key = Object.keys(MONTHS).find((k) => word.startsWith(k));
    if (key && d <= 31) return iso(now.getFullYear(), MONTHS[key], d);
  }

  return null;
}

/** «с 14 до 18», «14:00-18:00», «14-18» → { from, to } */
function findSlot(text: string): { from: string | null; to: string | null } {
  const pad = (h: string, m?: string) => `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;

  const full = text.match(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/);
  if (full) return { from: pad(full[1], full[2]), to: pad(full[3], full[4]) };

  const words = text.match(/\bс\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:до|по)\s*(\d{1,2})(?:[:.](\d{2}))?/i);
  if (words) return { from: pad(words[1], words[2]), to: pad(words[3], words[4]) };

  const short = text.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b(?!\s*[.\-/]\d)/);
  if (short && Number(short[1]) < 24 && Number(short[2]) <= 24) {
    return { from: pad(short[1]), to: pad(short[2]) };
  }

  return { from: null, to: null };
}

function findPrice(text: string): number | null {
  const m = text.match(/(\d[\d\s]{2,})\s*(?:₽|руб|р\.)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseByRules(text: string): ParsedOrder {
  const phones = findPhones(text);
  const slot = findSlot(text);
  return {
    ...EMPTY,
    deliveryDate: findDate(text),
    slotFrom: slot.from,
    slotTo: slot.to,
    price: findPrice(text),
    // Первый телефон в тексте почти всегда получателя — заказчик
    // указывает его после адреса. Второй, если есть, считаем заказчиком.
    recipientPhone: phones[0] ?? null,
    customerPhone: phones[1] ?? null,
  };
}

/* ── Слой 2: AI ────────────────────────────────────────────── */

const SYSTEM = `Ты разбираешь заявки на доставку цветов и подарков из мессенджеров.
На вход — сообщение в свободной форме. Верни ТОЛЬКО JSON, без markdown и пояснений.

Поля:
  externalId     — номер заказа, если указан явно (иначе null)
  address        — адрес доставки одной строкой, без квартиры/домофона/подъезда
  comment        — квартира, подъезд, домофон, этаж, пожелания по времени, «сюрприз»
  name           — имя ПОЛУЧАТЕЛЯ (кому везём)
  recipientPhone — телефон получателя
  customerName   — имя ЗАКАЗЧИКА (кто заказал), если отличается
  customerPhone  — телефон заказчика
  items          — состав заказа: букет, состав, открытка, шары
  deliveryDate   — дата в формате YYYY-MM-DD
  slotFrom       — начало интервала HH:MM
  slotTo         — конец интервала HH:MM
  price          — сумма числом, без валюты

Правила:
- Чего в тексте нет — ставь null. Не выдумывай и не подставляй примеры.
- Квартиру, подъезд и домофон в address НЕ включай, они идут в comment.
- Если явно указан только один человек — это получатель, заказчика оставь null.
- Год не указан — считай ближайший будущий.`;

function safeJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s !== "null" ? s : null;
};

export async function parseOrderText(text: string): Promise<{
  parsed: ParsedOrder;
  source: "ai" | "rules";
  warning?: string;
}> {
  const rules = parseByRules(text);

  if (!hasAIKey()) {
    return {
      parsed: rules,
      source: "rules",
      warning: "Ключ OPENCODE_ZEN_API_KEY не задан — разобрано только по шаблонам",
    };
  }

  try {
    const raw = await callAI(SYSTEM, text.slice(0, 4000), { maxTokens: 1200, temperature: 0 });
    const data = safeJson(raw);
    if (!data) return { parsed: rules, source: "rules", warning: "AI вернул неразбираемый ответ" };

    const price = Number(data.price);

    // Регулярки идут первыми там, где они точнее AI: телефон, дата, время.
    // Модель эти поля тоже возвращает, но иногда «нормализует» так,
    // что 8-900 превращается в +7-900 с потерянной цифрой.
    return {
      parsed: {
        externalId: str(data.externalId),
        address: str(data.address),
        comment: str(data.comment),
        name: str(data.name),
        customerName: str(data.customerName),
        items: str(data.items),
        recipientPhone: rules.recipientPhone ?? (str(data.recipientPhone) ? normPhone(String(data.recipientPhone)) : null),
        customerPhone: rules.customerPhone ?? (str(data.customerPhone) ? normPhone(String(data.customerPhone)) : null),
        deliveryDate: rules.deliveryDate ?? str(data.deliveryDate),
        slotFrom: rules.slotFrom ?? str(data.slotFrom),
        slotTo: rules.slotTo ?? str(data.slotTo),
        price: rules.price ?? (Number.isFinite(price) ? price : null),
      },
      source: "ai",
    };
  } catch (e) {
    console.error("[order-parse] AI недоступен:", e);
    return {
      parsed: rules,
      source: "rules",
      warning: e instanceof Error ? `AI недоступен: ${e.message}` : "AI недоступен",
    };
  }
}
