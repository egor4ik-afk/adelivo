"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ProfilePanel } from "./ProfilePanel";

interface User { id: string; email: string; role: string; firstName?: string | null; lastName?: string | null; }
interface Order {
  id: string; crmId: string; externalId: string | null; status: string;
  address: string | null; lat: number | null; lng: number | null;
  price: number | null; courier: string | null; comment: string | null;
  opComment: string | null; items: string | null;
  slotFrom: string | null; slotTo: string | null; slotRaw: string | null;
  deliveryType: string | null; deliveryDate: string | null;
  isInvalid: boolean; invalidReason: string | null;
  crmCreatedAt: string | null; updatedAt?: string;
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
  { value: "ALL", label: "Все статусы" },
  { value: "NEW", label: "Новый" }, { value: "ASSIGNED", label: "Назначен" },
  { value: "IN_DELIVERY", label: "В пути" }, { value: "DELIVERED", label: "Доставлен" },
  { value: "RETURNED", label: "Возврат" }, { value: "CANCELLED", label: "Отменён" },
];
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));

function getCouriers(orders: Order[]): string[] {
  return Array.from(new Set(orders.map(o => o.courier).filter(Boolean) as string[])).sort();
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

// ── КРАСИВЫЙ КАСТОМНЫЙ ДРОПДАУН (С Z-INDEX ЧЕРЕЗ PORTAL) ──
function CustomSelect({ value, onChange, options, style, placeholder }: { value: string; onChange: (v: string) => void; options: {value: string, label: string}[]; style?: React.CSSProperties; placeholder?: string; }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{top: number, left: number, width: number} | null>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const updateRect = () => {
      if (open && ref.current) {
        const r = ref.current.getBoundingClientRect();
        setRect({ top: r.bottom, left: r.left, width: r.width });
      }
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    setOpen(p => !p);
  };

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={toggle}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", height: 30, padding: "0 10px",
          borderRadius: 8, border: "1px solid #e8e6df",
          background: "#fff", fontSize: 11, fontWeight: 600, color: "#1a1a18",
          cursor: "pointer", outline: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)", whiteSpace: "nowrap", gap: 6,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, textAlign: "left" }}>
          {current?.label ?? placeholder ?? "—"}
        </span>
        <span style={{ fontSize: 8, color: "#a8a49c", flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div 
          onClick={e => e.stopPropagation()} 
          style={{
            position: "fixed", top: rect.top + 4, left: rect.left, 
            minWidth: Math.max(rect.width, 130),
            background: "#fff", borderRadius: 8, border: "1px solid #e8e6df",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 99999, // ВСЕГДА ПОВЕРХ
            overflow: "hidden", maxHeight: 250, overflowY: "auto",
          }}
        >
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                padding: "8px 12px", fontSize: 11, fontWeight: 500,
                color: opt.value === value ? "#4a7aff" : "#1a1a18",
                background: opt.value === value ? "#f4f7ff" : "transparent",
                cursor: "pointer", whiteSpace: "nowrap",
                borderBottom: "1px solid #f5f4f0", transition: "background 0.1s",
              }}
              onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLDivElement).style.background = "#fafaf8"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f4f7ff" : "transparent"; }}
            >
              {opt.label}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function DashboardClient({ user }: { user: User }) {
  const router = useRouter();
  const mapRef = useRef<HTMLDivElement>(null);
  const ymapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMob = () => setIsMobile(window.innerWidth < 768);
    checkMob(); window.addEventListener("resize", checkMob);
    return () => window.removeEventListener("resize", checkMob);
  }, []);

  const [mobileView, setMobileView] = useState<"split" | "map" | "panels">("split");
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDetailVisible, setIsDetailVisible] = useState(true); // <--- ВЕРНУЛИ СТЕЙТ
  
  const [tableOpen, setTableOpen] = useState(true);
  const [tableHeight, setTableHeight] = useState(250);
  const [isDraggingTable, setIsDraggingTable] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCourier, setFilterCourier] = useState("ALL");
  
  const [showCourierNames, setShowCourierNames] = useState(true); 
  const [showTime, setShowTime] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(10);
  
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [dismissedInvalid, setDismissedInvalid] = useState(false);

  const [opComment, setOpComment] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editCourier, setEditCourier] = useState("");
  const [editAddress, setEditAddress] = useState(""); 
  
  const [previewGeo, setPreviewGeo] = useState<{lat: number, lng: number} | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fixingAI, setFixingAI] = useState(false); 

  useEffect(() => {
    if (!isDraggingTable) { document.body.style.userSelect = ""; return; }
    document.body.style.userSelect = "none";
    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < window.innerHeight - 150) setTableHeight(newHeight);
    };
    const handleMouseUp = () => setIsDraggingTable(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDraggingTable]);

  const dateAndStatusOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    if (oDate !== filterDate) return false;
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterCourier !== "ALL" && (o.courier || "UNASSIGNED") !== filterCourier) return false;
    return true;
  });

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const invalid = dateAndStatusOrders.filter(o => o.isInvalid);
  const couriers = getCouriers(orders);
  
  const showLeftPanel = isListVisible || isDetailVisible;

  const filtered = selectedSlots.length === 0 
    ? dateAndStatusOrders 
    : dateAndStatusOrders.filter(o => {
        const s = SLOTS.find(x => x.from === o.slotFrom && x.to === o.slotTo);
        return s && selectedSlots.includes(s.label);
      });

  const tableOrders = [...dateAndStatusOrders].sort((a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime());

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders`);
      if (res.ok) { setOrders(await res.json()); setLastSync(new Date().toLocaleTimeString("ru")); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 30_000);
    return () => clearInterval(t);
  }, [fetchOrders]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NOTIFICATION_CLICK" && e.data.orderId) { setSelectedId(e.data.orderId); fetchOrders(); }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [fetchOrders]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const oid = params.get("orderId");
      if (oid && orders.length > 0 && !selectedId) {
        setSelectedId(oid);
        const o = orders.find(x => x.id === oid);
        if (o) {
          const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
          if (oDate) setFilterDate(oDate);
        }
        window.history.replaceState({}, '', '/dashboard');
      }
    }
  }, [orders, selectedId]);

  useEffect(() => { setDismissedInvalid(false); }, [orders]);

  useEffect(() => {
    setOpComment(selected?.opComment ?? "");
    setEditStatus(selected?.status ?? "");
    setEditCourier(selected?.courier ?? "");
    setEditAddress(selected?.address ?? "");
    setPreviewGeo(null); 
    setSaved(false);
  }, [selected?.id]); 

  useEffect(() => {
    if (selectedId && isMobile && mobileView === "map") setMobileView("split");
  }, [selectedId, isMobile, mobileView]);

  // ── ИНИЦИАЛИЗАЦИЯ КАРТЫ С ОТСЛЕЖИВАНИЕМ ЗУМА ──
  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [55.752, 37.617], zoom: 10, controls: ["zoomControl"] }, {});
      
      map.events.add('boundschange', (e: any) => {
        if (e.get('newZoom') !== e.get('oldZoom')) setCurrentZoom(e.get('newZoom'));
      });

      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20 });
      map.geoObjects.add(clusterer);
      ymapRef.current = map;
      clustererRef.current = clusterer;
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (ymapRef.current) setTimeout(() => ymapRef.current.container.fitToViewport(), 50);
  }, [mobileView, isListVisible, isDetailVisible, tableOpen, tableHeight]);

 // ── ПИНЫ НА КАРТЕ: УМНАЯ ЛОГИКА ──
 useEffect(() => {
  const clusterer = clustererRef.current;
  if (!clusterer || typeof window === "undefined" || !window.ymaps) return;
  clusterer.removeAll();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ymaps = (window as any).ymaps;

  // Плашка с хвостиком (показывается только при зуме для времени)
  const StretchyLayout = ymaps.templateLayoutFactory.createClass(
    '<div style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:{{ properties.pinColor }};color:#fff;padding:4px 10px;border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:1.5px solid rgba(255,255,255,0.35);min-width:28px;text-align:center;line-height:1.4;">{{ properties.slotLabel }}</div>' +
      '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid {{ properties.pinColor }};margin-top:-1px;"></div>' +
      '{% if properties.showLabel %}' +
        '<div style="margin-top:3px;font-size:9px;font-weight:700;color:#1a1a18;white-space:nowrap;background:rgba(255,255,255,0.96);padding:2px 6px;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,0.15);line-height:1.4;letter-spacing:0.1px;">{{ properties.labelText }}</div>' +
      '{% endif %}' +
    '</div>'
  );

  const isAllSlots = selectedSlots.length === 0;

  const placemarks = filtered
    .filter(o => (o.lat && o.lng) || (o.id === selectedId && previewGeo))
    .map(order => {
      const isSelected = selectedId === order.id;
      const lat = isSelected && previewGeo ? previewGeo.lat : order.lat!;
      const lng = isSelected && previewGeo ? previewGeo.lng : order.lng!;
      
      const color = slotColor(order);
      const pinColor = isSelected ? (previewGeo ? '#9ca3af' : '#facc15') : color;

      // Показывать время если: зум крупный, чекбокс "Время" стоит, и слоты не фильтрованы
      const displayTime = showTime && currentZoom >= 13 && !!order.slotRaw && isAllSlots;
      
      // Показывать имя если: чекбокс стоит, курьер назначен, и фильтр курьеров = "Все"
      const displayName = showCourierNames && !!order.courier && filterCourier === "ALL";

      const slotLabel = order.slotRaw ? order.slotRaw.replace("с ", "").replace(" до ", "-") : "";

      // Тот самый подробный балун со всеми деталями (ДОБАВЛЕН ДЛЯ ОБОИХ ВИДОВ ПИНОВ)
      const balloonContentBody = `
        <div style="font-size:13px;line-height:1.5">
          <b>${order.address ?? "—"}</b><br>
          <span style="color:#888">${order.slotRaw ?? "—"}</span><br>
          ${order.courier ? `<span style="color:#1a1a18; font-weight:600;">${order.courier}</span><br>` : ""}
          ${order.items ? `<span style="color:#6b6860; font-size: 12px;">${order.items}</span>` : ""}
          ${order.isInvalid ? `<br><span style="color:#d94040">⚠ ${order.invalidReason}</span>` : ""}
        </div>`;

      let pm;

      if (displayTime) {
        // ИСПОЛЬЗУЕМ ПЛАШКУ
        pm = new window.ymaps.Placemark(
          [lat, lng],
          {
            balloonContentHeader: order.externalId ?? order.crmId,
            balloonContentBody, // <--- Подробный балун
            hintContent: order.address ?? "—",
            pinColor,
            slotLabel,
            showLabel: displayName,
            labelText: order.courier ?? "",
          },
          {
            iconLayout: StretchyLayout,
            iconShape: { type: "Rectangle", coordinates: [[-40, -40], [40, 20]] },
            iconOffset: [-15, -26]
          }
        );
      } else {
        // ИСПОЛЬЗУЕМ РОДНОЙ ПИН С ХВОСТИКОМ (islands#icon)
        let preset = 'islands#redDotIcon';
        if (isSelected) preset = previewGeo ? "islands#grayIcon" : "islands#yellowIcon";

        pm = new window.ymaps.Placemark(
          [lat, lng],
          {
            balloonContentHeader: order.externalId ?? order.crmId,
            balloonContentBody, // <--- Подробный балун ТЕПЕРЬ И ЗДЕСЬ
            hintContent: order.address ?? "—",
            // Нативное имя курьера прямо под стандартным пином
            iconCaption: displayName ? order.courier : undefined, 
          },
          {
            preset,
            iconColor: isSelected ? undefined : color // Назначаем цвет родного пина
          }
        );
      }

      pm.events.add("click", () => {
        setSelectedId(p => p === order.id ? null : order.id);
        if (!isMobile) setIsDetailVisible(true);
      });
      return pm;
    });

  if (placemarks.length > 0) clusterer.add(placemarks);
}, [filtered, selectedId, previewGeo, isMobile, showCourierNames, showTime, currentZoom, filterCourier, selectedSlots]);

  async function handleGeocode(mode: "ai" | "manual") {
    if (!selected) return;
    setFixingAI(true);
    try {
      const apiMode = mode === "ai" ? "ai_preview" : "manual_preview";
      const res = await fetch(`/api/orders/${selected.id}/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: apiMode, manualAddress: editAddress }) });
      if (res.ok) {
        const data = await res.json();
        if (mode === "ai" && data.suggestedAddress) {
          setEditAddress(data.suggestedAddress); 
          setOpComment(prev => { const oldInfo = `[Старый адрес: ${selected.address}]`; if (prev.includes(oldInfo)) return prev; return prev ? `${prev}\n${oldInfo}` : oldInfo; });
        }
        if (data.geo && data.geo.lat) {
          setPreviewGeo({ lat: data.geo.lat, lng: data.geo.lng });
          if (ymapRef.current) ymapRef.current.setCenter([data.geo.lat, data.geo.lng], 15, { duration: 400 });
        } else { alert("Яндекс.Карты не смогли найти координаты по этому адресу."); }
      }
    } catch (e) { console.error(e); }
    finally { setFixingAI(false); }
  }

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    const isAddressChanged = editAddress !== (selected.address ?? "");
    if (isAddressChanged || previewGeo) await fetch(`/api/orders/${selected.id}/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "commit", manualAddress: editAddress }) });
    const body: Record<string, string> = {};
    if (editStatus !== selected.status) body.status = editStatus;
    if (editCourier !== (selected.courier ?? "")) body.courier = editCourier;
    if (opComment !== (selected.opComment ?? "")) body.opComment = opComment;
    if (Object.keys(body).length > 0) await fetch(`/api/orders/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setPreviewGeo(null); await fetchOrders(); setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const hasChanges = selected && (editStatus !== selected.status || editCourier !== (selected.courier ?? "") || opComment !== (selected.opComment ?? "") || editAddress !== (selected.address ?? "") || previewGeo !== null);

  const courierOptions = [{ value: "ALL", label: "Все курьеры" }, { value: "UNASSIGNED", label: "Не назначен" }, ...couriers.map(c => ({ value: c, label: c }))];

  const toggleSlot = (label: string) => {
    if (label === "all") setSelectedSlots([]);
    else setSelectedSlots(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
  };

  const renderDetailPanel = () => {
    if(!selected) return null;
    return (
      <div style={s.detailScroll}>
        <div style={s.detailHeader}>
          <div style={{ flex: 1 }}><div style={s.detailExtId}>{selected.externalId ?? selected.crmId}</div></div>
          {/* Крестик закрывает карточку */}
          <button style={s.detailClose} onClick={() => { setSelectedId(null); setIsDetailVisible(false); }}>✕</button>
        </div>
        {selected.isInvalid && <div style={s.detailInvalidBanner}>⚠ {selected.invalidReason ?? "Проблемный адрес"}</div>}
        <div style={s.editField}>
          <div style={s.editFieldLabel}>Адрес доставки</div>
          <textarea style={s.textarea} rows={2} value={editAddress} onChange={e => setEditAddress(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button style={s.geoBtn} onClick={() => handleGeocode("manual")} disabled={fixingAI}>📍 На карте</button>
            <button style={s.aiBtn} onClick={() => handleGeocode("ai")} disabled={fixingAI}>{fixingAI ? "✨ Думает..." : "🪄 AI Исправить"}</button>
          </div>
        </div>
        <div style={s.fieldsGrid}>
          <div style={s.detailField}><div style={s.detailFieldLabel}>Слот</div><div style={{ ...s.detailFieldValue, color: slotColor(selected) }}>{selected.slotRaw ?? `${selected.slotFrom}–${selected.slotTo}`}</div></div>
          <div style={s.detailField}><div style={s.detailFieldLabel}>Стоимость</div><div style={s.detailFieldValue}>{selected.price ? `${selected.price} ₽` : "—"}</div></div>
        </div>
        <div style={s.editField}>
          <div style={s.editFieldLabel}>Статус</div>
          <select style={s.select} value={editStatus} onChange={e => setEditStatus(e.target.value)}>{STATUS_OPTIONS.slice(1).map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
        </div>
        <div style={s.editField}>
          <div style={s.editFieldLabel}>Курьер</div>
          <div style={{ display: "flex", gap: 6 }}>
            <select style={{ ...s.select, flex: 1 }} value={editCourier} onChange={e => setEditCourier(e.target.value)}>
              <option value="">— Не назначен —</option>{couriers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input style={{ ...s.input, width: 90 }} placeholder="Или вручную" value={couriers.includes(editCourier) ? "" : editCourier} onChange={e => setEditCourier(e.target.value)} />
          </div>
        </div>
        {selected.items && <div style={s.editField}><div style={s.editFieldLabel}>Состав</div><div style={{ fontSize: 12, color: "#1a1a18", lineHeight: "1.4" }}>{selected.items}</div></div>}
        {selected.comment && <div style={s.editField}><div style={s.editFieldLabel}>Комментарий клиента</div><div style={{ fontSize: 12, color: "#6b6860", lineHeight: "1.4" }}>{selected.comment}</div></div>}
        <div style={s.editField}>
          <div style={s.editFieldLabel}>Комментарий оператора</div>
          <textarea style={s.textarea} rows={2} value={opComment} onChange={e => setOpComment(e.target.value)} placeholder="Заметка..." />
        </div>
        <button style={{ ...s.saveBtn, background: saved ? "#1a9e5c" : hasChanges ? "#4a7aff" : "#e8e6df", color: hasChanges || saved ? "#fff" : "#a8a49c", cursor: hasChanges ? "pointer" : "default" }} disabled={!hasChanges || saving} onClick={saveChanges}>
          {saved ? "✓ Сохранено" : saving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </div>
    );
  };

  return (
    <div style={isMobile ? sm.app : s.app}>
      <div style={isMobile ? sm.topbar : s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={s.datePicker} />
        
        {/* КРАСИВЫЕ ДРОПДАУНЫ С ПОРТАЛОМ */}
        <CustomSelect value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} style={{ width: 130, marginLeft: 4 }} />
        <CustomSelect value={filterCourier} onChange={setFilterCourier} options={courierOptions} style={{ width: 130, marginLeft: 4 }} />

        {/* ЧЕКБОКСЫ ДЛЯ КАРТЫ */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b6860", cursor: "pointer" }}>
            <input type="checkbox" checked={showCourierNames} onChange={e => setShowCourierNames(e.target.checked)} /> Имена
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b6860", cursor: "pointer", opacity: selectedSlots.length === 0 ? 1 : 0.5 }} title={selectedSlots.length > 0 ? "Доступно только при всех слотах" : ""}>
            <input type="checkbox" checked={showTime} disabled={selectedSlots.length > 0} onChange={e => setShowTime(e.target.checked)} /> Время
          </label>
        </div>

        {!isMobile && (
          <div style={s.slotBar}>
            <SlotBtn label="Все" active={selectedSlots.length === 0} color="#4a7aff" onClick={() => toggleSlot("all")} />
            {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {!isMobile && lastSync && <span style={s.syncLabel}>обновлено {lastSync}</span>}
        {invalid.length > 0 && <button style={s.alertBadge} onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>⚠ {!isMobile && `${invalid.length} проблем`}</button>}
        <button style={s.userBtn} onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}>{user.email.slice(0, 2).toUpperCase()}</button>
      </div>

      {isMobile && (
        <div style={sm.mobileSlotsWrap}>
           <SlotBtn label="Все" active={selectedSlots.length === 0} color="#4a7aff" onClick={() => toggleSlot("all")} />
            {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
        </div>
      )}

      {!isMobile && invalid.length > 0 && !dismissedInvalid && (
        <div style={s.invalidBanner}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 12 }}><b>{invalid.length} заказов</b> с проблемными адресами — {invalid.map((o, i) => (<span key={o.id}><span style={s.invalidBannerLink} onClick={() => setSelectedId(o.id)}>{o.externalId ?? o.crmId}</span>{i < invalid.length - 1 ? ", " : ""}</span>))}</span>
          <button style={s.invalidBannerClose} onClick={() => setDismissedInvalid(true)}>✕</button>
        </div>
      )}

      {isMobile && (
        <div style={{ display: "flex", padding: "8px 10px", background: "#f5f4f0", gap: 8, flexShrink: 0, borderBottom: "1px solid #e8e6df" }}>
          <ViewToggleBtn active={mobileView === "map"} onClick={() => setMobileView("map")}>🗺️ Карта</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "split"} onClick={() => setMobileView("split")}>Вместе</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "panels"} onClick={() => setMobileView("panels")}>📋 Список</ViewToggleBtn>
        </div>
      )}

      <div style={isMobile ? sm.body : s.body}>
        {!isMobile && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            
            {/* БОКОВЫЕ ПАНЕЛИ (СПИСОК И КАРТОЧКА) */}
            {showLeftPanel && (
              <div style={s.leftPanel}>
                
                {isListVisible && (
                  <div style={{ ...s.cardsSection, flex: isDetailVisible ? "0 0 50%" : 1, borderBottom: isDetailVisible ? "1px solid #e8e6df" : "none" }}>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionTitle}>Заказы</span>
                      <span style={s.countBadge}>{filtered.length}</span>
                      <div style={{ flex: 1 }} />
                      {/* СТРЕЛОЧКА СКРЫТИЯ СПИСКА */}
                      <button onClick={() => setIsListVisible(false)} style={s.panelToggleArrow} title="Скрыть список">◀</button>
                    </div>
                    <div style={s.cardsList}>
                      {loading ? <div style={s.empty}>Загрузка...</div> : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div> : filtered.map(o => <OrderCard key={o.id} order={o} selected={selectedId === o.id} onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />)}
                    </div>
                  </div>
                )}

                {isDetailVisible && (
                  <div style={{ ...s.detailSection, flex: isListVisible ? "0 0 50%" : 1 }}>
                    {renderDetailPanel()}
                  </div>
                )}
              </div>
            )}

            {/* КОНТЕЙНЕР КАРТЫ */}
            <div style={{ flex: 1, position: 'relative' }}>
              <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
              
              {/* СТРЕЛОЧКА ВОЗВРАТА СПИСКА (ПОЯВЛЯЕТСЯ ТОЛЬКО ЕСЛИ СПИСОК СКРЫТ) */}
              {!isListVisible && (
                <button onClick={() => setIsListVisible(true)} style={s.expandSideBtn} title="Показать список">
                  ▶
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- MOBILE ВЕРСИЯ --- */}
        {isMobile && (
          <>
            <div ref={mapRef} style={{ ...sm.map, display: mobileView === "panels" ? "none" : "block", flex: mobileView === "map" ? 1 : "0 0 45%" }} />
            <div style={{ ...sm.panelsWrap, display: mobileView === "map" ? "none" : "flex", flex: mobileView === "panels" ? 1 : undefined }}>
              <div style={sm.cardsSection}>
                <div style={s.cardsList}>{loading ? <div style={s.empty}>Загрузка...</div> : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div> : filtered.map(o => <OrderCard key={o.id} order={o} selected={selectedId === o.id} onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />)}</div>
              </div>
              <div style={sm.detailSection}>{!selected ? <div style={s.detailEmpty}><div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center" }}>Выберите заказ</div></div> : renderDetailPanel()}</div>
            </div>
          </>
        )}
      </div>

      {!isMobile && (
        <div style={{ ...s.tableSection, height: tableOpen ? tableHeight : 44, position: 'relative' }}>
          {tableOpen && <div onMouseDown={(e) => { e.preventDefault(); setIsDraggingTable(true); }} style={{ position: 'absolute', top: -4, left: 0, right: 0, height: 8, cursor: 'row-resize', zIndex: 200, background: isDraggingTable ? '#4a7aff' : 'transparent', transition: 'background 0.1s' }} />}
          <div style={s.tableHeader}>
            <span style={s.sectionTitle}>Все заказы ({filterDate})</span>
            <span style={s.countBadge}>{tableOrders.length}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setTableOpen(!tableOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4a7aff', padding: '4px 8px' }}>
              {tableOpen ? '▼ Свернуть таблицу' : '▲ Развернуть таблицу'}
            </button>
          </div>
          {tableOpen && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>{["Внешний ID", "Время доставки", "Адрес доставки", "Курьер", "Стоимость", "Тип доставки", "Статус", "Комментарий клиента", "Комментарий оператора", "Состав", "Дата и время"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, i) => {
                    const color = slotColor(o);
                    const isSelected = selectedId === o.id;
                    return (
                      <tr key={o.id} style={{ background: isSelected ? "#eef3ff" : i % 2 === 0 ? "#fff" : "#fafaf8", cursor: "pointer", outline: isSelected ? "1px solid #4a7aff" : "none" }} onClick={() => setSelectedId(p => p === o.id ? null : o.id)}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ ...s.statusDot, background: color }} /><span style={{ fontFamily: "monospace", fontSize: 10, color: "#a8a49c" }}>{o.externalId ?? o.crmId}</span></td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color }}>{o.slotRaw ?? (o.slotFrom ? `${o.slotFrom}–${o.slotTo}` : "—")}</td>
                        <td style={{ ...s.td, minWidth: 180, maxWidth: 240 }}>{o.address ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{o.courier ?? <span style={{ color: "#d94040" }}>—</span>}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{o.price ? `${o.price} ₽` : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "#6b6860" }}>{o.deliveryType ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 220, color: "#6b6860" }}>{o.comment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "#4a7aff" }}>{o.opComment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 240, color: "#6b6860" }}>{o.items ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "#a8a49c", fontSize: 10 }}>{o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru") : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {profileOpen && <div style={{ position: "fixed", top: 52, right: 8, zIndex: 200 }}><ProfilePanel onClose={() => setProfileOpen(false)} onLogout={async () => { await fetch("/api/auth/verify", { method: "DELETE" }); router.push("/login"); }} /></div>}
      
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

      {(profileOpen || alertsOpen) && <div style={s.overlay} onClick={() => { setProfileOpen(false); setAlertsOpen(false); }} />}
    </div>
  );
}

function ViewToggleBtn({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return <button onClick={onClick} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: active ? "#4a7aff" : "#fff", color: active ? "#fff" : "#6b6860", boxShadow: active ? "0 2px 8px rgba(74,122,255,0.3)" : "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.15s" }}>{children}</button>;
}

function SlotBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return <button style={{ ...s.slotBtn, ...(active ? { background: color, borderColor: color, color: "#fff" } : {}) }} onClick={onClick}>{label}</button>;
}

function OrderCard({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  const color = slotColor(order);
  return (
    <div style={{ ...s.card, ...(selected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
      <div style={s.cardRow1}>
        <span style={{ ...s.statusDot, background: color }} />
        <span style={s.extId}>{order.externalId ?? order.crmId}</span>
        <span style={{ ...s.statusTag, background: `${color}18`, color }}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div style={s.cardAddr}>
        {!order.isInvalid && order.lat && order.lng && <span style={{ color: "#1a9e5c", marginRight: 4 }} title="Геокодирован">✓</span>}
        {order.isInvalid && <span style={{ color: "#d94040", marginRight: 4 }}>⚠</span>}
        {order.address ?? "—"}
      </div>
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
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap", marginLeft: 4 },
  datePicker: { padding: "4px 8px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, outline: "none", color: "#1a1a18", background: "#fff" },
  slotBar: { display: "flex", gap: 4, marginLeft: 12 },
  slotBtn: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid #e8e6df", background: "transparent", color: "#6b6860", cursor: "pointer", whiteSpace: "nowrap" },
  syncLabel: { fontSize: 11, color: "#a8a49c", whiteSpace: "nowrap" },
  alertBadge: { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(217,64,64,0.08)", border: "1px solid rgba(217,64,64,0.2)", color: "#d94040", cursor: "pointer", whiteSpace: "nowrap" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "#4a7aff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 },
  invalidBanner: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", background: "rgba(217,64,64,0.07)", borderBottom: "1px solid rgba(217,64,64,0.15)", color: "#d94040", flexShrink: 0 },
  invalidBannerLink: { fontFamily: "monospace", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  invalidBannerClose: { marginLeft: "auto", background: "none", border: "none", color: "#d94040", cursor: "pointer", fontSize: 14, flexShrink: 0, padding: 2 },
  
  body: { display: "flex", flex: 1, overflow: "hidden", minHeight: 0 },
  leftPanel: { width: 300, minWidth: 260, background: "#fff", borderRight: "1px solid #e8e6df", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", zIndex: 5 },
  cardsSection: { display: "flex", flexDirection: "column", overflow: "hidden" },
  sectionHeader: { padding: "10px 14px 8px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, borderBottom: "1px solid #f0efe9" },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: "0.5px" },
  countBadge: { padding: "2px 7px", borderRadius: 10, background: "#f5f4f0", fontSize: 11, color: "#6b6860", fontWeight: 500 },
  cardsList: { flex: 1, overflowY: "auto", padding: 6 },
  empty: { padding: 24, textAlign: "center", color: "#a8a49c", fontSize: 12 },
  detailSection: { display: "flex", flexDirection: "column", overflow: "hidden" },
  detailEmpty: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  detailScroll: { flex: 1, overflowY: "auto", padding: "12px 14px" },
  detailHeader: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  detailExtId: { fontSize: 14, fontWeight: 700, color: "#1a1a18", fontFamily: "monospace" },
  detailClose: { background: "none", border: "none", color: "#a8a49c", fontSize: 14, cursor: "pointer", padding: 2, flexShrink: 0 },
  detailInvalidBanner: { fontSize: 11, padding: "5px 9px", borderRadius: 6, background: "rgba(217,64,64,0.08)", color: "#d94040", marginBottom: 10 },
  fieldsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  detailField: { background: "#f5f4f0", borderRadius: 7, padding: "7px 9px" },
  detailFieldLabel: { fontSize: 10, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 2 },
  detailFieldValue: { fontSize: 12, fontWeight: 500, color: "#1a1a18" },
  editField: { marginBottom: 10 },
  editFieldLabel: { fontSize: 10, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 4 },
  select: { width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 12, outline: "none", cursor: "pointer" },
  input: { padding: "7px 9px", borderRadius: 7, border: "1px solid #e8e6df", background: "#fafaf8", color: "#1a1a18", fontSize: 12, outline: "none" },
  textarea: { width: "100%", padding: "7px 9px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 12, resize: "none", outline: "none", color: "#1a1a18", background: "#fafaf8", display: "block" },
  saveBtn: { width: "100%", padding: "8px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 600, transition: "background .15s, color .15s" },
  
  // КНОПКИ ПАНЕЛЕЙ (ТОЛЬКО СТРЕЛОЧКИ)
  panelToggleArrow: { background: "transparent", border: "none", cursor: "pointer", color: "#a8a49c", fontSize: 13, padding: "4px 8px", borderRadius: 4, transition: "color 0.15s" },
  expandSideBtn: { position: "absolute", top: 12, left: 0, zIndex: 100, background: "#fff", border: "1px solid #e8e6df", borderLeft: "none", borderRadius: "0 8px 8px 0", padding: "10px 8px", cursor: "pointer", color: "#6b6860", fontSize: 13, boxShadow: "2px 2px 8px rgba(0,0,0,0.06)" },
  
  card: { padding: "9px 11px", borderRadius: 8, marginBottom: 4, background: "#fafaf8", border: "1px solid #e8e6df", cursor: "pointer", transition: "all .12s" },
  cardSelected: { background: "#eef3ff", borderColor: "#4a7aff" },
  cardInvalid: { borderColor: "rgba(217,64,64,0.3)", background: "#fff8f8" },
  cardRow1: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 },
  extId: { fontSize: 10, fontWeight: 600, color: "#a8a49c", fontFamily: "monospace" },
  statusTag: { marginLeft: "auto", fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 500 },
  cardAddr: { fontSize: 12, color: "#1a1a18", lineHeight: "1.3", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { display: "flex", alignItems: "center", gap: 6 },
  slotTag: { fontSize: 10, fontWeight: 600 },
  courierTag: { fontSize: 10, color: "#a8a49c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  priceTag: { fontSize: 10, color: "#6b6860", flexShrink: 0 },
  geoBtn: { flex: 1, padding: "7px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600, color: "#1a1a18" },
  aiBtn: { flex: 1, padding: "7px", borderRadius: 6, border: "none", background: "#7c4dff", fontSize: 11, cursor: "pointer", fontWeight: 600, color: "#fff" },
  tableSection: { flexShrink: 0, background: "#fff", borderTop: "2px solid #e8e6df", display: "flex", flexDirection: "column", overflow: "hidden" },
  tableHeader: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderBottom: "1px solid #f0efe9", flexShrink: 0 },
  tableWrap: { flex: 1, overflowX: "auto", overflowY: "auto" },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "7px 12px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".4px", background: "#fafaf8", borderBottom: "1px solid #e8e6df", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 },
  td: { padding: "7px 12px", borderBottom: "0.5px solid #f0efe9", verticalAlign: "top", fontSize: 12, color: "#1a1a18" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block", marginRight: 4, verticalAlign: "middle" },

  popup: { position: "fixed", top: 52, right: 8, background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, zIndex: 200, width: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  alertTitle: { fontSize: 11, fontWeight: 700, color: "#d94040", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 },
  alertItem: { padding: "7px 0", borderBottom: "0.5px solid #f5f4f0", cursor: "pointer" },
  alertAddr: { fontSize: 12, color: "#1a1a18", marginBottom: 2 },
  alertSub: { fontSize: 11, color: "#d94040", opacity: 0.8 }
};

const sm: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0" },
  topbar: { ...s.topbar, overflowX: "auto", padding: "0 10px", gap: 6 },
  mobileSlotsWrap: { display: "flex", gap: 4, padding: "8px 10px", background: "#fff", borderBottom: "1px solid #e8e6df", overflowX: "auto", flexShrink: 0 },
  body: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
  map: { minHeight: 250 },
  panelsWrap: { display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" },
  cardsSection: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  detailSection: { flex: "0 0 55%", display: "flex", flexDirection: "column", borderTop: "2px solid #4a7aff", background: "#fff", overflow: "hidden", boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" }
};