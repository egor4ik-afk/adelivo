// src/lib/maps.ts

export const MAPS_V3_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_V3_KEY;

// Ключ для маршрутов, который будет использоваться при серверных / прямых HTTP запросах
export const ROUTER_KEY = process.env.NEXT_PUBLIC_YANDEX_ROUTER_KEY;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ymaps3 = any;

declare global {
  interface Window { ymaps3?: Ymaps3 }
}

let loader: Promise<Ymaps3> | null = null;

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

        try {
          window.ymaps3!.import?.registerCdn?.(
            "https://cdn.jsdelivr.net/npm/{package}",
            ["@yandex/ymaps3-controls@0.0.1", "@yandex/ymaps3-default-ui-theme@0.0"]
          );
        } catch { /* необязательно */ }
        resolve(window.ymaps3);
      } catch (e) {
        reject(e);
      }
    };

    if (window.ymaps3) { done(); return; }

    const existing = document.querySelector<HTMLScriptElement>('script[data-ymaps3="1"]');
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("Скрипт карт не загрузился")));
      return;
    }

    // Оставляем только ключ карты. router_apikey Яндексом здесь больше не принимается!
    const params = new URLSearchParams({ apikey: MAPS_V3_KEY, lang: "ru_RU" });

    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/v3/?${params.toString()}`;
    s.async = true;
    s.dataset.ymaps3 = "1";
    s.onload = done;
    s.onerror = () => reject(new Error("Скрипт карт не загрузился"));
    document.head.appendChild(s);
  });

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
  // Пакетов два, и в разных сборках API доступен то один, то другой:
  // ymaps3-controls — старый и лёгкий, default-ui-theme — новый с темами.
  // Пробуем по очереди, чтобы не зависеть от версии скрипта.
  const packages = ["@yandex/ymaps3-controls@0.0.1", "@yandex/ymaps3-default-ui-theme"];

  for (const pkg of packages) {
    try {
      const ui = await ymaps3.import(pkg);
      if (ui?.YMapZoomControl) {
        return {
          YMapZoomControl: ui.YMapZoomControl,
          YMapGeolocationControl: ui.YMapGeolocationControl,
        };
      }
    } catch {
      // пробуем следующий
    }
  }

  console.warn("[Карта] элементы управления недоступны — работаем без кнопок");
  return null;
}

/** Метры и секунды от роутера — в человеческий вид. */
export function formatDistance(meters?: number | null): string {
  if (!meters && meters !== 0) return "—";
  return meters < 1000 ? `${Math.round(meters)} м` : `${(meters / 1000).toFixed(1)} км`;
}

export function formatDuration(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин`;
}

/** В 3.0 координаты идут [долгота, широта] — обратный порядок к 2.1. */
export function toLngLat(lat: number, lng: number): [number, number] {
  return [lng, lat];
}