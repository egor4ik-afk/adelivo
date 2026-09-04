// src/lib/file-url.ts
// Один адрес для загруженных файлов.
//
// Ссылки собирались через домен cdn.relaxdev.ru. Для человека в браузере
// это работало, а Telegram по такой ссылке картинку не подтягивал: превью
// не строилось, и в чат приходил голый текст со ссылкой. Реальное
// хранилище — Object Storage Яндекса, и его адрес отдаётся всем без
// посредника.

/** Публичный хост Object Storage. Тот же, что endpoint в /api/upload. */
export const STORAGE_ORIGIN = "https://storage.yandexcloud.net";

/** Домен, через который ссылки собирались раньше. */
const LEGACY_CDN_HOST = "cdn.relaxdev.ru";

/** Публичная ссылка на объект в бакете. */
export function publicFileUrl(bucket: string, key: string): string {
  return `${STORAGE_ORIGIN}/${bucket}/${key.replace(/^\/+/, "")}`;
}

/**
 * Приводит старую ссылку к рабочему виду.
 *
 * В базе уже лежат фото заказов и вложения чата с адресом cdn.relaxdev.ru —
 * переписывать их миграцией не нужно, достаточно подменять хост в момент
 * использования. Ссылки, которые и так ведут в хранилище, возвращаются как есть.
 */
export function toStorageUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== LEGACY_CDN_HOST) return url;
    return publicFileUrl(bucket, u.pathname);
  } catch {
    // Не URL вовсе — вернём как пришло, пусть разбирается вызывающий
    return url;
  }
}

/** Ключ объекта из ссылки любого из двух видов: и старой, и новой. */
export function storageKeyOf(url: string, bucket: string): string {
  const path = new URL(url).pathname.replace(/^\/+/, "");
  // У ссылки в хранилище первым сегментом идёт имя бакета, у старой — нет
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
}