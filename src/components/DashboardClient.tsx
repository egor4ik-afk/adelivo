"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProfilePanel } from "./ProfilePanel";

interface User { id: string; email: string; role: string; firstName?: string | null; lastName?: string | null; }

interface Order {
  id: string; crmId: string; externalId: string | null; status: string;
  address: string | null; lat: number | null; lng: number | null;
  price: number | null; courier: string | null; comment: string | null;
  opComment: string | null; items: string | null;
  slotFrom: string | null; slotTo: string | null; slotRaw: string | null;
  isInvalid: boolean; invalidReason: string | null; crmCreatedAt: string | null;
}

const SLOTS = [
  { label: "10–12", from: "10:00", to: "12:00", color: "#1a9e5c" },
  { label: "12–14", from: "12:00", to: "14:00", color: "#4a7aff" },
  { label: "14–16", from: "14:00", to: "16:00", color: "#7c4dff" },
  { label: "16–18", from: "16:00", to: "18:00", color: "#c8780a" },
  { label: "18–20", from: "18:00", to: "20:00", color: "#d94040" },
  { label: "20–22", from: "20:00", to: "22:00", color: "#e0548a" },
];

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", GEOCODED: "Геокодирован", INVALID_ADDRESS: "⚠ Адрес",
  ASSIGNED: "Назначен", IN_DELIVERY: "В пути",
  DELIVERED: "Доставлен", RETURNED: "Возврат", CANCELLED: "Отменён",
};

function slotColor(o: Order) {
  if (o.isInvalid) return "#d94040";
  return SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo)?.color ?? "#4a7aff";
}

let ymapsReady: Promise<void> | null = null;
function loadYMaps(): Promise<void> {
  if (ymapsReady) return ymapsReady;
  ymapsReady = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.ymaps) { window.ymaps.ready(resolve); return; }
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY}&lang=ru_RU`;
    s.onload = () => window.ymaps.ready(resolve);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return ymapsReady;
}

export function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<ymaps.Map | null>(null);
  const clustererRef = useRef<ymaps.Clusterer | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [slot, setSlot] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const invalid = orders.filter(o => o.isInvalid);
  const filtered = slot === "all" ? orders : orders.filter(o => {
    const s = SLOTS.find(x => x.label === slot);
    return s ? o.slotFrom === s.from && o.slotTo === s.to : true;
  });

  const fetchOrders = useCallback(async () => {
    const params = new URLSearchParams();
    if (slot !== "all") {
      const s = SLOTS.find(x => x.label === slot);
      if (s) params.set("slot", `${s.from}-${s.to}`);
    }
    const res = await fetch(`/api/orders?${params}`);
    if (res.ok) { setOrders(await res.json()); setLastSync(new Date().toLocaleTimeString("ru")); }
    setLoading(false);
  }, [slot]);

  useEffect(() => { fetchOrders(); const t = setInterval(fetchOrders, 30_000); return () => clearInterval(t); }, [fetchOrders]);

  // Push: слушаем клик по уведомлению из SW
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NOTIFICATION_CLICK" && e.data.orderId) {
        setSelectedId(e.data.orderId);
        fetchOrders();
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [fetchOrders]);

  // Карта
  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [55.752, 37.617], zoom: 10, controls: ["zoomControl"] });
      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20, clusterIconPieChartCoreRadius: 12, clusterIconPieChartStrokeWidth: 2 } as any);
      map.geoObjects.add(clusterer as any);
      ymapRef.current = map;
      clustererRef.current = clusterer;
    });
    return () => { mounted = false; };
  }, []);

  // Пины
  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || !window.ymaps) return;
    clusterer.removeAll();
    filtered.filter(o => o.lat && o.lng).forEach(order => {
      const color = slotColor(order);
      const pm = new window.ymaps.Placemark([order.lat!, order.lng!], {
        balloonContentHeader: order.externalId ?? order.crmId,
        balloonContentBody: `<div style="font-size:13px"><b>${order.address ?? "—"}</b><br><span style="color:#888">${order.slotRaw ?? "—"}</span><br>${order.courier ?? ""}<br><span style="color:#999">${order.items ?? ""}</span>${order.isInvalid ? `<br><span style="color:#d94040">⚠ ${order.invalidReason}</span>` : ""}</div>`,
        hintContent: order.address ?? "—",
      }, { preset: selectedId === order.id ? "islands#redDotIcon" : "islands#dotIcon", iconColor: color });
      pm.events.add("click", () => setSelectedId(p => p === order.id ? null : order.id));
      clusterer.add(pm);
    });
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selected?.lat && selected?.lng) ymapRef.current?.panTo([selected.lat, selected.lng], { flying: true });
  }, [selected]);

  async function logout() { await fetch("/api/auth/verify", { method: "DELETE" }); router.push("/login"); }

  const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || user.email.slice(0, 2).toUpperCase();

  return (
    <div style={s.app}>
      {/* Topbar */}
      <div style={s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <div style={s.slotBar}>
          <SlotBtn label="Все" active={slot === "all"} color="#4a7aff" onClick={() => setSlot("all")} />
          {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={slot === sl.label} color={sl.color} onClick={() => setSlot(sl.label)} />)}
        </div>
        <div style={{ flex: 1 }} />
        {lastSync && <span style={s.syncLabel}>обновлено {lastSync}</span>}
        {invalid.length > 0 && (
          <button style={s.alertBadge} onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>
            ⚠ {invalid.length} проблем{invalid.length === 1 ? "а" : "ы"}
          </button>
        )}
        <button style={s.userBtn} onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}>{initials}</button>
      </div>

      <div style={s.main}>
        {/* Left */}
        <div style={s.leftPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Заказы</span>
            <span style={s.countBadge}>{filtered.length}</span>
          </div>
          <div style={s.ordersList}>
            {loading ? <div style={s.empty}>Загрузка...</div>
              : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div>
              : filtered.map(o => (
                <OrderCard key={o.id} order={o} selected={selectedId === o.id}
                  onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />
              ))}
          </div>
        </div>

        {/* Right */}
        <div style={s.rightPanel}>
          <div ref={mapRef} style={s.map} />
          {selected && (
            <DetailBar order={selected} onClose={() => setSelectedId(null)}
              onSaveComment={async c => {
                await fetch(`/api/orders/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opComment: c }) });
              }} />
          )}
        </div>
      </div>

      {/* Profile popup */}
      {profileOpen && (
        <div style={{ position: "fixed", top: 52, right: 8, zIndex: 200 }}>
          <ProfilePanel onClose={() => setProfileOpen(false)} onLogout={logout} />
        </div>
      )}

      {/* Alerts popup */}
      {alertsOpen && invalid.length > 0 && (
        <div style={{ ...s.popup, right: 52 }} onClick={e => e.stopPropagation()}>
          <div style={s.alertTitle}>⚠ Проблемные адреса</div>
          {invalid.map(o => (
            <div key={o.id} style={s.alertItem} onClick={() => { setSelectedId(o.id); setAlertsOpen(false); }}>
              <div style={s.alertAddr}>{o.address ?? "—"}</div>
              <div style={s.alertSub}>{o.externalId} · {o.invalidReason ?? "Требует проверки"}</div>
            </div>
          ))}
        </div>
      )}

      {(profileOpen || alertsOpen) && (
        <div style={s.overlay} onClick={() => { setProfileOpen(false); setAlertsOpen(false); }} />
      )}
    </div>
  );
}

function SlotBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button style={{ ...s.slotBtn, ...(active ? { background: color, borderColor: color, color: "#fff" } : {}) }} onClick={onClick}>
      {label}
    </button>
  );
}

function OrderCard({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  const color = slotColor(order);
  return (
    <div style={{ ...s.card, ...(selected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
      <div style={s.cardRow1}>
        <span style={{ ...s.statusDot, background: color }} />
        <span style={s.extId}>{order.externalId ?? order.crmId}</span>
        {order.isInvalid && <span style={s.invalidTag}>⚠</span>}
        <span style={{ ...s.statusTag, background: `${color}18`, color }}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div style={s.cardAddr}>{order.address ?? "—"}</div>
      <div style={s.cardMeta}>
        <span style={{ ...s.slotTag, color }}>{order.slotFrom}–{order.slotTo ?? ""}</span>
        <span style={s.courierTag}>{order.courier ?? "—"}</span>
        {order.price != null && <span style={s.priceTag}>{order.price} ₽</span>}
      </div>
    </div>
  );
}

function DetailBar({ order, onClose, onSaveComment }: { order: Order; onClose: () => void; onSaveComment: (c: string) => void }) {
  const [comment, setComment] = useState(order.opComment ?? "");
  const [saved, setSaved] = useState(false);
  const color = slotColor(order);

  async function save() {
    await onSaveComment(comment);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={s.detailBar}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" as const }}>
          <span style={{ ...s.statusDot, width: 8, height: 8, background: color }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18" }}>{order.address ?? "—"}</span>
          {order.isInvalid && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(217,64,64,0.1)", color: "#d94040" }}>⚠ {order.invalidReason}</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 12, marginBottom: 6 }}>
          <Chip label="Слот"      value={`${order.slotFrom ?? "—"}–${order.slotTo ?? ""}`} />
          <Chip label="Курьер"    value={order.courier ?? "—"} />
          <Chip label="Стоимость" value={order.price ? `${order.price} ₽` : "—"} />
          <Chip label="Статус"    value={STATUS_LABELS[order.status] ?? order.status} />
        </div>
        {order.items && <div style={{ fontSize: 12, color: "#6b6860", marginBottom: 3 }}><b style={{ color: "#a8a49c" }}>Состав: </b>{order.items}</div>}
        {order.comment && <div style={{ fontSize: 12, color: "#6b6860" }}><b style={{ color: "#a8a49c" }}>Клиент: </b>{order.comment}</div>}
      </div>
      <div style={{ width: 200, flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" as const, marginBottom: 4 }}>Комментарий оператора</div>
        <textarea style={{ width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, fontFamily: "Manrope, system-ui, sans-serif", resize: "none", outline: "none", color: "#1a1a18", background: "#fafaf8" }}
          rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="Добавить заметку..." />
        <button style={{ marginTop: 5, padding: "6px 12px", borderRadius: 6, background: saved ? "#1a9e5c" : "#4a7aff", border: "none", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }} onClick={save}>
          {saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>
      <button style={{ background: "none", border: "none", color: "#a8a49c", fontSize: 16, cursor: "pointer", padding: "0 0 0 12px", alignSelf: "flex-start" }} onClick={onClose}>✕</button>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "#a8a49c", textTransform: "uppercase" as const, letterSpacing: ".3px" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "#1a1a18" }}>{value}</div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0, zIndex: 10, position: "relative" },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  slotBar: { display: "flex", gap: 4, marginLeft: 12 },
  slotBtn: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid #e8e6df", background: "transparent", color: "#6b6860", cursor: "pointer", whiteSpace: "nowrap" },
  syncLabel: { fontSize: 11, color: "#a8a49c", whiteSpace: "nowrap" },
  alertBadge: { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(217,64,64,0.08)", border: "1px solid rgba(217,64,64,0.2)", color: "#d94040", cursor: "pointer", whiteSpace: "nowrap" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 },
  main: { display: "flex", flex: 1, overflow: "hidden" },
  leftPanel: { width: 300, minWidth: 260, background: "#fff", borderRight: "1px solid #e8e6df", display: "flex", flexDirection: "column", flexShrink: 0 },
  panelHeader: { padding: "11px 14px 9px", borderBottom: "1px solid #e8e6df", display: "flex", alignItems: "center", flexShrink: 0 },
  panelTitle: { fontSize: 11, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: "0.5px" },
  countBadge: { marginLeft: "auto", padding: "2px 7px", borderRadius: 10, background: "#f5f4f0", fontSize: 11, color: "#6b6860", fontWeight: 500 },
  ordersList: { flex: 1, overflowY: "auto", padding: 6 },
  empty: { padding: 24, textAlign: "center", color: "#a8a49c", fontSize: 12 },
  card: { padding: "10px 11px", borderRadius: 8, marginBottom: 4, background: "#fafaf8", border: "1px solid #e8e6df", cursor: "pointer", transition: "all .12s" },
  cardSelected: { background: "#eef3ff", borderColor: "#4a7aff" },
  cardInvalid: { borderColor: "rgba(217,64,64,0.3)", background: "#fff8f8" },
  cardRow1: { display: "flex", alignItems: "center", gap: 5, marginBottom: 5 },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block" },
  extId: { fontSize: 10, fontWeight: 600, color: "#a8a49c", fontFamily: "monospace" },
  invalidTag: { fontSize: 10, color: "#d94040", fontWeight: 700 },
  statusTag: { marginLeft: "auto", fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 500 },
  cardAddr: { fontSize: 12, color: "#1a1a18", lineHeight: "1.35", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { display: "flex", alignItems: "center", gap: 6 },
  slotTag: { fontSize: 10, fontWeight: 600 },
  courierTag: { fontSize: 10, color: "#a8a49c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  priceTag: { fontSize: 10, color: "#6b6860", flexShrink: 0 },
  rightPanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  map: { flex: 1 },
  detailBar: { background: "#fff", borderTop: "1px solid #e8e6df", padding: "12px 16px", flexShrink: 0, display: "flex", gap: 16, alignItems: "flex-start" },
  popup: { position: "fixed", top: 52, right: 8, background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, zIndex: 200, width: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  alertTitle: { fontSize: 11, fontWeight: 700, color: "#d94040", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 },
  alertItem: { padding: "7px 0", borderBottom: "0.5px solid #f5f4f0", cursor: "pointer" },
  alertAddr: { fontSize: 12, color: "#1a1a18", marginBottom: 2 },
  alertSub: { fontSize: 11, color: "#d94040", opacity: 0.8 },
};

declare global { interface Window { ymaps: typeof ymaps; } }