// src/app/courier/routes/page.tsx
"use client";
import { useState, useEffect } from "react";

// Расширенный интерфейс заказа для курьера
interface RouteOrder {
  id: string; externalId: string; address: string; status: string;
  slotRaw: string | null; customerName: string | null;
  customerPhone: string | null; customerEmail: string | null;
  price: number | null; items: string | null; comment: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
};

export default function CourierRoutesPage() {
  const [orders, setOrders] = useState<RouteOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // В реальном приложении здесь будет fetch("/api/courier/orders")
  useEffect(() => {
    setOrders([
      { id: "1", externalId: "1055-A", address: "ул. Ленина, 42, кв 15", status: "ASSIGNED", slotRaw: "10:00 - 12:00", customerName: "Иван Иванов", customerPhone: "+7 (999) 123-45-67", customerEmail: null, price: 3500, items: "Букет красных роз — 1шт", comment: "Позвонить за час" },
      { id: "2", externalId: "1056-B", address: "пр. Мира, 15", status: "IN_DELIVERY", slotRaw: "12:00 - 14:00", customerName: "Анна Смирнова", customerPhone: "+7 (900) 000-00-00", customerEmail: "anna@mail.ru", price: 1200, items: "Пионы — 3шт", comment: null },
    ]);
    setLoading(false);
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    // Оптимистичное обновление интерфейса
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    // Тут будет fetch("/api/orders/...", { method: "PATCH", body: JSON.stringify({ status: newStatus }) })
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка маршрута...</div>;

  const totalSum = orders.reduce((sum, o) => sum + (o.price || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto" }}>
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Маршрутный лист</h1>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 12, color: "#a8a49c" }}>{orders.length} доставок на сегодня</span>
          <span style={{ fontSize: 12, color: "#1a1a18", fontWeight: 700 }}>Сумма: {totalSum} ₽</span>
        </div>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.map((o, index) => {
          const st = STATUS_MAP[o.status] || STATUS_MAP.ASSIGNED;
          return (
            <div key={o.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{index + 1}</div>
                  <div>
                    <div style={{ fontSize: 11, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>Слот: {o.slotRaw}</div>
                  </div>
                </div>
                
                {/* Дропдаун смены статуса прямо в карточке */}
                <select 
                  value={o.status} 
                  onChange={(e) => handleStatusChange(o.id, e.target.value)}
                  style={{ background: st.bg, color: st.color, border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", WebkitAppearance: "none" }}
                >
                  <option value="ASSIGNED">Назначен</option>
                  <option value="IN_DELIVERY">🚀 В пути</option>
                  <option value="DELIVERED">✅ Доставлен</option>
                </select>
              </div>

              <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18", marginBottom: 12, lineHeight: 1.3 }}>{o.address}</div>

              <div style={{ background: "#fafaf8", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a18", display: "flex", justifyContent: "space-between" }}>
                  {o.customerName || "Без имени"}
                  {o.customerPhone && <a href={`tel:${o.customerPhone}`} style={{ color: "#4a7aff", textDecoration: "none" }}>{o.customerPhone}</a>}
                </div>
                {o.comment && <div style={{ fontSize: 12, color: "#d94040", marginTop: 4, fontWeight: 500 }}>⚠ {o.comment}</div>}
              </div>

              <div style={{ borderTop: "1px dashed #e8e6df", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase", marginBottom: 2 }}>Состав заказа</div>
                  <div style={{ fontSize: 12, color: "#6b6860" }}>{o.items}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a18", whiteSpace: "nowrap", marginLeft: 12 }}>{o.price} ₽</div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}