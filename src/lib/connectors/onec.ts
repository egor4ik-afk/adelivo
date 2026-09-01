// src/lib/connectors/onec.ts
import axios from "axios";
import type { ConnectorCreds, DeliveryConnector, NormalizedOrder } from "./types";
import { normalizeByMap } from "./types";

const TIMEOUT = 20_000;

/**
 * 1С через опубликованный OData-интерфейс.
 *
 * apiKey хранится в виде "логин:пароль" и уходит в Basic-авторизацию.
 * Имя объекта задаётся в карте полей ключом `entity` — в разных конфигурациях
 * заказ называется по-разному:
 *   УТ:   Document_ЗаказКлиента
 *   УНФ:  Document_ЗаказПокупателя
 *   Розница: Document_ЗаказПокупателя
 * Дата в OData фильтруется без кавычек и в формате yyyy-MM-ddTHH:mm:ss.
 */
const DEFAULT_ENTITY = "Document_ЗаказКлиента";

const DEFAULT_MAP: Record<string, string> = {
  externalId: "Ref_Key",
  price: "СуммаДокумента",
  comment: "Комментарий",
  createdAt: "Date",
  externalStatus: "Статус",
};

function auth(creds: ConnectorCreds) {
  const [username, ...rest] = (creds.apiKey ?? "").split(":");
  return { username, password: rest.join(":") };
}

export const onecConnector: DeliveryConnector = {
  type: "ONEC",

  async fetchOrders(creds, sinceDays) {
    if (!creds.baseUrl || !creds.apiKey?.includes(":")) return [];
    const base = creds.baseUrl.replace(/\/+$/, "");
    const map = { ...DEFAULT_MAP, ...(creds.fieldMap ?? {}) };
    const entity = (creds.fieldMap?.entity) || DEFAULT_ENTITY;

    const since = new Date(Date.now() - sinceDays * 24 * 3_600_000)
      .toISOString()
      .replace(/\.\d+Z$/, "");

    const res = await axios.get(`${base}/${entity}`, {
      params: {
        $format: "json",
        $filter: `Date ge datetime'${since}'`,
        $top: 200,
      },
      auth: auth(creds),
      timeout: TIMEOUT,
      validateStatus: () => true,
    });

    if (res.status === 401) throw new Error("1С: неверный логин или пароль");
    if (res.status === 404) throw new Error(`1С: объект ${entity} не найден — проверьте имя документа`);
    if (res.status >= 400) throw new Error(`1С: ошибка ${res.status}`);

    const rows: unknown[] = res.data?.value ?? [];
    return rows.map((r) => normalizeByMap(r, map)).filter((o: NormalizedOrder) => o.externalId);
  },

  async pushStatus(creds, externalId, patch) {
    if (!creds.baseUrl || !patch.status) return;
    const base = creds.baseUrl.replace(/\/+$/, "");
    const entity = (creds.fieldMap?.entity) || DEFAULT_ENTITY;
    const statusField = creds.fieldMap?.externalStatus || "Статус";

    // OData требует PATCH по ключу записи в скобках с кавычками
    await axios.patch(
      `${base}/${entity}(guid'${externalId}')?$format=json`,
      { [statusField]: patch.status },
      { auth: auth(creds), timeout: TIMEOUT }
    );
  },
};
