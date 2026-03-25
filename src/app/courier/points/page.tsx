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
  { id: 'IN_DELIVERY', label: 'В пути', color: '#10b981' },
  { id: 'ASSIGNED', label: 'Назначен', color: '#4a7aff' },
  { id: 'DELIVERED', label: 'Доставлен', color: '#a8a49c' },
  { id: 'ALL', label: 'Все', color: '#1a1a18' },
];

export default function CourierPointsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const mapInitialized = useRef(false);
  const boundsInitialized = useRef(false); // 🔥 Флаг для одноразового зума
  const activeRouteRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isCardMinimized, setIsCardMinimized] = useState(false); // 🔥 Состояние свернутой плашки

  const [filterStatus, setFilterStatus] = useState<'IN_DELIVERY' | 'ASSIGNED' | 'DELIVERED' | 'ALL'>('IN_DELIVERY');
  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [routeType, setRouteType] = useState<"auto" | "mt">("mt");

  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 20000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 ПОСТОЯННЫЙ ФОНОВЫЙ ТРЕКИНГ GPS
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation([lat, lng]);
          
          // Отправка координат в фоне на сервер
          fetch("/api/courier/location", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng })
          }).catch(() => {});
        },
        (err) => console.warn("Геолокация недоступна", err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  const buildRouteToPoint = useCallback((to: [number, number], mode: "auto" | "mt") => {
    if (!userLocation || !window?.ymaps?.multiRouter || !ymapRef.current) return;

    if (activeRouteRef.current) {
      try { ymapRef.current.geoObjects.remove(activeRouteRef.current); } catch {}
    }
    setRouteInfo(null);

    const route = new window.ymaps.multiRouter.MultiRoute({
      referencePoints: [userLocation, to],
      params: { routingMode: mode === "mt" ? "masstransit" : "auto" }
    }, {
      boundsAutoApply: true, 
      wayPointVisible: false,
      routeActiveStrokeWidth: 6,
      routeActiveStrokeColor: "#4a7aff",
      routeStrokeWidth: 0,
    });

    route.model.events.add("requestsuccess", () => {
      const activeRoute = route.getActiveRoute();
      if (!activeRoute) return;
      const distance = activeRoute.properties.get("distance")?.text ?? "—";
      const duration = activeRoute.properties.get("duration")?.text ?? "—";
      setRouteInfo({ distance, duration });
    });

    ymapRef.current.geoObjects.add(route);
    activeRouteRef.current = route;
  }, [userLocation]);

  useEffect(() => {
    if (activeOrderId && userLocation) {
      const order = orders.find(o => o.id === activeOrderId);
      if (order && hasCoords(order)) {
        buildRouteToPoint([order.lat, order.lng], routeType);
      }
    }
  }, [routeType, activeOrderId, userLocation, buildRouteToPoint, orders]);

  useEffect(() => {
    if (mapInitialized.current) return;
    function initMap() {
      if (!mapRef.current || mapInitialized.current) return;
      mapInitialized.current = true;
      ymapRef.current = new window.ymaps.Map(mapRef.current, {
        center: [55.75, 37.61], zoom: 11, controls: ["zoomControl", "geolocationControl"],
        behaviors: ['default', 'scrollZoom', 'multiTouch'] // 🔥 Добавлено для вращения 2 пальцами
      }, { suppressMapOpenBlock: true });

      ymapRef.current.container.fitToViewport();
      setMapReady(true);
    }
    if (typeof window === "undefined") return;
    if (window.ymaps) { window.ymaps.ready(initMap); }
    else {
      const s = document.createElement("script");
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
      s.onload = () => window.ymaps.ready(initMap);
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    if (!mapReady || !ymapRef.current) return;

    const filteredOrders = orders.filter(o => {
      if (!hasCoords(o)) return false;
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
      if (oDate && oDate !== filterDate) return false;
      if (filterStatus === 'ALL') return true;
      return o.status === filterStatus;
    });

    markersRef.current.forEach((pm) => ymapRef.current.geoObjects.remove(pm));
    markersRef.current.clear();

    filteredOrders.forEach(o => {
      if (!hasCoords(o)) return;
      const isSelected = o.id === activeOrderId;
      const pm = new window.ymaps.Placemark([o.lat, o.lng], {
        hintContent: o.address, iconContent: o.routeOrder ? String(o.routeOrder) : undefined,
      }, {
        preset: isSelected ? "islands#redCircleIcon" : 
                o.status === "DELIVERED" ? "islands#grayCircleIcon" :
                o.status === "IN_DELIVERY" ? "islands#greenCircleIcon" : "islands#blueCircleIcon",
      });

      pm.events.add("click", () => {
        setActiveOrderId(o.id);
        setIsCardMinimized(false); // Разворачиваем плашку при клике на точку
      });

      ymapRef.current.geoObjects.add(pm);
      markersRef.current.set(o.id, pm);
    });

    // 🔥 Зуммируем карту ТОЛЬКО ОДИН РАЗ при загрузке данных
    if (filteredOrders.length > 0 && !boundsInitialized.current) {
      boundsInitialized.current = true;
      const lats = filteredOrders.map(o => o.lat!);
      const lngs = filteredOrders.map(o => o.lng!);
      ymapRef.current.setBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { zoomMargin: 40, checkZoomRange: true });
    }
  }, [orders, filterStatus, filterDate, mapReady, activeOrderId]);

  const activeOrder = orders.find(o => o.id === activeOrderId);
  const yandexMapsUrl = activeOrder && userLocation 
    ? `https://yandex.ru/maps/?rtext=${userLocation[0]},${userLocation[1]}~${activeOrder.lat},${activeOrder.lng}&rtt=${routeType}` : "#";

  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: `calc(var(--nav-height, ${NAV_HEIGHT}px) + env(safe-area-inset-bottom))`, display: "flex", flexDirection: "column", background: "#f5f4f0" }}>
      
      <div style={{ padding: "8px 12px", background: "#fff", borderBottom: "1px solid #e8e6df", zIndex: 100, display: "flex", gap: 6, overflowX: "auto", flexShrink: 0, alignItems: "center" }}>
        <input type="date" value={filterDate} onChange={(e) => { setFilterDate(e.target.value); setActiveOrderId(null); boundsInitialized.current = false; }} style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #e8e6df", fontSize: 12, fontWeight: 600, color: "#1a1a18", outline: "none", background: "#fafaf8" }} />
        <div style={{ width: 1, height: 20, background: "#e8e6df", flexShrink: 0, margin: "0 4px" }} />
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilterStatus(f.id as any); setActiveOrderId(null); boundsInitialized.current = false; setRouteInfo(null); }} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid #e8e6df", whiteSpace: "nowrap", cursor: "pointer", background: filterStatus === f.id ? f.color : "#fafaf8", color: filterStatus === f.id ? "#fff" : "#6b6860", transition: "all 0.2s" }}>
            {f.label}
          </button>
        ))}
      </div>

      {activeOrder && (
        <div style={{ position: "absolute", top: 56, left: 12, right: 12, zIndex: 110, background: "#fff", padding: isCardMinimized ? "8px 12px" : "12px", borderRadius: 12, border: "1px solid #e8e6df", boxShadow: "0 4px 15px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: isCardMinimized ? 0 : 10, transition: "all 0.3s" }}>
          
          {/* Свернутый вид */}
          {isCardMinimized ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4a7aff" }}>
                {routeInfo ? `📍 ${routeInfo.distance} ⏱ ${routeInfo.duration}` : "⏳ Считаем..."}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setIsCardMinimized(false)} style={{ border: "none", background: "#f0f4ff", color: "#4a7aff", padding: "4px 8px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Развернуть</button>
                <button onClick={() => { setActiveOrderId(null); setRouteInfo(null); }} style={{ border: "none", background: "none", fontSize: 16, color: "#a8a49c" }}>✕</button>
              </div>
            </div>
          ) : (
            <>
              {/* Полный вид */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ paddingRight: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", lineHeight: 1.3 }}>{activeOrder.address}</div>
                  <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 4 }}>{activeOrder.slotRaw} · {activeOrder.externalId ?? activeOrder.crmId}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setIsCardMinimized(true)} style={{ border: "none", background: "#f5f4f0", width: 26, height: 26, borderRadius: "50%", fontSize: 14, color: "#6b6860" }}>—</button>
                  <button onClick={() => { setActiveOrderId(null); setRouteInfo(null); }} style={{ border: "none", background: "#f5f4f0", width: 26, height: 26, borderRadius: "50%", fontSize: 14, color: "#6b6860" }}>✕</button>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#f5f4f0", padding: "6px 8px", borderRadius: 8 }}>
                <div style={{ display: "flex", background: "#e8e6df", borderRadius: 6, padding: 2 }}>
                  <button onClick={() => setRouteType("auto")} style={{ padding: "4px 8px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 600, background: routeType === "auto" ? "#fff" : "transparent", color: routeType === "auto" ? "#1a1a18" : "#6b6860" }}>🚗</button>
                  <button onClick={() => setRouteType("mt")} style={{ padding: "4px 8px", borderRadius: 4, border: "none", fontSize: 12, fontWeight: 600, background: routeType === "mt" ? "#fff" : "transparent", color: routeType === "mt" ? "#1a1a18" : "#6b6860" }}>🚌</button>
                </div>
                {routeInfo ? (
                  <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", gap: 12, fontSize: 13, fontWeight: 700, color: "#1a1a18" }}>
                    <span>{routeInfo.distance}</span><span style={{ color: "#4a7aff" }}>{routeInfo.duration}</span>
                  </div>
                ) : (
                  <div style={{ flex: 1, textAlign: "right", fontSize: 12, color: "#a8a49c", fontWeight: 600 }}>{userLocation ? "Считаем..." : "Включите GPS"}</div>
                )}
              </div>
              
              <div style={{ display: "flex", gap: 8 }}>
                <a href={yandexMapsUrl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#facc15", color: "#1a1a18", textDecoration: "none", textAlign: "center", fontSize: 12, fontWeight: 700 }}>🗺 В навигатор</a>
                {activeOrder.status === "ASSIGNED" && (
                  <button onClick={async () => { await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_DELIVERY" }) }); fetchOrders(); }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontSize: 12, fontWeight: 700 }}>🚀 Поехал</button>
                )}
                {activeOrder.status === "IN_DELIVERY" && (
                  <button onClick={async () => { await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DELIVERED" }) }); setActiveOrderId(null); fetchOrders(); }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#4a7aff", color: "#fff", border: "none", fontSize: 12, fontWeight: 700 }}>✅ Доставил</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div ref={mapRef} style={{ flex: 1, width: "100%", background: "#e8e6df" }} />
    </div>
  );
}