"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProfilePanel } from "./ProfilePanel";

interface User {
  id: string; email: string; role: string;
  firstName?: string | null; lastName?: string | null;
}

interface Order {
  id: string; crmId: string; externalId: string | null; status: string;
  address: string | null; lat: number | null; lng: number | null;
  price: number | null; courier: string | null; comment: string | null;
  opComment: string | null; items: string | null;
  slotFrom: string | null; slotTo: string | null; slotRaw: string | null;
  deliveryType: string | null;
  isInvalid: boolean; invalidReason: string | null;
  crmCreatedAt: string | null; updatedAt: string;
}

const SLOTS = [
  { label: "10–12", from: "10:00", to: "12:00", color: "#1a9e5c" },
  { label: "12–14", from: "12:00", to: "14:00", color: "#4a7aff" },
  { label: "14–16", from: "14:00", to: "16:00", color: "#7c4dff" },
  { label: "16–18", from: "16:00", to: "18:00", color: "#c8780a" },
  { label: "18–20", from: "18:00", to: "20:00", color: "#d94040" },
  { label: "20–22", from: "20:00", to: "22:00", color: "#e0548a" },
];

const STATUS_OPTIONS = [
  { value: "NEW",             label: "Новый" },
  { value: "GEOCODED",        label: "Геокодирован" },
  { value: "INVALID_ADDRESS", label: "⚠ Адрес" },
  { value: "ASSIGNED",        label: "Назначен" },
  { value: "IN_DELIVERY",     label: "В пути" },
  { value: "DELIVERED",       label: "Доставлен" },
  { value: "RETURNED",        label: "Возврат" },
  { value: "CANCELLED",       label: "Отменён" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map(o => [o.value, o.label])
);

// Уникальные курьеры из текущих заказов
function getCouriers(orders: Order[]): string[] {
  const set = new Set(orders.map(o => o.courier).filter(Boolean) as string[]);
  return Array.from(set).sort();
}

function slotColor(o: Order): string {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ymapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clustererRef = useRef<any>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [slot, setSlot] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [dismissedInvalid, setDismissedInvalid] = useState(false);

  // Detail panel state
  const [opComment, setOpComment] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const invalid = orders.filter(o => o.isInvalid);
  const couriers = getCouriers(orders);

  const filtered = slot === "all" ? orders : orders.filter(o => {
    const s = SLOTS.find(x => x.label === slot);
    return s ? o.slotFrom === s.from && o.slotTo === s.to : true;
  });

  const tableOrders = [...orders].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const fetchOrders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (slot !== "all") {
        const s = SLOTS.find(x => x.label === slot);
        if (s) params.set("slot", `${s.from}-${s.to}`);
      }
      const res = await fetch(`/api/orders?${params}`);
      if (res.ok) { setOrders(await res.json()); setLastSync(new Date().toLocaleTimeString("ru")); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [slot]);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 30_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  useEffect(() => { setDismissedInvalid(false); }, [orders]);

  // Sync detail fields when selection changes
  useEffect(() => {
    setOpComment(selected?.opComment ?? "");
    setEditStatus(selected?.status ?? "");
    setEditCourier(selected?.courier ?? "");
    setSaved(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Init map
  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [55.752, 37.617], zoom: 10, controls: ["zoomControl"] }, {});
      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20, clusterIconPieChartCoreRadius: 12, clusterIconPieChartStrokeWidth: 2 });
      map.geoObjects.add(clusterer);
      ymapRef.current = map;
      clustererRef.current = clusterer;
    });
    return () => { mounted = false; };
  }, []);

  // Update pins
  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || typeof window === "undefined" || !window.ymaps) return;
    clusterer.removeAll();
    const placemarks = filtered.filter(o => o.lat && o.lng).map(order => {
      const color = slotColor(order);
      const pm = new window.ymaps.Placemark(
        [order.lat!, order.lng!],
        {
          balloonContentHeader: order.externalId ?? order.crmId,
          balloonContentBody: `<div style="font-size:13px;line-height:1.6">
            <b>${order.address ?? "—"}</b><br>
            <span style="color:#888">${order.slotRaw ?? "—"}</span><br>
            ${order.courier ? `Курьер: ${order.courier}<br>` : ""}
            ${order.items ? `<span style="color:#999">${order.items}</span>` : ""}
            ${order.isInvalid ? `<br><span style="color:#d94040">⚠ ${order.invalidReason}</span>` : ""}
          </div>`,
          hintContent: order.address ?? "—",
        },
        { preset: selectedId === order.id ? "islands#redDotIcon" : "islands#dotIcon", iconColor: color }
      );
      pm.events.add("click", () => setSelectedId(p => p === order.id ? null : order.id));
      return pm;
    });
    if (placemarks.length > 0) clusterer.add(placemarks);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selected?.lat && selected?.lng) ymapRef.current?.panTo([selected.lat, selected.lng], { flying: true });
  }, [selected]);

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    const body: Record<string, string> = {};
    if (editStatus !== selected.status) body.status = editStatus;
    if (editCourier !== (selected.courier ?? "")) body.courier = editCourier;
    if (opComment !== (selected.opComment ?? "")) body.opComment = opComment;

    if (Object.keys(body).length > 0) {
      await fetch(`/api/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchOrders();
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const hasChanges = selected && (
    editStatus !== selected.status ||
    editCourier !== (selected.courier ?? "") ||
    opComment !== (selected.opComment ?? "")
  );

  async function logout() {
    await fetch("/api/auth/verify", { method: "DELETE" });
    router.push("/login");
  }

  const initials = ((user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "")).toUpperCase() || user.email.slice(0, 2).toUpperCase();

  return (
    <div style={s.app}>

      {/* ── Topbar ── */}
      <div style={s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <div style={s.slotBar}>
          <SlotBtn label="Все" active={slot === "all"} color="#4a7aff" onClick={() => setSlot("all")} />
          {SLOTS.map(sl => (
            <SlotBtn key={sl.label} label={sl.label} active={slot === sl.label} color={sl.color} onClick={() => setSlot(sl.label)} />
          ))}
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

      {/* ── Invalid banner ── */}
      {invalid.length > 0 && !dismissedInvalid && (
        <div style={s.invalidBanner}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 12 }}>
            <b>{invalid.length} заказ{invalid.length === 1 ? "" : invalid.length < 5 ? "а" : "ов"}</b> с проблемными адресами —{" "}
            {invalid.map((o, i) => (
              <span key={o.id}>
                <span style={s.invalidBannerLink} onClick={() => setSelectedId(o.id)}>
                  {o.externalId ?? o.crmId}
                </span>
                {i < invalid.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
          <button style={s.invalidBannerClose} onClick={() => setDismissedInvalid(true)}>✕</button>
        </div>
      )}

      {/* ── Body ── */}
      <div style={s.body}>

        {/* Left panel */}
        <div style={s.leftPanel}>

          {/* Cards top 50% */}
          <div style={s.cardsSection}>
            <div style={s.sectionHeader}>
              <span style={s.sectionTitle}>Заказы</span>
              <span style={s.countBadge}>{filtered.length}</span>
            </div>
            <div style={s.cardsList}>
              {loading ? (
                <div style={s.empty}>Загрузка...</div>
              ) : filtered.length === 0 ? (
                <div style={s.empty}>Заказов нет</div>
              ) : filtered.map(o => (
                <OrderCard key={o.id} order={o} selected={selectedId === o.id}
                  onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />
              ))}
            </div>
          </div>

          {/* Detail bottom 50% */}
          <div style={s.detailSection}>
            {!selected ? (
              <div style={s.detailEmpty}>
                <div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center" as const }}>
                  Выберите заказ<br />на карте или в списке
                </div>
              </div>
            ) : (
              <div style={s.detailScroll}>

                {/* Header */}
                <div style={s.detailHeader}>
                  <span style={{ ...s.statusDotLg, background: slotColor(selected) }} />
                  <div style={{ flex: 1 }}>
                    <div style={s.detailExtId}>{selected.externalId ?? selected.crmId}</div>
                    <div style={s.detailAddr}>{selected.address ?? "—"}</div>
                  </div>
                  <button style={s.detailClose} onClick={() => setSelectedId(null)}>✕</button>
                </div>

                {selected.isInvalid && (
                  <div style={s.detailInvalidBanner}>⚠ {selected.invalidReason ?? "Проблемный адрес"}</div>
                )}

                {/* Slot + price (read-only) */}
                <div style={s.fieldsGrid}>
                  <div style={s.detailField}>
                    <div style={s.detailFieldLabel}>Слот</div>
                    <div style={{ ...s.detailFieldValue, color: slotColor(selected) }}>
                      {selected.slotRaw ?? `${selected.slotFrom}–${selected.slotTo}`}
                    </div>
                  </div>
                  <div style={s.detailField}>
                    <div style={s.detailFieldLabel}>Стоимость</div>
                    <div style={s.detailFieldValue}>{selected.price ? `${selected.price} ₽` : "—"}</div>
                  </div>
                </div>

                {/* Editable: Status */}
                <div style={s.editField}>
                  <div style={s.editFieldLabel}>Статус</div>
                  <select
                    style={s.select}
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Editable: Courier */}
                <div style={s.editField}>
                  <div style={s.editFieldLabel}>Курьер</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      style={{ ...s.select, flex: 1 }}
                      value={editCourier}
                      onChange={e => setEditCourier(e.target.value)}
                    >
                      <option value="">— Не назначен —</option>
                      {couriers.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {/* Ввести вручную */}
                    <input
                      style={{ ...s.input, width: 90 }}
                      placeholder="Или вручную"
                      value={couriers.includes(editCourier) ? "" : editCourier}
                      onChange={e => setEditCourier(e.target.value)}
                    />
                  </div>
                </div>

                {/* Items read-only */}
                {selected.items && (
                  <div style={s.editField}>
                    <div style={s.editFieldLabel}>Состав</div>
                    <div style={{ fontSize: 12, color: "#1a1a18", lineHeight: "1.4" }}>{selected.items}</div>
                  </div>
                )}

                {/* Comment клиента read-only */}
                {selected.comment && (
                  <div style={s.editField}>
                    <div style={s.editFieldLabel}>Комментарий клиента</div>
                    <div style={{ fontSize: 12, color: "#6b6860", lineHeight: "1.4" }}>{selected.comment}</div>
                  </div>
                )}

                {/* Editable: op comment */}
                <div style={s.editField}>
                  <div style={s.editFieldLabel}>Комментарий оператора</div>
                  <textarea
                    style={s.textarea}
                    rows={2}
                    value={opComment}
                    onChange={e => setOpComment(e.target.value)}
                    placeholder="Заметка..."
                  />
                </div>

                {/* Save button */}
                <button
                  style={{
                    ...s.saveBtn,
                    background: saved ? "#1a9e5c" : hasChanges ? "#4a7aff" : "#e8e6df",
                    color: hasChanges || saved ? "#fff" : "#a8a49c",
                    cursor: hasChanges ? "pointer" : "default",
                  }}
                  disabled={!hasChanges || saving}
                  onClick={saveChanges}
                >
                  {saved ? "✓ Сохранено" : saving ? "Сохраняем..." : "Сохранить изменения"}
                </button>

              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div ref={mapRef} style={s.map} />
      </div>

      {/* ── Bottom table ── */}
      <div style={s.tableSection}>
        <div style={s.tableHeader}>
          <span style={s.sectionTitle}>Все заказы</span>
          <span style={s.countBadge}>{tableOrders.length}</span>
          <span style={{ fontSize: 11, color: "#a8a49c", marginLeft: 6 }}>по дате изменения</span>
        </div>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {["Внешний ID", "Время доставки", "Адрес доставки", "Курьер", "Стоимость",
                  "Тип доставки", "Статус", "Комментарий клиента", "Комментарий оператора",
                  "Состав", "Дата и время"].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableOrders.map((o, i) => {
                const color = slotColor(o);
                const isSelected = selectedId === o.id;
                return (
                  <tr
                    key={o.id}
                    style={{ background: isSelected ? "#eef3ff" : i % 2 === 0 ? "#fff" : "#fafaf8", cursor: "pointer", outline: isSelected ? "1px solid #4a7aff" : "none" }}
                    onClick={() => setSelectedId(p => p === o.id ? null : o.id)}
                  >
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>
                      <span style={{ ...s.statusDot, background: color }} />
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#a8a49c" }}>{o.externalId ?? o.crmId}</span>
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const, color }}>{o.slotRaw ?? (o.slotFrom ? `${o.slotFrom}–${o.slotTo}` : "—")}</td>
                    <td style={{ ...s.td, minWidth: 180, maxWidth: 240 }}>{o.address ?? "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>{o.courier ?? <span style={{ color: "#d94040" }}>—</span>}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>{o.price ? `${o.price} ₽` : "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const, color: "#6b6860" }}>{o.deliveryType ?? "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const }}>
                      <span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span>
                    </td>
                    <td style={{ ...s.td, minWidth: 160, maxWidth: 220, color: "#6b6860" }}>{o.comment ?? "—"}</td>
                    <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "#4a7aff" }}>{o.opComment ?? "—"}</td>
                    <td style={{ ...s.td, minWidth: 160, maxWidth: 240, color: "#6b6860" }}>{o.items ?? "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" as const, color: "#a8a49c", fontSize: 10 }}>
                      {o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile */}
      {profileOpen && (
        <div style={{ position: "fixed", top: 52, right: 8, zIndex: 200 }}>
          <ProfilePanel onClose={() => setProfileOpen(false)} onLogout={logout} />
        </div>
      )}

      {/* Alerts */}
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

// ── Sub-components ────────────────────────────────────────

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
        <span style={s.courierTag}>{order.courier ?? <span style={{ color: "#d94040" }}>—</span>}</span>
        {order.price != null && <span style={s.priceTag}>{order.price} ₽</span>}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0, zIndex: 10, position: "relative" },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  slotBar: { display: "flex", gap: 4, marginLeft: 12 },
  slotBtn: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid #e8e6df", background: "transparent", color: "#6b6860", cursor: "pointer", whiteSpace: "nowrap" },
  syncLabel: { fontSize: 11, color: "#a8a49c", whiteSpace: "nowrap" },
  alertBadge: { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(217,64,64,0.08)", border: "1px solid rgba(217,64,64,0.2)", color: "#d94040", cursor: "pointer", whiteSpace: "nowrap" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 },
  invalidBanner: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", background: "rgba(217,64,64,0.07)", borderBottom: "1px solid rgba(217,64,64,0.15)", color: "#d94040", flexShrink: 0 },
  invalidBannerLink: { fontFamily: "monospace", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  invalidBannerClose: { marginLeft: "auto", background: "none", border: "none", color: "#d94040", cursor: "pointer", fontSize: 14, flexShrink: 0, padding: 2 },
  body: { display: "flex", flex: 1, overflow: "hidden", minHeight: 0 },
  leftPanel: { width: 300, minWidth: 260, background: "#fff", borderRight: "1px solid #e8e6df", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
  cardsSection: { flex: "0 0 50%", display: "flex", flexDirection: "column", overflow: "hidden", borderBottom: "1px solid #e8e6df" },
  sectionHeader: { padding: "10px 14px 8px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, borderBottom: "1px solid #f0efe9" },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: "0.5px" },
  countBadge: { padding: "2px 7px", borderRadius: 10, background: "#f5f4f0", fontSize: 11, color: "#6b6860", fontWeight: 500 },
  cardsList: { flex: 1, overflowY: "auto", padding: 6 },
  empty: { padding: 24, textAlign: "center", color: "#a8a49c", fontSize: 12 },
  detailSection: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderTop: "1px solid #e8e6df" },
  detailEmpty: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  detailScroll: { flex: 1, overflowY: "auto", padding: "12px 14px" },
  detailHeader: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  statusDotLg: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4, display: "inline-block" },
  detailExtId: { fontSize: 10, fontWeight: 600, color: "#a8a49c", fontFamily: "monospace", marginBottom: 2 },
  detailAddr: { fontSize: 13, fontWeight: 600, color: "#1a1a18", lineHeight: "1.3" },
  detailClose: { background: "none", border: "none", color: "#a8a49c", fontSize: 14, cursor: "pointer", padding: 2, flexShrink: 0 },
  detailInvalidBanner: { fontSize: 11, padding: "5px 9px", borderRadius: 6, background: "rgba(217,64,64,0.08)", color: "#d94040", marginBottom: 10 },
  fieldsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  detailField: { background: "#f5f4f0", borderRadius: 7, padding: "7px 9px" },
  detailFieldLabel: { fontSize: 10, color: "#a8a49c", textTransform: "uppercase" as const, letterSpacing: ".3px", marginBottom: 2 },
  detailFieldValue: { fontSize: 12, fontWeight: 500, color: "#1a1a18" },
  editField: { marginBottom: 10 },
  editFieldLabel: { fontSize: 10, color: "#a8a49c", textTransform: "uppercase" as const, letterSpacing: ".3px", marginBottom: 4 },
  select: { width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 12, fontFamily: "Manrope, system-ui, sans-serif", outline: "none", cursor: "pointer" },
  input: { padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 12, fontFamily: "Manrope, system-ui, sans-serif", outline: "none" },
  textarea: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, fontFamily: "Manrope, system-ui, sans-serif", resize: "none", outline: "none", color: "#1a1a18", background: "#fafaf8", display: "block" },
  saveBtn: { width: "100%", padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, transition: "background .15s, color .15s" },
  map: { flex: 1 },
  tableSection: { flexShrink: 0, background: "#fff", borderTop: "2px solid #e8e6df", height: 220, display: "flex", flexDirection: "column", overflow: "hidden" },
  tableHeader: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderBottom: "1px solid #f0efe9", flexShrink: 0 },
  tableWrap: { flex: 1, overflowX: "auto", overflowY: "auto" },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "7px 12px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase" as const, letterSpacing: ".4px", background: "#fafaf8", borderBottom: "1px solid #e8e6df", whiteSpace: "nowrap", position: "sticky" as const, top: 0, zIndex: 1 },
  td: { padding: "7px 12px", borderBottom: "0.5px solid #f0efe9", verticalAlign: "top", fontSize: 12, color: "#1a1a18" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block", marginRight: 4, verticalAlign: "middle" },
  card: { padding: "9px 11px", borderRadius: 8, marginBottom: 4, background: "#fafaf8", border: "1px solid #e8e6df", cursor: "pointer", transition: "all .12s" },
  cardSelected: { background: "#eef3ff", borderColor: "#4a7aff" },
  cardInvalid: { borderColor: "rgba(217,64,64,0.3)", background: "#fff8f8" },
  cardRow1: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 },
  extId: { fontSize: 10, fontWeight: 600, color: "#a8a49c", fontFamily: "monospace" },
  invalidTag: { fontSize: 10, color: "#d94040", fontWeight: 700 },
  statusTag: { marginLeft: "auto", fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 500 },
  cardAddr: { fontSize: 12, color: "#1a1a18", lineHeight: "1.3", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { display: "flex", alignItems: "center", gap: 6 },
  slotTag: { fontSize: 10, fontWeight: 600 },
  courierTag: { fontSize: 10, color: "#a8a49c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  priceTag: { fontSize: 10, color: "#6b6860", flexShrink: 0 },
  popup: { position: "fixed", top: 52, right: 8, background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, zIndex: 200, width: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  alertTitle: { fontSize: 11, fontWeight: 700, color: "#d94040", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 },
  alertItem: { padding: "7px 0", borderBottom: "0.5px solid #f5f4f0", cursor: "pointer" },
  alertAddr: { fontSize: 12, color: "#1a1a18", marginBottom: 2 },
  alertSub: { fontSize: 11, color: "#d94040", opacity: 0.8 },
};