// src/app/courier/points/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

interface CourierOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string } | null;
}

function hasCoords(o: CourierOrder): o is CourierOrder & { lat: number; lng: number } {
  return o.lat !== null && o.lng !== null;
}

export default function CourierPointsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const mapInitialized = useRef(false);
  const initialCenterDone = useRef(false); // 🔥 Флаг первого автоцентрирования

  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000); // Полллинг каждые 15 сек
    return () => clearInterval(interval);
  }, []);

  // Инициализация карты
  useEffect(() => {
    if (mapInitialized.current) return;

    function initMap() {
      if (!mapRef.current || mapInitialized.current) return;
      mapInitialized.current = true;
      ymapRef.current = new window.ymaps.Map(mapRef.current, {
        center: [55.75, 37.61], 
        zoom: 12, 
        controls: ["zoomControl", "geolocationControl"] 
      }, {});

      const geoControl = ymapRef.current.controls.get('geolocationControl');
      if (geoControl) geoControl.events.add('locationchange', () => {});
    }

    if (typeof window === "undefined") return;

    if (window.ymaps) {
      window.ymaps.ready(initMap);
    } else {
      const existing = document.querySelector(`script[src*="api-maps.yandex.ru"]`);
      if (!existing) {
        const s = document.createElement("script");
        s.src = `https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
        s.onload = () => window.ymaps.ready(initMap);
        document.head.appendChild(s);
      } else {
        existing.addEventListener("load", () => window.ymaps.ready(initMap));
      }
    }
  }, []);

  // Отрисовка маршрутов и маркеров
  useEffect(() => {
    if (!window?.ymaps) return;

    if (!ymapRef.current) {
      const wait = setInterval(() => {
        if (ymapRef.current) { clearInterval(wait); renderMarkers(); }
      }, 100);
      return () => clearInterval(wait);
    }

    renderMarkers();

    function renderMarkers() {
      if (!ymapRef.current) return;
      ymapRef.current.geoObjects.removeAll();

      const validOrders = orders.filter(o => hasCoords(o) && o.status !== "DELIVERED");

      const routeGroups: Record<string, CourierOrder[]> = {};
      validOrders.forEach(o => {
        const key = o.route?.id || "no-route";
        if (!routeGroups[key]) routeGroups[key] = [];
        routeGroups[key].push(o);
      });

      if (window.ymaps.multiRouter) {
        Object.values(routeGroups).forEach(routeOrders => {
          if (routeOrders.length < 2) return; 
          
          const sorted = routeOrders.sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
          const points = sorted.filter(hasCoords).map(o => [o.lat, o.lng]);

          const multiRoute = new window.ymaps.multiRouter.MultiRoute({
            referencePoints: points,
            params: { routingMode: 'auto' } 
          }, {
            boundsAutoApply: false,
            wayPointVisible: false,   
            viaPointVisible: false,
            routeActiveStrokeWidth: 4,
            routeActiveStrokeColor: "#4a7aff",
            routeStrokeWidth: 0       
          });
          ymapRef.current.geoObjects.add(multiRoute);
        });
      }

      validOrders.forEach(o => {
        if (!hasCoords(o)) return;
        const coords: [number, number] = [o.lat, o.lng]; 
        const isDelivery = o.status === "IN_DELIVERY";
        const isSelected = o.id === activeOrderId;

        const pm = new window.ymaps.Placemark(coords, {
          balloonContent: o.address,
          iconContent: o.routeOrder ? String(o.routeOrder) : undefined
        }, {
          preset: isSelected
            ? "islands#redCircleIcon" 
            : isDelivery
              ? "islands#greenCircleIcon" 
              : "islands#blueCircleIcon"  
        });

        pm.events.add("click", () => {
          setActiveOrderId(o.id);
          setShowList(false);
        });

        ymapRef.current.geoObjects.add(pm);
      });

      // 🔥 АВТОЦЕНТРИРОВАНИЕ ТОЛЬКО ОДИН РАЗ
      if (!activeOrderId && validOrders.length > 0 && !initialCenterDone.current) {
        setTimeout(() => {
          const bounds = ymapRef.current?.geoObjects.getBounds();
          if (bounds) {
            ymapRef.current.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, maxZoom: 14 });
            initialCenterDone.current = true; // Запоминаем, что уже центрировали
          }
        }, 150);
      }
    }
  }, [orders, activeOrderId]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    setActiveOrderId(null);
    
    // 🔥 Если курьер сменил статус (например, доставил), отдаляем карту, чтобы показать следующий заказ
    setTimeout(() => {
      const bounds = ymapRef.current?.geoObjects.getBounds();
      if (bounds) ymapRef.current.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, maxZoom: 14 });
    }, 200);

    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
  };

  const handleListPointClick = (order: CourierOrder) => {
    setActiveOrderId(order.id);
    setShowList(false);
    if (hasCoords(order) && ymapRef.current) {
      ymapRef.current.setCenter([order.lat, order.lng], 16, { duration: 300 });
    }
  };

  const toggleRoute = (rId: string) => {
    setExpandedRoutes(prev => ({ ...prev, [rId]: !(prev[rId] ?? true) }));
  };

  const activeOrder = orders.find(o => o.id === activeOrderId);
  const activeOrdersCount = orders.filter(o => o.status !== "DELIVERED").length;

  const groupedOrders: Record<string, CourierOrder[]> = {};
  orders.filter(o => o.status !== "DELIVERED").forEach(o => {
    const key = o.route?.id || "no-route";
    if (!groupedOrders[key]) groupedOrders[key] = [];
    groupedOrders[key].push(o);
  });
  const routeKeys = Object.keys(groupedOrders).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>

      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Карта доставок</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#a8a49c", marginTop: 2 }}>{activeOrdersCount} точек на карте</p>
        </div>
        <button
          onClick={() => setShowList(!showList)}
          style={{ background: showList ? "#1a1a18" : "#f5f4f0", color: showList ? "#fff" : "#1a1a18", border: "1px solid #e8e6df", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}
        >
          {showList ? "Скрыть список" : "☰ Список точек"}
        </button>
      </div>

      <div ref={mapRef} style={{ flex: 1, width: "100%", background: "#e8e6df", touchAction: "none" }} />
      {showList && (
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, bottom: activeOrder ? 180 : 0, background: "#f5f4f0", zIndex: 20, overflowY: "auto", padding: 12 }}>
          {routeKeys.map((rId) => {
            const routePoints = groupedOrders[rId].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
            const isExpanded = expandedRoutes[rId] ?? true;
            const routeName = routePoints[0]?.route?.name || "Без маршрута";

            return (
              <div key={rId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", marginBottom: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                <div onClick={() => toggleRoute(rId)} style={{ padding: "12px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Маршрут {routeName}</div>
                  <div style={{ fontSize: 16, color: "#a8a49c", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</div>
                </div>

                {isExpanded && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {routePoints.map((o, idx) => (
                      <div
                        key={o.id}
                        onClick={() => handleListPointClick(o)}
                        style={{ padding: "12px 16px", borderBottom: idx < routePoints.length - 1 ? "1px solid #f0efe9" : "none", display: "flex", gap: 12, cursor: "pointer" }}
                      >
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: o.status === "IN_DELIVERY" ? "#10b981" : "#1a1a18", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {o.routeOrder || "•"}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18", marginBottom: 4 }}>{o.address}</div>
                          <div style={{ fontSize: 12, color: "#a8a49c" }}>{o.slotRaw} · {o.externalId ?? o.crmId}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {routeKeys.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#a8a49c" }}>Нет активных точек</div>}
        </div>
      )}

      {activeOrder && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px", background: "#fff", borderTop: "1px solid #e8e6df", boxShadow: "0 -4px 20px rgba(0,0,0,0.1)", zIndex: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a7aff", textTransform: "uppercase", marginBottom: 4 }}>
                {activeOrder.status === "IN_DELIVERY" ? "🚀 Везем сейчас" : "Ожидает"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18" }}>{activeOrder.address}</div>
              <div style={{ fontSize: 12, color: "#6b6860", marginTop: 4 }}>Заказ {activeOrder.externalId ?? activeOrder.crmId} · Слот: {activeOrder.slotRaw}</div>
            </div>
            <button 
              onClick={() => {
                setActiveOrderId(null);
                // 🔥 Принудительно возвращаем карту к общему виду при закрытии заказа крестиком
                const bounds = ymapRef.current?.geoObjects.getBounds();
                if (bounds) ymapRef.current.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50, maxZoom: 14 });
              }} 
              style={{ background: "none", border: "none", fontSize: 24, color: "#a8a49c", padding: 0 }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {activeOrder.status === "ASSIGNED" && (
              <button onClick={() => handleStatusChange(activeOrder.id, "IN_DELIVERY")} style={{ flex: 1, padding: "14px", borderRadius: 10, background: "#4a7aff", color: "#fff", border: "none", fontWeight: 600, fontSize: 15 }}>
                Поехал сюда
              </button>
            )}
            {activeOrder.status === "IN_DELIVERY" && (
              <button onClick={() => handleStatusChange(activeOrder.id, "DELIVERED")} style={{ flex: 1, padding: "14px", borderRadius: 10, background: "#10b981", color: "#fff", border: "none", fontWeight: 600, fontSize: 15 }}>
                Отметить доставленным
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}