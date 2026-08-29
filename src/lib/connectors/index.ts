// src/lib/connectors/index.ts
// Три коннектора: RetailCRM, Битрикс24, 1С.
//
// ВАЖНО: текущий флоу не трогается. Поллинг заказов по-прежнему живёт
// в src/lib/crm.ts и работает на переменных окружения. Здесь — только
// подключение и проверка ключа со стороны компании: «вставил → проверил →
// увидел свои поля → смапил». Перевод самого поллинга на коннекторы —
// следующий шаг, см. CONNECTORS.md.

import axios from "axios";

export type ConnectorType = "RETAILCRM" | "BITRIX24" | "ONEC" | "WEBHOOK";

export type ConnectorConfig = {
  type: ConnectorType;
  baseUrl?: string | null;
  apiKey?: string | null;
};

export type TestResult = {
  ok: boolean;
  /// Что показать пользователю: «Подключено, магазин "Банч"» или текст ошибки
  message: string;
  /// Сырой пример заказа — из него строится экран маппинга полей
  sample?: Record<string, unknown> | null;
};

export const CONNECTORS: Record<
  ConnectorType,
  {
    label: string;
    hint: string;
    urlLabel: string;
    urlPlaceholder: string;
    keyLabel: string;
    keyPlaceholder: string;
    docs: string;
  }
> = {
  RETAILCRM: {
    label: "RetailCRM",
    hint: "Ключ создаётся в CRM: Настройки → Интеграция → Ключи доступа к API. Нужны права на заказы.",
    urlLabel: "Адрес CRM",
    urlPlaceholder: "https://ваш-магазин.retailcrm.ru",
    keyLabel: "API-ключ",
    keyPlaceholder: "ключ из раздела «Ключи доступа к API»",
    docs: "https://docs.retailcrm.ru/",
  },
  BITRIX24: {
    label: "Битрикс24",
    hint: "Нужен входящий вебхук: Разработчикам → Другое → Входящий вебхук. Права — crm.",
    urlLabel: "Адрес вебхука",
    urlPlaceholder: "https://ваш-портал.bitrix24.ru/rest/1/xxxxxxxx/",
    keyLabel: "Не требуется",
    keyPlaceholder: "токен уже внутри адреса вебхука",
    docs: "https://apidocs.bitrix24.ru/",
  },
  ONEC: {
    label: "1С",
    hint: "Нужен опубликованный OData-интерфейс (HTTP-сервисы) и пользователь с правами на чтение документов.",
    urlLabel: "Адрес OData",
    urlPlaceholder: "https://1c.вашдомен.ru/base/odata/standard.odata",
    keyLabel: "Логин:пароль",
    keyPlaceholder: "user:password",
    docs: "https://its.1c.ru/",
  },
  WEBHOOK: {
    label: "Свой вебхук",
    hint: "Для самописных систем: ваша система шлёт заказы к нам POST-запросом. Ключ выдаём мы.",
    urlLabel: "Не требуется",
    urlPlaceholder: "—",
    keyLabel: "Входящий токен",
    keyPlaceholder: "сгенерируется автоматически",
    docs: "",
  },
};

const TIMEOUT = 12_000;

