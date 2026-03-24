// src/app/courier/points/page.tsx
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { NAV_HEIGHT } from "@/components/CourierNav";

interface CourierOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string } | null;
}

function hasCoords(o: CourierOrder): o is CourierOrder & { lat: number; lng: number } {
  return o.lat !== null && o.lng !== null;
}

// Статусы для фильтра
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
  const activeRouteRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'IN_DELIVERY' | 'ASSIGNED' | 'DELIVERED' | 'ALL'>('IN_DELIVERY');
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

  // Получение местоположения при загрузке
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.warn("Геолокация отключена", err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const buildRouteToPoint = useCallback((to: [number, number]) => {
    if (!userLocation || !window?.ymaps?.multiRouter || !ymapRef.current) return;

    if (activeRouteRef.current) {
      try { ymapRef.current.geoObjects.remove(activeRouteRef.current); } catch {}
    }

    const route = new window.ymaps.multiRouter.MultiRoute({
      referencePoints: [userLocation, to],
      params: { routingMode: "auto" }
    }, {
      boundsAutoApply: false,
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
    if (mapInitialized.current) return;
    function initMap() {
      if (!mapRef.current || mapInitialized.current) return;
      mapInitialized.current = true;
      ymapRef.current = new window.ymaps.Map(mapRef.current, {
        center: [55.75, 37.61], zoom: 11, controls: ["zoomControl", "geolocationControl"],
      }, { suppressMapOpenBlock: true });

      ymapRef.current.container.fitToViewport();
      const geoControl = ymapRef.current.controls.get("geolocationControl");
      if (geoControl) {
        geoControl.events.add("locationchange", (e: any) => {
          const coords = e.get("position");
          if (coords) setUserLocation(coords as [number, number]);
        });
      }
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

  // Отрисовка точек с учетом фильтра
  useEffect(() => {
    if (!mapReady || !ymapRef.current) return;

    const filteredOrders = orders.filter(o => {
      if (!hasCoords(o)) return false;
      if (filterStatus === 'ALL') return true;
      return o.status === filterStatus;
    });

    markersRef.current.forEach((pm) => ymapRef.current.geoObjects.remove(pm));
    markersRef.current.clear();

    filteredOrders.forEach(o => {
      if (!hasCoords(o)) return;
      const isSelected = o.id === activeOrderId;
      const pm = new window.ymaps.Placemark([o.lat, o.lng], {
        hintContent: o.address,
        iconContent: o.routeOrder ? String(o.routeOrder) : undefined,
      }, {
        preset: isSelected ? "islands#redCircleIcon" : 
                o.status === "DELIVERED" ? "islands#grayCircleIcon" :
                o.status === "IN_DELIVERY" ? "islands#greenCircleIcon" : "islands#blueCircleIcon",
      });

      pm.events.add("click", () => {
        setActiveOrderId(o.id);
        buildRouteToPoint([o.lat, o.lng]);
      });

      ymapRef.current.geoObjects.add(pm);
      markersRef.current.set(o.id, pm);
    });

    if (filteredOrders.length > 0 && !activeOrderId) {
      const lats = filteredOrders.map(o => o.lat!);
      const lngs = filteredOrders.map(o => o.lng!);
      ymapRef.current.setBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], { zoomMargin: 40, checkZoomRange: true });
    }
  }, [orders, filterStatus, mapReady, activeOrderId, buildRouteToPoint]);

  const activeOrder = orders.find(o => o.id === activeOrderId);

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0,
      bottom: `calc(var(--nav-height, ${NAV_HEIGHT}px) + env(safe-area-inset-bottom))`,
      display: "flex", flexDirection: "column", background: "#f5f4f0"
    }}>
      
      {/* Компактный фильтр сверху */}
      <div style={{
        padding: "8px 12px", background: "#fff", borderBottom: "1px solid #e8e6df",
        zIndex: 100, display: "flex", gap: 6, overflowX: "auto", flexShrink: 0
      }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => { setFilterStatus(f.id as any); setActiveOrderId(null); setRouteInfo(null); }}
            style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: "1px solid #e8e6df", whiteSpace: "nowrap", cursor: "pointer",
              background: filterStatus === f.id ? f.color : "#fafaf8",
              color: filterStatus === f.id ? "#fff" : "#6b6860",
              transition: "all 0.2s"
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Инфо о маршруте (вместо нижней панели) */}
      {activeOrder && (
        <div style={{
          position: "absolute", top: 56, left: 12, right: 12, zIndex: 110,
          background: "#fff", padding: "12px", borderRadius: 12, border: "1px solid #e8e6df",
          boxShadow: "0 4px 15px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 8
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a18", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeOrder.address}
            </div>
            <button onClick={() => { setActiveOrderId(null); setRouteInfo(null); }} style={{ border: "none", background: "none", fontSize: 18, color: "#a8a49c" }}>✕</button>
          </div>
          
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {routeInfo ? (
              <div style={{ flex: 1, display: "flex", gap: 12, fontSize: 13, fontWeight: 700, color: "#4a7aff" }}>
                <span>📍 {routeInfo.distance}</span>
                <span>⏱ {routeInfo.duration}</span>
              </div>
            ) : (
              <div style={{ flex: 1, fontSize: 12, color: "#a8a49c" }}>
                {userLocation ? "⏳ Считаем путь..." : "📍 Включите GPS для расчета"}
              </div>
            )}
            
            <div style={{ display: "flex", gap: 4 }}>
              {activeOrder.status === "ASSIGNED" && (
                <button 
                  onClick={async () => {
                    await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "IN_DELIVERY" }) });
                    fetchOrders();
                  }}
                  style={{ padding: "6px 10px", borderRadius: 6, background: "#10b981", color: "#fff", border: "none", fontSize: 11, fontWeight: 700 }}
                >
                  Поехал
                </button>
              )}
              {activeOrder.status === "IN_DELIVERY" && (
                <button 
                  onClick={async () => {
                    await fetch(`/api/orders/${activeOrder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DELIVERED" }) });
                    setActiveOrderId(null);
                    fetchOrders();
                  }}
                  style={{ padding: "6px 10px", borderRadius: 6, background: "#4a7aff", color: "#fff", border: "none", fontSize: 11, fontWeight: 700 }}
                >
                  Доставил
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Карта */}
      <div ref={mapRef} style={{ flex: 1, width: "100%", background: "#e8e6df" }} />
    </div>
  );
}