// src/lib/maps.ts
// Загрузка Яндекс.Карт 3.0 в одном месте.
//
// Почему отдельный файл, а не пара строк в компоненте:
//
// 1. Скрипт должен грузиться ОДИН раз на приложение. Если две страницы
//    вставят свой <script>, ymaps3 инициализируется дважды и вторая карта
//    молча не поднимется. Здесь загрузка мемоизирована промисом.
// 2. Ключ у 3.0 отдельный (см. ниже), и держать его выбор в одном месте
//    проще, чем искать по компонентам.
// 3. Элементы управления в 3.0 лежат НЕ в ядре — их надо подгружать
//    отдельно. Это и была причина, по которой карта не открывалась.

/**
 * Ключ для 3.0.
 *
 * У версии 3.0 обязательно должно быть заполнено «Ограничение по HTTP Referer»
 * в кабинете разработчика — без него API отказывает. У ключей, выпущенных
 * когда-то под 2.1, это поле обычно пустое, поэтому проще завести отдельный.
 *
 * Если NEXT_PUBLIC_YANDEX_MAPS_V3_KEY не задан, падаем на старый ключ:
 * так дашборд на 2.1 продолжит работать, даже если новый ключ ещё не завели.
 */
export const MAPS_V3_KEY =
  process.env.NEXT_PUBLIC_YANDEX_MAPS_V3_KEY ||
  process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ||
  "";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ymaps3 = any;

declare global {
  interface Window { ymaps3?: Ymaps3 }
}

let loader: Promise<Ymaps3> | null = null;

/** Загружает скрипт 3.0 и дожидается готовности. Повторные вызовы бесплатны. */
export function loadYmaps3(): Promise<Ymaps3> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Карта доступна только в браузере"));
  }
  if (loader) return loader;

  loader = new Promise<Ymaps3>((resolve, reject) => {
    if (!MAPS_V3_KEY) {
      reject(new Error("Не задан ключ карт: NEXT_PUBLIC_YANDEX_MAPS_V3_KEY"));
      return;
    }

    const done = async () => {
      try {
        await window.ymaps3!.ready;
        resolve(window.ymaps3);
      } catch (e) {
        reject(e);
      }
    };

    if (window.ymaps3) { done(); return; }

    // Скрипт мог быть добавлен другим компонентом раньше
    const existing = document.querySelector<HTMLScriptElement>('script[data-ymaps3="1"]');
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("Скрипт карт не загрузился")));
      return;
    }

    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/v3/?apikey=${MAPS_V3_KEY}&lang=ru_RU`;
    s.async = true;
    s.dataset.ymaps3 = "1";
    s.onload = done;
    s.onerror = () => reject(new Error("Скрипт карт не загрузился"));
    document.head.appendChild(s);
  });

  // Неудачную попытку не кешируем: при следующем заходе попробуем снова
  loader.catch(() => { loader = null; });

  return loader;
}

/**
 * Кнопки зума и геолокации.
 *
 * ВАЖНО: в 3.0 их нет в ядре — они живут в отдельном пакете, который
 * подгружается через ymaps3.import. Именно на этом карта и падала:
 * деструктуризация из window.ymaps3 давала undefined, а `new undefined()`
 * бросал TypeError ещё до появления карты на экране.
 *
 * Возвращает null, если пакет недоступен — карта без кнопок работает,
 * жесты зума и так есть.
 */
export async function loadMapControls(ymaps3: Ymaps3) {
  try {
    const ui = await ymaps3.import("@yandex/ymaps3-default-ui-theme");
    return {
      YMapZoomControl: ui.YMapZoomControl,
      YMapGeolocationControl: ui.YMapGeolocationControl,
    };
  } catch (e) {
    console.warn("[Карта] пакет элементов управления не загрузился", e);
    return null;
  }
}

/** В 3.0 координаты идут [долгота, широта] — обратный порядок к 2.1. */
export function toLngLat(lat: number, lng: number): [number, number] {
  return [lng, lat];
}