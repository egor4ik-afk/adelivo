"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface Order {
  id: string;
  crmId: string;
  externalId: string | null;
  status: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price: number | null;
  courier: string | null;
  comment: string | null;
  opComment: string | null;
  items: string | null;
  slotFrom: string | null;
  slotTo: string | null;
  slotRaw: string | null;
  deliveryType: string | null;
  deliveryDate: string | null;
  isInvalid: boolean;
  invalidReason: string | null;
  crmCreatedAt: string | null;
  updatedAt?: string;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", ASSIGNED: "Назначен", IN_DELIVERY: "В пути", 
  DELIVERED: "Доставлен", RETURNED: "Возврат", CANCELLED: "Отменён",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Фильтры
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [fStatus, setFStatus] = useState("ALL");
  const [fCourier, setFCourier] = useState("ALL");
  const [fSearch, setFSearch] = useState("");

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      if (res.ok) setOrders(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOrders(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/cron/sync");
      await fetchOrders();
    } catch (e) { console.error(e); }
    finally { setSyncing(false); }
  };

  // Фильтрация
  const dateOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    return oDate === filterDate;
  });

  const couriers = useMemo(() => Array.from(new Set(orders.map(o => o.courier).filter(Boolean) as string[])).sort(), [orders]);

  const filtered = dateOrders.filter(o => {
    if (fStatus !== "ALL" && o.status !== fStatus) return false;
    if (fCourier !== "ALL" && (o.courier || "UNASSIGNED") !== fCourier) return false;
    if (fSearch) {
      const q = fSearch.toLowerCase();
      return (o.externalId || "").toLowerCase().includes(q) || (o.address || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", background: "#f5f4f0", minHeight: "100vh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "#1a1a18" }}>Все заказы</h1>
          <Link href="/dashboard" style={{ color: "#4a7aff", textDecoration: "none", fontSize: 14 }}>← На дашборд</Link>
        </div>
        <button 
          onClick={handleSync} disabled={syncing}
          style={{ padding: "8px 16px", background: syncing ? "#a8a49c" : "#1a9e5c", color: "#fff", border: "none", borderRadius: 6, cursor: syncing ? "wait" : "pointer" }}
        >
          {syncing ? "Синхронизация..." : "↻ Обновить из CRM"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input 
          type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e6df" }}
        />
        <input 
          placeholder="Поиск по номеру или адресу..." value={fSearch} onChange={e => setFSearch(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e6df", flex: 1, minWidth: 200 }}
        />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e6df" }}>
          <option value="ALL">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fCourier} onChange={e => setFCourier(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e6df" }}>
          <option value="ALL">Все курьеры</option>
          <option value="UNASSIGNED">Не назначен</option>
          {couriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #e8e6df", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
        <thead>
            <tr style={{ background: "#fafaf8", color: "#6b6860", textTransform: "uppercase", fontSize: 11 }}>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>ID</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>Статус</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>Курьер</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>Адрес</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>Слот</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>Сумма</th>
              <th style={{ padding: 12, borderBottom: "1px solid #e8e6df" }}>На карте</th> {/* НОВАЯ КОЛОНКА */}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 20, textAlign: "center" }}>На {filterDate} заказов не найдено</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} style={{ borderBottom: "1px solid #f0efe9" }}>
                <td style={{ padding: 12, fontWeight: 600 }}>{o.externalId ?? o.crmId}</td>
                <td style={{ padding: 12 }}>{STATUS_LABELS[o.status] || o.status}</td>
                <td style={{ padding: 12, color: o.courier ? "#1a1a18" : "#a8a49c" }}>{o.courier || "—"}</td>
                <td style={{ padding: 12 }}>
                  {!o.isInvalid && o.lat && o.lng && <span style={{ color: "#1a9e5c", marginRight: 6 }} title="Геокодирован">✓</span>}
                  {o.isInvalid && <span style={{ color: "red", marginRight: 6 }} title={o.invalidReason || "Ошибка"}>⚠</span>}
                  {o.address || "—"}
                </td>
                <td style={{ padding: 12 }}>{o.slotRaw || "—"}</td>
                <td style={{ padding: 12 }}>{o.price ? `${o.price} ₽` : "—"}</td>
                {/* ССЫЛКА НА ДАШБОРД */}
                <td style={{ padding: 12 }}>
                  <Link href={`/dashboard?orderId=${o.id}`} style={{ color: "#4a7aff", textDecoration: "none", fontSize: 12, fontWeight: 600, background: "#eef3ff", padding: "4px 8px", borderRadius: 6 }}>
                    📍 Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}