// src/app/manager/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProfilePanel } from '@/components/ProfilePanel';

// Делаем тип расширяемым
type ChangeType = 'TIME_CHANGED' | 'ORDERS_CHANGED' | 'ROUTE_REASSIGNED' | 'COURIER_CHANGED' | 'OP_COMMENT_ADDED' | string;

interface Notification {
  id: string; firstName: string; lastName: string;
  newValue: string; oldValue?: string | null; authorName?: string | null;
  changeType: ChangeType; isSeen: boolean; createdAt: string;
}

const badgeConfig: Record<string, { text: string; styles: string; icon: string }> = {
  TIME_CHANGED: { text: 'Изменилось время', styles: 'bg-orange-100 text-orange-800', icon: '⏱' },
  ORDERS_CHANGED: { text: 'Изменились заказы', styles: 'bg-blue-100 text-blue-800', icon: '📦' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800', icon: '🗺️' },
  COURIER_CHANGED: { text: 'Смена курьера', styles: 'bg-purple-100 text-purple-800', icon: '👤' },
  OP_COMMENT_ADDED: { text: 'Комментарий оператора', styles: 'bg-yellow-100 text-yellow-800', icon: '💬' }, // 🔥 Добавлено
  DEFAULT: { text: 'Изменение', styles: 'bg-gray-100 text-gray-800', icon: '🔔' }
};

const LOCAL_STATUSES: Record<string, { label: string, color: string }> = {
  NEW: { label: 'Новый', color: 'bg-gray-100 text-gray-700' },
  ASSIGNED: { label: 'Назначен', color: 'bg-blue-100 text-blue-700' },
  IN_DELIVERY: { label: '🚀 В пути', color: 'bg-yellow-100 text-yellow-800' },
  DELIVERED: { label: '✅ Доставлен', color: 'bg-green-100 text-green-800' },
  RETURNED: { label: '↩️ Возврат', color: 'bg-red-100 text-red-800' },
  CANCELLED: { label: '❌ Отменен', color: 'bg-gray-200 text-gray-500' },
};

const CRM_STATUSES: Record<string, { label: string, color: string }> = {
  'new': { label: 'Новый (CRM)', color: 'border-[#e8e6df] text-[#8c8880] bg-[#fafaf8]' },
  'assembling': { label: 'Сборка', color: 'border-yellow-200 text-yellow-700 bg-yellow-50' },
  'assembling-complete': { label: 'Собран', color: 'border-teal-200 text-teal-700 bg-teal-50' },
  'send-to-delivery': { label: 'Передан', color: 'border-purple-200 text-purple-700 bg-purple-50' },
  'complete': { label: 'Выполнен', color: 'border-green-200 text-green-700 bg-green-50' },
  'cancel-other': { label: 'Отменен (CRM)', color: 'border-gray-200 text-gray-500 bg-gray-50' },
  'return': { label: 'Возврат (CRM)', color: 'border-red-200 text-red-700 bg-red-50' },
  'chastichnyi-vozvrat': { label: 'Част. возврат', color: 'border-orange-200 text-orange-700 bg-orange-50' },
};

function getRouteTimeRange(orders: any[]) {
  if (!orders || orders.length === 0) return null;
  let min = 24;
  let max = 0;
  let found = false;
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

// Компонент контактов (Заказчик / Получатель / Курьер)
const ContactBadge = ({ title, phone, name, isCourier }: { title?: string, phone: string, name?: string, isCourier?: boolean }) => {
  const hasPhone = phone && phone !== "—";
  if (!name && !hasPhone) return null;

  const cleanPhoneForTg = hasPhone ? phone.replace(/[^\d+]/g, "") : "";
  const encodedMsg = encodeURIComponent(isCourier ? "Привет! Это менеджер EventWave." : `Здравствуйте${name ? `, ${name}` : ''}! Это доставка EventWave.`);

  return (
    <div className="flex flex-col gap-1.5 mt-1">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#4a7aff] flex-wrap">
        {title && <span className="text-[#8c8880] text-[10px] uppercase tracking-wider font-bold mr-1">{title}</span>}
        {name && <span className="text-[#1a1a18]">👤 {name}</span>}
        {name && hasPhone && <span className="text-[#a8a49c]">·</span>}
        {hasPhone && (
          <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} className="hover:underline flex items-center gap-1">
            📞 {phone}
          </a>
        )}
      </div>
      {cleanPhoneForTg && (
        <div className="flex items-center gap-2">
          <a
            href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Написать в Telegram"
            className="flex items-center justify-center bg-[#2AABEE] w-[26px] h-[26px] rounded-full shadow-sm hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
          </a>
          <a
            href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`}
            title="Отправить SMS"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center bg-[#34C759] w-[26px] h-[26px] rounded-full shadow-sm hover:opacity-90 transition-opacity"
          >
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

  const [expandedRoutes, setExpandedRoutes] = useState<Record<string, boolean>>({});
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [isMassUpdating, setIsMassUpdating] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => { if (!res.ok) throw new Error('Not logged in'); return res.json(); })
      .then((data) => {
        if (data?.role !== 'OPERATOR' && data?.role !== 'ADMIN') {
          window.location.replace('/dashboard'); return;
        }
        setIsAuthorized(true);
      })
      .catch((err) => {
        if (err.message === 'Not logged in') window.location.replace('/login');
      });
  }, []);

  const loadData = useCallback(async (showLoadingState = true) => {
    if (showLoadingState) setLoading(true);
    try {
      if (activeTab === 'new' || activeTab === 'routes') {
        const [notifRes, routesRes] = await Promise.all([
          fetch('/api/manager/notifications'),
          fetch('/api/manager/routes')
        ]);
        const notifData = await notifRes.json();
        const routesData = await routesRes.json();
        if (Array.isArray(notifData)) setTasks(notifData);

        if (Array.isArray(routesData)) {
          // 🔥 ИСПРАВЛЕННАЯ СОРТИРОВКА: Сначала статус, потом время
          const sortedRoutes = routesData.sort((a, b) => {
            const getRoutePriority = (route: any) => {
              if (!route.orders || route.orders.length === 0) return 1; // Не забрали (наверх)
              const isAllFinished = route.orders.every((o: any) => o.status === 'DELIVERED' || o.status === 'RETURNED' || o.status === 'CANCELLED');
              if (isAllFinished) return 3; // Все завершены (в самый низ)
              const hasStarted = route.orders.some((o: any) => o.status === 'IN_DELIVERY' || o.status === 'DELIVERED');
              if (hasStarted) return 2; // В пути (в середину)
              return 1; // Еще не забрали (наверх)
            };
            
            const prioA = getRoutePriority(a);
            const prioB = getRoutePriority(b);
            if (prioA !== prioB) return prioA - prioB; // Сначала по статусу
            
            // Если статус одинаковый - сортируем по времени выезда
            const timeA = a.plannedDepartureTime || "23:59";
            const timeB = b.plannedDepartureTime || "23:59";
            return timeA.localeCompare(timeB);
          });
          setRoutes(sortedRoutes);

          setExpandedRoutes(prev => {
            if (Object.keys(prev).length === 0) {
              const initialExpanded: Record<string, boolean> = {};
              sortedRoutes.forEach(r => initialExpanded[r.id] = true);
              return initialExpanded;
            }
            return prev;
          });
        }
      } else if (activeTab === 'history') {
        const res = await fetch('/api/manager/notifications?history=true');
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
      }
    } catch (error) { console.error(error); }
    if (showLoadingState) setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    if (isAuthorized) loadData();
  }, [activeTab, isAuthorized, loadData]);

  // 🔥 ДОБАВИТЬ: Проверяем URL при загрузке страницы (если открыли по клику на пуш)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'new') {
        setActiveTab('new');
      }
    }
  }, []);

  // ЗАМЕНИТЬ текущий useEffect с handleSWMessage на этот:
  useEffect(() => {
    if (!isAuthorized) return;
    const handleSWMessage = (event: MessageEvent) => {
      if (!event.data) return;
      
      // Простое фоновое обновление данных
      if (event.data.type === 'PUSH_RECEIVED') {
        loadData(false);
      } 
      // 🔥 Если кликнули по пушу и мы уже находимся в открытой вкладке менеджера
      else if (event.data.type === 'NOTIFICATION_CLICK') {
        if (event.data.tab === 'new' || (!event.data.orderId && event.data.role !== 'COURIER')) {
          setActiveTab('new');
        }
      }
    };
    
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleSWMessage);

    const interval = setInterval(() => loadData(false), 15000);
    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      clearInterval(interval);
    };
  }, [isAuthorized, loadData]);

  const toggleRouteExpansion = (routeId: string) => {
    setExpandedRoutes(prev => ({ ...prev, [routeId]: !prev[routeId] }));
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleRouteOrders = (orderIds: string[]) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      const allSelected = orderIds.every(id => next.has(id));
      if (allSelected) {
        orderIds.forEach(id => next.delete(id));
      } else {
        orderIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const allRouteOrderIds = routes.flatMap(r => r.orders?.map((o: any) => o.id) || []);
  const isAllGlobalSelected = allRouteOrderIds.length > 0 && allRouteOrderIds.every(id => selectedOrders.has(id));

  const toggleAllGlobalOrders = () => {
    if (isAllGlobalSelected) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(allRouteOrderIds));
    }
  };

  const handlePrintLabels = async () => {
    if (selectedOrders.size === 0) return alert("Выберите хотя бы один заказ для печати");
    try {
      const response = await fetch('/api/manager/routes/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: Array.from(selectedOrders) })
      });

      if (!response.ok) throw new Error("Ошибка при генерации PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Этикетки_${new Date().toLocaleTimeString('ru-RU').replace(/:/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Ошибка печати:", err);
      alert("Не удалось создать этикетки");
    }
  };

  const updateOrderStatusSingle = async (orderId: string, newCrmStatus: string) => {
    try {
      await fetch(`/api/manager/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmStatus: newCrmStatus })
      });
      loadData(false);
    } catch (e) { console.error(e); }
  };

  const massUpdateToAssembling = async () => {
    if (selectedOrders.size === 0) return alert("Выберите заказы для отправки в сборку");
    if (!confirm(`Отправить в сборку (CRM) ${selectedOrders.size} заказов?`)) return;

    setIsMassUpdating(true);
    try {
      await Promise.all(
        Array.from(selectedOrders).map(orderId =>
          fetch(`/api/manager/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ crmStatus: 'assembling' }),
            headers: { 'Content-Type': 'application/json' }
          })
        )
      );
      loadData(false);
      setSelectedOrders(new Set());
    } catch (e) {
      console.error(e);
      alert("Ошибка при массовом обновлении статусов");
    } finally {
      setIsMassUpdating(false);
    }
  };

  // 🔥 НОВАЯ УМНАЯ ФУНКЦИЯ ДЛЯ МАССОВОГО ОБНОВЛЕНИЯ
  const updateRouteBulkStatus = async (routeId: string, action: 'assembling' | 'assembling-complete' | 'send-to-delivery') => {
    const messages = {
      'assembling': "Отправить все заказы маршрута на сборку (CRM)?",
      'assembling-complete': "Отметить все заказы маршрута как собранные (CRM)?",
      'send-to-delivery': "Передать все заказы маршрута курьеру (CRM)?"
    };
    
    if (!confirm(messages[action])) return;
    
    try {
      await fetch(`/api/manager/routes/${routeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ crmStatus: action })
      });
      loadData(false);
    } catch (e) { console.error(e); }
  };

  const markAsSeen = async (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      await fetch(`/api/manager/notifications/${id}`, { method: 'PATCH' });
    } catch (error) { console.error(error); }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f4f0]">
        <p className="text-[#a8a49c] font-medium animate-pulse">Проверка прав доступа...</p>
      </div>
    );
  }

  const tasksWithRoutes = tasks.map(task => {
    const matchedRoute = routes.find(r => r.courier?.firstName === task.firstName && r.courier?.lastName === task.lastName);
    return { ...task, routeData: matchedRoute };
  }).sort((a, b) => a.newValue.localeCompare(b.newValue));

  const pendingRoutes = routes.filter((route) => {
    if (!route.orders || route.orders.length === 0) return false;
    const hasAssigned = route.orders.some((o: any) => o.status === 'ASSIGNED');
    const hasStarted = route.orders.some((o: any) => o.status === 'IN_DELIVERY' || o.status === 'DELIVERED');
    return hasAssigned && !hasStarted;
  });

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Кабинет менеджера</h1>
        </div>
        <div className="relative">
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-10 h-10 bg-[#e8e6df] rounded-full flex items-center justify-center text-xl hover:bg-[#dcd9d1] transition-colors">👨‍💻</button>
          {isProfileOpen && <div className="absolute right-0 top-14 z-50"><ProfilePanel onClose={() => setIsProfileOpen(false)} /></div>}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 w-full overflow-hidden">
        <div className="w-full overflow-x-auto hide-scrollbar mb-6 pb-2">
          <div className="flex bg-[#e8e6df] p-1 rounded-xl w-max shadow-inner gap-1">
            <button onClick={() => setActiveTab('new')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'new' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}>
              Табло изменений {tasks.length > 0 && <span className="bg-[#dc2626] text-white px-2 py-0.5 rounded-full text-[11px]">{tasks.length}</span>}
            </button>
            <button onClick={() => setActiveTab('routes')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'routes' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}>
              Все маршруты
            </button>
            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'history' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}>
              История логов
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-[#a8a49c] font-medium mt-10 animate-pulse">Загрузка данных...</p>
        ) : (
          <div className="flex flex-col gap-6">

            {activeTab === 'new' && (
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-3">
                  {tasksWithRoutes.map((item) => (
                    <div key={item.id} className="bg-white border-2 border-transparent hover:border-rose-100 rounded-2xl shadow-sm transition-all group overflow-hidden">
                      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr_1fr_auto] gap-3 sm:gap-4 items-center">
                        <div className="font-extrabold text-[#1a1a18] text-base">{item.firstName} {item.lastName}</div>
                        <div className="flex items-center gap-2 text-base font-black">
                          {item.oldValue && (
                            <><span className="text-[#a8a49c] line-through decoration-rose-500 decoration-2">{item.oldValue}</span><span className="text-[#a8a49c]">→</span></>
                          )}
                          <span className="text-[#1a1a18]">{item.newValue}</span>
                        </div>
                        <div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg ${badgeConfig[item.changeType]?.styles || badgeConfig.DEFAULT.styles}`}>
                            {badgeConfig[item.changeType]?.icon || badgeConfig.DEFAULT.icon} {badgeConfig[item.changeType]?.text || badgeConfig.DEFAULT.text}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#6b6860]">
                          {item.authorName ? `Изменил: ${item.authorName}` : 'Система'}
                        </div>
                        <div className="flex justify-end">
                          <button onClick={() => markAsSeen(item.id)} className="w-10 h-10 border-2 border-[#e8e6df] rounded-xl flex items-center justify-center text-transparent hover:border-green-500 hover:bg-green-50 hover:text-green-600 transition-all shadow-sm" title="Пометить увиденным">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {tasksWithRoutes.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 text-center bg-white rounded-2xl border border-[#e8e6df] shadow-sm">
                      <div className="text-4xl mb-4">☕</div>
                      <p className="text-[#1a1a18] font-bold text-lg">Всё спокойно</p>
                      <p className="text-[#a8a49c] mt-1">Непрочитанных изменений нет</p>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t-2 border-dashed border-[#e8e6df]">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl">🚚</span>
                    <div>
                      <h2 className="text-lg font-bold text-[#1a1a18]">Ожидают загрузки на базе</h2>
                      <p className="text-sm text-[#a8a49c] font-medium">Маршруты назначены, но курьеры еще не в пути</p>
                    </div>
                    <div className="ml-auto bg-[#e8e6df] text-[#6b6860] font-black px-3 py-1 rounded-lg">
                      {pendingRoutes.length}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pendingRoutes.map((route) => (
                      <div key={route.id} className="bg-white border-2 border-[#e8e6df] rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:border-[#dcd9d1] transition-colors">

                        <div className="flex justify-between items-start mb-4 border-b border-[#f0efe9] pb-3 gap-2">
                          <div>
                            <h3 className="font-extrabold text-lg text-[#1a1a18] leading-tight flex flex-wrap items-center gap-2">
                              {route.courier?.firstName || 'Не назначен'} {route.courier?.lastName || ''}

                              {/* 🔥 Спокойный и читаемый бейдж времени выезда */}
                              {route.plannedDepartureTime && (
                                <span className="text-[12px] font-bold text-[#1a1a18] bg-[#f5f4f0] px-2 py-0.5 rounded-lg border border-[#e8e6df] shadow-sm flex items-center gap-1">
                                  🏠Будет {route.plannedDepartureTime}
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-[#a8a49c] font-bold uppercase tracking-wider mt-1.5">
                              Маршрут {route.name || `#${route.id.slice(-5).toUpperCase()}`}
                            </p>
                          </div>
                          <span className="bg-[#eef3ff] text-[#4a7aff] px-2.5 py-1 rounded-xl text-xs font-bold border border-[#dce6ff] shrink-0">
                            {route.orders?.length || 0} точ.
                          </span>
                        </div>

                        <div className="flex flex-col gap-3 flex-grow">
                          {/* 🔥 Добавлена сортировка точек по ETA */}
                          {(() => {
                            const sortedOrders = [...(route.orders || [])].sort((a: any, b: any) => {
                              if (a.eta && b.eta) return a.eta.localeCompare(b.eta);
                              if (a.eta) return -1;
                              if (b.eta) return 1;
                              return (a.routeOrder || 0) - (b.routeOrder || 0);
                            });

                            if (sortedOrders.length === 0) {
                              return <p className="text-sm text-[#a8a49c] p-2 text-center">Точек нет</p>;
                            }

                            return sortedOrders.map((order: any, idx: number) => {
                              const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;
                              const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-gray-200 text-gray-500 bg-white' }) : null;

                              return (
                                <div key={order.id} className="flex gap-3 items-start p-2.5 bg-[#fafaf8] rounded-xl border border-[#f0efe9]">
                                  <div className="w-6 h-6 rounded-lg bg-[#1a1a18] text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{idx + 1}</div>
                                  <div className="flex-grow min-w-0">
                                    <p className="text-[14px] font-bold text-[#1a1a18] leading-snug break-words mb-1.5">
                                      {order.address || 'Адрес не указан'}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="inline-block bg-white text-[#6b6860] px-2 py-0.5 rounded-md text-xs font-bold border border-[#e8e6df]">
                                        ⏱ {order.slotRaw || '—'}
                                      </span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>
                                        {localStatus.label}
                                      </span>
                                      {crmConf && (
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>
                                          CRM: {crmConf.label}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                  {pendingRoutes.length === 0 && (
                    <p className="text-[#a8a49c] font-medium text-center py-8">Все назначенные курьеры уже выехали</p>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'routes' && (
              <>
                {/* ПАНЕЛЬ МАССОВЫХ ДЕЙСТВИЙ */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-[#e8e6df] shadow-sm mb-2 sticky top-[84px] z-10 gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="w-5 h-5 accent-[#1a1a18] rounded cursor-pointer shrink-0"
                      checked={isAllGlobalSelected}
                      onChange={toggleAllGlobalOrders}
                    />
                    <span className="font-bold text-[#1a1a18] text-[15px]">Выбрать все</span>

                    {selectedOrders.size > 0 && (
                      <span className="bg-[#eef3ff] text-[#4a7aff] px-2.5 py-1 rounded-lg text-sm font-bold border border-[#dce6ff] ml-2 shadow-sm transition-all">
                        Выбрано: {selectedOrders.size}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      onClick={massUpdateToAssembling}
                      disabled={selectedOrders.size === 0 || isMassUpdating}
                      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${selectedOrders.size > 0 ? 'bg-[#fff8e6] text-[#b38a00] border border-[#ffe082] hover:bg-[#fff0c2]' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                    >
                      {isMassUpdating ? '⏳ Загрузка...' : '📦 В сборку'}
                    </button>
                    <button
                      onClick={handlePrintLabels}
                      disabled={selectedOrders.size === 0}
                      className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 ${selectedOrders.size > 0 ? 'bg-[#1a1a18] text-white hover:bg-gray-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
                    >
                      🖨️ Печать (75x120)
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                {routes.map((route) => {
                  const isExpanded = expandedRoutes[route.id];
                  const routeOrderIds = route.orders?.map((o: any) => o.id) || [];
                  const isAllSelected = routeOrderIds.length > 0 && routeOrderIds.every((id: string) => selectedOrders.has(id));
                  const routeTimeRange = getRouteTimeRange(route.orders);
                  const courierPhone = route.courier?.phone || "—";
                  const cleanPhoneForTg = courierPhone !== "—" ? courierPhone.replace(/[^\d+]/g, "") : "";
                  const encodedMsg = encodeURIComponent("Привет! Это менеджер EventWave.");

                  // 🔥 УМНАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ КНОПКИ МАРШРУТА
                  const activeOrders = route.orders?.filter((o: any) => o.status !== 'CANCELLED' && o.status !== 'RETURNED') || [];
                  const isAllInDeliveryOrDone = activeOrders.length > 0 && activeOrders.every((o: any) => 
                    o.status === 'IN_DELIVERY' || o.status === 'DELIVERED' || o.crmStatus === 'send-to-delivery'
                  );

                  let routeBulkAction: 'assembling' | 'assembling-complete' | 'send-to-delivery' | null = null;
                  let routeBulkText = "";
                  let routeBulkStyles = "";

                  if (!isAllInDeliveryOrDone && activeOrders.length > 0) {
                      const hasNew = activeOrders.some((o: any) => !o.crmStatus || o.crmStatus === 'new');
                      const hasAssembling = activeOrders.some((o: any) => o.crmStatus === 'assembling');
                      const hasAssembled = activeOrders.some((o: any) => o.crmStatus === 'assembling-complete');

                      if (hasNew) {
                        routeBulkAction = 'assembling';
                        routeBulkText = '📦 В сборку';
                        routeBulkStyles = 'bg-[#fff8e6] text-[#b38a00] border-[#ffe082] hover:bg-[#fff0c2]';
                      } else if (hasAssembling) {
                        routeBulkAction = 'assembling-complete';
                        routeBulkText = '✅ Собраны';
                        routeBulkStyles = 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100';
                      } else if (hasAssembled) {
                        routeBulkAction = 'send-to-delivery';
                        routeBulkText = '🚀 Передать курьеру';
                        routeBulkStyles = 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100';
                      }
                  }

                  return (
                    <div key={route.id} className="bg-white border border-[#e8e6df] rounded-2xl shadow-sm transition-all overflow-hidden">

                      {/* ШАПКА МАРШРУТА: СТРОГО 1 СТРОКА */}
                      <div
                        className="flex flex-row items-center justify-between p-3 hover:bg-[#fafaf8] cursor-pointer transition-colors gap-2"
                        onClick={() => toggleRouteExpansion(route.id)}
                      >
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap overflow-hidden">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-[#1a1a18] rounded cursor-pointer shrink-0"
                            checked={isAllSelected}
                            onChange={(e) => { e.stopPropagation(); toggleRouteOrders(routeOrderIds); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="text-[#a8a49c] w-4 text-center text-[10px] shrink-0">{isExpanded ? '▼' : '▶'}</span>

                          <span className="font-black text-[14px] text-[#1a1a18] whitespace-nowrap">
                            {route.courier?.firstName || 'Не назначен'} {route.courier?.lastName || ''}
                          </span>

                          {courierPhone !== "—" && (
                            <div className="flex items-center gap-1.5 ml-1">
                              <a href={`tel:${courierPhone}`} onClick={e => e.stopPropagation()} className="text-[#4a7aff] font-semibold text-[13px] hover:underline whitespace-nowrap">
                                📞 {courierPhone}
                              </a>
                              {cleanPhoneForTg && (
                                <>
                                  <a href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="bg-[#2AABEE] w-5 h-5 flex items-center justify-center rounded-full hover:opacity-90">
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
                                  </a>
                                  <a href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`} onClick={e => e.stopPropagation()} className="bg-[#34C759] w-5 h-5 flex items-center justify-center rounded-full hover:opacity-90">
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
                                  </a>
                                </> 
                              )}
                            </div>
                          )}

                          {route.plannedDepartureTime && (
                            <span className="text-[12px] font-bold text-[#1a1a18] bg-[#f5f4f0] px-2 py-0.5 rounded-lg border border-[#e8e6df] shadow-sm flex items-center gap-1">
                            🏠 {route.plannedDepartureTime}
                          </span>
                          )}
                          {routeTimeRange && (
                            <span className="text-[11px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 whitespace-nowrap">
                              Слоты: {routeTimeRange}
                            </span>
                          )}
                          <span className="text-[11px] font-bold text-[#6b6860] bg-[#f5f4f0] px-1.5 py-0.5 rounded border border-[#e8e6df] whitespace-nowrap hidden sm:inline-block">
                            Точек: {route.orders?.length || 0}
                          </span>
                        </div>

                        {routeBulkAction && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateRouteBulkStatus(route.id, routeBulkAction!); }}
                            className={`shrink-0 border px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors shadow-sm ml-auto ${routeBulkStyles}`}
                          >
                            {routeBulkText}
                          </button>
                        )}
                      </div>

                        {/* КАРТОЧКИ ЗАКАЗОВ В МАРШРУТЕ */}
                        {isExpanded && (
                          <div className="p-4 bg-[#f5f4f0] border-t border-[#e8e6df]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">

                              {(() => {
                                // 1. Сортируем заказы по ETA (сначала те, у кого есть ETA по времени, потом остальные)
                                const sortedOrders = [...(route.orders || [])].sort((a: any, b: any) => {
                                  if (a.eta && b.eta) return a.eta.localeCompare(b.eta);
                                  if (a.eta) return -1;
                                  if (b.eta) return 1;
                                  return (a.routeOrder || 0) - (b.routeOrder || 0);
                                });

                                // 2. Если заказов нет, показываем заглушку
                                if (sortedOrders.length === 0) {
                                  return <p className="text-sm text-[#a8a49c] font-medium p-2 col-span-full text-center">Нет точек</p>;
                                }

                                // 3. Рендерим отсортированный массив
                                return sortedOrders.map((order: any, idx: number) => {
                                  const isAssembled = order.crmStatus === 'assembling-complete';
                                  const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-gray-200 text-gray-500 bg-white' }) : null;
                                  const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;

                                  const customerName = order.customerName;
                                  const customerPhone = order.customerPhone || "—";
                                  const customerComment = order.comment;

                                  const recipientName = order.name;
                                  const recipientPhone = order.recipientPhone || order.phone || "—";

                                  const isMeura = order.shop === 'kaktusfiori' || order.shop === 'meura-flowers';
                                  const shopBadge = isMeura ? "🌸 Meura" : "📦 Bunch";

                                const displayId = order.externalId || order.crmId || order.number || order.id.slice(-6);
                                  const createdAt = order.crmCreatedAt
                                    ? new Date(order.crmCreatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                                    : null;

                                  return (
                                    <div key={order.id} className="flex flex-col bg-white rounded-xl border border-[#e8e6df] shadow-sm p-3 relative hover:border-[#dcd9d1] transition-colors">
                                      {/* Шапка карточки: Чекбокс, Номер, Слот */}
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-[#1a1a18] rounded cursor-pointer shrink-0"
                                            checked={selectedOrders.has(order.id)}
                                            onChange={() => toggleOrderSelection(order.id)}
                                          />
                                          {/* Номер по порядку теперь будет идти правильно, 1, 2, 3... по времени прибытия */}
                                          <div className="w-5 h-5 rounded bg-[#1a1a18] text-white flex items-center justify-center text-[10px] font-black shrink-0">{idx + 1}</div>
                                        <span className="font-black text-[14px] text-[#1a1a18] truncate max-w-[100px]" title={String(displayId)}>
                                          {displayId}
                                          </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-[#6b6860] bg-[#f5f4f0] px-1.5 py-0.5 rounded border border-[#e8e6df] shrink-0">
                                          ⏱ {order.slotRaw || '—'}
                                        </span>
                                      </div>

                                      {/* Значок магазина и Время создания */}
                                      <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isMeura ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                          {shopBadge}
                                        </span>
                                        {createdAt && <span className="text-[9px] text-[#a8a49c] font-medium">Создан: {createdAt}</span>}
                                      </div>

                                      {/* Статусы */}
                                      <div className="flex flex-wrap gap-1 mb-2">
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>{localStatus.label}</span>
                                        {crmConf && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                      </div>

                                      {/* Адрес с ETA */}
                                      <div className="text-[13px] font-medium text-[#1a1a18] leading-tight mb-2 min-h-[30px]">
                                        {order.address || 'Адрес не указан'}
                                        {order.eta && <span className="inline-block ml-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">~{order.eta}</span>}
                                      </div>

                                      {/* БЛОК КОНТАКТОВ И КОММЕНТАРИЕВ */}
                                      <div className="flex flex-col gap-2 mt-1 mb-2">

                                        {/* Заказчик */}
                                        {(customerName || customerPhone !== "—") && (
                                          <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4a7aff] flex-wrap">
                                              <span className="text-[#8c8880] text-[9px] uppercase tracking-wider font-bold">Заказчик:</span>
                                              {customerName && <span className="text-[#1a1a18]">{customerName}</span>}
                                              {customerPhone !== "—" && (
                                                <>
                                                  <span className="text-[#a8a49c]">·</span>
                                                  <a href={`tel:${customerPhone}`} onClick={e => e.stopPropagation()} className="hover:underline">📞 {customerPhone}</a>
                                                  <div className="flex items-center gap-1 ml-1">
                                                    <a href={`https://t.me/${customerPhone.replace(/[^\d+]/g, "")}?text=${encodeURIComponent("Здравствуйте! Это доставка EventWave.")}`} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="bg-[#2AABEE] w-[20px] h-[20px] flex items-center justify-center rounded-full hover:opacity-90">
                                                      <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
                                                    </a>
                                                    <a href={`sms:${customerPhone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent("Здравствуйте! Это доставка EventWave.")}`} onClick={e => e.stopPropagation()} className="bg-[#34C759] w-[20px] h-[20px] flex items-center justify-center rounded-full hover:opacity-90">
                                                      <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
                                                    </a>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                            {customerComment && (
                                              <div className="bg-[#fff1f2] border border-[#ffe4e6] p-1.5 rounded">
                                                <p className="text-[11px] text-[#881337]"><span className="font-bold text-[#be123c] uppercase tracking-wider text-[9px] block mb-0.5">Коммент заказчика</span> {customerComment}</p>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {/* Разделитель */}
                                        {(customerName || customerPhone !== "—") && (recipientName || recipientPhone !== "—") && (
                                          <div className="h-px bg-[#e8e6df] w-full my-0.5"></div>
                                        )}

                                        {/* Получатель */}
                                        {(recipientName || recipientPhone !== "—") && (
                                          <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#4a7aff] flex-wrap">
                                              <span className="text-[#8c8880] text-[9px] uppercase tracking-wider font-bold">Получатель:</span>
                                              {recipientName && <span className="text-[#1a1a18]">{recipientName}</span>}
                                              {recipientPhone !== "—" && (
                                                <>
                                                  <span className="text-[#a8a49c]">·</span>
                                                  <a href={`tel:${recipientPhone}`} onClick={e => e.stopPropagation()} className="hover:underline">📞 {recipientPhone}</a>
                                                  <div className="flex items-center gap-1 ml-1">
                                                    <a href={`https://t.me/${recipientPhone.replace(/[^\d+]/g, "")}?text=${encodeURIComponent(`Здравствуйте${recipientName ? `, ${recipientName}` : ''}! Это доставка EventWave.`)}`} onClick={e => e.stopPropagation()} target="_blank" rel="noopener noreferrer" className="bg-[#2AABEE] w-[20px] h-[20px] flex items-center justify-center rounded-full hover:opacity-90">
                                                      <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
                                                    </a>
                                                    <a href={`sms:${recipientPhone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(`Здравствуйте${recipientName ? `, ${recipientName}` : ''}! Это доставка EventWave.`)}`} onClick={e => e.stopPropagation()} className="bg-[#34C759] w-[20px] h-[20px] flex items-center justify-center rounded-full hover:opacity-90">
                                                      <svg viewBox="0 0 24 24" width="10" height="10" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
                                                    </a>
                                                  </div>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Комментарий оператора */}
                                        {order.opComment && (
                                          <div className="bg-[#f0fdf4] border border-[#dcfce7] p-1.5 rounded mt-1">
                                            <p className="text-[11px] text-[#14532d]"><span className="font-bold text-[#15803d] uppercase tracking-wider text-[9px] block mb-0.5">Оператор</span> {order.opComment}</p>
                                          </div>
                                        )}
                                      </div>

                                      {/* Состав заказа */}
                                      <div className="text-[11px] font-medium text-[#4a4740] bg-[#fafaf8] p-1.5 rounded border border-[#e8e6df] mt-auto line-clamp-3" title={order.composition || order.items}>
                                        <span className="font-bold text-[#1a1a18]">📦</span> {order.composition || order.items || '—'}
                                      </div>

                                      {/* 🔥 УМНАЯ ЛОГИКА И ДРОПДАУН ДЛЯ ЗАКАЗА */}
                                      <div className="pt-2 mt-1 flex flex-col gap-2">
                                        
                                        {/* Умная кнопка действий */}
                                        {(() => {
                                          const isCancelledOrReturned = order.status === 'CANCELLED' || order.status === 'RETURNED' || order.crmStatus === 'cancel-other' || order.crmStatus === 'return' || order.crmStatus === 'chastichnyi-vozvrat';
                                          const isHandedOver = order.status === 'IN_DELIVERY' || order.status === 'DELIVERED' || order.crmStatus === 'send-to-delivery' || order.crmStatus === 'complete';

                                          if (isCancelledOrReturned) {
                                            return <div className="text-center text-[11px] font-bold text-[#a8a49c] py-1.5 border border-dashed border-[#e8e6df] rounded-lg">Отменен / Возврат</div>;
                                          }

                                          if (isHandedOver) {
                                            return (
                                              <div className="flex gap-2">
                                                <button onClick={() => updateOrderStatusSingle(order.id, 'cancel-other')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors shadow-sm">❌ Отмена</button>
                                                <button onClick={() => updateOrderStatusSingle(order.id, 'return')} className="flex-1 py-1.5 rounded-lg text-[11px] font-bold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors shadow-sm">↩️ Возврат</button>
                                              </div>
                                            );
                                          }

                                          // До передачи курьеру (Smart Logic)
                                          if (!order.crmStatus || order.crmStatus === 'new') {
                                            return <button onClick={() => updateOrderStatusSingle(order.id, 'assembling')} className="w-full py-1.5 rounded-lg text-[12px] font-bold border border-[#ffe082] bg-[#fff8e6] text-[#b38a00] hover:bg-[#fff0c2] transition-colors shadow-sm">📦 В сборку</button>;
                                          }
                                          if (order.crmStatus === 'assembling') {
                                            return <button onClick={() => updateOrderStatusSingle(order.id, 'assembling-complete')} className="w-full py-1.5 rounded-lg text-[12px] font-bold border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 transition-colors shadow-sm">✅ Собран</button>;
                                          }
                                          if (order.crmStatus === 'assembling-complete') {
                                            return <button onClick={() => updateOrderStatusSingle(order.id, 'send-to-delivery')} className="w-full py-1.5 rounded-lg text-[12px] font-bold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors shadow-sm">🚀 Передать</button>;
                                          }

                                          return null;
                                        })()}

                                        {/* Универсальный дропдаун (ручное управление статусом) */}
                                        <select
                                          value={order.crmStatus || 'new'}
                                          onChange={(e) => updateOrderStatusSingle(order.id, e.target.value)}
                                          className="w-full p-1.5 text-[11px] font-semibold border border-[#e8e6df] rounded-lg bg-[#fafaf8] text-[#6b6860] outline-none focus:border-[#4a7aff] hover:bg-white transition-colors cursor-pointer"
                                        >
                                          <option value="new">Новый (CRM)</option>
                                          <option value="assembling">В сборке (CRM)</option>
                                          <option value="assembling-complete">Собран (CRM)</option>
                                          <option value="send-to-delivery">Передан курьеру (CRM)</option>
                                          <option value="complete">Выполнен (CRM)</option>
                                          <option value="return">Возврат (CRM)</option>
                                          <option value="chastichnyi-vozvrat">Частичный возврат (CRM)</option>
                                          <option value="cancel-other">Отменен (CRM)</option>
                                        </select>

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
                {routes.length === 0 && <p className="text-[#a8a49c] font-medium text-center py-12">На сегодня маршрутов еще нет</p>}
              </>
            )}

            {activeTab === 'history' && (
              <>
                {history.map((task) => (
                  <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#fafaf8] border border-[#e8e6df] rounded-xl opacity-80 gap-3">
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-black text-[#a8a49c] w-12 text-center">{task.newValue}</div>
                      <div className="w-px h-8 bg-[#e8e6df]"></div>
                      <div>
                        <p className="text-[15px] font-bold text-[#1a1a18]">{task.firstName} {task.lastName}</p>
                        {task.authorName && <p className="text-[10px] font-bold text-[#a8a49c] uppercase tracking-wider mt-0.5">Изменил: {task.authorName}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 justify-between sm:justify-end">
                      <span className={`px-3 py-1 text-xs font-bold border rounded-lg ${badgeConfig[task.changeType]?.styles || 'bg-gray-100 text-gray-800'}`}>
                        {badgeConfig[task.changeType]?.text || 'Изменение'}
                      </span>
                      <span className="text-xs text-[#a8a49c] font-medium">
                        {new Date(task.createdAt).toLocaleDateString("ru-RU", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {history.length === 0 && <p className="text-[#a8a49c] text-center py-12">История пуста</p>}
              </>
            )}

          </div>
        )}
      </main>
    </div>
  );
}