// src/app/courier/points/page.tsx
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { NAV_HEIGHT } from "@/components/CourierNav";

interface CourierOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string } | null;
  deliveryDate?: string | null; crmCreatedAt?: string | null;
}

function hasCoords(o: CourierOrder): o is CourierOrder & { lat: number; lng: number } {
  return o.lat !== null && o.lng !== null;
}

const FILTERS = [
  { id: 'IN_DELIVERY', label: 'В пути',    color: '#10b981' },
  { id: 'ASSIGNED',    label: 'Назначен',  color: '#4a7aff' },
  { id: 'DELIVERED',   label: 'Доставлен', color: '#a8a49c' },
  { id: 'ALL',         label: 'Все',       color: '#1a1a18' },
];

const STATUS_COLORS: Record<string, string> = {
  IN_DELIVERY: '#10b981',
  ASSIGNED:    '#4a7aff',
  DELIVERED:   '#a8a49c',
  NEW:         '#f59e0b',
};

// ─── ymaps3 loader ───────────────────────────────────────────────────────────
let ymaps3Promise: Promise<any> | null = null;

function loadYmaps3(): Promise<any> {
  if (ymaps3Promise) return ymaps3Promise;
  ymaps3Promise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") { reject("SSR"); return; }
    if ((window as any).ymaps3) { resolve((window as any).ymaps3); return; }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
    script.onload = async () => {
      const ymaps3 = (window as any).ymaps3;
      await ymaps3.ready;
      resolve(ymaps3);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return ymaps3Promise;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function CourierPointsPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const markersRef      = useRef<Map<string, any>>(new Map());
  const routeRef        = useRef<any>(null);
  const userMarkerRef   = useRef<any>(null);
  const mapInitialized  = useRef(false);
  const boundsInitialized = useRef(false);

  const [mapReady,     setMapReady]     = useState(false);
  const [orders,       setOrders]       = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isCardMinimized, setIsCardMinimized] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'IN_DELIVERY' | 'ASSIGNED' | 'DELIVERED' | 'ALL'>('IN_DELIVERY');
  const [filterDate,   setFilterDate]   = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [routeType,    setRouteType]    = useState<"auto" | "mt">("mt");
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [routeInfo,    setRouteInfo]    = useState<{ distance: string; duration: string } | null>(null);

  // ── Fetch orders ─────────────────────────────────────────────────────────
  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const iv = setInterval(fetchOrders, 20_000);
    return () => clearInterval(iv);
  }, [fetchOrders]);

  // ── GPS tracking ─────────────────────────────────────────────────────────
  const lastSentRef     = useRef<number>(0);
  const lastLocationRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);
        const now  = Date.now();
        const last = lastLocationRef.current;
        const moved  = !last || Math.abs(lat - last[0]) > 0.0005 || Math.abs(lng - last[1]) > 0.0005;
        const timeOk = now - lastSentRef.current > 30_000;
        if (moved || timeOk) {
          lastSentRef.current = now;
          lastLocationRef.current = [lat, lng];
          fetch("/api/courier/location", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          }).catch(() => {});
        }
      },
      (err) => console.warn("GPS недоступен", err),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // ── Инициализация карты ymaps3 ───────────────────────────────────────────
  useEffect(() => {
    if (mapInitialized.current || !mapContainerRef.current) return;
    mapInitialized.current = true;

    loadYmaps3().then(async (ymaps3) => {
      if (!mapContainerRef.current) return;

      // Подключаем пакет UI-контролов (вращение, геолокация, зум)
      const defaultUI = await ymaps3.import("@yandex/ymaps3-default-ui-theme");

      const {
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapControls,
        YMapZoomControl,
        YMapGeolocationControl,
        YMapRotateControl,
      } = { ...ymaps3, ...defaultUI };

      const map = new ymaps3.YMap(
        mapContainerRef.current,
        {
          location: { center: [37.61, 55.75], zoom: 11 },
          // Все жесты включая вращение двумя пальцами
          behaviors: ["drag", "pinchZoom", "dblClick", "mouseRotate", "mouseTilt", "pinchRotate"],
        }
      );

      map.addChild(new YMapDefaultSchemeLayer({}));
      map.addChild(new YMapDefaultFeaturesLayer({}));

      // Правая панель: зум + вращение
      const controlsRight = new YMapControls({ position: "right" });
      controlsRight.addChild(new YMapZoomControl({}));
      controlsRight.addChild(new YMapRotateControl({}));
      map.addChild(controlsRight);

      // Нижняя правая: геолокация
      const controlsBottomRight = new YMapControls({ position: "bottom right" });
      controlsBottomRight.addChild(new YMapGeolocationControl({}));
      map.addChild(controlsBottomRight);

      mapRef.current = map;
      setMapReady(true);
    }).catch(console.error);
  }, []);

  // ── Маркер текущей позиции ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !userLocation) return;
    const ymaps3 = (window as any).ymaps3;
    if (!ymaps3) return;

    if (userMarkerRef.current) {
      try { mapRef.current.removeChild(userMarkerRef.current); } catch {}
    }

    const el = document.createElement("div");
    el.style.cssText = `
      width:18px;height:18px;border-radius:50%;
      background:#4a7aff;border:3px solid #fff;
      box-shadow:0 0 0 4px rgba(74,122,255,0.3);
    `;

    const marker = new ymaps3.YMapMarker(
      { coordinates: [userLocation[1], userLocation[0]] },
      el
    );
    mapRef.current.addChild(marker);
    userMarkerRef.current = marker;
  }, [mapReady, userLocation]);

  // ── Маркеры заказов ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const ymaps3 = (window as any).ymaps3;
    if (!ymaps3) return;

    // Чистим старые
    markersRef.current.forEach((m) => {
      try { mapRef.current.removeChild(m); } catch {}
    });
    markersRef.current.clear();

    const filtered = orders.filter(o => {
      if (!hasCoords(o)) return false;
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split("T")[0] : null);
      if (oDate && oDate !== filterDate) return false;
      if (filterStatus === "ALL") return true;
      return o.status === filterStatus;
    });

    filtered.forEach(o => {
      if (!hasCoords(o)) return;

      const isSelected = o.id === activeOrderId;
      const color = STATUS_COLORS[o.status] ?? "#6b6860";
      const label = o.routeOrder
        ? String(o.routeOrder)
        : (o.slotRaw?.replace("с ", "").replace(" до ", "-") ?? "•");

      const el = document.createElement("div");
      el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;";

      const pin = document.createElement("div");
      pin.style.cssText = `
        background:${isSelected ? "#facc15" : color};
        color:${isSelected ? "#1a1a18" : "#fff"};
        padding:4px 8px;border-radius:10px;
        font-size:11px;font-weight:700;white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        border:${isSelected ? "2px solid #1a1a18" : "1.5px solid rgba(255,255,255,0.4)"};
        min-width:24px;text-align:center;
        transform:${isSelected ? "scale(1.15)" : "scale(1)"};
      `;
      pin.textContent = label;

      const arrow = document.createElement("div");
      arrow.style.cssText = `
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-top:6px solid ${isSelected ? "#facc15" : color};
        margin-top:-1px;
      `;

      el.appendChild(pin);
      el.appendChild(arrow);
      el.addEventListener("click", () => {
        setActiveOrderId(o.id);
        setIsCardMinimized(false);
      });

      const marker = new ymaps3.YMapMarker(
        { coordinates: [o.lng, o.lat], anchor: [0.5, 1] },
        el
      );
      mapRef.current.addChild(marker);
      markersRef.current.set(o.id, marker);
    });

    // Автозум при первой загрузке
    if (filtered.length > 0 && !boundsInitialized.current) {
      boundsInitialized.current = true;
      const lats = filtered.map(o => (o as any).lat as number);
      const lngs = filtered.map(o => (o as any).lng as number);
      const pad = 0.05;
      mapRef.current.update({
        location: {
          bounds: [
            [Math.min(...lngs) - pad, Math.min(...lats) - pad],
            [Math.max(...lngs) + pad, Math.max(...lats) + pad],
          ],
          duration: 400,
        },
      });
    }
  }, [orders, filterStatus, filterDate, mapReady, activeOrderId]);

  // ── Построение маршрута ──────────────────────────────────────────────────
  const buildRoute = useCallback(async (to: [number, number], mode: "auto" | "mt") => {
    if (!userLocation || !mapRef.current) return;
    const ymaps3 = (window as any).ymaps3;
    if (!ymaps3) return;

    if (routeRef.current) {
      try { mapRef.current.removeChild(routeRef.current); } catch {}
      routeRef.current = null;
    }
    setRouteInfo(null);

    try {
      const result = await ymaps3.route({
        points: [
          { type: "point", coordinates: [userLocation[1], userLocation[0]] },
          { type: "point", coordinates: [to[1], to[0]] },
        ],
        type: mode === "mt" ? "transit" : "driving",
      });

      if (!result) return;

      // Пробуем получить geojson линию
      const geojson = result.toGeoJson?.() ?? result.geometry ?? result;

      if (geojson && ymaps3.YMapFeature) {
        const line = new ymaps3.YMapFeature({
          geometry: geojson,
          style: { stroke: [{ color: "#4a7aff", width: 5 }] },
        });
        mapRef.current.addChild(line);
        routeRef.current = line;
      }

      // Время и дистанция
      const props = result.properties ?? result;
      const distM = props.distance ?? props.length;
      const durS  = props.duration ?? props.time;
      const distance = distM ? `${(distM / 1000).toFixed(1)} км` : "—";
      const duration = durS  ? `${Math.round(durS / 60)} мин`    : "—";
      setRouteInfo({ distance, duration });

    } catch (e) {
      console.error("Ошибка маршрута:", e);
    }
  }, [userLocation]);

  useEffect(() => {
    if (activeOrderId && userLocation) {
      const order = orders.find(o => o.id === activeOrderId);
      if (order && hasCoords(order)) buildRoute([order.lat, order.lng], routeType);
    }
  }, [routeType, activeOrderId, userLocation, buildRoute, orders]);

  // ── UI ───────────────────────────────────────────────────────────────────
  const activeOrder = orders.find(o => o.id === activeOrderId);
  const yandexMapsUrl = activeOrder && userLocation
    ? `https://yandex.ru/maps/?rtext=${userLocation[0]},${userLocation[1]}~${activeOrder.lat},${activeOrder.lng}&rtt=${routeType}`
    : "#";

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      bottom: `calc(var(--nav-height, ${NAV_HEIGHT}px) + env(safe-area-inset-bottom))`,
      display: "flex", flexDirection: "column", background: "#f5f4f0",
    }}>

      {/* Фильтры */}
      <div style={{
        padding: "8px 12px", background: "#fff",
        borderBottom: "1px solid #e8e6df", zIndex: 100,
        display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, alignItems: "center",
      }}>
        <input
          type="date" value={filterDate}
          onChange={(e) => { setFilterDate(e.target.value); setActiveOrderId(null); boundsInitialized.current = false; }}
          style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e6df", fontSize: 12, fontWeight: 600, color: "#1a1a18", outline: "none", background: "#fafaf8" }}
        />
        <div style={{ width: 1, height: 20, background: "#e8e6df", flexShrink: 0, margin: "0 4px" }} />
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilterStatus(f.id as any); setActiveOrderId(null); boundsInitialized.current = false; setRouteInfo(null); }}
            style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid #e8e6df", whiteSpace: "nowrap", cursor: "pointer", background: filterStatus === f.id ? f.color : "#fafaf8", color: filterStatus === f.id ? "#fff" : "#6b6860", transition: "all 0.2s" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Карточка заказа */}
      {activeOrder && (
        <div style={{
          position: "absolute", top: 56, left: 12, right: 12, zIndex: 110, background: "#fff",
          padding: isCardMinimized ? "8px 12px" : "12px", borderRadius: 12,
          border: "1px solid #e8e6df", boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
          display: "flex", flexDirection: "column", gap: isCardMinimized ? 0 : 10, transition: "all 0.3s",
        }}>
          {isCardMinimized ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4a7aff" }}>
                {routeInfo ? `📍 ${routeInfo.distance} ⏱ ${routeInfo.duration}` : "⏳ Считаем..."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setIsCardMinimized(false)} style={{ border: "none", background: "#f0f4ff", color: "#4a7aff", padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Развернуть</button>
                <button onClick={() => { setActiveOrderId(null); setRouteInfo(null); }} style={{ border: "none", background: "none", fontSize: 16, color: "#a8a49c", cursor: "pointer" }}>✕</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ paddingRight: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", lineHeight: 1.3 }}>{activeOrder.address}</div>
                  <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 4 }}>{activeOrder.slotRaw} · {activeOrder.externalId ?? activeOrder.crmId}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setIsCardMinimized(true)} style={{ border: "none", background: "#f5f4f0", width: 26, height: 26, borderRadius: "50%", fontSize: 14, color: "#6b6860", cursor: "pointer" }}>—</button>
                  <button onClick={() => { setActiveOrderId(null); setRouteInfo(null); }} style={{ border: "none", background: "#f5f4f0", width: 26, height: 26, borderRadius: "50%", fontSize: 14, color: "#6b6860", cursor: "pointer" }}>✕</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#f5f4f0", padding: "6px 8px", borderRadius: 8 }}>
                <div style={{ display: "flex", background: "#e8e6df", borderRadius: 6, padding: 2 }}>
                  <button onClick={() => setRouteType("auto")} style={{ padding: "4px 8px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 600, background: routeType === "auto" ? "#fff" : "transparent", color: routeType === "auto" ? "#1a1a18" : "#6b6860", cursor: "pointer" }}>🚗</button>
                  <button onClick={() => setRouteType("mt")} style={{ padding: "4px 8px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 600, background: routeType === "mt" ? "#fff" : "transparent", color: routeType === "mt" ? "#1a1a18" : "#6b6860", cursor: "pointer" }}>🚌</button>
                </div>
                {routeInfo ? (
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 12, fontSize: 13, fontWeight: 700, color: "#1a1a18" }}>
                    <span>{routeInfo.distance}</span><span style={{ color: "#4a7aff" }}>{routeInfo.duration}</span>
                  </div>
                ) : (
                  <div style={{ flex: 1, textAlign: "right", fontSize: 12, color: "#a8a49c", fontWeight: 600 }}>
                    {userLocation ? "Считаем..." : "Включите GPS"}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <a href={yandexMapsUrl} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#facc15", color: "#1a1a18", textDecoration: "none", textAlign: "center", fontSize: 12, fontWeight: 700 }}>
                  🗺 В навигатор
                </a>
                {activeOrder.status === "ASSIGNED" && (
                  <button onClick={async () => { await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_DELIVERY" }) }); fetchOrders(); }}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    🚀 Поехал
                  </button>
                )}
                {activeOrder.status === "IN_DELIVERY" && (
                  <button onClick={async () => { await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DELIVERED" }) }); setActiveOrderId(null); fetchOrders(); }}
                    style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#4a7aff", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ✅ Доставил
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Карта */}
      <div ref={mapContainerRef} style={{ flex: 1, width: "100%", background: "#e8e6df" }} />
    </div>
  );
}