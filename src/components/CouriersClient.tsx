// src/components/CouriersClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { OrderDetail } from "./OrderDetail";
import { RouteEditor } from "./RouteEditor";
import Link from "next/link";

interface CourierShift { id: string; date: string; }
interface CourierPayment { id: string; date: string; }
interface Courier {
  id: number; fullName: string; phone: string | null; description: string | null;
  isActive: boolean; shifts: CourierShift[]; payments: CourierPayment[];
  konsolContractorId?: string | null; // 🔥 ДОБАВЛЕНО для индикатора Консоли
  isAuto?: boolean; // 🔥 ДОБАВЛЕНО для авто-курьеров
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

  const [activeTab, setActiveTab] = useState<"calc" | "schedule" | "routes" | "tasks">("calc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const scheduleDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0];
  });
  const [sortDate, setSortDate] = useState(scheduleDates[1]);

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

  const [konsolLoading, setKonsolLoading] = useState(false);
  const [konsolToast, setKonsolToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [konsolStatuses, setKonsolStatuses] = useState<Record<number, { label: string, color: string }[]>>({});
  // 📋 Задания Консоли
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

  // 🔥 Автоматическая загрузка статусов Консоли при открытии вкладки ЗП или смене недели
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
    setCouriers(prev => prev.map(c => c.id === courierId ? { ...c, shifts: isWorking ? [...c.shifts, { id: "temp", date }] : c.shifts.filter(s => s.date !== date) } : c));
    await fetch("/api/couriers/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courierId, date, isWorking }) });
  };
  // 🔥 Функция переключения Авто-курьера
  const toggleAuto = async (courierId: number, currentStatus: boolean) => {
    try {
      // Оптимистичное обновление (чтобы UI реагировал мгновенно)
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
      // Откатываем назад при ошибке
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
    if (!c.isActive) return false;
    if (search && !c.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const calcSortedAndFiltered = [...filtered].filter(c => {
    return calcDates.some(d => getCount(c.id, d, true) > 0 || getSum(c.id, d) > 0 || c.payments?.some(p => p.date === d));
  }).sort((a, b) => {
    const aSum = calcDates.reduce((acc, d) => acc + getSum(a.id, d), 0);
    const bSum = calcDates.reduce((acc, d) => acc + getSum(b.id, d), 0);
    if (aSum !== bSum) return bSum - aSum;
    return a.fullName.localeCompare(b.fullName);
  });

  // 🔥 Глобальная функция "Выбрать ВСЁ"
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

    // Если уже выбраны все доступные — снимаем выделение. Иначе выбираем все.
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
        setKonsolToast({ message: `✅ Создано: ${data.processed}. Пропущено (уже есть): ${data.skipped}`, type: "success" });
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
      const res = await fetch("/api/konsol/tasks");
      if (res.ok) setKonsolTasks(await res.json());
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
    const targets = action === "pay"
          ? sel.filter(t => t.status === "CONFIRMED" || t.status === "PENDING_PAYMENT")
      : sel.filter(t => t.status !== "SIGNED_BY_US");
    if (!targets.length) {
      setKonsolToast({ message: action === "pay" ? "⚠️ Нет заданий «Акт готов»" : "⚠️ Ничего не выбрано", type: "error" });
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
        const label = action === "recalculate" ? "Пересчитано" : action === "finalize" ? "Финализировано" : "Оплачено";
        setKonsolToast({ message: `✅ ${label}: ${data.processed}`, type: "success" });
        setSelectedTasks(new Set());
        await loadKonsolTasks();
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
    // 🔥 Если открыта вкладка задания — обновляем и её
    if (activeTab === "tasks") {
      await loadKonsolTasks();
    }
  };
  // 🔥 Новая кнопка "Пересчитать" (Только обновляет услуги в Консоли по выделенным дням)
  const handleRecalculate = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");

    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });

    setLoading(true);
    try {
      const res = await fetch("/api/konsol/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Задания пересчитаны: ${data.processed}. Можете проверить услуги в Консоли перед финализацией.`);
        // Намеренно не очищаем галочки setSelectedPays([]), чтобы после проверки можно было сразу нажать "Финализировать"
      } else {
        alert(`❌ Ошибка: ${data.error}`);
      }
    } catch (e: any) {
      alert(`❌ Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  // 1. Кнопка "Финализировать" (Считает сумму, переводит в Выполнено и создает Акт)
  const handleFinalize = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");

    // Преобразуем "1_2026-03-29" в { courierId: 1, date: "2026-03-29" }
    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });

    setLoading(true);
    try {
      const res = await fetch("/api/konsol/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Финализировано заданий: ${data.processed}`);
        setSelectedPays([]); // Снимаем галочки
        fetchAll(); // Обновляем данные в таблице
      } else {
        alert(`❌ Ошибка: ${data.error}`);
      }
    } catch (e: any) {
      alert(`❌ Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 2. Кнопка "Оплатить" (Подписывает Акт и оплачивает)
  const handlePay = async () => {
    if (selectedPays.length === 0) return alert("Выберите смены");

    const payments = selectedPays.map(p => {
      const [cId, d] = p.split('_');
      return { courierId: Number(cId), date: d };
    });

    setLoading(true);
    try {
      const res = await fetch("/api/konsol/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Успешно! Актов подписано и оплачено: ${data.processed}`);
        setSelectedPays([]); // Снимаем галочки
        fetchAll(); // Обновляем данные (кружочки станут зелеными)
      } else {
        alert(`❌ Ошибка: ${data.error}`);
      }
    } catch (e: any) {
      alert(`❌ Ошибка: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };
  const scheduleSorted = [...filtered].sort((a, b) => {
    const aCount = getCount(a.id, sortDate); const bCount = getCount(b.id, sortDate);
    if (aCount !== bCount) return bCount - aCount;
    const aWorks = a.shifts.some(s => s.date === sortDate); const bWorks = b.shifts.some(s => s.date === sortDate);
    if (aWorks && !bWorks) return -1; if (!aWorks && bWorks) return 1;
    return a.fullName.localeCompare(b.fullName);
  });

  const globalFreeOrders = orders.filter(o => !o.routeId && getODate(o) === routesDate && o.status !== "DELIVERED" && o.status !== "CANCELLED");

  // Подсчет доступных ключей для чекбокса "Выбрать всё"
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
            EventWave
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
              <button style={activeTab === "calc" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("calc")}>💰 ЗП</button>
              <button style={activeTab === "tasks" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("tasks")}>📋 Задания</button>
              <button style={activeTab === "schedule" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("schedule")}>📅 График</button>
              <button style={activeTab === "routes" ? s.tabActive : s.tabInactive} onClick={() => setActiveTab("routes")}>🗺️ Маршруты</button>

            </div>
          </div>

          <div style={s.controls}>
            {activeTab === "calc" && (
              <button style={{ ...s.syncBtn, background: selectedPays.length > 0 ? "#10b981" : "#e5e7eb", color: selectedPays.length > 0 ? "#fff" : "#9ca3af" }} disabled={selectedPays.length === 0} onClick={handlePayLocal}>
                ✅ Оплатить локально ({selectedPays.length})
              </button>
            )}
            <input type="text" placeholder="Поиск курьера..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...s.input, width: isMobile ? "100%" : "auto" }} />
            <button style={{ ...s.syncBtn, width: isMobile ? "100%" : "auto" }} onClick={() => fetchAll()}>🔄 Обновить</button>
          </div>
        </div>

        {/* --- ГРАФИК --- */}
        {activeTab === "schedule" && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220 }}>Курьер</th>
                  <th style={{ ...s.th, width: 120 }}>Телефон</th>
                  {scheduleDates.map((d, i) => (
                    <th key={d} style={{ ...s.th, textAlign: "center", cursor: "pointer", color: sortDate === d ? "#4a7aff" : "#a8a49c", background: sortDate === d ? "#eef3ff" : "#fafaf8" }} onClick={() => setSortDate(d)}>
                      {i === 0 ? "Сегодня" : i === 1 ? "Завтра" : formatDay(d)}<br /><span style={{ fontSize: 10, fontWeight: 500 }}>{d.slice(5).replace("-", ".")}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={9} style={{ padding: 20, textAlign: "center" }}>Загрузка...</td></tr> : scheduleSorted.map(c => {
                  const isSortDayWorking = c.shifts.some(s => s.date === sortDate);
                  return (
                    <tr key={c.id} style={{ background: isSortDayWorking ? "#fcfcfc" : "#fff", borderBottom: "1px solid #f0efe9" }}>
                      <td style={{ ...s.td, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', maxWidth: '190px' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.fullName}
                          </span>

                          {/* 🔥 Красивый ползунок переключатель АВТО */}
                          <div
                            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }}
                            onClick={(e) => { e.stopPropagation(); toggleAuto(c.id, c.isAuto || false); }}
                            title="Сделать авто-курьером"
                          >
                            <span style={{ fontSize: 9, color: c.isAuto ? '#10b981' : '#a8a49c', fontWeight: 800 }}>АВТО</span>
                            <div style={{ position: 'relative', width: 28, height: 16, background: c.isAuto ? '#10b981' : '#e5e7eb', borderRadius: 20, transition: '0.2s', flexShrink: 0 }}>
                              <div style={{ position: 'absolute', top: 2, left: c.isAuto ? 14 : 2, width: 12, height: 12, background: '#fff', borderRadius: '50%', transition: '0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                            </div>
                          </div>

                        </div>
                      </td>                 <td style={{ ...s.td, color: "#6b6860", fontSize: 12 }}>{c.phone || "—"}</td>
                      {scheduleDates.map(date => {
                        const isWorking = c.shifts.some(s => s.date === date);
                        const orderCount = getCount(c.id, date);
                        return (
                          <td key={date} style={{ ...s.td, textAlign: "center", background: sortDate === date ? "rgba(74,122,255,0.03)" : "transparent" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                              <input type="checkbox" checked={isWorking} onChange={(e) => toggleShift(c.id, date, e.target.checked)} style={s.checkbox} />
                              {orderCount > 0 && <span style={{ fontSize: 10, color: "#4a7aff", fontWeight: 700 }}>{orderCount} зак.</span>}
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
          <div style={s.tableWrap}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderBottom: "1px solid #e8e6df", flexWrap: "wrap", gap: 10 }}>

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

                <button
                  onClick={createSelectedTask}
                  disabled={konsolLoading || selectedPays.length === 0}
                  style={{
                    background: konsolLoading || selectedPays.length === 0 ? "#e5e7eb" : "#fff", color: konsolLoading || selectedPays.length === 0 ? "#9ca3af" : "#1a1a18", border: "1px solid #e8e6df", padding: "8px 16px",
                    borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: konsolLoading || selectedPays.length === 0 ? "not-allowed" : "pointer"
                  }}
                >
                  ➕ Создать задание
                </button>
                <button
                  onClick={handleRecalculate}
                  disabled={loading || selectedPays.length === 0}
                  style={{
                    background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#4a7aff",
                    color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff",
                    border: "none", padding: "10px 16px", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "⏳ Загрузка..." : "🔄 Пересчитать"}
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={loading || selectedPays.length === 0}
                  style={{
                    background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#f59e0b",
                    color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff",
                    border: "none", padding: "10px 16px", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "⏳ Загрузка..." : "📝Закрыть и Акт"}
                </button>

                <button
                  onClick={handlePay}
                  disabled={loading || selectedPays.length === 0}
                  style={{
                    background: loading || selectedPays.length === 0 ? "#e5e7eb" : "#10b981",
                    color: loading || selectedPays.length === 0 ? "#9ca3af" : "#fff",
                    border: "none", padding: "10px 16px", borderRadius: 8,
                    fontSize: 14, fontWeight: 600, cursor: loading || selectedPays.length === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "⏳ Загрузка..." : "💳 Оплатить"}
                </button>
              </div>

            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 220, verticalAlign: "top" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* 🔥 ГЛОБАЛЬНЫЙ ЧЕКБОКС "ВЫБРАТЬ ВСЕ" */}
                      <input
                        type="checkbox"
                        checked={isAllGlobalSelected && allAvailableKeys.length > 0}
                        onChange={toggleAllPays}
                        style={{ ...s.checkbox, width: 14, height: 14 }}
                        title="Выбрать вообще всё доступное"
                      />
                      Курьер
                    </div>
                  </th>
                  {calcDates.map(d => {
                    const availableDayKeys = calcSortedAndFiltered.map(c => `${c.id}_${d}`).filter(k => {
                      const cId = Number(k.split('_')[0]);
                      return (getCount(cId, d, true) > 0 || getSum(cId, d) > 0) && !couriers.find(c => c.id === cId)?.payments?.some(p => p.date === d);
                    });
                    const isAllDaySelected = availableDayKeys.length > 0 && availableDayKeys.every(k => selectedPays.includes(k));

                    const daySelectedSum = selectedPays
                      .filter(p => p.endsWith(`_${d}`))
                      .reduce((acc, p) => acc + getSum(Number(p.split('_')[0]), d), 0);

                    return (
                      <th key={d} style={{ ...s.th, textAlign: "center", verticalAlign: "top" }}>
                        {formatDay(d)}<br /><span style={{ fontSize: 10 }}>{d.slice(5).replace("-", ".")}</span>
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={isAllDaySelected} onChange={() => toggleDay(d)} style={{ ...s.checkbox, width: 14, height: 14 }} title="Выбрать весь день" />
                          {daySelectedSum > 0 && (
                            <span style={{ fontSize: 10, color: "#4a7aff", fontWeight: 700 }}>{daySelectedSum} ₽</span>
                          )}
                        </div>
                      </th>
                    )
                  })}
                  <th style={{ ...s.th, textAlign: "right", color: "#10b981", verticalAlign: "top" }}>
                    Итого
                    {(() => {
                      const grandTotal = selectedPays.reduce((acc, p) => {
                        const [cId, d] = p.split('_');
                        return acc + getSum(Number(cId), d);
                      }, 0);
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
                      const weekTotal = calcDates.reduce((acc, d) => acc + getSum(c.id, d), 0);
                      const weekTotal106 = weekTotal * 1.06;

                      const availableWeekKeys = calcDates.map(d => `${c.id}_${d}`).filter(k => {
                        const dStr = k.split('_')[1];
                        return (getCount(c.id, dStr, true) > 0 || getSum(c.id, dStr) > 0) && !c.payments?.some(p => p.date === dStr);
                      });
                      const isAllWeekSelected = availableWeekKeys.length > 0 && availableWeekKeys.every(k => selectedPays.includes(k));

                      return (
                        <tr key={c.id} style={{ borderBottom: "1px solid #f0efe9", background: "#fff" }}>
                          <td style={{ ...s.td, fontWeight: 600 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {/* 🔥 Чекбокс выделения всей недели курьера */}
                              <input
                                type="checkbox"
                                checked={isAllWeekSelected}
                                onChange={() => toggleCourierWeek(c.id)}
                                disabled={availableWeekKeys.length === 0}
                                style={{ ...s.checkbox, width: 14, height: 14, flexShrink: 0 }}
                                title="Выбрать всю неделю"
                              />
                              {c.konsolContractorId ? (
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", flexShrink: 0 }} title="СЗ (Консоль) подключен" />
                              ) : (
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#d1d5db", display: "inline-block", flexShrink: 0 }} title="Консоль не привязана" />
                              )}
                              <span style={{ whiteSpace: 'nowrap' }}>{c.fullName}</span>

                              {/* 🔥 Ползунок во вкладке ЗП */}
                              <div
                                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }}
                                onClick={(e) => { e.stopPropagation(); toggleAuto(c.id, c.isAuto || false); }}
                                title="Сделать авто-курьером"
                              >
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
                            <div style={{ fontSize: 14 }}>{weekTotal.toFixed(0)} ₽</div>
                            {weekTotal > 0 && <div style={{ fontSize: 11, color: "#10b981", marginTop: 4 }}>x 1.06 = {weekTotal106.toFixed(0)} ₽</div>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}

        {/* --- МАРШРУТЫ --- */}
        {activeTab === "routes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                          <RouteEditor
                            key={rId}
                            routeId={rId} routeName={rName} routeLink={rLink}
                            initialOrders={rOrders}
                            globalFreeOrders={globalFreeOrders}
                            courierId={c.id}
                            routesDate={routesDate}
                            isMobile={isMobile}
                            onSaved={fetchAll}
                            onStatusChange={handleStatusChange}
                            onOpenDetail={setSelectedOrder}
                          />
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
                                    <div>
                                      <div style={{ fontSize: 10, color: "#a8a49c", fontFamily: "monospace" }}>{o.externalId ?? o.crmId}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: "#1a1a18" }}>{o.slotRaw}</div>
                                    </div>
                                    <div style={{ background: st.bg, color: st.color, padding: "4px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                                      {st.label}
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a18", marginBottom: 12, lineHeight: 1.4, flex: 1 }}>{o.address}</div>

                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setSelectedOrder(o as any)} style={{ flex: 1, background: "#fff", border: "1px solid #e8e6df", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✏️ Открыть</button>
                                    <button onClick={() => createRouteFromUnassigned(o.id, c.id)} style={{ flex: 2, background: "rgba(74, 122, 255, 0.08)", color: "#4a7aff", border: "none", padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                      ➕ В новый маршрут
                                    </button>
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

            {!loading && filtered.filter(c => orders.some(o => o.courierId === c.id && getODate(o) === routesDate)).length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#a8a49c", fontSize: 14 }}>
                На {formatDay(routesDate)} нет маршрутов
              </div>
            )}
          </div>
        )}

      </div>
      {/* --- 📋 ЗАДАНИЯ КОНСОЛИ --- */}
      {activeTab === "tasks" && (() => {
        const DB_ST: Record<string, { label: string; color: string; bg: string }> = {
          DRAFT: { label: "⏳ Черновик", color: "#6b6860", bg: "#f5f4f0" },
          CONFIRMED: { label: "🔵 Принято", color: "#4a7aff", bg: "#eef3ff" },
          CONFIRMED_ACT: { label: "📄 Акт готов", color: "#8b5cf6", bg: "#f5f3ff" },
          SIGNED_BY_US:    { label: "✅ Оплачено",    color: "#10b981", bg: "#f0fdf4" },
          PENDING_PAYMENT: { label: "💳 Нет денег",   color: "#d94040", bg: "#fef2f2" },        };
        const REMOTE_ST: Record<string, { label: string; color: string }> = {
          submitted: { label: "🟡 Ожидает курьера", color: "#f59e0b" },
          confirmed: { label: "🔵 В работе", color: "#4a7aff" },
          accepted: { label: "🟢 Выполнено", color: "#10b981" },
          finalized: { label: "📝 Финализировано", color: "#8b5cf6" },
          revoked: { label: "❌ Отозвано", color: "#d94040" },
          declined: { label: "❌ Отклонено", color: "#d94040" },
        };

        // Группировка по курьеру
        const byCourier: Record<number, any[]> = {};
        konsolTasks.forEach((t: any) => {
          if (!byCourier[t.courierId]) byCourier[t.courierId] = [];
          byCourier[t.courierId].push(t);
        });

        const allSelectableIds = konsolTasks.filter((t: any) => t.status !== "SIGNED_BY_US").map((t: any) => t.id);
        const isAllTasksSelected = allSelectableIds.length > 0 && allSelectableIds.every((id: string) => selectedTasks.has(id));
        const selArr = konsolTasks.filter((t: any) => selectedTasks.has(t.id));
        const selCanPay = selArr.filter((t: any) => t.status === "CONFIRMED").length;
        const selCanFinalize = selArr.filter((t: any) => t.status !== "SIGNED_BY_US").length;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Тулбар */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#fff", borderRadius: 10, border: "1px solid #e8e6df", flexWrap: "wrap" }}>
              <input
                type="checkbox"
                checked={isAllTasksSelected}
                onChange={() => setSelectedTasks(isAllTasksSelected ? new Set() : new Set(allSelectableIds))}
                style={{ ...s.checkbox, width: 15, height: 15 }}
                title="Выбрать все"
              />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a18" }}>
                Задания Консоль.Про {konsolTasks.length > 0 && `(${konsolTasks.length})`}
              </span>
              {konsolToast && (
                <span style={{ fontSize: 12, fontWeight: 600, color: konsolToast.type === "success" ? "#10b981" : "#d94040" }}>
                  {konsolToast.message}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button onClick={loadKonsolTasks} disabled={konsolTasksLoading} style={s.navBtn}>🔄</button>
              {selectedTasks.size > 0 && <>
                <span style={{ fontSize: 12, color: "#6b6860" }}>Выбрано: <b>{selectedTasks.size}</b></span>
                <button onClick={() => handleTasksAction("recalculate")} disabled={konsolTasksLoading} style={{ ...s.navBtn, background: "#f5f3ff", color: "#8b5cf6", borderColor: "#8b5cf6" }}>🔁 Пересчитать</button>
                {selCanFinalize > 0 && <button onClick={() => handleTasksAction("finalize")} disabled={konsolTasksLoading} style={{ ...s.navBtn, background: "#eef3ff", color: "#4a7aff", borderColor: "#4a7aff" }}>📄 Финализировать ({selCanFinalize})</button>}
                {selCanPay > 0 && <button onClick={() => handleTasksAction("pay")} disabled={konsolTasksLoading} style={{ background: "#10b981", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💳 Оплатить ({selCanPay})</button>}
              </>}
            </div>

            {/* Контент */}
            {konsolTasksLoading && konsolTasks.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#a8a49c" }}>Загрузка...</div>
            ) : konsolTasks.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#a8a49c" }}>Нет заданий. Нажмите 🔄</div>
            ) : Object.entries(byCourier).map(([cidStr, cTasks]) => {
              const cour = (cTasks as any[])[0].courier;
              const courierId = Number(cidStr);
              const selectableIds = (cTasks as any[]).filter(t => t.status !== "SIGNED_BY_US").map(t => t.id);
              const allCSelected = selectableIds.length > 0 && selectableIds.every((id: string) => selectedTasks.has(id));
              const courierTotal = (cTasks as any[]).reduce((acc, t) => acc + t.amount, 0);

              return (
                <div key={courierId} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflow: "hidden" }}>
                  {/* Шапка курьера */}
                  <div style={{ padding: "10px 14px", background: "#fafaf8", borderBottom: "1px solid #e8e6df", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                      <span style={{ fontSize: 11, background: "#f0fdf4", color: "#10b981", padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>✅ Оплачено: {(cTasks as any[]).filter(t => t.status === "SIGNED_BY_US").length}</span>
                    )}
                  </div>

                  {/* Строки заданий */}
                  {(cTasks as any[]).map((task: any, idx: number) => {
                    const dbStKey = task.status === "CONFIRMED" && task.konsolActId
                      ? "CONFIRMED_ACT"
                      : task.status;
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
                              disabled={isPaid}
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
                          <span style={{ fontSize: 11, background: dbSt.bg, color: dbSt.color, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{dbSt.label}</span>
                          {remoteSt && <span style={{ fontSize: 11, color: remoteSt.color, fontWeight: 700 }}>{remoteSt.label}</span>}
                          {remote === null && !remoteSt && isExpanded && <span style={{ fontSize: 11, color: "#a8a49c" }}>⏳ загрузка...</span>}
                          <div style={{ flex: 1 }} />
                          <span style={{ fontWeight: 700, fontSize: 13, color: isPaid ? "#10b981" : "#1a1a18" }}>{task.amount.toFixed(0)} ₽</span>
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4 }}>
                          {!isPaid && !task.konsolActId && (
                              <button
                                onClick={async () => { setSelectedTasks(new Set([task.id])); await handleTasksAction("finalize"); }}
                                disabled={konsolTasksLoading}
                                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #4a7aff", background: "#eef3ff", color: "#4a7aff", fontSize: 12, cursor: "pointer" }}
                                title="Финализировать"
                              >📄</button>
                            )}
                            {(task.status === "CONFIRMED" || task.status === "PENDING_PAYMENT") && (
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
                            {task.konsolActId && <div style={{ marginTop: 8, fontSize: 11, color: "#6b6860" }}>Акт #{task.konsolActId}</div>}
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
      {selectedOrder && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 450, maxWidth: "100%", background: "#fff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>
            <OrderDetail
              selected={selectedOrder as any}
              couriers={couriers.map(c => ({ value: c.fullName, label: c.fullName }))}
              onClose={() => setSelectedOrder(null)}
              onUpdateSuccess={() => { setSelectedOrder(null); fetchAll(); }}
              onPreviewGeo={() => { }}
              fixingAI={false}
              setFixingAI={() => { }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  app: { display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Manrope, system-ui, sans-serif", background: "#f5f4f0", overflow: "auto" },
  topbar: { display: "flex", alignItems: "center", gap: 8, padding: "0 16px", height: 52, background: "#fff", borderBottom: "1px solid #e8e6df", flexShrink: 0 },
  logo: { fontSize: 15, fontWeight: 600, color: "#1a1a18", display: "flex", alignItems: "center", gap: 7, marginRight: "auto", flexShrink: 0 },
  navBtn: { padding: "5px 10px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fafaf8", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#1a1a18", whiteSpace: "nowrap" },
  content: { margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 20, maxWidth: 1200 },
  headerRow: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 },
  title: { fontSize: 24, fontWeight: 700, color: "#1a1a18", margin: "0 0 16px 0" },
  tabActive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: "#4a7aff", color: "#fff", whiteSpace: "nowrap" },
  tabInactive: { padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #e8e6df", cursor: "pointer", background: "#fafaf8", color: "#6b6860", whiteSpace: "nowrap" },
  controls: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" },
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #e8e6df", outline: "none", fontSize: 13 },
  syncBtn: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a18", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  arrowBtn: { padding: "6px 12px", borderRadius: 6, border: "1px solid #e8e6df", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6b6860" },
  tableWrap: { background: "#fff", borderRadius: 12, border: "1px solid #e8e6df", overflowX: "auto", boxShadow: "0 2px 8px rgba(0,0,0,0.02)", width: "100%" },
  table: { width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" },
  th: { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#a8a49c", background: "#fafaf8", borderBottom: "1px solid #e8e6df", fontWeight: 600 },
  td: { padding: "12px", fontSize: 13, color: "#1a1a18", verticalAlign: "middle" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#4a7aff", margin: 0 }
};