// src/app/courier/routes/page.tsx
"use client";
import { useState, useEffect } from "react";

interface RouteOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  slotRaw: string | null; customerPhone: string | null; recipientPhone: string | null;
  price: number | null; items: string | null; comment: string | null;
  routeId: string | null; routeOrder: number | null; customerName: string | null;
  deliveryDate: string | null; // 🔥 Добавили для фильтрации по дате
  route?: { id: string; name: string; link: string | null; date: string } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
};

export default function CourierRoutesPage() {
  const [orders, setOrders] = useState<RouteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});
  const [showPast, setShowPast] = useState(false); // 🔥 Состояние для аккордеона прошлых заказов

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
  };

  const toggleRoute = (routeId: string) => {
    setExpandedRoutes(prev => ({ ...prev, [routeId]: !(prev[routeId] ?? true) }));
  };

  if (loading) return <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка маршрутов...</div>;

  // 🔥 Получаем сегодняшнюю дату в формате YYYY-MM-DD (по Москве)
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

  const todayOrders: RouteOrder[] = [];
  const pastOrders: RouteOrder[] = [];

  // 🔥 Разделяем заказы на сегодня/будущие и прошлые
  orders.forEach(o => {
    const d = o.route?.date || (o.deliveryDate ? o.deliveryDate.split('T')[0] : null) || todayStr;
    if (d >= todayStr) {
      todayOrders.push(o);
    } else {
      pastOrders.push(o);
    }
  });

  // Группируем сегодняшние по маршрутам
  const todayGrouped: Record<string, RouteOrder[]> = {};
  todayOrders.forEach(o => {
    const key = o.route?.id || "Без маршрута";
    if (!todayGrouped[key]) todayGrouped[key] = [];
    todayGrouped[key].push(o);
  });
  const todayRouteKeys = Object.keys(todayGrouped).sort();

  // Группируем прошлые по датам
  const pastGrouped: Record<string, RouteOrder[]> = {};
  pastOrders.forEach(o => {
    const d = o.route?.date || (o.deliveryDate ? o.deliveryDate.split('T')[0] : "Ранее");
    if (!pastGrouped[d]) pastGrouped[d] = [];
    pastGrouped[d].push(o);
  });
  // Сортируем даты по убыванию (свежие сверху)
  const pastDates = Object.keys(pastGrouped).sort((a, b) => b.localeCompare(a)); 

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f5f4f0", overflowY: "auto", paddingBottom: 80 }}>
      
      {/* Шапка с правильным счетчиком */}
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои маршруты</h1>
        <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>На сегодня: {todayOrders.length} точек</div>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        
        {/* АКТУАЛЬНЫЕ МАРШРУТЫ НА СЕГОДНЯ */}
        {todayRouteKeys.map((rId) => {
          const routePoints = todayGrouped[rId].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
          const isExpanded = expandedRoutes[rId] ?? true;
          const routeSum = routePoints.reduce((sum, o) => sum + (o.price || 0), 0);

          const routeObj = routePoints[0]?.route;
          const routeName = routeObj ? routeObj.name : "Без маршрута";
          const routeLink = routeObj ? routeObj.link : null;

          return (
            <div key={rId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div
                onClick={() => toggleRoute(rId)}
                style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Маршрут {routeName}</div>
                  <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>
                    Активных: {routePoints.filter(o => o.status !== "DELIVERED").length} · Всего: {routePoints.length}
                  </div>
                </div>
                <div style={{ fontSize: 18, color: "#a8a49c", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</div>
              </div>

              {isExpanded && (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>

                  {routeLink && (
                    <a
                      href={routeLink}
                      target="_blank"
                      style={{ display: "block", background: "#facc15", color: "#1a1a18", textAlign: "center", padding: "10px", borderRadius: 8, textDecoration: "none", fontWeight: 700, fontSize: 13, marginBottom: 4 }}
                    >
                      📍 Открыть в Навигаторе
                    </a>
                  )}

                  {routePoints.map((o) => {
                    const st = STATUS_MAP[o.status] || STATUS_MAP.ASSIGNED;
                    const phone = o.recipientPhone || o.customerPhone || "—";

                    return (
                      <div key={o.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #f0efe9", padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                              {o.routeOrder || "•"}
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{o.slotRaw}</div>
                            </div>
                          </div>

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

                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", marginBottom: 10, lineHeight: 1.3 }}>{o.address}</div>

                        <div style={{ background: "#f5f4f0", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 2 }}>Номер получателя</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>
                            {phone !== "—" ? <a href={`tel:${phone}`} style={{ color: "#4a7aff", textDecoration: "none" }}>{phone}</a> : "—"}
                          </div>
                          {o.comment && <div style={{ fontSize: 12, color: "#d94040", marginTop: 6, fontWeight: 500 }}>⚠ {o.comment}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 🔥 ПРОШЛЫЕ ЗАКАЗЫ (АККОРДЕОН ПО ДАТАМ) */}
        {pastOrders.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", marginTop: 8 }}>
            <div
              onClick={() => setShowPast(!showPast)}
              style={{ padding: "14px 16px", background: "#fafaf8", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Прошлые заказы</div>
              <div style={{ fontSize: 13, color: "#a8a49c", fontWeight: 600 }}>{pastOrders.length} {showPast ? "▲" : "▼"}</div>
            </div>

            {showPast && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                {pastDates.map(date => (
                  <div key={date}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#a8a49c", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      {/* Красиво форматируем дату: Ср, 15 марта */}
                      {date === "Ранее" ? "Неизвестная дата" : new Date(date).toLocaleDateString("ru-RU", { weekday: 'short', day: 'numeric', month: 'long' })}
                    </div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {pastGrouped[date].map(o => {
                          const st = STATUS_MAP[o.status] || STATUS_MAP.ASSIGNED;
                          return (
                            <div key={o.id} style={{ background: "#fafaf8", borderRadius: 8, padding: 12, border: "1px solid #f0efe9" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <div style={{ fontSize: 11, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: st.bg, color: st.color }}>
                                  {st.label}
                                </div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", marginBottom: 4 }}>{o.address}</div>
                              {o.items && <div style={{ fontSize: 11, color: "#6b6860" }}>{o.items}</div>}
                            </div>
                          );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        
        {todayOrders.length === 0 && pastOrders.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#a8a49c", fontSize: 14 }}>
            Нет назначенных заказов
          </div>
        )}
      </div>
    </div>
  );
}