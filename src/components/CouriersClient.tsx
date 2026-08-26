// src/components/CouriersClient.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { OrderDetail } from "./OrderDetail";
import { RouteEditor } from "./RouteEditor";
import Link from "next/link";

interface CourierShift {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
}
interface CourierPayment { id: string; date: string; }
interface Courier {
  id: number; fullName: string; phone: string | null; description: string | null;
  isActive: boolean; shifts: CourierShift[]; payments: CourierPayment[];
  konsolContractorId?: string | null;
  priority?: number;
  isAuto?: boolean;
}

interface Order {
  id: string; courierId: number | null; status: string; price: number | null;
  deliveryDate: string | null; crmCreatedAt: string | null;
  externalId: string | null; crmId: string; address: string | null;
  slotRaw: string | null; recipientPhone: string | null;
  items: string | null; comment: string | null; opComment: string | null;
  routeId: string | null; routeOrder: number | null;
  route?: { id: string; name: string; link: string | null; date: string } | null;
  isInvalid?: boolean; invalidReason?: string | null;
  lat?: number | null; lng?: number | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  NEW: { label: "Новый", color: "#d94040", bg: "#fef2f2" },
  ASSIGNED: { label: "Назначен", color: "#4a7aff", bg: "#eef3ff" },
  IN_DELIVERY: { label: "🚀 В пути", color: "#10b981", bg: "#ecfdf5" },
  DELIVERED: { label: "✅ Доставлен", color: "#6b6860", bg: "#f5f4f0" },
  RETURNED: { label: "↩️ Возврат", color: "#d94040", bg: "#fef2f2" },
  CANCELLED: { label: "❌ Отменен", color: "#a8a49c", bg: "#f5f4f0" }
};

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru", { weekday: "short", day: "2-digit", month: "2-digit" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CouriersClient({ user }: { user: any }) {
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [activeTab, setActiveTab] = useState<"schedule" | "calc" | "tasks" | "routes">("schedule");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [countOverrides, setCountOverrides] = useState<Record<number, Record<number, number>>>({});
  const [editingCountsCourier, setEditingCountsCourier] = useState<number | null>(null);
  const [tempCounts, setTempCounts] = useState<Record<number, number>>({});

  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  });
  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(scheduleWeekStart); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [sortDate, setSortDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [sortMode, setSortMode] = useState<"orders" | "rating" | "alpha">(() => {
    if (typeof window === "undefined") return "orders";
    return (localStorage.getItem("courierSortMode") as "orders" | "rating" | "alpha") || "orders";
  });

  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  });
  const calcDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [selectedPays, setSelectedPays] = useState<string[]>([]);
  const [routesDate, setRoutesDate] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" }));
  const [expandedCouriers, setExpandedCouriers] = useState<Record<number, boolean>>({});

  const [onlyActive, setOnlyActive] = useState(true);

  const scheduleScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "schedule" && scheduleScrollRef.current) {
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" });
      const todayTh = document.getElementById(`day-${todayStr}`);

      if (todayTh) {
        scheduleScrollRef.current.scrollTo({
          left: todayTh.offsetLeft - 220,
          behavior: "smooth"
        });
      }
    }
  }, [activeTab, scheduleWeekStart]);
  
  const [konsolLoading, setKonsolLoading] = useState(false);
  const [konsolToast, setKonsolToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [konsolStatuses, setKonsolStatuses] = useState<Record<number, { label: string, color: string }[]>>({});
  
  const [konsolTasks, setKonsolTasks] = useState<any[]>([]);
  const [konsolTasksLoading, setKonsolTasksLoading] = useState(false);
  const [expandedKonsolTask, setExpandedKonsolTask] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [taskRemoteData, setTaskRemoteData] = useState<Record<string, { state?: { code: string; title: string } | null; duties?: any[] } | null>>({});
  
  useEffect(() => {
    const checkMob = () => setIsMobile(window.innerWidth < 768);
    checkMob(); window.addEventListener("resize", checkMob);
    return () => window.removeEventListener("resize", checkMob);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, oRes] = await Promise.all([fetch("/api/couriers"), fetch("/api/orders")]);
      if (cRes.ok) setCouriers(await cRes.json());
      if (oRes.ok) setOrders(await oRes.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (activeTab === "calc") {
      checkKonsolStatuses(true);
    }
    if (activeTab === "tasks") {
      loadKonsolTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, weekStart]);

  const getODate = (o: Order) => {
    if (o.routeId) {
      const routeOrders = orders.filter(ord => ord.routeId === o.routeId);
      routeOrders.sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
      const firstPoint = routeOrders[0];
      if (firstPoint?.deliveryDate) return String(firstPoint.deliveryDate).split("T")[0];
    }
    if (o.deliveryDate) return String(o.deliveryDate).split("T")[0];
    if (o.route?.date) return o.route.date;
    if (o.crmCreatedAt) return String(o.crmCreatedAt).split("T")[0];
    return null;
  };

  const getCourierOrders = (courierId: number, date: string, requireDelivered = false) => {
    return orders.filter(o => o.courierId === courierId && getODate(o) === date && (!requireDelivered || o.status === "DELIVERED"));
  };
  const getCount = (courierId: number, date: string, reqDeliv = false) => getCourierOrders(courierId, date, reqDeliv).length;
  const getSum = (courierId: number, date: string) => getCourierOrders(courierId, date, true).reduce((acc, o) => acc + (o.price || 0), 0);

  const getCourierDefaultCounts = (courierId: number) => {
    const courier = couriers.find(c => c.id === courierId);
    const dates = calcDates.filter(d => selectedPays.includes(`${courierId}_${d}`));
    const counts: Record<number, number> = {};

    orders.filter(o => o.courierId === courierId && o.status === "DELIVERED" && dates.includes(getODate(o) as string))
      .forEach(o => {
        const p = o.price || 0;
        if (p > 0) counts[p] = (counts[p] || 0) + 1;
      });

    const prices = courier?.isAuto ? [600, 1000, 1400] : [500, 900, 1300];
    prices.forEach(p => { if (counts[p] === undefined) counts[p] = 0; });

    return counts;
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    await fetch(`/api/orders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    fetchAll();
  };

  const createRouteFromUnassigned = async (orderId: string, courierId: number) => {
    await fetch("/api/routes/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: [orderId], courierId, routeDate: routesDate }) });
    fetchAll();
  };

  const toggleShift = async (courierId: number, date: string, isWorking: boolean) => {
    setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, shifts: isWorking ? [...c.shifts, { id: "temp", date, startTime: "10:00", endTime: "22:00" }] : c.shifts.filter(s => s.date !== date) } : c));
    await fetch("/api/couriers/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courierId, date, isWorking, startTime: "10:00", endTime: "22:00", priority: 3 }) });
  };

  const updateShiftDetails = async (courierId: number, date: string, data: any) => {
    setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, shifts: c.shifts.map(s => s.date === date ? { ...s, ...data } : s) } : c));
    await fetch("/api/couriers/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courierId, date, isWorking: true, ...data }) });
  };

  const updateCourierPriority = async (courierId: number, priority: number) => {
    setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, priority } : c));
    try {
      const res = await fetch(`/api/couriers/${courierId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority })
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
    } catch (e) {
      alert("Ошибка сохранения приоритета. Обновите страницу.");
    }
  };

  const toggleAuto = async (courierId: number, currentStatus: boolean) => {
    try {
      setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, isAuto: !currentStatus } : c));
      const res = await fetch(`/api/couriers/${courierId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAuto: !currentStatus })
      });
      if (!res.ok) throw new Error("Ошибка сервера");
    } catch (error) {
      console.error(error);
      alert("Не удалось обновить статус авто-курьера");
      setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, isAuto: currentStatus } : c));
    }
  };

  const togglePaySelect = (courierId: number, date: string) => {
    const key = `${courierId}_${date}`;
    setSelectedPays(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handlePayLocal = async () => {
    setLoading(true);
    const payments = selectedPays.map(p => { const [cId, d] = p.split('_'); return { courierId: Number(cId), date: d }; });
    await fetch("/api/couriers/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payments }) });
    setSelectedPays([]);
    await fetchAll();
  };

  const filtered = couriers.filter(c => {
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    if (!onlyActive) return true;
    const hasRecentShift = c.shifts && c.shifts.length > 0;
    return hasRecentShift;
  });

  const scheduleSorted = [...filtered].sort((a, b) => {
  const aWorksToday = a.shifts.some(s => s.date === sortDate);
  const bWorksToday = b.shifts.some(s => s.date === sortDate);
  if (aWorksToday && !bWorksToday) return -1;
  if (!aWorksToday && bWorksToday) return 1;

  if (sortMode === "orders") {
    const aCount = getCount(a.id, sortDate);
    const bCount = getCount(b.id, sortDate);
    if (aCount !== bCount) return bCount - aCount;
  } else if (sortMode === "rating") {
    const aPri = a.priority ?? 3;
    const bPri = b.priority ?? 3;
    if (aPri !== bPri) return bPri - aPri;
  }

  return a.fullName.localeCompare(b.fullName);
});

  const calcSortedAndFiltered = [...filtered].filter(c => {
    return calcDates.some(d => getCount(c.id, d, true) > 0 || getSum(c.id, d) > 0 || c.payments?.some(p => p.date === d));
  }).sort((a, b) => {
    const aSum = calcDates.reduce((acc, d) => acc + getSum(a.id, d), 0);
    const bSum = calcDates.reduce((acc, d) => acc + getSum(b.id, d), 0);
    if (aSum !== bSum) return bSum - aSum;
    return a.fullName.localeCompare(b.fullName);
  });

  const toggleAllPays = () => {
    const allAvailableKeys: string[] = [];
    calcSortedAndFiltered.forEach(c => {
      calcDates.forEach(d => {
        const count = getCount(c.id, d, true);
        const sum = getSum(c.id, d);
        const isPaid = c.payments?.some(p => p.date === d);
        if ((count > 0 || sum > 0) && !isPaid) {
          allAvailableKeys.push(`${c.id}_${d}`);
        }
      });
    });

    if (allAvailableKeys.length === 0) return;

    const isAllSelected = allAvailableKeys.every(k => selectedPays.includes(k));
    if (isAllSelected) {
      setSelectedPays([]);
    } else {
      setSelectedPays(allAvailableKeys);
    }
  };

  const toggleCourierWeek = (courierId: number) => {
    const availableKeys = calcDates.map(d => `${courierId}_${d}`).filter(key => {
      const d = key.split('_')[1];
      return (getCount(courierId, d, true) > 0 || getSum(courierId, d) > 0) && !couriers.find(c => c.id === courierId)?.payments?.some(p => p.date === d);
    });
    if (availableKeys.length === 0) return;
    const allSelected = availableKeys.every(k => selectedPays.includes(k));
    if (allSelected) setSelectedPays(prev => prev.filter(k => !availableKeys.includes(k)));
    else setSelectedPays(prev => Array.from(new Set([...prev, ...availableKeys])));
  };

  const toggleDay = (date: string) => {
    const availableKeys = couriers.map(c => `${c.id}_${date}`).filter(key => {
      const cId = Number(key.split('_')[0]);
      return (getCount(cId, date, true) > 0 || getSum(cId, date) > 0) && !couriers.find(c => c.id === cId)?.payments?.some(p => p.date === date);
    });
    if (availableKeys.length === 0) return;
    const allSelected = availableKeys.every(k => selectedPays.includes(k));
    if (allSelected) setSelectedPays(prev => prev.filter(k => !availableKeys.includes(k)));
    else setSelectedPays(prev => Array.from(new Set([...prev, ...availableKeys])));
  };

  const createSelectedTask = async () => {
    if (selectedPays.length === 0) {
      alert("Сначала выделите дни курьеров галочками!");
      return;
    }
    if (!confirm(`Создать базовые задания в Консоль.Про для выбранных курьеров?`)) return;

    setKonsolLoading(true);
    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });

    try {
      const res = await fetch("/api/konsol/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (data.success) {
        setKonsolToast({ message: `✅ Создано: ${data.processed}. Пропущено: ${data.skipped}`, type: "success" });
        setSelectedPays([]);
        checkKonsolStatuses(true);
      } else {
        setKonsolToast({ message: `❌ Ошибка: ${data.error}`, type: "error" });
      }
    } catch (e: any) {
      setKonsolToast({ message: `❌ Сетевая ошибка`, type: "error" });
    } finally {
      setKonsolLoading(false);
      setTimeout(() => setKonsolToast(null), 5000);
    }
  };

  const loadKonsolTasks = async () => {
    setKonsolTasksLoading(true);
    try {
      // 🔥 1. ДОБАВЛЕН ФИЛЬТР ПО НЕДЕЛЯМ
      const start = calcDates[0];
      const end = calcDates[6];
      const res = await fetch(`/api/konsol/tasks?start=${start}&end=${end}`);
      if (!res.ok) return;
      const tasks = await res.json();
      setKonsolTasks(tasks);

      const toEnrich = tasks.filter((t: any) => t.status !== "SIGNED_BY_US");
      if (toEnrich.length === 0) return;

      const enriched: Record<string, { state?: { code: string; title: string } | null; duties?: any[] }> = {};
      await Promise.all(
        toEnrich.map(async (t: any) => {
          try {
            const r = await fetch(`/api/konsol/task-detail?taskId=${t.konsolTaskId}`);
            if (r.ok) {
              const d = await r.json();
              enriched[t.id] = { state: d.state ?? null, duties: d.duties ?? [] };
            }
          } catch { }
        })
      );
      setTaskRemoteData(prev => ({ ...prev, ...enriched }));
    } catch (e) { console.error(e); }
    finally { setKonsolTasksLoading(false); }
  };

  const loadTaskRemote = async (konsolTaskId: string, taskDbId: string) => {
    if (taskRemoteData[taskDbId] !== undefined) return;
    setTaskRemoteData(prev => ({ ...prev, [taskDbId]: null }));
    try {
      const res = await fetch(`/api/konsol/task-detail?taskId=${konsolTaskId}`);
      const data = await res.json();
      setTaskRemoteData(prev => ({ ...prev, [taskDbId]: { state: data.state, duties: data.duties } }));
    } catch {
      setTaskRemoteData(prev => ({ ...prev, [taskDbId]: { state: null, duties: [] } }));
    }
  };

  const handleTasksAction = async (action: "recalculate" | "finalize" | "pay") => {
    const sel = konsolTasks.filter(t => selectedTasks.has(t.id));

    let targets = [];
    if (action === "pay") {
      // 🔥 4. РАЗРЕШЕНО ОПЛАЧИВАТЬ И ПЕРЕОТПРАВЛЯТЬ SIGNED_BY_US
      targets = sel.filter(t => ["CONFIRMED", "ACCEPTED", "SIGNED_BY_US"].includes(t.status));
    } else if (action === "recalculate") {
      targets = sel.filter(t => t.status === "DRAFT" || t.status === "CONFIRMED");
    } else if (action === "finalize") {
      targets = sel.filter(t => t.status !== "SIGNED_BY_US");
    }
    
    if (!targets.length) {
      setKonsolToast({ message: action === "pay" ? "⚠️ Нет заданий для оплаты" : "⚠️ Ничего не выбрано", type: "error" });
      setTimeout(() => setKonsolToast(null), 3000);
      return;
    }
    setKonsolTasksLoading(true);
    const url = action === "recalculate" ? "/api/konsol/recalculate" : action === "finalize" ? "/api/konsol/finalize" : "/api/konsol/pay";
    try {
      const payments = targets.map((t: any) => ({ courierId: t.courierId, date: t.date.split("T")[0] }));
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payments }) });
      const data = await res.json();
      if (data.success) {
        const label = action === "recalculate" ? "Пересчитано" : action === "finalize" ? "Финализировано" : "Подписано";
        let msg = `✅ ${label}: ${data.processed}`;
        if (data.warnings?.length) {
          msg += ` ⚠️ ${data.warnings[0]}`;
        }
        setKonsolToast({ message: msg, type: data.warnings?.length ? "error" : "success" });
        setSelectedTasks(new Set());
        await loadKonsolTasks();
        checkKonsolStatuses(true); // Обновляем бэйджи статусов
      } else setKonsolToast({ message: `❌ ${data.error}`, type: "error" });
    } catch { setKonsolToast({ message: "❌ Ошибка", type: "error" }); }
    finally { setKonsolTasksLoading(false); setTimeout(() => setKonsolToast(null), 4000); }
  };

  const checkKonsolStatuses = async (silent = false) => {
    if (!silent) setKonsolLoading(true);
    try {
      const res = await fetch("/api/konsol/check-status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: calcDates[0], weekEnd: calcDates[6] })
      });
      const data = await res.json();
      if (data.success) {
        setKonsolStatuses(data.statuses);
        if (!silent) setKonsolToast({ message: "Статусы обновлены", type: "success" });
      }
    } catch (e: any) {
      if (!silent) setKonsolToast({ message: "Ошибка проверки", type: "error" });
    } finally {
      if (!silent) setKonsolLoading(false);
      setTimeout(() => setKonsolToast(null), 3000);
    }
    if (activeTab === "tasks") {
      await loadKonsolTasks();
    }
  };

  const handleRecalculate = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");
    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });
    setLoading(true);
    try {
      const res = await fetch("/api/konsol/recalculate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments, overrides: countOverrides })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Задания пересчитаны: ${data.processed}.`);
        setCountOverrides({});
      } else alert(`❌ Ошибка: ${data.error || data.message}`);
    } catch (e: any) { alert(`❌ Ошибка: ${e.message}`); } 
    finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");
    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });
    setLoading(true);
    try {
      const res = await fetch("/api/konsol/finalize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Финализировано заданий: ${data.processed}`);
        setSelectedPays([]); 
        fetchAll(); 
      } else alert(`❌ Ошибка: ${data.error}`);
    } catch (e: any) { alert(`❌ Ошибка: ${e.message}`); } 
    finally { setLoading(false); }
  };

  const handlePay = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");
    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });
    setLoading(true);
    try {
      const res = await fetch("/api/konsol/pay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Актов подписано и оплачено: ${data.processed}`);
        setSelectedPays([]); 
        fetchAll(); 
      } else alert(`❌ Ошибка: ${data.error}`);
    } catch (e: any) { alert(`❌ Ошибка: ${e.message}`); } 
    finally { setLoading(false); }
  };

  const globalFreeOrders = orders.filter(o => !o.routeId && getODate(o) === routesDate && o.status !== "DELIVERED" && o.status !== "CANCELLED");

  const allAvailableKeys = calcSortedAndFiltered.flatMap(c =>
    calcDates.filter(d => (getCount(c.id, d, true) > 0 || getSum(c.id, d) > 0) && !c.payments?.some(p => p.date === d))
      .map(d => `${c.id}_${d}`)
  );
  const isAllGlobalSelected = allAvailableKeys.length > 0 && allAvailableKeys.every(k => selectedPays.includes(k));

  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <Link href="/dashboard" style={{ textDecoration: "none" }}>
          <div style={s.logo}>
            <img src="/favicon.svg" alt="Logo" style={{ width: 22, height: 22 }} />
            ADelivo
          </div>
        </Link>
        <button onClick={() => router.push('/dashboard')} style={s.navBtn}>🗺️ Дашборд</button>
        <button onClick={() => router.push('/orders')} style={s.navBtn}>≡ Заказы</button>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ ...s.content, padding: isMobile ? "16px 12px" : "24px" }}>
        <div style={{ ...s.headerRow, flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "flex-end" }}>
          <div>
            <h1 style={s.title}>Курьеры</h1>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
              <button style={activeTab === "schedule" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("schedule")}>📅 График</button>
              <button style={activeTab === "calc" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("calc")}>💰 ЗП</button>
              <button style={activeTab === "tasks" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("tasks")}>📋 Задания</button>
              <button style={activeTab === "routes" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("routes")}>🗺️ Маршруты</button>
            </div>
          </div>

          <div style={s.controls}>
            {activeTab === "calc" && (
              <button style={{ ...s.syncBtn, background: selectedPays.length > 0 ? "#10b981" : "#e5e7eb", color: selectedPays.length > 0 ? "#fff" : "#9ca3af" }} disabled={selectedPays.length === 0} onClick={handlePayLocal}>
                ✅ Оплатить локально ({selectedPays.length})
              </button>
            )}
            <button 
              onClick={() => setOnlyActive(!onlyActive)}
              style={{
                background: onlyActive ? "#eef3ff" : "#fff",
                border: `1px solid ${onlyActive ? "#4a7aff" : "#e8e6df"}`,
                padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                color: onlyActive ? "#4a7aff" : "#6b6860", cursor: "pointer"
              }}
            >
              {onlyActive ? "👥 Показать всех" : "✅ Только активные"}
            </button>
            <input type="text" placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...s.input, width: isMobile ? "100%" : "auto" }} />
            <button style={{ ...s.syncBtn, width: isMobile ? "100%" : "auto" }} onClick={() => fetchAll()}>🔄 Обновить</button>
          </div>
        </div>

        {/* --- ГРАФИК --- */}
        {activeTab === "schedule" && (
          <div style={s.tableWrap} ref={scheduleScrollRef}>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e8e6df", gap: 12, flexWrap: "wrap" }}>
              <button style={s.arrowBtn} onClick={() => setScheduleWeekStart(d => new Date(d.getTime() - 7 * 86400000))}>◀ Неделя</button>
              <span style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize", color: "#1a1a18" }}>
                {scheduleWeekStart.toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
              </span>
              <button style={s.arrowBtn} onClick={() => setScheduleWeekStart(d => new Date(d.getTime() + 7 * 86400000))}>Неделя ▶</button>

              {/* Разделитель */}
              <div style={{ width: 1, height: 20, background: "#e8e6df", margin: "0 4px" }} />

              {/* Переключатель сортировки */}
              <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 600 }}>Сортировка:</span>
              {(["orders", "rating", "alpha"] as const).map(mode => {
                const labels = { orders: "📦 Заказы", rating: "⭐ Рейтинг", alpha: "🔤 Алфавит" };
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      setSortMode(mode);
                      localStorage.setItem("courierSortMode", mode);
                    }}
                    style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", border: "1px solid",
                      background: sortMode === mode ? "#4a7aff" : "#fff",
                      color: sortMode === mode ? "#fff" : "#6b6860",
                      borderColor: sortMode === mode ? "#4a7aff" : "#e8e6df",
                      transition: "all 0.15s",
                    }}
                  >
                    {labels[mode]}
                  </button>
                );
              })}

              <span style={{ fontSize: 11, color: "#a8a49c", marginLeft: "auto" }}>
                Клик по дню — сортировать по нему
              </span>
            </div>
            {/* Таблица графика сокращена для удобства, она работает как раньше... */}
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220, position: "sticky", left: 0, top: 0, zIndex: 20, background: "#fafaf8", boxShadow: "2px 2px 5px -2px rgba(0,0,0,0.1)" }}>Курьер</th>
                  <th style={{ ...s.th, width: 120, position: "sticky", top: 0, zIndex: 10, background: "#fafaf8", boxShadow: "0 2px 5px -2px rgba(0,0,0,0.1)" }}>Телефон</th>
                  {scheduleDates.map((d) => {
                    const dObj = new Date(d);
                    const dayStr = `${dObj.toLocaleDateString('ru', { weekday: 'short' }).toUpperCase()} ${dObj.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}`;
                    return (
                      <th key={d} id={`day-${d}`} style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8", position: "sticky", top: 0, zIndex: 10, boxShadow: "0 2px 5px -2px rgba(0,0,0,0.1)" }} onClick={() => setSortDate(d)}>
                        {dayStr}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={9} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr> : scheduleSorted.map(c => {
                  const isSortDayWorking = c.shifts.some(s => s.date === sortDate);
                  return (
                    <tr key={c.id} style={{ background: isSortDayWorking ? "#fcfcfc" : "#fff", borderBottom: "1px solid #f0efe9" }}>
                      <td style={{ ...s.td, fontWeight: 600, position: "sticky", left: 0, zIndex: 5, background: isSortDayWorking ? "#fcfcfc" : "#fff", boxShadow: "2px 0 5px -2px rgba(0,0,0,0.1)" }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', maxWidth: '190px' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.fullName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }} onClick={(e) => { e.stopPropagation(); toggleAuto(c.id, c.isAuto || false); }}>
                              <span style={{ fontSize: 9, color: c.isAuto ? '#10b981' : '#a8a49c', fontWeight: 800 }}>АВТО</span>
                              <div style={{ position: 'relative', width: 28, height: 16, background: c.isAuto ? '#10b981' : '#e5e7eb', borderRadius: 20, transition: '0.2s', flexShrink: 0 }}>
                                <div style={{ position: 'absolute', top: 2, left: c.isAuto ? 14 : 2, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: '0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#a8a49c', fontWeight: 500 }}>Рейтинг:</span>
                            <select value={c.priority || 3} onChange={e => updateCourierPriority(c.id, Number(e.target.value))} style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e8e6df", borderRadius: 4, background: "#fafaf8", outline: "none", cursor: "pointer", color: "#1a1a18", fontWeight: 600 }}>
                              <option value="5">⭐⭐⭐⭐⭐</option><option value="4">⭐⭐⭐⭐</option><option value="3">⭐⭐⭐</option><option value="2">⭐⭐</option><option value="1">⭐</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...s.td, color: "#6b6860", fontSize: 12, verticalAlign: "middle" }}>{c.phone || "—"}</td>
                      {scheduleDates.map(date => {
                        const shift = c.shifts.find(s => s.date === date);
                        const isWorking = !!shift;
                        const allOrdersCount = orders.filter(o => o.courierId === c.id && getODate(o) === date).length;
                        const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => { const h = Math.floor(i / 2) + 6; const m = i % 2 === 0 ? "00" : "30"; return `${String(h).padStart(2, '0')}:${m}`; });
                        return (
                          <td key={date} style={{ ...s.td, textAlign: "center", background: sortDate === date ? "rgba(74,122,255,0.03)" : "transparent", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input type="checkbox" checked={isWorking} onChange={(e) => toggleShift(c.id, date, e.target.checked)} style={s.checkbox} />
                                {allOrdersCount > 0 && <span style={{ fontSize: 11, color: "#fff", background: "#4a7aff", padding: "2px 6px", borderRadius: 10, fontWeight: 700 }}>{allOrdersCount}</span>}
                              </div>
                              {isWorking && (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center', marginTop: 4, background: "#fff", padding: "4px 6px", borderRadius: 6, border: "1px solid #e8e6df" }}>
                                  <select value={shift.startTime || "10:00"} onChange={e => updateShiftDetails(c.id, date, { startTime: e.target.value })} style={{ fontSize: 11, padding: "2px 0", width: 44, border: "none", outline: "none", cursor: "pointer", background: "transparent", textAlign: "center", fontWeight: 600, color: "#1a1a18", appearance: "none" }}>
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <span style={{ fontSize: 11, color: "#a8a49c", fontWeight: 700 }}>-</span>
                                  <select value={shift.endTime || "22:00"} onChange={e => updateShiftDetails(c.id, date, { endTime: e.target.value })} style={{ fontSize: 11, padding: "2px 0", width: 44, border: "none", outline: "none", cursor: "pointer", background: "transparent", textAlign: "center", fontWeight: 600, color: "#1a1a18", appearance: "none" }}>
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                              )}
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

        {/* --- РАСЧЕТ ЗП --- */}
        {activeTab === "calc" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}>◀ Неделя</button>
                <span style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize", color: "#1a1a18" }}>
                  {weekStart.toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
                </span>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}>Неделя ▶</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {konsolToast && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: konsolToast.type === "success" ? "#10b981" : "#d94040", animation: "fadeIn 0.3s" }}>
                    {konsolToast.message}
                  </span>
                )}
                <button onClick={() => checkKonsolStatuses(false)} disabled={konsolLoading} style={{ ...s.navBtn, background: "#eef3ff", color: "#4a7aff", borderColor: "#4a7aff" }}>
                  🔄 Статусы
                </button>
                <button onClick={createSelectedTask} disabled={konsolLoading || selectedPays.length === 0} style={{ background: konsolLoading || selectedPays.length === 0 ? "#e5e7eb" : "#fff", color: konsolLoading || selectedPays.length === 0 ? "#9ca3af" : "#1a1a18", border: "1px solid #e8e6df", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: konsolLoading || selectedPays.length === 0 ? "not-allowed" : "pointer" }}>
                  ➕ Создать задание
                </button>
                <button onClick={handleRecalculate} disabled={loading || selectedPays.length === 0} style={{ background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#4a7aff", color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer", }}>
                  {loading ? "⏳ Загрузка..." : "🔄 Пересчитать"}
                </button>
                <button onClick={handleFinalize} disabled={loading || selectedPays.length === 0} style={{ background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#f59e0b", color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer", }}>
                  {loading ? "⏳ Загрузка..." : "📝Закрыть и Акт"}
                </button>
                <button onClick={handlePay} disabled={loading || selectedPays.length === 0} style={{ background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#10b981", color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer", }}>
                  {loading ? "⏳ Загрузка..." : "💳 Оплатить"}
                </button>
              </div>
            </div>

            <div style={s.tableWrap}>
              <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220, verticalAlign: "top", position: "sticky", left: 0, top: 0, zIndex: 20, background: "#fafaf8", boxShadow: "2px 2px 5px -2px rgba(0,0,0,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={isAllGlobalSelected && allAvailableKeys.length > 0} onChange={toggleAllPays} style={{ ...s.checkbox, width: 14, height: 14 }} title="Выбрать вообще всё доступное" />
                      Курьер
                    </div>
                  </th>
                  {calcDates.map(d => {
                    const availableDayKeys = calcSortedAndFiltered.map(c => `${c.id}_${d}`).filter(k => { const cId = Number(k.split('_')[0]); return (getCount(cId, d, true) > 0 || getSum(cId, d) > 0) && !couriers.find(c => c.id === cId)?.payments?.some(p => p.date === d); });
                    const isAllDaySelected = availableDayKeys.length > 0 && availableDayKeys.every(k => selectedPays.includes(k));
                    const daySelectedSum = selectedPays.filter(p => p.endsWith(`_${d}`)).reduce((acc, p) => acc + getSum(Number(p.split('_')[0]), d), 0);
                    const dObj = new Date(d);
                    const dayStr = `${dObj.toLocaleDateString('ru', { weekday: 'short' }).toUpperCase()} ${dObj.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}`;
                    return (
                      <th key={d} style={{ ...s.th, textAlign: "center", verticalAlign: "top", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 10, background: "#fafaf8", boxShadow: "0 2px 5px -2px rgba(0,0,0,0.1)" }}>
                        {dayStr}
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={isAllDaySelected} onChange={() => toggleDay(d)} style={{ ...s.checkbox, width: 14, height: 14 }} title="Выбрать весь день" />
                          {daySelectedSum > 0 && <span style={{ fontSize: 10, color: "#4a7aff", fontWeight: 700 }}>{daySelectedSum} ₽</span>}
                        </div>
                      </th>
                    )
                  })}
                  <th style={{ ...s.th, textAlign: "right", color: "#10b981", verticalAlign: "top", position: "sticky", top: 0, zIndex: 10, background: "#fafaf8", boxShadow: "0 2px 5px -2px rgba(0,0,0,0.1)" }}>
                    Итого
                    {(() => {
                      const grandTotal = selectedPays.reduce((acc, p) => { const [cId, d] = p.split('_'); return acc + getSum(Number(cId), d); }, 0);
                      if (grandTotal > 0) {
                        return (
                          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 11, fontWeight: 700 }}>
                            <span>{grandTotal} ₽</span>
                            <span style={{ fontSize: 9, opacity: 0.7 }}>x 1.06 = {Math.round(grandTotal * 1.06)} ₽</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={9} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr>
                  : calcSortedAndFiltered.length === 0 ? <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#a8a49c" }}>На этой неделе нет курьеров с заказами</td></tr>
                    : calcSortedAndFiltered.map(c => {
                      const selectedDates = calcDates.filter(d => selectedPays.includes(`${c.id}_${d}`));
                      let selectedTotal = 0;
                      if (countOverrides[c.id]) {
                        selectedTotal = Object.entries(countOverrides[c.id]).reduce((acc, [price, qty]) => acc + Number(price) * qty, 0);
                      } else {
                        selectedTotal = selectedDates.reduce((acc, d) => acc + getSum(c.id, d), 0);
                      }
                      const unselectedTotal = calcDates.filter(d => !selectedPays.includes(`${c.id}_${d}`)).reduce((acc, d) => acc + getSum(c.id, d), 0);
                      const weekTotal = selectedTotal + unselectedTotal;
                      const weekTotal106 = weekTotal * 1.06;

                      const availableWeekKeys = calcDates.map(d => `${c.id}_${d}`).filter(k => {
                        const dStr = k.split('_')[1];
                        return (getCount(c.id, dStr, true) > 0 || getSum(c.id, dStr) > 0) && !c.payments?.some(p => p.date === dStr);
                      });
                      const isAllWeekSelected = availableWeekKeys.length > 0 && availableWeekKeys.every(k => selectedPays.includes(k));

                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #f0efe9", background: "#fff" }}>
                          <td style={{ ...s.td, fontWeight: 600, position: "sticky", left: 0, zIndex: 5, background: "#fff", boxShadow: "2px 0 5px -2px rgba(0,0,0,0.1)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input type="checkbox" checked={isAllWeekSelected} onChange={() => toggleCourierWeek(c.id)} disabled={availableWeekKeys.length === 0} style={{ ...s.checkbox, width: 14, height: 14, flexShrink: 0 }} title="Выбрать всю неделю" />
                              {c.konsolContractorId ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", flexShrink: 0 }} title="СЗ (Консоль) подключен" /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", display: "inline-block", flexShrink: 0 }} title="Консоль не привязана" />}
                              <span style={{ whiteSpace: 'nowrap' }}>{c.fullName}</span>
                              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }} onClick={(e) => { e.stopPropagation(); toggleAuto(c.id, c.isAuto || false); }} title="Сделать авто-курьером">
                                <span style={{ fontSize: 9, color: c.isAuto ? '#10b981' : '#a8a49c', fontWeight: 800 }}>АВТО</span>
                                <div style={{ position: 'relative', width: 28, height: 16, background: c.isAuto ? '#10b981' : '#e5e7eb', borderRadius: 20, transition: '0.2s', flexShrink: 0 }}>
                                  <div style={{ position: 'absolute', top: 2, left: c.isAuto ? 14 : 2, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: '0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                                </div>
                              </div>
                            </div>
                            {konsolStatuses[c.id] && konsolStatuses[c.id].map((st, i) => (
                              <div key={i} style={{ fontSize: 11, color: st.color, marginTop: 4, fontWeight: 700 }}>
                                {st.label}
                              </div>
                            ))}
                          </td>
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
                            <div style={{ fontSize: 14 }}>
                              {weekTotal.toFixed(0)} ₽
                              {selectedDates.length > 0 && (
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); const defaults = getCourierDefaultCounts(c.id); const overrides = countOverrides[c.id] || {}; const merged = { ...defaults }; for (const k in overrides) merged[k] = overrides[k]; [600, 1000, 1400].forEach(p => { if (merged[p] === undefined) merged[p] = 0; }); setTempCounts(merged); setEditingCountsCourier(c.id); }} title="Редактировать количество услуг для пересчета">✏️</button>
                              )}
                            </div>
                            {weekTotal > 0 && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>x 1.06 = {weekTotal106.toFixed(0)} ₽</div>}
                            {countOverrides[c.id] && <div style={{ fontSize: 9, color: "#d94040", marginTop: 2 }}>Изменено вручную</div>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
          </div>
        )}

        {/* --- МАРШРУТЫ --- */}
        {activeTab === "routes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Рендер маршрутов остался без изменений */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: isMobile ? "12px" : "12px 16px", borderRadius: 12, border: "1px solid #e8e6df", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a18" }}>Дата маршрутов:</span>
              <input type="date" value={routesDate} onChange={e => setRoutesDate(e.target.value)} style={{ ...s.input, flex: 1, maxWidth: 200 }} />
            </div>

            {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка маршрутов...</div> : null}

            {!loading && filtered.map(c => {
              const cOrders = orders.filter(o => o.courierId === c.id && getODate(o) === routesDate);
              if (cOrders.length === 0) return null;

              const routeGroups: Record<string, Order[]> = {};
              cOrders.forEach(o => {
                const key = o.route?.id || o.routeId || "no_route";
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(o);
              });

              const courierUnassignedOrders = routeGroups["no_route"] || [];
              const isCExpanded = expandedCouriers[c.id] ?? true;

              const routeKeys = Object.keys(routeGroups)
                .filter(k => k !== "no_route")
                .sort((a, b) => {
                  const firstA = routeGroups[a].sort((x, y) => (x.routeOrder || 0) - (y.routeOrder || 0))[0];
                  const firstB = routeGroups[b].sort((x, y) => (x.routeOrder || 0) - (y.routeOrder || 0))[0];
                  const dateA = firstA?.deliveryDate || firstA?.route?.date || "";
                  const dateB = firstB?.deliveryDate || firstB?.route?.date || "";
                  return String(dateB).localeCompare(String(dateA));
                });

              return (
                <div key={c.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                  <div onClick={() => setExpandedCouriers(prev => ({ ...prev, [c.id]: !isCExpanded }))} style={{ padding: "14px 16px", background: "#fafaf8", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: isCExpanded ? "1px solid #e8e6df" : "none" }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a18" }}>{c.fullName}</div>
                      <div style={{ fontSize: 12, color: "#a8a49c", marginTop: 4 }}>Активных: {cOrders.filter(o => o.status !== "DELIVERED" && o.status !== "CANCELLED").length} · Всего: {cOrders.length}</div>
                    </div>
                    <div style={{ fontSize: 18, color: "#a8a49c", transform: isCExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</div>
                  </div>

                  {isCExpanded && (
                    <div style={{ padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 20 }}>
                      {routeKeys.map((rId) => {
                        const rOrders = routeGroups[rId];
                        const rObj = rOrders.find(o => o.route)?.route;
                        const rName = rObj ? rObj.name : "Неизвестен";
                        const rLink = rObj ? rObj.link : null;
                        return (
                          <RouteEditor key={rId} route={rObj} routeId={rId} routeName={rName} routeLink={rLink} initialOrders={rOrders} globalFreeOrders={globalFreeOrders} courierId={c.id} routesDate={routesDate} isMobile={isMobile} onSaved={fetchAll} onStatusChange={handleStatusChange} onOpenDetail={setSelectedOrder} />
                        );
                      })}

                      {courierUnassignedOrders.length > 0 && (
                        <div>
                          <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 700, color: "#6b6860" }}>Без маршрута ({courierUnassignedOrders.length})</h4>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                            {courierUnassignedOrders.map(o => {
                              const st = STATUS_MAP[o.status] || STATUS_MAP.NEW;
                              return (
                                <div key={o.id} style={{ background: "#fafaf8", borderRadius: 10, border: "1px dashed #a8a49c", padding: 14, display: "flex", flexDirection: "column" }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                    <div><div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div><div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{o.slotRaw}</div></div>
                                    <div style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{st.label}</div>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", marginBottom: 12, lineHeight: 1.4, flex: 1 }}>{o.address}</div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setSelectedOrder(o as any)} style={{ flex: 1, background: "#fff", border: "1px solid #e8e6df", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Открыть</button>
                                    <button onClick={() => createRouteFromUnassigned(o.id, c.id)} style={{ flex: 2, background: "rgba(74, 122, 255, 0.08)", color: "#4a7aff", border: "none", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>➕ В новый маршрут</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
      {/* --- 📋 ЗАДАНИЯ КОНСОЛИ --- */}
      {activeTab === "tasks" && (() => {
        const DB_ST: Record<string, { label: string; color: string; bg: string }> = {
          DRAFT: { label: "⏳ Черновик", color: "#6b6860", bg: "#f5f4f0" },
          CONFIRMED: { label: "🔵 Принято", color: "#4a7aff", bg: "#eef3ff" },
          ACCEPTED: { label: "🟢 Выполнено", color: "#10b981", bg: "#ecfdf5" },
          CONFIRMED_ACT: { label: "📄 Акт готов", color: "#8b5cf6", bg: "#f5f3ff" },
          SIGNED_BY_US: { label: "✅ Подписано", color: "#10b981", bg: "#f0fdf4" },
        };
        const REMOTE_ST: Record<string, { label: string; color: string }> = {
          submitted: { label: "🟡 Ожидает курьера", color: "#f59e0b" },
          confirmed: { label: "🔵 В работе", color: "#4a7aff" },
          accepted: { label: "🟢 Выполнено", color: "#10b981" },
          finalized: { label: "📝 Финализировано", color: "#8b5cf6" },
          revoked: { label: "❌ Отозвано", color: "#d94040" },
          declined: { label: "❌ Отклонено", color: "#d94040" },
        };

        const byCourier: Record<number, any[]> = {};
        konsolTasks.forEach((t: any) => {
          if (!byCourier[t.courierId]) byCourier[t.courierId] = [];
          byCourier[t.courierId].push(t);
        });

        // 🔥 УБРАН ФИЛЬТР БЛОКИРОВКИ ГАЛОЧЕК (Разрешаем выделять любые задания)
        const allSelectableIds = konsolTasks.map((t: any) => t.id);
        const isAllTasksSelected = allSelectableIds.length > 0 && allSelectableIds.every((id: string) => selectedTasks.has(id));
        const selArr = konsolTasks.filter((t: any) => selectedTasks.has(t.id));
        
        // 🔥 РАЗРЕШАЕМ ОПЛАЧИВАТЬ УЖЕ ПОДПИСАННЫЕ АКТЫ (для пробития ошибки)
        const selCanPay = selArr.filter((t: any) => ["CONFIRMED", "ACCEPTED", "SIGNED_BY_US"].includes(t.status)).length;
        const selCanFinalize = selArr.filter((t: any) => t.status !== "SIGNED_BY_US").length;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Тулбар Заданий */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", borderRadius: 10, border: "1px solid #e8e6df", flexWrap: "wrap" }}>
              
              {/* 🔥 ДОБАВЛЕНА НАВИГАЦИЯ ПО НЕДЕЛЯМ (как в ЗП) */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 16 }}>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() - 7 * 86400000))}>◀ Неделя</button>
                <span style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize", color: "#1a1a18" }}>
                  {weekStart.toLocaleDateString('ru', { month: 'short', day: 'numeric' })} — {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString('ru', { month: 'short', day: 'numeric' })}
                </span>
                <button style={s.arrowBtn} onClick={() => setWeekStart(d => new Date(d.getTime() + 7 * 86400000))}>Неделя ▶</button>
              </div>

              <input
                type="checkbox"
                checked={isAllTasksSelected}
                onChange={() => setSelectedTasks(isAllTasksSelected ? new Set() : new Set(allSelectableIds))}
                style={{ ...s.checkbox, width: 15, height: 15 }}
                title="Выбрать все"
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a18" }}>
                Задания {konsolTasks.length > 0 && `(${konsolTasks.length})`}
              </span>
              {konsolToast && (
                <span style={{ fontSize: 12, fontWeight: 600, color: konsolToast.type === "success" ? "#10b981" : "#d94040" }}>
                  {konsolToast.message}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={async () => {
                  await loadKonsolTasks();
                  await checkKonsolStatuses(true); // Обновляем реальные статусы по кнопке!
                  setKonsolToast({ message: `✅ Данные обновлены`, type: "success" });
                  setTimeout(() => setKonsolToast(null), 3000);
                }}
                disabled={konsolTasksLoading}
                style={{
                  ...s.navBtn,
                  display: "flex", alignItems: "center", gap: 6,
                  background: konsolTasksLoading ? "#f5f4f0" : "#fff",
                  minWidth: 120,
                }}
              >
                {konsolTasksLoading ? (
                  <>
                    <span style={{ width: 14, height: 14, border: "2px solid #e8e6df", borderTopColor: "#4a7aff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite", flexShrink: 0 }} /> Загрузка...
                  </>
                ) : (
                  <>🔄 Обновить статусы</>
                )}
              </button>
              {selectedTasks.size > 0 && <>
                <span style={{ fontSize: 12, color: "#6b6860" }}>Выбрано: <b>{selectedTasks.size}</b></span>
                <button onClick={() => handleTasksAction("recalculate")} disabled={konsolTasksLoading} style={{ ...s.navBtn, background: "#f5f3ff", color: "#8b5cf6", borderColor: "#8b5cf6" }}>🔁 Пересчитать</button>
                {selCanFinalize > 0 && <button onClick={() => handleTasksAction("finalize")} disabled={konsolTasksLoading} style={{ ...s.navBtn, background: "#eef3ff", color: "#4a7aff", borderColor: "#4a7aff" }}>📄 Финализ. ({selCanFinalize})</button>}
                {selCanPay > 0 && <button onClick={() => handleTasksAction("pay")} disabled={konsolTasksLoading} style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💳 Оплатить ({selCanPay})</button>}
              </>}
            </div>

            {/* Список курьеров и их заданий */}
            {konsolTasksLoading && konsolTasks.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#a8a49c" }}>Загрузка...</div>
            ) : konsolTasks.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#a8a49c" }}>Нет заданий на этой неделе.</div>
            ) : Object.entries(byCourier).map(([cidStr, cTasks]) => {
              const cour = (cTasks as any[])[0].courier;
              const courierId = Number(cidStr);
              // 🔥 РАЗРЕШАЕМ ВЫДЕЛЯТЬ ГРУППУ ЦЕЛИКОМ БЕЗ ОГРАНИЧЕНИЙ
              const selectableIds = (cTasks as any[]).map(t => t.id);
              const allCSelected = selectableIds.length > 0 && selectableIds.every((id: string) => selectedTasks.has(id));
              const courierTotal = (cTasks as any[]).reduce((acc, t) => acc + t.amount, 0);

              return (
                <div key={courierId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden" }}>
                  {/* Шапка курьера */}
                  <div style={{ padding: "10px 14px", background: "#fafaf8", borderBottom: "1px solid #e8e6df" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input
                        type="checkbox"
                        checked={allCSelected}
                        onChange={() => {
                          setSelectedTasks(prev => {
                            const next = new Set(prev);
                            const allSel = selectableIds.every((id: string) => next.has(id));
                            selectableIds.forEach((id: string) => allSel ? next.delete(id) : next.add(id));
                            return next;
                          });
                        }}
                        disabled={selectableIds.length === 0}
                        style={{ ...s.checkbox, width: 15, height: 15 }}
                      />
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: cour?.konsolContractorId ? "#10b981" : "#d1d5db", display: "inline-block" }} />
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1a18" }}>{cour?.fullName ?? `#${courierId}`}</span>
                      <span style={{ fontSize: 12, color: "#6b6860" }}>{(cTasks as any[]).length} задан. · {courierTotal.toFixed(0)} ₽</span>
                      {(cTasks as any[]).filter(t => t.status === "SIGNED_BY_US").length > 0 && (
                        <span style={{ fontSize: 11, background: "#f0fdf4", color: "#10b981", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✅ В оплату: {(cTasks as any[]).filter(t => t.status === "SIGNED_BY_US").length}</span>
                      )}
                    </div>
                    {/* 🔥 ДОБАВЛЕНЫ РЕАЛЬНЫЕ СТАТУСЫ ОПЛАТЫ КАК В ЗП */}
                    {konsolStatuses[courierId] && konsolStatuses[courierId].length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8, paddingLeft: 34 }}>
                        {konsolStatuses[courierId].map((st, i) => (
                           <span key={i} style={{ fontSize: 11, background: `${st.color}15`, color: st.color, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
                             {st.label}
                           </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Строки заданий */}
                  {(cTasks as any[]).map((task: any, idx: number) => {
                    const dbStKey = (task.status === "CONFIRMED" || task.status === "ACCEPTED") && task.konsolActId ? "CONFIRMED_ACT" : task.status;
                    const dbSt = DB_ST[dbStKey] || DB_ST.DRAFT;
                    const isSelected = selectedTasks.has(task.id);
                    const isExpanded = expandedKonsolTask === task.id;
                    const isPaid = task.status === "SIGNED_BY_US";
                    const remote = taskRemoteData[task.id];
                    const remoteSt = remote?.state ? (REMOTE_ST[remote.state.code] || { label: remote.state.title, color: "#6b6860" }) : null;

                    return (
                      <div key={task.id}>
                        <div
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                            background: isSelected ? "#eef3ff" : isPaid ? "#f0fdf4" : idx % 2 === 1 ? "#fafaf8" : "#fff",
                            borderBottom: "1px solid #f0efe9", cursor: "pointer", flexWrap: "wrap",
                          }}
                          onClick={() => {
                            if (!isExpanded) loadTaskRemote(task.konsolTaskId, task.id);
                            setExpandedKonsolTask(isExpanded ? null : task.id);
                          }}
                        >
                          <div onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => setSelectedTasks(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; })}
                              disabled={false} // 🔥 БЛОКИРОВКА СНЯТА
                              style={{ ...s.checkbox, width: 14, height: 14 }}
                            />
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 13, minWidth: 70 }}>
                            {new Date(task.date).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                          </span>
                          <a href={`https://app.konsol.pro/tasks/${task.konsolTaskId}`} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontFamily: "monospace", fontSize: 11, color: "#4a7aff", textDecoration: "none" }}>
                            #{task.konsolTaskId}
                          </a>
                          
                          {/* 🔥 ПРЯМАЯ ССЫЛКА НА АКТ (ЕСЛИ ОН ЕСТЬ) */}
                          {task.konsolActId && (
                            <a href={`https://app.konsol.pro/acts/${task.konsolActId}`} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 11, color: "#8b5cf6", textDecoration: "none", background: "#f5f3ff", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>
                              📄 Акт
                            </a>
                          )}

                          {remoteSt ? (
                            <span style={{ fontSize: 11, background: `${remoteSt.color}18`, color: remoteSt.color, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{remoteSt.label}</span>
                          ) : remote === null ? (
                            <span style={{ fontSize: 11, background: "#f5f4f0", color: "#a8a49c", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>⏳ загрузка...</span>
                          ) : (
                            <span style={{ fontSize: 11, background: dbSt.bg, color: dbSt.color, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{dbSt.label}</span>
                          )}
                          <div style={{ flex: 1 }} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: isPaid ? "#10b981" : "#1a1a18" }}>{task.amount.toFixed(0)} ₽</span>
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                            {(!isPaid && !task.konsolActId) && (
                              <button
                                onClick={async () => { setSelectedTasks(new Set([task.id])); await handleTasksAction("finalize"); }}
                                disabled={konsolTasksLoading}
                                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #4a7aff", background: "#eef3ff", color: "#4a7aff", fontSize: 12, cursor: "pointer" }}
                                title="Финализировать"
                              >📄</button>
                            )}
                            {/* 🔥 РАЗРЕШЕНО НАЖИМАТЬ ОПЛАТИТЬ И НА SIGNED_BY_US */}
                            {(["CONFIRMED", "ACCEPTED", "SIGNED_BY_US"].includes(task.status)) && (
                              <button
                                onClick={async () => { setSelectedTasks(new Set([task.id])); await handleTasksAction("pay"); }}
                                disabled={konsolTasksLoading}
                                style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#10b981", color: "#fff", fontSize: 12, cursor: "pointer" }}
                                title="Оплатить"
                              >💳</button>
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: "#a8a49c", transform: isExpanded ? "rotate(180deg)" : "rotate(0)", display: "inline-block", transition: "0.2s" }}>▼</span>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: "12px 20px 12px 48px", background: "#f8f7ff", borderBottom: "1px solid #e8e6df" }}>
                            {remote === null ? (
                              <div style={{ color: "#a8a49c", fontSize: 12 }}>Загрузка данных...</div>
                            ) : remote?.duties && remote.duties.length > 0 ? (
                              <table style={{ fontSize: 12, borderCollapse: "collapse", width: "100%", maxWidth: 500 }}>
                                <thead>
                                  <tr>{["Услуга", "Кол-во", "Цена", "Итого"].map(h => (
                                    <th key={h} style={{ padding: "4px 10px", textAlign: "left", color: "#a8a49c", fontWeight: 600, borderBottom: "1px solid #e8e6df" }}>{h}</th>
                                  ))}</tr>
                                </thead>
                                <tbody>
                                  {remote.duties.map((d: any) => (
                                    <tr key={d.id}>
                                      <td style={{ padding: "4px 10px" }}>{d.title}</td>
                                      <td style={{ padding: "4px 10px" }}>{d.quantity}</td>
                                      <td style={{ padding: "4px 10px" }}>{d.price} ₽</td>
                                      <td style={{ padding: "4px 10px", fontWeight: 700 }}>{d.cost} ₽</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td colSpan={3} style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, borderTop: "1px solid #e8e6df" }}>Итого:</td>
                                    <td style={{ padding: "6px 10px", fontWeight: 700, color: "#10b981", borderTop: "1px solid #e8e6df" }}>{remote.duties.reduce((a: number, d: any) => a + d.cost, 0)} ₽</td>
                                  </tr>
                                </tfoot>
                              </table>
                            ) : (
                              <div style={{ color: "#a8a49c", fontSize: 12 }}>Услуги не найдены</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {editingCountsCourier && (() => {
        const courier = couriers.find(c => c.id === editingCountsCourier);
        const prices = courier?.isAuto ? [600, 1000, 1400] : [500, 900, 1300];
        const label = courier?.isAuto ? '🚗 Авто' : '🚶 Пеший';

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 16 }}>Редактировать услуги</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 12, color: '#a8a49c' }}>{label} · {courier?.fullName}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {prices.map(price => (
                  <div key={price} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>{price} ₽ → <b>{Math.round(price * 1.06)} ₽</b></span>
                    <input type="number" min="0" value={tempCounts[price] ?? 0} onChange={e => setTempCounts({ ...tempCounts, [price]: Number(e.target.value) })} style={{ width: 60, padding: '4px 8px', border: '1px solid #e8e6df', borderRadius: 6, textAlign: 'center' }} />
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f5f4f0', borderRadius: 8, fontSize: 13 }}>
                Итого: <b style={{ color: '#10b981' }}>{prices.reduce((acc, p) => acc + Math.round(p * 1.06) * (tempCounts[p] ?? 0), 0)} ₽</b>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingCountsCourier(null)} style={{ flex: 1, padding: '8px', border: '1px solid #e8e6df', background: '#fafaf8', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Отмена</button>
                <button onClick={() => { setCountOverrides({ ...countOverrides, [editingCountsCourier]: tempCounts }); setEditingCountsCourier(null); }} style={{ flex: 1, padding: '8px', border: 'none', background: '#4a7aff', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Сохранить</button>
              </div>
            </div>
          </div>
        );
      })()}

      {selectedOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 450, maxWidth: "100%", background: "#fff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
            <OrderDetail selected={selectedOrder as any} couriers={couriers.map(c => ({ value: c.fullName, label: c.fullName }))} onClose={() => setSelectedOrder(null)} onUpdateSuccess={() => { setSelectedOrder(null); fetchAll(); }} onPreviewGeo={() => { }} fixingAI={false} setFixingAI={() => { }} />
          </div>
        </div>
      )}
      <style dangerouslySetInnerHTML={{ __html: `@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: "auto", flexShrink: 0 },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  content: { margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20, maxWidth: "100%" }, 
  headerRow: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 16px 0" },
  tabActive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: "#4a7aff", color: "#fff", whiteSpace: "nowrap" },
  tabInactive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", background: "#fafaf8", color: "#6b6860", whiteSpace: "nowrap" },
  controls: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  arrowBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6b6860" },
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "auto", maxHeight: "calc(100vh - 160px)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", width: "100%" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff", margin: 0 }
};
