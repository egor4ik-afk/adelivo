// src/lib/connectors/catalog.ts
// Справочник типов подключений: чистые данные, без axios, prisma и Node-модулей.
//
// Вынесено из index.ts специально. Раньше CompanyClient (клиентский компонент)
// импортировал CONNECTORS из бочки @/lib/connectors, а та реэкспортирует poll.ts,
// который тянет за собой lib/crm → notifications → mailer → nodemailer.
// В клиентском бандле nodemailer тянет net/tls/fs — и сборка падала.

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