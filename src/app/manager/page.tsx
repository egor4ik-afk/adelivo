// src/app/manager/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProfilePanel } from '@/components/ProfilePanel';
import { performLogout } from '@/lib/logout';

type ChangeType = 'TIME_CHANGED' | 'ORDERS_CHANGED' | 'ROUTE_REASSIGNED';

interface Notification {
  id: string; firstName: string; lastName: string;
  baseTime: string; oldTime?: string | null; authorName?: string | null;
  changeType: ChangeType; isSeen: boolean; createdAt: string;
}

const badgeConfig: Record<string, { text: string; styles: string; icon: string }> = {
  TIME_CHANGED: { text: 'Изменилось время', styles: 'bg-orange-100 text-orange-800', icon: '⏱' },
  ORDERS_CHANGED: { text: 'Изменились заказы', styles: 'bg-blue-100 text-blue-800', icon: '📦' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800', icon: '🗺️' },
};

const LOCAL_STATUSES: Record<string, { label: string, color: string }> = {
  NEW: { label: 'Новый', color: 'bg-gray-100 text-gray-700' },
  ASSIGNED: { label: 'Назначен', color: 'bg-blue-100 text-blue-700' },
  IN_DELIVERY: { label: 'В пути', color: 'bg-yellow-100 text-yellow-800' },
  DELIVERED: { label: 'Доставлен', color: 'bg-green-100 text-green-800' },
  RETURNED: { label: 'Возврат', color: 'bg-red-100 text-red-800' },
  CANCELLED: { label: 'Отменён', color: 'bg-gray-200 text-gray-500' },
};

const CRM_STATUSES: Record<string, { label: string, color: string }> = {
  'new': { label: 'Новый (CRM)', color: 'border-[#e8e6df] text-[#8c8880] bg-[#fafaf8]' },
  'assembling': { label: 'Сборка', color: 'border-yellow-200 text-yellow-700 bg-yellow-50' },
  'assembling-complete': { label: 'Собран', color: 'border-teal-200 text-teal-700 bg-teal-50' },
  'send-to-delivery': { label: 'Передан курьеру', color: 'border-purple-200 text-purple-700 bg-purple-50' },
  'complete': { label: 'Выполнен', color: 'border-green-200 text-green-700 bg-green-50' },
  'cancel-other': { label: 'Отменен (CRM)', color: 'border-gray-200 text-gray-500 bg-gray-50' },
  'return': { label: 'Возврат (CRM)', color: 'border-red-200 text-red-700 bg-red-50' },
  'chastichnyi-vozvrat': { label: 'Част. возврат', color: 'border-orange-200 text-orange-700 bg-orange-50' },
};

// Функция для объединения всех слотов маршрута в итоговый (например, "10:00 - 14:00")
function getRouteTimeRange(orders: any[]) {
  if (!orders || orders.length === 0) return null;
  let min = 24;
  let max = 0;
  let found = false;
  orders.forEach(o => {
    if (!o.slotRaw) return;
    const nums = o.slotRaw.match(/\d{1,2}(?=:|-[0-5][0-9]|$|\s|-)/g); 
    if (nums) {
      nums.forEach((n: string) => {
        const num = parseInt(n, 10);
        if (num >= 0 && num <= 24) {
          if (num < min) min = num;
          if (num > max) max = num;
          found = true;
        }
      });
    }
  });
  if (!found || min === 24 || max === 0) return null;
  return `(${min}:00 - ${max}:00)`;
}

// Компонент для вывода кнопок связи
const ContactBadge = ({ phone, name, isCourier }: { phone: string, name?: string, isCourier?: boolean }) => {
  if (!phone || phone === "—") return null;
  const cleanPhoneForTg = phone.replace(/[^\d+]/g, "");
  const encodedMsg = encodeURIComponent(isCourier ? "Привет! Это менеджер EventWave." : `Здравствуйте${name ? `, ${name}` : ''}! Это доставка EventWave.`);

  return (
    <div className="flex flex-wrap items-center gap-2.5 text-[13px] font-semibold text-[#4a7aff]">
      <div className="flex items-center gap-1.5">
        {name && <span className="text-[#1a1a18]">👤 {name}</span>}
        {name && <span className="text-[#a8a49c]">·</span>}
        <a href={`tel:${phone}`} onClick={e => e.stopPropagation()} className="hover:underline">
          📞 {phone}
        </a>
      </div>
      {cleanPhoneForTg && (
        <div className="flex items-center gap-2">
          <a
            href={`https://t.me/${cleanPhoneForTg}?text=${encodedMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Написать в Telegram"
            className="flex items-center justify-center bg-[#2AABEE] w-7 h-7 rounded-full shadow-sm hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z" /></svg>
          </a>
          <a
            href={`sms:${cleanPhoneForTg}?body=${encodedMsg}`}
            title="Отправить SMS"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center bg-[#34C759] w-7 h-7 rounded-full shadow-sm hover:opacity-90 transition-opacity"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="#ffffff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>
          </a>
        </div>
      )}
    </div>
  );
};


export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<'new' | 'routes' | 'history'>('routes');
  const [tasks, setTasks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());

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
          const sortedRoutes = routesData.sort((a, b) => {
            const timeA = a.plannedDepartureTime || "23:59";
            const timeB = b.plannedDepartureTime || "23:59";
            return timeA.localeCompare(timeB);
          });
          setRoutes(sortedRoutes);
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

  useEffect(() => {
    if (!isAuthorized) return;
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'PUSH_RECEIVED') loadData(false);
    };
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleSWMessage);

    const interval = setInterval(() => loadData(false), 300000);
    return () => {
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      clearInterval(interval);
    };
  }, [isAuthorized, loadData]);

  const markAsSeen = async (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      await fetch(`/api/manager/notifications/${id}`, { method: 'PATCH' });
    } catch (error) { console.error(error); }
  };
  
  const handleLogout = async () => {
    await performLogout();
  };

  const toggleRouteSelection = (routeId: string) => {
    setSelectedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };
  
  const handlePrintLabels = async () => {
    if (selectedRoutes.size === 0) return alert("Выберите хотя бы один маршрут для печати");
    
    try {
      const response = await fetch('/api/manager/routes/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeIds: Array.from(selectedRoutes) })
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

  const updateRouteToAssembling = async (routeId: string) => {
    if (!confirm("Отправить все заказы маршрута на сборку в CRM?")) return;
    try {
      await fetch(`/api/manager/routes/${routeId}/status`, { 
        method: 'PATCH', 
        body: JSON.stringify({ crmStatus: 'assembling' }) 
      });
      loadData(false);
    } catch (e) { console.error(e); }
  };

  const updateOrderToAssembled = async (orderId: string) => {
    try {
      await fetch(`/api/manager/orders/${orderId}/status`, { 
        method: 'PATCH', 
        body: JSON.stringify({ crmStatus: 'assembling-complete' }) 
      });
      loadData(false);
    } catch (e) { console.error(e); }
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
  }).sort((a, b) => a.baseTime.localeCompare(b.baseTime));

  const pendingRoutes = routes.filter((route) => {
    if (!route.orders || route.orders.length === 0) return false;
    const hasAssigned = route.orders.some((o: any) => o.status === 'ASSIGNED');
    const hasStarted = route.orders.some((o: any) => o.status === 'IN_DELIVERY' || o.status === 'DELIVERED');
    return hasAssigned && !hasStarted;
  });

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Кабинет менеджера</h1>
        </div>
        <div className="relative">
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="w-10 h-10 bg-[#e8e6df] rounded-full flex items-center justify-center text-xl hover:bg-[#dcd9d1] transition-colors">👨‍💻</button>
          {isProfileOpen && <div className="absolute right-0 top-14 z-50"><ProfilePanel onClose={() => setIsProfileOpen(false)} /></div>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 w-full overflow-hidden">
        <div className="w-full overflow-x-auto hide-scrollbar mb-6 pb-2">
          <div className="flex bg-[#e8e6df] p-1 rounded-xl w-max shadow-inner gap-1">
            <button onClick={() => setActiveTab('new')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${activeTab === 'new' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}>
              Требуют внимания {tasks.length > 0 && <span className="bg-[#dc2626] text-white px-2 py-0.5 rounded-full text-[11px]">{tasks.length}</span>}
            </button>
            <button onClick={() => setActiveTab('routes')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'routes' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}>
              Все текущие маршруты
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
                  {tasksWithRoutes.length > 0 && (
                    <div className="hidden sm:grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-4 px-4 py-2 text-xs font-bold text-[#a8a49c] uppercase tracking-wider border-b border-[#e8e6df]">
                      <div>Курьер</div>
                      <div>Время на базе</div>
                      <div>Событие</div>
                      <div>Кто изменил</div>
                      <div className="text-right">Увидел</div>
                    </div>
                  )}

                  {tasksWithRoutes.map((item) => (
                    <div key={item.id} className="bg-white border-2 border-transparent hover:border-rose-100 rounded-2xl shadow-sm transition-all group overflow-hidden">
                      <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[2fr_1fr_2fr_1fr_auto] gap-3 sm:gap-4 items-center">
                        <div className="font-extrabold text-[#1a1a18] text-base">{item.firstName} {item.lastName}</div>
                        <div className="flex items-center gap-2 text-base font-black">
                          {item.oldTime && (
                            <><span className="text-[#a8a49c] line-through decoration-rose-500 decoration-2">{item.oldTime}</span><span className="text-[#a8a49c]">→</span></>
                          )}
                          <span className="text-[#1a1a18]">{item.baseTime}</span>
                        </div>
                        <div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg ${badgeConfig[item.changeType]?.styles || 'bg-gray-100 text-gray-800'}`}>
                            {badgeConfig[item.changeType]?.icon} {badgeConfig[item.changeType]?.text || 'Изменение'}
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

                      {item.routeData && item.routeData.orders?.length > 0 && (
                        <div className="bg-[#fafaf8] border-t border-[#f0efe9] p-4">
                          <p className="text-xs font-bold text-[#8c8880] mb-3 uppercase tracking-wider">Маршрут курьера ({item.routeData.orders.length} точек)</p>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {item.routeData.orders.map((order: any, idx: number) => {
                              const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;
                              const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-gray-200 text-gray-500' }) : null;
                              return (
                                <div key={order.id} className="flex gap-3 items-start bg-white p-3 border border-[#e8e6df] rounded-xl shadow-sm">
                                  <div className="w-6 h-6 rounded bg-[#1a1a18] text-white flex items-center justify-center text-xs font-black shrink-0">{idx + 1}</div>
                                  <div className="flex-grow min-w-0">
                                    <p className="text-[13px] font-bold text-[#1a1a18] break-words mb-1">{order.address || 'Без адреса'}</p>
                                    <div className="flex flex-wrap gap-2 items-center">
                                      <span className="text-[11px] font-bold text-[#6b6860] bg-[#f5f4f0] px-2 py-0.5 rounded border border-[#e8e6df]">⏱ {order.slotRaw || '—'}</span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>{localStatus.label}</span>
                                      {crmConf && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
                      <div key={route.id} className="bg-white border-2 border-[#e8e6df] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-4 border-b border-[#f0efe9] pb-3">
                          <div>
                            <h3 className="font-extrabold text-lg text-[#1a1a18] leading-tight flex flex-wrap items-center gap-2">
                              {route.courier?.firstName || 'Не назначен'} {route.courier?.lastName || ''}
                              {route.plannedDepartureTime && (
                                <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded uppercase tracking-wider border border-rose-100">
                                  На базе: {route.plannedDepartureTime}
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-[#a8a49c] font-bold uppercase tracking-wider mt-1">
                              Маршрут {route.name || `#${route.id.slice(-5).toUpperCase()}`}
                            </p>
                          </div>
                          <span className="bg-[#eef3ff] text-[#4a7aff] px-2.5 py-1 rounded-xl text-xs font-bold border border-[#dce6ff] shrink-0">
                            {route.orders?.length || 0} точ.
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-3 flex-grow">
                          {route.orders?.length > 0 ? route.orders.map((order: any, idx: number) => {
                            const localStatus = LOCAL_STATUSES[order.status] || LOCAL_STATUSES.NEW;
                            const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-gray-200 text-gray-500' }) : null;

                            return (
                              <div key={order.id} className="flex gap-3 items-start p-2.5 bg-[#fafaf8] rounded-xl border border-[#f0efe9]">
                                <div className="w-6 h-6 rounded-lg bg-[#1a1a18] text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{idx + 1}</div>
                                <div className="flex-grow min-w-0">
                                  <p className="text-[14px] font-bold text-[#1a1a18] leading-snug break-words mb-1.5">{order.address || 'Адрес не указан'}</p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-block bg-white text-[#6b6860] px-2 py-0.5 rounded-md text-xs font-bold border border-[#e8e6df]">⏱ {order.slotRaw || '—'}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${localStatus.color}`}>{localStatus.label}</span>
                                    {crmConf && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          }) : <p className="text-sm text-[#a8a49c] p-2">Точек нет</p>}
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
                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-[#e8e6df] shadow-sm mb-2">
                  <h2 className="text-lg font-bold text-[#1a1a18]">Управление маршрутами</h2>
                  <button 
                    onClick={handlePrintLabels}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm ${selectedRoutes.size > 0 ? 'bg-[#1a1a18] text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  >
                    🖨️ Печать этикеток (120x85)
                  </button>
                </div>

                <div className="flex flex-col gap-6 mt-2">
                  {routes.map((route) => {
                    // Подсчет общих слотов по маршруту
                    const routeTimeRange = getRouteTimeRange(route.orders);
                    
                    return (
                      <div key={route.id} className={`bg-white border-2 rounded-2xl p-5 shadow-sm transition-all ${selectedRoutes.has(route.id) ? 'border-[#1a1a18]' : 'border-[#e8e6df]'}`}>
                        
                        {/* ШАПКА МАРШРУТА */}
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-5 pb-4 border-b border-[#f0efe9] gap-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <input 
                              type="checkbox" 
                              className="w-5 h-5 accent-[#1a1a18] rounded cursor-pointer shrink-0"
                              checked={selectedRoutes.has(route.id)}
                              onChange={() => toggleRouteSelection(route.id)}
                            />
                            
                            <h3 className="font-black text-[17px] text-[#1a1a18] leading-tight flex flex-wrap items-center gap-2">
                              {route.courier?.firstName || 'Не назначен'} {route.courier?.lastName || ''}
                              {route.courier?.phone && (
                                <div className="ml-1 inline-flex">
                                  <ContactBadge phone={route.courier.phone} isCourier={true} />
                                </div>
                              )}
                            </h3>
                            
                            <div className="flex flex-wrap items-center gap-3 ml-2">
                              {route.plannedDepartureTime && (
                                <span className="text-[12px] font-black text-rose-700 bg-rose-50 px-2 py-1 rounded uppercase tracking-wider border border-rose-200">
                                  На базе: {route.plannedDepartureTime}
                                </span>
                              )}
                              {routeTimeRange && (
                                <span className="text-[12px] font-black text-blue-700 bg-blue-50 px-2 py-1 rounded uppercase tracking-wider border border-blue-200">
                                  Слоты: {routeTimeRange}
                                </span>
                              )}
                              <span className="text-xs font-bold text-[#6b6860] bg-[#f5f4f0] px-2 py-1 rounded border border-[#e8e6df]">
                                Точек: {route.orders?.length || 0}
                              </span>
                            </div>
                          </div>
                          
                          <button 
                            onClick={() => updateRouteToAssembling(route.id)}
                            className="w-full lg:w-auto bg-[#fff8e6] text-[#b38a00] border border-[#ffe082] px-4 py-2 rounded-lg text-sm font-bold hover:bg-[#fff0c2] transition-colors whitespace-nowrap shadow-sm"
                          >
                            📦 Отправить на сборку
                          </button>
                        </div>
                        
                        {/* КАРТОЧКИ ЗАКАЗОВ В МАРШРУТЕ */}
                        <div className="flex flex-col gap-4 flex-grow">
                          {route.orders?.length > 0 ? route.orders.map((order: any, idx: number) => {
                            const isAssembled = order.crmStatus === 'assembling-complete';
                            const crmConf = order.crmStatus ? (CRM_STATUSES[order.crmStatus] || { label: order.crmStatus, color: 'border-gray-200 text-gray-500' }) : null;
                            
                            return (
                              <div key={order.id} className="flex gap-4 p-4 bg-[#fafaf8] rounded-xl border border-[#f0efe9]">
                                <div className="w-8 h-8 rounded-lg bg-[#1a1a18] text-white flex items-center justify-center text-sm font-black shrink-0 mt-0.5">{idx + 1}</div>
                                
                                <div className="flex-grow min-w-0 flex flex-col gap-3">
                                  
                                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                                    <div className="flex flex-col gap-1.5">
                                      {/* Номер, Слот, CRM Статус */}
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-black text-base text-[#1a1a18]">Заказ #{order.number || order.id.slice(-4)}</span>
                                        <span className="text-xs font-bold text-[#6b6860] bg-white px-2 py-0.5 rounded border border-[#e8e6df] shadow-sm">⏱ {order.slotRaw || '—'}</span>
                                        {crmConf && <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${crmConf.color}`}>CRM: {crmConf.label}</span>}
                                      </div>
                                      
                                      {/* Адрес с ETA */}
                                      <div className="text-[14px] font-medium text-[#1a1a18] leading-snug flex items-center flex-wrap gap-2">
                                        {order.address || 'Адрес не указан'}
                                        {order.eta && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shadow-sm">~ {order.eta}</span>}
                                      </div>
                                    </div>
                                    
                                    <button 
                                      onClick={() => updateOrderToAssembled(order.id)}
                                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shadow-sm ${isAssembled ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                    >
                                      {isAssembled ? '✅ Собран' : 'Сделать Собран'}
                                    </button>
                                  </div>

                                  {/* Состав заказа */}
                                  <div className="text-sm font-medium text-[#4a4740] bg-white p-2.5 rounded-lg border border-[#e8e6df] shadow-sm">
                                    <span className="font-bold text-[#1a1a18] block mb-1">📦 Состав:</span> 
                                    {order.composition || order.items || 'Состав не загружен'}
                                  </div>

                                  {/* Данные получателя и иконки связи */}
                                  <div className="mt-1">
                                    <ContactBadge phone={order.clientPhone} name={order.clientName} />
                                  </div>

                                  {/* Комментарии */}
                                  {(order.clientComment || order.opComment) && (
                                    <div className="flex flex-col gap-2 mt-1">
                                      {order.clientComment && (
                                        <div className="bg-[#fff1f2] border border-[#ffe4e6] p-2 rounded-lg">
                                          <p className="text-sm text-[#881337]"><span className="font-bold text-[#be123c] uppercase tracking-wider text-[10px] block mb-0.5">Комментарий клиента</span> {order.clientComment}</p>
                                        </div>
                                      )}
                                      {order.opComment && (
                                        <div className="bg-[#f0fdf4] border border-[#dcfce7] p-2 rounded-lg">
                                          <p className="text-sm text-[#14532d]"><span className="font-bold text-[#15803d] uppercase tracking-wider text-[10px] block mb-0.5">Заметка оператора</span> {order.opComment}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                </div>
                              </div>
                            );
                          }) : <p className="text-sm text-[#a8a49c] font-medium p-2 text-center my-auto">В данном маршруте нет точек</p>}
                        </div>
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
                      <div className="text-xs font-black text-[#a8a49c] w-12 text-center">{task.baseTime}</div>
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