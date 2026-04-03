// src/app/courier/routes/page.tsx
"use client";
import { useState, useEffect } from "react";
import { NAV_HEIGHT } from "@/components/CourierNav";

interface RouteOrder {
  id: string; externalId: string; crmId: string; address: string; status: string;
  slotRaw: string | null; slotFrom: string | null; slotTo: string | null;
  recipientPhone: string | null;
  price: number | null; items: string | null;
  comment: string | null;
  opComment: string | null;
  routeId: string | null; routeOrder: number | null;
  deliveryDate: string | null;
  eta?: string | null; // 🔥 ДОБАВЛЕНО: расчетное время прибытия
  photoUrl?: string | null; // 🔥 ДОБАВЛЕНО
  route?: {
    id: string; name: string; link: string | null; date: string;
    departureAdvice: string | null;
    baseArrivalTime?: string | null; // 🔥 ДОБАВЛЕНО: Время на базе
  } | null;
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
  const [showPast, setShowPast] = useState(false);

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

  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const toggleRoute = (routeId: string) => {
    setExpandedRoutes(prev => ({ ...prev, [routeId]: !(prev[routeId] ?? true) }));
  };

  // 🔥 НОВЫЕ ФУНКЦИИ ВСТАВЛЕНЫ СЮДА
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
      (o.route?.id === routeId && (o.status === "ASSIGNED" || o.status === "NEW"))
        ? { ...o, status: "IN_DELIVERY" }
        : o
    ));
    await fetch(`/api/routes/${routeId}/pickup-all`, { method: "POST" });
  };

  // 🔥 ФУНКЦИЯ ЗАГРУЗКИ ФОТО (Исправленная под Yandex S3 Presigned URL)
  const handlePhotoUpload = async (orderId: string, file: File) => {
    try {
      // 1. Сжимаем фото
      const imageCompression = (await import('browser-image-compression')).default;
      const compressedFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1280 });

      // 2. Получаем одноразовую ссылку (Presigned URL) от твоего сервера
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

      // 3. Отправляем само фото НАПРЯМУЮ в Yandex Cloud
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT", // Yandex S3 ожидает именно PUT
        headers: {
          "Content-Type": compressedFile.type || "image/jpeg",
        },
        body: compressedFile,
      });

      if (!uploadRes.ok) throw new Error("Не удалось загрузить файл в Яндекс Облако");

      // 4. Сохраняем ссылку в БД заказа (это запустит уведомление в Telegram)
      await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: fileUrl }),
      });

      // 5. Обновляем интерфейс
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, photoUrl: fileUrl } : o));
      alert("✅ Фото успешно отправлено!");
      
    } catch (e) {
      console.error(e);
      alert("❌ Ошибка при загрузке фото");
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
  const todayRouteKeys = Object.keys(todayGrouped).sort();

  const pastGrouped: Record<string, RouteOrder[]> = {};
  pastOrders.forEach(o => {
    const d = o.route?.date || (o.deliveryDate ? o.deliveryDate.split("T")[0] : "Ранее");
    if (!pastGrouped[d]) pastGrouped[d] = [];
    pastGrouped[d].push(o);
  });
  const pastDates = Object.keys(pastGrouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{
      display: "flex", flexDirection: "column", background: "#f5f4f0",
      minHeight: "100%", overflowY: "auto",
      paddingBottom: `calc(var(--nav-height, ${NAV_HEIGHT}px) + env(safe-area-inset-bottom) + 16px)`
    }}>

      {/* Шапка */}
      <div style={{ padding: "16px", background: "#fff", borderBottom: "1px solid #e8e6df", position: "sticky", top: 0, zIndex: 10 }}>
        <h1 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Мои маршруты</h1>
        <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>
          На сегодня: {todayOrders.length} точек
        </div>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 16 }}>

        {todayRouteKeys.map((rId) => {
          const routePoints = todayGrouped[rId].sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
          const isExpanded = expandedRoutes[rId] ?? true;
          const routeObj = routePoints[0]?.route;
          const routeName = routeObj ? routeObj.name : "Без маршрута";
          const routeLink = routeObj?.link ?? null;
          const advice = routeObj?.departureAdvice ?? null;

          const delivered = routePoints.filter(o => o.status === "DELIVERED").length;
          const total = routePoints.length;

          return (
            <div key={rId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>

              {/* Заголовок маршрута */}
              <div style={{ padding: "14px 16px", background: "#fafaf8", borderBottom: isExpanded ? "1px solid #e8e6df" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: "pointer", marginBottom: isExpanded ? 12 : 0 }} onClick={() => toggleRoute(rId)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18" }}>
                      Маршрут {routeName}
                    </div>
                    <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 2 }}>
                      {delivered}/{total} доставлено
                    </div>

                    {/* 🔥 СОВЕТ ОПЕРАТОРА — ВО СКОЛЬКО ЗАБРАТЬ */}
                    {advice && (
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

                {/* 🔥 ПАНЕЛЬ УПРАВЛЕНИЯ МАРШРУТОМ */}
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

                        {/* Если время уже было задано нестандартно (например 10:15), оставляем его видимым */}
                        {routeObj?.baseArrivalTime && Number(routeObj.baseArrivalTime.split(':')[1]) % 10 !== 0 && (
                          <option value={routeObj.baseArrivalTime}>{routeObj.baseArrivalTime}</option>
                        )}

                        {/* Генерируем слоты каждые 10 минут с 08:00 до 23:50 (96 вариантов) */}
                        {Array.from({ length: 96 }).map((_, i) => {
                          const hour = Math.floor(i / 6) + 8; // 6 слотов в часе (6 * 10 = 60 мин)
                          const min = (i % 6) * 10;
                          const val = `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;

                          return (
                            <option key={val} value={val}>
                              {val}
                            </option>
                          );
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

                    return (
                      <div
                        key={o.id}
                        style={{
                          padding: "14px 16px",
                          borderBottom: idx < routePoints.length - 1 ? "1px solid #f0efe9" : "none",
                          opacity: o.status === "DELIVERED" ? 0.55 : 1,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          {o.routeOrder && (
                            <div style={{
                              width: 22, height: 22, borderRadius: "50%",
                              background: st.bg, color: st.color,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                            }}>
                              {o.routeOrder}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>
                              {o.externalId ?? o.crmId}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>
                                {o.slotRaw ?? "Время не указано"}
                              </div>
                              {/* 🔥 ВЫВОД ВРЕМЕНИ ДОСТАВКИ (ETA) */}
                              {o.eta && (
                                <div style={{
                                  fontSize: 11, background: "#eef3ff", color: "#4a7aff",
                                  padding: "2px 6px", borderRadius: 4, fontWeight: 600
                                }}>
                                  ~{o.eta}
                                </div>
                              )}
                            </div>
                          </div>
                          <select
                            value={o.status}
                            onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            style={{
                              background: st.bg, color: st.color,
                              border: "none", padding: "6px 10px", borderRadius: 8,
                              fontSize: 11, fontWeight: 700, outline: "none",
                              cursor: "pointer", WebkitAppearance: "none",
                            }}
                          >
                            <option value="ASSIGNED">Назначен</option>
                            <option value="IN_DELIVERY">🚀 В пути</option>
                            <option value="DELIVERED">✅ Доставлен</option>
                          </select>
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", marginBottom: 10, lineHeight: 1.3 }}>
                          {o.address}
                        </div>

                        {/* 🔥 КНОПКА ЗАГРУЗКИ ФОТО */}
                        <div style={{ marginBottom: 10 }}>
                          <label style={{
                            display: "block", background: o.photoUrl ? "#ecfdf5" : "#fff",
                            border: `1px solid ${o.photoUrl ? "#10b981" : "#e8e6df"}`,
                            padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                            textAlign: "center", transition: "all 0.2s"
                          }}>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              style={{ display: "none" }}
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handlePhotoUpload(o.id, e.target.files[0]);
                                }
                              }}
                            />
                            <span style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: o.photoUrl ? "#10b981" : "#4a7aff"
                            }}>
                              {o.photoUrl ? "✅ Фото отправлено" : "📸 Сделать фото"}
                            </span>
                          </label>
                        </div>

                        <div style={{ background: "#f5f4f0", borderRadius: 8, padding: 10, marginBottom: opComment ? 8 : 0 }}>
                          <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 2 }}>
                            Получатель
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>
                            {phone !== "—"
                              ? <a href={`tel:${phone}`} style={{ color: "#4a7aff", textDecoration: "none" }}>{phone}</a>
                              : "—"}
                          </div>
                          {o.comment && (
                            <div style={{ fontSize: 12, color: "#d94040", marginTop: 6, fontWeight: 500 }}>
                              ⚠ {o.comment}
                            </div>
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
                    const rawOp = o.opComment || "";
                    const opComment = rawOp.split("\n").filter(l => !l.startsWith("💡")).join("\n").trim();

                    return (
                      <div key={o.id} style={{ padding: "12px 16px", borderBottom: "1px solid #f0efe9", opacity: 0.7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a18" }}>{o.slotRaw}</div>
                          </div>
                          <div style={{ fontSize: 11, background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>
                            {st.label}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, color: "#1a1a18", marginBottom: 4 }}>{o.address}</div>
                        {phone !== "—" && (
                          <a href={`tel:${phone}`} style={{ fontSize: 12, color: "#4a7aff", textDecoration: "none" }}>{phone}</a>
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