// src/components/CouriersClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OrderDetail } from "./OrderDetail";
import { RouteEditor } from "./RouteEditor";
import Link from "next/link";

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
  items: string | null; comment: string | null; opComment: string | null; 
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string; link: string | null; date: string } | null;
  isInvalid?: boolean; invalidReason?: string | null;
  
  lat?: number | null;
  lng?: number | null;
  courier?: string | null;
  slotFrom?: string | null;
  slotTo?: string | null;
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
  const [isMobile, setIsMobile] = useState(false);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const [activeTab, setActiveTab] = useState<"schedule" | "calc" | "routes">("routes");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [sortDate, setSortDate] = useState(scheduleDates[1]);

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  });
  const calcDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [selectedPays, setSelectedPays] = useState<string[]>([]); 

  const [routesDate, setRoutesDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [expandedCouriers, setExpandedCouriers] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const checkMob = () => setIsMobile(window.innerWidth < 768);
    checkMob(); window.addEventListener("resize", checkMob);
    return () => window.removeEventListener("resize", checkMob);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([fetch("/api/couriers"), fetch("/api/orders")]);
      if (cRes.ok) setCouriers(await cRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getODate = (o: Order) => o.route?.date || (o.deliveryDate ? o.deliveryDate.split('T')[0] : null) || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
  const getCourierOrders = (courierId: number, date: string, requireDelivered = false) => {
    return orders.filter(o => o.courierId === courierId && getODate(o) === date && (!requireDelivered || o.status === "DELIVERED"));
  };
  const getCount = (courierId: number, date: string, reqDeliv = false) => getCourierOrders(courierId, date, reqDeliv).length;
  const getSum = (courierId: number, date: string) => getCourierOrders(courierId, date, true).reduce((acc, o) => acc + (o.price || 0), 0);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    await fetch(`/api/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus })
    });
    fetchAll(); 
  };

  const createRouteFromUnassigned = async (orderId: string, courierId: number) => {
    await fetch("/api/routes/assign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds: [orderId], courierId, routeDate: routesDate })
    });
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

  // 🔥 Вычисляем ВСЕ свободные точки на эту дату (нет routeId)
  const globalFreeOrders = orders.filter(o => 
    !o.routeId && 
    getODate(o) === routesDate && 
    o.status !== "DELIVERED" && 
    o.status !== "CANCELLED"
  );

  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <div style={s.logo}>
            <img src="/favicon.svg" alt="Logo" style={{ width: 22, height: 22 }} />
            EventWave
          </div>
        </Link>
        <button onClick={() => router.push('/dashboard')} style={s.navBtn}>🗺️ Дашборд</button>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ ...s.content, padding: isMobile ? "16px 12px" : "24px" }}>
        <div style={{ ...s.headerRow, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end" }}>
          <div>
            <h1 style={s.title}>Курьеры</h1>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
              <button style={activeTab === "routes" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("routes")}>🗺️ Маршруты</button>
              <button style={activeTab === "schedule" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("schedule")}>📅 График</button>
              <button style={activeTab === "calc" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("calc")}>💰 ЗП</button>
            </div>
          </div>
          
          <div style={s.controls}>
            {activeTab === "calc" && (
              <button style={{ ...s.syncBtn, background: selectedPays.length > 0 ? "#10b981" : "#e5e7eb", color: selectedPays.length > 0 ? "#fff" : "#9ca3af" }} disabled={selectedPays.length === 0} onClick={handlePay}>
                ✅ Рассчитан ({selectedPays.length})
              </button>
            )}
            <input type="text" placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...s.input, width: isMobile ? "100%" : "auto" }} />
            <button style={{ ...s.syncBtn, width: isMobile ? "100%" : "auto" }} onClick={() => fetchAll()}>🔄 Обновить</button>
          </div>
        </div>

        {/* --- ГРАФИК --- */}
        {activeTab === "schedule" && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  <th style={{ ...s.th, width: 120 }}>Телефон</th>
                  {scheduleDates.map((d, i) => (
                    <th key={d} style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8" }} onClick={() => setSortDate(d)}>
                      {i === 0 ? "Сегодня" : i === 1 ? "Завтра" : formatDay(d)}<br/><span style={{ fontSize: 10, fontWeight: 500 }}>{d.slice(5).replace("-", ".")}</span>
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

        {/* --- РАСЧЕТ ЗП --- */}
        {activeTab === "calc" && (
           <div style={s.tableWrap}>
             <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e8e6df", flexWrap: "wrap", gap: 10 }}>
               <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                 <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}>◀ Неделя</button>
                 <span style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize", color: "#1a1a18" }}>
                   {weekStart.toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
                 </span>
                 <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}>Неделя ▶</button>
               </div>
             </div>
             <table style={s.table}>
               <thead>
                 <tr>
                   <th style={{ ...s.th, width: 220 }}>Курьер</th>
                   {calcDates.map(d => <th key={d} style={{ ...s.th, textAlign: "center" }}>{formatDay(d)}<br/><span style={{ fontSize: 10 }}>{d.slice(5).replace("-", ".")}</span></th>)}
                   <th style={{ ...s.th, textAlign: "right", color: "#10b981" }}>Итого</th>
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

        {/* --- МАРШРУТЫ --- */}
        {activeTab === "routes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: isMobile ? "12px" : "12px 16px", borderRadius: 12, border: "1px solid #e8e6df", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a18" }}>Дата маршрутов:</span>
              <input type="date" value={routesDate} onChange={e => setRoutesDate(e.target.value)} style={{ ...s.input, flex: 1, maxWidth: 200 }} />
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка маршрутов...</div> : null}

            {!loading && filtered.map(c => {
              const cOrders = orders.filter(o => o.courierId === c.id && getODate(o) === routesDate);
              if (cOrders.length === 0) return null; 

              const routeGroups: Record<string, Order[]> = {};
              cOrders.forEach(o => {
                const key = o.route?.id || o.routeId || "no_route";
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(o);
              });

              const courierUnassignedOrders = routeGroups["no_route"] || [];
              const isCExpanded = expandedCouriers[c.id] ?? true;
              const routeKeys = Object.keys(routeGroups).filter(k => k !== "no_route").sort((a, b) => b.localeCompare(a));

              return (
                <div key={c.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                  
                  <div onClick={() => setExpandedCouriers(prev => ({...prev, [c.id]: !isCExpanded}))} style={{ padding: "14px 16px", background: "#fafaf8", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: isCExpanded ? "1px solid #e8e6df" : "none" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18" }}>{c.fullName}</div>
                      <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>Активных: {cOrders.filter(o => o.status !== "DELIVERED" && o.status !== "CANCELLED").length} · Всего: {cOrders.length}</div>
                    </div>
                    <div style={{ fontSize: 18, color: "#a8a49c", transform: isCExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</div>
                  </div>

                  {isCExpanded && (
                    <div style={{ padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 20 }}>
                      
                      {routeKeys.map((rId) => {
                        const rOrders = routeGroups[rId];
                        const rObj = rOrders.find(o => o.route)?.route; 
                        const rName = rObj ? rObj.name : "Неизвестен";
                        const rLink = rObj ? rObj.link : null;

                        return (
                          <RouteEditor 
                            key={rId}
                            routeId={rId} routeName={rName} routeLink={rLink}
                            initialOrders={rOrders}
                            globalFreeOrders={globalFreeOrders} // 🔥 Передаем ВСЕ свободные заказы для выпадающего списка
                            courierId={c.id}
                            routesDate={routesDate}
                            isMobile={isMobile}
                            onSaved={fetchAll}
                            onStatusChange={handleStatusChange}
                            onOpenDetail={setSelectedOrder}
                          />
                        );
                      })}

                      {courierUnassignedOrders.length > 0 && (
                        <div>
                          <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: "#6b6860" }}>Без маршрута ({courierUnassignedOrders.length})</h4>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                            {courierUnassignedOrders.map(o => {
                              const st = STATUS_MAP[o.status] || STATUS_MAP.NEW;
                              return (
                                <div key={o.id} style={{ background: "#fafaf8", borderRadius: 10, border: "1px dashed #a8a49c", padding: 14, display: "flex", flexDirection: "column" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                    <div>
                                      <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{o.slotRaw}</div>
                                    </div>
                                    <div style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                                      {st.label}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", marginBottom: 12, lineHeight: 1.4, flex: 1 }}>{o.address}</div>
                                  
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setSelectedOrder(o as any)} style={{ flex: 1, background: "#fff", border: "1px solid #e8e6df", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Открыть</button>
                                    <button onClick={() => createRouteFromUnassigned(o.id, c.id)} style={{ flex: 2, background: "rgba(74, 122, 255, 0.08)", color: "#4a7aff", border: "none", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                      ➕ В новый маршрут
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

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

      {selectedOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 450, maxWidth: "100%", background: "#fff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
            <OrderDetail
              selected={selectedOrder as any}
              couriers={couriers.map(c => ({ value: c.fullName, label: c.fullName }))}
              onClose={() => setSelectedOrder(null)}
              onUpdateSuccess={() => { setSelectedOrder(null); fetchAll(); }}
              onPreviewGeo={() => {}}
              fixingAI={false}
              setFixingAI={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: "auto", flexShrink: 0 },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  content: { margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1200 },
  headerRow: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 16px 0" },
  tabActive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: "#4a7aff", color: "#fff", whiteSpace: "nowrap" },
  tabInactive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", background: "#fafaf8", color: "#6b6860", whiteSpace: "nowrap" },
  controls: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  arrowBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6b6860" },
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", width: "100%" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff", margin: 0 }
};