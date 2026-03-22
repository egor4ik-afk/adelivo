// src/app/courier/points/page.tsx
"use client";
import { useState, useEffect, useRef } from "react";

// Упрощенный тип заказа для курьера
interface CourierOrder {
  id: string; externalId: string; address: string; status: string;
  lat: number | null; lng: number | null; slotRaw: string | null;
}

export default function CourierPointsPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Временная заглушка (потом заменим на fetch("/api/courier/my-orders"))
  useEffect(() => {
    setOrders([
      { id: "1", externalId: "1055-A", address: "ул. Ленина, 42", status: "ASSIGNED", lat: 55.75, lng: 37.61, slotRaw: "10:00 - 12:00" },
      { id: "2", externalId: "1056-B", address: "пр. Мира, 15", status: "IN_DELIVERY", lat: 55.76, lng: 37.62, slotRaw: "12:00 - 14:00" },
    ]);
  }, []);

  // Инициализация карты
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
        }, {}); // <--- Пустой объект для TypeScript
      }
    }
  }, []); // <--- ВОТ ЗДЕСЬ НЕ ХВАТАЛО ЗАКРЫВАЮЩИХ СКОБОК!

  // Рисуем точки на карте
  useEffect(() => {
    if (!ymapRef.current || !window.ymaps || orders.length === 0) return;
    ymapRef.current.geoObjects.removeAll();

    orders.forEach(o => {
      if (!o.lat || !o.lng) return;
      const isDelivery = o.status === "IN_DELIVERY";
      
      const pm = new window.ymaps.Placemark([o.lat, o.lng], {
        balloonContent: o.address
      }, {
        preset: isDelivery ? 'islands#greenDotIcon' : 'islands#blueDotIcon'
      });

      pm.events.add("click", () => setActiveOrderId(o.id));
      ymapRef.current.geoObjects.add(pm);
    });

    ymapRef.current.setBounds(ymapRef.current.geoObjects.getBounds(), { checkZoomRange: true, zoomMargin: 20 });
  }, [orders]);

  const activeOrder = orders.find(o => o.id === activeOrderId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Заголовок */}
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои точки на сегодня</h1>
        <p style={{ margin: 0, fontSize: 12, color: "#a8a49c", marginTop: 2 }}>{orders.length} заказов ожидают доставки</p>
      </div>

      {/* Карта */}
      <div ref={mapRef} style={{ flex: 1, width: "100%", background: "#e8e6df" }} />

      {/* Всплывающая карточка активного заказа */}
      {activeOrder && (
        <div style={{ padding: "16px", background: "#fff", borderTop: "1px solid #e8e6df", boxShadow: "0 -4px 16px rgba(0,0,0,0.05)", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4a7aff", textTransform: "uppercase", marginBottom: 4 }}>
                {activeOrder.status === "IN_DELIVERY" ? "🚀 Везем сейчас" : "Ожидает"}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18" }}>{activeOrder.address}</div>
              <div style={{ fontSize: 12, color: "#6b6860", marginTop: 4 }}>Заказ {activeOrder.externalId} · Слот: {activeOrder.slotRaw}</div>
            </div>
            <button onClick={() => setActiveOrderId(null)} style={{ background: "none", border: "none", fontSize: 20, color: "#a8a49c" }}>✕</button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {activeOrder.status === "ASSIGNED" && (
              <button style={{ flex: 1, padding: "12px", borderRadius: 8, background: "#4a7aff", color: "#fff", border: "none", fontWeight: 600, fontSize: 14 }}>
                Поехал сюда
              </button>
            )}
            {activeOrder.status === "IN_DELIVERY" && (
              <button style={{ flex: 1, padding: "12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none", fontWeight: 600, fontSize: 14 }}>
                Отметить доставленным
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}