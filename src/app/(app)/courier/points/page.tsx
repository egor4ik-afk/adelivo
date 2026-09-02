// src/app/(app)/courier/points/page.tsx
// Карта курьера на Яндекс.Картах API v3.
//
// Что важно знать про v3, если будете править:
//
// 1. КООРДИНАТЫ ПЕРЕВЁРНУТЫ. В v2 было [широта, долгота], в v3 — [долгота, широта],
//    как в GeoJSON. Это источник почти всех ошибок при переезде: карта молча
//    показывает Индийский океан. В коде ниже все места перевода помечены.
// 2. multiRouter не существует. Маршрут строится через ymaps3.route(), который
//    возвращает геометрию, и рисуется вручную через YMapFeature.
// 3. Маркер — это ваш DOM-элемент, никаких preset и templateLayoutFactory.
// 4. Вращение и наклон — ради чего и переезжали — включаются поведениями
//    pinchRotate и panTilt плюс camera: { tilt, azimuth }.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { NAV_HEIGHT } from "@/components/CourierNav";

interface CourierOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string } | null;
  deliveryDate?: string | null; crmCreatedAt?: string | null;
  // заказ с биржи, а не свой
  isExchange?: boolean;
  price?: number | null; costPrice?: number | null; items?: string | null;
}

function hasCoords(o: CourierOrder): o is CourierOrder & { lat: number; lng: number } {
  return o.lat !== null && o.lng !== null;
}

const FILTERS = [
  { id: "IN_DELIVERY", label: "В пути", color: "var(--color-green)" },
  { id: "ASSIGNED", label: "Назначен", color: "var(--color-accent)" },
  { id: "ASSEMBLING", label: "В сборке", color: "var(--color-amber)" },
  { id: "DELIVERED", label: "Доставлен", color: "var(--color-text-3)" },
  { id: "ALL", label: "Все", color: "var(--color-text)" },
];

const MARKER_COLOR: Record<string, string> = {
  DELIVERED: "#7B8492",
  IN_DELIVERY: "#34D399",
  ASSEMBLING: "#FBBF24",
};

declare global {
  interface Window { ymaps3: any }
}

