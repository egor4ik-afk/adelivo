// src/app/design/page.tsx
"use client";
import { useState } from "react";

const STORE_COORDS = "55.749511,37.596205";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
};

// Строгий интерфейс заказа для песочницы
interface DesignOrder {
  id: string; externalId: string; address: string; status: string;
  name: string; recipientPhone: string; price: number | null; wrongPrice: boolean;
  items: string; comment: string; opComment: string;
  eta: string | null; slotRaw: string | null; routeOrder: number; lat: number; lng: number;
  photoUrl: string | null; deliveredAt: string | null; pickedUpAt: string | null;
}

const initialOrders: DesignOrder[] = [
  {
    id: "1", externalId: "ORD-001", address: "ул. Тверская, д. 7, кв 15",
    status: "ASSIGNED", name: "Анна", recipientPhone: "+7 999 123 45 67",
    price: 3500, wrongPrice: false, items: "Розы красные - 15 шт\nОткрытка 'С любовью'",
    comment: "Позвонить за час, спит ребенок", opComment: "💡 Клиент просил быть аккуратнее с домофоном",
    eta: "14:45", slotRaw: null, routeOrder: 1, lat: 55.75, lng: 37.61, photoUrl: null, deliveredAt: null, pickedUpAt: null
  },
  {
    id: "2", externalId: "ORD-002", address: "Пресненская наб., д. 2 (Москва-Сити)",
    status: "ASSIGNED", name: "Иван", recipientPhone: "+7 900 000 00 00",
    price: null, wrongPrice: false, items: "Пионы белые - 5 шт\nЭустома - 3 шт\nУпаковка крафт\nЛента шелковая\nТоппер",
    comment: "", opComment: "",
    eta: null, slotRaw: "15:00 - 18:00", routeOrder: 2, lat: 55.74, lng: 37.53, photoUrl: null, deliveredAt: null, pickedUpAt: null
  },
  {
    id: "3", externalId: "ORD-003", address: "ул. Арбат, д. 10",
    status: "DELIVERED", name: "Мария", recipientPhone: "—",
    price: 0, wrongPrice: false, items: "Сборный букет 'Весна'",
    comment: "Оставить у двери", opComment: "💡 Доставка сюрпризом",
    eta: "13:00", slotRaw: null, routeOrder: 3, lat: 55.75, lng: 37.59, 
    photoUrl: "https://images.unsplash.com/photo-1563241598-bc5a8e388bd1?q=80&w=150&auto=format&fit=crop", 
    deliveredAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), pickedUpAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  }
];

