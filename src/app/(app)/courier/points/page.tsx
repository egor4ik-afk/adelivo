// src/app/(app)/courier/points/page.tsx
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
  { id: 'ASSEMBLING', label: 'В сборке', color: '#d97706' },
  { id: 'DELIVERED', label: 'Доставлен', color: '#a8a49c' },
  { id: 'ALL', label: 'Все', color: '#1a1a18' },
];

export default function CourierPointsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const mapInitialized = useRef(false);
  const boundsInitialized = useRef(false);
  const activeRouteRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [isCardMinimized, setIsCardMinimized] = useState(false);

  const [filterStatus, setFilterStatus] = useState<'IN_DELIVERY' | 'ASSIGNED' | 'ASSEMBLING' | 'DELIVERED' | 'ALL'>('IN_DELIVERY');
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

  const lastLocationSentRef = useRef<number>(0);
  const lastLocationRef = useRef<[number, number] | null>(null);

  // Геолокация пользователя
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setUserLocation([lat, lng]);

          const now = Date.now();
          const last = lastLocationRef.current;
          const distChanged = !last || Math.abs(lat - last[0]) > 0.0005 || Math.abs(lng - last[1]) > 0.0005;
          const timeOk = now - lastLocationSentRef.current > 30_000;
          if (!distChanged && !timeOk) return;
          lastLocationSentRef.current = now;
          lastLocationRef.current = [lat, lng];

          fetch("/api/courier/location", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng })
          }).catch(() => { });
        },
        (err) => console.warn("Геолокация недоступна", err),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // Инициализация карты v3
  useEffect(() => {
    if (mapInitialized.current) return;

    async function initMap() {
      if (!mapRef.current || mapInitialized.current) return;
      mapInitialized.current = true;

      try {
        await window.ymaps3!.ready;
        const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer } = window.ymaps3;

        // Создаем карту v3
        const map = new YMap(mapRef.current, {
          location: { center: [37.61, 55.75], zoom: 11 }, // [Lng, Lat]
          behaviors: ['drag', 'scrollZoom', 'pinchZoom', 'mouseRotate', 'mouseTilt', 'multiTouch']
        });

        map.addChild(new YMapDefaultSchemeLayer());
        map.addChild(new YMapDefaultFeaturesLayer());

        ymapRef.current = map;
        setMapReady(true);
      } catch (e) {
        console.error("Ошибка инициализации карты v3:", e);
      }
    }

    if (typeof window !== "undefined") {
      const checkYmaps = setInterval(() => {
        if (window.ymaps3) {
          clearInterval(checkYmaps);
          initMap();
        }
      }, 100);
      setTimeout(() => clearInterval(checkYmaps), 10000);
    }
  }, []);

  // Построение маршрута (v3)
  const buildRouteToPoint = useCallback(async (to: [number, number], mode: "auto" | "mt") => {
    if (!userLocation || !window.ymaps3 || !ymapRef.current) return;

    if (activeRouteRef.current) {
      ymapRef.current.removeChild(activeRouteRef.current);
      activeRouteRef.current = null;
    }
    setRouteInfo(null);

    try {
      const routes = await window.ymaps3.route({
        points: [
          [userLocation[1], userLocation[0]], // Стартовая точка [Lng, Lat]
          [to[1], to[0]]                      // Конечная точка [Lng, Lat]
        ],
        type: mode === "mt" ? "transit" : "driving"
      });

      if (!routes || routes.length === 0) return;

      const route = routes[0];
      
      setRouteInfo({
        distance: route.properties.distance?.text || "—",
        duration: route.properties.duration?.text || "—"
      });

      const { YMapFeature } = window.ymaps3;
      const routeFeature = new YMapFeature({
        geometry: route.toRoute().geometry,
        style: { stroke: [{ color: '#4a7aff', width: 6 }] }
      });

      ymapRef.current.addChild(routeFeature);
      activeRouteRef.current = routeFeature;
    } catch (error) {
      console.error("Ошибка построения маршрута:", error);
    }
  }, [userLocation]);

  useEffect(() => {
    if (activeOrderId && userLocation) {
      const order = orders.find(o => o.id === activeOrderId);
      if (order && hasCoords(order)) {
        buildRouteToPoint([order.lat, order.lng], routeType);
      }
    }
  }, [routeType, activeOrderId, userLocation, buildRouteToPoint, orders]);

  // Отрисовка маркеров и автозум (v3)
  useEffect(() => {
    if (!mapReady || !ymapRef.current) return;

    const filteredOrders = orders.filter(o => {
      if (!hasCoords(o)) return false;
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
      if (oDate && oDate !== filterDate) return false;
      if (filterStatus === 'ALL') return true;
      return o.status === filterStatus;
    });

    async function updateMarkers() {
      const { YMapDefaultMarker } = await window.ymaps3.import('@yandex/ymaps3-default-ui-theme');

      markersRef.current.forEach((pm) => ymapRef.current.removeChild(pm));
      markersRef.current.clear();

      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

      filteredOrders.forEach(o => {
        if (!hasCoords(o)) return;

        minLng = Math.min(minLng, o.lng);
        minLat = Math.min(minLat, o.lat);
        maxLng = Math.max(maxLng, o.lng);
        maxLat = Math.max(maxLat, o.lat);

        const isSelected = o.id === activeOrderId;
        
        let color = "#4a7aff";
        if (isSelected) color = "#ef4444";
        else if (o.status === "DELIVERED") color = "#a8a49c";
        else if (o.status === "IN_DELIVERY") color = "#10b981";

        const pm = new YMapDefaultMarker({
          coordinates: [o.lng, o.lat], // В v3: [Lng, Lat]
          title: o.routeOrder ? String(o.routeOrder) : "",
          subtitle: o.address,
          color: color,
          onClick: () => {
            setActiveOrderId(o.id);
            setIsCardMinimized(false);
          }
        });

        ymapRef.current.addChild(pm);
        markersRef.current.set(o.id, pm);
      });

      if (filteredOrders.length > 0 && !boundsInitialized.current) {
        boundsInitialized.current = true;
        if (minLng !== Infinity) {
          ymapRef.current.setLocation({
            bounds: [[minLng, minLat], [maxLng, maxLat]], // [[lng, lat], [lng, lat]]
            duration: 500
          });
        }
      }
    }

    updateMarkers();
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
                {(activeOrder.status === "ASSIGNED" || activeOrder.status === "ASSEMBLING") && (
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

      <div ref={mapRef} style={{ flex: 1, width: "100%", touchAction: 'none' }} />
    </div>
  );
}