// src/lib/cities.ts
// Города, в которых работают магазины.
//
// Город влияет на две вещи:
//   1. центр и зум карты при первом открытии;
//   2. приоритет при распознавании адреса — без него геокодер на «Ленина 42»
//      вернёт Ленина в Москве, даже если магазин в Новосибирске.
//
// Зоны доставки, тарифы и проверка «вне зоны» есть ТОЛЬКО у Москвы: там
// нарисован zones.kml и посчитаны цены. Для остальных городов никаких
// расчётов не делаем — геокодим адрес и показываем точку на карте, всё.
// Заказ в Тбилиси не должен помечаться проблемным только потому, что он
// в 2000 км от Кремля.

export type City = {
  code: string;
  name: string;
  /** [широта, долгота] — порядок 2.1 и всего остального кода */
  center: [number, number];
  /** Рамка приоритета для геокодера: [юго-запад, северо-восток] */
  bbox: [[number, number], [number, number]];
  /** Стартовый зум карты. Для агломераций меньше, для компактных городов больше. */
  zoom: number;
  /**
   * Есть ли для города зоны доставки, тарифы и проверка удалённости.
   * true только у Москвы. Для остальных городов geocodeNewOrders
   * не считает ни цену, ни расстояние и не помечает заказы «вне зоны».
   */
  hasZones: boolean;
  /** Радиус «вне зоны доставки», км. Имеет смысл только при hasZones. */
  maxDistanceKm?: number;
};

export const CITIES: City[] = [
  { code: "msk", name: "Москва",            center: [55.7558, 37.6173], bbox: [[55.49, 37.32], [56.01, 37.97]], zoom: 10, hasZones: true, maxDistanceKm: 75 },
  { code: "spb", name: "Санкт-Петербург",   center: [59.9343, 30.3351], bbox: [[59.75, 29.95], [60.15, 30.65]], zoom: 10, hasZones: false },
  { code: "nsk", name: "Новосибирск",       center: [55.0084, 82.9357], bbox: [[54.80, 82.70], [55.15, 83.20]], zoom: 11, hasZones: false },
  { code: "krd", name: "Краснодар",         center: [45.0355, 38.9753], bbox: [[44.95, 38.85], [45.15, 39.15]], zoom: 11, hasZones: false },
  { code: "vrn", name: "Воронеж",           center: [51.6720, 39.1843], bbox: [[51.55, 39.05], [51.78, 39.35]], zoom: 11, hasZones: false },
  { code: "ekb", name: "Екатеринбург",      center: [56.8389, 60.6057], bbox: [[56.72, 60.45], [56.95, 60.80]], zoom: 11, hasZones: false },
  { code: "kzn", name: "Казань",            center: [55.7963, 49.1064], bbox: [[55.68, 48.95], [55.90, 49.30]], zoom: 11, hasZones: false },
  { code: "nn",  name: "Нижний Новгород",   center: [56.3269, 44.0059], bbox: [[56.20, 43.80], [56.42, 44.20]], zoom: 11, hasZones: false },
  { code: "sam", name: "Самара",            center: [53.1959, 50.1002], bbox: [[53.10, 49.95], [53.35, 50.35]], zoom: 11, hasZones: false },
  { code: "rnd", name: "Ростов-на-Дону",    center: [47.2225, 39.7189], bbox: [[47.15, 39.55], [47.32, 39.87]], zoom: 11, hasZones: false },
  { code: "tbs", name: "Тбилиси",           center: [41.7151, 44.8271], bbox: [[41.62, 44.68], [41.84, 45.02]], zoom: 11, hasZones: false },
];

export const DEFAULT_CITY = CITIES[0];

/**
 * Всегда возвращает город: неизвестный код и пустая строка дают Москву.
 * Писать `getCity(x) ?? DEFAULT_CITY` не нужно — функция не возвращает null.
 */
export function getCity(code?: string | null): City {
  if (!code) return DEFAULT_CITY;
  return CITIES.find((c) => c.code === code) ?? DEFAULT_CITY;
}

/**
 * Строка для параметра `bbox` геокодера Яндекса.
 * Формат: «долгота,широта~долгота,широта» — порядок обратный нашему.
 */
export function bboxParam(city: City): string {
  const [[swLat, swLng], [neLat, neLng]] = city.bbox;
  return `${swLng},${swLat}~${neLng},${neLat}`;
}