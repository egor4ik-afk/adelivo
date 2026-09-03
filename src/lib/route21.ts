// src/lib/route21.ts
// Расчёт маршрута через JS API 2.1.
//
// Почему так, а не ymaps3.route:
// в 3.0 маршрутизация — отдельная платная услуга («API Получения деталей
// маршрута»), и ключ карты её не покрывает — Яндекс отвечает
// «Route requests is not allowed». В 2.1 маршрутизатор входит в JS API
// и работает обычным ключом карты, тем самым, что уже используется
// в дашборде.
//
// Поэтому считаем геометрию и время в 2.1, а рисуем на карте 3.0.
// Пользователь этого не замечает, зато не нужен платный тариф.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ymaps = any;

let loader21: Promise<Ymaps> | null = null;

/** Подгружает 2.1 ради математики. Скрипт может быть уже загружен саджестом. */
export function loadYmaps21(): Promise<Ymaps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Только в браузере"));
  }
  if (loader21) return loader21;

  loader21 = new Promise<Ymaps>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const ready = () => w.ymaps.ready(() => resolve(w.ymaps));

    if (w.ymaps?.ready) { ready(); return; }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="api-maps.yandex.ru/2.1"]'
    );
    if (existing) {
      // Скрипт уже вставлен саджестом или дашбордом — просто дожидаемся
      const t = setInterval(() => {
        if (w.ymaps?.ready) { clearInterval(t); ready(); }
      }, 150);
      setTimeout(() => { clearInterval(t); reject(new Error("2.1 не поднялся")); }, 10_000);
      return;
    }

    const key = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY || "";
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${key}`;
    s.async = true;
    s.onload = ready;
    s.onerror = () => reject(new Error("Скрипт 2.1 не загрузился"));
    document.head.appendChild(s);
  });

  loader21.catch(() => { loader21 = null; });
  return loader21;
}

export type RouteResult = {
  /** Координаты линии в порядке 3.0: [долгота, широта] */
  coordinates: [number, number][];
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
};

const fmtDistance = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)} км` : `${Math.round(m)} м`;

const fmtDuration = (s: number) => {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} мин`;
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
};

/**
 * Считает маршрут между двумя точками.
 * Вход — [широта, долгота], как принято в 2.1 и во всём остальном коде.
 *
 * Два разных способа под два режима — намеренно:
 *
 *   auto — ymaps.route(). Проверенный путь: отдаёт и время, и геометрию,
 *          линия на карте рисуется.
 *   mt   — multiRouter.MultiRoute. ymaps.route() общественный транспорт
 *          не умеет вообще: он молча сваливался в автомобильный, поэтому
 *          при переключении режима время не менялось. Транспорт живёт
 *          только в MultiRoute — им же считает дашборд.
 *
 * Геометрия у транспортного маршрута может не прийти, и это нормально:
 * возвращаем пустой coordinates, вызывающий просто не рисует линию.
 * Время и расстояние важнее линии.
 */
export async function buildRoute21(
  from: [number, number],
  to: [number, number],
  mode: "auto" | "mt"
): Promise<RouteResult | null> {
  const ymaps = await loadYmaps21();

  if (mode === "auto") {
    const route = await ymaps.route([from, to], { routingMode: "auto" });

    const distanceMeters: number = route.getLength();
    const durationSeconds: number = route.getTime();

    // Геометрия лежит по частям маршрута; собираем в одну линию
    const coordinates: [number, number][] = [];
    route.getPaths().each((path: { geometry: { getCoordinates: () => number[][] } }) => {
      for (const c of path.geometry.getCoordinates()) {
        // 2.1 отдаёт [широта, долгота], карте 3.0 нужно наоборот
        coordinates.push([c[1], c[0]]);
      }
    });

    if (coordinates.length === 0) return null;

    return {
      coordinates,
      distanceMeters,
      durationSeconds,
      distanceText: fmtDistance(distanceMeters),
      durationText: fmtDuration(durationSeconds),
    };
  }

  // ── Общественный транспорт ────────────────────────────────────────────
  return new Promise<RouteResult | null>((resolve, reject) => {
    const multiRoute = new ymaps.multiRouter.MultiRoute(
      {
        referencePoints: [from, to],
        params: { routingMode: "masstransit", results: 1 },
      },
      // На карту объект не добавляется, он нужен только как калькулятор
      { boundsAutoApply: false }
    );

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      try { multiRoute.destroy(); } catch { /* уже уничтожен */ }
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error("маршрутизатор не ответил"))),
      15_000
    );

    multiRoute.model.events.add("requestsuccess", () => {
      const active = multiRoute.getActiveRoute();
      if (!active) { finish(() => resolve(null)); return; }

      const duration = active.properties.get("duration");
      const distance = active.properties.get("distance");

      const distanceMeters: number = distance?.value ?? 0;
      const durationSeconds: number = duration?.value ?? 0;

      // Геометрии у транспортного маршрута может не быть — не страшно
      const coordinates: [number, number][] = [];
      try {
        active.getPaths().each((path: { geometry?: { getCoordinates?: () => number[][] } }) => {
          for (const c of path.geometry?.getCoordinates?.() ?? []) {
            coordinates.push([c[1], c[0]]);
          }
        });
      } catch { /* линии не будет, время и расстояние остаются */ }

      finish(() =>
        resolve({
          coordinates,
          distanceMeters,
          durationSeconds,
          distanceText: distance?.text ?? fmtDistance(distanceMeters),
          durationText: duration?.text ?? fmtDuration(durationSeconds),
        })
      );
    });

    multiRoute.model.events.add("requestfail", () =>
      finish(() => reject(new Error("маршрут не построен")))
    );
  });
}