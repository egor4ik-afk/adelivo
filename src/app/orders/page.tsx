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
  changedAt?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", ASSIGNED: "Назначен", IN_DELIVERY: "В пути",
  DELIVERED: "Доставлен", RETURNED: "Возврат", CANCELLED: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "#a8a49c", ASSIGNED: "#4a7aff", IN_DELIVERY: "#7c4dff",
  DELIVERED: "#1a9e5c", RETURNED: "#c8780a", CANCELLED: "#d94040",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  const dateOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    return oDate === filterDate;
  });

  const couriers = useMemo(() =>
    Array.from(new Set(orders.map(o => o.courier).filter(Boolean) as string[])).sort(),
    [orders]
  );

  const filtered = useMemo(() => {
    return dateOrders
      .filter(o => {
        if (fStatus !== "ALL" && o.status !== fStatus) return false;
        if (fCourier !== "ALL" && (o.courier || "UNASSIGNED") !== fCourier) return false;
        if (fSearch) {
          const q = fSearch.toLowerCase();
          return (o.externalId || "").toLowerCase().includes(q) ||
            (o.address || "").toLowerCase().includes(q) ||
            (o.courier || "").toLowerCase().includes(q);
        }
        return true;
      })
      // Сортировка по updatedAt DESC (последние изменения сверху)
      .sort((a, b) => new Date(b.changedAt || b.updatedAt || "").getTime() - new Date(a.changedAt || a.updatedAt || "").getTime());
  }, [dateOrders, fStatus, fCourier, fSearch]);

  return (
    <div style={{ fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", minHeight: "100vh" }}>
      {/* Шапка */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e8e6df", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
        <Link href="/dashboard" style={{ color: "#a8a49c", textDecoration: "none", fontSize: 13, fontWeight: 500 }}>← Дашборд</Link>
        <div style={{ width: 1, height: 20, background: "#e8e6df" }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18" }}>Все заказы</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSync} disabled={syncing}
          style={{ padding: "6px 14px", background: syncing ? "#e8e6df" : "#1a9e5c", color: syncing ? "#a8a49c" : "#fff", border: "none", borderRadius: 7, cursor: syncing ? "wait" : "pointer", fontSize: 12, fontWeight: 600 }}
        >
          {syncing ? "Синхронизация..." : "↻ Обновить из CRM"}
        </button>
      </div>

      {/* Фильтры */}
      <div style={{ padding: "16px 24px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Поиск по ID, адресу, курьеру..." value={fSearch} onChange={e => setFSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={inputStyle}>
          <option value="ALL">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fCourier} onChange={e => setFCourier(e.target.value)} style={inputStyle}>
          <option value="ALL">Все курьеры</option>
          <option value="UNASSIGNED">Не назначен</option>
          {couriers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#a8a49c", whiteSpace: "nowrap" }}>{filtered.length} заказов</span>
      </div>

      {/* Таблица */}
      <div style={{ padding: "0 24px 24px" }}>
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e8e6df", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#fafaf8", borderBottom: "1px solid #e8e6df" }}>
                  {["ID", "Статус", "Курьер", "Адрес", "Слот", "Сумма", "Изменён", "Карта"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".4px", whiteSpace: "nowrap" }}>
                      {h}{h === "Изменён" && <span style={{ marginLeft: 4, color: "#4a7aff" }}>↓</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#a8a49c" }}>Загрузка...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#a8a49c" }}>На {filterDate} заказов не найдено</td></tr>
                ) : filtered.map((o, i) => {
                  const statusColor = STATUS_COLORS[o.status] ?? "#a8a49c";
                  return (
                    <tr key={o.id} style={{ borderBottom: "1px solid #f5f4f0", background: i % 2 === 0 ? "#fff" : "#fafaf8" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "#6b6860", whiteSpace: "nowrap" }}>
                        {o.externalId ?? o.crmId}
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${statusColor}18`, color: statusColor }}>
                          {STATUS_LABELS[o.status] || o.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", color: o.courier ? "#1a1a18" : "#d94040", fontSize: 12, whiteSpace: "nowrap" }}>
                        {o.courier || "—"}
                      </td>
                      <td style={{ padding: "10px 14px", maxWidth: 260, color: "#1a1a18" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {!o.isInvalid && o.lat && o.lng && <span style={{ color: "#1a9e5c", flexShrink: 0 }} title="Геокодирован">✓</span>}
                          {o.isInvalid && <span style={{ color: "#d94040", flexShrink: 0 }} title={o.invalidReason || "Ошибка"}>⚠</span>}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.address || "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#6b6860" }}>{o.slotRaw || "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#1a1a18" }}>{o.price ? `${o.price} ₽` : "—"}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", fontSize: 11 }}>
                        {o.changedAt ? (
                          <span style={{ color: "#1a1a18", fontWeight: 500 }}>
                            {fmt(o.changedAt)}
                          </span>
                        ) : (
                          <span style={{ color: "#a8a49c" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <Link
                          href={`/dashboard?orderId=${o.id}`}
                          style={{ color: "#4a7aff", textDecoration: "none", fontSize: 11, fontWeight: 600, background: "#eef3ff", padding: "4px 8px", borderRadius: 6, whiteSpace: "nowrap" }}
                        >
                          📍 Открыть
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid #e0dfd7",
  fontSize: 12,
  outline: "none",
  color: "#1a1a18",
  background: "#fff",
  fontFamily: "inherit",
  maxWidth: 160, // 🔥 ДОБАВЛЕНО
};