export default function DesignSandboxPage() {
  // === ГЛОБАЛЬНЫЕ СТЕЙТЫ МАРШРУТА ===
  const [isAccepted, setIsAccepted] = useState(false); // Управляет синим баннером
  const [plannedTime, setPlannedTime] = useState<string | null>("14:30");
  const [timeChangedByOperator, setTimeChangedByOperator] = useState(false); // Управляет желтой кнопкой
  const [baseTime, setBaseTime] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  
  // === СТЕЙТЫ ЗАКАЗОВ ===
  const [orders, setOrders] = useState<DesignOrder[]>(initialOrders);
  const [collapsedOrders, setCollapsedOrders] = useState<Record<string, boolean>>({ "3": true });
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  // === ВЫЧИСЛЕНИЯ ===
  const total = orders.length;
  const delivered = orders.filter(o => o.status === "DELIVERED").length;
  const routePriceTotal = orders.reduce((sum, o) => sum + (o.price || 0), 0);
  
  const hasStarted = orders.some(o => o.status === "IN_DELIVERY" || o.status === "DELIVERED");
  const isAllDelivered = total > 0 && delivered === total;

  let pickedUpTimeStr = null;
  if (hasStarted) {
    const firstStarted = orders.find(p => p.pickedUpAt);
    if (firstStarted?.pickedUpAt) {
        pickedUpTimeStr = new Date(firstStarted.pickedUpAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } else {
        pickedUpTimeStr = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
  }

  const routeObj = {
    name: "Центр (Тест)",
    departureAdvice: !plannedTime ? "до 15:00" : null,
    estimatedReturnTime: "18:45"
  };

  const advice = plannedTime ? `Забрать в ${plannedTime}` : (routeObj.departureAdvice ?? null);

  // === ЭМУЛЯЦИЯ ДЕЙСТВИЙ (ФУНКЦИИ) ===
  const handleStatusChange = (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        return {
          ...o, status: newStatus,
          deliveredAt: newStatus === "DELIVERED" ? new Date().toISOString() : o.deliveredAt,
          pickedUpAt: newStatus === "IN_DELIVERY" && !o.pickedUpAt ? new Date().toISOString() : o.pickedUpAt
        };
      }
      return o;
    }));
  };

  const handlePickupAll = () => {
    setOrders(prev => prev.map(o => o.status === "ASSIGNED" ? { ...o, status: "IN_DELIVERY", pickedUpAt: new Date().toISOString() } : o));
  };

  const handlePhotoUpload = (orderId: string) => {
    setUploading(prev => ({ ...prev, [orderId]: true }));
    setTimeout(() => {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, photoUrl: "https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?q=80&w=150&auto=format&fit=crop" } : o));
      setUploading(prev => ({ ...prev, [orderId]: false }));
    }, 1200);
  };

  // 🔥 МАКРОСЫ ДЛЯ ПАНЕЛИ УПРАВЛЕНИЯ
  const setScenarioNewRoute = () => {
    setOrders(initialOrders.map(o => ({...o, status: "ASSIGNED", deliveredAt: null, pickedUpAt: null})));
    setIsAccepted(false);
    setTimeChangedByOperator(false);
  };

  const setScenarioAccepted = () => {
    setOrders(initialOrders.map(o => ({...o, status: "ASSIGNED", deliveredAt: null, pickedUpAt: null})));
    setIsAccepted(true);
    setTimeChangedByOperator(false);
  };

  const setScenarioInDelivery = () => {
    setIsAccepted(true);
    setTimeChangedByOperator(false);
    setOrders(initialOrders.map((o, i) => i === 0 ? {...o, status: "DELIVERED", deliveredAt: new Date().toISOString()} : {...o, status: "IN_DELIVERY", pickedUpAt: new Date().toISOString()}));
  };

  return (
    <div style={{ padding: 20, background: "#1a1a18", minHeight: "100vh", fontFamily: "sans-serif" }}>
      
      {/* ========================================== */}
      {/* 🛠 ПАНЕЛЬ УПРАВЛЕНИЯ SANDBOX               */}
      {/* ========================================== */}
      <div style={{ background: "#2a2a28", padding: 20, borderRadius: 16, color: "#fff", marginBottom: 40, display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, margin: "0 auto 40px", border: "1px solid #333" }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#facc15", display: "flex", alignItems: "center", gap: 10 }}>
          <span>🛠</span> Sandbox Управление
        </h2>
        
        {/* БЫСТРЫЕ СЦЕНАРИИ */}
        <div>
          <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Быстрые сценарии</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={setScenarioNewRoute} style={{ flex: 1, background: !isAccepted && !hasStarted ? "#4a7aff" : "#333", color: "#fff", border: "none", padding: "10px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              1. Новый маршрут (Синий баннер)
            </button>
            <button onClick={setScenarioAccepted} style={{ flex: 1, background: isAccepted && !hasStarted ? "#4a7aff" : "#333", color: "#fff", border: "none", padding: "10px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              2. Принят (Выбор базы)
            </button>
            <button onClick={setScenarioInDelivery} style={{ flex: 1, background: hasStarted && !isAllDelivered ? "#10b981" : "#333", color: "#fff", border: "none", padding: "10px", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
              3. В пути (Зеленая галка)
            </button>
          </div>
        </div>

        {/* ТОЧЕЧНЫЕ НАСТРОЙКИ */}
        <div style={{ borderTop: "1px dashed #444", paddingTop: 16 }}>
          <div style={{ fontSize: 12, color: "#a8a49c", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Точечные переключатели</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: "#1a1a18", padding: "8px 12px", borderRadius: 8, fontSize: 13, border: "1px solid #333" }}>
              <input type="checkbox" checked={!!plannedTime} onChange={e => setPlannedTime(e.target.checked ? "14:30" : null)} />
              Задано время (14:30)
            </label>
            <button 
              onClick={() => { setIsAccepted(true); setTimeChangedByOperator(true); }} 
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", background: timeChangedByOperator ? "#78350f" : "#1a1a18", color: timeChangedByOperator ? "#facc15" : "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 13, border: `1px solid ${timeChangedByOperator ? "#facc15" : "#333"}`, fontWeight: 700 }}
            >
              ⚠️ Эмулировать смену времени диспетчером
            </button>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 📱 ЭКРАН ТЕЛЕФОНА (РЕАЛЬНЫЙ UI)            */}
      {/* ========================================== */}
      <div style={{ maxWidth: 420, margin: "0 auto", background: "#f5f4f0", border: "12px solid #000", borderRadius: 40, overflow: "hidden", height: 850, display: "flex", flexDirection: "column", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
        
        {/* ШАПКА */}
        <div style={{ padding: "20px 16px 16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: "#1a1a18", fontWeight: 800 }}>Мои маршруты</h1>
          <div style={{ fontSize: 13, color: "#a8a49c", marginTop: 4 }}>На сегодня: {total} точек на сумму <span style={{fontWeight: 700, color: "#1a1a18"}}>{routePriceTotal} ₽</span></div>
        </div>

        {/* ТЕЛО СТРАНИЦЫ */}
        <div style={{ padding: 12, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          
          {/* 1. СИНИЙ БАННЕР (Только если не принят и не начат) */}
          {!isAccepted && !hasStarted && (
            <div style={{ background: "#fff", border: "2px solid #4a7aff", borderRadius: 16, padding: 16, boxShadow: "0 6px 16px rgba(74, 122, 255, 0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, color: "#1a1a18", fontSize: 16 }}>🆕 Новый маршрут</div>
                <div style={{ fontSize: 12, fontWeight: 700, background: "#eef3ff", color: "#4a7aff", padding: "4px 8px", borderRadius: 6 }}>{total} точек</div>
              </div>
              <div style={{ fontSize: 14, color: "#6b6860", marginBottom: 16, lineHeight: 1.4, fontWeight: 500 }}>
                Вам назначен маршрут <span style={{ fontWeight: 700, color: "#1a1a18" }}>{routeObj.name}</span>.<br />
                {plannedTime ? (
                  <span style={{ color: "#d94040", fontWeight: 800, display: "inline-block", marginTop: 6, background: "#fffbeb", padding: "4px 8px", borderRadius: 6 }}>
                    ⏰ Нужно забрать в {plannedTime}
                  </span>
                ) : (
                  <span style={{ color: "#d94040", fontWeight: 700, display: "inline-block", marginTop: 6 }}>{routeObj.departureAdvice}</span>
                )}
              </div>
              <button
                onClick={() => setIsAccepted(true)}
                style={{ background: "#4a7aff", color: "#fff", width: "100%", padding: "14px", borderRadius: 10, fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(74, 122, 255, 0.3)", transition: "0.2s" }}
              >
                ✅ Принять маршрут
              </button>
            </div>
          )}

          {/* 2. ГЛАВНАЯ КАРТОЧКА МАРШРУТА */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}>
            
            {/* ШАПКА МАРШРУТА */}
            <div style={{ padding: "16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", cursor: "pointer", marginBottom: isExpanded ? 12 : 0 }} onClick={() => setIsExpanded(!isExpanded)}>
                
                {/* Левая инфо-часть */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1a1a18", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    Маршрут {routeObj.name}
                    
                    {/* ЖЕЛТАЯ КНОПКА: Появляется только если принят и время изменено оператором */}
                    {timeChangedByOperator && isAccepted && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setTimeChangedByOperator(false); }}
                        style={{ fontSize: 10, background: "#facc15", color: "#78350f", padding: "4px 8px", borderRadius: 6, fontWeight: 800, textTransform: "uppercase", border: "none", cursor: "pointer", boxShadow: "0 2px 4px rgba(250,204,21,0.3)" }}
                      >
                        Принять время {plannedTime ? `${plannedTime}` : ""}
                      </button>
                    )}
                  </div>
                  
                  <div style={{ fontSize: 13, color: "#a8a49c", marginTop: 4 }}>
                    {delivered}/{total} доставлено • <span style={{ fontWeight: 600, color: "#6b6860" }}>{routePriceTotal} ₽</span>
                  </div>
                  
                  {/* ПЛАШКА ВЫЕЗДА/ФАКТА */}
                  {pickedUpTimeStr ? (
                    <div style={{ marginTop: 10, padding: "4px 8px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 14 }}>✅</span>
                      <div style={{ fontSize: 12, color: "#065f46", fontWeight: 700 }}>Забрал с базы в {pickedUpTimeStr}</div>
                    </div>
                  ) : advice ? (
                    <div style={{ marginTop: 10, padding: "4px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 14 }}>⏰</span>
                      <div style={{ fontSize: 12, color: "#78350f", fontWeight: 700 }}>{advice}</div>
                    </div>
                  ) : null}
                </div>

                {/* Правые кнопки маршрута */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0, minHeight: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    {!isAllDelivered ? (
                      <div style={{ fontSize: 12, background: "#facc15", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, fontWeight: 800 }}>📍 Маршрут</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                        <div style={{ fontSize: 12, background: "#e8e6df", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, fontWeight: 800 }}>🏠 На базу</div>
                        <span style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600 }}>к {routeObj.estimatedReturnTime}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 18, color: "#1a1a18", fontWeight: 900, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginTop: "auto", paddingTop: 10 }}>▼</div>
                </div>
              </div>

              {/* ПАНЕЛЬ "НА БАЗЕ В": Скрывается после старта */}
              {isExpanded && isAccepted && !hasStarted && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed #e8e6df", paddingTop: 14 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#a8a49c", fontWeight: 600 }}>На базе в:</span>
                      <select value={baseTime} onChange={e => setBaseTime(e.target.value)} style={{ border: "1px solid #e8e6df", borderRadius: 8, padding: "6px 10px", fontSize: 14, fontWeight: 600, outline: "none", cursor: "pointer", background: "#fff" }}>
                        <option value="" disabled>Выбрать...</option>
                        <option value="14:00">14:00</option>
                        <option value="14:10">14:10</option>
                      </select>
                    </div>
                    <button onClick={handlePickupAll} style={{ background: "#4a7aff", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 10px rgba(74, 122, 255, 0.3)" }}>
                      🚀 Забрал все
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* СПИСОК ЗАКАЗОВ (Полная боевая версия со всеми иконками) */}
            {isExpanded && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {orders.map((o, idx) => {
                  const st = STATUS_MAP[o.status];
                  const isDelivered = o.status === "DELIVERED";
                  const isCollapsed = collapsedOrders[o.id] !== undefined ? collapsedOrders[o.id] : isDelivered;
                  
                  const isFirst = idx === 0;
                  const isLast = idx === orders.length - 1;
                  const lines = o.items.split('\n').filter(Boolean);
                  const isMany = lines.length >= 3;
                  const isItemExpanded = expandedItems[o.id];
                  const cleanPhoneForTg = o.recipientPhone !== "—" ? o.recipientPhone.replace(/[^\d+]/g, "") : "";

                  return (
                    <div key={o.id} style={{ margin: "8px", background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", borderLeft: `6px solid ${isDelivered ? "#10b981" : (o.status === "IN_DELIVERY" ? "#f59e0b" : "#4a7aff")}`, overflow: "hidden", opacity: isDelivered ? 0.6 : 1, transition: "all 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                      
                      {/* Шапка заказа */}
                      <div onClick={() => setCollapsedOrders(prev => ({...prev, [o.id]: !prev[o.id]}))} style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10, background: isCollapsed ? "#fff" : "#fafaf8" }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: st.bg, color: st.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>{o.routeOrder}</div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", lineHeight: 1.3 }}>{o.address}</div>
                          
                          {(o.name || o.recipientPhone !== "—") && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#4a7aff", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                {o.name && <span>👤 {o.name}</span>}
                                {o.name && o.recipientPhone !== "—" && <span style={{ color: "#a8a49c" }}>·</span>}
                                {o.recipientPhone !== "—" && <span>📞 {o.recipientPhone}</span>}
                              </div>

                              {/* Кнопки ТГ и СМС */}
                              {cleanPhoneForTg && (
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#2AABEE", width: 28, height: 28, borderRadius: "50%" }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#34C759", width: 28, height: 28, borderRadius: "50%" }}>
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: isDelivered ? "#10b981" : "inherit", fontWeight: 500 }}>
                              {isDelivered && o.deliveredAt ? `✅ Доставлен в ${new Date(o.deliveredAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : (o.slotRaw ?? "Время не указано")}
                            </span>
                            {!isDelivered && o.eta && <span style={{ background: "#eef3ff", color: "#4a7aff", padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>~{o.eta}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#a8a49c", transform: isCollapsed ? "none" : "rotate(180deg)", marginTop: 6 }}>▼</div>
                      </div>

                      {/* ТЕЛО ЗАКАЗА */}
                      {!isCollapsed && (
                        <div style={{ padding: "12px 14px 16px", borderTop: "1px solid #f0efe9" }}>
                          
                          {/* Селект статуса */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: "#a8a49c", fontFamily: "monospace", fontWeight: 600 }}>{o.externalId}</div>
                            <select value={o.status} onChange={e => handleStatusChange(o.id, e.target.value)} style={{ background: st.bg, color: st.color, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 800, outline: "none", cursor: "pointer" }}>
                              <option value="ASSIGNED">Назначен</option>
                              <option value="IN_DELIVERY">🚀 В пути</option>
                              <option value="DELIVERED">✅ Доставлен</option>
                            </select>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 14 }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 11, background: "#eef3ff", color: "#4a7aff", padding: "4px 10px", borderRadius: 6, fontWeight: 700 }}>📍 От {isFirst ? "базы" : "пред. точки"} сюда</div>
                              {isLast && <div style={{ fontSize: 11, background: "#f5f4f0", color: "#6b6860", padding: "4px 10px", borderRadius: 6, fontWeight: 700 }}>🏠 На базу</div>}
                            </div>
                            {o.price !== null && <div style={{ fontSize: 13, color: o.wrongPrice ? "#d94040" : "#a8a49c", fontWeight: o.wrongPrice ? 800 : 700 }}>{o.price} ₽</div>}
                          </div>

                          {/* Состав */}
                          {o.items && (
                            <div style={{ marginBottom: 12, background: "#fafaf8", borderRadius: 10, padding: 12, border: "1px solid #e8e6df" }}>
                              {isMany ? (
                                <>
                                  <div onClick={() => setExpandedItems(prev => ({ ...prev, [o.id]: !prev[o.id] }))} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                                    <div style={{ fontSize: 11, color: "#1a1a18", textTransform: "uppercase", fontWeight: 800 }}>📦 Состав ({lines.length} позиций)</div>
                                    <div style={{ fontSize: 12, color: "#a8a49c" }}>{isItemExpanded ? "▲" : "▼"}</div>
                                  </div>
                                  {isItemExpanded && (
                                    <div style={{ marginTop: 8, borderTop: "1px dashed #e8e6df", paddingTop: 8, fontSize: 13, color: "#1a1a18", lineHeight: 1.5 }}>
                                      {lines.map((l, i) => <div key={i}>• {l}</div>)}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 6, fontWeight: 700 }}>📦 Состав заказа</div>
                                  <div style={{ fontSize: 13, color: "#1a1a18", lineHeight: 1.5 }}>{lines.map((l, i) => <div key={i}>• {l}</div>)}</div>
                                </>
                              )}
                            </div>
                          )}

                          {/* Фото */}
                          <div style={{ marginBottom: 12 }}>
                            {uploading[o.id] ? (
                              <div style={{ textAlign: "center", padding: "16px", background: "#fafaf8", borderRadius: 10, color: "#a8a49c", fontWeight: 700, fontSize: 13 }}>⏳ Загрузка фото...</div>
                            ) : (
                              <div style={{ display: "flex", gap: 8 }}>
                                <div onClick={() => handlePhotoUpload(o.id)} style={{ flex: 1, cursor: "pointer", background: o.photoUrl ? "#ecfdf5" : "#fff", border: `1px solid ${o.photoUrl ? "#10b981" : "#e8e6df"}`, padding: "12px", borderRadius: 10, textAlign: "center", fontWeight: 700, fontSize: 13, color: o.photoUrl ? "#10b981" : "#1a1a18", transition: "0.2s" }}>📸 Камера</div>
                                <div onClick={() => handlePhotoUpload(o.id)} style={{ flex: 1, cursor: "pointer", background: "#fff", border: "1px solid #e8e6df", padding: "12px", borderRadius: 10, textAlign: "center", fontWeight: 700, fontSize: 13, color: "#1a1a18", transition: "0.2s" }}>🖼️ Из альбома</div>
                              </div>
                            )}
                            {o.photoUrl && !uploading[o.id] && (
                              <div style={{ marginTop: 8 }}><img src={o.photoUrl} alt="Фото" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10, border: "1px solid #e8e6df" }} /></div>
                            )}
                          </div>

                          {/* Комментарии */}
                          {o.comment && <div style={{ background: "#fdf8f6", borderRadius: 10, padding: 12, border: "1px solid #fce8e3", marginBottom: o.opComment ? 8 : 0 }}><div style={{ fontSize: 13, color: "#d94040", fontWeight: 700 }}>⚠ {o.comment}</div></div>}
                          {o.opComment && <div style={{ background: "#fffbeb", borderRadius: 10, padding: 12, border: "1px solid #fde68a" }}><div style={{ fontSize: 11, color: "#92400e", textTransform: "uppercase", marginBottom: 4, fontWeight: 800 }}>📋 Заметка оператора</div><div style={{ fontSize: 14, color: "#78350f", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{o.opComment}</div></div>}
                          
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Возврат на базу внизу списка */}
                {routeObj.estimatedReturnTime && (
                  <div style={{ fontSize: 12, color: "#a8a49c", padding: "12px 16px 20px", textAlign: "center" }}>
                    🏠 Расчётное время возвращения на базу: <span style={{ fontWeight: 800, color: "#6b6860" }}>{routeObj.estimatedReturnTime}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}