export default function CourierPointsPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const routeRef = useRef<any>(null);
  const initedRef = useRef(false);
  const boundsDone = useRef(false);

  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [exchange, setExchange] = useState<CourierOrder[]>([]);
  const [canTake, setCanTake] = useState(false);
  const [showExchange, setShowExchange] = useState(false);
  const [taking, setTaking] = useState(false);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isCardMinimized, setIsCardMinimized] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("IN_DELIVERY");
  const [filterDate, setFilterDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
  );
  const [routeType, setRouteType] = useState<"auto" | "mt">("mt");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null); // [lat, lng]
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  /* ── данные ────────────────────────────────────────────── */

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  const fetchExchange = useCallback(async () => {
    try {
      const [profRes, exRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/courier/exchange"),
      ]);
      const prof = profRes.ok ? await profRes.json() : null;
      const on = prof?.showExchange ?? false;
      setShowExchange(on);
      if (!on) { setExchange([]); return; }

      const d = exRes.ok ? await exRes.json() : { orders: [], canTake: false };
      setCanTake(!!d.canTake);
      setExchange((d.orders ?? []).map((o: CourierOrder) => ({ ...o, isExchange: true })));
    } catch { /* биржа необязательна, молча пропускаем */ }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchExchange();
    const t = setInterval(() => { fetchOrders(); fetchExchange(); }, 20_000);
    return () => clearInterval(t);
  }, [fetchOrders, fetchExchange]);

  /* ── геолокация ────────────────────────────────────────── */

  const lastSent = useRef(0);
  const lastPos = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);

        const now = Date.now();
        const last = lastPos.current;
        const moved = !last || Math.abs(lat - last[0]) > 0.0005 || Math.abs(lng - last[1]) > 0.0005;
        if (!moved && now - lastSent.current < 30_000) return;
        lastSent.current = now;
        lastPos.current = [lat, lng];

        fetch("/api/courier/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        }).catch(() => {});
      },
      (err) => console.warn("Геолокация недоступна", err),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* ── инициализация карты ───────────────────────────────── */

  useEffect(() => {
    if (initedRef.current || typeof window === "undefined") return;

    const init = async () => {
      if (!mapEl.current || initedRef.current) return;
      initedRef.current = true;

      try {
        await window.ymaps3.ready;
        const {
          YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer,
          YMapControls, YMapZoomControl, YMapGeolocationControl,
        } = window.ymaps3;

        const map = new YMap(mapEl.current, {
          location: { center: [37.61, 55.75], zoom: 11 }, // [lng, lat]!
          // Ради этого и переезжали: pinchRotate — поворот двумя пальцами,
          // panTilt — наклон карты, в v2 их не было вообще
          behaviors: ["drag", "pinchZoom", "scrollZoom", "dblClick", "pinchRotate", "panTilt"],
          camera: { tilt: 0, azimuth: 0 },
        });

        map.addChild(new YMapDefaultSchemeLayer({ theme: "auto" }));
        map.addChild(new YMapDefaultFeaturesLayer({}));

        const controls = new YMapControls({ position: "right" });
        controls.addChild(new YMapZoomControl({}));
        controls.addChild(new YMapGeolocationControl({}));
        map.addChild(controls);

        mapRef.current = map;
        setMapReady(true);
      } catch (e) {
        console.error("[Карта] не удалось инициализировать v3", e);
        setMapError("Карта не загрузилась. Проверьте связь и обновите страницу.");
        initedRef.current = false;
      }
    };

    if (window.ymaps3) { init(); return; }

    const s = document.createElement("script");
    // v3 живёт по другому адресу и не совместим с 2.1: у них разные
    // глобальные объекты, поэтому обе версии могут работать на разных страницах
    s.src = `https://api-maps.yandex.ru/v3/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
    s.onload = () => init();
    s.onerror = () => setMapError("Не удалось загрузить карту");
    document.head.appendChild(s);
  }, []);

  /* ── маркеры ───────────────────────────────────────────── */

  const visibleOrders = [
    ...orders.filter((o) => {
      if (!hasCoords(o)) return false;
      const d = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split("T")[0] : null);
      if (d && d !== filterDate) return false;
      if (filterStatus === "ALL") return true;
      return o.status === filterStatus;
    }),
    ...(showExchange ? exchange.filter(hasCoords) : []),
  ];

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.ymaps3) return;
    const { YMapMarker } = window.ymaps3;

    markersRef.current.forEach((m) => { try { mapRef.current.removeChild(m); } catch {} });
    markersRef.current.clear();

    visibleOrders.forEach((o) => {
      if (!hasCoords(o)) return;

      const el = document.createElement("div");
      const selected = o.id === activeOrderId;
      const color = o.isExchange
        ? "#2DD4BF"
        : selected
        ? "#F87171"
        : MARKER_COLOR[o.status] ?? "#5b87ff";

      el.style.cssText = `
        width:30px;height:30px;border-radius:50%;
        background:${color};border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:12px;font-weight:800;cursor:pointer;
        transform:translate(-50%,-50%);
        ${selected ? "outline:3px solid rgba(248,113,113,0.35);" : ""}
      `;
      el.textContent = o.isExchange ? "★" : o.routeOrder ? String(o.routeOrder) : "";
      el.title = o.address;
      el.onclick = () => { setActiveOrderId(o.id); setIsCardMinimized(false); };

      // Снова: в v3 координаты идут [долгота, широта]
      const marker = new YMapMarker({ coordinates: [o.lng, o.lat] }, el);
      mapRef.current.addChild(marker);
      markersRef.current.set(o.id, marker);
    });

    if (visibleOrders.length > 0 && !boundsDone.current) {
      boundsDone.current = true;
      const lngs = visibleOrders.map((o) => o.lng!);
      const lats = visibleOrders.map((o) => o.lat!);
      mapRef.current.update({
        location: {
          bounds: [
            [Math.min(...lngs), Math.max(...lats)],
            [Math.max(...lngs), Math.min(...lats)],
          ],
          duration: 300,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, exchange, showExchange, filterStatus, filterDate, mapReady, activeOrderId]);

  /* ── маршрут ───────────────────────────────────────────── */

  const buildRoute = useCallback(async (to: [number, number], mode: "auto" | "mt") => {
    const ymaps3 = window.ymaps3;
    if (!userLocation || !mapRef.current || !ymaps3) return;

    if (routeRef.current) {
      try { mapRef.current.removeChild(routeRef.current); } catch {}
      routeRef.current = null;
    }
    setRouteInfo(null);

    // В v3 нет multiRouter: маршрут отдаёт ymaps3.route(), а рисуем сами.
    if (typeof ymaps3.route !== "function") {
      console.warn("[Карта] ymaps3.route недоступен — линия маршрута не строится");
      return;
    }

    try {
      const routes = await ymaps3.route({
        points: [
          [userLocation[1], userLocation[0]], // [lng, lat]
          [to[1], to[0]],
        ],
        type: mode === "mt" ? "masstransit" : "driving",
        bounds: true,
      });

      const first = routes?.[0];
      if (!first) return;

      const geometry = first.toRoute?.()?.geometry ?? first.geometry;
      if (!geometry) return;

      const { YMapFeature } = ymaps3;
      const line = new YMapFeature({
        geometry,
        style: { stroke: [{ color: "#5b87ff", width: 6 }] },
      });
      mapRef.current.addChild(line);
      routeRef.current = line;

      const props = first.properties ?? {};
      setRouteInfo({
        distance: props.distance?.text ?? "—",
        duration: props.duration?.text ?? "—",
      });
    } catch (e) {
      console.error("[Карта] маршрут не построился", e);
    }
  }, [userLocation]);

  useEffect(() => {
    if (!activeOrderId || !userLocation) return;
    const o = [...orders, ...exchange].find((x) => x.id === activeOrderId);
    if (o && hasCoords(o)) buildRoute([o.lat, o.lng], routeType);
  }, [routeType, activeOrderId, userLocation, buildRoute, orders, exchange]);

  /* ── взять заказ с биржи ───────────────────────────────── */

  const takeOrder = async (o: CourierOrder) => {
    if (!confirm(`Взять заказ ${o.externalId || o.crmId}?\n${o.address}`)) return;
    setTaking(true);
    try {
      const res = await fetch(`/api/courier/exchange/${o.id}/take`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Не удалось взять заказ");
      setActiveOrderId(null);
      await Promise.all([fetchOrders(), fetchExchange()]);
      alert("Заказ ваш — он появился в маршрутах");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Не удалось взять заказ");
      fetchExchange();
    } finally {
      setTaking(false);
    }
  };

  const activeOrder = [...orders, ...exchange].find((o) => o.id === activeOrderId);
  const navUrl = activeOrder && userLocation
    ? `https://yandex.ru/maps/?rtext=${userLocation[0]},${userLocation[1]}~${activeOrder.lat},${activeOrder.lng}&rtt=${routeType}`
    : "#";

  /* ── разметка ──────────────────────────────────────────── */

  return (
    <div style={{ position: "relative", height: `calc(100vh - ${NAV_HEIGHT}px)`, background: "var(--color-bg)" }}>
      <div ref={mapEl} style={{ width: "100%", height: "100%" }} />

      {mapError && (
        <div style={{
          position: "absolute", top: 12, left: 12, right: 12, zIndex: 20,
          background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)",
          color: "var(--color-danger-text)", borderRadius: 12, padding: "10px 14px", fontSize: 13,
        }}>
          {mapError}
        </div>
      )}

      {/* Фильтры */}
      <div style={{
        position: "absolute", top: 10, left: 10, right: 10, zIndex: 10,
        display: "flex", gap: 6, overflowX: "auto",
      }} className="hide-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFilterStatus(f.id); boundsDone.current = false; }}
            style={{
              padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
              whiteSpace: "nowrap", border: "1px solid var(--color-border)",
              background: filterStatus === f.id ? "var(--color-accent)" : "var(--color-card)",
              color: filterStatus === f.id ? "#fff" : "var(--color-text-2)",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {f.label}
          </button>
        ))}
        {showExchange && (
          <span style={{
            padding: "7px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            whiteSpace: "nowrap", border: "1px solid var(--color-border)",
            background: "var(--color-card)", color: "#2DD4BF",
          }}>
            ★ биржа: {exchange.length}
          </span>
        )}
      </div>

      {/* Карточка заказа */}
      {activeOrder && (
        <div style={{
          position: "absolute", left: 10, right: 10, bottom: 10, zIndex: 15,
          background: "var(--color-card)", border: "1px solid var(--color-border)",
          borderRadius: 16, padding: 14, boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--color-text)" }}>
              {activeOrder.isExchange ? "★ " : ""}№{activeOrder.externalId || activeOrder.crmId}
            </span>
            <button
              onClick={() => setActiveOrderId(null)}
              style={{ background: "none", border: "none", color: "var(--color-text-3)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>

          {!isCardMinimized && (
            <>
              <div style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.4, marginBottom: 6 }}>
                {activeOrder.address}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-3)", marginBottom: 10 }}>
                {activeOrder.slotRaw || "время не указано"}
                {routeInfo ? ` · ${routeInfo.distance}, ${routeInfo.duration}` : ""}
                {activeOrder.isExchange && activeOrder.costPrice != null
                  ? ` · ${activeOrder.costPrice} ₽` : ""}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {(["mt", "auto"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setRouteType(m)}
                    style={{
                      flex: 1, padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: "1px solid var(--color-border)", cursor: "pointer", fontFamily: "inherit",
                      background: routeType === m ? "var(--color-surface)" : "transparent",
                      color: routeType === m ? "var(--color-text)" : "var(--color-text-3)",
                    }}
                  >
                    {m === "mt" ? "🚶 Пешком" : "🚗 Авто"}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {activeOrder.isExchange ? (
                  <button
                    onClick={() => takeOrder(activeOrder)}
                    disabled={!canTake || taking}
                    title={canTake ? "" : "Профиль не подтверждён или не привязана Консоль.Про"}
                    style={{
                      flex: 1, padding: 12, borderRadius: 10, border: "none",
                      fontWeight: 800, fontSize: 14, fontFamily: "inherit",
                      background: canTake ? "var(--color-accent)" : "var(--color-border)",
                      color: canTake ? "#fff" : "var(--color-text-3)",
                      cursor: canTake ? "pointer" : "not-allowed",
                    }}
                  >
                    {taking ? "Берём…" : canTake ? "Взять заказ" : "Недоступно"}
                  </button>
                ) : (
                  <a
                    href={navUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1, padding: 12, borderRadius: 10, textAlign: "center",
                      background: "var(--color-accent)", color: "#fff",
                      fontWeight: 800, fontSize: 14, textDecoration: "none",
                    }}
                  >
                    Открыть в Навигаторе
                  </a>
                )}
                <button
                  onClick={() => setIsCardMinimized(true)}
                  style={{
                    padding: "12px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
                    background: "transparent", color: "var(--color-text-3)", cursor: "pointer",
                    fontSize: 14, fontFamily: "inherit",
                  }}
                >
                  ▾
                </button>
              </div>
            </>
          )}

          {isCardMinimized && (
            <button
              onClick={() => setIsCardMinimized(false)}
              style={{
                width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--color-border)",
                background: "transparent", color: "var(--color-text-3)", cursor: "pointer",
                fontSize: 12, fontFamily: "inherit",
              }}
            >
              Развернуть
            </button>
          )}
        </div>
      )}
    </div>
  );
}