/** RetailCRM: дёргаем список заказов с limit=1 — самый дешёвый метод с проверкой прав. */
async function testRetailCrm(cfg: ConnectorConfig): Promise<TestResult> {
  if (!cfg.baseUrl || !cfg.apiKey) {
    return { ok: false, message: "Заполните адрес CRM и API-ключ" };
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  try {
    const res = await axios.get(`${base}/api/v5/orders`, {
      params: { apiKey: cfg.apiKey, limit: 20, page: 1 },
      timeout: TIMEOUT,
      validateStatus: () => true,
    });

    if (res.status === 403) {
      return { ok: false, message: "Ключ отклонён (403). Проверьте права ключа на заказы." };
    }
    if (res.status === 404) {
      return { ok: false, message: "Адрес не найден (404). Проверьте домен CRM." };
    }
    if (res.status >= 400) {
      const err = res.data?.errorMsg || `Ошибка ${res.status}`;
      return { ok: false, message: String(err) };
    }

    const orders = res.data?.orders ?? [];
    const total = res.data?.pagination?.totalCount ?? orders.length;
    return {
      ok: true,
      message: `Подключено. Заказов в CRM: ${total}`,
      sample: orders[0] ?? null,
    };
  } catch (e) {
    return { ok: false, message: netError(e) };
  }
}

/** Битрикс24: crm.deal.fields — не требует параметров и подтверждает права на CRM. */
async function testBitrix(cfg: ConnectorConfig): Promise<TestResult> {
  if (!cfg.baseUrl) return { ok: false, message: "Укажите адрес входящего вебхука" };
  const base = cfg.baseUrl.replace(/\/+$/, "");
  try {
    const check = await axios.get(`${base}/crm.deal.fields.json`, {
      timeout: TIMEOUT,
      validateStatus: () => true,
    });
    if (check.data?.error) {
      const d = check.data.error_description || check.data.error;
      return { ok: false, message: `Битрикс отказал: ${d}` };
    }
    if (check.status >= 400) {
      return { ok: false, message: `Ошибка ${check.status}. Проверьте адрес вебхука.` };
    }

    // Один реальный заказ — чтобы показать поля на экране маппинга
    const deal = await axios.get(`${base}/crm.deal.list.json`, {
      params: { start: 0, "order[ID]": "DESC" },
      timeout: TIMEOUT,
      validateStatus: () => true,
    });
    const first = deal.data?.result?.[0] ?? null;
    const total = deal.data?.total ?? 0;

    return {
      ok: true,
      message: `Подключено. Сделок в портале: ${total}`,
      sample: first,
    };
  } catch (e) {
    return { ok: false, message: netError(e) };
  }
}

/**
 * 1С: OData-интерфейс. Проверяем $metadata — он есть всегда,
 * если публикация настроена и пользователь имеет доступ.
 * Ключ передаётся как "логин:пароль" и уходит в Basic-авторизацию.
 */
async function testOneC(cfg: ConnectorConfig): Promise<TestResult> {
  if (!cfg.baseUrl) return { ok: false, message: "Укажите адрес OData-интерфейса" };
  if (!cfg.apiKey || !cfg.apiKey.includes(":")) {
    return { ok: false, message: "Укажите доступ в формате логин:пароль" };
  }
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const [login, ...rest] = cfg.apiKey.split(":");
  const password = rest.join(":");
  const auth = { username: login, password };

  try {
    const meta = await axios.get(`${base}/$metadata`, {
      auth,
      timeout: TIMEOUT,
      validateStatus: () => true,
      responseType: "text",
    });

    if (meta.status === 401) {
      return { ok: false, message: "Неверный логин или пароль (401)" };
    }
    if (meta.status === 403) {
      return { ok: false, message: "Доступ запрещён (403). Проверьте права пользователя в 1С." };
    }
    if (meta.status === 404) {
      return {
        ok: false,
        message: "OData не найден (404). Проверьте, что интерфейс OData опубликован на веб-сервере.",
      };
    }
    if (meta.status >= 400) {
      return { ok: false, message: `Ошибка ${meta.status}` };
    }

    // Сколько сущностей отдаёт база — грубая, но понятная проверка
    const text = typeof meta.data === "string" ? meta.data : "";
    const entities = (text.match(/EntitySet Name="/g) || []).length;

    return {
      ok: true,
      message: entities
        ? `Подключено. Доступно объектов: ${entities}`
        : "Подключено. OData отвечает.",
      sample: null, // документ-образец выбирается на следующем шаге — какой именно объект тянуть
    };
  } catch (e) {
    return { ok: false, message: netError(e) };
  }
}

/** Свой вебхук: проверять нечего — ждём первый входящий запрос. */
async function testWebhook(): Promise<TestResult> {
  return {
    ok: true,
    message: "Токен готов. Пришлите первый тестовый заказ на наш адрес — покажем, что получили.",
  };
}

export async function testConnector(cfg: ConnectorConfig): Promise<TestResult> {
  switch (cfg.type) {
    case "RETAILCRM": return testRetailCrm(cfg);
    case "BITRIX24":  return testBitrix(cfg);
    case "ONEC":      return testOneC(cfg);
    case "WEBHOOK":   return testWebhook();
    default:          return { ok: false, message: "Неизвестный тип подключения" };
  }
}

function netError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err.code === "ECONNABORTED") return "Сервер не ответил за 12 секунд";
  if (err.code === "ENOTFOUND") return "Адрес не найден — проверьте домен";
  if (err.code === "ECONNREFUSED") return "Соединение отклонено — сервер недоступен";
  if (err.code === "CERT_HAS_EXPIRED") return "У сервера просрочен SSL-сертификат";
  return err.message || "Не удалось соединиться";
}
