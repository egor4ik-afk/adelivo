// src/app/courier/points/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

interface CourierOrder {
  id: string; externalId: string; address: string; status: string; crmId: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
}

export default function CourierPointsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // 🔥 Получаем реальные данные
  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !window.ymaps) {
      const s = document.createElement("script");
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
      s.onload = () => window.ymaps.ready(initMap);
      document.head.appendChild(s);
    } else if (window.ymaps) {
      window.ymaps.ready(initMap);
    }

    function initMap() {
      if (mapRef.current && !ymapRef.current) {
        ymapRef.current = new window.ymaps.Map(mapRef.current, {
          center: [55.75, 37.61], zoom: 12, controls: ["zoomControl"]
        }, {}); 
      }
    }
  }, []);

  useEffect(() => {
    if (!ymapRef.current || !window.ymaps || orders.length === 0) return;
    ymapRef.current.geoObjects.removeAll();

    orders.forEach(o => {
      if (!o.lat || !o.lng || o.status === "DELIVERED") return; // Доставленные на карте не нужны
      const isDelivery = o.status === "IN_DELIVERY";
      
      const pm = new window.ymaps.Placemark([o.lat, o.lng], {
        balloonContent: o.address
      }, { preset: isDelivery ? 'islands#greenDotIcon' : 'islands#blueDotIcon' });

      pm.events.add("click", () => setActiveOrderId(o.id));
      ymapRef.current.geoObjects.add(pm);
    });

    if (ymapRef.current.geoObjects.getBounds()) {
      ymapRef.current.setBounds(ymapRef.current.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 20 });
    }
  }, [orders]);

  // 🔥 Функция смены статуса (сохраняется в БД)
  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    setActiveOrderId(null);
    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
  };

  const activeOrder = orders.find(o => o.id === activeOrderId);
  const activeOrdersCount = orders.filter(o => o.status !== "DELIVERED").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои точки на сегодня</h1>
        <p style={{ margin: 0, fontSize: 12, color: "#a8a49c", marginTop: 2 }}>{activeOrdersCount} заказов ожидают доставки</p>
      </div>

      <div ref={mapRef} style={{ flex: 1, width: "100%", background: "#e8e6df" }} />

      {activeOrder && (
        <div style={{ padding: "16px", background: "#fff", borderTop: "1px solid #e8e6df", boxShadow: "0 -4px 16px rgba(0,0,0,0.05)", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a7aff", textTransform: "uppercase", marginBottom: 4 }}>
                {activeOrder.status === "IN_DELIVERY" ? "🚀 Везем сейчас" : "Ожидает"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18" }}>{activeOrder.address}</div>
              <div style={{ fontSize: 12, color: "#6b6860", marginTop: 4 }}>Заказ {activeOrder.externalId ?? activeOrder.crmId} · Слот: {activeOrder.slotRaw}</div>
            </div>
            <button onClick={() => setActiveOrderId(null)} style={{ background: "none", border: "none", fontSize: 20, color: "#a8a49c" }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {activeOrder.status === "ASSIGNED" && (
              <button onClick={() => handleStatusChange(activeOrder.id, "IN_DELIVERY")} style={{ flex: 1, padding: "12px", borderRadius: 8, background: "#4a7aff", color: "#fff", border: "none", fontWeight: 600, fontSize: 14 }}>
                Поехал сюда
              </button>
            )}
            {activeOrder.status === "IN_DELIVERY" && (
              <button onClick={() => handleStatusChange(activeOrder.id, "DELIVERED")} style={{ flex: 1, padding: "12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontWeight: 600, fontSize: 14 }}>
                Отметить доставленным
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}