// src/lib/upload-photo.ts
// Загрузка фото доставки: сжатие + повторы.
//
// Курьер снимает на улице, часто на одной палке сети. Разовый запрос
// в таких условиях падает регулярно, а фото — единственное доказательство
// доставки, терять его нельзя.

type Progress = (stage: "compress" | "sign" | "upload" | "save" | "retry", attempt?: number) => void;

const RETRIES = 3;
const BASE_DELAY = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Повтор с нарастающей паузой.
 * Ошибки 4xx не повторяем: если сервер сказал «неверный запрос»,
 * тот же запрос через секунду тоже будет неверным — только время потеряем.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number) => void
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { status?: number })?.status;
      if (status && status >= 400 && status < 500 && status !== 429) throw e;
      if (attempt === RETRIES) break;
      onRetry?.(attempt);
      await sleep(BASE_DELAY * 2 ** (attempt - 1) + Math.random() * 300);
    }
  }
  throw last;
}

function httpError(res: Response, message: string) {
  const err = new Error(`${message} (${res.status})`) as Error & { status: number };
  err.status = res.status;
  return err;
}

/** Сжатие. Если библиотека упала — отдаём исходник, лучше тяжёлое фото, чем никакого. */
async function compress(file: File): Promise<File> {
  try {
    const imageCompression = (await import("browser-image-compression")).default;
    const out = await imageCompression(file, {
      // 0.6 МБ вместо 1: на мобильной сети это разница между
      // «загрузилось» и «отвалилось по таймауту»
      maxSizeMB: 0.6,
      maxWidthOrHeight: 1600,
      initialQuality: 0.8,
      useWebWorker: true,   // не морозит интерфейс на слабых телефонах
      fileType: "image/jpeg",
    });
    // Иногда сжатие даёт файл больше исходного (уже сжатый JPEG)
    return out.size < file.size ? (out as File) : file;
  } catch (e) {
    console.warn("[upload] сжатие не удалось, отправляем как есть", e);
    return file;
  }
}

export type UploadResult = { fileUrl: string; bytes: number; originalBytes: number };

export async function uploadOrderPhoto(
  orderId: string,
  file: File,
  onProgress?: Progress
): Promise<UploadResult> {
  onProgress?.("compress");
  const prepared = await compress(file);
  const contentType = prepared.type || "image/jpeg";

  // 1. Подписанная ссылка
  onProgress?.("sign");
  const { uploadUrl, fileUrl } = await withRetry(
    async () => {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `photo_${orderId}.jpg`, contentType }),
      });
      if (!res.ok) throw httpError(res, "Не удалось получить ссылку от сервера");
      return res.json();
    },
    (a) => onProgress?.("retry", a)
  );

  // 2. Загрузка в хранилище
  onProgress?.("upload");
  await withRetry(
    async () => {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: prepared,
      });
      if (!res.ok) throw httpError(res, "Не удалось загрузить файл в хранилище");
      return true;
    },
    (a) => onProgress?.("retry", a)
  );

  // 3. Привязка к заказу
  onProgress?.("save");
  await withRetry(
    async () => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: fileUrl }),
      });
      if (!res.ok) throw httpError(res, "Не удалось привязать фото к заказу");
      return true;
    },
    (a) => onProgress?.("retry", a)
  );

  return { fileUrl, bytes: prepared.size, originalBytes: file.size };
}
