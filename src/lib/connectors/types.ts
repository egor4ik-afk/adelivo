// src/lib/connectors/types.ts
// Общий контракт для всех источников заказов.
//
// Идея разделения: транспорт (как достать заказы) и маппинг (как их понять)
// становятся сменными, а доменная логика — геокодинг, зоны, расчёт себестоимости,
// запись в базу, уведомления — остаётся одна на всех и живёт в lib/crm.ts.

export type ConnectorType = "RETAILCRM" | "BITRIX24" | "ONEC" | "WEBHOOK";

/** Заказ, приведённый к нашему виду. С этим работает вся система дальше. */
export type NormalizedOrder = {
  /** Идентификатор в системе источника */
  externalId: string;
  address: string | null;
  /** Текст интервала как есть: «с 10:00 до 14:00», «10-14», «утро» */
  slotRaw: string | null;
  deliveryDate: string | null;
  price: number | null;
  items: string | null;
  comment: string | null;
  customerName: string | null;
  customerPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  /** Статус на стороне источника — прогоняется через statusMap */
  externalStatus: string | null;
  createdAt: Date | null;
  /** Сырой объект — пригодится для отладки и экрана маппинга */
  raw?: unknown;
};

export type ConnectorCreds = {
  type: ConnectorType;
  baseUrl: string | null;
  apiKey: string | null;
  /** Соответствие полей источника нашим: { "address": "delivery.address.text" } */
  fieldMap: Record<string, string> | null;
  /** Соответствие статусов: { "assembling-complete": "ASSEMBLING" } */
  statusMap: Record<string, string> | null;
  /** Для RetailCRM: коды сайтов, которые тянем этим ключом */
  sites?: string[];
};

export interface DeliveryConnector {
  type: ConnectorType;

  /** Забрать заказы, созданные за последние N дней. */
  fetchOrders(creds: ConnectorCreds, sinceDays: number): Promise<NormalizedOrder[]>;

  /**
   * Забрать конкретные заказы по идентификаторам.
   * Нужно, чтобы понимать, какие заказы удалили в источнике:
   * запросили 50 — вернулось 48, значит два пропали.
   */
  fetchByIds?(creds: ConnectorCreds, ids: string[]): Promise<NormalizedOrder[]>;

  /** Отдать статус и курьера обратно в источник. */
  pushStatus?(
    creds: ConnectorCreds,
    externalId: string,
    patch: { status?: string; courierName?: string; courierPhone?: string; deliveryPrice?: number }
  ): Promise<void>;
}

/** Достаёт значение по пути "delivery.address.text" из произвольного объекта. */
export function pick(obj: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) {
      const idx = Number(key);
      return Number.isNaN(idx) ? undefined : acc[idx];
    }
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Собирает NormalizedOrder из произвольного объекта по карте полей.
 * Используется для Битрикса, 1С и своих вебхуков — везде, где структура
 * заранее не известна и настраивается пользователем.
 */
export function normalizeByMap(raw: unknown, map: Record<string, string> | null): NormalizedOrder {
  const m = map ?? {};
  const created = pick(raw, m.createdAt);
  return {
    externalId: str(pick(raw, m.externalId ?? "id")) ?? "",
    address: str(pick(raw, m.address)),
    slotRaw: str(pick(raw, m.slotRaw)),
    deliveryDate: str(pick(raw, m.deliveryDate)),
    price: num(pick(raw, m.price)),
    items: str(pick(raw, m.items)),
    comment: str(pick(raw, m.comment)),
    customerName: str(pick(raw, m.customerName)),
    customerPhone: str(pick(raw, m.customerPhone)),
    recipientName: str(pick(raw, m.recipientName)),
    recipientPhone: str(pick(raw, m.recipientPhone)),
    externalStatus: str(pick(raw, m.externalStatus)),
    createdAt: created ? new Date(String(created)) : null,
    raw,
  };
}
