// src/app/courier/routes/page.tsx
"use client";
import { useState, useEffect } from "react";
import { NAV_HEIGHT } from "@/components/CourierNav";

interface RouteOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  lat: number | null; lng: number | null;
  name: string | null; 
  slotRaw: string | null; slotFrom: string | null; slotTo: string | null;
  recipientPhone: string | null;
  price: number | null; wrongPrice?: boolean; items: string | null;
  comment: string | null;
  opComment: string | null;
  routeId: string | null; routeOrder: number | null;
  deliveryDate: string | null;
  deliveredAt?: string | null; 
  eta?: string | null;
  photoUrl?: string | null;
  route?: {
    id: string; name: string; link: string | null; date: string;
    departureAdvice: string | null;
    baseArrivalTime?: string | null;
    createdAt?: string;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
};

const STORE_COORDS = "55.749511,37.596205";

export default function CourierRoutesPage() {
  const [orders, setOrders] = useState<RouteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});
  const [showPast, setShowPast] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({}); 
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [collapsedOrders, setCollapsedOrders] = useState<Record<string, boolean>>({});

  const toggleOrder = (orderId: string) => {
    setCollapsedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchOrders();
    const iv = setInterval(fetchOrders, 15_000);
    return () => clearInterval(iv);
  }, []);

  // 🔥 Утилита для запросов с таймаутом
  const fetchWithTimeout = async (resource: string, options: RequestInit & { timeout?: number }) => {
    const { timeout = 20000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  // 🔥 Обновленная смена статуса с ретраями
  const handleStatusChange = async (id: string, newStatus: string, routeBaseTime?: string | null) => {
    if (newStatus === "IN_DELIVERY" && routeBaseTime) {
      const [bH, bM] = routeBaseTime.split(':').map(Number);
      const now = new Date();
      const moscowTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
      const baseTime = new Date(moscowTime.getFullYear(), moscowTime.getMonth(), moscowTime.getDate(), bH, bM, 0, 0);
      if (baseTime.getTime() - moscowTime.getTime() > 60 * 60 * 1000) {
        alert("Слишком рано! Отметиться 'В пути' можно не раньше чем за час до установленного времени 'На базе'.");
        return;
      }
    }

    const prevOrders = [...orders];
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));

    let success = false;
    let attempts = 0;
    const maxAttempts = newStatus === "DELIVERED" ? 3 : 1; 

    while (attempts < maxAttempts && !success) {
      attempts++;
      try {
        const res = await fetchWithTimeout(`/api/orders/${id}`, {
          method: "PATCH", 
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
          timeout: 20000 
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Ошибка сервера ${res.status}`);
        }
        success = true;
      } catch (error: any) {
        if (attempts >= maxAttempts) {
          setOrders(prevOrders);
          alert(error.name === "AbortError" 
            ? "Сервер не ответил за 20 секунд. Проверьте интернет и попробуйте еще раз." 
            : `Ошибка изменения статуса: ${error.message}`);
          return;
        }
        await new Promise(r => setTimeout(r, 1500)); 
      }
    }
  };

  const toggleRoute = (routeId: string) => {
    setExpandedRoutes(prev => ({ ...prev, [routeId]: !(prev[routeId] ?? true) }));
  };

  const handleBaseTimeChange = async (routeId: string, newTime: string) => {
    setOrders(prev => prev.map(o => o.route?.id === routeId
      ? { ...o, route: { ...o.route!, baseArrivalTime: newTime } }
      : o
    ));
    await fetch(`/api/routes/${routeId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseArrivalTime: newTime }),
    });
  };

  const handlePickupAll = async (routeId: string) => {
    if (!window.confirm("Отметить все неначатые заказы в маршруте как «В пути»?")) return;
    setOrders(prev => prev.map(o =>
      o.route?.id === routeId && o.status === "ASSIGNED"
        ? { ...o, status: "IN_DELIVERY" }
        : o
    ));
    await fetch(`/api/routes/${routeId}/pickup-all`, { method: "POST" });
  };

  const handlePhotoUpload = async (orderId: string, file: File) => {
    setUploading(prev => ({ ...prev, [orderId]: true })); 
    try {
      const imageCompression = (await import('browser-image-compression')).default;
      const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280 });

      const signRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          filename: `photo_${orderId}.jpg`, 
          contentType: compressedFile.type || "image/jpeg" 
        }),
      });
      
      if (!signRes.ok) throw new Error("Не удалось получить ссылку от сервера");
      const { uploadUrl, fileUrl } = await signRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": compressedFile.type || "image/jpeg" },
        body: compressedFile,
      });

      if (!uploadRes.ok) throw new Error("Не удалось загрузить файл в Яндекс Облако");

      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: fileUrl }),
      });

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, photoUrl: fileUrl } : o));
      
    } catch (e) {
      console.error(e);
      alert("❌ Ошибка при загрузке фото. Проверьте интернет и попробуйте еще раз.");
    } finally {
      setUploading(prev => ({ ...prev, [orderId]: false })); 
    }
  };

  if (loading) return (
    <div style={{ padding: 20, textAlign: "center", color: "#a8a49c" }}>Загрузка маршрутов...</div>
  );

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });

  const todayOrders: RouteOrder[] = [];
  const pastOrders: RouteOrder[] = [];

  orders.forEach(o => {
    const d = o.route?.date || (o.deliveryDate ? o.deliveryDate.split("T")[0] : null) || todayStr;
    if (d >= todayStr) todayOrders.push(o);
    else pastOrders.push(o);
  });

  const todayGrouped: Record<string, RouteOrder[]> = {};
  todayOrders.forEach(o => {
    const key = o.route?.id || "no-route";
    if (!todayGrouped[key]) todayGrouped[key] = [];
    todayGrouped[key].push(o);
  });
  
  const todayRouteKeys = Object.keys(todayGrouped).sort((a, b) => {
    const routeA = todayGrouped[a][0]?.route;
    const routeB = todayGrouped[b][0]?.route;
    const timeA = routeA?.createdAt ? new Date(routeA.createdAt).getTime() : 0;
    const timeB = routeB?.createdAt ? new Date(routeB.createdAt).getTime() : 0;
    return timeB - timeA; 
  });

  const pastGrouped: Record<string, RouteOrder[]> = {};
  pastOrders.forEach(o => {
    const d = o.route?.date || (o.deliveryDate ? o.deliveryDate.split("T")[0] : "Ранее");
    if (!pastGrouped[d]) pastGrouped[d] = [];
    pastGrouped[d].push(o);
  });
  const pastDates = Object.keys(pastGrouped).sort((a, b) => b.localeCompare(a));

  const formatDeliveredTime = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleTimeString("ru-RU", { 
      hour: '2-digit', minute: '2-digit', timeZone: "Europe/Moscow" 
    });
  };

  const getRoutePointCoords = (order: RouteOrder) => {
    if (order.lat && order.lng) return `${order.lat},${order.lng}`;
    return encodeURIComponent(order.address);
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", background: "#f5f4f0",
      minHeight: "100%", overflowY: "auto",
      paddingBottom: `calc(var(--nav-height, ${NAV_HEIGHT}px) + env(safe-area-inset-bottom) + 16px)`
    }}>

      {/* Шапка */}
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои маршруты</h1>
          <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>
            На сегодня: {todayOrders.length} точек на сумму <span style={{fontWeight: 700, color: "#1a1a18"}}>{todayOrders.reduce((sum, o) => sum + (o.price || 0), 0)} ₽</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
          <img src="/favicon.svg" alt="App Logo" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: "#1a1a18", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>EventWave</span>
        </div>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>

        {todayRouteKeys.map((rId) => {
          // 🔥 СОРТИРОВКА: В процессе (1), Ожидает (2), Доставлен (3)
          const getStatusWeight = (status: string) => {
            if (status === 'IN_DELIVERY') return 1;
            if (status === 'ASSIGNED' || status === 'NEW') return 2;
            if (status === 'DELIVERED') return 3;
            return 4;
          };

          const routePoints = todayGrouped[rId].sort((a, b) => {
            const weightA = getStatusWeight(a.status);
            const weightB = getStatusWeight(b.status);
            if (weightA !== weightB) return weightA - weightB;
            return (a.routeOrder || 0) - (b.routeOrder || 0);
          });

          const routeObj = routePoints[0]?.route;
          const routeName = routeObj ? routeObj.name : "Без маршрута";
          const routeLink = routeObj?.link ?? null;
          const advice = routeObj?.departureAdvice ?? null;

          const delivered = routePoints.filter(o => o.status === "DELIVERED").length;
          const total = routePoints.length;
          const isAllDelivered = delivered === total && total > 0; 
          
          const isExpanded = expandedRoutes[rId] ?? !isAllDelivered;
          const routePriceTotal = routePoints.reduce((sum, o) => sum + (o.price || 0), 0);
          const firstOrderStatus = routePoints[0]?.status;
          const showAdvice = firstOrderStatus === "ASSIGNED" || firstOrderStatus === "NEW";

          return (
            <div key={rId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>

              <div style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", marginBottom: isExpanded ? 12 : 0 }} onClick={() => toggleRoute(rId)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>
                      Маршрут {routeName} <span style={{fontSize: 12, color: "#a8a49c", fontWeight: 500}}>({routePriceTotal} ₽)</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 2 }}>
                      {delivered}/{total} доставлено
                    </div>

                    {advice && showAdvice && (
                      <div style={{
                        marginTop: 8, padding: "10px 12px", background: "#fffbeb",
                        border: "1px solid #fde68a", borderRadius: 10, display: "flex", gap: 8, alignItems: "center"
                      }}>
                        <span style={{ fontSize: 18 }}>⏰</span>
                        <div>
                          <div style={{ fontSize: 13, color: "#78350f", fontWeight: 700 }}>{advice}</div>
                        </div>
                      </div>
                    )}

                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    {routeLink && (
                      <a
                        href={routeLink} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: 11, background: "#facc15", color: "#1a1a18", padding: "5px 10px", borderRadius: 7, textDecoration: "none", fontWeight: 700, whiteSpace: "nowrap" }}
                      >
                        📍 Карты
                      </a>
                    )}
                    <div style={{ fontSize: 18, color: "#a8a49c", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</div>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", borderTop: "1px dashed #e8e6df", paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 600 }}>На базе в:</span>
                      <select
                        value={routeObj?.baseArrivalTime || ""}
                        onChange={(e) => handleBaseTimeChange(rId, e.target.value)}
                        style={{
                          border: "1px solid #e8e6df", borderRadius: 6, padding: "4px 8px",
                          fontSize: 13, fontWeight: 600, color: "#1a1a18", background: "#fff",
                          outline: "none", cursor: "pointer", minWidth: "90px"
                        }}
                      >
                        <option value="" disabled>Выбрать...</option>
                        {routeObj?.baseArrivalTime && Number(routeObj.baseArrivalTime.split(':')[1]) % 10 !== 0 && (
                          <option value={routeObj.baseArrivalTime}>{routeObj.baseArrivalTime}</option>
                        )}
                        {Array.from({ length: 96 }).map((_, i) => {
                          const hour = Math.floor(i / 6) + 8;
                          const min = (i % 6) * 10;
                          const val = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>
                    <button
                      onClick={() => handlePickupAll(rId)}
                      style={{
                        background: "#4a7aff", color: "#fff", border: "none",
                        padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(74, 122, 255, 0.25)"
                      }}
                    >
                      🚀 Забрал все
                    </button>
                  </div>
                )}
              </div>

              {isExpanded && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {routePoints.map((o, idx) => {
                  const st = STATUS_MAP[o.status] || STATUS_MAP.ASSIGNED;
                  const phone = o.recipientPhone || "—";
                  const rawOp = o.opComment || "";
                  const opComment = rawOp.split("\n").filter(line => !line.startsWith("💡")).join("\n").trim();
                  const isDelivered = o.status === "DELIVERED";
                  const actualTime = formatDeliveredTime(o.deliveredAt || null);
                  const cleanPhoneForTg = phone !== "—" ? phone.replace(/[^\d+]/g, "") : "";
                  
                  // 🔥 ТЕКСТ СМС И ТЕЛЕГРАМ С РАСЧЕТОМ +-10 МИНУТ
                  let timeText = "в ближайшее время";
                  if (o.eta && o.eta.includes(":")) {
                    const [h, m] = o.eta.split(':').map(Number);
                    if (!isNaN(h) && !isNaN(m)) {
                      const d = new Date();
                      d.setHours(h, m, 0, 0);
                      const start = new Date(d.getTime() - 10 * 60000);
                      const end = new Date(d.getTime() + 10 * 60000);
                      const format = (dt: Date) => `${dt.getHours().toString().padStart(2, '0')}:${dt.getMinutes().toString().padStart(2, '0')}`;
                      
                      timeText = `${format(start)}-${format(end)} (тайминг +-10 мин от расчетного)`;
                    } else {
                      timeText = `${o.eta} (тайминг +-10 мин от расчетного)`;
                    }
                  } else if (o.slotRaw) {
                    timeText = o.slotRaw;
                  }
                  
                  const messageText = `Здравствуйте! Я курьер сервиса по доставке цветов BUNCH 😊 Примерное время доставки ${timeText}`;
                  const encodedMsg = encodeURIComponent(messageText);

                  const isFirst = idx === 0;
                  const isLast = idx === routePoints.length - 1;
                  const prevAddressStr = isFirst ? STORE_COORDS : getRoutePointCoords(routePoints[idx - 1]);
                  const currentAddressStr = getRoutePointCoords(o);

                  const isCollapsed = collapsedOrders[o.id] !== undefined ? collapsedOrders[o.id] : isDelivered;

                  // ОПРЕДЕЛЯЕМ БЛОКИРОВКУ КНОПКИ "В ПУТИ"
                  let isTooEarly = false;
                  if (routeObj?.baseArrivalTime) {
                    const [bH, bM] = routeObj.baseArrivalTime.split(':').map(Number);
                    const now = new Date();
                    const moscowTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
                    const baseTime = new Date(moscowTime.getFullYear(), moscowTime.getMonth(), moscowTime.getDate(), bH, bM, 0, 0);
                    isTooEarly = (baseTime.getTime() - moscowTime.getTime()) > 60 * 60 * 1000;
                  }

                  const borderColor = o.status === "DELIVERED" ? "#10b981" : (o.status === "IN_DELIVERY" ? "#f59e0b" : "#4a7aff");

                  return (
                    <div
                      key={o.id}
                      style={{
                        margin: "8px 0",
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #e8e6df",
                        borderLeft: `6px solid ${borderColor}`,
                        overflow: "hidden",
                        boxShadow: isCollapsed ? "0 1px 4px rgba(0,0,0,0.06)" : "0 4px 14px rgba(0,0,0,0.08)",
                        opacity: isDelivered ? 0.7 : 1,
                        transition: "all 0.2s"
                      }}
                    >
                      <div 
                        onClick={() => toggleOrder(o.id)}
                        style={{ 
                          padding: "12px 16px", 
                          cursor: "pointer",
                          display: "flex", 
                          alignItems: "flex-start", 
                          gap: 10,
                          background: isCollapsed ? "#fff" : "#fafaf8" 
                        }}
                      >
                        {o.routeOrder && (
                          <div style={{
                            width: 24, height: 24, borderRadius: "50%",
                            background: st.bg, color: st.color,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 2
                          }}>
                            {o.routeOrder}
                          </div>
                        )}
                        
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", lineHeight: 1.3 }}>
                            {o.address}
                          </div>
                          
                          {(o.name || phone !== "—") && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#4a7aff", display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {o.name && <span>👤 {o.name}</span>}
                              {o.name && phone !== "—" && <span>·</span>}
                              {phone !== "—" && <span>📞 {phone}</span>}
                            </div>
                          )}

                          <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: (isDelivered && actualTime) ? "#10b981" : "inherit", fontWeight: 500 }}>
                              {(isDelivered && actualTime) ? `✅ Доставлен в ${actualTime}` : (o.slotRaw ?? "Время не указано")}
                            </span>
                            {o.eta && !isDelivered && (
                              <span style={{ background: "#eef3ff", color: "#4a7aff", padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                                ~{o.eta}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ fontSize: 12, color: "#a8a49c", transform: isCollapsed ? "none" : "rotate(180deg)", transition: "transform 0.2s", marginTop: 4 }}>
                          ▼
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div style={{ padding: "12px 16px 16px", borderTop: "1px solid #f0efe9" }}>
                          
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace", fontWeight: 600 }}>
                              {o.externalId ?? o.crmId}
                            </div>
                            <select
                              value={o.status}
                              onClick={e => e.stopPropagation()}
                              onChange={(e) => handleStatusChange(o.id, e.target.value, routeObj?.baseArrivalTime)}
                              style={{
                                background: st.bg, color: st.color, border: "none", padding: "6px 10px", borderRadius: 8,
                                fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", WebkitAppearance: "none",
                              }}
                            >
                              <option value="ASSIGNED">Назначен</option>
                              <option value="IN_DELIVERY" disabled={isTooEarly}>
                                {isTooEarly ? "⏳ Рано для статуса В пути" : "🚀 В пути"}
                              </option>
                              <option value="DELIVERED">✅ Доставлен</option>
                            </select>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <a 
                                href={`https://yandex.ru/maps/?mode=routes&rtext=${prevAddressStr}~${currentAddressStr}`} 
                                target="_blank" 
                                style={{ fontSize: 11, background: "#eef3ff", color: "#4a7aff", padding: "4px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 700, display: "inline-flex", alignItems: "center" }}
                              >
                                📍 От {isFirst ? "базы" : "пред. точки"} сюда
                              </a>
                              {isLast && (
                                <a 
                                  href={`https://yandex.ru/maps/?mode=routes&rtext=${currentAddressStr}~${STORE_COORDS}`} 
                                  target="_blank" 
                                  style={{ fontSize: 11, background: "#f5f4f0", color: "#6b6860", padding: "4px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 700, display: "inline-flex", alignItems: "center" }}
                                >
                                  🏠 На базу
                                </a>
                              )}
                            </div>
                            {o.price !== null && (
                              <div style={{ fontSize: 12, whiteSpace: "nowrap", color: o.wrongPrice ? "#d94040" : "#a8a49c", fontWeight: o.wrongPrice ? 800 : 600 }}>
                                {o.price} ₽
                              </div>
                            )}
                          </div>

                          {o.items && o.items.trim() && (
                            <div style={{ marginBottom: 10, background: "#fafaf8", borderRadius: 8, padding: 10, border: "1px solid #e8e6df" }}>
                              {(() => {
                                const lines = o.items!.split('\n').map(l => l.trim()).filter(Boolean);
                                const isMany = lines.length >= 3;
                                const isItemExpanded = expandedItems[o.id];

                                if (!isMany) {
                                  return (
                                    <>
                                      <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>📦 Состав заказа</div>
                                      <div style={{ fontSize: 12, color: "#1a1a18", lineHeight: 1.4 }}>
                                        {lines.map((l, i) => <div key={i}>• {l}</div>)}
                                      </div>
                                    </>
                                  );
                                }

                                return (
                                  <>
                                    <div 
                                      onClick={() => setExpandedItems(prev => ({ ...prev, [o.id]: !prev[o.id] }))}
                                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                                    >
                                      <div style={{ fontSize: 11, color: "#1a1a18", textTransform: "uppercase", fontWeight: 700 }}>
                                        📦 Состав ({lines.length} позиций)
                                      </div>
                                      <div style={{ fontSize: 12, color: "#a8a49c" }}>{isItemExpanded ? "▲" : "▼"}</div>
                                    </div>
                                    {isItemExpanded && (
                                      <div style={{ marginTop: 8, borderTop: "1px dashed #e8e6df", paddingTop: 8, fontSize: 12, color: "#1a1a18", lineHeight: 1.4 }}>
                                        {lines.map((l, i) => <div key={i}>• {l}</div>)}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          <div style={{ marginBottom: 10 }}>
                            {uploading[o.id] ? (
                              <div style={{ textAlign: "center", padding: "14px", background: "#fafaf8", borderRadius: 8, color: "#a8a49c", fontWeight: 600, fontSize: 13 }}>
                                ⏳ Загрузка фото...
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8 }}>
                                <label style={{
                                  flex: 1, background: o.photoUrl ? "#ecfdf5" : "#fff",
                                  border: `1px solid ${o.photoUrl ? "#10b981" : "#e8e6df"}`,
                                  padding: "10px", borderRadius: 8, cursor: "pointer",
                                  textAlign: "center", fontWeight: 700, fontSize: 13,
                                  color: o.photoUrl ? "#10b981" : "#1a1a18"
                                }}>
                                  <input
                                    type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                                    onChange={(e) => { if (e.target.files?.[0]) handlePhotoUpload(o.id, e.target.files[0]); }}
                                  />
                                  📸 Камера
                                </label>

                                <label style={{
                                  flex: 1, background: "#fff", border: "1px solid #e8e6df",
                                  padding: "10px", borderRadius: 8, cursor: "pointer",
                                  textAlign: "center", fontWeight: 700, fontSize: 13, color: "#1a1a18"
                                }}>
                                  <input
                                    type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={(e) => { if (e.target.files?.[0]) handlePhotoUpload(o.id, e.target.files[0]); }}
                                  />
                                  🖼️ Из альбома
                                </label>
                              </div>
                            )}

                            {o.photoUrl && !uploading[o.id] && (
                              <div style={{ marginTop: 8 }}>
                                <a href={o.photoUrl} target="_blank" rel="noopener noreferrer">
                                  <img 
                                    src={o.photoUrl} alt="Фото заказа" 
                                    style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, border: "1px solid #e8e6df", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }} 
                                  />
                                </a>
                              </div>
                            )}
                          </div>

                          {/* Блок Связи и Комментария клиента */}
                          <div style={{ background: "#f5f4f0", borderRadius: 8, padding: 10, marginBottom: opComment ? 8 : 0 }}>
                            {cleanPhoneForTg && (
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: o.comment ? 8 : 0 }}>
                                <span style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", fontWeight: 600, marginRight: 4 }}>
                                  Написать:
                                </span>
                                <a 
                                  href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  title="Написать в Telegram"
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#2AABEE", width: 28, height: 28, borderRadius: "50%", textDecoration: "none", boxShadow: "0 2px 4px rgba(42, 171, 238, 0.3)" }}
                                >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff">
                                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/>
                                  </svg>
                                </a>

                                <a 
                                  href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`}
                                  title="Отправить SMS"
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#34C759", width: 28, height: 28, borderRadius: "50%", textDecoration: "none", boxShadow: "0 2px 4px rgba(52, 199, 89, 0.3)" }}
                                >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                                  </svg>
                                </a>
                              </div>
                            )}

                            {o.comment && (
                              <div style={{ fontSize: 12, color: "#d94040", fontWeight: 600 }}>
                                ⚠ {o.comment}
                              </div>
                            )}
                            
                            {!cleanPhoneForTg && !o.comment && (
                              <div style={{ fontSize: 11, color: "#a8a49c" }}>Дополнительной информации нет</div>
                            )}
                          </div>

                          {opComment && (
                            <div style={{
                              background: "#fffbeb", borderRadius: 8, padding: 10,
                              border: "1px solid #fde68a",
                            }}>
                              <div style={{ fontSize: 11, color: "#92400e", textTransform: "uppercase", marginBottom: 2, fontWeight: 600 }}>
                                📋 Заметка оператора
                              </div>
                              <div style={{ fontSize: 13, color: "#78350f", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                                {opComment}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          );
        })}

        {todayOrders.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#a8a49c", fontSize: 14 }}>
            Маршрутов на сегодня нет
          </div>
        )}

        {/* ПРОШЛЫЕ ЗАКАЗЫ */}
        {pastOrders.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden" }}>
            <div
              onClick={() => setShowPast(!showPast)}
              style={{ padding: "14px 16px", background: "#fafaf8", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>Прошлые заказы</div>
              <div style={{ fontSize: 13, color: "#a8a49c", fontWeight: 600 }}>
                {pastOrders.length} {showPast ? "▲" : "▼"}
              </div>
            </div>

            {showPast && pastDates.map(date => (
              <div key={date} style={{ borderTop: "1px solid #f0efe9" }}>
                <div style={{ padding: "8px 16px", background: "#fafaf8", fontSize: 11, color: "#a8a49c", fontWeight: 600, textTransform: "uppercase" }}>
                  {date}
                </div>
                {pastGrouped[date]
                  .sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0))
                  .map(o => {
                    const st = STATUS_MAP[o.status] || STATUS_MAP.ASSIGNED;
                    const phone = o.recipientPhone || "—";
                    const opComment = (o.opComment || "").split("\n").filter(l => !l.startsWith("💡")).join("\n").trim();
                    const isDelivered = o.status === "DELIVERED";
                    const actualTime = formatDeliveredTime(o.deliveredAt || null);

                    return (
                      <div key={o.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f0efe9", opacity: 0.7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                            <div style={{ 
                                fontSize: 12, fontWeight: 600, color: (isDelivered && actualTime) ? "#10b981" : "#1a1a18" 
                              }}>
                                {(isDelivered && actualTime) ? `Доставлен в ${actualTime}` : (o.slotRaw ?? "Время не указано")}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                            {st.label}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: "#1a1a18", marginBottom: 4 }}>{o.address}</div>
                        {phone !== "—" && (
                          <a href={`tel:${phone}`} style={{ fontSize: 12, color: "#4a7aff", textDecoration: "none" }}>📞 {phone}</a>
                        )}
                        {opComment && (
                          <div style={{ fontSize: 11, color: "#78350f", background: "#fffbeb", padding: "4px 8px", borderRadius: 6, marginTop: 6 }}>
                            📋 {opComment}
                          </div>
                        )}
                      </div>
                    );
                  })
                }
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}