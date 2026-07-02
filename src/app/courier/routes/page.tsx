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
  pickedUpAt?: string | null; // 🔥 ДОБАВЛЕНО ПОЛЕ ДЛЯ ФИКСАЦИИ ВРЕМЕНИ ВЫЕЗДА
  eta?: string | null;
  photoUrl?: string | null;
  route?: {
    id: string; name: string; link: string | null; date: string;
    departureAdvice: string | null;
    plannedDepartureTime?: string | null;
    baseArrivalTime?: string | null;
    estimatedReturnTime?: string | null;
    createdAt?: string;
    isAccepted?: boolean;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  ASSEMBLING: { label: "В сборке", color: "#d97706", bg: "#fffbeb" }, // 🔥 Цвет для отображения
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
  const [acceptedLocally, setAcceptedLocally] = useState<Record<string, boolean>>({});
  const [acknowledgedTimes, setAcknowledgedTimes] = useState<Record<string, string>>({});

  const toggleOrder = (orderId: string) => {
    setCollapsedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/courier/my-orders");
      if (res.ok) {
        const fetchedOrders = await res.json();
        setOrders(fetchedOrders);

        // 🔥 Автоматически помечаем текущее время как прочитанное при загрузке
        setAcknowledgedTimes(prev => {
          const newAcks = { ...prev };
          fetchedOrders.forEach((o: any) => {
            // 🔥 ИСПРАВЛЕНИЕ: Используем имя маршрута (o.route.name)
            if (o.route?.name && o.route?.plannedDepartureTime) {
              if (newAcks[o.route.name] === undefined) {
                newAcks[o.route.name] = o.route.plannedDepartureTime;
              }
            }
          });
          return newAcks;
        });
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    fetchOrders();
    const iv = setInterval(fetchOrders, 15_000);
    return () => clearInterval(iv);
  }, []);

  const fetchWithTimeout = async (resource: string, options: RequestInit & { timeout?: number }) => {
    const { timeout = 20000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  };

  const handleStatusChange = async (id: string, newStatus: string, checkTime?: string | null) => {
    if ((newStatus === "IN_DELIVERY" || newStatus === "DELIVERED") && checkTime) {
      const [bH, bM] = checkTime.split(':').map(Number);
      const now = new Date();
      const moscowTime = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
      const baseTime = new Date(moscowTime.getFullYear(), moscowTime.getMonth(), moscowTime.getDate(), bH, bM, 0, 0);
      if (baseTime.getTime() - moscowTime.getTime() > 60 * 60 * 1000) {
        const statusName = newStatus === "IN_DELIVERY" ? "'В пути'" : "'Доставлен'";
        alert(`Слишком рано! Отметиться ${statusName} можно не раньше чем за час до установленного времени.`);
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
      // 🔥 Добавили условие o.status === "ASSEMBLING"
      o.route?.id === routeId && (o.status === "ASSIGNED" || o.status === "ASSEMBLING")
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

  const getRouteStatusWeight = (rId: string) => {
    const points = todayGrouped[rId];
    if (!points || points.length === 0) return 4;
    const hasInDelivery = points.some(p => p.status === 'IN_DELIVERY');
    if (hasInDelivery) return 1;
    const allDelivered = points.every(p => p.status === 'DELIVERED');
    if (allDelivered) return 3;
    return 2;
  };

  const todayRouteKeys = Object.keys(todayGrouped).sort((a, b) => {
    const weightA = getRouteStatusWeight(a);
    const weightB = getRouteStatusWeight(b);
    if (weightA !== weightB) return weightA - weightB;

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

  const unacceptedRouteKeys = todayRouteKeys.filter(rId => {
    if (acceptedLocally[rId]) return false;
    const points = todayGrouped[rId];
    if (!points || points.length === 0) return false;
    const hasStarted = points.some(p => p.status === "IN_DELIVERY" || p.status === "DELIVERED");
    if (hasStarted) return false;
    const route = points[0]?.route;
    return route && (route as any).isAccepted === false;
  });

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
            На сегодня: {todayOrders.length} точек на сумму <span style={{ fontWeight: 700, color: "#1a1a18" }}>{todayOrders.reduce((sum, o) => sum + (o.price || 0), 0)} ₽</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.5 }}>
          <img src="/favicon.svg" alt="App Logo" style={{ width: 24, height: 24 }} />
          <span style={{ fontSize: 9, fontWeight: 800, color: "#1a1a18", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>EventWave</span>
        </div>
      </div>

      {/* БАННЕРЫ НОВЫХ МАРШРУТОВ */}
      {unacceptedRouteKeys.length > 0 && (
        <div style={{ padding: "16px 12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
          {unacceptedRouteKeys.map(rId => {
            const routePoints = todayGrouped[rId];
            const routeObj = routePoints[0]?.route;

            return (
              <div key={`banner-${rId}`} style={{ background: "#fff", border: "2px solid #4a7aff", borderRadius: 12, padding: 16, boxShadow: "0 4px 12px rgba(74, 122, 255, 0.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, color: "#1a1a18", fontSize: 16 }}>
                    🆕 Новый маршрут
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, background: "#eef3ff", color: "#4a7aff", padding: "4px 8px", borderRadius: 6 }}>
                    {routePoints.length} точек
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "#6b6860", marginBottom: 16, fontWeight: 500 }}>
                  Маршрут <span style={{ fontWeight: 700, color: "#1a1a18" }}>{routeObj?.name}</span> назначен. Вы можете посмотреть заказы ниже.<br />
                  {routeObj?.plannedDepartureTime && routeObj.plannedDepartureTime !== "—" && routeObj.plannedDepartureTime.trim() !== "" ? (
                    <span style={{ color: "#d94040", fontWeight: 700, display: "inline-block", marginTop: 4 }}>
                      Нужно забрать в {routeObj.plannedDepartureTime}
                    </span>
                  ) : routeObj?.departureAdvice ? (
                    <span style={{ color: "#d94040", fontWeight: 700, display: "inline-block", marginTop: 4 }}>
                      {routeObj.departureAdvice}
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={async () => {
                    setAcceptedLocally(prev => ({ ...prev, [rId]: true }));
                    setOrders(prev => prev.map(o => o.route?.id === rId ? { ...o, route: { ...o.route!, isAccepted: true } as any } : o));
                    try {
                      await fetch(`/api/routes/${rId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isAccepted: true }) });
                    } catch (e) { }
                  }}
                  style={{ background: "#4a7aff", color: "#fff", width: "100%", padding: "12px", borderRadius: 8, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 2px 6px rgba(74, 122, 255, 0.3)" }}
                >
                  ✅ Принять маршрут
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* СПИСОК МАРШРУТОВ */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {todayRouteKeys.map((rId) => {
          const routePoints = todayGrouped[rId].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
          const routeObj = routePoints[0]?.route;
          const routeName = routeObj ? routeObj.name : "Без маршрута";
          const routeLink = routeObj?.link ?? null;

          const delivered = routePoints.filter(o => o.status === "DELIVERED").length;
          const total = routePoints.length;
          const isAllDelivered = delivered === total && total > 0;

          const isExpanded = expandedRoutes[rId] ?? !isAllDelivered;

          const onRouteHeaderClick = () => {
            toggleRoute(rId);
          };

          const routePriceTotal = routePoints.reduce((sum, o) => sum + (o.price || 0), 0);
          const hasStarted = routePoints.some(p => p.status === "IN_DELIVERY" || p.status === "DELIVERED");
          const isRouteAccepted = (routeObj as any)?.isAccepted !== false || acceptedLocally[rId];

          // 🔥 Ищем точное время выезда с базы
          let pickedUpTimeStr = null;
          if (hasStarted) {
            const firstStarted = routePoints.find(p => p.pickedUpAt);
            if (firstStarted?.pickedUpAt) {
              const d = new Date(firstStarted.pickedUpAt);
              pickedUpTimeStr = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" });
            }
          }

          const advice = routeObj?.plannedDepartureTime && routeObj.plannedDepartureTime !== "—" && routeObj.plannedDepartureTime.trim() !== ""
            ? `Забрать в ${routeObj.plannedDepartureTime}`
            : (routeObj?.departureAdvice ?? null);

          return (
            <div key={rId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>

              <div style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", cursor: "pointer", marginBottom: isExpanded ? 12 : 0 }} onClick={onRouteHeaderClick}>

                  {/* ЛЕВАЯ ЧАСТЬ — инфо */}
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a18", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      Маршрут {routeName}
                    </div>

                    <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>
                      {delivered}/{total} доставлено • <span style={{ fontWeight: 600, color: "#6b6860" }}>{routePriceTotal} ₽</span>
                    </div>
                    {/* 🔥 ИНТЕРАКТИВНЫЕ ПЛАШКИ (Выезд / Факт / Изменение времени) */}
                    {(() => {
                      // 1. Если курьер уже забрал заказы — показываем зеленую галку факта
                      if (pickedUpTimeStr) {
                        return (
                          <div style={{ marginTop: 8, padding: "4px 8px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12 }}>✅</span>
                            <div style={{ fontSize: 11, color: "#065f46", fontWeight: 700 }}>Забрал с базы в {pickedUpTimeStr}</div>
                          </div>
                        );
                      }

                      const plannedTime = routeObj?.plannedDepartureTime;

                      // 🔥 ИСПРАВЛЕНИЕ: Привязываемся к routeName, так как ID меняется при редактировании оператором!
                      const isTimeChanged = isRouteAccepted && plannedTime && acknowledgedTimes[routeName] !== plannedTime && acknowledgedTimes[routeName] !== undefined;

                      if (isTimeChanged) {
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // 🔥 ИСПРАВЛЕНИЕ: Сохраняем по имени маршрута
                              setAcknowledgedTimes(prev => ({ ...prev, [routeName]: plannedTime }));
                            }}
                            style={{
                              marginTop: 8, padding: "4px 10px", background: "#facc15", border: "1px solid #eab308",
                              borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(250,204,21,0.5)", transition: "0.2s"
                            }}
                          >
                            <span style={{ fontSize: 12 }}>⚠️</span>
                            <div style={{ fontSize: 11, color: "#78350f", fontWeight: 800, textTransform: "uppercase" }}>
                              Изменилось время: {plannedTime}
                            </div>
                          </button>
                        );
                      }

                      // 3. Обычная спокойная плашка (если время не менялось или курьер его уже "принял" кликом)
                      if (advice) {
                        return (
                          <div style={{ marginTop: 8, padding: "4px 8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 12 }}>⏰</span>
                            <div style={{ fontSize: 11, color: "#78350f", fontWeight: 700 }}>{advice}</div>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>

                  {/* ПРАВАЯ ЧАСТЬ — кнопки + жирная стрелка внизу */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0, minHeight: "100%" }}>

                    {(() => {
                      const validPoints = routePoints.filter(o => o.lat && o.lng);
                      const routeUrl = validPoints.length > 0
                        ? `https://yandex.ru/maps/?rtext=${[STORE_COORDS, ...validPoints.map(o => `${o.lat},${o.lng}`)].join("~")}&rtt=mt`
                        : routeLink;
                      const last = validPoints[validPoints.length - 1];
                      const toBaseUrl = last
                        ? `https://yandex.ru/maps/?mode=routes&rtext=${last.lat},${last.lng}~${STORE_COORDS}&rtt=mt`
                        : null;

                      return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          {/* Маршрут прячется, когда всё доставлено */}
                          {routeUrl && !isAllDelivered && (
                            <a href={routeUrl} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 12, background: "#facc15", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, textDecoration: "none", fontWeight: 800, whiteSpace: "nowrap", boxShadow: "0 2px 4px rgba(250,204,21,0.2)" }}
                            >
                              📍 Маршрут
                            </a>
                          )}

                          {/* Возврат на базу появляется ТОЛЬКО когда всё доставлено */}
                          {isAllDelivered && toBaseUrl && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                              <a href={toBaseUrl} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: 12, background: "#e8e6df", color: "#1a1a18", padding: "6px 12px", borderRadius: 8, textDecoration: "none", fontWeight: 800, whiteSpace: "nowrap" }}
                              >
                                🏠 На базу
                              </a>
                              {routeObj?.estimatedReturnTime && (
                                <span style={{ fontSize: 10, color: "#a8a49c", fontWeight: 600 }}>к {routeObj.estimatedReturnTime}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* 🔥 Жирная стрелка, прижатая к нижнему углу */}
                    <div style={{ fontSize: 18, color: "#1a1a18", fontWeight: 900, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", marginTop: "auto", paddingTop: 10 }}>
                      ▼
                    </div>

                  </div>

                </div>
                {/* 🔥 Панель скрывается, если курьер уже нажал "Забрал все" (!hasStarted) и если висит синий баннер (isRouteAccepted) */}
                {isExpanded && isRouteAccepted && !hasStarted && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px dashed #e8e6df", paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                    let timeText = "в ближайшее время";
                    if (o.eta) {
                      const match = o.eta.match(/(\d{1,2}):(\d{2})/);
                      if (match) {
                        const h = parseInt(match[1], 10);
                        const m = parseInt(match[2], 10);
                        const d1 = new Date(); d1.setHours(h, m - 10, 0);
                        const d2 = new Date(); d2.setHours(h, m + 10, 0);
                        const fmt = (d: Date) => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                        timeText = `с ${fmt(d1)} до ${fmt(d2)}`;
                      } else {
                        timeText = o.eta;
                      }
                    } else if (o.slotRaw) {
                      timeText = o.slotRaw;
                    }

                    const messageText = `😊 Здравствуйте! Это курьер сервиса по доставке цветов BUNCH 🌸🌺 Примерное время доставки: ${timeText}`;
                    const encodedMsg = encodeURIComponent(messageText);

                    const isFirst = idx === 0;
                    const isLast = idx === routePoints.length - 1;
                    const prevAddressStr = isFirst ? STORE_COORDS : getRoutePointCoords(routePoints[idx - 1]);
                    const currentAddressStr = getRoutePointCoords(o);

                    const isCollapsed = collapsedOrders[o.id] !== undefined ? collapsedOrders[o.id] : isDelivered;

                    let isTooEarly = false;
                    if (routeObj?.plannedDepartureTime) {
                      const [bH, bM] = routeObj.plannedDepartureTime.split(':').map(Number);
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
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#4a7aff", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  {o.name && <span>👤 {o.name}</span>}
                                  {o.name && phone !== "—" && <span style={{ color: "#a8a49c" }}>·</span>}
                                  {phone !== "—" && (
                                    <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} style={{ color: "#4a7aff", textDecoration: "none" }}>
                                      📞 {phone}
                                    </a>
                                  )}
                                </div>

                                {cleanPhoneForTg && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <a
                                      href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      title="Написать в Telegram"
                                      style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#2AABEE", width: 30, height: 30, borderRadius: "50%", textDecoration: "none", boxShadow: "0 2px 4px rgba(42, 171, 238, 0.3)" }}
                                    >
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff">
                                        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" />
                                      </svg>
                                    </a>

                                    <a
                                      href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`}
                                      title="Отправить SMS"
                                      onClick={e => e.stopPropagation()}
                                      style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#34C759", width: 30, height: 30, borderRadius: "50%", textDecoration: "none", boxShadow: "0 2px 4px rgba(52, 199, 89, 0.3)" }}
                                    >
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="#ffffff">
                                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                                      </svg>
                                    </a>
                                  </div>
                                )}
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
                                onChange={(e) => handleStatusChange(o.id, e.target.value, routeObj?.plannedDepartureTime)}
                                style={{
                                  background: st.bg,
                                  color: st.color,
                                  border: "none",
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  outline: "none",
                                  cursor: "pointer",
                                  WebkitAppearance: "none",
                                }}
                              >
                                {/* 🔥 Добавляем "В сборке" только если заказ сейчас в этом статусе */}
                                {o.status === "ASSEMBLING" && (
                                  <option value="ASSEMBLING" disabled>В сборке</option>
                                )}

                                <option value="ASSIGNED">Назначен</option>

                                <option value="IN_DELIVERY" disabled={isTooEarly}>
                                  {isTooEarly ? "⏳ Рано для статуса В пути" : "🚀 В пути"}
                                </option>

                                <option value="DELIVERED" disabled={isTooEarly}>
                                  {isTooEarly ? "⏳ Рано для статуса Доставлен" : "✅ Доставлен"}
                                </option>
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

                            {o.comment && (
                              <div style={{ background: "#fdf8f6", borderRadius: 8, padding: 10, border: "1px solid #fce8e3", marginBottom: opComment ? 8 : 0 }}>
                                <div style={{ fontSize: 12, color: "#d94040", fontWeight: 600 }}>
                                  ⚠ {o.comment}
                                </div>
                              </div>
                            )}

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
                  {routeObj?.estimatedReturnTime && (
                    <div style={{ fontSize: 12, color: "#a8a49c", padding: "8px 16px 12px", textAlign: "center" }}>
                      🏠 Расчётное время возвращения на базу: <span style={{ fontWeight: 700, color: "#6b6860" }}>{routeObj.estimatedReturnTime}</span>
                    </div>
                  )}
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