"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ProfilePanel } from "./ProfilePanel";
import { OrderDetail } from "./OrderDetail";
import { Order, STATUS_OPTIONS, STATUS_LABELS, SLOTS, slotColor } from "@/lib/constants";

interface User { id: string; email: string; role: string; firstName?: string | null; lastName?: string | null; }

interface DbCourier {
  id: number;
  fullName: string;
  isActive: boolean;
  shifts: { date: string }[];
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
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("scroll", updateRect, true); window.removeEventListener("resize", updateRect); };
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
      <button type="button" onClick={toggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid #e8e6df", background: "#fff", fontSize: 11, fontWeight: 600, color: "#1a1a18", cursor: "pointer", outline: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", whiteSpace: "nowrap", gap: 6 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1, textAlign: "left" }}>{current?.label ?? placeholder ?? "—"}</span>
        <span style={{ fontSize: 8, color: "#a8a49c", flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {open && rect && typeof document !== "undefined" && createPortal(
        <div onClick={e => e.stopPropagation()} style={{ position: "fixed", top: rect.top + 4, left: rect.left, minWidth: Math.max(rect.width, 130), background: "#fff", borderRadius: 8, border: "1px solid #e8e6df", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 99999, overflow: "hidden", maxHeight: 250, overflowY: "auto" }}>
          {options.map(opt => (
            <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 500, color: opt.value === value ? "#4a7aff" : "#1a1a18", background: opt.value === value ? "#f4f7ff" : "transparent", cursor: "pointer", whiteSpace: "nowrap", borderBottom: "1px solid #f5f4f0", transition: "background 0.1s" }} onMouseEnter={e => { if (opt.value !== value) (e.currentTarget as HTMLDivElement).style.background = "#fafaf8"; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = opt.value === value ? "#f4f7ff" : "transparent"; }}>
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
  const [isDetailVisible, setIsDetailVisible] = useState(true);
  const [tableOpen, setTableOpen] = useState(true);
  const [tableHeight, setTableHeight] = useState(250);
  const [isDraggingTable, setIsDraggingTable] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [dbCouriers, setDbCouriers] = useState<DbCourier[]>([]);
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
  
  const [previewGeo, setPreviewGeo] = useState<{lat: number, lng: number} | null>(null);
  const [fixingAI, setFixingAI] = useState(false); 

  // ── РЕЖИМ МАРШРУТА (МАССОВОЕ НАЗНАЧЕНИЕ) ──
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkCourier, setBulkCourier] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

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

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, couriersRes] = await Promise.all([ fetch(`/api/orders`), fetch(`/api/couriers`) ]);
      if (ordersRes.ok) { setOrders(await ordersRes.json()); setLastSync(new Date().toLocaleTimeString("ru")); }
      if (couriersRes.ok) setDbCouriers(await couriersRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30_000);
    return () => clearInterval(t);
  }, [fetchData]);

  useEffect(() => { setDismissedInvalid(false); }, [orders]);

  const sortedCouriers = (() => {
    const base = [...dbCouriers].filter(c => c.isActive);
    const orderCounts: Record<string, number> = {};
    orders.forEach(o => {
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
      if (oDate === filterDate && o.courier) orderCounts[o.courier] = (orderCounts[o.courier] || 0) + 1;
    });

    base.sort((a, b) => {
      const aWorks = a.shifts.some(s => s.date === filterDate);
      const bWorks = b.shifts.some(s => s.date === filterDate);
      const aHasOrder = (orderCounts[a.fullName] || 0) > 0;
      const bHasOrder = (orderCounts[b.fullName] || 0) > 0;
      const scoreA = (aWorks ? 10 : 0) + (aHasOrder ? 5 : 0);
      const scoreB = (bWorks ? 10 : 0) + (bHasOrder ? 5 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.fullName.localeCompare(b.fullName);
    });

    return base.map(c => {
       const works = c.shifts.some(s => s.date === filterDate);
       const cnt = orderCounts[c.fullName] || 0;
       let label = c.fullName;
       if (works || cnt > 0) {
         const flags = [];
         if (works) flags.push("На смене");
         if (cnt > 0) flags.push(`${cnt} зак.`);
         label += ` (${flags.join(", ")})`;
       }
       return { value: c.fullName, label };
    });
  })();

  const courierOptions = [{ value: "ALL", label: "Все курьеры" }, { value: "UNASSIGNED", label: "Не назначен" }, ...sortedCouriers];

  const dateAndStatusOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    if (oDate !== filterDate) return false;
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterCourier !== "ALL" && (o.courier || "UNASSIGNED") !== filterCourier) return false;
    return true;
  });

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const invalid = dateAndStatusOrders.filter(o => o.isInvalid);
  const showLeftPanel = isListVisible || isDetailVisible;

  const filtered = selectedSlots.length === 0 ? dateAndStatusOrders : dateAndStatusOrders.filter(o => {
    const s = SLOTS.find(x => x.from === o.slotFrom && x.to === o.slotTo);
    return s && selectedSlots.includes(s.label);
  });

  const tableOrders = [...dateAndStatusOrders].sort((a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime());

  // ── ИНИЦИАЛИЗАЦИЯ КАРТЫ С ОТСЛЕЖИВАНИЕМ ЗУМА ──
  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [55.752, 37.617], zoom: 10, controls: ["zoomControl"] }, {});
      map.events.add('boundschange', (e: any) => { if (e.get('newZoom') !== e.get('oldZoom')) setCurrentZoom(e.get('newZoom')); });
      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20 });
      map.geoObjects.add(clusterer);
      ymapRef.current = map;
      clustererRef.current = clusterer;
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => { if (ymapRef.current) setTimeout(() => ymapRef.current.container.fitToViewport(), 50); }, [mobileView, isListVisible, isDetailVisible, tableOpen, tableHeight]);

  const toggleBulkSelect = (id: string) => {
    setBulkSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 50) { alert("Максимум 50 заказов для масс-назначения"); return prev; }
      return [...prev, id];
    });
  };

  // ── ПИНЫ НА КАРТЕ ──
  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || typeof window === "undefined" || !window.ymaps) return;
    clusterer.removeAll();
    const ymaps = (window as any).ymaps;

    const StretchyLayout = ymaps.templateLayoutFactory.createClass(
      '<div style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer; opacity: {{ properties.opacity }};">' +
        '<div style="background:{{ properties.pinColor }};color:#fff;padding:4px 10px;border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:1.5px solid rgba(255,255,255,0.35);min-width:28px;text-align:center;line-height:1.4;">{{ properties.slotLabel }}</div>' +
        '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid {{ properties.pinColor }};margin-top:-1px;"></div>' +
        '{% if properties.showLabel %}<div style="margin-top:3px;font-size:9px;font-weight:700;color:#1a1a18;white-space:nowrap;background:rgba(255,255,255,0.96);padding:2px 6px;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,0.15);line-height:1.4;letter-spacing:0.1px;">{{ properties.labelText }}</div>{% endif %}' +
      '</div>'
    );

    const placemarks = filtered.filter(o => (o.lat && o.lng) || (o.id === selectedId && previewGeo)).map(order => {
      const isSelected = selectedId === order.id;
      const isBulkSelected = bulkSelectedIds.includes(order.id);
      
      const lat = isSelected && previewGeo ? previewGeo.lat : order.lat!;
      const lng = isSelected && previewGeo ? previewGeo.lng : order.lng!;
      
      const color = slotColor(order);
      let pinColor = isSelected ? (previewGeo ? '#9ca3af' : '#facc15') : color;
      let opacity = 1;

      // Визуализация режима маршрута
      if (isBulkMode) {
        pinColor = isBulkSelected ? '#1a9e5c' : '#d1d5db';
        opacity = isBulkSelected ? 1 : 0.6;
      }

      const displayTime = showTime && currentZoom >= 13 && !!order.slotRaw && selectedSlots.length === 0;
      const displayName = showCourierNames && !!order.courier && filterCourier === "ALL";
      const slotLabel = order.slotRaw ? order.slotRaw.replace("с ", "").replace(" до ", "-") : "";
      
      const balloonContentBody = `
        <div style="font-size:13px;line-height:1.5">
          <b>${order.address ?? "—"}</b><br>
          <span style="color:#888">${order.slotRaw ?? "—"}</span><br>
          ${order.courier ? `<span style="color:#1a1a18; font-weight:600;">${order.courier}</span><br>` : ""}
          ${order.isInvalid ? `<br><span style="color:#d94040">⚠ ${order.invalidReason}</span>` : ""}
        </div>`;

      let pm;
      if (displayTime) {
        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, balloonContentBody, hintContent: order.address ?? "—",
          pinColor, opacity, slotLabel, showLabel: displayName, labelText: order.courier ?? "",
        }, { iconLayout: StretchyLayout, iconShape: { type: "Rectangle", coordinates: [[-40, -40], [40, 20]] }, iconOffset: [-15, -26] });
      } else {
        let preset = 'islands#dotIcon';
        if (isBulkMode) preset = isBulkSelected ? 'islands#greenDotIcon' : 'islands#grayDotIcon';
        else if (isSelected) preset = previewGeo ? "islands#grayDotIcon" : "islands#redDotIcon";

        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, balloonContentBody, hintContent: order.address ?? "—",
          iconCaption: displayName ? order.courier : undefined, opacity
        }, { preset, iconColor: (isBulkMode || isSelected) ? undefined : color });
      }

      pm.events.add("click", () => {
        if (isBulkMode) {
          toggleBulkSelect(order.id);
        } else {
          setSelectedId(p => p === order.id ? null : order.id);
          if (!isMobile) setIsDetailVisible(true);
        }
      });
      return pm;
    });

    if (placemarks.length > 0) clusterer.add(placemarks);
  }, [filtered, selectedId, previewGeo, isMobile, showCourierNames, showTime, currentZoom, filterCourier, selectedSlots, isBulkMode, bulkSelectedIds]);

  // ── ЦЕНТРИРОВАНИЕ ──
  useEffect(() => {
    if (selectedId && ymapRef.current && !previewGeo && !isBulkMode) {
      const order = orders.find(o => o.id === selectedId);
      if (order?.lat && order?.lng) {
        if (isMobile && mobileView !== "panels") window.scrollTo({ top: 0, behavior: 'smooth' });
        ymapRef.current.setCenter([order.lat, order.lng], 16, { duration: 500, timingFunction: 'ease-in-out' });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isBulkMode]); 

  // ── МАССОВОЕ СОХРАНЕНИЕ ──
  async function handleBulkAssign() {
    if (!bulkCourier || bulkSelectedIds.length === 0) return;
    setBulkSaving(true);
    try {
      for (const id of bulkSelectedIds) {
        await fetch(`/api/orders/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courier: bulkCourier })
        });
      }
      setBulkSelectedIds([]);
      setIsBulkMode(false);
      setBulkCourier("");
      await fetchData();
    } catch (e) {
      console.error(e);
      alert("Произошла ошибка при массовом назначении");
    } finally {
      setBulkSaving(false);
    }
  }

  const toggleSlot = (label: string) => {
    if (label === "all") setSelectedSlots([]);
    else setSelectedSlots(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
  };

  return (
    <div style={isMobile ? sm.app : s.app}>
      <div style={isMobile ? sm.topbar : s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <button onClick={() => router.push('/couriers')} style={s.navBtn}>🚚 Курьеры</button>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={s.datePicker} />
        
        <CustomSelect value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} style={{ width: 130, marginLeft: 4 }} />
        <CustomSelect value={filterCourier} onChange={setFilterCourier} options={courierOptions} style={{ width: 130, marginLeft: 4 }} />

        {/* КНОПКА МАРШРУТА */}
        <button 
          onClick={() => { setIsBulkMode(!isBulkMode); setBulkSelectedIds([]); setSelectedId(null); setIsDetailVisible(false); }} 
          style={{ ...s.navBtn, background: isBulkMode ? "#1a1a18" : "#fff", color: isBulkMode ? "#fff" : "#1a1a18", border: isBulkMode ? "1px solid #1a1a18" : "1px solid #e8e6df", marginLeft: 12 }}
        >
          {isBulkMode ? "✕ Выйти из маршрута" : "📍 Маршрут"}
        </button>

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

      {!isMobile && invalid.length > 0 && !dismissedInvalid && (
        <div style={s.invalidBanner}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 12 }}><b>{invalid.length} заказов</b> с проблемными адресами — {invalid.map((o, i) => (<span key={o.id}><span style={s.invalidBannerLink} onClick={() => setSelectedId(o.id)}>{o.externalId ?? o.crmId}</span>{i < invalid.length - 1 ? ", " : ""}</span>))}</span>
          <button style={s.invalidBannerClose} onClick={() => setDismissedInvalid(true)}>✕</button>
        </div>
      )}

      <div style={isMobile ? sm.body : s.body}>
        {!isMobile && (
          <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative' }}>
            
            {/* ПЛАВАЮЩАЯ ПАНЕЛЬ МАРШРУТА */}
            {isBulkMode && (
              <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#fff', padding: '12px 20px', borderRadius: 12, boxShadow: '0 4px 30px rgba(0,0,0,0.15)', zIndex: 100, display: 'flex', alignItems: 'center', gap: 16, border: '2px solid #4a7aff' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a18' }}>Маршрут: <span style={{ color: '#4a7aff' }}>{bulkSelectedIds.length}</span>/50</div>
                <select style={s.select} value={bulkCourier} onChange={e => setBulkCourier(e.target.value)}>
                   <option value="">— Выберите курьера —</option>
                   {sortedCouriers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <button style={{ ...s.saveBtn, width: 'auto', padding: '8px 20px', background: bulkCourier && bulkSelectedIds.length > 0 ? '#4a7aff' : '#e8e6df', color: bulkCourier && bulkSelectedIds.length > 0 ? '#fff' : '#a8a49c' }} disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving} onClick={handleBulkAssign}>
                  {bulkSaving ? "Назначаем..." : "Назначить маршрут"}
                </button>
              </div>
            )}

            {showLeftPanel && !isBulkMode && (
              <div style={s.leftPanel}>
                {isListVisible && (
                  <div style={{ ...s.cardsSection, flex: isDetailVisible ? "0 0 50%" : 1, borderBottom: isDetailVisible ? "1px solid #e8e6df" : "none" }}>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionTitle}>Заказы</span>
                      <span style={s.countBadge}>{filtered.length}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setIsListVisible(false)} style={s.panelToggleArrow} title="Скрыть список">◀</button>
                    </div>
                    <div style={s.cardsList}>
                      {loading ? <div style={s.empty}>Загрузка...</div> : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div> : filtered.map(o => <OrderCard key={o.id} order={o} selected={selectedId === o.id} isBulkMode={isBulkMode} isBulkSelected={bulkSelectedIds.includes(o.id)} onSelect={() => isBulkMode ? toggleBulkSelect(o.id) : setSelectedId(p => p === o.id ? null : o.id)} />)}
                    </div>
                  </div>
                )}

                {isDetailVisible && (
                  <div style={{ ...s.detailSection, flex: isListVisible ? "0 0 50%" : 1 }}>
                    {selected ? (
                      <OrderDetail selected={selected} couriers={sortedCouriers} onClose={() => { setSelectedId(null); setIsDetailVisible(false); }} onUpdateSuccess={fetchData} onPreviewGeo={(geo) => { setPreviewGeo(geo); if (geo && ymapRef.current) ymapRef.current.setCenter([geo.lat, geo.lng], 15, { duration: 400 }); }} fixingAI={fixingAI} setFixingAI={setFixingAI} />
                    ) : (
                      <div style={s.detailEmpty}><div style={{ fontSize: 12, color: "#a8a49c" }}>Выберите заказ</div></div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, position: 'relative' }}>
              <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
              {!isListVisible && !isBulkMode && (
                <button onClick={() => setIsListVisible(true)} style={s.expandSideBtn} title="Показать список">▶</button>
              )}
            </div>
          </div>
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
                  <tr>{["Внешний ID", "Время", "Адрес доставки", "Курьер", "Стоимость", "Статус", "Комментарий", "Опер. Коммент", "Состав", "Создан"].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, i) => {
                    const color = slotColor(o);
                    const isSelected = selectedId === o.id;
                    const isBulkSelected = bulkSelectedIds.includes(o.id);
                    return (
                      <tr key={o.id} style={{ background: isBulkMode ? (isBulkSelected ? "#eef3ff" : "#fff") : (isSelected ? "#eef3ff" : i % 2 === 0 ? "#fff" : "#fafaf8"), cursor: "pointer", outline: (isSelected || isBulkSelected) ? "1px solid #4a7aff" : "none" }} onClick={() => isBulkMode ? toggleBulkSelect(o.id) : setSelectedId(p => p === o.id ? null : o.id)}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                          {isBulkMode && <input type="checkbox" checked={isBulkSelected} readOnly style={{ marginRight: 6, accentColor: "#4a7aff" }} />}
                          <span style={{ ...s.statusDot, background: color }} /><span style={{ fontFamily: "monospace", fontSize: 10, color: "#a8a49c" }}>{o.externalId ?? o.crmId}</span>
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color }}>{o.slotRaw ?? (o.slotFrom ? `${o.slotFrom}–${o.slotTo}` : "—")}</td>
                        <td style={{ ...s.td, minWidth: 180, maxWidth: 240 }}>{o.address ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{o.courier ?? <span style={{ color: "#d94040", fontWeight: 400 }}>—</span>}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{o.price ? `${o.price} ₽` : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 220, color: "#6b6860" }}>{o.comment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "#4a7aff" }}>{o.opComment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 240, color: "#6b6860" }}>{o.items ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "#a8a49c", fontSize: 10 }}>{o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
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
      {(profileOpen || alertsOpen) && <div style={s.overlay} onClick={() => { setProfileOpen(false); setAlertsOpen(false); }} />}
    </div>
  );
}

function SlotBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return <button style={{ ...s.slotBtn, ...(active ? { background: color, borderColor: color, color: "#fff" } : {}) }} onClick={onClick}>{label}</button>;
}

function OrderCard({ order, selected, isBulkMode, isBulkSelected, onSelect }: { order: Order; selected: boolean; isBulkMode: boolean; isBulkSelected: boolean; onSelect: () => void }) {
  const color = slotColor(order);
  return (
    <div style={{ ...s.card, ...(selected || isBulkSelected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
      <div style={s.cardRow1}>
        {isBulkMode && <input type="checkbox" checked={isBulkSelected} readOnly style={{ marginRight: 6, pointerEvents: "none", accentColor: "#4a7aff" }} />}
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
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  datePicker: { padding: "4px 8px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, outline: "none", color: "#1a1a18", background: "#fff", marginLeft: 12 },
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
  tableSection: { flexShrink: 0, background: "#fff", borderTop: "2px solid #e8e6df", display: "flex", flexDirection: "column", overflow: "hidden" },
  tableHeader: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderBottom: "1px solid #f0efe9", flexShrink: 0 },
  tableWrap: { flex: 1, overflowX: "auto", overflowY: "auto" },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "7px 12px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".4px", background: "#fafaf8", borderBottom: "1px solid #e8e6df", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 },
  td: { padding: "7px 12px", borderBottom: "0.5px solid #f0efe9", verticalAlign: "top", fontSize: 12, color: "#1a1a18" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block", marginRight: 4, verticalAlign: "middle" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  select: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", fontSize: 13, outline: "none", cursor: "pointer", background: "#fff", color: "#1a1a18" },
  saveBtn: { border: "none", fontSize: 13, fontWeight: 600, transition: "background .15s, color .15s", cursor: "pointer", borderRadius: 8 }
};

const sm: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0" },
  topbar: { ...s.topbar, overflowX: "auto", padding: "0 10px", gap: 6 },
  body: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" },
};