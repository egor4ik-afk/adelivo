// src/components/DashboardClient.tsx
"use client";
import React, { useState, useEffect, useCallback, useRef, Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ProfilePanel } from "./ProfilePanel";
import { AppMenu } from "./layout/AppMenu";
import { ErrorBoundary } from "./ErrorBoundary";
import { OrderDetail } from "./OrderDetail";
import { STATUS_OPTIONS, STATUS_LABELS, SLOTS, slotColor } from "@/lib/constants";
import Link from "next/link";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ru } from "date-fns/locale";
import { MiddlewareReturn } from "@floating-ui/core";
import { MiddlewareState } from "@floating-ui/dom";
import { getCity } from "@/lib/cities";

// Координат по умолчанию больше нет. Точка старта маршрута — база магазина
// из настроек компании, а если она не заполнена — центр города магазина
// из cities.ts. Раньше здесь лежал адрес Банча на Пресне и подставлялся
// всем: воронежский маршрут строился из Москвы.

interface User { id: string; email: string; role: string; avatarUrl?: string | null; firstName?: string | null; lastName?: string | null; isSuperAdmin?: boolean; }
interface DbCourier {
  id: number; fullName: string; isActive: boolean; shifts: { date: string, startTime?: string, endTime?: string }[];
  lat?: number | null; lng?: number | null;
  homeLat?: number | null; homeLng?: number | null;
  locationUpdatedAt?: string | null;
  isAuto?: boolean;
  priority?: number; // 🔥 ДОБАВЛЯЕМ ЭТУ СТРОКУ
}
// Кастомная кнопка для календаря, чтобы она выглядела как остальные фильтры
const CustomDateInput = React.forwardRef(({ value, onClick }: any, ref: any) => (
  <button onClick={onClick} ref={ref} style={{
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
  }}>
    📅 {value}
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

export interface DashboardOrder {
  // Нужен, чтобы понять, от базы какого магазина строить маршрут
  shop?: string | null;
  id: string; crmId: string; externalId?: string | null; status: string;
  address?: string | null; lat?: number | null; lng?: number | null;
  price?: number | null; wrongPrice?: boolean; courierId?: number | null; courier?: string | null;
  comment?: string | null; opComment?: string | null; items?: string | null;
  slotFrom?: string | null; slotTo?: string | null; slotRaw?: string | null;
  deliveryDate?: string | null; crmCreatedAt?: string | null;
  isInvalid?: boolean; invalidReason?: string | null;
  routeId?: string | null; routeOrder?: number | null; route?: any;
  createdAt?: string; updatedAt?: string; changedAt?: string;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  eta?: string | null;
  recipientPhone?: string | null;
}

const parseTime = (timeStr: string | null | undefined, fallback = "00:00") => {
  const [h, m] = (timeStr || fallback).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const formatTime = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// 🔥 ФУНКЦИЯ ПРОВЕРКИ ОПОЗДАНИЯ (для Карты и Списка)
export const isOrderLate = (order: DashboardOrder | any) => {
  if (["CANCELLED", "RETURNED"].includes(order.status)) return false;
  if (!order.slotTo) return false;

  const slotMin = parseTime(order.slotTo, "23:59");

  if (order.status === "DELIVERED" && order.deliveredAt) {
    const d = new Date(new Date(order.deliveredAt).toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const dMin = d.getHours() * 60 + d.getMinutes();
    return dMin > slotMin;
  }

  if (order.eta && order.eta !== "—") {
    return parseTime(order.eta) > slotMin;
  }
  return false;
};

function getOptimalDeparture(orders: DashboardOrder[], legsDurations: number[], serviceTime = 5) {
  if (!orders.length || !legsDurations.length) return null;

  let bestStartMin = parseTime(orders[0].slotFrom) - legsDurations[0];
  let anchorIndex = 0;

  let changed = true;
  while (changed) {
    changed = false;
    let currentMin = bestStartMin;
    const arrivals: number[] = [];

    for (let i = 0; i < orders.length; i++) {
      currentMin += legsDurations[i];
      arrivals.push(currentMin);
      const slotFrom = parseTime(orders[i].slotFrom);
      if (currentMin < slotFrom) currentMin = slotFrom;
      currentMin += serviceTime;
    }

    currentMin = bestStartMin;
    for (let i = 0; i < orders.length; i++) {
      currentMin += legsDurations[i];
      const slotFrom = parseTime(orders[i].slotFrom);

      if (currentMin < slotFrom) {
        const waitTime = slotFrom - currentMin;
        let maxAllowedShift = waitTime;

        for (let j = 0; j <= i; j++) {
          const slotTo = parseTime(orders[j].slotTo, "23:59");
          const slack = slotTo - arrivals[j];
          if (slack < maxAllowedShift) maxAllowedShift = Math.max(0, slack);
        }

        if (maxAllowedShift > 0) {
          bestStartMin += maxAllowedShift;
          anchorIndex = i;
          changed = true;
          break;
        }
      }
      if (currentMin < slotFrom) currentMin = slotFrom;
      currentMin += serviceTime;
    }
  }

  return {
    departureTime: formatTime(bestStartMin),
    anchorOrder: orders[anchorIndex],
    anchorIndex: anchorIndex,
    isShifted: anchorIndex > 0
  };
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
  const basesCollectionRef = useRef<any>(null); // 🔥 ДОБАВИТЬ ЭТО
  // Полигоны зон доставки: держим ссылку, чтобы снять их при смене города
  const zonesRef = useRef<any>(null);
  const multiRouteRef = useRef<any>(null); // Для создания нового маршрута
  // 🔥 ДОБАВЛЯЕМ ЭТО (Для текущих активных маршрутов):
  const activeRoutesRefs = useRef<any[]>([]); const clickedFromMapRef = useRef(false); // пока не включено
  const [showRouteLines, setShowRouteLines] = useState(false);

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
  const [showMapSettings, setShowMapSettings] = useState(false);

  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  // Базы доступных магазинов: адрес и координаты приходят из настроек компании
  const [shopBases, setShopBases] = useState<
    { id: string; name: string; slug: string; storeLat: number | null; storeLng: number | null; storeAddress: string | null; city: string | null }[]
  >([]);
  // Карту нельзя инициализировать раньше, чем известен город магазина:
  // иначе она встанет на дефолт (Москву) и там и останется.
  const [basesLoaded, setBasesLoaded] = useState(false);
  const [dbCouriers, setDbCouriers] = useState<DbCourier[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  // СТАЛО:
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCouriers, setSelectedCouriers] = useState<string[]>([]);

  // Также понадобятся два стейта для открытия/закрытия самих менюшек:
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isCourierMenuOpen, setIsCourierMenuOpen] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(11);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [dismissedInvalid, setDismissedInvalid] = useState(false);
  const [previewGeo, setPreviewGeo] = useState<{ lat: number, lng: number } | null>(null);
  const [fixingAI, setFixingAI] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [mapReady, setMapReady] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, dir: 'asc' | 'desc' }>({ key: 'changedAt', dir: 'desc' });

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [routeTab, setRouteTab] = useState<"map" | "list">("map");
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkCourier, setBulkCourier] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [routeType, setRouteType] = useState<"auto" | "mt">("mt");
  const [returnToBase, setReturnToBase] = useState(false);

  const [routeTabMode, setRouteTabMode] = useState<"new" | "current">("new");
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);

  const [routeLegs, setRouteLegs] = useState<string[]>([]);
  const [routeTotals, setRouteTotals] = useState<{ time: string, dist: string } | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [departureAdvice, setDepartureAdvice] = useState<string | null>(null);

  // 🔥 ДОБАВЛЯЕМ ЭТИ ДВЕ СТРОКИ:
  const [manualDepartureTime, setManualDepartureTime] = useState("");
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [isDepartureEdited, setIsDepartureEdited] = useState(false);

  // Находим функцию handleQuickStatusChange и заменяем её целиком
  const handleQuickStatusChange = async (id: string, newStatus: string, calculatedEta?: string) => {
    // Получаем текущее время возврата на базу из нашего useMemo (calculatedEtasData)
    // Это то самое время, которое пересчитывается Яндексом или формулой внутри
    const newBaseReturnTime = calculatedEtasData.baseReturnTime;

    setOrders((prev: any[]) =>
      prev.map(o => o.id === id ? {
        ...o,
        status: newStatus,
        changedAt: new Date().toISOString(),
        pickedUpAt: newStatus === "IN_DELIVERY" && !o.pickedUpAt ? new Date().toISOString() : o.pickedUpAt,
        eta: (newStatus === "IN_DELIVERY" && calculatedEta && calculatedEta !== "—")
          ? calculatedEta
          : (newStatus === "NEW" || newStatus === "ASSIGNED" ? null : o.eta)
      } : o)
    );

    try {
      const body: any = {
        status: newStatus,
        // 🔥 Передаем новое время возврата на базу, чтобы обновить Route
        estimatedReturnTime: newBaseReturnTime !== "—" ? newBaseReturnTime : null
      };

      if (newStatus === "IN_DELIVERY" && calculatedEta && calculatedEta !== "—") {
        body.eta = calculatedEta;
      }

      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error("Ошибка обновления статуса");

      // Обновляем данные, чтобы плашки снаружи синхронизировались
      fetchData();
    } catch (e) {
      console.error("Ошибка изменения статуса:", e);
      fetchData();
    }
  };

  useEffect(() => {
    const fd = localStorage.getItem("fo_filterDate");
    if (fd) setFilterDate(fd);
    const to = localStorage.getItem("fo_tableOpen");
    if (to !== null) setTableOpen(to === "true");
    const lv = localStorage.getItem("fo_listVisible");
    if (lv !== null) setIsListVisible(lv === "true");
    const dv = localStorage.getItem("fo_detailVisible");
    if (dv !== null) setIsDetailVisible(dv === "true");

    // 🔥 ЗАГРУЗКА состояния чекбоксов
    const shC = localStorage.getItem("fo_showCouriers"); if (shC !== null) setShowCouriers(shC === "true");
    const shH = localStorage.getItem("fo_showHomes"); if (shH !== null) setShowHomes(shH === "true");
    const shCN = localStorage.getItem("fo_showCourierNames"); if (shCN !== null) setShowCourierNames(shCN === "true");
    const shT = localStorage.getItem("fo_showTime"); if (shT !== null) setShowTime(shT === "true");
    const shRL = localStorage.getItem("fo_showRouteLines"); if (shRL !== null) setShowRouteLines(shRL === "true");


  }, []);

  useEffect(() => { localStorage.setItem("fo_filterDate", filterDate); }, [filterDate]);
  useEffect(() => { localStorage.setItem("fo_tableOpen", String(tableOpen)); }, [tableOpen]);
  useEffect(() => { localStorage.setItem("fo_listVisible", String(isListVisible)); }, [isListVisible]);
  useEffect(() => { localStorage.setItem("fo_detailVisible", String(isDetailVisible)); }, [isDetailVisible]);


  // 🔥 СОХРАНЕНИЕ состояния чекбоксов при их изменении
  useEffect(() => { localStorage.setItem("fo_showCouriers", String(showCouriers)); }, [showCouriers]);
  useEffect(() => { localStorage.setItem("fo_showHomes", String(showHomes)); }, [showHomes]);
  useEffect(() => { localStorage.setItem("fo_showCourierNames", String(showCourierNames)); }, [showCourierNames]);
  useEffect(() => { localStorage.setItem("fo_showTime", String(showTime)); }, [showTime]);
  useEffect(() => { localStorage.setItem("fo_showRouteLines", String(showRouteLines)); }, [showRouteLines]);


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
      // Магазины отсюда убраны намеренно: fetchData крутится каждые
      // 30 секунд, а базы меняются раз в год. Тянуть их вместе с заказами —
      // лишний запрос к базе каждые полминуты на каждой открытой вкладке.
      // Они грузятся один раз, отдельным эффектом ниже, и кэшируются.
      const [ordersRes, couriersRes] = await Promise.all([
        fetch(`/api/orders?t=${Date.now()}`),
        fetch(`/api/couriers?t=${Date.now()}`),
      ]);

      if (ordersRes.ok) {
        setOrders(await ordersRes.json());
        setLastSync(new Date().toLocaleTimeString("ru", { timeZone: "Europe/Moscow" }));
      }
      if (couriersRes.ok) {
        setDbCouriers(await couriersRes.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Базы магазинов: один раз за сессию, с кэшем.
  // Из кэша экран рисуется сразу, запрос уходит фоном и обновляет данные,
  // если магазин добавили или поменяли адрес.
  useEffect(() => {
    const CACHE_KEY = "adelivo:shop-bases";

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) { setShopBases(JSON.parse(cached)); setBasesLoaded(true); }
    } catch { /* приватный режим — просто грузим с сервера */ }

    fetch("/api/company/shops")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const shops = Array.isArray(d) ? d : d.shops ?? [];
        setShopBases(shops);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(shops)); } catch { /* ignore */ }
      })
      .catch(() => { /* при ошибке остаёмся на кэше */ })
      // Даже если запрос упал, карту рисуем: пустой список даст город
      // по умолчанию, но экран не останется белым навсегда.
      .finally(() => setBasesLoaded(true));
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
    // 🔥 Вычисляем дату 14 дней назад (в формате YYYY-MM-DD)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const limitDateStr = twoWeeksAgo.toISOString().split("T")[0];

    // 🔥 Берем только активных курьеров, у которых ЕСТЬ смены за последние 14 дней
    const base = [...dbCouriers].filter(c => {
      if (!c.isActive) return false;
      return c.shifts.some(s => s.date >= limitDateStr);
    });

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
      const shift = c.shifts.find(s => s.date === filterDate) as any;
      const cnt = orderCounts[c.fullName] || 0;
      let label = c.fullName;

      if (shift || cnt > 0) {
        const flags = [];
        if (shift) {
          flags.push(`На смене ${shift.startTime || "10:00"}-${shift.endTime || "22:00"} (⭐${c.priority ?? 3})`);
        }
        if (cnt > 0) flags.push(`${cnt} зак.`);
        label += ` (${flags.join(", ")})`;
      }
      return { id: c.id, value: String(c.id), label };
    });
  })();

  const courierOptions = [{ value: "ALL", label: "Все курьеры" }, { value: "UNASSIGNED", label: "Не назначен" }, ...sortedCouriers];

  /**
   * Сводка дня: сколько заказов и сколько курьеров на смене.
   *
   * Считается по выбранной дате и без учёта фильтров: оператору нужна
   * картина смены целиком, а не то, что осталось после отбора по статусу.
   * «7 (5)» читается как «семь курьеров на смене, пятеро уже с заказами».
   */
  const dayStats = useMemo(() => {
    const dayOrders = orders.filter((o) => {
      const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split("T")[0] : null);
      return oDate === filterDate;
    });

    const onShift = dbCouriers.filter(
      (c) => c.isActive && c.shifts.some((sh) => sh.date === filterDate)
    );
    const busyNames = new Set(dayOrders.map((o) => o.courier).filter(Boolean));

    return {
      orders: dayOrders.length,
      // Без курьера — то, что ещё предстоит раздать
      unassigned: dayOrders.filter((o) => !o.courierId).length,
      couriers: onShift.length,
      couriersBusy: onShift.filter((c) => busyNames.has(c.fullName)).length,
    };
  }, [orders, dbCouriers, filterDate]);

  const dateAndStatusOrders = orders.filter(o => {
    const oDate = o.deliveryDate || (o.crmCreatedAt ? o.crmCreatedAt.split('T')[0] : null);
    if (oDate !== filterDate) return false;

    // 🔥 1. Мульти-фильтр по статусам
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(o.status)) {
      return false;
    }

    // 🔥 2. Мульти-фильтр по курьерам (с поддержкой UNASSIGNED)
    if (selectedCouriers.length > 0) {
      const isUnassignedMatch = selectedCouriers.includes("UNASSIGNED") && !o.courierId;
      const isCourierMatch = selectedCouriers.includes(String(o.courierId));

      if (!isUnassignedMatch && !isCourierMatch) {
        return false;
      }
    }

    return true;
  });

  const selected = orders.find(o => o.id === selectedId) ?? null;
  // 🔥 ДОБАВЛЕНО: игнорируем ошибки адреса у отмененных и возвращенных заказов
  const invalid = dateAndStatusOrders.filter(o =>
    o.isInvalid &&
    o.status !== "CANCELLED" &&
    o.status !== "RETURNED" &&
    !/самовывоз|большой афанасьевский 39/i.test(o.address || "")
  );

  const filtered = useMemo(() => {
    let result = selectedSlots.length === 0 ? dateAndStatusOrders : dateAndStatusOrders.filter(o => {
      if (!o.slotFrom || !o.slotTo) return selectedSlots.includes("Другие");
      const exactMatch = SLOTS.find(s => s.from === o.slotFrom && s.to === o.slotTo);
      if (exactMatch) {
        return selectedSlots.includes(exactMatch.label);
      } else {
        return selectedSlots.includes("Другие");
      }
    });

    if (searchQuery.trim().length >= 3) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(o =>
        String(o.crmId || "").toLowerCase().includes(lowerQ) ||
        String(o.externalId || "").toLowerCase().includes(lowerQ) ||
        String(o.address || "").toLowerCase().includes(lowerQ) ||
        String(o.opComment || "").toLowerCase().includes(lowerQ) ||
        String(o.comment || "").toLowerCase().includes(lowerQ) ||
        String(o.recipientPhone || "").toLowerCase().includes(lowerQ)
      );
    }
    return result;
  }, [dateAndStatusOrders, selectedSlots, searchQuery]);

  const sidePanelOrders = [...filtered].sort((a, b) => {
    const getPriority = (o: DashboardOrder) => {
      if (/самовывоз|большой афанасьевский 39/i.test(o.address || "")) return 7;
      if (o.status === "IN_DELIVERY") return 1;
      if (o.status === "NEW") return 2;
      if (o.status === "ASSEMBLING") return 3; // 🔥 Добавили в приоритет
      if (o.status === "ASSIGNED") return 4;
      if (o.status === "DELIVERED") return 5;
      return 6;
    };
    const pA = getPriority(a);
    const pB = getPriority(b);
    if (pA !== pB) return pA - pB;
    const slotA = a.slotFrom || "23:59";
    const slotB = b.slotFrom || "23:59";
    return slotA.localeCompare(slotB);
  });

  // 🔥 Исключаем оба варианта из отображения на карте
  const MAP_EXCLUDED_STATUSES = ["CANCELLED", "RETURNED"];

  const filteredForMap = useMemo(() => {
    const base = filtered.filter(o =>
      !MAP_EXCLUDED_STATUSES.includes(o.status) &&
      !/самовывоз|большой афанасьевский 39/i.test(o.address ?? "") &&
      o.lat && o.lng // Защита от краша карты
    );

    // 🔥 Если включен режим сборки маршрута, принудительно отображаем ВСЕ выбранные точки,
    // даже если пользователь случайно переключил фильтр статуса или времени
    if (isBulkMode && bulkSelectedIds.length > 0) {
      const baseIds = new Set(base.map(o => o.id));
      const extra = orders.filter(o =>
        bulkSelectedIds.includes(o.id) && !baseIds.has(o.id) && o.lat && o.lng
      );
      return [...base, ...extra];
    }

    return base;
  }, [filtered, isBulkMode, bulkSelectedIds, orders]);
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

  // ── Город и база: единственный источник координат на весь экран ──────────
  //
  // Раньше в компоненте было три разных места с константой 55.749511/37.596205
  // (оптимизатор, линия маршрута, расчёт ETA) и одно правильное — ссылка в
  // Яндекс.Карты. Из-за этого маршрут в Воронеже считался из Москвы,
  // а карта открывалась над Кремлём.

  /** Магазин, на который сейчас смотрит оператор. */
  const activeShop = useMemo(() => {
    const slug = dateAndStatusOrders?.[0]?.shop;
    return shopBases.find((s) => s.slug === slug) ?? shopBases[0] ?? null;
  }, [shopBases, dateAndStatusOrders]);

  /** Город активного магазина. getCity никогда не возвращает null. */
  const activeCity = useMemo(() => getCity(activeShop?.city), [activeShop]);

  /**
   * Координаты базы для конкретного магазина: сначала адрес из настроек,
   * потом центр его города. Хардкода нет ни на одной ветке.
   */
  const baseCoordsFor = useCallback((shopSlug?: string | null): [number, number] => {
    const shop = shopSlug ? shopBases.find((s) => s.slug === shopSlug) : null;
    const target = shop ?? activeShop;
    if (target?.storeLat != null && target?.storeLng != null) {
      return [target.storeLat, target.storeLng];
    }
    return getCity(target?.city).center;
  }, [shopBases, activeShop]);

  // 1. Инициализация карты и зон
  useEffect(() => {
    // Вот здесь и была причина «город не отображается»: эффект стоял с
    // пустым списком зависимостей и отрабатывал на первом рендере, когда
    // shopBases ещё пустой. getCity(undefined) давала Москву, карта
    // вставала над Кремлём и больше никогда не пересоздавалась.
    if (!basesLoaded) return;

    let mounted = true;
    loadYMaps().then(() => {
      if (!mounted || !mapRef.current || ymapRef.current) return;

      const [finalLat, finalLng] = baseCoordsFor(activeShop?.slug);

      const map = new window.ymaps.Map(mapRef.current, {
        center: [finalLat, finalLng],
        zoom: activeCity.zoom,
        controls: ["zoomControl"]
      }, {});
      
      map.events.add('boundschange', (e: any) => { 
        if (e.get('newZoom') !== e.get('oldZoom')) setCurrentZoom(e.get('newZoom')); 
      });

      const clusterer = new window.ymaps.Clusterer({
        clusterIconLayout: "default#pieChart",
        clusterIconPieChartRadius: 20,
        clusterDisableClickZoom: true,
        clusterOpenBalloonOnClick: true,
        gridSize: 64
      });
      map.geoObjects.add(clusterer);

      const courierColl = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(courierColl);

      // Зоны доставки грузятся отдельным эффектом ниже: здесь карта ещё
      // не знает, в каком городе окажутся заказы.
      clustererRef.current = clusterer;
      couriersGeoObjectsRef.current = courierColl;
      ymapRef.current = map;
      setMapReady(true);
    });
    return () => { mounted = false; };
  }, [basesLoaded, activeCity, activeShop, baseCoordsFor]);

  // 1a. Зоны доставки (zones.kml)
  //
  // Отдельным эффектом, а не внутри инициализации карты. Раньше загрузка
  // стояла там же и пряталась за проверкой activeCity.hasZones. Проблема
  // в моменте: карта создаётся сразу после загрузки баз, когда заказов
  // ещё нет, и activeShop берётся как shopBases[0] — то есть первый
  // магазин компании, вовсе не обязательно московский. Для немосковского
  // hasZones === false, эффект уходил в ранний return, а второй раз карта
  // не создаётся. Так зоны Москвы и перестали появляться.
  //
  // Теперь эффект следит за городом: город сменился — старые полигоны
  // снимаются, новые грузятся, если для города они есть.
  useEffect(() => {
    const map = ymapRef.current;
    if (!mapReady || !map) return;

    // Снимаем зоны прошлого города
    if (zonesRef.current) {
      map.geoObjects.remove(zonesRef.current);
      zonesRef.current = null;
    }
    if (!activeCity.hasZones) return;

    let cancelled = false;
    const geoXml = (window.ymaps as any)?.geoXml;
    if (!geoXml?.load) {
      console.warn("[Карта] Модуль geoXml недоступен, зоны не загружены");
      return;
    }

    geoXml.load("/zones.kml")
      .then((res: any) => {
        if (cancelled || !ymapRef.current) return;

        const applyStyles = (collection: any) => {
          if (collection && typeof collection.each === "function") {
            collection.each((obj: any) => {
              if (obj.geometry) {
                obj.options.set({
                  fillOpacity: 0.15,
                  strokeOpacity: 0.7,
                  interactivityModel: "default#transparent",
                  hasBalloon: false,
                  hasHint: false,
                  openBalloonOnClick: false,
                });
              } else { applyStyles(obj); }
            });
          }
        };
        applyStyles(res.geoObjects);
        ymapRef.current.geoObjects.add(res.geoObjects);
        zonesRef.current = res.geoObjects;
      })
      .catch((err: any) => console.error("Ошибка загрузки локальных зон:", err));

    return () => { cancelled = true; };
  }, [mapReady, activeCity]);

  // 2. Отрисовка баз магазинов (только с заполненными координатами)
  useEffect(() => {
    if (!mapReady || !ymapRef.current || !window.ymaps) return;

    const map = ymapRef.current;

    if (!basesCollectionRef.current) {
      basesCollectionRef.current = new window.ymaps.GeoObjectCollection();
      map.geoObjects.add(basesCollectionRef.current);
    }

    basesCollectionRef.current.removeAll();

    // 🔥 Оставляем только те магазины, у которых реально заполнены координаты в БД
    const validBases = shopBases.filter(b => b.storeLat != null && b.storeLng != null);

    for (const b of validBases) {
      const pm = new window.ymaps.Placemark(
        [b.storeLat as number, b.storeLng as number],
        {
          hintContent: `🏪 ${b.name}\n📍 ${b.storeAddress || "Адрес не указан"}`,
          balloonContent: `<b>${b.name}</b><br/>${b.storeAddress || ""}`
        },
        {
          preset: "islands#grayDotIcon" // Аккуратная стандартная точка вместо серой капсулы
        }
      );
      basesCollectionRef.current.add(pm);
    }
  }, [shopBases, mapReady]);

  const toggleBulkSelect = (id: string) => {
    setBulkSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 50) { alert("Максимум 50 заказов для Яндекс Карт"); return prev; }
      return [...prev, id];
    });
  };

  useEffect(() => {
    const handleMapClick = (e: any) => {
      if (e.detail) {
        const orderId = e.detail;
        if (isBulkMode && routeTabMode === "new") {
          toggleBulkSelect(orderId);
        } else {
          clickedFromMapRef.current = true;
          setSelectedId(orderId);
          if (!isMobile) { setIsListVisible(true); setIsDetailVisible(true); }
          else setMobileView("split");
        }
      }
    };
    window.addEventListener("OPEN_ORDER_FROM_MAP", handleMapClick);
    return () => window.removeEventListener("OPEN_ORDER_FROM_MAP", handleMapClick);
  }, [isBulkMode, routeTabMode, isMobile]);

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

      // Старт — база магазина этих заказов, а не константа Москвы
      const [currentLatInit, currentLngInit] = baseCoordsFor(validOrders[0]?.shop);
      let currentLat = currentLatInit;
      let currentLng = currentLngInit;
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
        if (next.lat && next.lng) { currentLat = next.lat; currentLng = next.lng; }
      }
      return sorted;
    });
  };
  // Реф для хранения временной метки предпросмотра
  const previewPlacemarkRef = useRef<any>(null);
  // Один авто-фокус на сессию карты. Дальше зумом управляет только человек.
  const didAutoFitRef = useRef(false);

  // 🔥 Эффект для отрисовки точки FIX
  useEffect(() => {
    if (!mapReady || !ymapRef.current || !window.ymaps) return;

    const map = ymapRef.current;

    // Очищаем старую метку превью, если она есть
    if (previewPlacemarkRef.current) {
      map.geoObjects.remove(previewPlacemarkRef.current);
      previewPlacemarkRef.current = null;
    }

    // Если есть координаты для предпросмотра — рисуем метку
    if (previewGeo && previewGeo.lat && previewGeo.lng) {
      const pm = new window.ymaps.Placemark(
        [previewGeo.lat, previewGeo.lng],
        {
          hintContent: "📍 Новая координата",
          balloonContent: "Исправленная позиция заказа"
        },
        {
          preset: "islands#redDotIcon" // Красная заметная точка
        }
      );

      map.geoObjects.add(pm);
      previewPlacemarkRef.current = pm;

      // Плавно приближаем карту к новой точке
      map.setCenter([previewGeo.lat, previewGeo.lng], 16, { duration: 300 });
    }
  }, [previewGeo, mapReady]);
  useEffect(() => {
    if (!mapReady) return;
    const clusterer = clustererRef.current;
    if (!clusterer || typeof window === "undefined" || !window.ymaps) return;
    clusterer.removeAll();
    const ymaps = (window as any).ymaps;

    const StretchyLayout = ymaps.templateLayoutFactory.createClass(
      '<div style="display:inline-flex;flex-direction:column;align-items:center;cursor:pointer; min-width: 90px; max-width: 120px;">' +
      '<div style="background:{{ properties.pinColor }};color:#fff;padding:4px 10px;border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.28);border:1.5px solid rgba(255,255,255,0.35); text-align:center;line-height:1.4;">{{ properties.slotLabel }}</div>' +
      '<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid {{ properties.pinColor }};margin-top:-1px;"></div>' +
      '{% if properties.showLabel %}<div style="margin-top:3px;font-size:9px;font-weight:700;color:var(--color-text);white-space:nowrap;background:var(--color-card);border:1px solid var(--color-border);padding:2px 6px;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,0.25);line-height:1.4;">{{ properties.labelText }}</div>{% endif %}' +
      '</div>'
    );

    const placemarks = filteredForMap.filter(o => (o.lat && o.lng) || (o.id === selectedId && previewGeo)).map(order => {
      const isSelected = selectedId === order.id;
      const bulkIndex = bulkSelectedIds.indexOf(order.id);
      const isBulkSelected = bulkIndex !== -1;
      const lat = isSelected && previewGeo ? previewGeo.lat : order.lat!;
      const lng = isSelected && previewGeo ? previewGeo.lng : order.lng!;
      const color = slotColor(order as any);

      const late = isOrderLate(order);

      const isStandardSlot = SLOTS.some(s => s.from === order.slotFrom && s.to === order.slotTo);
      const isOtherSlot = !!order.slotRaw && !isStandardSlot;

      // 🔥 1. В режиме маршрута время показываем ВСЕГДА, независимо от зума
      const displayTime = !!order.slotRaw && showTime && (
        currentZoom >= 13 || (isBulkMode && routeTabMode === "new")
      );

      const displayName = showCourierNames && !!order.courier;
      const slotLabelText = order.slotRaw ? order.slotRaw.replace("с ", "").replace(" до ", "-") : "";

      const btnText = (isBulkMode && routeTabMode === "new")
        ? (isBulkSelected ? '❌ Убрать из маршрута' : '➕ Добавить в маршрут')
        : 'Открыть карточку';
      const btnColor = (isBulkMode && routeTabMode === "new" && isBulkSelected) ? '#d94040' : 'var(--color-accent)';

      const balloonBody = `
        <div style="padding: 4px 0;">
          <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">${order.address}</div>
          <div style="font-size: 11px; color: #666;">Слот: ${order.slotRaw}</div>
          <button 
            type="button"
            onclick="window.dispatchEvent(new CustomEvent('OPEN_ORDER_FROM_MAP', { detail: '${order.id}' }))"
            style="margin-top: 8px; padding: 6px 10px; background: ${btnColor}; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 11px; width: 100%; font-weight: bold;"
          >
            ${btnText}
          </button>
        </div>
      `;

      let pm;
      const basePointColor = isOtherSlot ? '#1a1a18' : color;

      if (displayTime) {
        let pinColor = basePointColor;

        if (isBulkMode && routeTabMode === "new") {
          if (isBulkSelected) {
            // 🔥 2. Оставляем родной цвет слота для выбранных в маршрут точек
            pinColor = basePointColor;
          } else {
            // А невыбранные делаем серыми
            pinColor = '#d1d5db';
          }
        } else if (isSelected) {
          pinColor = previewGeo ? '#9ca3af' : '#facc15';
        } else if (late) {
          pinColor = '#d94040';
        }

        const finalSlotLabel = (isBulkMode && routeTabMode === "new" && isBulkSelected)
          ? `${bulkIndex + 1}. ${slotLabelText}`
          : slotLabelText;

        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId,
          balloonContentBody: balloonBody,
          hintContent: order.address ?? "—",
          pinColor, slotLabel: finalSlotLabel, showLabel: displayName, labelText: order.courier ?? "",
        }, {
          iconLayout: StretchyLayout,
          iconOffset: [-45, -36],
          iconShape: { type: "Rectangle", coordinates: [[0, 0], [100, 65]] },
          iconColor: pinColor
        });
      } else {
        let preset = 'islands#dotIcon';
        let iconContent = undefined;

        // 🔥 ПО УМОЛЧАНИЮ точка всегда красится в цвет своего слота
        let finalIconColor: string | undefined = basePointColor;
        if (isBulkMode && routeTabMode === "new") {
          // --- РЕЖИМ: СОЗДАНИЕ НОВОГО МАРШРУТА ---
          if (isBulkSelected) {
            preset = 'islands#icon'; // Меняем форму, чтобы внутрь влезла цифра
            iconContent = `${bulkIndex + 1}`;
            // Цвет остается finalIconColor (цвет слота)
          } else {
            preset = 'islands#grayCircleDotIcon';
            finalIconColor = undefined; // Делаем серыми (сбрасываем цвет)
          }

        } else if (isBulkMode && routeTabMode === "current") {
          // --- РЕЖИМ: ТЕКУЩИЕ МАРШРУТЫ ---
          // Оставляем дефолтный 'islands#dotIcon' и цвет слота (finalIconColor)
          // Ничего сбрасывать не нужно, они будут красивыми и цветными!

        } else {
          // --- ОБЫЧНЫЙ РЕЖИМ (Дашборд без маршрутов) ---
          if (isSelected) {
            preset = previewGeo ? "islands#grayDotIcon" : "islands#yellowDotIcon";
            finalIconColor = undefined; // Желтый или серый пресет не нуждается в перекраске
          } else if (late) {
            preset = "islands#redIcon";
            finalIconColor = undefined; // Красный пресет не нуждается в перекраске
          }
        }

        pm = new ymaps.Placemark([lat, lng], {
          balloonContentHeader: order.externalId ?? order.crmId,
          balloonContentBody: balloonBody,
          hintContent: order.address ?? "—",
          iconCaption: (displayName) ? order.courier : undefined,
          iconContent
        }, {
          preset,
          // 🔥 Передаем нашу понятную переменную
          iconColor: finalIconColor
        });
      }

      pm.events.add("click", () => {
        if (isBulkMode && routeTabMode === "new") toggleBulkSelect(order.id);
        else {
          clickedFromMapRef.current = true;
          setSelectedId(order.id);
          if (!isMobile) { setIsListVisible(true); setIsDetailVisible(true); }
          else setMobileView("split");
        }
      });
      return pm;
    });

    if (placemarks.length > 0) {
      clusterer.add(placemarks as any);

      // Авто-фокус ровно ОДИН раз за сессию карты, при первой пачке заказов.
      //
      // Раньше setBounds висел без всякого флага и срабатывал на каждое
      // изменение фильтров, слотов и режима сборки: стоило снять галочку
      // со статуса — карта перестраивала охват и уезжала в произвольный
      // зум. А если хоть один заказ геокодился в другой город, охват
      // растягивался на полстраны. Отсюда и «идиотский зум вместо города».
      if (!didAutoFitRef.current && !selectedId && !previewGeo && ymapRef.current) {
        const bounds = clusterer.getBounds();
        if (bounds) {
          const [[swLat, swLng], [neLat, neLng]] = bounds;
          const spanLat = Math.abs(neLat - swLat);
          const spanLng = Math.abs(neLng - swLng);

          // Больше градуса разброса — это не город, а кривая точка.
          // Остаёмся на центре города, а не показываем глобус.
          if (spanLat > 1 || spanLng > 1) {
            ymapRef.current.setCenter(baseCoordsFor(activeShop?.slug), activeCity.zoom, { duration: 300 });
          } else {
            // Минимальный охват. setBounds честно подгонял рамку под заказы,
            // и при двух-трёх точках в Воронеже это давало не город, а один
            // двор. MIN_SPAN ≈ 11 км по широте — примерно тот обзор, что
            // раньше получался у Москвы, где заказов много и они разбросаны.
            const MIN_SPAN = 0.1;
            const cLat = (swLat + neLat) / 2;
            const cLng = (swLng + neLng) / 2;
            const halfLat = Math.max(spanLat, MIN_SPAN) / 2;
            // Градус долготы короче широтного, поэтому делим на косинус:
            // без этого на широте Питера обзор по горизонтали был бы вдвое уже
            const halfLng = Math.max(spanLng, MIN_SPAN / Math.cos((cLat * Math.PI) / 180)) / 2;

            ymapRef.current.setBounds(
              [[cLat - halfLat, cLng - halfLng], [cLat + halfLat, cLng + halfLng]],
              { checkZoomRange: true, zoomMargin: 30 }
            );
          }
          didAutoFitRef.current = true;
        }
      }
    }
  }, [filteredForMap, selectedId, previewGeo, currentZoom, selectedSlots, isBulkMode, bulkSelectedIds, showTime, showCourierNames, isMobile, mapReady, routeTabMode]);
  // 🔥 ЭФФЕКТ ДЛЯ ОТРИСОВКИ ЛИНИЙ МАРШРУТА (multiRouter)
  useEffect(() => {
    if (!mapReady || typeof window === "undefined" || !(window as any).ymaps) return;
    const map = ymapRef.current;
    const ymaps = (window as any).ymaps;
    if (!map || !ymaps.multiRouter) return;

    // Цвет линии под текущую тему приложения. Тему читаем здесь, чтобы
    // переключение light/dark без перезагрузки подхватывалось.
    const isDarkTheme =
      typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-ew-theme") === "dark";
    const routeLineColor = isDarkTheme ? "#7DA6FF" : "#2B5BD7";

    // 1. Очищаем старую линию маршрута при каждом изменении.
    // В try, потому что недостроенный объект при remove падает изнутри
    // Яндекса, и это исключение выносило весь компонент.
    if (multiRouteRef.current) {
      try {
        map.geoObjects.remove(multiRouteRef.current);
      } catch (e) {
        console.warn("[Карта] Не удалось снять прошлую линию маршрута:", e);
      }
      multiRouteRef.current = null;
    }
    // 🔥 ДОБАВЛЯЕМ ПРОВЕРКУ showRouteLines
    if (!showRouteLines) return;
    // 2. Рисуем новую линию, только если мы собираем маршрут и есть хотя бы 1 выбранный заказ
    if (isBulkMode && routeTabMode === "new" && bulkSelectedIds.length > 0) {
      // Собираем координаты по порядку кликов
      const points = [];

      // Сначала всегда ставим Базу — того магазина, чьи это заказы
      const firstOrder = orders.find(o => o.id === bulkSelectedIds[0]);
      points.push(baseCoordsFor(firstOrder?.shop));

      // Затем перебираем выбранные ID и достаем их координаты
      bulkSelectedIds.forEach(id => {
        const order = orders.find(o => o.id === id);
        if (order && order.lat && order.lng) {
          points.push([order.lat, order.lng]);
        }
      });

      // Если есть куда ехать, создаем маршрут
      if (points.length > 1) {
        const multiRoute = new ymaps.multiRouter.MultiRoute({
          referencePoints: points,
          params: { routingMode: routeType === 'mt' ? 'masstransit' : 'auto' } // можно 'auto' (на авто) или 'masstransit'
        }, {
          // 🔥 САМОЕ ВАЖНОЕ: Отключаем стандартные метки (А, В, С...), 
          // так как у нас уже есть свои красивые плашки
          wayPointVisible: false,
          viaPointVisible: false,

          // Чтобы карта не прыгала и не зумировалась каждый раз, когда ты кликаешь на новую точку
          boundsAutoApply: false,

          // Настройки внешнего вида самой линии
          routeActiveStrokeWidth: 5,
          // Конкретный цвет, а не CSS-переменная.
          //
          // Яндекс разбирает это значение своим парсером graphics.RGBAColor,
          // и на строке «var(--color-accent)» он бросает исключение
          // «формат данных не распознан». Из-за этого multiRoute оставался
          // недостроенным, следующее обращение к нему падало с
          // «Cannot read properties of null (reading 'setContainerPane')»,
          // React ловил это уже как ошибку рендера — и весь дашборд гас
          // в чёрный экран до перезагрузки.
          routeActiveStrokeColor: routeLineColor,
          routeStrokeStyle: 'solid',
          routeActivePedestrianSegmentStrokeStyle: 'solid'
        });

        map.geoObjects.add(multiRoute);
        multiRouteRef.current = multiRoute;
      }
    }
    // 🔥 ДОБАВИЛИ showRouteLines и routeType СЮДА В КОНЕЦ:
  }, [bulkSelectedIds, isBulkMode, routeTabMode, mapReady, orders, showRouteLines, routeType]);

  useEffect(() => {
    if (!mapReady || !couriersGeoObjectsRef.current) return;
    const coll = couriersGeoObjectsRef.current;
    coll.removeAll();
    if (typeof window === "undefined" || !window.ymaps) return;

    // 🔥 1. ВЫЧИСЛЯЕМ АКТИВНЫХ КУРЬЕРОВ (как и для списков)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const limitDateStr = twoWeeksAgo.toISOString().split("T")[0];

    const activeCouriersForMap = dbCouriers.filter(c => {
      if (!c.isActive) return false;
      return c.shifts.some(s => s.date >= limitDateStr);
    });

    // 🔥 2. ИСПОЛЬЗУЕМ activeCouriersForMap ВМЕСТО dbCouriers
    activeCouriersForMap.forEach(c => {
      // 🔥 Расчет онлайна: меньше 60 минут = онлайн
      const diffMins = c.locationUpdatedAt
        ? Math.floor((Date.now() - new Date(c.locationUpdatedAt).getTime()) / 60000)
        : null;

      const isLive = diffMins !== null && diffMins < 60;
      const timeAgoText = diffMins === 0 ? "только что" : `${diffMins} мин`;

      if (showCouriers && c.lat && c.lng) {
        const pm = new window.ymaps.Placemark([c.lat, c.lng], {
          balloonContentHeader: c.fullName,
          balloonContentBody: isLive ? `Онлайн (${timeAgoText})` : "Был недавно",
          hintContent: `${c.fullName} (${isLive ? timeAgoText : "офлайн"})`,
          iconCaption: c.fullName,
        }, {
          preset: isLive ? "islands#blueWalkingIcon" : "islands#grayWalkingIcon"
        });
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
            isDraft: o.route.isDraft,
            isAccepted: o.route.isAccepted,
            orders: [],
            courierId: o.courierId,
            createdAt: o.route.createdAt,
            updatedAt: o.route.updatedAt || o.changedAt || o.createdAt,
            baseArrivalTime: o.route.baseArrivalTime,
            estimatedReturnTime: o.route.estimatedReturnTime,
            plannedDepartureTime: o.route.plannedDepartureTime, // 🔥 ДОБАВЛЕНО: Прокидываем время из базы
            sortOrder: o.route.sortOrder || 0
          });
        }
        routesMap.get(o.route.id).orders.push(o);
      }
    });

    routesMap.forEach(route => {
      route.orders.sort((a: DashboardOrder, b: DashboardOrder) => (a.routeOrder ?? 0) - (b.routeOrder ?? 0));
    });

    return Array.from(routesMap.values()).sort((a, b) => {
      // 🔥 Сначала сортируем по нашему кастомному порядку
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;

      const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return b.name.localeCompare(a.name);
    });
  }, [orders, filterDate]);

  // ==========================================
  // 🔥 ФУНКЦИИ ДЛЯ DRAG AND DROP
  // ==========================================
  const handleRouteDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("routeId", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleRouteDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleRouteDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("routeId");
    if (!sourceId || sourceId === targetId) return;

    // Клонируем список маршрутов для расчета новых индексов
    const items = [...existingRoutes];
    const sourceIdx = items.findIndex(r => r.id === sourceId);
    const targetIdx = items.findIndex(r => r.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    // Переставляем элементы в массиве
    const [movedItem] = items.splice(sourceIdx, 1);
    items.splice(targetIdx, 0, movedItem);

    // Рассчитываем новые sortOrder
    const payload = items.map((r, i) => ({ id: r.id, sortOrder: i }));

    // Отправляем запрос на сохранение нового порядка
    try {
      await fetch('/api/routes/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      });
      fetchData(); // Перезапрашиваем данные с бэкенда для обновления UI
    } catch (err) {
      console.error("Ошибка при сортировке маршрутов", err);
    }
  };

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

    const base = baseCoordsFor(validOrders[0]?.shop);
    const points = [base, ...validOrders.map(o => [o.lat!, o.lng!])];
    points.push(base); // всегда, чтобы знать время возврата

    setIsCalculatingRoute(true); setDepartureAdvice(null);
    let multiRoute: any = null;

    const parseYandexTimeMs = (text: string) => {
      if (!text || text === "—") return 0;
      let ms = 0;
      const hMatch = text.match(/(\d+)\s*ч/);
      if (hMatch) ms += parseInt(hMatch[1], 10) * 3600000;
      const mMatch = text.match(/(\d+)\s*мин/);
      if (mMatch) ms += parseInt(mMatch[1], 10) * 60000;
      // 🔥 Теперь пешему прибавляем 1 минуту на точку
      return routeType === "auto" ? ms + (12 * 60 * 1000) : ms + (4 * 60 * 1000);
    };

    const timer = setTimeout(() => {
      multiRoute = new ymapsAny.multiRouter.MultiRoute({
        referencePoints: points, params: { routingMode: routeType === 'mt' ? 'masstransit' : 'auto' }
      }, { boundsAutoApply: false });

      multiRoute.model.events.add('requestsuccess', () => {
        const activeRoute = multiRoute.getActiveRoute();
        if (!activeRoute) { setIsCalculatingRoute(false); return; }

        const cleanHtml = (str: string) => str ? str.replace(/&#160;/g, " ") : "";
        const routeDuration = activeRoute.properties.get("durationInTraffic") || activeRoute.properties.get("duration");

        setRouteTotals({
          time: cleanHtml(routeDuration?.text || "—"),
          dist: cleanHtml(activeRoute.properties.get("distance")?.text || "—"),
        });

        const legsArr: string[] = [];
        const legDurationsMin: number[] = [];

        activeRoute.getPaths().each((path: any) => {
          const legDuration = path.properties.get("durationInTraffic") || path.properties.get("duration");
          const textStr = cleanHtml(legDuration?.text || "—");
          legsArr.push(textStr);
          legDurationsMin.push(parseYandexTimeMs(textStr) / 60000);
        });

        const adviceData = getOptimalDeparture(validOrders, legDurationsMin);

        if (adviceData) {
          const extId = adviceData.anchorOrder.externalId ?? adviceData.anchorOrder.crmId;
          if (adviceData.isShifted) {
            setDepartureAdvice(`Выехать до ${adviceData.departureTime} — оптимально к началу слота ${adviceData.anchorIndex + 1}-го заказа (зак. ${extId})`);
          } else {
            setDepartureAdvice(`Выехать до ${adviceData.departureTime} — первый заказ к ${adviceData.anchorOrder.slotFrom} (зак. ${extId})`);
          }
        } else {
          setDepartureAdvice("Слоты не строгие — выезд в любое время");
        }

        setRouteLegs(legsArr);
        setIsCalculatingRoute(false);
      });
    }, 800);

    return () => { clearTimeout(timer); if (multiRoute) multiRoute.destroy(); };
  }, [bulkSelectedIds, routeType, returnToBase, routeTab, isBulkMode, isMobile]);

  const calculatedEtasData = useMemo(() => {
    const etas: Record<string, { type: string, timeStr: string, color: string }> = {};
    let baseReturnTime = "—";
    if (selectedRouteOrders.length === 0 || routeLegs.length === 0) return { etas, baseReturnTime };

    const parseYandexTimeMs = (text: string) => {
      if (!text || text === "—") return 0;
      let ms = 0;
      const hMatch = text.match(/(\d+)\s*ч/);
      if (hMatch) ms += parseInt(hMatch[1], 10) * 3600000;
      const mMatch = text.match(/(\d+)\s*мин/);
      if (mMatch) ms += parseInt(mMatch[1], 10) * 60000;
      // 🔥 Теперь пешему прибавляем 1 минуту на точку
      return routeType === "auto" ? ms + (4 * 60 * 1000) : ms + (4 * 60 * 1000);
    };

    const [year, month, day] = filterDate.split("-").map(Number);
    let currentRunningMs = new Date(year, month - 1, day, 10, 0, 0, 0).getTime();
    let foundFirstActive = false;

    const hasStarted = selectedRouteOrders.some((o: any) => o.status === "IN_DELIVERY" || o.status === "DELIVERED");
    const pickedUpTimes = selectedRouteOrders.map((o: any) => o.pickedUpAt).filter(Boolean);
    const actualDepartureMs = pickedUpTimes.length > 0 ? Math.min(...pickedUpTimes.map((d: string) => new Date(d).getTime())) : null;

    if (hasStarted && actualDepartureMs) {
      currentRunningMs = actualDepartureMs;
    } else if (!hasStarted && selectedRouteOrders.length > 0 && routeLegs.length > 0) {
      if (manualDepartureTime) {
        // 1. Если оператор задал время или нажал "Принять" — железно считаем от него
        const [bH, bM] = manualDepartureTime.split(':').map(Number);
        currentRunningMs = new Date(year, month - 1, day, bH, bM, 0, 0).getTime();
      } else {
        // 2. Если инпут пустой (новый маршрут), берем расчет ИИ чисто для красивого превью!
        const calcDep = departureAdvice?.match(/(\d{2}:\d{2})/)?.[0];
        if (calcDep) {
          const [bH, bM] = calcDep.split(':').map(Number);
          currentRunningMs = new Date(year, month - 1, day, bH, bM, 0, 0).getTime();
        } else {
          // 3. Если ИИ еще не посчитал (или сломался), фолбэк на текущее время
          currentRunningMs = Date.now();
        }
      }
    }

    selectedRouteOrders.forEach((o: any, index: number) => {
      const legMs = parseYandexTimeMs(routeLegs[index]);

      if (o.status === "DELIVERED") {
        const t = o.deliveredAt || o.changedAt || o.updatedAt;
        if (t) {
          currentRunningMs = new Date(t).getTime();
        } else {
          currentRunningMs += legMs;
        }
        etas[o.id] = {
          type: 'DELIVERED',
          timeStr: t ? new Date(t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : "—",
          color: "var(--color-green)"
        };
      } else if (o.status === "CANCELLED" || o.status === "RETURNED") {
        etas[o.id] = { type: 'SKIPPED', timeStr: "—", color: "var(--color-text-3)" };
      } else {
        currentRunningMs += (!foundFirstActive ? legMs : (5 * 60 * 1000) + legMs);
        foundFirstActive = true;

        if (o.slotFrom) {
          const [sH, sM] = o.slotFrom.split(':').map(Number);
          if (!isNaN(sH) && !isNaN(sM)) {
            const slotStartMs = new Date(year, month - 1, day, sH, sM, 0, 0).getTime();
            if (currentRunningMs < slotStartMs) {
              currentRunningMs = slotStartMs;
            }
          }
        }

        const timeStr = new Date(currentRunningMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
        etas[o.id] = { type: o.status, timeStr, color: o.status === "IN_DELIVERY" ? "#f59e0b" : "var(--color-accent)" };
      }

      if (index === selectedRouteOrders.length - 1 && routeLegs[selectedRouteOrders.length]) {
        const returnLegMs = parseYandexTimeMs(routeLegs[selectedRouteOrders.length]);
        baseReturnTime = new Date(currentRunningMs + returnLegMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      }
    });

    return { etas, baseReturnTime };
  }, [selectedRouteOrders, routeLegs, routeType, filterDate, editingRouteId, existingRoutes, departureAdvice, returnToBase, manualDepartureTime]);

  const calculatedEtas = calculatedEtasData.etas;

  // 🔥 ДОБАВЛЯЕМ ЭТОТ БЛОК


  const generateYandexUrl = (ordersToRoute: DashboardOrder[], type: "auto" | "mt", rtb: boolean) => {
    const validOrders = ordersToRoute.filter(o => o.lat && o.lng && !o.isInvalid);
    if (validOrders.length === 0) return null;
    if (validOrders.length > 50) validOrders.length = 50;

    // База магазина, а если её координат в БД нет — центр его города
    const [baseLat, baseLng] = baseCoordsFor(validOrders[0]?.shop);
    const base = `${baseLat},${baseLng}`;

    const rtextArr = [base, ...validOrders.map(o => `${o.lat},${o.lng}`)];
    if (rtb) rtextArr.push(base);
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

  async function handleDeleteRoute() {
    if (!editingRouteId) return;
    if (!window.confirm("Удалить маршрут полностью? Все точки снова станут свободными.")) return;

    setBulkSaving(true);
    try {
      const res = await fetch(`/api/routes/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [],
          courierId: bulkCourier,
          oldRouteId: editingRouteId
        })
      });
      if (!res.ok) throw new Error("Ошибка сервера");
      setBulkCourier(""); setBulkSelectedIds([]); setEditingRouteId(null);
      await fetchData();
      alert("✅ Маршрут удален!");
      setRouteTabMode("current");
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
        body: JSON.stringify({ routeDate: filterDate, selectedSlots: selectedSlots })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка сервера");

      await fetchData();
      alert(`✅ Создано маршрутов: ${data.routesCreated}.\n📦 Раскидано точек: ${data.ordersAssigned}.\n⚠️ Осталось нераспределенных: ${data.leftOver}`);
      setRouteTabMode("current");
    } catch (e: any) { alert(e.message || "Произошла ошибка при генерации"); }
    finally { setBulkSaving(false); }
  }

  const ROUTE_STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
    NEW: { label: "Новый", color: "#d94040", bg: "#fef2f2" },
    ASSIGNED: { label: "Назначен", color: "var(--color-accent-fg)", bg: "var(--color-accent-soft)" },
    ASSEMBLING: { label: "В сборке", color: "#d97706", bg: "var(--color-warn-bg)" }, // 🔥 Цвет для отображения
    IN_DELIVERY: { label: "🚀 В пути", color: "var(--color-green)", bg: "var(--color-ok-bg)" },
    DELIVERED: { label: "✅ Доставлен", color: "var(--color-text-2)", bg: "var(--color-bg)" },
    RETURNED: { label: "↩️ Возврат", color: "#d94040", bg: "#fef2f2" },
    CANCELLED: { label: "❌ Отменен", color: "var(--color-text-3)", bg: "var(--color-bg)" }
  };

  async function handleBulkAssign(isDraft = false) {
    if (!bulkCourier || bulkSelectedIds.length === 0) return;
    setBulkSaving(true);

    const etasPayload: Record<string, string> = {};
    for (const id of bulkSelectedIds) {
      if (calculatedEtas[id] && calculatedEtas[id].timeStr !== "—") {
        etasPayload[id] = calculatedEtas[id].timeStr;
      }
    }

    // 🔥 БЕРЕМ ВРЕМЯ СТРОГО ИЗ ИНПУТА. 
    // Если инпут пустой (человек не задал и не нажал "Принять"), в базу улетит null.
    const finalDepartureTime = manualDepartureTime || null;
    const finalReturnTime = calculatedEtasData.baseReturnTime !== "—"
      ? calculatedEtasData.baseReturnTime
      : null;

    try {
      const res = await fetch(`/api/routes/assign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: bulkSelectedIds,
          courierId: bulkCourier,
          routeType, returnToBase, oldRouteId: editingRouteId, departureAdvice, isDraft,
          routeEtas: etasPayload,
          routeDate: filterDate,
          plannedDepartureTime: finalDepartureTime,   // Строго инпут
          estimatedReturnTime: finalReturnTime,       // Авто-расчёт возврата
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

  const toggleSlot = (label: string) => {
    if (label === "all") setSelectedSlots([]);
    else setSelectedSlots((prev: string[]) => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
  };

  const renderRouteListPanel = () => (
    <div style={{ maxWidth: 600, margin: isMobile ? 0 : "0 auto", background: "var(--color-card)", borderRadius: 12, border: "1px solid var(--color-border)", padding: isMobile ? 16 : 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, color: "var(--color-text)" }}>Работа с маршрутами</h2>
        {!isMobile && <button onClick={() => { setIsBulkMode(false); setRouteTab("map"); }} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--color-text-3)", padding: "0 8px" }}>×</button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, background: "var(--color-bg)", padding: 4, borderRadius: 10 }}>
        <button
          onClick={() => {
            setRouteTabMode("new"); setEditingRouteId(null); setBulkSelectedIds([]); setBulkCourier("");
            setRouteType("mt");
            setManualDepartureTime(""); setIsDepartureEdited(false);
          }}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: routeTabMode === "new" ? "var(--color-card)" : "transparent", color: routeTabMode === "new" ? "var(--color-text)" : "var(--color-text-3)", boxShadow: routeTabMode === "new" ? "0 2px 8px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
        >
          {editingRouteId ? "✏️ Редактирование" : "Новый маршрут"}
        </button>
        <button
          onClick={() => { setRouteTabMode("current"); setEditingRouteId(null); }}
          style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", background: routeTabMode === "current" ? "var(--color-card)" : "transparent", color: routeTabMode === "current" ? "var(--color-text)" : "var(--color-text-3)", boxShadow: routeTabMode === "current" ? "0 2px 8px rgba(0,0,0,0.05)" : "none", transition: "all 0.2s" }}
        >
          Текущие ({existingRoutes.length})
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={handleAutoGenerateRoutes}
          disabled={bulkSaving}
          style={{ width: "100%", background: "linear-gradient(135deg, var(--color-accent) 0%, #7c4dff 100%)", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: bulkSaving ? "default" : "pointer", boxShadow: "0 4px 12px rgba(124, 77, 255, 0.3)", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, opacity: bulkSaving ? 0.7 : 1 }}
        >
          {bulkSaving ? "⏳ Сборка маршрутов..." : "✨ AI Авто-сборка черновиков"}
        </button>
      </div>

      {routeTabMode === "current" && (
        <ErrorBoundary label="Текущие маршруты">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {existingRoutes.length === 0 && <div style={{ textAlign: "center", color: "var(--color-text-3)", padding: 20 }}>Нет маршрутов на {filterDate}</div>}
          {existingRoutes.map((r: any) => {
            // Подстраховка: дальше по карточке r.orders используется семь раз
            // без проверок, и одна запись без заказов роняла весь список
            const rOrders: any[] = Array.isArray(r.orders) ? r.orders : [];
            const isDraft = r.isDraft;
            const rCourier = dbCouriers.find(c => String(c.id) === String(r.courierId));
            const typeIcon = rCourier?.isAuto ? "🚗" : "🚶‍♂️";
            const courierName = courierOptions.find(c => String(c.value) === String(r.courierId))?.label || "Неизвестен";

            const deliveredCount = rOrders.filter((o: any) => o.status === "DELIVERED").length;

            const pickedUpTimes = rOrders.map((o: any) => o.pickedUpAt).filter(Boolean);
            const actualDepartureMs = pickedUpTimes.length > 0 ? Math.min(...pickedUpTimes.map((d: string) => new Date(d).getTime())) : null;
            const estimatedBaseReturn = r.estimatedReturnTime;
            const isAllDelivered = rOrders.length > 0 && rOrders.every((o: any) => o.status === "DELIVERED");

            // 1. Считаем время завершения маршрута
            let finishedMs: number | null = null;
            if (isAllDelivered) {
              const deliveryTimes = rOrders.map((o: any) => o.deliveredAt ? new Date(o.deliveredAt).getTime() : new Date(o.changedAt || o.updatedAt).getTime()).filter((t: number) => !isNaN(t));
              finishedMs = deliveryTimes.length > 0 ? Math.max(...deliveryTimes) : null;
            }

            // 🔥 2. ВОТ ТОТ САМЫЙ delaysCount, который потерялся
            const delaysCount = rOrders.filter((o: any) => {
              if (["DELIVERED", "RETURNED", "CANCELLED"].includes(o.status)) return false;
              if (o.eta && o.slotTo) {
                const [eH, eM] = o.eta.split(':').map(Number);
                const [sH, sM] = o.slotTo.split(':').map(Number);
                if (!isNaN(eH) && !isNaN(sH)) {
                  return (eH * 60 + eM) > (sH * 60 + sM);
                }
              }
              return false;
            }).length;


            return (
              <div
                key={r.id}
                draggable // 🔥 РАЗРЕШАЕМ ПЕРЕТАСКИВАТЬ
                onDragStart={(e) => handleRouteDragStart(e, r.id)}
                onDragOver={handleRouteDragOver}
                onDrop={(e) => handleRouteDrop(e, r.id)}
                onClick={() => {
                  setBulkSelectedIds(rOrders.map((o: any) => o.id));
                  setBulkCourier(String(r.courierId));
                  setEditingRouteId(r.id);
                  setRouteTabMode("new");
                  setRouteType(rCourier?.isAuto ? "auto" : "mt");

                  // 🔥 Подгружаем время из редактируемого маршрута
                  setManualDepartureTime(r.plannedDepartureTime || "");
                  setIsDepartureEdited(!!r.plannedDepartureTime);
                }}
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 10, transition: "all 0.2s" }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {/* Иконка Drag & Drop */}
                  <div style={{ fontSize: 16, color: "#d1d5db", cursor: "grab", marginTop: 2, paddingRight: 4 }} title="Потяните для изменения порядка">
                    ⠿
                  </div>

                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {typeIcon} {r.name}

                      {isDraft && <span style={{ background: "#fef3c7", color: "#d97706", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Черновик</span>}

                      {/* СТАТУС ПРИНЯТИЯ */}
                      {!isDraft && (
                        r.isAccepted ? (
                          <span style={{ background: "var(--color-ok-bg)", color: "var(--color-green)", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, border: "1px solid #a7f3d0", display: "flex", alignItems: "center", gap: 4 }}>
                            ✅ Принят
                          </span>
                        ) : (
                          <span style={{ background: "var(--color-warn-bg)", color: "#d97706", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, border: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 4 }}>
                            ❓ Ожидает
                          </span>
                        )
                      )}

                      {/* 🔥 ДОБАВЛЕНО: Время выезда + ориентир на 1-й заказ */}
                      {r.plannedDepartureTime && (
                        <span style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-fg)", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, border: "1px solid #bfdbfe" }}>
                          ⏱ Выезд: {r.plannedDepartureTime} {rOrders[0]?.slotFrom ? `(1-й к ${rOrders[0].slotFrom})` : ''}
                        </span>
                      )}

                      {delaysCount > 0 && (
                        <span style={{ background: "#fef2f2", color: "#d94040", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700, border: "1px solid #fecaca" }}>
                          ⚠️ Опаздывает ({delaysCount})
                        </span>
                      )}

                      <span style={{ fontSize: 11, color: "var(--color-text-3)", fontWeight: 500 }}>
                        изм. {r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : "—"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-2)", marginTop: 4 }}>
                      Курьер: {courierName} · {deliveredCount}/{rOrders.length} точек
                    </div>

                    {(actualDepartureMs || finishedMs || r.baseArrivalTime || estimatedBaseReturn) && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>

                        {actualDepartureMs && (
                          <span style={{ fontSize: 11, background: "var(--color-warn-bg)", color: "#d97706", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #fde68a" }}>
                            📦 Выехал: {new Date(actualDepartureMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}

                        {r.baseArrivalTime && (
                          <span style={{ fontSize: 11, background: "var(--color-accent-soft)", color: "var(--color-accent-fg)", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #bfdbfe" }}>
                            🏠 На базе: {r.baseArrivalTime}
                          </span>
                        )}

                        {finishedMs && (
                          <span style={{ fontSize: 11, background: "var(--color-ok-bg)", color: "var(--color-green)", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #a7f3d0" }}>
                            ✅ Завершил: {new Date(finishedMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}

                        {estimatedBaseReturn && (
                          <span style={{ fontSize: 11, background: "var(--color-bg)", color: "var(--color-text-3)", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid var(--color-border)" }}>
                            🏠 Возврат: {estimatedBaseReturn}</span>
                        )}

                      </div>
                    )}
                  </div>
                </div>
                {/* Правая колонка: карандаш сверху, «На карте» прижата вниз */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", flexShrink: 0, gap: 8 }}>
                  <div style={{ fontSize: 20, color: "var(--color-text-3)" }}>✏️</div>

                  {/* Открывает маршрут в Яндекс.Картах — ровно как кнопка
                      внутри маршрута. Карточка помечена draggable, и нажатие
                      на дочерний элемент браузер трактует как начало
                      перетаскивания: без draggable={false} и гашения
                      mousedown клик до кнопки не доходил, срабатывал только
                      onClick самой карточки. */}
                  <button
                    type="button"
                    draggable={false}
                    onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      openRouteInYandex(r, rCourier);
                    }}
                    title={`Открыть в Яндекс.Картах (${rCourier?.isAuto ? "на авто" : "транспорт"})`}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 9px", borderRadius: 7,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-card)",
                      color: "var(--color-text-2)",
                      fontSize: 11, fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    🗺️ В Яндексе
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        </ErrorBoundary>
      )}

      {routeTabMode === "new" && (
        <>
          {editingRouteId && (
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-accent-fg)" }}>Редактирование маршрута</span>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={handleDeleteRoute} disabled={bulkSaving} style={{ background: "none", border: "none", color: "#d94040", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑 Удалить</button>
                <button onClick={() => { setEditingRouteId(null); setBulkSelectedIds([]); setRouteTabMode("current"); }} style={{ background: "none", border: "none", color: "var(--color-text-2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Отменить</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, marginBottom: 16, background: "var(--color-bg)", padding: "6px 8px", borderRadius: 8, alignItems: isMobile ? "stretch" : "center" }}>
            <div style={{ display: "flex", gap: 4, flex: 1 }}>
              <button onClick={() => setRouteType("auto")} style={{ ...s.actionBtn, flex: 1, background: routeType === "auto" ? "var(--color-card)" : "transparent", color: routeType === "auto" ? "var(--color-text)" : "var(--color-text-3)", boxShadow: routeType === "auto" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚗 На авто</button>
              <button onClick={() => setRouteType("mt")} style={{ ...s.actionBtn, flex: 1, background: routeType === "mt" ? "var(--color-card)" : "transparent", color: routeType === "mt" ? "var(--color-text)" : "var(--color-text-3)", boxShadow: routeType === "mt" ? "0 1px 3px rgba(0,0,0,0.1)" : "none", padding: "6px 14px", borderRadius: 6 }}>🚌 Транспорт</button>
            </div>
            <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "var(--color-text)", fontWeight: 600, padding: isMobile ? "4px 6px" : 0 }}>
              <input type="checkbox" checked={returnToBase} onChange={e => setReturnToBase(e.target.checked)} style={{ accentColor: "var(--color-accent)", width: 16, height: 16 }} />
              Вернуться на базу
            </label>
          </div>

          {routeTotals && (
            <div style={{ fontSize: 13, color: "var(--color-text)", background: "var(--color-accent-soft)", padding: "12px 14px", borderRadius: 8, marginBottom: 16, fontWeight: 600 }}>
              {isCalculatingRoute
                ? "⏳ Считаем время в пути..."
                : `🏁 Итого: ~${routeTotals.time} (${routeTotals.dist})`}

              {!isCalculatingRoute && departureAdvice && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--color-accent-fg)", fontWeight: 700 }}>💡 Выезд:</span>


                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>

                      {/* 🔥 КАСТОМНЫЙ ГИБРИД: Текстовый ввод + Ручной Dropdown */}
                      <div style={{ position: "relative", width: 86, flexShrink: 0 }}>
                        <input
                          type="text"
                          placeholder="--:--"
                          maxLength={5}
                          value={manualDepartureTime || ""}
                          // Скрываем меню, как только диспетчер начинает печатать руками
                          onFocus={() => setShowTimeDropdown(false)}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^\d:]/g, "");
                            const isDeleting = (e.nativeEvent as InputEvent).inputType === "deleteContentBackward";
                            if (val.length === 2 && !val.includes(":") && !isDeleting) {
                              val += ":";
                            }
                            setManualDepartureTime(val);
                          }}
                          style={{
                            padding: "4px 24px 4px 6px", // Место под кастомную стрелочку
                            borderRadius: 6, border: "1px solid var(--color-accent-fg)",
                            outline: "none", fontWeight: 700, fontFamily: "monospace",
                            fontSize: 13, color: "var(--color-accent-fg)", background: "var(--color-card)",
                            width: "100%"
                          }}
                        />

                        {/* Кастомная область клика для стрелочки */}
                        <div
                          onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                          style={{
                            position: "absolute", right: 0, top: 0, bottom: 0, width: 24,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: "var(--color-accent-fg)", fontSize: 10
                          }}
                        >
                          ▼
                        </div>

                        {/* Наше меню, которое показывается ТОЛЬКО если showTimeDropdown === true */}
                        {showTimeDropdown && (
                          <>
                            {/* Невидимая подложка на весь экран, чтобы меню закрывалось по клику вне его */}
                            <div
                              style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                              onClick={() => setShowTimeDropdown(false)}
                            />

                            <div style={{
                              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4,
                              background: "var(--color-card)", border: "1px solid var(--color-accent-fg)", borderRadius: 6,
                              zIndex: 100, maxHeight: 180, overflowY: "auto",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
                            }}>
                              {(() => {
                                const times = [];
                                const calcTime = departureAdvice?.match(/(\d{2}:\d{2})/)?.[0];

                                if (calcTime) {
                                  const [h, m] = calcTime.split(':').map(Number);
                                  const centerMins = h * 60 + m;
                                  const startMins = Math.floor((centerMins - 60) / 10) * 10;
                                  const endMins = Math.ceil((centerMins + 60) / 10) * 10;

                                  for (let mins = Math.max(0, startMins); mins <= Math.min(1430, endMins); mins += 10) {
                                    const hh = Math.floor(mins / 60);
                                    const mm = mins % 60;
                                    times.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
                                  }
                                  if (!times.includes(calcTime)) times.push(calcTime);
                                } else {
                                  for (let h = 8; h <= 23; h++) {
                                    for (let m = 0; m < 60; m += 10) {
                                      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                                    }
                                  }
                                }

                                if (manualDepartureTime && manualDepartureTime.length === 5 && !times.includes(manualDepartureTime)) {
                                  times.push(manualDepartureTime);
                                }
                                times.sort();

                                return times.map(t => (
                                  <div
                                    key={t}
                                    onClick={() => { setManualDepartureTime(t); setShowTimeDropdown(false); }}
                                    style={{
                                      padding: "6px 10px", cursor: "pointer", fontSize: 13,
                                      fontWeight: 700, color: t === manualDepartureTime ? "var(--color-accent)" : "var(--color-text)",
                                      background: t === manualDepartureTime ? "#f0f5ff" : "transparent",
                                      borderBottom: "1px solid #f0f0f0", transition: "background 0.1s"
                                    }}
                                    onMouseEnter={e => { if (t !== manualDepartureTime) e.currentTarget.style.background = "#f8f9fa"; }}
                                    onMouseLeave={e => { if (t !== manualDepartureTime) e.currentTarget.style.background = "transparent"; }}
                                  >
                                    {t}
                                  </div>
                                ));
                              })()}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Кнопка сброса / возврата времени из БД */}
                      {(() => {
                        const dbTime = (editingRouteId
                          ? existingRoutes.find((r: any) => r.id === editingRouteId)
                          : null)?.plannedDepartureTime || "";
                        if (manualDepartureTime === dbTime) return null;
                        return (
                          <button
                            onClick={() => setManualDepartureTime(dbTime)}
                            title={dbTime ? `Вернуть: ${dbTime}` : "Очистить"}
                            style={{
                              background: "none", border: "none", color: "var(--color-text-3)",
                              cursor: "pointer", fontSize: 16, padding: "0 2px", lineHeight: 1,
                              opacity: 0.7, transition: "opacity 0.15s", flexShrink: 0
                            }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
                          >
                            {dbTime ? "↺" : "×"}
                          </button>
                        );
                      })()}
                    </div>

                    {/* Кликабельный чип с расчётным временем */}
                    {(() => {
                      const calcTime = departureAdvice.match(/(\d{2}:\d{2})/)?.[0];
                      if (!calcTime || calcTime === manualDepartureTime) return null;
                      return (
                        <button
                          onClick={() => setManualDepartureTime(calcTime)}
                          title="Принять расчётное время"
                          style={{
                            background: "#f0f5ff", border: "1px dashed #93b4ff",
                            color: "var(--color-accent-fg)", padding: "3px 9px", borderRadius: 20,
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                            transition: "all 0.15s"
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "#ddeaff"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "#f0f5ff"; }}
                        >
                          ≈ {calcTime}
                        </button>
                      );
                    })()}
                  </div>

                  {/* Описание — без времени, приглушённо */}
                  <span style={{ fontSize: 11, color: "var(--color-text-2)", paddingLeft: 2 }}>
                    {departureAdvice.replace(/Выехать до \d{2}:\d{2}/, "").replace(/^[\s—–]+/, "").trim()}
                  </span>

                </div>
              )}

              {!isCalculatingRoute && returnToBase && calculatedEtasData.baseReturnTime !== "—" && (
                <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-3)", fontWeight: 600 }}>
                  🏠 Расчётное время на базе: {calculatedEtasData.baseReturnTime}
                </div>
              )}
            </div>
          )}

          {/* 🔥 НОВЫЙ БЛОК: ФОЛБЭК РУЧНОГО ВВОДА */}
          {/* Показывается, если выбраны точки, но routeTotals от Яндекса так и не пришел */}
          {bulkSelectedIds.length > 0 && !routeTotals && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "var(--color-danger-bg)", padding: "10px 14px", borderRadius: 8, border: "1px dashed #fecaca" }}>
              <span style={{ fontSize: 12, color: "#d94040", fontWeight: 700 }}>
                {isCalculatingRoute ? "⏳ Ждем Яндекс..." : "⚠️ Яндекс недоступен."} Укажите выезд:
              </span>
              <input
                type="text"
                placeholder="10:00"
                maxLength={5}
                value={manualDepartureTime || ""}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^\d:]/g, "");
                  const isDeleting = (e.nativeEvent as any).inputType === "deleteContentBackward";
                  if (val.length === 2 && !val.includes(":") && !isDeleting) {
                    val += ":";
                  }
                  setManualDepartureTime(val);
                }}
                style={{
                  padding: "4px 8px", borderRadius: 6, border: "1px solid #f87171",
                  outline: "none", fontWeight: 700, fontFamily: "monospace",
                  fontSize: 13, color: "#b91c1c", width: 60, background: "var(--color-card)"
                }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexDirection: "column" }}>
            <button onClick={optimizeRoute} style={{ ...s.actionBtn, background: "#f4f7ff", color: "var(--color-accent-fg)", border: "1px solid #c9d8ff" }}>✨ Умная оптимизация (Время + Расстояние)</button>
            {selectedRouteOrders.length > 0 && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleOpenRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "var(--color-card)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>🗺️ Открыть в Яндексе</button>
                <button onClick={() => handleShareRoute(selectedRouteOrders)} style={{ ...s.actionBtn, flex: 1, background: "var(--color-card)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>🔗 Скопировать ссылку</button>
              </div>
            )}
          </div>

          <div style={{ background: "var(--color-surface)", padding: 16, borderRadius: 8, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>Курьер</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <CourierSearchSelect
                  value={bulkCourier}
                  onChange={(newCourierId) => {
                    setBulkCourier(newCourierId);
                    if (newCourierId) {
                      const courier = dbCouriers.find(c => String(c.id) === String(newCourierId));
                      if (courier) {
                        setRouteType(courier.isAuto ? "auto" : "mt");
                      }
                    }
                  }}
                  options={courierOptions.map(c => ({ value: String(c.value), label: c.label }))}
                />
              </div>

              <button
                style={{
                  ...s.actionBtn,
                  flex: isMobile ? "1 1 100%" : "1 1 auto",
                  background: bulkCourier && bulkSelectedIds.length > 0 ? 'var(--color-border)' : 'var(--color-bg)',
                  color: bulkCourier && bulkSelectedIds.length > 0 ? 'var(--color-text)' : 'var(--color-text-3)',
                  whiteSpace: 'nowrap'
                }}
                disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving}
                onClick={() => handleBulkAssign(true)}
              >
                📝 В черновик
              </button>

              <button
                style={{
                  ...s.actionBtn,
                  flex: isMobile ? "1 1 100%" : "1 1 auto",
                  minWidth: 120,
                  background: bulkCourier && bulkSelectedIds.length > 0 ? 'var(--color-accent)' : 'var(--color-border)',
                  color: bulkCourier && bulkSelectedIds.length > 0 ? '#fff' : 'var(--color-text-3)'
                }}
                disabled={!bulkCourier || bulkSelectedIds.length === 0 || bulkSaving}
                onClick={() => handleBulkAssign(false)}
              >
                {bulkSaving ? "..." : (editingRouteId ? "Сохранить" : "Создать")}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: "var(--color-text-3)", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>
            Очередь доставки ({selectedRouteOrders.filter((o: any) => o.status === "DELIVERED").length}/{bulkSelectedIds.length})
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {(() => {
              const pickedUpTimes = selectedRouteOrders.map((o: any) => o.pickedUpAt).filter(Boolean);
              const actualDepartureMs = pickedUpTimes.length > 0 ? Math.min(...pickedUpTimes.map((d: string) => new Date(d).getTime())) : null;

              const departureUI = actualDepartureMs ? (
                <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 800, marginBottom: 8, paddingLeft: 8, display: "flex", alignItems: "center", gap: 6, background: "var(--color-warn-bg)", padding: "8px 12px", borderRadius: 8, border: "1px solid #fde68a" }}>
                  📦 Забрал в {new Date(actualDepartureMs).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                </div>
              ) : null;

              return (
                <>
                  {departureUI}
                  {selectedRouteOrders.map((o: any, index: number) => {
                    const color = slotColor(o);
                    const st = ROUTE_STATUS_MAP[o.status] || ROUTE_STATUS_MAP.NEW;
                    const etaInfo = calculatedEtas[o.id] || { type: "NEW", timeStr: "—", color: "var(--color-accent-fg)" };

                    const isLateCalc = o.slotTo && etaInfo.timeStr !== "—" && parseTime(etaInfo.timeStr) > parseTime(o.slotTo);
                    const displayColor = isLateCalc ? "#d94040" : etaInfo.color;

                    // 🔥 1. РОЛЕВАЯ МОДЕЛЬ ДЛЯ ПОДСВЕТКИ
                    const showWarning = (user.role === "ADMIN" || user.role === "OPERATOR") && o.isInvalid && !/самовывоз|большой афанасьевский/i.test(o.address || "");
                    const showRedBg = user.role === "ADMIN" && showWarning;

                    return (
                      <React.Fragment key={o.id}>
                        {routeLegs[index] && (
                          <div style={{ fontSize: 12, color: displayColor, paddingLeft: 46, paddingBottom: 6, fontWeight: 700 }}>
                            {etaInfo.type === 'DELIVERED' ? `✅ Доставлен в ${etaInfo.timeStr}` :
                              etaInfo.type === 'SKIPPED' ? `❌ Отменен / Возврат` :
                                (isLateCalc ? `⏰ Опаздывает (будет в ${etaInfo.timeStr})` : `↓ Ожидается в ${etaInfo.timeStr} (в пути ${routeLegs[index]})`)}
                          </div>
                        )}

                        {/* 🔥 2. ПРИМЕНЯЕМ ФОН ТОЛЬКО ДЛЯ АДМИНА */}
                        <div style={{ padding: "10px 12px 10px 16px", background: o.status === "IN_DELIVERY" ? "var(--color-warn-bg)" : (showRedBg ? "var(--color-danger-bg)" : "var(--color-card)"), border: showRedBg ? "1px solid #fecaca" : "1px solid var(--color-border)", borderRadius: 8, display: "flex", gap: 12, alignItems: "center", position: "relative", overflow: "hidden" }}>
                          <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 4, background: color }} />

                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button disabled={index === 0} onClick={() => moveBulkItem(index, 'up')} style={{ background: "none", border: "none", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, fontSize: 11, padding: 2, color: "var(--color-text-2)" }}>▲</button>
                            <button disabled={index === selectedRouteOrders.length - 1} onClick={() => moveBulkItem(index, 'down')} style={{ background: "none", border: "none", cursor: index === selectedRouteOrders.length - 1 ? "default" : "pointer", opacity: index === selectedRouteOrders.length - 1 ? 0.3 : 1, fontSize: 11, padding: 2, color: "var(--color-text-2)" }}>▼</button>
                          </div>

                          <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{index + 1}</div>

                          <div style={{ flex: 1, overflow: "hidden" }}>

                            {/* 🔥 3. АДРЕС И УВЕДОМЛЕНИЕ ДЛЯ ОПЕРАТОРА И АДМИНА */}
                            <div style={{ fontSize: 13, fontWeight: 600, color: showRedBg ? "#d94040" : "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {showWarning && "⚠️ "} {o.address}
                            </div>

                            {showWarning && o.invalidReason && (
                              <div style={{ fontSize: 10, color: "#d94040", fontWeight: 700, marginTop: 2 }}>
                                {o.invalidReason}
                              </div>
                            )}

                            <div style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                              <div>
                                Слот: <span style={{ color, fontWeight: 700 }}>{o.slotRaw}</span> · {o.externalId ?? o.crmId}
                              </div>

                              {o.eta && (
                                <div>
                                  <span style={{ color: o.status === "DELIVERED" ? "var(--color-text-3)" : (isLateCalc ? "#d94040" : "var(--color-accent)"), fontWeight: 700 }}>
                                    {isLateCalc ? "⏰ " : "⏱ "}План: {o.eta}
                                  </span>
                                </div>
                              )}

                              {o.status === "DELIVERED" && (
                                <div>
                                  <span style={{ color: "var(--color-green)", fontWeight: 700 }}>
                                    ✓ Факт: {o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString("ru", { hour: '2-digit', minute: '2-digit' }) : (o.changedAt ? new Date(o.changedAt).toLocaleTimeString("ru", { hour: '2-digit', minute: '2-digit' }) : "—")}
                                  </span>
                                </div>
                              )}
                            </div>

                            <select
                              value={o.status}
                              onChange={(e) => handleQuickStatusChange(o.id, e.target.value, etaInfo.timeStr)}
                              style={{ background: st.bg, color: st.color, border: "none", padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, outline: "none", cursor: "pointer", marginTop: 6, display: "block" }}
                            >
                              <option value="NEW">Новый</option>
                              <option value="ASSIGNED">Назначен</option>
                              <option value="ASSEMBLING">В сборке</option>
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
                </>
              );
            })()}

            {routeLegs[selectedRouteOrders.length] && (
              <div style={{ fontSize: 11, color: "var(--color-text-3)", paddingLeft: 46, paddingTop: 4 }}>
                ↓ {routeLegs[selectedRouteOrders.length]} возврат на базу (Прибытие: {calculatedEtasData.baseReturnTime})
              </div>
            )}
            {selectedRouteOrders.length === 0 && <div style={{ fontSize: 13, color: "var(--color-text-3)", textAlign: "center", padding: 20 }}>Отметьте точки на карте</div>}
          </div>
        </>
      )}
    </div>
  );
  // 🔥 ЕДИНЫЙ СТИЛЬ ДЛЯ ВСЕХ ФИЛЬТРОВ И КНОПОК ВЕРХНЕЙ ПАНЕЛИ
  const topbarBtnStyle: React.CSSProperties = {
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    background: "var(--color-card)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    boxSizing: "border-box",
    boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
  };
  /**
   * Открыть маршрут в Яндекс.Картах — то же, что кнопка «Открыть в Яндексе»
   * внутри маршрута.
   *
   * Ссылка строится тем же generateYandexUrl, но тип берётся не из
   * состояния routeType (оно относится к маршруту, открытому в редакторе),
   * а из признака isAuto самого курьера этой карточки: auto для машины,
   * mt для остальных. Возврат на базу — из настройки маршрута.
   */
  const openRouteInYandex = (r: any, rCourier?: DbCourier) => {
    const routeOrders: DashboardOrder[] = Array.isArray(r.orders) ? r.orders : [];
    const type: "auto" | "mt" = rCourier?.isAuto ? "auto" : "mt";

    const url = generateYandexUrl(routeOrders, type, returnToBase);
    if (!url) {
      alert("Нет координат для построения маршрута");
      return;
    }
    // _blank: на телефоне Яндекс перехватит ссылку и откроет приложение,
    // на десктопе откроется сайт — и в обоих случаях дашборд остаётся
    window.open(url, "_blank");
  };

  /** Плашка сводки: заказы и курьеры на смене. */
  const StatsChip = ({ compact }: { compact?: boolean }) => (
    <div
      style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: compact ? 8 : 10,
        padding: "0 10px",
        borderRadius: 8,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
      title={
        `Заказов на ${filterDate.split("-").reverse().join(".")}: ${dayStats.orders}` +
        (dayStats.unassigned > 0 ? `, из них без курьера: ${dayStats.unassigned}` : "") +
        `. Курьеров на смене: ${dayStats.couriers}, из них с заказами: ${dayStats.couriersBusy}`
      }
    >
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12 }}>📦</span>
        <span style={{ color: "var(--color-text)" }}>{dayStats.orders}</span>
        {/* Без курьера — то, что горит. Показываем только когда такие есть */}
        {dayStats.unassigned > 0 && (
          <span style={{ color: "#d94040", fontSize: 12 }}>({dayStats.unassigned})</span>
        )}
      </span>

      <span style={{ width: 1, height: 16, background: "var(--color-border)" }} />

      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 12 }}>🚚</span>
        <span style={{ color: "var(--color-text)" }}>{dayStats.couriers}</span>
        <span style={{ color: "var(--color-text-3)", fontSize: 12 }}>({dayStats.couriersBusy})</span>
      </span>
    </div>
  );

  return (
    <div style={isMobile ? sm.app : s.app}>

      <div
        style={isMobile ? sm.topbar : s.topbar}
        className="hide-scrollbar"
        onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault(); }}
      >
        {/* 1. Логотип */}
        <Link href="/about" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ ...s.logo, gap: isMobile ? 0 : 7 }}>
            <img src="/favicon.svg" alt="Logo" style={{ width: 22, height: 22 }} />
            {!isMobile && "ADelivo"}
          </div>
        </Link>

        {/* 2. Меню разделов.
            «Заказы» и «Курьеры» переехали сюда из топбара: они занимали
            место, которого на мобильном не хватало фильтрам и датам,
            а нажимают их несколько раз за смену, не постоянно. */}
        <AppMenu role={user.role} isSuperAdmin={user.isSuperAdmin} compact={isMobile} />

        {/* 🔥 ПОКАЗЫВАЕМ ЭТО ТОЛЬКО НА ДЕСКТОПЕ (На мобилке они уедут во 2-й ряд) */}
        {!isMobile && (
          <>
            {/* Календарь (Десктоп) */}
            <div style={{ position: "relative", zIndex: 110 }}>
              <DatePicker
                locale={ru}
                selected={new Date(filterDate)}
                onChange={(date: Date | null) => {
                  if (date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setFilterDate(`${y}-${m}-${d}`);
                  }
                }}
                dateFormat="dd.MM.yyyy"
                customInput={<CustomDateInput />}
                popperPlacement="bottom-start"
              />
            </div>

            {/* МУЛЬТИ-ФИЛЬТР СТАТУСОВ */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                style={{ ...topbarBtnStyle, background: selectedStatuses.length > 0 ? "var(--color-accent-soft)" : "var(--color-card)", borderColor: selectedStatuses.length > 0 ? "var(--color-accent)" : "var(--color-border)" }}
              >
                <span style={{ color: selectedStatuses.length > 0 ? "var(--color-accent)" : "inherit" }}>
                  Статусы: {selectedStatuses.length === 0 ? "Все" : `(${selectedStatuses.length})`}
                </span>
                <span style={{ fontSize: 10, color: selectedStatuses.length > 0 ? "var(--color-accent)" : "var(--color-text-3)" }}>▼</span>
              </button>

              {isStatusMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setIsStatusMenuOpen(false)} />
                  <div style={s.dropdownMenu}>
                    {["NEW", "ASSIGNED", "ASSEMBLING", "IN_DELIVERY", "DELIVERED"].map(st => (
                      <label key={st} style={s.dropdownItem}>
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(st)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedStatuses([...selectedStatuses, st]);
                            else setSelectedStatuses(selectedStatuses.filter(item => item !== st));
                          }}
                          style={{ accentColor: "var(--color-accent)", width: 16, height: 16 }}
                        />
                        {st === "NEW" ? "Новые" : st === "ASSIGNED" ? "Назначены" : st === "ASSEMBLING" ? "В сборке" : st === "IN_DELIVERY" ? "В пути" : "Доставлены"}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* МУЛЬТИ-ФИЛЬТР КУРЬЕРОВ */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setIsCourierMenuOpen(!isCourierMenuOpen)}
                style={{ ...topbarBtnStyle, background: selectedCouriers.length > 0 ? "var(--color-accent-soft)" : "var(--color-card)", borderColor: selectedCouriers.length > 0 ? "var(--color-accent)" : "var(--color-border)" }}
              >
                <span style={{ color: selectedCouriers.length > 0 ? "var(--color-accent)" : "inherit" }}>
                  Курьеры: {selectedCouriers.length === 0 ? "Все" : `(${selectedCouriers.length})`}
                </span>
                <span style={{ fontSize: 10, color: selectedCouriers.length > 0 ? "var(--color-accent)" : "var(--color-text-3)" }}>▼</span>
              </button>

              {isCourierMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setIsCourierMenuOpen(false)} />
                  <div style={{ ...s.dropdownMenu, minWidth: 220 }}>
                    {courierOptions.map(c => {
                      if (c.value === "ALL") {
                        return (
                          <label key="ALL" style={{ ...s.dropdownItem, fontWeight: 700, borderBottom: "1px solid #f0efe9", paddingBottom: 8, marginBottom: 4 }} onClick={() => setSelectedCouriers([])}>
                            <input type="checkbox" checked={selectedCouriers.length === 0} readOnly style={{ accentColor: "var(--color-accent)", width: 16, height: 16 }} /> Все курьеры
                          </label>
                        );
                      }
                      return (
                        <label key={c.value} style={s.dropdownItem}>
                          <input type="checkbox" checked={selectedCouriers.includes(String(c.value))} onChange={(e) => { const val = String(c.value); if (e.target.checked) setSelectedCouriers([...selectedCouriers, val]); else setSelectedCouriers(selectedCouriers.filter(id => id !== val)); }} style={{ accentColor: "var(--color-accent)", width: 16, height: 16, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Сводка между фильтром курьеров и кнопкой маршрутов */}
            <StatsChip />

            <button onClick={() => { setIsBulkMode(!isBulkMode); setRouteTab("map"); setBulkSelectedIds([]); setSelectedId(null); setIsDetailVisible(false); setRouteTabMode("new"); setEditingRouteId(null); setBulkCourier(""); setRouteType("mt"); }} style={{ ...topbarBtnStyle, background: isBulkMode ? "var(--color-text)" : "var(--color-card)", color: isBulkMode ? "#fff" : "var(--color-text)", borderColor: isBulkMode ? "var(--color-text)" : "var(--color-border)" }}>
              {isBulkMode ? "✕ Маршруты" : "📍 Маршруты"}
            </button>

            <div style={{ ...s.slotBar, marginLeft: 0 }}>
              <SlotBtn label="Все" active={selectedSlots.length === 0} color="var(--color-accent)" onClick={() => toggleSlot("all")} />
              {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
              <SlotBtn label="Другие" active={selectedSlots.includes("Другие")} color="var(--color-text-2)" onClick={() => toggleSlot("Другие")} />
            </div>
          </>
        )}

        {/* На мобильном первый ряд после логотипа и бургера пустовал —
            фильтры уехали во второй ряд. Занимаем это место сводкой:
            заказы и курьеры на смене нужны оператору постоянно. */}
        {isMobile && <StatsChip compact />}

        {/* 🔥 ИСПРАВЛЕННЫЙ СПЕЙСЕР (БЕЗ 100% ШИРИНЫ НА МОБИЛКЕ) */}
        <div style={{ flex: 1 }} />

        {/* Настройки карты — кнопка + выпадашка */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setShowMapSettings(!showMapSettings)}
            style={{ ...topbarBtnStyle, background: showMapSettings ? "var(--color-accent-soft)" : "var(--color-card)", borderColor: showMapSettings ? "var(--color-accent)" : "var(--color-border)", color: showMapSettings ? "var(--color-accent)" : "var(--color-text)" }}
            title="Настройки карты"
          >
            🗺️ <span style={{ fontSize: 10 }}>▼</span>
          </button>

          {showMapSettings && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setShowMapSettings(false)} />
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: "12px 14px", zIndex: 200, display: "flex", flexDirection: "column", gap: 10, minWidth: 160, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                <label style={{ fontSize: 12, color: 'var(--color-text)', display: 'flex', gap: 8, cursor: 'pointer', alignItems: 'center' }}><input type="checkbox" checked={showCouriers} onChange={e => setShowCouriers(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} /> Курьеры на карте</label>
                <label style={{ fontSize: 12, color: 'var(--color-text)', display: 'flex', gap: 8, cursor: 'pointer', alignItems: 'center' }}><input type="checkbox" checked={showHomes} onChange={e => setShowHomes(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} /> Дом</label>
                <label style={{ fontSize: 12, color: 'var(--color-text)', display: 'flex', gap: 8, cursor: 'pointer', alignItems: 'center' }}><input type="checkbox" checked={showCourierNames} onChange={e => setShowCourierNames(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} /> Имена</label>
                <label style={{ fontSize: 12, color: 'var(--color-text)', display: 'flex', gap: 8, cursor: 'pointer', alignItems: 'center' }}><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} /> Время</label>
                <div style={{ width: "100%", height: 1, background: "#f0efe9" }} />
                <label style={{ fontSize: 12, color: 'var(--color-text)', display: 'flex', gap: 8, cursor: 'pointer', alignItems: 'center' }}><input type="checkbox" checked={showRouteLines} onChange={e => setShowRouteLines(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} /> Линии маршрутов</label>
              </div>
            </>
          )}
        </div>

        {invalid.length > 0 && <button style={s.alertBadge} onClick={() => { setAlertsOpen(!alertsOpen); setProfileOpen(false); }}>⚠ {!isMobile && `${invalid.length}`}</button>}

        {!isMobile && lastSync && <span style={s.syncLabel}>обновлено {lastSync}</span>}

        {/* marginLeft: auto здесь больше нет. Вместе со спейсером выше
            получалось два растяжения подряд, и пустота уезжала между
            колокольчиком и аватаром: правая группа кнопок разъезжалась.
            Отступ держит один спейсер, кнопки идут вплотную. */}
        <button style={{ ...s.userBtn, padding: 0, overflow: "hidden", flexShrink: 0 }} onClick={() => { setProfileOpen(!profileOpen); setAlertsOpen(false); }}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            (user.firstName?.[0] || user.email.slice(0, 1)).toUpperCase()
          )}
        </button>
      </div>

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

      {isMobile && (
        <>
          {/* Ряд 2: фильтры + маршруты + слоты */}
          <div className="hide-scrollbar" style={{ display: "flex", gap: 6, padding: "6px 10px", background: "var(--color-card)", borderBottom: "1px solid var(--color-border)", overflowX: "auto", flexShrink: 0, alignItems: "center" }}>

            {/* 🔥 КАЛЕНДАРЬ НА МОБИЛКЕ (в режиме Portal-Dropdown) */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <DatePicker
                locale={ru}
                selected={new Date(filterDate)}
                onChange={(date: Date | null) => {
                  if (date) {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    setFilterDate(`${y}-${m}-${d}`);
                  }
                }}
                dateFormat="dd.MM.yyyy"
                customInput={<CustomDateInput />}

                // Удобный выбор месяца и года сверху
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"

                // Настройки отображения
                withPortal={false}
                portalId="dashboard-datepicker-portal"
                popperPlacement="bottom-start"
                popperClassName="relative z-[99999]"

                // 🔥 ПРАВИЛЬНЫЙ ФИКС TYPESCRIPT
                popperModifiers={[
                  {
                    name: "offset",
                    options: {
                      offset: [0, 8],
                    },
                  } as any, // Успокаиваем TypeScript
                  {
                    name: "preventOverflow",
                    options: {
                      boundary: "viewport",
                    },
                  } as any, // Успокаиваем TypeScript
                ]}
              />
            </div>

            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                style={{ ...topbarBtnStyle, height: 30, fontSize: 12, background: selectedStatuses.length > 0 ? "var(--color-accent-soft)" : "var(--color-card)", borderColor: selectedStatuses.length > 0 ? "var(--color-accent)" : "var(--color-border)" }}>
                <span style={{ color: selectedStatuses.length > 0 ? "var(--color-accent)" : "inherit" }}>Статусы: {selectedStatuses.length === 0 ? "Все" : `(${selectedStatuses.length})`}</span>
                <span style={{ fontSize: 10 }}>▼</span>
              </button>
              {isStatusMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.2)" }} onClick={() => setIsStatusMenuOpen(false)} />
                  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--color-card)", borderRadius: "16px 16px 0 0", padding: "16px 16px 24px", zIndex: 1000, display: "flex", flexDirection: "column", gap: 4, maxHeight: "60vh", overflowY: "auto", boxShadow: "0 -8px 24px rgba(0,0,0,0.15)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Статусы</div>
                    {["NEW", "ASSIGNED", "ASSEMBLING", "IN_DELIVERY", "DELIVERED"].map(st => (
                      <label key={st} style={s.dropdownItem}>
                        <input
                          type="checkbox"
                          checked={selectedStatuses.includes(st)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedStatuses([...selectedStatuses, st]);
                            else setSelectedStatuses(selectedStatuses.filter(item => item !== st));
                          }}
                          style={{ accentColor: "var(--color-accent)", width: 16, height: 16 }}
                        />
                        {st === "NEW" ? "Новые" : st === "ASSIGNED" ? "Назначены" : st === "ASSEMBLING" ? "В сборке" : st === "IN_DELIVERY" ? "В пути" : "Доставлены"}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ position: "relative", flexShrink: 0 }}>
              <button onClick={() => setIsCourierMenuOpen(!isCourierMenuOpen)}
                style={{ ...topbarBtnStyle, height: 30, fontSize: 12, background: selectedCouriers.length > 0 ? "var(--color-accent-soft)" : "var(--color-card)", borderColor: selectedCouriers.length > 0 ? "var(--color-accent)" : "var(--color-border)" }}>
                <span style={{ color: selectedCouriers.length > 0 ? "var(--color-accent)" : "inherit" }}>Курьеры: {selectedCouriers.length === 0 ? "Все" : `(${selectedCouriers.length})`}</span>
                <span style={{ fontSize: 10 }}>▼</span>
              </button>
              {isCourierMenuOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.2)" }} onClick={() => setIsCourierMenuOpen(false)} />
                  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--color-card)", borderRadius: "16px 16px 0 0", padding: "16px 16px 24px", zIndex: 1000, display: "flex", flexDirection: "column", gap: 4, maxHeight: "60vh", overflowY: "auto", boxShadow: "0 -8px 24px rgba(0,0,0,0.15)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Курьеры</div>
                    {courierOptions.map(c => {
                      if (c.value === "ALL") {
                        return (
                          <label key="ALL" style={{ ...s.dropdownItem, fontWeight: 700, borderBottom: "1px solid #f0efe9", paddingBottom: 8, marginBottom: 4 }} onClick={() => setSelectedCouriers([])}>
                            <input type="checkbox" checked={selectedCouriers.length === 0} readOnly style={{ accentColor: "var(--color-accent)", width: 16, height: 16 }} /> Все курьеры
                          </label>
                        );
                      }
                      return (
                        <label key={c.value} style={s.dropdownItem}>
                          <input type="checkbox" checked={selectedCouriers.includes(String(c.value))} onChange={(e) => { const val = String(c.value); if (e.target.checked) setSelectedCouriers([...selectedCouriers, val]); else setSelectedCouriers(selectedCouriers.filter(id => id !== val)); }} style={{ accentColor: "var(--color-accent)", width: 16, height: 16, flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <button onClick={() => { setIsBulkMode(!isBulkMode); setRouteTab("map"); setBulkSelectedIds([]); setSelectedId(null); setIsDetailVisible(false); setRouteTabMode("new"); setEditingRouteId(null); setBulkCourier(""); setRouteType("mt"); }} style={{ ...topbarBtnStyle, height: 30, fontSize: 12, flexShrink: 0, background: isBulkMode ? "var(--color-text)" : "var(--color-card)", color: isBulkMode ? "#fff" : "var(--color-text)", borderColor: isBulkMode ? "var(--color-text)" : "var(--color-border)" }}>
              {isBulkMode ? "✕ Маршруты" : "📍 Маршруты"}
            </button>

            <div style={{ width: 1, height: 20, background: "var(--color-border)", flexShrink: 0 }} />

            <SlotBtn label="Все" active={selectedSlots.length === 0} color="var(--color-accent)" onClick={() => toggleSlot("all")} />
            {SLOTS.map(sl => <SlotBtn key={sl.label} label={sl.label} active={selectedSlots.includes(sl.label)} color={sl.color} onClick={() => toggleSlot(sl.label)} />)}
            <SlotBtn label="Другие" active={selectedSlots.includes("Другие")} color="var(--color-text-2)" onClick={() => toggleSlot("Другие")} />
          </div>

          {/* Ряд 3: переключатель вида или табы маршрутов */}
          {!isBulkMode ? (
            <div style={{ display: "flex", padding: "6px 10px", background: "var(--color-bg)", gap: 6, flexShrink: 0, borderBottom: "1px solid var(--color-border)" }}>
              <ViewToggleBtn active={mobileView === "map"} onClick={() => setMobileView("map")}>🗺️ Карта</ViewToggleBtn>
              <ViewToggleBtn active={mobileView === "split"} onClick={() => setMobileView("split")}>Вместе</ViewToggleBtn>
              <ViewToggleBtn active={mobileView === "panels"} onClick={() => setMobileView("panels")}>📋 Список</ViewToggleBtn>
            </div>
          ) : (
            <div style={{ display: "flex", padding: "8px 10px", background: "var(--color-card)", gap: 8, flexShrink: 0, borderBottom: "1px solid var(--color-border)", zIndex: 10 }}>
              <button onClick={() => setRouteTab("map")} style={{ ...s.routeTabBtn, flex: 1, background: routeTab === "map" ? "var(--color-accent-soft)" : "var(--color-card)", color: routeTab === "map" ? "var(--color-accent)" : "var(--color-text-2)" }}>📍 Точки на карте</button>
              <button onClick={() => setRouteTab("list")} style={{ ...s.routeTabBtn, flex: 1, background: routeTab === "list" ? "var(--color-accent-soft)" : "var(--color-card)", color: routeTab === "list" ? "var(--color-accent)" : "var(--color-text-2)" }}>📋 Управление</button>
            </div>
          )}
        </>
      )}

      <div style={isMobile ? sm.body : s.body}>
        {!isMobile && (
          <div style={{ display: 'flex', width: '100%', height: '100%' }}>
            {((isListVisible || isDetailVisible) && !isBulkMode) && (
              <div style={s.leftPanel}>
                {isListVisible && (
                  <div style={{ ...s.cardsSection, flex: (isDetailVisible && selected) ? "0 0 50%" : 1, borderBottom: (isDetailVisible && selected) ? "1px solid var(--color-border)" : "none" }}>
                    <div style={s.sectionHeader}>
                      <span style={s.sectionTitle}>Заказы</span>
                      <span style={s.countBadge}>{filtered.length}</span>
                      <div style={{ flex: 1, position: "relative", margin: "0 8px" }}>
                        <input type="text" placeholder="Поиск..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          style={{ width: "100%", padding: "4px 20px 4px 24px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 11, outline: "none", background: "var(--color-surface)", boxSizing: "border-box", transition: "background 0.2s" }}
                          onFocus={(e) => e.target.style.background = "var(--color-card)"} onBlur={(e) => e.target.style.background = "var(--color-surface)"} />
                        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--color-text-3)", pointerEvents: "none" }}>🔍</span>
                        {searchQuery && (
                          <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--color-text-3)", cursor: "pointer", fontSize: 12, padding: 0, display: "flex", alignItems: "center" }}>✕</button>
                        )}
                      </div>
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
                <div style={{ width: 600, flexShrink: 0, background: "var(--color-bg)", borderRight: "1px solid var(--color-border)", zIndex: 10, display: "flex", flexDirection: "column" }}>
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
            <div ref={mapRef} style={{
              ...sm.map,
              visibility: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "hidden" : "visible",
              position: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "absolute" : "relative",
              pointerEvents: ((mobileView === "panels" && !isBulkMode) || (isBulkMode && routeTab === "list")) ? "none" : "auto",
              flex: (mobileView === "map" || (isBulkMode && routeTab === "map")) ? "1 1 auto" : "0 0 45%",
              top: 0, left: 0,
            }} />
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
              <div style={{ flex: 1, background: "var(--color-bg)", padding: 16, overflowY: "auto" }}>
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
            <button onClick={() => setTableOpen(!tableOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', padding: '4px 8px' }}>
              {tableOpen ? '▼ Свернуть' : '▲ Развернуть'}
            </button>
          </div>
          {tableOpen && (
            <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {[{ label: "Внешний ID", key: "externalId" }, { label: "Время", key: "slotFrom" }, { label: "ETA", key: "eta" }, { label: "Адрес", key: "address" }, { label: "Курьер", key: "courier" }, { label: "Сумма", key: "price" }, { label: "Статус", key: "status" }, { label: "Комментарий", key: "comment" }, { label: "Оператор", key: "opComment" }, { label: "Состав", key: "items" }, { label: "Создан", key: "crmCreatedAt" }, { label: "Изменён", key: "changedAt" }].map(col => (
                      <th key={col.key} style={{ ...s.th, cursor: "pointer", userSelect: "none" }} onClick={() => handleSort(col.key)} title={`Сортировать по: ${col.label}`}>
                        {col.label} {sortConfig.key === col.key ? (sortConfig.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((o, i) => {
                    const color = slotColor(o as any);
                    const late = isOrderLate(o);
                    return (
                      <tr id={`row-${o.id}`} key={o.id} style={{ background: selectedId === o.id ? "var(--color-accent-soft)" : i % 2 === 0 ? "var(--color-card)" : "var(--color-surface)", cursor: "pointer" }} onClick={() => { setSelectedId(o.id); setIsListVisible(true); setIsDetailVisible(true); }}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ ...s.statusDot, background: late ? "#d94040" : color }} /><span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--color-text-3)" }}>{o.externalId ?? o.crmId}</span></td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: late ? "#d94040" : color }}>{late ? "⏰ " : ""}{o.slotRaw ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                          {o.status === "DELIVERED" ? (
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                              {o.eta && <span style={{ fontSize: 10, color: 'var(--color-text-3)', textDecoration: 'line-through' }}>{o.eta}</span>}
                              <span style={{ color: late ? '#d94040' : 'var(--color-green)', fontWeight: 700 }}>{late ? "⏰ " : "✓ "}{o.deliveredAt ? new Date(o.deliveredAt).toLocaleTimeString("ru", { hour: '2-digit', minute: '2-digit' }) : "—"}</span>
                            </div>
                          ) : (
                            <span style={{ color: late ? "#d94040" : "var(--color-accent)", fontWeight: 700 }}>{late ? "⏰ " : ""}{o.eta ?? "—"}</span>
                          )}
                        </td>
                        <td style={{ ...s.td, minWidth: 160, maxWidth: 220 }}>
                          {o.address ?? "—"}
                          {o.isInvalid && o.invalidReason && (
                            <div style={{ fontSize: 10, color: "#d94040", fontWeight: 700, marginTop: 2 }}>⚠️ {o.invalidReason}</div>
                          )}
                        </td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", fontWeight: 600 }}>{o.courier ?? <span style={{ color: "#d94040" }}>—</span>}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: o.wrongPrice ? "#d94040" : "inherit", fontWeight: o.wrongPrice ? 700 : 500 }}>{o.price ? `${o.price} ₽` : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}><span style={{ padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 500, background: `${color}18`, color }}>{STATUS_LABELS[o.status] ?? o.status}</span></td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 200, color: "var(--color-text-2)" }}>{o.comment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 120, maxWidth: 180, color: "var(--color-accent-fg)" }}>{o.opComment ?? "—"}</td>
                        <td style={{ ...s.td, minWidth: 140, maxWidth: 220, color: "var(--color-text-2)" }}>{o.items ?? "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: "var(--color-text-3)", fontSize: 10 }}>{o.crmCreatedAt ? new Date(o.crmCreatedAt).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td style={{ ...s.td, whiteSpace: "nowrap", color: o.changedAt ? "var(--color-text)" : "var(--color-text-3)", fontSize: 10 }}>{(o.changedAt || o.updatedAt) ? new Date(o.changedAt || o.updatedAt!).toLocaleString("ru", { timeZone: "Europe/Moscow", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
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
          <ProfilePanel onClose={() => setProfileOpen(false)} />
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
    <button onClick={onClick} style={{ flex: 1, padding: "6px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: active ? "var(--color-accent)" : "var(--color-card)", color: active ? "#fff" : "var(--color-text-2)", boxShadow: active ? "0 2px 8px rgba(74,122,255,0.3)" : "0 1px 3px rgba(0,0,0,0.05)", transition: "all 0.15s" }}>
      {children}
    </button>
  );
}

function SlotBtn({ label, active, color, onClick }: any) {
  return <button style={{ ...s.slotBtn, ...(active ? { background: color, borderColor: color, color: "#fff" } : {}) }} onClick={onClick}>{label}</button>;
}

function OrderCard({ order, selected, isBulkMode, isBulkSelected, onSelect }: any) {
  const color = slotColor(order);
  const late = isOrderLate(order);

  return (
    <div id={`card-${order.id}`} style={{ ...s.card, ...(selected || isBulkSelected ? s.cardSelected : {}), ...(order.isInvalid ? s.cardInvalid : {}) }} onClick={onSelect}>
      <div style={s.cardRow1}>
        {isBulkMode && <input type="checkbox" checked={isBulkSelected} readOnly style={{ marginRight: 6, pointerEvents: "none", accentColor: "var(--color-accent)" }} />}
        <span style={{ ...s.statusDot, background: late ? "#d94040" : color }} />
        <span style={s.extId}>{order.externalId ?? order.crmId}</span>
        <span style={{ ...s.statusTag, background: `${color}18`, color }}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <div style={s.cardAddr}>{order.address ?? "—"}</div>
      <div style={s.cardMeta}>
        <span style={{ ...s.slotTag, color: late ? "#d94040" : color }}>{late ? "⏰ " : ""}{order.slotFrom}–{order.slotTo ?? ""}</span>

        {order.status === "DELIVERED" ? (
          <span style={{ fontSize: 10, color: late ? "#d94040" : "var(--color-green)", fontWeight: 700, marginLeft: 6 }}>
            {order.eta && <span style={{ color: "var(--color-text-3)", textDecoration: "line-through", marginRight: 4 }}>{order.eta}</span>}
            {late ? "⏰ " : "✓ "}{order.deliveredAt ? new Date(order.deliveredAt).toLocaleTimeString("ru", { hour: '2-digit', minute: '2-digit' }) : "—"}
          </span>
        ) : (
          order.eta && <span style={{ fontSize: 10, color: late ? "#d94040" : "var(--color-accent)", fontWeight: 700, marginLeft: 6 }}>{late ? "⏰ " : "~"}{order.eta}</span>
        )}

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

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || "— Выберите курьера —";

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-card)", fontSize: 13, color: value ? "var(--color-text)" : "var(--color-text-3)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", height: "100%", fontWeight: 600 }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
        <span style={{ fontSize: 10, color: "var(--color-text-3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </div>

      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 10, boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", zIndex: 500, maxHeight: 280, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "8px", borderBottom: "1px solid #f0efe9", background: "var(--color-surface)" }}>
            <input autoFocus placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, outline: "none" }} />
          </div>
          <div style={{ overflowY: "auto", padding: "4px 0", flex: 1 }}>
            <div onClick={() => { onChange(""); setOpen(false); setSearch(""); }} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", color: !value ? "var(--color-accent)" : "var(--color-text-3)", background: !value ? "#f4f7ff" : "transparent" }}>— Выберите курьера —</div>
            {filteredOptions.map(o => (
              <div key={o.value} onClick={() => { onChange(String(o.value)); setOpen(false); setSearch(""); }} style={{ padding: "10px 14px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid var(--color-bg)", color: String(o.value) === String(value) ? "var(--color-accent)" : "var(--color-text)", background: String(o.value) === String(value) ? "#f4f7ff" : "transparent", fontWeight: String(o.value) === String(value) ? 700 : 500 }}>
                {o.label}
              </div>
            ))}
            {filteredOptions.length === 0 && <div style={{ padding: "16px", textAlign: "center", fontSize: 13, color: "var(--color-text-3)" }}>Не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "var(--color-bg)", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 52, background: "var(--color-card)", borderBottom: "1px solid var(--color-border)", flexShrink: 0, zIndex: 100, position: "relative", overflow: "visible", flexWrap: "nowrap" },

  dropdownMenu: { position: "absolute", top: "100%", left: 0, marginTop: 6, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 8, zIndex: 100, display: "flex", flexDirection: "column", gap: 2, minWidth: 180, maxHeight: 300, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" },
  dropdownItem: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer", padding: "6px 8px", borderRadius: 6, transition: "background 0.15s", whiteSpace: "nowrap" },
  logo: { fontSize: 15, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", flexShrink: 0, minWidth: "max-content", marginRight: "auto" },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--color-text)", whiteSpace: "nowrap" },
  datePicker: { padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 11, outline: "none", color: "var(--color-text)", background: "var(--color-card)", marginLeft: 8 },
  nativeSelect: { height: 28, padding: "0 8px", borderRadius: 7, border: "1px solid #e0dfd7", fontSize: 11, fontWeight: 500, outline: "none", cursor: "pointer", background: "var(--color-card)", color: "var(--color-text)", maxWidth: 120 },
  slotBar: { display: "flex", gap: 4, marginLeft: 8 },
  slotBtn: { padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text-2)", cursor: "pointer", whiteSpace: "nowrap" },
  syncLabel: { fontSize: 11, color: "var(--color-text-3)", whiteSpace: "nowrap", marginRight: 4 },
  alertBadge: { display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, background: "rgba(217,64,64,0.08)", border: "1px solid rgba(217,64,64,0.2)", color: "#d94040", cursor: "pointer", whiteSpace: "nowrap" },
  userBtn: { width: 32, height: 32, borderRadius: "50%", background: "var(--color-accent)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#fff", flexShrink: 0 },
  invalidBanner: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", background: "rgba(217,64,64,0.07)", borderBottom: "1px solid rgba(217,64,64,0.15)", color: "#d94040", flexShrink: 0 },
  invalidBannerLink: { fontFamily: "monospace", fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  invalidBannerClose: { marginLeft: "auto", background: "none", border: "none", color: "#d94040", cursor: "pointer", fontSize: 14, flexShrink: 0, padding: 2 },
  body: { display: "flex", flex: 1, overflow: "hidden", minHeight: 0 },
  leftPanel: { width: 300, minWidth: 260, background: "var(--color-card)", borderRight: "1px solid var(--color-border)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden", zIndex: 5 },
  cardsSection: { display: "flex", flexDirection: "column", overflow: "hidden" },
  sectionHeader: { padding: "10px 14px 8px", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, borderBottom: "1px solid #f0efe9" },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: "0.5px" },
  countBadge: { padding: "2px 7px", borderRadius: 10, background: "var(--color-bg)", fontSize: 11, color: "var(--color-text-2)", fontWeight: 500 },
  cardsList: { flex: 1, overflowY: "auto", padding: 6 },
  empty: { padding: 24, textAlign: "center", color: "var(--color-text-3)", fontSize: 12 },
  detailSection: { display: "flex", flexDirection: "column", overflow: "hidden" },
  detailEmpty: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  panelToggleArrow: { background: "transparent", border: "none", cursor: "pointer", color: "var(--color-text-3)", fontSize: 13, padding: "4px 8px", borderRadius: 4 },
  expandSideBtn: { background: "var(--color-card)", border: "1px solid var(--color-border)", borderLeft: "none", borderRadius: "0 8px 8px 0", padding: "10px 8px", cursor: "pointer", color: "var(--color-text-2)", fontSize: 13, boxShadow: "2px 2px 8px rgba(0,0,0,0.06)" },
  card: { padding: "9px 11px", borderRadius: 8, marginBottom: 4, background: "var(--color-surface)", border: "1px solid var(--color-border)", cursor: "pointer", transition: "all .12s" },
  cardSelected: { background: "var(--color-accent-soft)", borderColor: "var(--color-accent)" },
  cardInvalid: { borderColor: "rgba(217,64,64,0.3)", background: "var(--color-danger-bg)" },
  cardRow1: { display: "flex", alignItems: "center", gap: 5, marginBottom: 4 },
  extId: { fontSize: 10, fontWeight: 600, color: "var(--color-text-3)", fontFamily: "monospace" },
  statusTag: { marginLeft: "auto", fontSize: 10, padding: "1px 6px", borderRadius: 10, fontWeight: 500 },
  cardAddr: { fontSize: 12, color: "var(--color-text)", lineHeight: "1.3", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardMeta: { display: "flex", alignItems: "center", gap: 6 },
  slotTag: { fontSize: 10, fontWeight: 600 },
  courierTag: { fontSize: 10, color: "var(--color-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 },
  tableSection: { flexShrink: 0, background: "var(--color-card)", borderTop: "2px solid var(--color-border)", display: "flex", flexDirection: "column", overflow: "hidden" },
  tableHeader: { display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderBottom: "1px solid #f0efe9", flexShrink: 0 },
  table: { width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "7px 12px", textAlign: "left" as const, fontSize: 10, fontWeight: 600, color: "var(--color-text-3)", textTransform: "uppercase", letterSpacing: ".4px", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 1 },
  td: { padding: "7px 12px", borderBottom: "0.5px solid #f0efe9", verticalAlign: "top", fontSize: 12, color: "var(--color-text)" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0, display: "inline-block", marginRight: 4, verticalAlign: "middle" },
  routeTabBtn: { padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid var(--color-border)", cursor: "pointer", transition: "all 0.15s" },
  actionBtn: { padding: "8px 16px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 8 },
  popup: { position: "fixed", top: 52, right: 8, background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, zIndex: 200, width: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  overlay: { position: "fixed", inset: 0, zIndex: 199 },
  alertTitle: { fontSize: 11, fontWeight: 700, color: "#d94040", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 10 },
  alertItem: { padding: "7px 0", borderBottom: "0.5px solid var(--color-bg)", cursor: "pointer" },
  alertAddr: { fontSize: 12, color: "var(--color-text)", marginBottom: 2 },
  alertSub: { fontSize: 11, color: "#d94040", opacity: 0.8 },
};

const sm: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "var(--color-bg)", overflow: "hidden" },
  // gap уменьшен с 6 до 5, отступы с 10 до 8: на 360px в ряд встают
  // логотип, бургер, сводка, настройки карты, колокольчик и аватар.
  // С прежними значениями аватар выдавливало за край экрана.
  topbar: { display: "flex", alignItems: "center", gap: 5, padding: "0 8px", height: 52, background: "var(--color-card)", borderBottom: "1px solid var(--color-border)", flexShrink: 0, zIndex: 100, position: "relative", overflow: "visible", flexWrap: "nowrap" },
  mobileSlotsWrap: { display: "flex", gap: 4, padding: "6px 10px", background: "var(--color-card)", borderBottom: "1px solid var(--color-border)", overflowX: "auto", flexShrink: 0 },
  body: { display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", minHeight: 0 },
  map: { width: "100%", minHeight: 200 },
  panelsWrap: { display: "flex", flexDirection: "column", background: "var(--color-card)", overflow: "hidden", flex: 1, minHeight: 0 },
  cardsSection: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" },
  detailSection: { flex: "0 0 55%", display: "flex", flexDirection: "column", borderTop: "2px solid var(--color-accent)", background: "var(--color-card)", overflow: "hidden", boxShadow: "0 -4px 12px rgba(0,0,0,0.05)" },
};