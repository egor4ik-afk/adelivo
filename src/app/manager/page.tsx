'use client';

import { useState, useEffect } from 'react';
import { ProfilePanel } from '@/components/ProfilePanel';

type ChangeType = 'TIME_CHANGED' | 'ORDERS_CHANGED' | 'ROUTE_REASSIGNED';

interface Notification {
  id: string; firstName: string; lastName: string;
  baseTime: string; changeType: ChangeType; isSeen: boolean; createdAt: string;
}

const badgeConfig: Record<string, { text: string; styles: string }> = {
  TIME_CHANGED: { text: 'Изменено время', styles: 'bg-orange-100 text-orange-800 border-orange-200' },
  ORDERS_CHANGED: { text: 'Изменены заказы', styles: 'bg-blue-100 text-blue-800 border-blue-200' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export default function ManagerDashboard() {
  const [activeTab, setActiveTab] = useState<'new' | 'routes' | 'history'>('new');
  
  const [tasks, setTasks] = useState<Notification[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    } catch (err) { console.error('Ошибка', err); }
  };

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => { if (!res.ok) throw new Error('Not logged in'); return res.json(); })
      .then((data) => {
        if (data?.role !== 'OPERATOR' && data?.role !== 'ADMIN') {
          window.location.replace('/dashboard'); return;
        }
        setIsAuthorized(true);
        loadData();
      })
      .catch((err) => {
        if (err.message === 'Not logged in') window.location.replace('/login');
      });
  }, []);

  useEffect(() => { if (isAuthorized) loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'new' || activeTab === 'routes') {
        // Грузим и уведомления, и маршруты, чтобы объединить их на первом экране
        const [notifRes, routesRes] = await Promise.all([
          fetch('/api/manager/notifications'),
          fetch('/api/manager/routes')
        ]);
        const notifData = await notifRes.json();
        const routesData = await routesRes.json();
        if (Array.isArray(notifData)) setTasks(notifData);
        if (Array.isArray(routesData)) setRoutes(routesData);
      } else if (activeTab === 'history') {
        const res = await fetch('/api/manager/notifications?history=true');
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
      }
    } catch (error) { console.error(error); }
    setLoading(false);
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

  // 🔥 ЛОГИКА ДЛЯ ПЕРВОЙ ВКЛАДКИ: Связываем Уведомления с Маршрутами
  // И сортируем их по времени прибытия на базу (baseTime)
  const tasksWithRoutes = tasks.map(task => {
    // Ищем маршрут, где имя и фамилия курьера совпадают с уведомлением
    const matchedRoute = routes.find(r => 
      r.courier?.firstName === task.firstName && r.courier?.lastName === task.lastName
    );
    return { ...task, routeData: matchedRoute };
  }).sort((a, b) => a.baseTime.localeCompare(b.baseTime)); // Сортировка: кто раньше - сверху

  return (
    <div className="min-h-screen bg-[#f5f4f0]">
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Кабинет менеджера</h1>
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-10 h-10 bg-[#e8e6df] rounded-full flex items-center justify-center text-xl hover:bg-[#dcd9d1] transition-colors"
          >👨‍💻</button>
          {isProfileOpen && (
            <div className="absolute right-0 top-14 z-50">
              <ProfilePanel onClose={() => setIsProfileOpen(false)} onLogout={handleLogout} />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        
        {/* Вкладки (Tabs) */}
        <div className="flex bg-[#e8e6df] p-1 rounded-xl w-fit mb-6 shadow-inner overflow-x-auto">
          <button 
            onClick={() => setActiveTab('new')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'new' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            Требуют внимания 
            {tasks.length > 0 && <span className="bg-[#dc2626] text-white px-2 py-0.5 rounded-full text-[11px]">{tasks.length}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('routes')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'routes' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            Все текущие маршруты
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'history' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            История логов
          </button>
        </div>

        {loading ? (
          <p className="text-center text-[#a8a49c] font-medium mt-10 animate-pulse">Загрузка данных...</p>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* Вкладка: ТРЕБУЮТ ВНИМАНИЯ (Уведомления + Маршрут внутри) */}
            {activeTab === 'new' && (
              <div className="flex flex-col gap-4">
                {tasksWithRoutes.map((item) => (
                  <div key={item.id} className="bg-white border-2 border-rose-100 rounded-2xl shadow-sm overflow-hidden relative">
                    
                    {/* Красная полоска слева для привлечения внимания */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-400"></div>

                    {/* Верхняя панель (Кто, Во сколько на базе, Какое изменение) */}
                    <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#fffcfc] border-b border-rose-50 pl-6 sm:pl-7">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center w-14 h-14 bg-white border border-rose-100 shadow-sm rounded-xl shrink-0">
                          <span className="text-[10px] font-bold text-[#a8a49c] uppercase tracking-wider -mb-1">На базе</span>
                          <span className="text-lg font-black text-[#1a1a18]">{item.baseTime}</span>
                        </div>
                        <div>
                          <p className="text-xl font-extrabold text-[#1a1a18] leading-none mb-1.5">
                            {item.firstName} {item.lastName}
                          </p>
                          <span className={`inline-flex px-3 py-1 text-xs font-bold border rounded-lg ${badgeConfig[item.changeType]?.styles || 'bg-gray-100 text-gray-800'}`}>
                            {badgeConfig[item.changeType]?.text || 'Изменение'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Кнопка "Скрыть" */}
                      <button 
                        onClick={() => markAsSeen(item.id)} 
                        className="flex items-center justify-center gap-2 px-4 h-12 text-[#1a1a18] bg-white border border-[#e8e6df] shadow-sm hover:bg-green-500 hover:text-white hover:border-green-600 rounded-xl transition-all font-bold text-sm w-full sm:w-auto"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Понятно
                      </button>
                    </div>

                    {/* Нижняя часть - Детали маршрута, если он найден */}
                    {item.routeData ? (
                      <div className="p-4 sm:p-5 pl-6 sm:pl-7 bg-white">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-sm font-bold text-[#6b6860]">
                            Маршрут #{item.routeData.name || item.routeData.id.slice(-4).toUpperCase()}
                          </span>
                          <span className="bg-[#f5f4f0] text-[#8c8880] px-2 py-0.5 rounded-md text-xs font-bold">
                            {item.routeData.orders?.length || 0} точек
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          {item.routeData.orders?.slice(0, 3).map((order: any, idx: number) => (
                            <div key={order.id} className="flex gap-3 items-start">
                              <div className="w-5 h-5 rounded bg-[#f5f4f0] text-[#8c8880] flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                {idx + 1}
                              </div>
                              <div className="flex-grow min-w-0">
                                <p className="text-[13px] font-bold text-[#1a1a18] truncate">
                                  {order.address || 'Без адреса'}
                                </p>
                                <p className="text-[11px] font-semibold text-[#a8a49c] mt-0.5">
                                  ⏱ {order.slotRaw || '—'} • Заказ {order.externalId || order.crmId}
                                </p>
                              </div>
                            </div>
                          ))}
                          {item.routeData.orders?.length > 3 && (
                            <p className="text-[12px] font-bold text-[#4a7aff] ml-8 mt-1">
                              + ещё {item.routeData.orders.length - 3} точек
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 pl-7 bg-white text-sm text-[#a8a49c] font-medium">
                        Маршрут на сегодня пока не сформирован
                      </div>
                    )}
                  </div>
                ))}
                {tasksWithRoutes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-4xl mb-4">☕</div>
                    <p className="text-[#1a1a18] font-bold text-lg">Всё спокойно</p>
                    <p className="text-[#a8a49c] mt-1">Новых изменений от логистов нет</p>
                  </div>
                )}
              </div>
            )}

            {/* Вкладка: ВСЕ МАРШРУТЫ КУРЬЕРОВ (Оставили как было, красивой сеткой) */}
            {activeTab === 'routes' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                  {routes.map((route) => (
                    <div key={route.id} className="bg-white border border-[#e8e6df] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-4 border-b border-[#f0efe9] pb-3">
                        <div>
                          <h3 className="font-extrabold text-lg text-[#1a1a18] leading-tight">
                            {route.courier?.firstName || 'Не назначен'} {route.courier?.lastName || ''}
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
                        {route.orders?.length > 0 ? route.orders.map((order: any, idx: number) => (
                          <div key={order.id} className="flex gap-3 items-start p-2.5 hover:bg-[#fafaf8] rounded-xl transition-colors border border-transparent hover:border-[#f0efe9]">
                            <div className="w-6 h-6 rounded-lg bg-[#1a1a18] text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">{idx + 1}</div>
                            <div className="flex-grow min-w-0">
                              <p className="text-[14px] font-bold text-[#1a1a18] leading-snug break-words">{order.address || 'Адрес не указан'}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="inline-block bg-[#f5f4f0] text-[#6b6860] px-2 py-0.5 rounded-md text-xs font-bold border border-[#e8e6df]">⏱ {order.slotRaw || '—'}</span>
                                <span className="text-xs font-semibold text-[#a8a49c]">Заказ {order.externalId || order.crmId}</span>
                              </div>
                            </div>
                          </div>
                        )) : <p className="text-sm text-[#a8a49c] font-medium p-2 text-center my-auto">В данном маршруте нет точек</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {routes.length === 0 && <p className="text-[#a8a49c] font-medium text-center py-12">На сегодня маршрутов еще нет</p>}
              </>
            )}

            {/* Вкладка: ИСТОРИЯ ЛОГОВ */}
            {activeTab === 'history' && (
              <>
                {history.map((task) => (
                  <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#fafaf8] border border-[#e8e6df] rounded-xl opacity-80 gap-3">
                    <div className="flex items-center gap-4">
                      <div className="text-xs font-black text-[#a8a49c] w-12 text-center">{task.baseTime}</div>
                      <div className="w-px h-8 bg-[#e8e6df]"></div>
                      <p className="text-[15px] font-bold text-[#1a1a18]">{task.firstName} {task.lastName}</p>
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