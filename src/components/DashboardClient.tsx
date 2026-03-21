"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ProfilePanel } from "./ProfilePanel";
import { OrderDetail } from "./OrderDetail";
import { Order, STATUS_OPTIONS, STATUS_LABELS, SLOTS, slotColor } from "@/lib/constants";

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;
const STORE_COORDS = `${STORE_LAT},${STORE_LNG}`;

interface User { id: string; email: string; role: string; }
interface DbCourier { id: number; fullName: string; isActive: boolean; shifts: { date: string }[]; }

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
  const ymapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const clickedFromMapRef = useRef(false);

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
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: 'asc' | 'desc' }>({ key: 'changedAt', dir: 'desc' });

  const [showCourierNames, setShowCourierNames] = useState(true);
  const [showTime, setShowTime] = useState(true);

  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [orders, setOrders] = useState<Order[]>([]);
  const [dbCouriers, setDbCouriers] = useState<DbCourier[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCourier, setFilterCourier] = useState("ALL");
  const [currentZoom, setCurrentZoom] = useState(11);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [dismissedInvalid, setDismissedInvalid] = useState(false);
  const [previewGeo, setPreviewGeo] = useState<{ lat: number, lng: number } | null>(null);
  const [fixingAI, setFixingAI] = useState(false);

  // Маршруты
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [routeTab, setRouteTab] = useState<"map" | "list">("map");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkCourier, setBulkCourier] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [routeType, setRouteType] = useState<"auto" | "mt">("auto"); // авто или пешком

  useEffect(() => {
    if (!isDraggingTable) { document.body.style.userSelect = ""; return; }
    document.body.style.userSelect = "none";
    const handleMouseMove = (e: MouseEvent) => { const newHeight = window.innerHeight - e.clientY; if (newHeight > 100 && newHeight < window.innerHeight - 150) setTableHeight(newHeight); };
    const handleMouseUp = () => setIsDraggingTable(false);
    window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDraggingTable]);

  useEffect(() => {
    if (ymapRef.current) setTimeout(() => ymapRef.current!.container.fitToViewport(), 50);
  }, [isListVisible, isDetailVisible, tableOpen, tableHeight, mobileView]);

  const fetchData = useCallback(async () => {
    try {
      const [ordersRes, couriersRes] = await Promise.all([fetch(`/api/orders`), fetch(`/api/couriers`)]);
      if (ordersRes.ok) { setOrders(await ordersRes.json()); setLastSync(new Date().toLocaleTimeString("ru", { timeZone: "Europe/Moscow" })); }
      if (couriersRes.ok) setDbCouriers(await couriersRes.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30_000); return () => clearInterval(t); }, [fetchData]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "NOTIFICATION_CLICK" && e.data.orderId) {
        setSelectedId(e.data.orderId);
        setIsDetailVisible(true);
        if (isMobile) setMobileView("split");
        fetchData();
      } else if (e.data?.type === "PUSH_RECEIVED") {
        fetchData();
      }
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () => navigator.serviceWorker?.removeEventListener("message", handler);
  }, [fetchData, isMobile]);

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
      const scoreA = (aWorks ? 10 : 0) + ((orderCounts[a.fullName] || 0) > 0 ? 5 : 0);
      const scoreB = (bWorks ? 10 : 0) + ((orderCounts[b.fullName] || 0) > 0 ? 5 : 0);
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

  const filtered = selectedSlots.length === 0 ? dateAndStatusOrders : dateAndStatusOrders.filter(o => {
    const s = SLOTS.find(x => x.from === o.slotFrom && x.to === o.slotTo);
    return s && selectedSlots.includes(s.label);
  });

 // Применяем сортировку к таблице
  const tableOrders = [...filtered].sort((a, b) => {
    let valA: any = a[sortConfig.key as keyof Order] ?? "";
    let valB: any = b[sortConfig.key as keyof Order] ?? "";

    // Специальная обработка для дат
    if (sortConfig.key === "changedAt") {
      valA = new Date((a as any).changedAt || a.updatedAt || 0).getTime();
      valB = new Date((b as any).changedAt || b.updatedAt || 0).getTime();
    } else if (sortConfig.key === "crmCreatedAt") {
      valA = new Date(a.crmCreatedAt || 0).getTime();
      valB = new Date(b.crmCreatedAt || 0).getTime();
    }

    if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc'
    }));
  };

  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [STORE_LAT, STORE_LNG], zoom: 11, controls: ["zoomControl"] }, {});
      map.events.add('boundschange', (e: any) => { if (e.get('newZoom') !== e.get('oldZoom')) setCurrentZoom(e.get('newZoom')); });
      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20 });
      map.geoObjects.add(clusterer);
      const storePm = new window.ymaps.Placemark([STORE_LAT, STORE_LNG], {
        hintContent: "БАЗА: Большой Афанасьевский переулок, 39",
        balloonContent: "<b>Магазин / База</b><br/>Большой Афанасьевский пер., 39"
      }, { preset: 'islands#blackHomeIcon' });
      map.geoObjects.add(storePm as any);
      ymapRef.current = map;
      clustererRef.current = clusterer;
    });
    return () => { mounted = false; };
  }, []);

  const toggleBulkSelect = (id: string) => {
    setBulkSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 50) { alert("Максимум 50 заказов для Яндекс Карт"); return prev; }
      return [...prev, id];
    });
  };

  const moveBulkItem = (index: number, dir: 'up' | 'down') => {
    setBulkSelectedIds(prev => {
      const arr = [...prev];
      if (dir === 'up' && index > 0) {
        [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      } else if (dir === 'down' && index < arr.length - 1) {
        [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      }
      return arr;
    });
  };

  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || typeof window === "undefined" || !window.ymaps) return;
    clusterer.removeAll();
    const ymaps = (window as any).ymaps;

    const StretchyLayout = ymaps.templateLayoutFactory.createClass(
      '<div style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;">' +
      '<div style="background:{{ properties.pinColor }};color:#fff;padding:4px 10px;border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:1.5px solid rgba(255,255,255,0.35);min-width:28px;text-align:center;line-height:1.4;">{{ properties.slotLabel }}</div>' +
      '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid {{ properties.pinColor }};margin-top:-1px;"></div>' +
      '{% if properties.showLabel %}<div style="margin-top:3px;font-size:9px;font-weight:700;color:#1a1a18;white-space:nowrap;background:rgba(255,255,255,0.96);padding:2px 6px;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,0.15);line-height:1.4;">{{ properties.labelText }}</div>{% endif %}' +
      '</div>'
    );

    const placemarks = filtered.filter(o => (o.lat && o.lng) || (o.id === selectedId && previewGeo)).map(order => {
      const isSelected = selectedId === order.id;
      const isBulkSelected = bulkSelectedIds.includes(order.id);
      const lat = isSelected && previewGeo ? previewGeo.lat : order.lat!;
      const lng = isSelected && previewGeo ? previewGeo.lng : order.lng!;
      const color = slotColor(order);
      let pinColor = isSelected ? (previewGeo ? '#9ca3af' : '#facc15') : color;
      if (isBulkMode) pinColor = isBulkSelected ? '#1a9e5c' : '#d1d5db';

      const displayTime = showTime && currentZoom >= 13 && !!order.slotRaw && selectedSlots.length === 0;
      const displayName = showCourierNames && !!order.courier;
      const slotLabel = order.slotRaw ? order.slotRaw.replace("с ", "").replace(" до ", "-") : "";

      let pm;
      if (displayTime) {
        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, hintContent: order.address ?? "—",
          pinColor, slotLabel, showLabel: displayName, labelText: order.courier ?? "",
        }, { iconLayout: StretchyLayout, iconShape: { type: "Rectangle", coordinates: [[-40, -40], [40, 20]] }, iconOffset: [-15, -26] });
      } else {
        let preset = 'islands#dotIcon';
        if (isBulkMode) preset = isBulkSelected ? 'islands#greenDotIcon' : 'islands#grayDotIcon';
        else if (isSelected) preset = previewGeo ? "islands#grayDotIcon" : "islands#redDotIcon";
        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, hintContent: order.address ?? "—",
          iconCaption: displayName ? order.courier : undefined
        }, { preset, iconColor: (isBulkMode || isSelected) ? undefined : color });
      }

      pm.events.add("click", () => {
        if (isBulkMode) {
          toggleBulkSelect(order.id);
        } else {
          clickedFromMapRef.current = true;
          setSelectedId(p => p === order.id ? null : order.id);
          if (!isMobile) { setIsListVisible(true); setIsDetailVisible(true); }
          else setMobileView("split");
        }
      });
      return pm;
    });

    if (placemarks.length > 0) clusterer.add(placemarks as any);
  }, [filtered, selectedId, previewGeo, currentZoom, selectedSlots, isBulkMode, bulkSelectedIds, showTime, showCourierNames, isMobile]);

  useEffect(() => {
    if (selectedId && ymapRef.current && !previewGeo && !isBulkMode) {
      const order = orders.find(o => o.id === selectedId);
      if (order?.lat && order?.lng) {
        if (clickedFromMapRef.current) {
          ymapRef.current.setCenter([order.lat, order.lng], undefined, { duration: 300 });
        } else {
          ymapRef.current.setCenter([order.lat, order.lng], 16, { duration: 500 });
        }
        clickedFromMapRef.current = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, isBulkMode]);

  // ГЕНЕРАТОР ССЫЛКИ ДЛЯ ЯНДЕКСА (без принудительной сортировки)
  const generateYandexUrl = (ordersToRoute: Order[], type: "auto" | "mt") => {
    const validOrders = ordersToRoute.filter(o => o.lat && o.lng && !o.isInvalid);
    if (validOrders.length === 0) return null;
    if (validOrders.length > 50) validOrders.length = 50;
    const rtext = [STORE_COORDS, ...validOrders.map(o => `${o.lat},${o.lng}`)].join("~");
    return `https://yandex.ru/maps/?rtext=${rtext}&rtt=${type}`;
  };

  const handleOpenRoute = (ordersToRoute: Order[]) => {
    const url = generateYandexUrl(ordersToRoute, routeType);
    if (url) window.open(url, "_blank");
    else alert("Нет корректных координат для построения маршрута.");
  };

  const handleShareRoute = async (ordersToRoute: Order[]) => {
    const url = generateYandexUrl(ordersToRoute, routeType);
    if (!url) { alert("Нет корректных координат"); return; }
    try {
      await navigator.clipboard.writeText(url);
      alert("✅ Ссылка скопирована!");
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      alert("✅ Ссылка скопирована!");
    }
  };

  async function handleBulkAssign() {
    if (!bulkCourier || bulkSelectedIds.length === 0) return;
    setBulkSaving(true);
    try {
      for (const id of bulkSelectedIds) {
        await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courier: bulkCourier }) });
      }
      setBulkCourier(""); // Очищаем селект курьера, но ОСТАВЛЯЕМ окно открытым
      await fetchData();
      alert("✅ Курьер успешно назначен на выбранные заказы!");
    } catch { alert("Произошла ошибка при массовом назначении"); }
    finally { setBulkSaving(false); }
  }

  const toggleSlot = (label: string) => {
    if (label === "all") setSelectedSlots([]);
    else setSelectedSlots(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
  };

  // СПИСОК МАРШРУТОВ БЕРЕТСЯ В ТОЧНОМ ПОРЯДКЕ КЛИКОВ / СТРЕЛОЧЕК
  const selectedRouteOrders = bulkSelectedIds.map(id => orders.find(o => o.id === id)).filter(Boolean) as Order[];
  const showLeftPanel = (isListVisible || isDetailVisible) && !isBulkMode;

  return (
    <div style={isMobile ? sm.app : s.app}>
      {/* ── Topbar ── */}
      <div style={isMobile ? sm.topbar : s.topbar}>
        <div style={s.logo}><span style={s.logoDot} />FlowerOps</div>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <button onClick={() => router.push('/couriers')} style={s.navBtn}>🚚 Курьеры</button>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={s.datePicker} />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...s.nativeSelect, marginLeft: 8 }}>
          {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <select value={filterCourier} onChange={e => setFilterCourier(e.target.value)} style={{ ...s.nativeSelect, marginLeft: 4 }}>
          {courierOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <button
          onClick={() => { setIsBulkMode(!isBulkMode); setRouteTab("map"); setBulkSelectedIds([]); setSelectedId(null); setIsDetailVisible(false); }}
          style={{ ...s.navBtn, background: isBulkMode ? "#1a1a18" : "#fff", color: isBulkMode ? "#fff" : "#1a1a18", border: isBulkMode ? "1px solid #1a1a18" : "1px solid #e8e6df", marginLeft: 8 }}
        >
          {isBulkMode ? "✕ Маршрут" : "📍 Маршрут"}
        </button>

        {!isMobile && (
          <div style={s.slotBar}>
            <SlotBtn label="Все" active={selectedSlots.length === 0} color="#4a7aff" onClick={() => toggleSlot("all")} />
            {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
          </div>
        )}
        <div style={{ flex: 1 }} />

        {!isMobile && (
          <div style={{ display: 'flex', gap: 10, marginRight: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={showCourierNames} onChange={e => setShowCourierNames(e.target.checked)} /> Имена</label>
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} /> Время</label>
          </div>
        )}

        {invalid.length > 0 && (
          <button style={s.alertBadge} onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>
            ⚠ {!isMobile && `${invalid.length}`}
          </button>
        )}
        {!isMobile && lastSync && <span style={s.syncLabel}>обновлено {lastSync}</span>}
        <button style={s.userBtn} onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}>{user.email.slice(0, 2).toUpperCase()}</button>
      </div>

      {/* ── Слоты мобайл ── */}
      {isMobile && (
        <div style={sm.mobileSlotsWrap}>
          <SlotBtn label="Все" active={selectedSlots.length === 0} color="#4a7aff" onClick={() => toggleSlot("all")} />
          {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
        </div>
      )}

      {/* ── Баннер невалидных адресов ── */}
      {!isMobile && invalid.length > 0 && !dismissedInvalid && (
        <div style={s.invalidBanner}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 12 }}>
            <b>{invalid.length} заказов</b> с проблемными адресами —{" "}
            {invalid.map((o, i) => (
              <span key={o.id}>
                <span style={s.invalidBannerLink} onClick={() => { setSelectedId(o.id); setIsDetailVisible(true); }}>{o.externalId ?? o.crmId}</span>
                {i < invalid.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
          <button style={s.invalidBannerClose} onClick={() => setDismissedInvalid(true)}>✕</button>
        </div>
      )}

      {/* ── Переключатель вид мобайл ── */}
      {isMobile && (
        <div style={{ display: "flex", padding: "6px 10px", background: "#f5f4f0", gap: 6, flexShrink: 0, borderBottom: "1px solid #e8e6df" }}>
          <ViewToggleBtn active={mobileView === "map"} onClick={() => setMobileView("map")}>🗺️ Карта</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "split"} onClick={() => setMobileView("split")}>Вместе</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "panels"} onClick={() => setMobileView("panels")}>📋 Список</ViewToggleBtn>
        </div>
      )}

      {/* ── Body ── */}
      <div style={isMobile ? sm.body : s.body}>

        {/* DESKTOP */}
        {!isMobile && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {showLeftPanel && (
              <div style={s.leftPanel}>
                {isListVisible && (
                  <div style={{ ...s.cardsSection, flex: isDetailVisible ? "0 0 50%" : 1, borderBottom: isDetailVisible ? "1px solid #e8e6df" : "none" }}>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionTitle}>Заказы</span>
                      <span style={s.countBadge}>{filtered.length}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setIsListVisible(false)} style={s.panelToggleArrow}>◀</button>
                    </div>
                    <div style={s.cardsList}>
                      {loading ? <div style={s.empty}>Загрузка...</div> : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div> : filtered.map(o =>
                        <OrderCard key={o.id} order={o} selected={selectedId === o.id} isBulkMode={isBulkMode} isBulkSelected={bulkSelectedIds.includes(o.id)} onSelect={() => isBulkMode ? toggleBulkSelect(o.id) : setSelectedId(p => p === o.id ? null : o.id)} />
                      )}
                    </div>
                  </div>
                )}
                {isDetailVisible && (
                  <div style={{ ...s.detailSection, flex: isListVisible ? "0 0 50%" : 1 }}>
                    {selected
                      ? <OrderDetail selected={selected} couriers={sortedCouriers} onClose={() => setIsDetailVisible(false)} onUpdateSuccess={fetchData} onPreviewGeo={(geo) => { setPreviewGeo(geo); if (geo && ymapRef.current) ymapRef.current.setCenter([geo.lat, geo.lng], 15, { duration: 400 }); }} fixingAI={fixingAI} setFixingAI={setFixingAI} />
                      : <div style={s.detailEmpty}><div style={{ fontSize: 12, color: "#a8a49c" }}>Выберите заказ</div></div>
                    }
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, position: 'relative', display: "flex", flexDirection: "column", minWidth: 0 }}>
              {isBulkMode && (
                <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #e8e6df", padding: "8px 16px", gap: 8, flexShrink: 0, zIndex: 10 }}>
                  <button onClick={() => setRouteTab("map")} style={{ ...s.routeTabBtn, background: routeTab === "map" ? "#eef3ff" : "#fff", color: routeTab === "map" ? "#4a7aff" : "#6b6860" }}>📍 Точки на карте</button>
                  <button onClick={() => setRouteTab("list")} style={{ ...s.routeTabBtn, background: routeTab === "list" ? "#eef3ff" : "#fff", color: routeTab === "list" ? "#4a7aff" : "#6b6860" }}>📋 Маршрут ({bulkSelectedIds.length})</button>
                </div>
              )}

              {/* Карта — всегда в DOM, скрывается через display */}
              <div ref={mapRef} style={{ width: '100%', flex: 1, display: routeTab === "list" ? "none" : "block" }} />

              {isBulkMode && routeTab === "list" && (
                <div style={{ flex: 1, background: "#f5f4f0", padding: 24, overflowY: "auto" }}>
                  <div style={{ maxWidth: 600, margin: "0 auto", background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: 20 }}>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h2 style={{ margin: 0, fontSize: 18, color: "#1a1a18" }}>Маршрут · {bulkSelectedIds.length} точек</h2>
                      <button onClick={() => setIsBulkMode(false)} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a8a49c", padding: "0 8px" }}>×</button>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "#f5f4f0", padding: 4, borderRadius: 8, width: "fit-content" }}>
                      <button onClick={() => setRouteType("auto")} style={{ ...s.actionBtn, background: routeType === "auto" ? "#fff" : "transparent", color: routeType === "auto" ? "#1a1a18" : "#a8a49c", boxShadow: routeType === "auto" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚗 На авто</button>
                      <button onClick={() => setRouteType("mt")} style={{ ...s.actionBtn, background: routeType === "mt" ? "#fff" : "transparent", color: routeType === "mt" ? "#1a1a18" : "#a8a49c", boxShadow: routeType === "mt" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚌 Транспорт</button>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                      <button onClick={() => handleOpenRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "#facc15", color: "#1a1a18" }}>🗺️ Открыть в Яндексе</button>
                      <button onClick={() => handleShareRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "#fafaf8", border: "1px solid #e8e6df", color: "#1a1a18" }}>🔗 Копировать ссылку</button>
                    </div>

                    <div style={{ background: "#fafaf8", padding: 16, borderRadius: 8, marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Назначить курьера</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <select style={{ ...s.nativeSelect, flex: 1 }} value={bulkCourier} onChange={e => setBulkCourier(e.target.value)}>
                          <option value="">— Выберите курьера —</option>
                          {sortedCouriers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <button style={{ ...s.actionBtn, width: 120, background: bulkCourier && bulkSelectedIds.length > 0 ? '#4a7aff' : '#e8e6df', color: bulkCourier && bulkSelectedIds.length > 0 ? '#fff' : '#a8a49c' }} disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving} onClick={handleBulkAssign}>
                          {bulkSaving ? "..." : "Назначить"}
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Очередь доставки</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selectedRouteOrders.map((o, index) => (
                        <div key={o.id} style={{ padding: "10px 12px", background: "#fff", border: "1px solid #e8e6df", borderRadius: 8, display: "flex", gap: 12, alignItems: "center" }}>

                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button disabled={index === 0} onClick={() => moveBulkItem(index, 'up')} style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, fontSize: 11, padding: 2, color: "#6b6860" }}>▲</button>
                            <button disabled={index === selectedRouteOrders.length - 1} onClick={() => moveBulkItem(index, 'down')} style={{ background: "none", border: "none", cursor: index === selectedRouteOrders.length - 1 ? "default" : "pointer", opacity: index === selectedRouteOrders.length - 1 ? 0.3 : 1, fontSize: 11, padding: 2, color: "#6b6860" }}>▼</button>
                          </div>

                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#4a7aff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
                          <div style={{ flex: 1, overflow: "hidden" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.address}</div>
                            <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 2 }}>Слот: {o.slotRaw} · {o.externalId ?? o.crmId}</div>
                          </div>
                          <button onClick={() => toggleBulkSelect(o.id)} style={{ background: "none", border: "none", color: "#d94040", cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
                        </div>
                      ))}
                      {selectedRouteOrders.length === 0 && <div style={{ fontSize: 13, color: "#a8a49c", textAlign: "center", padding: 20 }}>Точки не выбраны</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Кнопки разворачивания скрытых панелей */}
              {!isBulkMode && (
                <div style={{ position: 'absolute', top: 12, left: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {!isListVisible && (
                    <button onClick={() => setIsListVisible(true)} style={s.expandSideBtn} title="Показать список">≡</button>
                  )}
                  {!isDetailVisible && selectedId && (
                    <button onClick={() => setIsDetailVisible(true)} style={{ ...s.expandSideBtn, marginTop: isListVisible ? 0 : 4 }} title="Показать карточку">☰</button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MOBILE */}
        {isMobile && (
          <>
            <div
              ref={mapRef}
              style={{
                ...sm.map,
                display: mobileView === "panels" ? "none" : "block",
                flex: mobileView === "map" ? 1 : "0 0 45%",
              }}
            />
            <div style={{ ...sm.panelsWrap, display: mobileView === "map" ? "none" : "flex", flex: mobileView === "panels" ? 1 : undefined }}>
              <div style={sm.cardsSection}>
                <div style={s.cardsList}>
                  {loading ? <div style={s.empty}>Загрузка...</div> : filtered.length === 0 ? <div style={s.empty}>Заказов нет</div> : filtered.map(o =>
                    <OrderCard key={o.id} order={o} selected={selectedId === o.id} isBulkMode={false} isBulkSelected={false} onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />
                  )}
                </div>
              </div>
              <div style={sm.detailSection}>
                {selected
                  ? <OrderDetail selected={selected} couriers={sortedCouriers} onClose={() => setSelectedId(null)} onUpdateSuccess={fetchData} onPreviewGeo={(geo) => { setPreviewGeo(geo); if (geo && ymapRef.current) ymapRef.current.setCenter([geo.lat, geo.lng], 15, { duration: 400 }); }} fixingAI={fixingAI} setFixingAI={setFixingAI} />
                  : <div style={s.detailEmpty}><div style={{ fontSize: 12, color: "#a8a49c", textAlign: "center" }}>Выберите заказ</div></div>
                }
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Нижняя таблица (только десктоп) ── */}
      {!isMobile && (
        <div style={{ ...s.tableSection, height: tableOpen ? tableHeight : 44, position: 'relative' }}>
          {tableOpen && <div onMouseDown={(e) => { e.preventDefault(); setIsDraggingTable(true); }} style={{ position: 'absolute', top: -4, left: 0, right: 0, height: 8, cursor: 'row-resize', zIndex: 200 }} />}
          <div style={s.tableHeader}>
            <span style={s.sectionTitle}>Все заказы ({filterDate})</span>
            <span style={s.countBadge}>{tableOrders.length}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setTableOpen(!tableOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4a7aff', padding: '4px 8px' }}>
              {tableOpen ? '▼ Свернуть' : '▲ Развернуть'}
            </button>
          </div>
          {tableOpen && (
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <table style={s.table}>
              <thead>
                  <tr>
                    {[
                      { label: "Внешний ID", key: "externalId" },
                      { label: "Время", key: "slotFrom" },
                      { label: "Адрес", key: "address" },
                      { label: "Курьер", key: "courier" },
                      { label: "Сумма", key: "price" },
                      { label: "Статус", key: "status" },
                      { label: "Комментарий", key: "comment" },
                      { label: "Оператор", key: "opComment" },
                      { label: "Состав", key: "items" },
                      { label: "Создан", key: "crmCreatedAt" },
                      { label: "Изменён", key: "changedAt" }
                    ].map(col => (
                      <th 
                        key={col.key} 
                        style={{ ...s.th, cursor: "pointer", userSelect: "none" }} 
                        onClick={() => handleSort(col.key)}
                        title={`Сортировать по: ${col.label}`}
                      >
                        {col.label} {sortConfig.key === col.key ? (sortConfig.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, i) => {
                    const color = slotColor(o);
                    return (
                      <tr key={o.id} style={{ background: selectedId === o.id ? "#eef3ff" : i % 2 === 0 ? "#fff" : "#fafaf8", cursor: "pointer" }}
                        onClick={() => { setSelectedId(p => p === o.id ? null : o.id); setIsListVisible(true); setIsDetailVisible(true); }}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ ...s.statusDot, background: color }} /><span style={{ fontFamily: "monospace", fontSize: 10, color: "#a8a49c" }}>{o.externalId ?? o.crmId}</span></td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color }}>{o.slotRaw ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 220 }}>{o.address ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{o.courier ?? <span style={{ color: "#d94040" }}>—</span>}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{o.price ? `${o.price} ₽` : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "#6b6860" }}>{o.comment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 120, maxWidth: 180, color: "#4a7aff" }}>{o.opComment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 220, color: "#6b6860" }}>{o.items ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "#a8a49c", fontSize: 10 }}>
                          {o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: (o as any).changedAt ? "#1a1a18" : "#a8a49c", fontSize: 10 }}>
                          {((o as any).changedAt || o.updatedAt) ? new Date((o as any).changedAt || o.updatedAt!).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {profileOpen && (
        <div style={{ position: "fixed", top: 52, right: 8, zIndex: 200 }}>
          <ProfilePanel onClose={() => setProfileOpen(false)} onLogout={() => router.push("/login")} />
        </div>
      )}

      {alertsOpen && invalid.length > 0 && (
        <div style={{ ...s.popup, right: 52 }} onClick={e => e.stopPropagation()}>
          <div style={s.alertTitle}>⚠ Проблемные адреса</div>
          {invalid.map(o => (
            <div key={o.id} style={s.alertItem} onClick={() => { setSelectedId(o.id); setIsDetailVisible(true); setAlertsOpen(false); }}>
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

function ViewToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: active ? "#4a7aff" : "#fff", color: active ? "#fff" : "#6b6860", boxShadow: active ? "0 2px 8px rgba(74,122,255,0.3)" : "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.15s" }}>
      {children}
    </button>
  );
}

function SlotBtn({ label, active, color, onClick }: any) {
  return <button style={{ ...s.slotBtn, ...(active ? { background: color, borderColor: color, color: "#fff" } : {}) }} onClick={onClick}>{label}</button>;
}

function OrderCard({ order, selected, isBulkMode, isBulkSelected, onSelect }: any) {
  const color = slotColor(order);
  return (
    <div style={{ ...s.card, ...(selected || isBulkSelected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
      <div style={s.cardRow1}>
        {isBulkMode && <input type="checkbox" checked={isBulkSelected} readOnly style={{ marginRight: 6, pointerEvents: "none", accentColor: "#4a7aff" }} />}
        <span style={{ ...s.statusDot, background: color }} />
        <span style={s.extId}>{order.externalId ?? order.crmId}</span>
        <span style={{ ...s.statusTag, background: `${color}18`, color }}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div style={s.cardAddr}>{order.address ?? "—"}</div>
      <div style={s.cardMeta}>
        <span style={{ ...s.slotTag, color }}>{order.slotFrom}–{order.slotTo ?? ""}</span>
        <span style={s.courierTag}>{order.courier ?? "—"}</span>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0, zIndex: 10, position: "relative", overflowX: "auto" },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" },
  logoDot: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#4a7aff" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  datePicker: { padding: "4px 8px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, outline: "none", color: "#1a1a18", background: "#fff", marginLeft: 8 },
  nativeSelect: { height: 28, padding: "0 8px", borderRadius: 7, border: "1px solid #e0dfd7", fontSize: 11, fontWeight: 500, outline: "none", cursor: "pointer", background: "#fff", color: "#1a1a18", maxWidth: 120 /* 🔥 ДОБАВЛЕНО */ },
  slotBar: { display: "flex", gap: 4, marginLeft: 8 },
  slotBtn: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid #e8e6df", background: "transparent", color: "#6b6860", cursor: "pointer", whiteSpace: "nowrap" },
  syncLabel: { fontSize: 11, color: "#a8a49c", whiteSpace: "nowrap", marginRight: 4 },
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
  panelToggleArrow: { background: "transparent", border: "none", cursor: "pointer", color: "#a8a49c", fontSize: 13, padding: "4px 8px", borderRadius: 4 },
  expandSideBtn: { background: "#fff", border: "1px solid #e8e6df", borderLeft: "none", borderRadius: "0 8px 8px 0", padding: "10px 8px", cursor: "pointer", color: "#6b6860", fontSize: 13, boxShadow: "2px 2px 8px rgba(0,0,0,0.06)" },
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
  tableSection: { flexShrink: 0, background: "#fff", borderTop: "2px solid #e8e6df", display: "flex", flexDirection: "column", overflow: "hidden" },
  tableHeader: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderBottom: "1px solid #f0efe9", flexShrink: 0 },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "7px 12px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, color: "#a8a49c", textTransform: "uppercase", letterSpacing: ".4px", background: "#fafaf8", borderBottom: "1px solid #e8e6df", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 },
  td: { padding: "7px 12px", borderBottom: "0.5px solid #f0efe9", verticalAlign: "top", fontSize: 12, color: "#1a1a18" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block", marginRight: 4, verticalAlign: "middle" },
  routeTabBtn: { padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", transition: "all 0.15s" },
  actionBtn: { padding: "8px 16px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 8 },
  popup: { position: "fixed", top: 52, right: 8, background: "#fff", border: "1px solid #e8e6df", borderRadius: 12, padding: 16, zIndex: 200, width: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  alertTitle: { fontSize: 11, fontWeight: 700, color: "#d94040", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 },
  alertItem: { padding: "7px 0", borderBottom: "0.5px solid #f5f4f0", cursor: "pointer" },
  alertAddr: { fontSize: 12, color: "#1a1a18", marginBottom: 2 },
  alertSub: { fontSize: 11, color: "#d94040", opacity: 0.8 },
};

const sm: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", gap: 6, padding: "0 10px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0, zIndex: 10, overflowX: "auto" },
  mobileSlotsWrap: { display: "flex", gap: 4, padding: "6px 10px", background: "#fff", borderBottom: "1px solid #e8e6df", overflowX: "auto", flexShrink: 0 },
  body: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 },
  map: { width: "100%", minHeight: 200 },
  panelsWrap: { display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden", flex: 1, minHeight: 0 },
  cardsSection: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },
  detailSection: { flex: "0 0 55%", display: "flex", flexDirection: "column", borderTop: "2px solid #4a7aff", background: "#fff", overflow: "hidden", boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" },
};