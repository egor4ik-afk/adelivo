// src/app/manager/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ProfilePanel } from '@/components/ProfilePanel';
import Link from 'next/link';

type ChangeType = 'TIME_CHANGED' | 'ORDERS_CHANGED' | 'ROUTE_REASSIGNED' | 'COURIER_CHANGED' | 'OP_COMMENT_ADDED' | 'ITEMS_CHANGED' | string;
interface Notification {
  id: string; courierId?: string; courierName: string;
  newValue: string; oldValue?: string | null; authorName?: string | null;
  changeType: ChangeType; isSeen: boolean; createdAt: string;
}

const badgeConfig: Record<string, { text: string; styles: string; icon: string }> = {
  TIME_CHANGED: { text: 'Изменилось время', styles: 'bg-orange-100 text-orange-800', icon: '⏱' },
  ORDERS_CHANGED: { text: 'Изменились заказы', styles: 'bg-blue-100 text-blue-800', icon: '📦' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800', icon: '🗺️' },
  COURIER_CHANGED: { text: 'Смена курьера', styles: 'bg-purple-100 text-purple-800', icon: '👤' },
  OP_COMMENT_ADDED: { text: 'Комментарий оператора', styles: 'bg-yellow-100 text-yellow-800', icon: '💬' },
  ITEMS_CHANGED: { text: 'Изменен состав', styles: 'bg-green-100 text-green-800', icon: '💐' }, // 🔥 Добавили новую строку
  DEFAULT: { text: 'Изменения', styles: 'bg-[var(--color-bg)] text-[var(--color-text)]', icon: '🔔' }
};

const LOCAL_STATUSES: Record<string, { label: string, color: string }> = {
  NEW: { label: 'Новый', color: 'bg-[var(--color-bg)] text-[var(--color-text-2)]' },
  ASSEMBLING: { label: 'В сборке', color: 'bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border border-[var(--color-warn-border)]' },
  ASSIGNED: { label: 'Назначен', color: 'bg-blue-100 text-blue-700' },
  IN_DELIVERY: { label: '🚀 В пути', color: 'bg-yellow-100 text-yellow-800' },
  DELIVERED: { label: '✅ Доставлен', color: 'bg-green-100 text-green-800' },
  RETURNED: { label: '↩️ Возврат', color: 'bg-red-100 text-red-800' },
  CANCELLED: { label: '❌ Отменен', color: 'bg-[var(--color-border)] text-[var(--color-text-3)]' },
};

const CRM_STATUSES: Record<string, { label: string, color: string }> = {
  'new': { label: 'Новый (CRM)', color: 'border-[var(--color-border)] text-[var(--color-text-2)] bg-[var(--color-surface)]' },
  'assembling': { label: 'Сборка', color: 'border-yellow-200 text-yellow-700 bg-yellow-50' },
  'assembling-complete': { label: 'Собран', color: 'border-teal-200 text-teal-700 bg-teal-50' },
  'send-to-delivery': { label: 'Передан', color: 'border-purple-200 text-purple-700 bg-purple-50' },
  'complete': { label: 'Выполнен', color: 'border-green-200 text-green-700 bg-green-50' },
  'cancel-other': { label: 'Отменен (CRM)', color: 'border-[var(--color-border)] text-[var(--color-text-3)] bg-[var(--color-surface)]' },
  'return': { label: 'Возврат (CRM)', color: 'border-red-200 text-red-700 bg-red-50' },
  'chastichnyi-vozvrat': { label: 'Част. возврат', color: 'border-orange-200 text-orange-700 bg-orange-50' },
};

function getRouteTimeRange(orders: any[]) {
  if (!orders || orders.length === 0) return null;
  let min = 24, max = 0, found = false;
  orders.forEach(o => {
    if (!o.slotRaw) return;
    const matches = o.slotRaw.match(/(\d{1,2})(?=:)/g);
    if (matches) {
      matches.forEach((m: string) => {
        const num = parseInt(m, 10);
        if (num >= 0 && num <= 24) {
          if (num < min) min = num;
          if (num > max) max = num;
          found = true;
        }
      });
    }
  });
  if (!found || min === 24 || max === 0) return null;
  return `с ${min}:00 до ${max}:00`;
}

// КОМПАКТНЫЙ КОМПОНЕНТ КОНТАКТОВ
const ContactBadge = ({ title, phone, name, isCourier }: { title?: string, phone: string, name?: string, isCourier?: boolean }) => {
  const hasPhone = phone && phone !== "—";
  if (!name && !hasPhone) return null;

  const cleanPhoneForTg = hasPhone ? phone.replace(/[^\d+]/g, "") : "";
  const encodedMsg = encodeURIComponent(isCourier ? "Привет! Это менеджер ADelivo." : `Здравствуйте${name ? `, ${name}` : ''}! Это доставка ADelivo.`);

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-accent)] flex-wrap">
        {title && <span className="text-[var(--color-text-2)] text-[10px] uppercase tracking-wider font-bold mr-1">{title}</span>}
        {name && <span className="text-[var(--color-text)]">👤 {name}</span>}
        {name && hasPhone && <span className="text-[var(--color-text-3)]">·</span>}
        {hasPhone && (
          <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} className="hover:underline flex items-center gap-1">📞 {phone}</a>
        )}
      </div>
      {cleanPhoneForTg && (
        <div className="flex items-center gap-2">
          <a href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Написать в Telegram" className="flex items-center justify-center bg-[#2AABEE] w-[26px] h-[26px] rounded-full shadow-sm hover:opacity-90 transition-opacity">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
          </a>
          <a href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`} title="Отправить SMS" onClick={e => e.stopPropagation()} className="flex items-center justify-center bg-[#34C759] w-[26px] h-[26px] rounded-full shadow-sm hover:opacity-90 transition-opacity">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
          </a>
        </div>
      )}
    </div>
  );
};

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<'new' | 'routes' | 'history'>('new');
  const [tasks, setTasks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [headerProfile, setHeaderProfile] = useState<{ firstName?: string | null; lastName?: string | null; email?: string; avatarUrl?: string | null } | null>(null);

  // Состояния для аккордеонов (разворачивания маршрутов)
  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});
  const [expandedPendingRoutes, setExpandedPendingRoutes] = useState<Record<string, boolean>>({});

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMassUpdating, setIsMassUpdating] = useState(false);

  // Фильтры и поиск
  const [searchQuery, setSearchQuery] = useState('');
  const [searchByIdOnly, setSearchByIdOnly] = useState(false);
  const [printA4, setPrintA4] = useState(false);

  // Читаем сохраненное значение при первой загрузке страницы
  useEffect(() => {
    const savedFormat = localStorage.getItem('printFormatA4');
    if (savedFormat !== null) {
      setPrintA4(savedFormat === 'true');
    }
  }, []);

  // Функция для обновления и стейта, и localStorage
  const handlePrintFormatChange = (isChecked: boolean) => {
    setPrintA4(isChecked);
    localStorage.setItem('printFormatA4', String(isChecked));
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => { if (!res.ok) throw new Error('Not logged in'); return res.json(); })
      .then((data) => {
        if (data?.role !== 'OPERATOR' && data?.role !== 'ADMIN') return window.location.replace('/dashboard');
        setIsAuthorized(true);
      })
      .catch((err) => { if (err.message === 'Not logged in') window.location.replace('/login'); });
  }, []);

  // Аватарка/инициалы для кнопки в шапке — те же данные, что и в ProfilePanel
  useEffect(() => {
    if (!isAuthorized) return;
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setHeaderProfile(data); })
      .catch(() => { });
  }, [isAuthorized]);

  const loadData = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true);
    try {
      if (activeTab === 'new' || activeTab === 'routes') {
        const [notifRes, routesRes] = await Promise.all([fetch('/api/manager/notifications'), fetch('/api/manager/routes')]);
        const notifData = await notifRes.json();
        const routesData = await routesRes.json();
        if (Array.isArray(notifData)) setTasks(notifData);

        if (Array.isArray(routesData)) {
          const sortedRoutes = routesData.sort((a, b) => {
            const getPrio = (r: any) => {
              if (!r.orders || r.orders.length === 0) return 1;
              if (r.orders.every((o: any) => ['DELIVERED', 'RETURNED', 'CANCELLED'].includes(o.status))) return 3;
              if (r.orders.some((o: any) => ['IN_DELIVERY', 'DELIVERED'].includes(o.status))) return 2;
              return 1;
            };
            const prioA = getPrio(a), prioB = getPrio(b);
            if (prioA !== prioB) return prioA - prioB;
            return (a.plannedDepartureTime || "23:59").localeCompare(b.plannedDepartureTime || "23:59");
          });
          setRoutes(sortedRoutes);
          // Убрали принудительное раскрытие маршрутов:
          // setExpandedRoutes(...) 
        }
      }
      else if (activeTab === 'history') {
        const res = await fetch('/api/manager/notifications?history=true');
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch (e) { console.error(e); }
    if (showLoadingState) setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (isAuthorized) {
      const needsLoading =
        (activeTab === 'new' && tasks.length === 0) ||
        (activeTab === 'routes' && routes.length === 0) ||
        (activeTab === 'history' && history.length === 0);

      loadData(needsLoading);
    }
  }, [activeTab, isAuthorized, loadData]);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'new') setActiveTab('new');
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;
    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      if (event.data.type === 'PUSH_RECEIVED') loadData(false);
      else if (event.data.type === 'NOTIFICATION_CLICK' && (event.data.tab === 'new' || (!event.data.orderId && event.data.role !== 'COURIER'))) setActiveTab('new');
    };
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleSWMessage);
    const interval = setInterval(() => loadData(false), 15000);
    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      clearInterval(interval);
    };
  }, [isAuthorized, loadData]);

  const displayedRoutes = useMemo(() => {
    if (!searchQuery.trim()) return routes;
    const lowerQ = searchQuery.toLowerCase().trim();

    return routes.map(route => {
      const courierName = route.courier?.fullName?.toLowerCase() || "";
      const isCourierMatch = !searchByIdOnly && courierName.includes(lowerQ);

      const matchingOrders = (route.orders || []).filter((o: any) => {
        if (isCourierMatch) return true;
        const displayId = String(o.externalId || o.crmId || o.number || o.id || "").toLowerCase();
        if (searchByIdOnly) return displayId.includes(lowerQ);

        const searchStr = `
        ${displayId} ${o.address || ""} ${o.name || ""} 
        ${o.recipientPhone || o.phone || ""} ${o.customerName || ""} 
        ${o.customerPhone || ""} ${o.comment || ""} ${o.opComment || ""}
      `.toLowerCase();
        return searchStr.includes(lowerQ);
      });

      return { ...route, orders: matchingOrders };
    }).filter(r => r.orders.length > 0);
  }, [routes, searchQuery, searchByIdOnly]);

  const toggleRouteExpansion = (id: string) => setExpandedRoutes(prev => ({ ...prev, [id]: !prev[id] }));
  const togglePendingRouteExpansion = (id: string) => setExpandedPendingRoutes(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleOrderSelection = (id: string) => setSelectedOrders(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleRouteOrders = (ids: string[]) => setSelectedOrders(prev => {
    const next = new Set(prev);
    ids.every(id => next.has(id)) ? ids.forEach(id => next.delete(id)) : ids.forEach(id => next.add(id));
    return next;
  });

  const allRouteOrderIds = displayedRoutes.flatMap(r => r.orders?.map((o: any) => o.id) || []);
  const isAllGlobalSelected = allRouteOrderIds.length > 0 && allRouteOrderIds.every(id => selectedOrders.has(id));
  const toggleAllGlobalOrders = () => setSelectedOrders(isAllGlobalSelected ? new Set() : new Set(allRouteOrderIds));

  const handlePrintLabels = async () => {
    if (selectedOrders.size === 0) return alert("Выберите заказы для печати");
    try {
      const res = await fetch('/api/manager/routes/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
          format: printA4 ? 'A4' : '120x75'
        })
      });
      if (!res.ok) throw new Error("Ошибка генерации");
      const url = window.URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `Labels_${printA4 ? 'A4' : '120x75'}_${Date.now()}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e) { alert("Ошибка печати"); }
  };

  const updateOrderStatusSingle = async (id: string, crmStatus: string) => {
    try { await fetch(`/api/manager/orders/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crmStatus }) }); loadData(false); } catch (e) { }
  };

  const massUpdateToAssembling = async () => {
    if (selectedOrders.size === 0 || !confirm(`В сборку ${selectedOrders.size} заказов?`)) return;
    setIsMassUpdating(true);
    try {
      await Promise.all(Array.from(selectedOrders).map(id => fetch(`/api/manager/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ crmStatus: 'assembling' }), headers: { 'Content-Type': 'application/json' } })));
      loadData(false); setSelectedOrders(new Set());
    } catch (e) { alert("Ошибка обновления"); } finally { setIsMassUpdating(false); }
  };

  const updateRouteBulkStatus = async (id: string, action: 'assembling' | 'assembling-complete' | 'send-to-delivery') => {
    const msgs = { 'assembling': "Все на сборку?", 'assembling-complete': "Все собраны?", 'send-to-delivery': "Все передать курьеру?" };
    if (!confirm(msgs[action])) return;
    try { await fetch(`/api/manager/routes/${id}/status`, { method: 'PATCH', body: JSON.stringify({ crmStatus: action }) }); loadData(false); } catch (e) { }
  };

  const markAsSeen = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    try { await fetch(`/api/manager/notifications/${id}`, { method: 'PATCH' }); } catch (e) { }
  };

  if (!isAuthorized) return <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]"><p className="text-[var(--color-text-3)] font-medium animate-pulse">Проверка прав...</p></div>;

  const tasksWithRoutes = tasks.map(task => ({ ...task, routeData: null })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingRoutes = routes.filter(route => {
    if (!route.orders?.length) return false;
    const hasAssigned = route.orders.some((o: any) => o.status === 'ASSIGNED' || o.status === 'ASSEMBLING');
    const hasStarted = route.orders.some((o: any) => o.status === 'IN_DELIVERY' || o.status === 'DELIVERED');
    return hasAssigned && !hasStarted;
  });

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="bg-[var(--color-card)] shadow-sm border-b border-[var(--color-border)] px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
          <h1 className="text-xl font-bold text-[var(--color-text)] tracking-tight">Кабинет менеджера</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/manager/orders/new"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-[12px] sm:text-sm font-bold shadow-sm hover:bg-[var(--color-accent-dark)] transition-colors shrink-0"
            title="Создать заказ вручную"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">Заказ</span>
          </Link>

          <div className="relative">
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center hover:opacity-90 transition-opacity shrink-0" title="Профиль">
            {headerProfile?.avatarUrl ? (
              <img src={headerProfile.avatarUrl} alt="Профиль" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[var(--color-accent)] text-white flex items-center justify-center text-[15px] font-semibold">
                {headerProfile
                  ? (((headerProfile.firstName?.[0] ?? '') + (headerProfile.lastName?.[0] ?? '')).toUpperCase() || (headerProfile.email?.slice(0, 2).toUpperCase() ?? '??'))
                  : '··'}
              </div>
            )}
          </button>
          {isProfileOpen && <div className="absolute right-0 top-14 z-50"><ProfilePanel onClose={() => setIsProfileOpen(false)} /></div>}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-3 sm:p-6 w-full overflow-hidden">
        <div className="w-full overflow-x-auto hide-scrollbar mb-4 sm:mb-6 pb-2">
          <div className="flex bg-[var(--color-border)] p-1 rounded-xl w-max shadow-inner gap-1">
            <button onClick={() => setActiveTab('new')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'new' ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'}`}>
              Табло изменений {tasks.length > 0 && <span className="bg-[var(--color-red)] text-white px-2 py-0.5 rounded-full text-[11px]">{tasks.length}</span>}
            </button>
            <button onClick={() => setActiveTab('routes')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'routes' ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'}`}>Все маршруты</button>
            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'history' ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'}`}>История логов</button>
          </div>
        </div>

        {loading ? <p className="text-center text-[var(--color-text-3)] mt-10 animate-pulse">Загрузка данных...</p> : (
          <div className="flex flex-col gap-6">

            {activeTab === 'new' && (
              <div className="flex flex-col gap-6">

                {/* БЛОК УВЕДОМЛЕНИЙ */}
                <div className="flex flex-col gap-2.5 sm:gap-3">
                  {tasksWithRoutes.map((item) => {
                    // oldValue/newValue могут содержать несколько строк (через \n) у любого типа
                    // изменения (не только MULTIPLE_CHANGES) — раскладываем их в ряд на ПК.
                    const oldLines = (item.oldValue || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
                    const newLines = (item.newValue || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
                    const changeCount = Math.max(oldLines.length, newLines.length, 1);
                    const isNoStrike = (line?: string) => item.changeType === 'ORDERS_CHANGED' || (!!line && /📦|➕|➖|Состав|Добавили|Убрали/.test(line));

                    return (
                      <div key={item.id} className="bg-[var(--color-card)] border border-[var(--color-border)] hover:border-rose-100 rounded-xl shadow-sm transition-all group overflow-hidden">
                        <div className="p-2.5 sm:p-4 flex flex-col sm:grid sm:grid-cols-[2fr_3fr_auto] gap-2 sm:gap-4 sm:items-center relative">

                          <div className="pr-8 sm:pr-0 w-full flex flex-col">
                            {/* Автор на одном уровне со временем, справа */}
                            <div className="flex justify-between items-center mb-1">
                              <div className="text-[10px] sm:text-[11px] font-semibold text-[var(--color-text-3)]">⏱ {new Date(item.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                              <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--color-text-2)]">{item.authorName ? `От: ${item.authorName}` : 'Система'}</span>
                            </div>

                            <div className="font-extrabold text-[var(--color-text)] text-[13px] sm:text-base leading-tight">{item.courierName}</div>

                            {/* Тип изменения напротив Маршрута */}
                            <div className="flex justify-between items-center mt-1.5">
                              {item.routeName ? <div className="text-[10px] sm:text-[11px] font-medium text-[var(--color-text-3)]">{item.routeName}</div> : <div />}
                              <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold rounded-lg ${badgeConfig[item.changeType]?.styles || badgeConfig.DEFAULT.styles}`}>
                                {badgeConfig[item.changeType]?.icon || badgeConfig.DEFAULT.icon} {badgeConfig[item.changeType]?.text || badgeConfig.DEFAULT.text}
                              </span>
                            </div>
                          </div>

                          {/* Кнопка прочитано для мобилок (абсолютно вверху справа) */}
                          <button onClick={() => markAsSeen(item.id)} className="sm:hidden absolute top-2 right-2 w-7 h-7 border border-[var(--color-border)] rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:border-green-500 hover:bg-green-50 hover:text-green-600 transition-colors shadow-sm" title="Пометить увиденным">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </button>

                          <div className="flex flex-col sm:flex-row sm:flex-wrap flex-grow bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-2 sm:p-2.5 gap-2 sm:gap-3 text-[11px] sm:text-[12px] leading-snug">
                            {Array.from({ length: changeCount }).map((_, i) => {
                              const oldL = oldLines[i];
                              const newL = newLines[i] ?? newLines[0] ?? item.newValue;
                              const showOld = !!oldL && oldL !== newL && oldL !== "Не было" && oldL !== "—";
                              return (
                                <div key={i} className="flex flex-col sm:flex-1 sm:min-w-[120px]">
                                  {showOld && (
                                    <div className="flex items-start gap-1.5 text-[var(--color-text-3)] mb-1">
                                      <span className="shrink-0 text-[9px] uppercase tracking-wider font-semibold mt-0.5">Было:</span>
                                      {isNoStrike(oldL) ? <span className="break-words line-clamp-1">{oldL}</span> : <s className="break-words line-clamp-1">{oldL}</s>}
                                    </div>
                                  )}
                                  <div className="flex items-start gap-1.5 text-[var(--color-text)]">
                                    {showOld && <span className="shrink-0 text-[9px] uppercase tracking-wider font-semibold mt-0.5 text-[var(--color-text-3)]">Стало:</span>}
                                    <span className="font-bold break-words whitespace-pre-wrap">{newL}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Кнопка прочитано для ПК */}
                          <div className="hidden sm:flex justify-end">
                            <button onClick={() => markAsSeen(item.id)} className="w-10 h-10 border-2 border-[var(--color-border)] rounded-xl flex items-center justify-center text-transparent hover:border-green-500 hover:bg-green-50 hover:text-green-600 transition-all shadow-sm" title="Пометить увиденным">
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {tasksWithRoutes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
                      <div className="text-3xl mb-3">☕</div><p className="text-[var(--color-text)] font-bold text-base">Всё спокойно</p><p className="text-[var(--color-text-3)] text-sm mt-1">Непрочитанных изменений нет</p>
                    </div>
                  )}
                </div>

                {/* БЛОК ОЖИДАЮТ ЗАГРУЗКИ (СВЕРНУТЫЕ АККОРДЕОНЫ) */}
                <div className="pt-4 border-t-2 border-dashed border-[var(--color-border)]">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-xl sm:text-2xl">🚚</span>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-tight">Ожидают загрузки на базе</h2>
                      <p className="text-[11px] sm:text-sm text-[var(--color-text-3)] font-medium mt-0.5">Назначены, но еще не в пути</p>
                    </div>
                    <div className="ml-auto bg-[var(--color-border)] text-[var(--color-text-2)] font-black px-2.5 py-0.5 rounded-lg text-sm sm:text-base">{pendingRoutes.length}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {pendingRoutes.map((route) => {
                      const isExpanded = !!expandedPendingRoutes[route.id];

                      return (
                        <div key={route.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-sm flex flex-col hover:border-[var(--color-border-2)] transition-colors overflow-hidden h-fit">

                          <div
                            className="flex justify-between items-center p-3 cursor-pointer hover:bg-[var(--color-surface)] transition-colors gap-2"
                            onClick={() => togglePendingRouteExpansion(route.id)}
                          >
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-[var(--color-text-3)] w-3 text-center text-[10px] shrink-0">{isExpanded ? '▼' : '▶'}</span>
                              <span className="font-extrabold text-[14px] text-[var(--color-text)]">{route.courier?.fullName || 'Не назначен'}</span>

                              <span className="text-[10px] font-medium text-[var(--color-text-2)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] shadow-sm whitespace-nowrap shrink-0">
                                {route.name || route.id.slice(-5).toUpperCase()}
                              </span>

                              {route.plannedDepartureTime && (
                                <span className="text-[12px] font-bold text-[var(--color-text)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] shadow-sm whitespace-nowrap shrink-0">
                                  🏠 {route.plannedDepartureTime}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center shrink-0">
                              <span className="bg-[var(--color-accent-soft)] text-[var(--color-accent)] px-2 py-0.5 rounded-md text-[11px] font-bold border border-[var(--color-accent-soft-2)] whitespace-nowrap">
                                {route.orders?.length || 0} точ.
                              </span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="flex flex-col gap-2 p-2.5 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                              {(() => {
                                const sortedOrders = [...(route.orders || [])].sort((a: any, b: any) => a.eta && b.eta ? a.eta.localeCompare(b.eta) : a.eta ? -1 : b.eta ? 1 : (a.routeOrder || 0) - (b.routeOrder || 0));
                                if (sortedOrders.length === 0) return <p className="text-xs text-[var(--color-text-3)] p-2 text-center">Точек нет</p>;

                                return sortedOrders.map((order: any, idx: number) => {
                                  const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;
                                  const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-[var(--color-border)] text-[var(--color-text-3)] bg-[var(--color-card)]' }) : null;
                                  const displayId = order.externalId || order.crmId || order.number || order.id.slice(-6);

                                  return (
                                    <div key={order.id} className="flex gap-2 items-start p-2.5 bg-[var(--color-card)] rounded-lg border border-[var(--color-border)] shadow-sm">
                                      <div className="w-5 h-5 rounded-md bg-[var(--color-text)] text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">{idx + 1}</div>
                                      <div className="flex-grow min-w-0">
                                        <p className="text-[12px] sm:text-[13px] font-bold text-[var(--color-text)] leading-snug break-words mb-1.5">{order.address || 'Адрес не указан'}</p>

                                        <div className="flex justify-between items-center">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="inline-block bg-[var(--color-surface)] text-[var(--color-text-2)] px-1.5 py-0.5 rounded text-[10px] font-bold border border-[var(--color-border)]">⏱ {order.slotRaw || '—'}</span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>{localStatus.label}</span>
                                            {crmConf && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                          </div>
                                          {/* Номер заказа справа */}
                                          <span className="text-[10px] font-semibold text-[var(--color-text-3)]">{displayId}</span>
                                        </div>

                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {pendingRoutes.length === 0 && <p className="text-[var(--color-text-3)] font-medium text-center py-8 text-sm">Все назначенные курьеры уже выехали</p>}
                </div>
              </div>
            )}

            {activeTab === 'routes' && (
              <>
                <div className="mb-4 flex flex-row gap-2 items-center z-10 max-w-3xl">
                  <div className="relative w-2/3 sm:flex-1 min-w-0">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-[var(--color-text-3)] text-lg">🔍</span>
                    <input
                      type="text"
                      placeholder={searchByIdOnly ? "Поиск по ID..." : "Номер, имя, адрес..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-11 pr-10 py-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-4 focus:ring-blue-100 shadow-sm transition-all font-medium placeholder-[var(--color-text-3)]"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 flex items-center pr-4 text-[var(--color-text-3)] hover:text-[var(--color-text)] transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                      </button>
                    )}
                  </div>

                  <label className="w-1/3 sm:w-auto flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--color-text-2)] cursor-pointer shrink-0 bg-[var(--color-card)] px-2 sm:px-4 py-3.5 border border-[var(--color-border)] rounded-2xl shadow-sm hover:bg-[var(--color-surface)] transition-colors h-[54px]">
                    <input
                      type="checkbox"
                      checked={searchByIdOnly}
                      onChange={(e) => setSearchByIdOnly(e.target.checked)}
                      className="w-4 h-4 sm:w-5 sm:h-5 accent-[var(--color-text)] rounded cursor-pointer shrink-0"
                    />
                    <span className="hidden sm:inline">Только ID / Номер</span>
                    <span className="sm:hidden text-[11px] uppercase tracking-wider">Только ID</span>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[var(--color-card)] p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[var(--color-border)] shadow-sm mb-2 sticky top-[72px] sm:top-[84px] z-10 gap-3 sm:gap-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <input type="checkbox" className="w-4 h-4 sm:w-5 sm:h-5 accent-[var(--color-text)] rounded cursor-pointer shrink-0" checked={isAllGlobalSelected} onChange={toggleAllGlobalOrders} />
                    <span className="font-bold text-[var(--color-text)] text-[13px] sm:text-[15px]">Выбрать все {searchQuery ? 'найденные' : ''}</span>
                    {selectedOrders.size > 0 && <span className="bg-[var(--color-accent-soft)] text-[var(--color-accent)] px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg text-[11px] sm:text-sm font-bold border border-[var(--color-accent-soft-2)] ml-1 sm:ml-2 shadow-sm">Выбрано: {selectedOrders.size}</span>}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button onClick={massUpdateToAssembling} disabled={selectedOrders.size === 0 || isMassUpdating} className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${selectedOrders.size > 0 ? 'bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border border-[var(--color-warn-border)] hover:bg-[var(--color-warn-bg-2)]' : 'bg-[var(--color-bg)] text-[var(--color-text-3)] cursor-not-allowed border border-[var(--color-border)]'}`}>
                      {isMassUpdating ? '⏳...' : '📦 В сборку'}
                    </button>

                    <label className={`flex items-center gap-1.5 text-xs sm:text-sm font-bold cursor-pointer px-2 sm:px-3 py-2 border rounded-lg shadow-sm transition-colors ${selectedOrders.size > 0 ? 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface)]' : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-3)]'}`}>
                      <input
                        type="checkbox"
                        checked={printA4}
                        // Используем нашу новую функцию
                        onChange={(e) => handlePrintFormatChange(e.target.checked)}
                        disabled={selectedOrders.size === 0}
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 accent-[var(--color-text)] rounded cursor-pointer"
                      />
                      А4
                    </label>

                    <button onClick={handlePrintLabels} disabled={selectedOrders.size === 0} className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1 sm:gap-2 ${selectedOrders.size > 0 ? 'bg-[var(--color-text)] text-white hover:bg-gray-800' : 'bg-[var(--color-bg)] text-[var(--color-text-3)] cursor-not-allowed border border-[var(--color-border)]'}`}>
                      🖨️ Печать ({printA4 ? 'А4' : '75x120'})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  {displayedRoutes.map((route) => {
                    const isExpanded = expandedRoutes[route.id] || searchQuery.trim().length > 0;
                    const routeOrderIds = route.orders?.map((o: any) => o.id) || [];
                    const isAllSelected = routeOrderIds.length > 0 && routeOrderIds.every((id: string) => selectedOrders.has(id));
                    const routeTimeRange = getRouteTimeRange(route.orders);

                    const activeOrders = route.orders?.filter((o: any) => !['CANCELLED', 'RETURNED'].includes(o.status)) || [];
                    const isAllInDeliveryOrDone = activeOrders.length > 0 && activeOrders.every((o: any) => ['IN_DELIVERY', 'DELIVERED'].includes(o.status) || o.crmStatus === 'send-to-delivery');

                    let bulkAction: 'assembling' | 'assembling-complete' | 'send-to-delivery' | null = null;
                    let bulkText = "", bulkStyles = "";

                    if (!isAllInDeliveryOrDone && activeOrders.length > 0) {
                      if (activeOrders.some((o: any) => !o.crmStatus || o.crmStatus === 'new')) {
                        bulkAction = 'assembling'; bulkText = '📦 В сборку'; bulkStyles = 'bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)] hover:bg-[var(--color-warn-bg-2)]';
                      } else if (activeOrders.some((o: any) => o.crmStatus === 'assembling')) {
                        bulkAction = 'assembling-complete'; bulkText = '✅ Собраны'; bulkStyles = 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100';
                      } else if (activeOrders.some((o: any) => o.crmStatus === 'assembling-complete')) {
                        bulkAction = 'send-to-delivery'; bulkText = '🚀 Передать'; bulkStyles = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
                      }
                    }

                    const courierPhone = route.courier?.phone || "—";
                    const cleanPhoneForTg = courierPhone !== "—" ? courierPhone.replace(/[^\d+]/g, "") : "";
                    const encodedMsg = encodeURIComponent("Привет! Это менеджер ADelivo.");

                    return (
                      <div key={route.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-sm transition-all overflow-hidden">
                        <div className="flex flex-row items-center justify-between p-3 hover:bg-[var(--color-surface)] cursor-pointer transition-colors gap-2" onClick={() => toggleRouteExpansion(route.id)}>
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap overflow-hidden">
                            <input type="checkbox" className="w-4 h-4 accent-[var(--color-text)] rounded cursor-pointer shrink-0" checked={isAllSelected} onChange={(e) => { e.stopPropagation(); toggleRouteOrders(routeOrderIds); }} onClick={e => e.stopPropagation()} />
                            <span className="text-[var(--color-text-3)] w-3 text-center text-[10px] shrink-0">{isExpanded ? '▼' : '▶'}</span>
                            <span className="font-black text-[13px] sm:text-[14px] text-[var(--color-text)] whitespace-nowrap">{route.courier?.fullName || 'Не назначен'}</span>
                            <span className="text-[10px] font-extrabold text-[var(--color-text-2)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] whitespace-nowrap shadow-sm">🗺️ {route.name || `#${route.id.slice(-5).toUpperCase()}`}</span>

                            {courierPhone !== "—" && (
                              <div className="flex items-center gap-1.5 ml-1">
                                <a href={`tel:${courierPhone}`} onClick={e => e.stopPropagation()} className="text-[var(--color-accent)] font-semibold text-[11px] sm:text-[13px] hover:underline whitespace-nowrap">
                                  📞 {courierPhone}
                                </a>
                                {cleanPhoneForTg && (
                                  <>
                                    <a href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="bg-[#2AABEE] w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full hover:opacity-90">
                                      <svg viewBox="0 0 24 24" width="8" height="8" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
                                    </a>
                                    <a href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`} onClick={e => e.stopPropagation()} className="bg-[#34C759] w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full hover:opacity-90">
                                      <svg viewBox="0 0 24 24" width="8" height="8" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
                                    </a>
                                  </>
                                )}
                              </div>
                            )}

                            {route.plannedDepartureTime && <span className="text-[10px] font-bold text-[var(--color-text)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] shadow-sm">🏠 {route.plannedDepartureTime}</span>}
                            {routeTimeRange && <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200 whitespace-nowrap">Слоты: {routeTimeRange}</span>}
                            <span className="text-[10px] font-bold text-[var(--color-text-2)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded-md border border-[var(--color-border)] whitespace-nowrap hidden sm:inline-block">Точек: {route.orders?.length || 0}</span>
                          </div>

                          {bulkAction && <button onClick={(e) => { e.stopPropagation(); updateRouteBulkStatus(route.id, bulkAction!); }} className={`shrink-0 border px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[12px] font-bold transition-colors shadow-sm ml-auto ${bulkStyles}`}>{bulkText}</button>}
                        </div>

                        {isExpanded && (
                          <div className="p-3 sm:p-4 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                              {(() => {
                                const sortedOrders = [...(route.orders || [])].sort((a: any, b: any) => a.eta && b.eta ? a.eta.localeCompare(b.eta) : a.eta ? -1 : b.eta ? 1 : (a.routeOrder || 0) - (b.routeOrder || 0));
                                if (sortedOrders.length === 0) return <p className="text-sm text-[var(--color-text-3)] font-medium p-2 col-span-full text-center">Нет точек</p>;

                                return sortedOrders.map((order: any, idx: number) => {
                                  const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-[var(--color-border)] text-[var(--color-text-3)] bg-[var(--color-card)]' }) : null;
                                  const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;
                                  const isMeura = order.shop === 'kaktusfiori' || order.shop === 'meura-flowers';
                                  const displayId = order.externalId || order.crmId || order.number || order.id.slice(-6);

                                  return (
                                    <div key={order.id} className="flex flex-col bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm p-2.5 sm:p-3 relative hover:border-[var(--color-border-2)] transition-colors">
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                          <input type="checkbox" className="w-4 h-4 accent-[var(--color-text)] rounded cursor-pointer shrink-0" checked={selectedOrders.has(order.id)} onChange={() => toggleOrderSelection(order.id)} />
                                          <div className="w-5 h-5 rounded bg-[var(--color-text)] text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                                          <span className="font-black text-[13px] sm:text-[14px] text-[var(--color-text)] truncate max-w-[100px]" title={String(displayId)}>{displayId}</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-[var(--color-text-2)] bg-[var(--color-bg)] px-1.5 py-0.5 rounded border border-[var(--color-border)] shrink-0">⏱ {order.slotRaw || '—'}</span>
                                      </div>

                                      <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isMeura ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>{isMeura ? "🌸 Meura" : "📦 Bunch"}</span>
                                        <div className="flex items-center gap-1.5 ml-auto">
                                          {order.crmCreatedAt && <span className="text-[9px] text-[var(--color-text-3)] font-medium">Создан: {new Date(order.crmCreatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                                          <Link
                                            href={`/manager/orders/${order.id}/edit`}
                                            onClick={(e) => e.stopPropagation()}
                                            title="Редактировать заказ"
                                            aria-label="Редактировать заказ"
                                            className="w-6 h-6 rounded-md border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-3)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors shrink-0"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                              <path d="M12 20h9" />
                                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                            </svg>
                                          </Link>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap gap-1 mb-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>{localStatus.label}</span>
                                        {crmConf && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                      </div>

                                      <div className="text-[12px] sm:text-[13px] font-medium text-[var(--color-text)] leading-tight mb-2 min-h-[30px]">
                                        {order.address || 'Адрес не указан'}
                                        {order.eta && <span className="inline-block ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">~{order.eta}</span>}
                                      </div>

                                      <div className="flex flex-col gap-1 mt-1 mb-2">
                                        <ContactBadge title="Заказчик:" name={order.customerName} phone={order.customerPhone || "—"} />

                                        {order.comment && (
                                          <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] p-1.5 rounded">
                                            <p className="text-[10px] sm:text-[11px] text-[var(--color-danger-text)]"><span className="font-bold text-[var(--color-danger-text-2)] uppercase tracking-wider text-[8px] sm:text-[9px] block mb-0.5">Коммент заказчика</span> {order.comment}</p>
                                          </div>
                                        )}

                                        {(order.customerName || (order.customerPhone && order.customerPhone !== "—")) && (order.name || (order.recipientPhone && order.recipientPhone !== "—")) && (
                                          <div className="h-px bg-[var(--color-border)] w-full my-1"></div>
                                        )}

                                        <ContactBadge title="Получатель:" name={order.name} phone={order.recipientPhone || order.phone || "—"} />

                                        {order.opComment && (
                                          <div className="bg-[var(--color-ok-bg)] border border-[var(--color-ok-border)] p-1.5 rounded mt-1">
                                            <p className="text-[10px] sm:text-[11px] text-[var(--color-ok-text)]"><span className="font-bold text-[var(--color-ok-text-2)] uppercase tracking-wider text-[8px] sm:text-[9px] block mb-0.5">Оператор</span> {order.opComment}</p>
                                          </div>
                                        )}
                                      </div>

                                      <div className="text-[11px] font-medium text-[var(--color-text-2)] bg-[var(--color-surface)] p-1.5 rounded border border-[var(--color-border)] mt-auto line-clamp-3" title={order.composition || order.items}>
                                        <span className="font-bold text-[var(--color-text)]">📦</span> {order.composition || order.items || '—'}
                                      </div>

                                      <div className="pt-2 mt-1 flex flex-col gap-2">
                                        {(() => {
                                          const isCancelled = ['CANCELLED', 'RETURNED'].includes(order.status) || ['cancel-other', 'return', 'chastichnyi-vozvrat'].includes(order.crmStatus);
                                          if (isCancelled) {
                                            return <div className="text-center text-[11px] font-bold text-[var(--color-text-3)] py-1.5 border border-dashed border-[var(--color-border)] rounded-lg">Отменен / Возврат</div>;
                                          }
                                          const isInDeliveryOrDone = ['IN_DELIVERY', 'DELIVERED'].includes(order.status) || ['send-to-delivery', 'complete'].includes(order.crmStatus);
                                          return (
                                            <>
                                              {isInDeliveryOrDone ? (
                                                <div className="flex gap-2">
                                                  <button onClick={() => updateOrderStatusSingle(order.id, 'cancel-other')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors shadow-sm">❌ Отмена</button>
                                                  <button onClick={() => updateOrderStatusSingle(order.id, 'return')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors shadow-sm">↩️ Возврат</button>
                                                </div>
                                              ) : (
                                                <>
                                                  {(!order.crmStatus || order.crmStatus === 'new') && <button onClick={() => updateOrderStatusSingle(order.id, 'assembling')} className="w-full py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] hover:bg-[var(--color-warn-bg-2)] transition-colors shadow-sm">📦 В сборку</button>}
                                                  {order.crmStatus === 'assembling' && <button onClick={() => updateOrderStatusSingle(order.id, 'assembling-complete')} className="w-full py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors shadow-sm">✅ Собран</button>}
                                                  {order.crmStatus === 'assembling-complete' && <button onClick={() => updateOrderStatusSingle(order.id, 'send-to-delivery')} className="w-full py-1.5 rounded-lg text-[11px] sm:text-[12px] font-bold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors shadow-sm">🚀 Передать</button>}
                                                </>
                                              )}
                                              <select value={order.crmStatus || 'new'} onChange={(e) => updateOrderStatusSingle(order.id, e.target.value)} className="w-full p-1.5 text-[10px] sm:text-[11px] font-semibold border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] text-[var(--color-text-2)] outline-none focus:border-[var(--color-accent)] hover:bg-[var(--color-card)] transition-colors cursor-pointer">
                                                <option value="new">Новый (CRM)</option><option value="assembling">В сборке (CRM)</option><option value="assembling-complete">Собран (CRM)</option><option value="send-to-delivery">Передан курьеру (CRM)</option><option value="complete">Выполнен (CRM)</option><option value="return">Возврат (CRM)</option><option value="chastichnyi-vozvrat">Частичный возврат (CRM)</option><option value="cancel-other">Отменен (CRM)</option>
                                              </select>
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {displayedRoutes.length === 0 && <p className="text-[var(--color-text-3)] font-medium text-center py-12">{searchQuery ? 'По вашему запросу ничего не найдено' : 'На сегодня маршрутов еще нет'}</p>}
              </>
            )}

            {activeTab === 'history' && (
              <>
                {history.map((task) => (
                  <div key={task.id} className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 shadow-sm hover:border-[var(--color-border-2)] transition-colors flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="flex flex-col gap-1 w-full md:w-1/3 shrink-0">
                      <div>
                        <p className="text-[15px] font-extrabold text-[var(--color-text)]">{task.courierName}</p>
                        {task.routeName && <div className="text-[11px] font-medium text-[var(--color-text-3)] mt-0.5">маршрут {task.routeName}</div>}
                      </div>
                      <div className="mt-2">
                        <p className="text-[11px] sm:text-[12px] font-medium text-[var(--color-text-2)]">Изменил: <span className="font-bold text-[var(--color-text)]">{task.authorName || 'Система'}</span></p>
                        <p className="text-[11px] sm:text-[12px] font-medium text-[var(--color-text-3)] mt-0.5">{new Date(task.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 w-full md:w-2/3 md:items-end">
                      <span className="inline-block px-2.5 py-1 bg-[var(--color-surface-2)] text-[var(--color-text)] text-[11px] sm:text-[12px] font-bold rounded-lg whitespace-nowrap">
                        {task.changeType === 'ROUTE_REASSIGNED' ? '🗺️ Новый маршрут' :
                          task.changeType === 'COURIER_CHANGED' ? '👤 Смена курьера' :
                            task.changeType === 'TIME_CHANGED' ? '⏱ Изменилось время' :
                              task.changeType === 'ORDERS_CHANGED' ? '📦 Изменились заказы' :
                                task.changeType === 'OP_COMMENT_ADDED' ? '💬 Комментарий оператора' :
                                  task.changeType === 'MULTIPLE_CHANGES' ? '📝 Маршрут изменён' :
                                    task.changeType === 'ITEMS_CHANGED' ? '💐 Изменен состав' : /* 🔥 Добавили условие */
                                      task.changeType}
                      </span>
                      <div className="bg-[var(--color-surface)] rounded-lg p-3 border border-[var(--color-border)] w-full text-left mt-1">
                        {task.oldValue && (
                          <div className="mb-2">
                            <span className="text-[9px] font-bold text-[var(--color-text-3)] uppercase tracking-widest block mb-0.5">Было:</span>
                            <span className="text-[12px] sm:text-[13px] font-medium text-[var(--color-text-2)] line-through break-words whitespace-pre-wrap">{task.oldValue}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-[9px] font-bold text-[var(--color-text-3)] uppercase tracking-widest block mb-0.5">Стало:</span>
                          <span className="text-[13px] sm:text-[14px] font-extrabold text-[var(--color-text)] break-words whitespace-pre-wrap">{task.newValue}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p className="text-[var(--color-text-3)] text-center py-10 text-sm">История пуста</p>}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}