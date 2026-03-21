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
}

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
  
  const [activeTab, setActiveTab] = useState<"schedule" | "calc">("schedule");

  // График
  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [sortDate, setSortDate] = useState(scheduleDates[1]); // Завтра по умолчанию

  // Расчет (недели)
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  });
  const calcDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [selectedPays, setSelectedPays] = useState<string[]>([]); 

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
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <button onClick={() => router.push('/dashboard')} style={s.navBtn}>🗺️ Дашборд</button>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <div style={{ flex: 1 }} />
      </div>

      <div style={s.content}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.title}>Курьеры</h1>
            <div style={s.tabs}>
              <button style={activeTab === "schedule" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("schedule")}>📅 График смен</button>
              <button style={activeTab === "calc" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("calc")}>💰 Расчет ЗП</button>
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

        {activeTab === "schedule" && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  <th style={{ ...s.th, width: 120 }}>Телефон</th>
                  {scheduleDates.map((d, i) => (
                    <th key={d} style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8" }} onClick={() => setSortDate(d)} title="Нажмите, чтобы отсортировать">
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
              <div style={{ fontSize: 12, color: "#a8a49c" }}>Считаются только заказы со статусом "Доставлен"</div>
            </div>

            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  {calcDates.map(d => <th key={d} style={{ ...s.th, textAlign: "center" }}>{formatDay(d)}<br/><span style={{ fontSize: 10 }}>{d.slice(5).replace("-", ".")}</span></th>)}
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
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: 16 },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff" },
  content: { padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 16px 0" },
  tabs: { display: "flex", gap: 8 },
  tabActive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: "#4a7aff", color: "#fff" },
  tabInactive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", background: "#fafaf8", color: "#6b6860" },
  controls: { display: "flex", gap: 10, alignItems: "center" },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  arrowBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6b6860" },
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff", margin: 0 }
};