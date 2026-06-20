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

  // Подгружаем данные при смене вкладок
  useEffect(() => { if (isAuthorized) loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'new') {
        const res = await fetch('/api/manager/notifications');
        const data = await res.json();
        if (Array.isArray(data)) setTasks(data);
      } else if (activeTab === 'history') {
        const res = await fetch('/api/manager/notifications?history=true');
        const data = await res.json();
        if (Array.isArray(data)) setHistory(data);
      } else if (activeTab === 'routes') {
        const res = await fetch('/api/manager/routes');
        const data = await res.json();
        if (Array.isArray(data)) setRoutes(data);
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

      <main className="max-w-4xl mx-auto p-6">
        
        {/* Вкладки (Tabs) */}
        <div className="flex bg-[#e8e6df] p-1 rounded-xl w-fit mb-6 shadow-inner">
          <button 
            onClick={() => setActiveTab('new')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'new' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            Требуют внимания 
            {tasks.length > 0 && <span className="bg-[#dc2626] text-white px-2 py-0.5 rounded-full text-[11px]">{tasks.length}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('routes')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'routes' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            Текущие маршруты
          </button>
          <button 
            onClick={() => setActiveTab('history')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-[#1a1a18]' : 'text-[#8c8880] hover:text-[#1a1a18]'}`}
          >
            История логов
          </button>
        </div>

        {loading ? (
          <p className="text-center text-[#a8a49c] font-medium mt-10 animate-pulse">Загрузка данных...</p>
        ) : (
          <div className="flex flex-col gap-4">
            
            {/* Вкладка: НОВЫЕ ПЛАШКИ */}
            {activeTab === 'new' && (
              <>
                {tasks.map((task) => (
                  <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-[#e8e6df] rounded-2xl shadow-sm gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-14 h-14 bg-[#f5f4f0] rounded-xl font-bold text-lg text-[#1a1a18]">{task.baseTime}</div>
                      <div>
                        <p className="text-lg font-bold text-[#1a1a18]">{task.firstName} {task.lastName}</p>
                        <p className="text-sm font-medium text-[#a8a49c] uppercase tracking-wider mt-1">Ожидается на базе</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-4 py-2 text-sm font-bold border rounded-xl ${badgeConfig[task.changeType]?.styles || 'bg-gray-100 text-gray-800'}`}>
                        {badgeConfig[task.changeType]?.text || 'Изменение'}
                      </span>
                      <button onClick={() => markAsSeen(task.id)} className="flex items-center justify-center w-12 h-12 text-[#a8a49c] bg-[#f5f4f0] hover:text-white hover:bg-[#4a7aff] rounded-xl transition-colors border border-transparent hover:border-[#4a7aff]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      </button>
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-[#a8a49c] text-center py-12">Нет новых уведомлений</p>}
              </>
            )}

            {/* Вкладка: МАРШРУТЫ КУРЬЕРОВ */}
            {activeTab === 'routes' && (
              <>
                {routes.map((route) => (
                  <div key={route.id} className="bg-white border border-[#e8e6df] rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4 border-b border-[#f0efe9] pb-4">
                      <div>
                        <h3 className="font-bold text-lg text-[#1a1a18]">{route.courier?.firstName} {route.courier?.lastName}</h3>
                        <p className="text-sm text-[#a8a49c] font-medium mt-0.5">Маршрут #{route.name || route.id.slice(-4)}</p>
                      </div>
                      <div className="bg-[#eef3ff] text-[#4a7aff] px-3 py-1.5 rounded-lg text-sm font-bold border border-[#dce6ff]">
                        {/* 🔥 Считаем orders вместо points */}
                        {route.orders?.length || 0} точек
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      {/* 🔥 Итерируемся по orders напрямую */}
                      {route.orders?.length > 0 ? route.orders.map((order: any, idx: number) => (
                        <div key={order.id} className="flex gap-3 items-start p-2 hover:bg-[#fafaf8] rounded-xl transition-colors">
                          <div className="w-7 h-7 rounded-full bg-[#f5f4f0] text-[#8c8880] flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 border border-[#e8e6df]">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-[15px] font-bold text-[#1a1a18]">{order.address || 'Адрес не указан'}</p>
                            <p className="text-sm text-[#a8a49c] mt-0.5 font-medium">
                              {order.slotRaw || 'Время не назначено'} • Заказ {order.externalId || order.crmId}
                            </p>
                          </div>
                        </div>
                      )) : <p className="text-sm text-[#a8a49c] p-2">Точек нет</p>}
                    </div>
                  </div>
                ))}
                {routes.length === 0 && <p className="text-[#a8a49c] text-center py-12">На сегодня маршрутов еще нет</p>}
              </>
            )}

            {/* Вкладка: ИСТОРИЯ ЛОГОВ */}
            {activeTab === 'history' && (
              <>
                {history.map((task) => (
                  <div key={task.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[#fafaf8] border border-[#e8e6df] rounded-xl opacity-80 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-bold text-[#a8a49c] w-12">{task.baseTime}</div>
                      <div>
                        <p className="text-[15px] font-bold text-[#1a1a18]">{task.firstName} {task.lastName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#a8a49c] font-medium mr-2">
                        {new Date(task.createdAt).toLocaleDateString("ru-RU", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className={`px-3 py-1 text-xs font-bold border rounded-lg ${badgeConfig[task.changeType]?.styles || 'bg-gray-100 text-gray-800'}`}>
                        {badgeConfig[task.changeType]?.text || 'Изменение'}
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
