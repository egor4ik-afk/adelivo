// src/lib/connectors/bitrix24.ts
import axios from "axios";
import type { ConnectorCreds, DeliveryConnector, NormalizedOrder } from "./types";
import { normalizeByMap } from "./types";

const TIMEOUT = 15_000;

/**
 * Битрикс24 через входящий вебхук. Токен уже внутри baseUrl,
 * поэтому apiKey здесь не используется.
 *
 * Поля адреса и интервала у каждого портала свои (UF_CRM_*), поэтому
 * без карты полей коннектор работать не может — она задаётся в кабинете.
 * Значения по умолчанию покрывают типовую сделку.
 */
const DEFAULT_MAP: Record<string, string> = {
  externalId: "ID",
  price: "OPPORTUNITY",
  comment: "COMMENTS",
  customerName: "TITLE",
  externalStatus: "STAGE_ID",
  createdAt: "DATE_CREATE",
};

export const bitrixConnector: DeliveryConnector = {
  type: "BITRIX24",

  async fetchOrders(creds, sinceDays) {
    if (!creds.baseUrl) return [];
    const base = creds.baseUrl.replace(/\/+$/, "");
    const since = new Date(Date.now() - sinceDays * 24 * 3_600_000).toISOString();

    const out: NormalizedOrder[] = [];
    let start = 0;

    // Битрикс отдаёт по 50 записей и просит start для следующей страницы
    for (let page = 0; page < 10; page++) {
      const res = await axios.get(`${base}/crm.deal.list.json`, {
        params: {
          start,
          "filter[>=DATE_CREATE]": since,
          "order[ID]": "DESC",
          "select[]": "*",
        },
        timeout: TIMEOUT,
        validateStatus: () => true,
      });

      if (res.data?.error) {
        throw new Error(`Битрикс: ${res.data.error_description || res.data.error}`);
      }

      const deals: unknown[] = res.data?.result ?? [];
      const map = { ...DEFAULT_MAP, ...(creds.fieldMap ?? {}) };
      out.push(...deals.map((d) => normalizeByMap(d, map)));

      if (res.data?.next === undefined) break;
      start = res.data.next;
    }

    return out.filter((o) => o.externalId);
  },

  async pushStatus(creds, externalId, patch) {
    if (!creds.baseUrl || !patch.status) return;
    const base = creds.baseUrl.replace(/\/+$/, "");
    await axios.post(
      `${base}/crm.deal.update.json`,
      { id: externalId, fields: { STAGE_ID: patch.status } },
      { timeout: TIMEOUT }
    );
  },
};
