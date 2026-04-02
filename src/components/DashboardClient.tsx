// src/components/DashboardClient.tsx
"use client";
import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ProfilePanel } from "./ProfilePanel";
import { OrderDetail } from "./OrderDetail";
import { STATUS_OPTIONS, STATUS_LABELS, SLOTS, slotColor } from "@/lib/constants";
import Link from "next/link";

const STORE_LAT = 55.749511;
const STORE_LNG = 37.596205;
const STORE_COORDS = `${STORE_LAT},${STORE_LNG}`;

interface User { id: string; email: string; role: string; }
interface DbCourier {
  id: number; fullName: string; isActive: boolean; shifts: { date: string }[];
  lat?: number | null; lng?: number | null;
  homeLat?: number | null; homeLng?: number | null;
  locationUpdatedAt?: string | null;
}

export interface DashboardOrder {
  id: string; crmId: string; externalId?: string | null; status: string;
  address?: string | null; lat?: number | null; lng?: number | null;
  price?: number | null; courierId?: number | null; courier?: string | null;
  comment?: string | null; opComment?: string | null; items?: string | null;
  slotFrom?: string | null; slotTo?: string | null; slotRaw?: string | null;
  deliveryDate?: string | null; crmCreatedAt?: string | null;
  isInvalid?: boolean; invalidReason?: string | null;
  routeId?: string | null; routeOrder?: number | null; route?: any;
  createdAt?: string; updatedAt?: string; changedAt?: string;
  pickedUpAt?: string | null; // 🔥 ДОБАВИТЬ СЮДА
}

