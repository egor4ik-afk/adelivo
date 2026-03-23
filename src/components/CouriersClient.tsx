"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface CourierShift { id: string; date: string; }
interface CourierPayment { id: string; date: string; }
interface Courier {
  id: number; fullName: string; phone: string | null; description: string | null;
  isActive: boolean; shifts: CourierShift[]; payments: CourierPayment[];
}
interface Order {
  id: string; courierId: number | null; status: string; price: number | null;
  deliveryDate: string | null; crmCreatedAt: string | null;
  externalId: string | null; crmId: string; address: string | null;
  slotRaw: string | null; recipientPhone: string | null;
  items: string | null; comment: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string; link: string | null; date: string } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  NEW: { label: "Новый", color: "#d94040", bg: "#fef2f2" },
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
  RETURNED: { label: "↩️ Возврат", color: "#d94040", bg: "#fef2f2" },
  CANCELLED: { label: "❌ Отменен", color: "#a8a49c", bg: "#f5f4f0" }
};

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function CouriersClient({ user }: { user: any }) {
  const router = useRouter();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [activeTab, setActiveTab] = useState<"routes" | "calc" | "schedule">("routes");

  // Состояния для Графика
  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [sortDate, setSortDate] = useState(scheduleDates[1]);

  // Состояния для Расчета
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  });
  const calcDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [selectedPays, setSelectedPays] = useState<string[]>([]);

  // Состояния для Маршрутов
  const [routesDate, setRoutesDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [expandedCouriers, setExpandedCouriers] = useState<Record<number, boolean>>({});

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([fetch("/api/couriers"), fetch("/api/orders")]);
      if (cRes.ok) setCouriers(await cRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const getODate = (o: Order) => o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
  const getCourierOrders = (courierId: number, date: string, requireDelivered = false) => {
    return orders.filter(o => o.courierId === courierId && getODate(o) === date && (!requireDelivered || o.status === "DELIVERED"));
  };
  const getCount = (courierId: number, date: string, reqDeliv = false) => getCourierOrders(courierId, date, reqDeliv).length;
  const getSum = (courierId: number, date: string) => getCourierOrders(courierId, date, true).reduce((acc, o) => acc + (o.price || 0), 0);

  // Изменение статуса заказа (мгновенный выброс из маршрута на клиенте)
  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        const updated = { ...o, status: newStatus };
        if (newStatus === "CANCELLED" || newStatus === "RETURNED") {
          updated.routeId = null;
          updated.routeOrder = null;
          updated.route = undefined;
        }
        return updated;
      }
      return o;
    }));
    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
  };

  // Ручное управление маршрутом (добавить / удалить)
  const handleRouteUpdate = async (orderId: string, newRouteId: string | null) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, routeId: newRouteId, routeOrder: newRouteId ? 999 : null } : o));
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeId: newRouteId, routeOrder: newRouteId ? 999 : null })
    });
    // Обновляем данные, чтобы получить точный routeOrder и объект route
    fetchAll();
  };

  const toggleShift = async (courierId: number, date: string, isWorking: boolean) => {
    setCouriers(prev => prev.map(c => {
      if (c.id === courierId) {
        const newShifts = isWorking ? [...c.shifts, { id: "temp", date }] : c.shifts.filter(s => s.date !== date);
        return { ...c, shifts: newShifts };
      }
      return c;
    }));
    await fetch("/api/couriers/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courierId, date, isWorking }) });
  };

  const togglePaySelect = (courierId: number, date: string) => {
    const key = `${courierId}_${date}`;
    setSelectedPays(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handlePay = async () => {
    setLoading(true);
    const payments = selectedPays.map(p => { const [cId, d] = p.split('_'); return { courierId: Number(cId), date: d }; });
    await fetch("/api/couriers/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payments }) });
    setSelectedPays([]);
    await fetchAll();
  };

  const filtered = couriers.filter(c => {
    if (!c.isActive) return false;
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const scheduleSorted = [...filtered].sort((a, b) => {
    const aCount = getCount(a.id, sortDate); const bCount = getCount(b.id, sortDate);
    if (aCount !== bCount) return bCount - aCount;
    const aWorks = a.shifts.some(s => s.date === sortDate); const bWorks = b.shifts.some(s => s.date === sortDate);
    if (aWorks && !bWorks) return -1; if (!aWorks && bWorks) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const calcSorted = [...filtered].sort((a, b) => {
    const aSum = calcDates.reduce((acc, d) => acc + getSum(a.id, d), 0);
    const bSum = calcDates.reduce((acc, d) => acc + getSum(b.id, d), 0);
    if (aSum !== bSum) return bSum - aSum;
    return a.fullName.localeCompare(b.fullName);
  });

  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <div style={s.logo}>
          <img src="/favicon.svg" alt="Logo" style={{ width: 22, height: 22 }} />
          EwentWave
        </div>
        <button onClick={() => router.push('/dashboard')} style={s.navBtn}>🗺️ Дашборд</button>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <div style={{ flex: 1 }} />
      </div>

      <div style={s.content}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>Курьеры</h1>
            <div style={s.tabs}>
              <button style={activeTab === "routes" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("routes")}>🗺️ Маршруты</button>
              <button style={activeTab === "calc" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("calc")}>💰 Расчет ЗП</button>
              <button style={activeTab === "schedule" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("schedule")}>📅 График смен</button>

            </div>
          </div>

          <div style={s.controls}>
            {activeTab === "calc" && (
              <button style={{ ...s.syncBtn, background: selectedPays.length > 0 ? "#10b981" : "#e5e7eb", color: selectedPays.length > 0 ? "#fff" : "#9ca3af" }} disabled={selectedPays.length === 0} onClick={handlePay}>
                ✅ Рассчитан ({selectedPays.length})
              </button>
            )}
            <input type="text" placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={s.input} />
            <button style={s.syncBtn} onClick={async () => { setLoading(true); await fetch("/api/couriers/sync"); await fetchAll(); }}>🔄 Синхронизировать</button>
          </div>
        </div>

        {/* --- ВКЛАДКА: ГРАФИК --- */}
        {activeTab === "schedule" && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  <th style={{ ...s.th, width: 120 }}>Телефон</th>
                  {scheduleDates.map((d, i) => (
                    <th key={d} style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8" }} onClick={() => setSortDate(d)} title="Нажмите, чтобы отсортировать">
                      {i === 0 ? "Сегодня" : i === 1 ? "Завтра" : formatDay(d)}<br /><span style={{ fontSize: 10, fontWeight: 500 }}>{d.slice(5).replace("-", ".")}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={9} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr> : scheduleSorted.map(c => {
                  const isSortDayWorking = c.shifts.some(s => s.date === sortDate);
                  return (
                    <tr key={c.id} style={{ background: isSortDayWorking ? "#fcfcfc" : "#fff", borderBottom: "1px solid #f0efe9" }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{c.fullName}</td>
                      <td style={{ ...s.td, color: "#6b6860", fontSize: 12 }}>{c.phone || "—"}</td>
                      {scheduleDates.map(date => {
                        const isWorking = c.shifts.some(s => s.date === date);
                        const orderCount = getCount(c.id, date);
                        return (
                          <td key={date} style={{ ...s.td, textAlign: "center", background: sortDate === date ? "rgba(74,122,255,0.03)" : "transparent" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <input type="checkbox" checked={isWorking} onChange={(e) => toggleShift(c.id, date, e.target.checked)} style={s.checkbox} />
                              {orderCount > 0 && <span style={{ fontSize: 10, color: "#4a7aff", fontWeight: 700 }}>{orderCount} зак.</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* --- ВКЛАДКА: РАСЧЕТ ЗП --- */}
        {activeTab === "calc" && (
          <div style={s.tableWrap}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e8e6df" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}>◀ Неделя</button>
                <span style={{ fontWeight: 700, fontSize: 15, textTransform: "capitalize", color: "#1a1a18" }}>
                  {weekStart.toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
                </span>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}>Неделя ▶</button>
              </div>
              <div style={{ fontSize: 12, color: "#a8a49c", display: "none", "@media (min-width: 768px)": { display: "block" } } as any}>
                Считаются только "Доставлен"
              </div>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  {calcDates.map(d => <th key={d} style={{ ...s.th, textAlign: "center" }}>{formatDay(d)}<br /><span style={{ fontSize: 10 }}>{d.slice(5).replace("-", ".")}</span></th>)}
                  <th style={{ ...s.th, textAlign: "right", color: "#10b981" }}>Итого за неделю</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={9} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr> : calcSorted.map(c => {
                  const weekTotal = calcDates.reduce((acc, d) => acc + getSum(c.id, d), 0);
                  const weekTotal106 = weekTotal * 1.06;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f0efe9", background: "#fff" }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>{c.fullName}</td>
                      {calcDates.map(d => {
                        const count = getCount(c.id, d, true); const sum = getSum(c.id, d);
                        const isPaid = c.payments?.some(p => p.date === d);
                        const isSelected = selectedPays.includes(`${c.id}_${d}`);
                        return (
                          <td key={d} style={{ ...s.td, textAlign: "center", verticalAlign: "top", background: isPaid ? "#f0fdf4" : "transparent" }}>
                            {(count > 0 || sum > 0) ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{count} шт</div>
                                {isPaid ? <div style={{ fontSize: 10, background: "#10b981", color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>ОПЛАЧЕН</div>
                                  : <input type="checkbox" checked={isSelected} onChange={() => togglePaySelect(c.id, d)} style={s.checkbox} />}
                                <div style={{ fontSize: 11, color: "#4a7aff", fontWeight: 700 }}>{sum} ₽</div>
                              </div>
                            ) : <span style={{ color: "#d1d5db" }}>—</span>}
                          </td>
                        );
                      })}
                      <td style={{ ...s.td, textAlign: "right", fontWeight: 700, background: "#fafaf8" }}>
                        <div style={{ fontSize: 14 }}>{weekTotal.toFixed(0)} ₽</div>
                        {weekTotal > 0 && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>x 1.06 = {weekTotal106.toFixed(0)} ₽</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* --- ВКЛАДКА: МАРШРУТЫ --- */}
        {activeTab === "routes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: "12px 16px", borderRadius: 12, border: "1px solid #e8e6df", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a18" }}>Дата маршрутов:</span>
              <input type="date" value={routesDate} onChange={e => setRoutesDate(e.target.value)} style={{ ...s.input, flex: 1, maxWidth: 200 }} />
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка маршрутов...</div> : null}

            {!loading && filtered.map(c => {
              const cOrders = orders.filter(o => o.courierId === c.id && getODate(o) === routesDate);
              if (cOrders.length === 0) return null;

              const routeGroups: Record<string, Order[]> = {};
              cOrders.forEach(o => {
                const key = o.route?.id || "no_route";
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(o);
              });

              const isCExpanded = expandedCouriers[c.id] ?? true;

              return (
                <div key={c.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>

                  <div onClick={() => setExpandedCouriers(prev => ({ ...prev, [c.id]: !isCExpanded }))} style={{ padding: "14px 16px", background: "#fafaf8", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: isCExpanded ? "1px solid #e8e6df" : "none" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18" }}>{c.fullName}</div>
                      <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>Активных: {cOrders.filter(o => o.status !== "DELIVERED" && o.status !== "CANCELLED").length} · Всего: {cOrders.length}</div>
                    </div>
                    <div style={{ fontSize: 18, color: "#a8a49c", transform: isCExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</div>
                  </div>

                  {isCExpanded && (
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                      {Object.entries(routeGroups).map(([rId, rOrders]) => {
                        const rObj = rOrders[0]?.route;
                        const rName = rObj ? rObj.name : "Без маршрута";
                        const rLink = rObj ? rObj.link : null;

                        rOrders.sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));

                        return (
                          <div key={rId} style={{ border: "1px solid #f0efe9", borderRadius: 12, padding: 16, background: "#fff" }}>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Маршрут {rName}</h4>
                              {rLink && (
                                <a href={rLink} target="_blank" style={{ fontSize: 11, background: "#facc15", color: "#1a1a18", padding: "6px 10px", borderRadius: 6, textDecoration: "none", fontWeight: 700 }}>
                                  📍 Яндекс Карты
                                </a>
                              )}
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                              {rOrders.map(o => {
                                const st = STATUS_MAP[o.status] || STATUS_MAP.NEW;
                                const phone = o.recipientPhone || "—";

                                return (
                                  <div key={o.id} style={{ background: "#fafaf8", borderRadius: 10, border: "1px solid #e8e6df", padding: 14, display: "flex", flexDirection: "column" }}>

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1a1a18", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
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
                                        style={{ background: st.bg, color: st.color, border: "none", padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, outline: "none", cursor: "pointer", WebkitAppearance: "none", maxWidth: 120 }}
                                      >
                                        <option value="NEW">Новый</option>
                                        <option value="ASSIGNED">Назначен</option>
                                        <option value="IN_DELIVERY">🚀 В пути</option>
                                        <option value="DELIVERED">✅ Доставлен</option>
                                        <option value="RETURNED">↩️ Возврат</option>
                                        <option value="CANCELLED">❌ Отменен</option>
                                      </select>
                                    </div>

                                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a18", marginBottom: 10, lineHeight: 1.4, flex: 1 }}>{o.address}</div>

                                    <div style={{ background: "#fff", borderRadius: 8, padding: 10, border: "1px solid #f0efe9" }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase" }}>Получатель</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a18" }}>
                                          {phone !== "—" ? <a href={`tel:${phone}`} style={{ color: "#4a7aff", textDecoration: "none" }}>{phone}</a> : "—"}
                                        </div>
                                      </div>
                                      {o.items && <div style={{ fontSize: 12, color: "#6b6860", borderTop: "1px solid #f0efe9", paddingTop: 6 }}>{o.items}</div>}
                                      {o.comment && <div style={{ fontSize: 12, color: "#d94040", marginTop: 6, fontWeight: 600 }}>⚠ {o.comment}</div>}
                                    </div>

                                    {/* 🔥 Кнопки управления маршрутом */}
                                    <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", gap: 8, borderTop: "1px solid #e8e6df" }}>
                                      {rId !== "no_route" ? (
                                        <button
                                          onClick={() => handleRouteUpdate(o.id, null)}
                                          style={{ width: "100%", background: "rgba(217, 64, 64, 0.08)", color: "#d94040", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                                        >
                                          ❌ Убрать из маршрута
                                        </button>
                                      ) : (
                                        <select
                                          value=""
                                          onChange={(e) => handleRouteUpdate(o.id, e.target.value)}
                                          style={{ width: "100%", background: "rgba(74, 122, 255, 0.08)", color: "#4a7aff", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", outline: "none", transition: "all 0.2s" }}
                                        >
                                          <option value="" disabled>➕ Добавить в маршрут...</option>
                                          {/* Показываем только маршруты этого курьера */}
                                          {Object.entries(routeGroups).filter(([id]) => id !== "no_route").map(([id, group]) => (
                                            <option key={id} value={id}>
                                              Маршрут {group[0]?.route?.name || "Неизвестен"}
                                            </option>
                                          ))}
                                        </select>
                                      )}
                                    </div>

                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && filtered.filter(c => orders.some(o => o.courierId === c.id && getODate(o) === routesDate)).length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#a8a49c", fontSize: 14 }}>
                На {formatDay(routesDate)} нет маршрутов
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: 16 },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18" },
  content: { padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 16px 0" },
  tabs: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 },
  tabActive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: "#4a7aff", color: "#fff", whiteSpace: "nowrap" },
  tabInactive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", background: "#fafaf8", color: "#6b6860", whiteSpace: "nowrap" },
  controls: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  arrowBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6b6860" },
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff", margin: 0 }
};