let ymapsReady: Promise<void> | null = null;
function loadYMaps(): Promise<void> {
  if (ymapsReady) return ymapsReady;
  ymapsReady = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.ymaps) { window.ymaps.ready(resolve); return; }
    const s = document.createElement("script");
    const mapsKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY;
    const suggestKey = process.env.NEXT_PUBLIC_YANDEX_SUGGEST_KEY;
    s.src = `https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${mapsKey}${suggestKey ? `&suggest_apikey=${suggestKey}` : ''}`;
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
  const couriersGeoObjectsRef = useRef<any>(null);
  const clickedFromMapRef = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMob = () => setIsMobile(window.innerWidth < 768);
    checkMob(); window.addEventListener("resize", checkMob);
    return () => window.removeEventListener("resize", checkMob);
  }, []);

  const [mobileView, setMobileView] = useState<"split" | "map" | "panels">("split");
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableHeight, setTableHeight] = useState(250);
  const [isDraggingTable, setIsDraggingTable] = useState(false);

  const [showCourierNames, setShowCourierNames] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [showCouriers, setShowCouriers] = useState(false);
  const [showHomes, setShowHomes] = useState(false); 

  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
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

  const [mapReady, setMapReady] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: 'asc' | 'desc' }>({ key: 'changedAt', dir: 'desc' });

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [routeTab, setRouteTab] = useState<"map" | "list">("map");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkCourier, setBulkCourier] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [routeType, setRouteType] = useState<"auto" | "mt">("auto");
  const [returnToBase, setReturnToBase] = useState(true);

  const [routeTabMode, setRouteTabMode] = useState<"new" | "current">("new");
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);

  const [routeLegs, setRouteLegs] = useState<string[]>([]);
  const [routeLegSeconds, setRouteLegSeconds] = useState<number[]>([]);


  const handleQuickStatusChange = async (id: string, newStatus: string) => {
    // Оптимистичное обновление UI: сразу меняем статус заказа в локальном стейте
    setOrders((prev: any[]) =>
      prev.map(o => o.id === id ? {
        ...o,
        status: newStatus,
        changedAt: new Date().toISOString(),
        // 🔥 Если статус "В пути", оптимистично ставим время выезда
        pickedUpAt: newStatus === "IN_DELIVERY" && !o.pickedUpAt ? new Date().toISOString() : o.pickedUpAt
      } : o)
    );
    
    try {
      // Отправляем запрос на сервер
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!res.ok) throw new Error("Ошибка обновления статуса");
      
      // Тихо обновляем данные в фоне
      fetchData(); 
    } catch (e) {
      alert("Ошибка изменения статуса");
      fetchData(); // Откат в случае ошибки
    }
  };
  const [routeTotals, setRouteTotals] = useState<{ time: string, dist: string } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [departureAdvice, setDepartureAdvice] = useState<string | null>(null);

  useEffect(() => {
    const fd = localStorage.getItem("fo_filterDate");
    if (fd) setFilterDate(fd);
    const to = localStorage.getItem("fo_tableOpen");
    if (to !== null) setTableOpen(to === "true");
    const lv = localStorage.getItem("fo_listVisible");
    if (lv !== null) setIsListVisible(lv === "true");
    const dv = localStorage.getItem("fo_detailVisible");
    if (dv !== null) setIsDetailVisible(dv === "true");
  }, []);

  useEffect(() => { localStorage.setItem("fo_filterDate", filterDate); }, [filterDate]);
  useEffect(() => { localStorage.setItem("fo_tableOpen", String(tableOpen)); }, [tableOpen]);
  useEffect(() => { localStorage.setItem("fo_listVisible", String(isListVisible)); }, [isListVisible]);
  useEffect(() => { localStorage.setItem("fo_detailVisible", String(isDetailVisible)); }, [isDetailVisible]);

  useEffect(() => {
    if (selectedId) {
      setTimeout(() => {
        const card = document.getElementById(`card-${selectedId}`);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        const row = document.getElementById(`row-${selectedId}`);
        if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [selectedId, isListVisible, isDetailVisible, tableOpen]);

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
  }, [isListVisible, isDetailVisible, tableOpen, tableHeight, mobileView, isBulkMode, routeTab]);

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
      return { id: c.id, value: String(c.id), label };
    });
  })();

  const courierOptions = [{ value: "ALL", label: "Все курьеры" }, { value: "UNASSIGNED", label: "Не назначен" }, ...sortedCouriers];

  const dateAndStatusOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    if (oDate !== filterDate) return false;
    if (filterStatus !== "ALL" && o.status !== filterStatus) return false;
    if (filterCourier !== "ALL") {
      if (filterCourier === "UNASSIGNED") {
        if (o.courierId) return false;
      } else {
        if (String(o.courierId) !== filterCourier) return false;
      }
    }
    return true;
  });

  const selected = orders.find(o => o.id === selectedId) ?? null;
  
  // 🔥 ИСПРАВЛЕНИЕ: Жестко игнорируем "Самовывоз" для невалидных адресов
  const invalid = dateAndStatusOrders.filter(o => o.isInvalid && !/самовывоз/i.test(o.address || ""));
  
  const filtered = selectedSlots.length === 0 ? dateAndStatusOrders : dateAndStatusOrders.filter(o => {
    if (!o.slotFrom) return false;
    const exact = SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo);
    if (exact) return selectedSlots.includes(exact.label);
    const match = SLOTS.find(s => o.slotFrom! > s.from && o.slotFrom! <= s.to);
    return match ? selectedSlots.includes(match.label) : false;
  });

  const sidePanelOrders = [...filtered].sort((a, b) => {
    const getPriority = (o: DashboardOrder) => {
      if (/самовывоз/i.test(o.address || "")) return 6;
      if (o.status === "IN_DELIVERY") return 1;
      if (o.status === "NEW") return 2;
      if (o.status === "ASSIGNED") return 3;
      if (o.status === "DELIVERED") return 4;
      return 5;
    };
    const pA = getPriority(a);
    const pB = getPriority(b);
    if (pA !== pB) return pA - pB;
    const slotA = a.slotFrom || "23:59";
    const slotB = b.slotFrom || "23:59";
    return slotA.localeCompare(slotB);
  });

  const MAP_EXCLUDED_STATUSES = ["CANCELLED", "RETURNED"];
  const filteredForMap = filtered.filter(o => !MAP_EXCLUDED_STATUSES.includes(o.status) && !/Самовывоз/i.test(o.address ?? ""));

  const tableOrders = [...filtered].sort((a, b) => {
    let valA: any = (a as any)[sortConfig.key] ?? "";
    let valB: any = (b as any)[sortConfig.key] ?? "";
    if (sortConfig.key === "changedAt") {
      valA = new Date(a.changedAt || a.updatedAt || 0).getTime();
      valB = new Date(b.changedAt || b.updatedAt || 0).getTime();
    } else if (sortConfig.key === "crmCreatedAt") {
      valA = new Date(a.crmCreatedAt || 0).getTime();
      valB = new Date(b.crmCreatedAt || 0).getTime();
    }
    if (valA < valB) return sortConfig.dir === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: string) => { setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' })); };

  useEffect(() => {
    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;
      const map = new window.ymaps.Map(mapRef.current, { center: [STORE_LAT, STORE_LNG], zoom: 11, controls: ["zoomControl"] }, {});
      map.events.add('boundschange', (e: any) => { if (e.get('newZoom') !== e.get('oldZoom')) setCurrentZoom(e.get('newZoom')); });

      const clusterer = new window.ymaps.Clusterer({ clusterIconLayout: "default#pieChart", clusterIconPieChartRadius: 20 });
      map.geoObjects.add(clusterer);

      const courierColl = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(courierColl);

      const storePm = new window.ymaps.Placemark([STORE_LAT, STORE_LNG], { hintContent: "БАЗА: Большой Афанасьевский переулок, 39", iconCaption: "База" }, { preset: 'islands#blackDotIcon' });
      map.geoObjects.add(storePm as any);

      ymapRef.current = map;
      clustererRef.current = clusterer;
      couriersGeoObjectsRef.current = courierColl;
      setMapReady(true);
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
      if (dir === 'up' && index > 0) [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      else if (dir === 'down' && index < arr.length - 1) [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      return arr;
    });
  };

  const optimizeRoute = () => {
    setBulkSelectedIds(prev => {
      const validOrders = prev.map(id => orders.find(o => o.id === id)).filter(Boolean) as DashboardOrder[];
      const dist = (lat1: number, lng1: number, lat2: number, lng2: number) => Math.sqrt(Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2));

      let currentLat = STORE_LAT;
      let currentLng = STORE_LNG;
      const sorted: string[] = [];
      const remaining = [...validOrders];

      while (remaining.length > 0) {
        remaining.sort((a, b) => {
          const timeA = a.slotFrom || "23:59";
          const timeB = b.slotFrom || "23:59";
          if (timeA !== timeB) return timeA.localeCompare(timeB);

          const dA = (a.lat && a.lng) ? dist(currentLat, currentLng, a.lat, a.lng) : Infinity;
          const dB = (b.lat && b.lng) ? dist(currentLat, currentLng, b.lat, b.lng) : Infinity;
          return dA - dB;
        });

        const next = remaining.shift()!;
        sorted.push(next.id);
        if (next.lat && next.lng) {
          currentLat = next.lat;
          currentLng = next.lng;
        }
      }
      return sorted;
    });
  };

  useEffect(() => {
    if (!mapReady) return;
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

    const placemarks = filteredForMap.filter(o => (o.lat && o.lng) || (o.id === selectedId && previewGeo)).map(order => {
      const isSelected = selectedId === order.id;
      const bulkIndex = bulkSelectedIds.indexOf(order.id);
      const isBulkSelected = bulkIndex !== -1;
      const lat = isSelected && previewGeo ? previewGeo.lat : order.lat!;
      const lng = isSelected && previewGeo ? previewGeo.lng : order.lng!;
      const color = slotColor(order as any);

      const displayTime = showTime && currentZoom >= 13 && !!order.slotRaw && selectedSlots.length === 0;
      const displayName = showCourierNames && !!order.courier;
      const slotLabelText = order.slotRaw ? order.slotRaw.replace("с ", "").replace(" до ", "-") : "";

      let pm;

      if (displayTime) {
        let pinColor = isSelected ? (previewGeo ? '#9ca3af' : '#facc15') : color;
        if (isBulkMode && routeTabMode === "new") {
          pinColor = isBulkSelected ? '#1a9e5c' : '#d1d5db';
        }

        const finalSlotLabel = (isBulkMode && routeTabMode === "new" && isBulkSelected) ? `${bulkIndex + 1}. ${slotLabelText}` : slotLabelText;

        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, hintContent: order.address ?? "—",
          pinColor, slotLabel: finalSlotLabel, showLabel: displayName, labelText: order.courier ?? "",
        }, { iconLayout: StretchyLayout, iconShape: { type: "Rectangle", coordinates: [[-40, -40], [40, 20]] }, iconOffset: [-15, -26] });
      } else {
        let preset = 'islands#dotIcon';
        let iconContent = undefined;

        if (isBulkMode && routeTabMode === "new") {
          if (isBulkSelected) { preset = 'islands#greenIcon'; iconContent = `${bulkIndex + 1}`; }
          else { preset = 'islands#grayCircleDotIcon'; }
        } else {
          if (isSelected) preset = previewGeo ? "islands#grayDotIcon" : "islands#redDotIcon";
        }

        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId, hintContent: order.address ?? "—",
          iconCaption: (displayName) ? order.courier : undefined, iconContent
        }, { preset, iconColor: (isBulkMode || isSelected) ? undefined : color });
      }

      pm.events.add("click", () => {
        if (isBulkMode && routeTabMode === "new") {
          toggleBulkSelect(order.id);
        } else {
          clickedFromMapRef.current = true;
          setSelectedId(order.id);
          if (!isMobile) { setIsListVisible(true); setIsDetailVisible(true); }
          else setMobileView("split");
        }
      });
      return pm;
    });

    if (placemarks.length > 0) clusterer.add(placemarks as any);
  }, [filteredForMap, selectedId, previewGeo, currentZoom, selectedSlots, isBulkMode, bulkSelectedIds, showTime, showCourierNames, isMobile, mapReady, routeTabMode]);

  useEffect(() => {
    if (!mapReady || !couriersGeoObjectsRef.current) return;
    const coll = couriersGeoObjectsRef.current;
    coll.removeAll();
    if (typeof window === "undefined" || !window.ymaps) return;

    dbCouriers.forEach(c => {
      const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
      const isLive = c.lat && c.lng && c.locationUpdatedAt && (Date.now() - new Date(c.locationUpdatedAt).getTime()) < ONLINE_THRESHOLD_MS;

      if (showCouriers && c.lat && c.lng) {
        const pm = new window.ymaps.Placemark([c.lat, c.lng], {
          balloonContentHeader: c.fullName, balloonContentBody: isLive ? "Текущее местоположение" : "Был недавно",
          hintContent: `${c.fullName} (${isLive ? "в сети" : "офлайн"})`, iconCaption: c.fullName,
        }, { preset: isLive ? "islands#blueWalkingIcon" : "islands#grayWalkingIcon" });
        coll.add(pm as any);
      }

      if (showHomes && c.homeLat && c.homeLng) {
        const pm = new window.ymaps.Placemark([c.homeLat, c.homeLng], {
          balloonContentHeader: c.fullName, balloonContentBody: "Домашний адрес",
          hintContent: `${c.fullName} (Дом)`, iconCaption: c.fullName,
        }, { preset: "islands#grayHomeIcon" });
        coll.add(pm as any);
      }
    });
  }, [dbCouriers, showCouriers, showHomes, mapReady]);

  const existingRoutes = useMemo(() => {
    const routesMap = new Map<string, any>();
    orders.forEach((o) => {
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
      if (o.route && oDate === filterDate) {
        if (!routesMap.has(o.route.id)) {
          routesMap.set(o.route.id, {
            id: o.route.id, 
            name: o.route.name, 
            link: o.route.link, 
            date: o.route.date,
            isDraft: o.route.isDraft, // 🔥 ТЯНЕМ ИЗ БД
            orders: [], 
            courierId: o.courierId,
            updatedAt: o.route.updatedAt || o.changedAt || o.createdAt
          });
        }
        routesMap.get(o.route.id).orders.push(o);
      }
    });

    routesMap.forEach(route => {
      route.orders.sort((a: DashboardOrder, b: DashboardOrder) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
    });

    return Array.from(routesMap.values()).sort((a, b) => b.name.localeCompare(a.name));
  }, [orders, filterDate]);

  useEffect(() => {
    if (selectedId && ymapRef.current && !previewGeo && !isBulkMode) {
      const order = orders.find(o => o.id === selectedId);
      if (order?.lat && order?.lng) {
        if (!clickedFromMapRef.current) {
          ymapRef.current.setCenter([order.lat, order.lng], undefined, { duration: 500 });
        }
        clickedFromMapRef.current = false;
      }
    }
  }, [selectedId, isBulkMode, orders, previewGeo]);

  const selectedRouteOrders = useMemo(() => {
    return bulkSelectedIds.map(id => orders.find(o => o.id === id)).filter(Boolean) as DashboardOrder[];
  }, [bulkSelectedIds, orders]);

  useEffect(() => {
    if (!isBulkMode || routeTabMode !== "new" || (isMobile && routeTab !== "list") || bulkSelectedIds.length === 0) {
      setRouteLegs([]); setRouteTotals(null); setDepartureAdvice(null); return;
    }

    const ymapsAny = window.ymaps as any;
    if (!ymapsAny || !ymapsAny.multiRouter) return;

    const validOrders = bulkSelectedIds
      .map(id => orders.find(o => o.id === id))
      .filter(o => o && o.lat && o.lng) as DashboardOrder[];

    if (validOrders.length === 0) return;

    const points = [[STORE_LAT, STORE_LNG], ...validOrders.map(o => [o.lat!, o.lng!])];
    if (returnToBase) points.push([STORE_LAT, STORE_LNG]);

    setIsCalculatingRoute(true); setDepartureAdvice(null);
    let multiRoute: any = null;

    const timer = setTimeout(() => {
      multiRoute = new ymapsAny.multiRouter.MultiRoute({
        referencePoints: points, params: { routingMode: routeType === 'mt' ? 'masstransit' : 'auto' }
      }, { boundsAutoApply: false });

      multiRoute.model.events.add('requestsuccess', () => {
        const activeRoute = multiRoute.getActiveRoute();
        if (!activeRoute) { setIsCalculatingRoute(false); return; }

        const cleanHtml = (str: string) => str ? str.replace(/&#160;/g, " ") : "";

        // 🔥 1. БЕРЕМ ВРЕМЯ С УЧЕТОМ ПРОБОК (durationInTraffic)
        const routeDuration = activeRoute.properties.get("durationInTraffic") || activeRoute.properties.get("duration");
        
        setRouteTotals({
          time: cleanHtml(routeDuration?.text || "—"),
          dist: cleanHtml(activeRoute.properties.get("distance")?.text || "—"),
        });

        const legsArr: string[] = [];
        let earliestDeadline: { externalId: string; slotFrom: string; pickupDeadlineMs: number } | null = null;

        activeRoute.getPaths().each((path: any, idx: number) => {
          // 🔥 2. ДЛЯ КАЖДОГО ОТРЕЗКА ТОЖЕ БЕРЕМ ПРОБКИ
          const legDuration = path.properties.get("durationInTraffic") || path.properties.get("duration");
          legsArr.push(cleanHtml(legDuration?.text || "—"));

          if (idx === 0 && validOrders.length > 0) {
            const order = validOrders[0];
            const legSeconds = legDuration?.value || 0;
            const legToFirstPointMs = (legSeconds + 5 * 60) * 1000; 

            if (order.slotFrom) {
              const [hh, mm] = order.slotFrom.split(":").map(Number);
              if (!isNaN(hh) && !isNaN(mm)) {
                const slotStartMs = new Date().setHours(hh, mm, 0, 0);
                earliestDeadline = {
                  externalId: order.externalId ?? order.crmId,
                  slotFrom: order.slotFrom,
                  pickupDeadlineMs: slotStartMs - legToFirstPointMs,
                };
              }
            }
          }
        });

        if (earliestDeadline) {
          const ed = earliestDeadline as { externalId: string; slotFrom: string; pickupDeadlineMs: number };
          const deadlineDate = new Date(ed.pickupDeadlineMs);
          const hh = String(deadlineDate.getHours()).padStart(2, "0");
          const mm = String(deadlineDate.getMinutes()).padStart(2, "0");

          // Никаких предупреждений, просто пишем ко скольки нужно выехать
          setDepartureAdvice(`Выехать до ${hh}:${mm} — первый заказ к ${ed.slotFrom} (зак. ${ed.externalId})`);
        } else {
          setDepartureAdvice("Слоты не строгие — выезд в любое время");
        }

        setRouteLegs(legsArr);
        setIsCalculatingRoute(false);
      });
    }, 800);

    return () => { clearTimeout(timer); if (multiRoute) multiRoute.destroy(); };
  }, [bulkSelectedIds, routeType, returnToBase, routeTab, isBulkMode, isMobile]);

  const generateYandexUrl = (ordersToRoute: DashboardOrder[], type: "auto" | "mt", rtb: boolean) => {
    const validOrders = ordersToRoute.filter(o => o.lat && o.lng && !o.isInvalid);
    if (validOrders.length === 0) return null;
    if (validOrders.length > 50) validOrders.length = 50;
    const rtextArr = [STORE_COORDS, ...validOrders.map(o => `${o.lat},${o.lng}`)];
    if (rtb) rtextArr.push(STORE_COORDS);
    return `https://yandex.ru/maps/?rtext=${rtextArr.join("~")}&rtt=${type}`;
  };

  const handleOpenRoute = (ordersToRoute: DashboardOrder[]) => {
    const url = generateYandexUrl(ordersToRoute, routeType, returnToBase);
    if (url) window.open(url, "_blank"); else alert("Нет координат для построения");
  };

  const handleShareRoute = async (ordersToRoute: DashboardOrder[]) => {
    const url = generateYandexUrl(ordersToRoute, routeType, returnToBase);
    if (!url) { alert("Нет координат"); return; }
    try {
      await navigator.clipboard.writeText(url); alert("✅ Ссылка скопирована!");
    } catch {
      const input = document.createElement("input");
      input.value = url; document.body.appendChild(input); input.select(); document.execCommand("copy"); document.body.removeChild(input);
      alert("✅ Ссылка скопирована!");
    }
  };

  // 🔥 Новая функция для полного удаления маршрута
  async function handleDeleteRoute() {
    if (!editingRouteId) return;
    if (!window.confirm("Удалить маршрут полностью? Все точки снова станут свободными.")) return;
    
    setBulkSaving(true);
    try {
      const res = await fetch(`/api/routes/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [], // Пустой массив отвяжет точки на бэкенде
          courierId: bulkCourier,
          oldRouteId: editingRouteId
        })
      });
      if (!res.ok) throw new Error("Ошибка сервера");
      setBulkCourier(""); setBulkSelectedIds([]); setEditingRouteId(null);
      await fetchData();
      alert("✅ Маршрут удален!");
      setRouteTabMode("current"); // Возвращаемся к списку маршрутов
    } catch { alert("Произошла ошибка при удалении"); }
    finally { setBulkSaving(false); }
  }
  async function handleAutoGenerateRoutes() {
    if (!window.confirm("Запустить авто-распределение свободных точек на сегодня?")) return;
    
    setBulkSaving(true);
    try {
      const res = await fetch(`/api/routes/auto-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 🔥 Добавили передачу выбранных слотов (массив строк, например ["10–12", "14–16"])
        body: JSON.stringify({ 
          routeDate: filterDate,
          selectedSlots: selectedSlots 
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка сервера");
      
      await fetchData();
      alert(`✅ Создано маршрутов: ${data.routesCreated}.\n📦 Раскидано точек: ${data.ordersAssigned}.\n⚠️ Осталось нераспределенных в этих слотах: ${data.leftOver}`);
      setRouteTabMode("current");
    } catch (e: any) {
      alert(e.message || "Произошла ошибка при генерации");
    } finally {
      setBulkSaving(false);
    }
  }
 // 🔥 1. Карта статусов (лучше держать её тут, чтобы не было ошибок undefined)
  const ROUTE_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
    NEW: { label: "Новый", color: "#d94040", bg: "#fef2f2" },
    ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
    IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
    DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
    RETURNED: { label: "↩️ Возврат", color: "#d94040", bg: "#fef2f2" },
    CANCELLED: { label: "❌ Отменен", color: "#a8a49c", bg: "#f5f4f0" }
  };

  async function handleBulkAssign(isDraft = false) {
    if (!bulkCourier || bulkSelectedIds.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await fetch(`/api/routes/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: bulkSelectedIds,
          courierId: bulkCourier,
          routeType,
          returnToBase,
          oldRouteId: editingRouteId,
          departureAdvice,
          isDraft // Передаем флаг на сервер
        })
      });
      if (!res.ok) throw new Error("Ошибка сервера");
      setBulkCourier(""); setBulkSelectedIds([]); setEditingRouteId(null);
      await fetchData();
      alert(editingRouteId ? "✅ Изменения в маршруте сохранены!" : "✅ Маршрут создан!");
      setRouteTabMode("new");
    } catch { alert("Произошла ошибка"); }
    finally { setBulkSaving(false); }
  }

  // 🔥 2. Добавили тип (prev: string[])
  const toggleSlot = (label: string) => {
    if (label === "all") setSelectedSlots([]);
    else setSelectedSlots((prev: string[]) => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
  };

  const showLeftPanel = (isListVisible || isDetailVisible) && !isBulkMode;

  const renderRouteListPanel = () => (
    <div style={{ maxWidth: 600, margin: isMobile ? 0 : "0 auto", background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", padding: isMobile ? 16 : 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, color: "#1a1a18" }}>Работа с маршрутами</h2>
        {!isMobile && <button onClick={() => { setIsBulkMode(false); setRouteTab("map"); }} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a8a49c", padding: "0 8px" }}>×</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "#f5f4f0", padding: 4, borderRadius: 10 }}>
        <button
          onClick={() => { setRouteTabMode("new"); setEditingRouteId(null); setBulkSelectedIds([]); setBulkCourier(""); }}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: routeTabMode === "new" ? "#fff" : "transparent", color: routeTabMode === "new" ? "#1a1a18" : "#a8a49c", boxShadow: routeTabMode === "new" ? "0 2px 8px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
        >
          {editingRouteId ? "✏️ Редактирование" : "Новый маршрут"}
        </button>
        <button
          onClick={() => { setRouteTabMode("current"); setEditingRouteId(null); }}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: routeTabMode === "current" ? "#fff" : "transparent", color: routeTabMode === "current" ? "#1a1a18" : "#a8a49c", boxShadow: routeTabMode === "current" ? "0 2px 8px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
        >
          Текущие ({existingRoutes.length})
        </button>
      </div>
      
      <div style={{ marginBottom: 16 }}>
        <button 
          onClick={handleAutoGenerateRoutes} 
          style={{ width: "100%", background: "linear-gradient(135deg, #4a7aff 0%, #7c4dff 100%)", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: "0 4px 12px rgba(124, 77, 255, 0.3)", display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
        >
          ✨ AI Авто-сборка черновиков
        </button>
      </div>

      {routeTabMode === "current" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {existingRoutes.length === 0 && <div style={{ textAlign: "center", color: "#a8a49c", padding: 20 }}>Нет маршрутов на {filterDate}</div>}
          {existingRoutes.map((r: any) => {
            const isDraft = r.isDraft;
            
            // 🔥 3. Безопасный поиск имени курьера через courierOptions
            const courierName = courierOptions.find(c => String(c.value) === String(r.courierId))?.label || "Неизвестен";

            return (
            <div key={r.id} onClick={() => {
              setBulkSelectedIds(r.orders.map((o: any) => o.id));
              setBulkCourier(String(r.courierId));
              setEditingRouteId(r.id);
              setRouteTabMode("new");
            }} style={{ background: "#fafaf8", border: "1px solid #e8e6df", borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all 0.2s" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18", display: "flex", alignItems: "center", gap: 8 }}>
                  {r.name} 
                  {isDraft && <span style={{ background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Черновик</span>}
                  <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 500 }}>изм. {new Date(r.updatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6b6860", marginTop: 4 }}>
                  Курьер: {courierName} · {r.orders.length} точек
                </div>
              </div>
              <div style={{ fontSize: 20, color: "#a8a49c" }}>✏️</div>
            </div>
          )})}
        </div>
      )}

      {routeTabMode === "new" && (
        <>
          {editingRouteId && (
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#4a7aff" }}>Редактирование маршрута</span>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={handleDeleteRoute} disabled={bulkSaving} style={{ background: "none", border: "none", color: "#d94040", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑 Удалить</button>
                <button onClick={() => { setEditingRouteId(null); setBulkSelectedIds([]); setRouteTabMode("current"); }} style={{ background: "none", border: "none", color: "#6b6860", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отменить</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginBottom: 16, background: "#f5f4f0", padding: "6px 8px", borderRadius: 8, alignItems: isMobile ? "stretch" : "center" }}>
            <div style={{ display: "flex", gap: 4, flex: 1 }}>
              <button onClick={() => setRouteType("auto")} style={{ ...s.actionBtn, flex: 1, background: routeType === "auto" ? "#fff" : "transparent", color: routeType === "auto" ? "#1a1a18" : "#a8a49c", boxShadow: routeType === "auto" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚗 На авто</button>
              <button onClick={() => setRouteType("mt")} style={{ ...s.actionBtn, flex: 1, background: routeType === "mt" ? "#fff" : "transparent", color: routeType === "mt" ? "#1a1a18" : "#a8a49c", boxShadow: routeType === "mt" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚌 Транспорт</button>
            </div>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#1a1a18", fontWeight: 600, padding: isMobile ? "4px 6px" : 0 }}>
              <input type="checkbox" checked={returnToBase} onChange={e => setReturnToBase(e.target.checked)} style={{ accentColor: "#4a7aff", width: 16, height: 16 }} />
              Вернуться на базу
            </label>
          </div>

          {routeTotals && (
            <div style={{ fontSize: 13, color: "#1a1a18", background: "#eef3ff", padding: "12px 14px", borderRadius: 8, marginBottom: 16, fontWeight: 600 }}>
              {isCalculatingRoute ? "⏳ Считаем время в пути..." : `🏁 Итого: ~${routeTotals.time} (${routeTotals.dist})`}
              {!isCalculatingRoute && departureAdvice && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#4a7aff", fontWeight: 700 }}>💡 {departureAdvice}</div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexDirection: "column" }}>
            <button onClick={optimizeRoute} style={{ ...s.actionBtn, background: "#f4f7ff", color: "#4a7aff", border: "1px solid #c9d8ff" }}>✨ Умная оптимизация (Время + Расстояние)</button>
            {selectedRouteOrders.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleOpenRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "#fff", color: "#1a1a18", border: "1px solid #e8e6df" }}>🗺️ Открыть в Яндексе</button>
                <button onClick={() => handleShareRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "#fff", color: "#1a1a18", border: "1px solid #e8e6df" }}>🔗 Скопировать ссылку</button>
              </div>
            )}
          </div>

          <div style={{ background: "#fafaf8", padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Курьер</div>
            <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
              <CourierSearchSelect value={bulkCourier} onChange={setBulkCourier} options={courierOptions.map(c => ({ value: String(c.value), label: c.label }))} />
              
              <button style={{ ...s.actionBtn, background: bulkCourier && bulkSelectedIds.length > 0 ? '#e8e6df' : '#f5f4f0', color: bulkCourier && bulkSelectedIds.length > 0 ? '#1a1a18' : '#a8a49c', whiteSpace: 'nowrap' }} disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving} onClick={() => handleBulkAssign(true)}>
                📝 В черновик
              </button>

              <button style={{ ...s.actionBtn, width: isMobile ? "100%" : 120, background: bulkCourier && bulkSelectedIds.length > 0 ? '#4a7aff' : '#e8e6df', color: bulkCourier && bulkSelectedIds.length > 0 ? '#fff' : '#a8a49c' }} disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving} onClick={() => handleBulkAssign(false)}>
                {bulkSaving ? "..." : (editingRouteId ? "Сохранить" : "Создать")}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#a8a49c", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Очередь доставки ({bulkSelectedIds.length})</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            
            {/* 🔥 БЛОК РАСЧЕТА С УЧЕТОМ РЕАЛЬНОГО ВЫЕЗДА */}
            {(() => {
              const parseYandexTimeMs = (text: string) => {
                if (!text || text === "—") return 0;
                let ms = 0;
                const hMatch = text.match(/(\d+)\s*ч/);
                if (hMatch) ms += parseInt(hMatch[1], 10) * 3600000;
                const mMatch = text.match(/(\d+)\s*мин/);
                if (mMatch) ms += parseInt(mMatch[1], 10) * 60000;
                
                if (routeType === "auto") return ms + (12 * 60 * 1000); 
                else return ms + (3 * 60 * 1000);
              };

              const etas: Record<string, { type: string, timeStr: string, color: string }> = {};
              let currentRunningMs = Date.now();
              let foundFirstActive = false;

              const hasStarted = selectedRouteOrders.some((o: any) => o.status === "IN_DELIVERY" || o.status === "DELIVERED");
              
              // 🔥 Ищем фактическое время выезда (самое раннее pickedUpAt)
              const pickedUpTimes = selectedRouteOrders.map((o: any) => o.pickedUpAt).filter(Boolean);
              const actualDepartureMs = pickedUpTimes.length > 0 ? Math.min(...pickedUpTimes.map((d: string) => new Date(d).getTime())) : null;

              if (hasStarted && actualDepartureMs) {
                 // 🎯 МАРШРУТ НАЧАТ: отсчет времени жестко от реального выезда с базы!
                 currentRunningMs = actualDepartureMs;
              } else if (!hasStarted && selectedRouteOrders.length > 0 && routeLegs.length > 0) {
                 // Маршрут не начат: считаем плановый выезд назад от слота первой точки
                 const firstOrder = selectedRouteOrders[0];
                 if (firstOrder.slotFrom) {
                   const [hh, mm] = firstOrder.slotFrom.split(":").map(Number);
                   if (!isNaN(hh) && !isNaN(mm)) {
                     const slotStartMs = new Date().setHours(hh, mm, 0, 0);
                     const legToFirstPointMs = parseYandexTimeMs(routeLegs[0]) + (5 * 60 * 1000);
                     const plannedDepartureMs = slotStartMs - legToFirstPointMs;
                     if (plannedDepartureMs > currentRunningMs) currentRunningMs = plannedDepartureMs;
                   }
                 }
              }

              // 🔥 Формируем плашку выезда
              const departureUI = actualDepartureMs ? (
                <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 800, marginBottom: 8, paddingLeft: 8, display: "flex", alignItems: "center", gap: 6, background: "#fffbeb", padding: "8px 12px", borderRadius: 8, border: "1px solid #fde68a" }}>
                  📦 Забрал заказы с базы в {new Date(actualDepartureMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                </div>
              ) : null;

              selectedRouteOrders.forEach((o: any, index: number) => {
                const legMs = parseYandexTimeMs(routeLegs[index]);

                if (o.status === "DELIVERED") {
                  const t = o.changedAt || o.updatedAt;
                  if (t) {
                    currentRunningMs = new Date(t).getTime(); 
                    const timeStr = new Date(currentRunningMs).toLocaleTimeString('ru', {hour: '2-digit', minute:'2-digit'});
                    etas[o.id] = { type: 'DELIVERED', timeStr, color: "#10b981" };
                  } else {
                    etas[o.id] = { type: 'DELIVERED', timeStr: "—", color: "#10b981" };
                  }
                } else if (o.status === "CANCELLED" || o.status === "RETURNED") {
                  etas[o.id] = { type: 'SKIPPED', timeStr: "—", color: "#a8a49c" };
                } else {
                  if (!foundFirstActive) {
                    foundFirstActive = true;
                    // Дорога только от базы (или от прошлой доставленной точки)
                    currentRunningMs += legMs; 
                  } else {
                    // Передача прошлого заказа (4 мин) + дорога до следующей точки
                    currentRunningMs += (4 * 60 * 1000) + legMs; 
                  }
                  
                  const timeStr = new Date(currentRunningMs).toLocaleTimeString('ru', {hour: '2-digit', minute:'2-digit'});
                  let color = "#4a7aff";
                  if (o.status === "IN_DELIVERY") color = "#f59e0b";
                  etas[o.id] = { type: o.status, timeStr, color };
                }
              });

              return (
                <>
                  {departureUI}
                  {selectedRouteOrders.map((o: any, index: number) => {
                     const color = slotColor(o);
                     const st = ROUTE_STATUS_MAP[o.status] || ROUTE_STATUS_MAP.NEW;
                     const etaInfo = etas[o.id] || { type: "NEW", timeStr: "—", color: "#4a7aff" };

                return (
                  <React.Fragment key={o.id}>
                    {routeLegs[index] && (
                      <div style={{ fontSize: 12, color: etaInfo.color, paddingLeft: 46, paddingBottom: 6, fontWeight: 700 }}>
                        {etaInfo.type === 'DELIVERED' ? `✅ Доставлен в ${etaInfo.timeStr}` :
                         etaInfo.type === 'SKIPPED' ? `❌ Отменен / Возврат` :
                         `↓ Ожидается в ${etaInfo.timeStr} (в пути ${routeLegs[index]})`}
                      </div>
                    )}

                    <div style={{ padding: "10px 12px 10px 16px", background: o.status === "IN_DELIVERY" ? "#fffbeb" : "#fff", border: "1px solid #e8e6df", borderRadius: 8, display: "flex", gap: 12, alignItems: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, background: color }} />
                      
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button disabled={index === 0} onClick={() => moveBulkItem(index, 'up')} style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, fontSize: 11, padding: 2, color: "#6b6860" }}>▲</button>
                        <button disabled={index === selectedRouteOrders.length - 1} onClick={() => moveBulkItem(index, 'down')} style={{ background: "none", border: "none", cursor: index === selectedRouteOrders.length - 1 ? "default" : "pointer", opacity: index === selectedRouteOrders.length - 1 ? 0.3 : 1, fontSize: 11, padding: 2, color: "#6b6860" }}>▼</button>
                      </div>
                      
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>
                      
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.address}</div>
                        <div style={{ fontSize: 11, color: "#a8a49c", marginTop: 2 }}>
                          Слот: <span style={{ color, fontWeight: 700 }}>{o.slotRaw}</span> · {o.externalId ?? o.crmId}
                        </div>
                        
                        <select 
                          value={o.status} 
                          onChange={(e) => handleQuickStatusChange(o.id, e.target.value)}
                          style={{ background: st.bg, color: st.color, border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, outline: "none", cursor: "pointer", marginTop: 6, display: "block" }}
                        >
                          <option value="NEW">Новый</option>
                          <option value="ASSIGNED">Назначен</option>
                          <option value="IN_DELIVERY">🚀 В пути</option>
                          <option value="DELIVERED">✅ Доставлен</option>
                          <option value="RETURNED">↩️ Возврат</option>
                          <option value="CANCELLED">❌ Отменен</option>
                        </select>

                      </div>
                      <button onClick={() => toggleBulkSelect(o.id)} title="Убрать из маршрута" style={{ background: "none", border: "none", color: "#d94040", cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
                    </div>
                    </React.Fragment>
                );
              })} 
              {/* 🔥 ЗАКРЫВАЕМ .map */}
              
            </>
          ); 
          {/* 🔥 ЗАКРЫВАЕМ return и Fragment */}

        })()}
        {/* 🔥 КОНЕЦ БЛОКА РАСЧЕТА */}

            {routeLegs[selectedRouteOrders.length] && returnToBase && (
              <div style={{ fontSize: 11, color: "#a8a49c", paddingLeft: 46, paddingBottom: 6, paddingTop: 4 }}>
                ↓ {routeLegs[selectedRouteOrders.length]} возврат на базу
              </div>
            )}
            {selectedRouteOrders.length === 0 && <div style={{ fontSize: 13, color: "#a8a49c", textAlign: "center", padding: 20 }}>Отметьте точки на карте</div>}
          </div>
        </>
      )}
    </div>
  );
  return (
    <div style={isMobile ? sm.app : s.app}>
      <div style={isMobile ? sm.topbar : s.topbar}>
        <Link href="/about" style={{ textDecoration: "none" }}>
          <div style={s.logo}>
            <img src="/favicon.svg" alt="Logo" style={{ width: 22, height: 22 }} />
            {!isMobile && "EventWave"}
          </div>
        </Link>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>
          ≡ Заказы
          <span style={{ background: '#eef3ff', color: '#4a7aff', padding: '1px 6px', borderRadius: 10, marginLeft: 6, fontSize: 10, fontWeight: 700 }}>
            {filtered.length}
          </span>
        </button>
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
          {isBulkMode ? "✕ Маршруты" : "📍 Маршруты"}
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
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showCouriers} onChange={e => setShowCouriers(e.target.checked)} />Курьеры
            </label>
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={showHomes} onChange={e => setShowHomes(e.target.checked)} />Дом
            </label>
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={showCourierNames} onChange={e => setShowCourierNames(e.target.checked)} /> Имена</label>
            <label style={{ fontSize: 11, color: '#6b6860', display: 'flex', gap: 4, cursor: 'pointer' }}><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} /> Время</label>
          </div>
        )}
        {invalid.length > 0 && <button style={s.alertBadge} onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>⚠ {!isMobile && `${invalid.length}`}</button>}
        {!isMobile && lastSync && <span style={s.syncLabel}>обновлено {lastSync}</span>}
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
          <span style={{ fontSize: 12 }}>
            <b>{invalid.length} заказов</b> с проблемными адресами —{" "}
            {invalid.map((o, i) => (
              <span key={o.id}>
                <span style={s.invalidBannerLink} onClick={() => { setSelectedId(o.id); setIsDetailVisible(true); }}>{o.externalId ?? o.crmId}</span>{i < invalid.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
          <button style={s.invalidBannerClose} onClick={() => setDismissedInvalid(true)}>✕</button>
        </div>
      )}

      {isMobile && !isBulkMode && (
        <div style={{ display: "flex", padding: "6px 10px", background: "#f5f4f0", gap: 6, flexShrink: 0, borderBottom: "1px solid #e8e6df" }}>
          <ViewToggleBtn active={mobileView === "map"} onClick={() => setMobileView("map")}>🗺️ Карта</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "split"} onClick={() => setMobileView("split")}>Вместе</ViewToggleBtn>
          <ViewToggleBtn active={mobileView === "panels"} onClick={() => setMobileView("panels")}>📋 Список</ViewToggleBtn>
        </div>
      )}
      {isMobile && isBulkMode && (
        <div style={{ display: "flex", padding: "8px 10px", background: "#fff", gap: 8, flexShrink: 0, borderBottom: "1px solid #e8e6df", zIndex: 10 }}>
          <button onClick={() => setRouteTab("map")} style={{ ...s.routeTabBtn, flex: 1, background: routeTab === "map" ? "#eef3ff" : "#fff", color: routeTab === "map" ? "#4a7aff" : "#6b6860" }}>📍 Точки на карте</button>
          <button onClick={() => setRouteTab("list")} style={{ ...s.routeTabBtn, flex: 1, background: routeTab === "list" ? "#eef3ff" : "#fff", color: routeTab === "list" ? "#4a7aff" : "#6b6860" }}>📋 Управление</button>
        </div>
      )}

      <div style={isMobile ? sm.body : s.body}>
        {!isMobile && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {((isListVisible || isDetailVisible) && !isBulkMode) && (
              <div style={s.leftPanel}>
                {isListVisible && (
                  <div style={{ ...s.cardsSection, flex: (isDetailVisible && selected) ? "0 0 50%" : 1, borderBottom: (isDetailVisible && selected) ? "1px solid #e8e6df" : "none" }}>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionTitle}>Заказы</span>
                      <span style={s.countBadge}>{filtered.length}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => setIsListVisible(false)} style={s.panelToggleArrow}>◀</button>
                    </div>
                    <div style={s.cardsList}>
                      {loading ? <div style={s.empty}>Загрузка...</div> : sidePanelOrders.length === 0 ? <div style={s.empty}>Заказов нет</div> : sidePanelOrders.map(o =>
                        <OrderCard key={o.id} order={o} selected={selectedId === o.id} isBulkMode={isBulkMode} isBulkSelected={bulkSelectedIds.includes(o.id)} onSelect={() => {
                          if (isBulkMode) toggleBulkSelect(o.id);
                          else { const newId = selectedId === o.id ? null : o.id; setSelectedId(newId); setIsDetailVisible(!!newId); }
                        }} />
                      )}
                    </div>
                  </div>
                )}
                {(isDetailVisible && selected) && (
                  <div style={{ ...s.detailSection, flex: isListVisible ? "0 0 50%" : 1 }}>
                    <OrderDetail selected={selected as any} couriers={sortedCouriers} onClose={() => { setSelectedId(null); setIsDetailVisible(false); }} onUpdateSuccess={fetchData} onPreviewGeo={(geo) => { setPreviewGeo(geo); if (geo && ymapRef.current) ymapRef.current.setCenter([geo.lat, geo.lng], 15, { duration: 400 }); }} fixingAI={fixingAI} setFixingAI={setFixingAI} />
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, position: 'relative', display: "flex", flexDirection: "row", minWidth: 0 }}>

              {isBulkMode && (
                <div style={{ width: 600, flexShrink: 0, background: "#f5f4f0", borderRight: "1px solid #e8e6df", zIndex: 10, display: "flex", flexDirection: "column" }}>
                  <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: 16 }}>
                    {renderRouteListPanel()}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div ref={mapRef} style={{ flex: 1, width: '100%' }} />
                {!isBulkMode && (
                  <div style={{ position: 'absolute', top: 12, left: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {!isListVisible && <button onClick={() => setIsListVisible(true)} style={s.expandSideBtn} title="Показать список">≡</button>}
                    {(!isDetailVisible && selectedId) && <button onClick={() => setIsDetailVisible(true)} style={{ ...s.expandSideBtn, marginTop: isListVisible ? 0 : 4 }} title="Показать карточку">☰</button>}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {isMobile && (
          <>
            <div
              ref={mapRef}
              style={{
                ...sm.map,
                visibility: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "hidden" : "visible",
                position: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "absolute" : "relative",
                pointerEvents: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "none" : "auto",
                flex: (mobileView === "map" || (isBulkMode && routeTab === "map")) ? 1 : "0 0 45%",
                top: 0, left: 0,
              }}
            />

            {!isBulkMode && (
              <div style={{ ...sm.panelsWrap, display: mobileView === "map" ? "none" : "flex", flex: mobileView === "panels" ? 1 : undefined }}>
                <div style={sm.cardsSection}>
                  <div style={s.cardsList}>
                    {loading ? <div style={s.empty}>Загрузка...</div> : sidePanelOrders.length === 0 ? <div style={s.empty}>Заказов нет</div> : sidePanelOrders.map(o =>
                      <OrderCard key={o.id} order={o} selected={selectedId === o.id} isBulkMode={false} isBulkSelected={false} onSelect={() => setSelectedId(p => p === o.id ? null : o.id)} />
                    )}
                  </div>
                </div>
                {selected && (
                  <div style={sm.detailSection}>
                    <OrderDetail selected={selected as any} couriers={sortedCouriers} onClose={() => setSelectedId(null)} onUpdateSuccess={fetchData} onPreviewGeo={(geo) => { setPreviewGeo(geo); if (geo && ymapRef.current) ymapRef.current.setCenter([geo.lat, geo.lng], 15, { duration: 400 }); }} fixingAI={fixingAI} setFixingAI={setFixingAI} />
                  </div>
                )}
              </div>
            )}

            {isBulkMode && routeTab === "list" && (
              <div style={{ flex: 1, background: "#f5f4f0", padding: 16, overflowY: "auto" }}>
                {renderRouteListPanel()}
              </div>
            )}
          </>
        )}
      </div>

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
                    {[{ label: "Внешний ID", key: "externalId" }, { label: "Время", key: "slotFrom" }, { label: "Адрес", key: "address" }, { label: "Курьер", key: "courier" }, { label: "Сумма", key: "price" }, { label: "Статус", key: "status" }, { label: "Комментарий", key: "comment" }, { label: "Оператор", key: "opComment" }, { label: "Состав", key: "items" }, { label: "Создан", key: "crmCreatedAt" }, { label: "Изменён", key: "changedAt" }].map(col => (
                      <th key={col.key} style={{ ...s.th, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort(col.key)} title={`Сортировать по: ${col.label}`}>
                        {col.label} {sortConfig.key === col.key ? (sortConfig.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, i) => {
                    const color = slotColor(o as any);
                    return (
                      <tr id={`row-${o.id}`} key={o.id} style={{ background: selectedId === o.id ? "#eef3ff" : i % 2 === 0 ? "#fff" : "#fafaf8", cursor: "pointer" }} onClick={() => { setSelectedId(o.id); setIsListVisible(true); setIsDetailVisible(true); }}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ ...s.statusDot, background: color }} /><span style={{ fontFamily: "monospace", fontSize: 10, color: "#a8a49c" }}>{o.externalId ?? o.crmId}</span></td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color }}>{o.slotRaw ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 220 }}>{o.address ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{o.courier ?? <span style={{ color: "#d94040" }}>—</span>}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>{o.price ? `${o.price} ₽` : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "#6b6860" }}>{o.comment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 120, maxWidth: 180, color: "#4a7aff" }}>{o.opComment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 220, color: "#6b6860" }}>{o.items ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "#a8a49c", fontSize: 10 }}>{o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: o.changedAt ? "#1a1a18" : "#a8a49c", fontSize: 10 }}>{(o.changedAt || o.updatedAt) ? new Date(o.changedAt || o.updatedAt!).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 🔥 ИСПРАВЛЕНИЕ: Жестко чистим куку перед логаутом */}
      {profileOpen && (
        <div style={{ position: "fixed", top: 52, right: 8, zIndex: 200 }}>
        <ProfilePanel 
          onClose={() => setProfileOpen(false)} 
          onLogout={async () => {
            // 🔥 ИСПРАВЛЕНО: Делаем запрос на сервер для удаления HttpOnly куки
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }} 
        />
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
    <div id={`card-${order.id}`} style={{ ...s.card, ...(selected || isBulkSelected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
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

function CourierSearchSelect({ value, onChange, options }: { value: string, onChange: (v: string) => void, options: { value: string | number, label: string }[] }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || "— Выберите курьера —";

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", background: "#fff", fontSize: 13, color: value ? "#1a1a18" : "#a8a49c", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%", fontWeight: 600 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
        <span style={{ fontSize: 10, color: "#a8a49c", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </div>

      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid #e8e6df", borderRadius: 10, boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", zIndex: 500, maxHeight: 280, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px", borderBottom: "1px solid #f0efe9", background: "#fafaf8" }}>
            <input autoFocus placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
            <div onClick={() => { onChange(""); setOpen(false); setSearch(""); }} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", color: !value ? "#4a7aff" : "#a8a49c", background: !value ? "#f4f7ff" : "transparent" }}>— Выберите курьера —</div>
            {filtered.map(o => (
              <div key={o.value} onClick={() => { onChange(String(o.value)); setOpen(false); setSearch(""); }} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f5f4f0", color: String(o.value) === String(value) ? "#4a7aff" : "#1a1a18", background: String(o.value) === String(value) ? "#f4f7ff" : "transparent", fontWeight: String(o.value) === String(value) ? 700 : 500 }}>
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "#a8a49c" }}>Не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0, zIndex: 10, position: "relative", overflowX: "auto" },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, minWidth: "max-content", marginRight: "auto" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  datePicker: { padding: "4px 8px", borderRadius: 6, border: "1px solid #e8e6df", fontSize: 11, outline: "none", color: "#1a1a18", background: "#fff", marginLeft: 8 },
  nativeSelect: { height: 28, padding: "0 8px", borderRadius: 7, border: "1px solid #e0dfd7", fontSize: 11, fontWeight: 500, outline: "none", cursor: "pointer", background: "#fff", color: "#1a1a18", maxWidth: 120 },
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