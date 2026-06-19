'use client';

import { useState, useEffect } from 'react';
import { ProfilePanel } from '@/components/ProfilePanel';

type ChangeType = 'TIME_CHANGED' | 'ORDERS_CHANGED' | 'ROUTE_REASSIGNED';

interface Notification {
  id: string;
  firstName: string;
  lastName: string;
  baseTime: string;
  changeType: ChangeType;
  isSeen: boolean;
}

const badgeConfig: Record<string, { text: string; styles: string }> = {
  TIME_CHANGED: { text: 'Изменено время', styles: 'bg-orange-100 text-orange-800 border-orange-200' },
  ORDERS_CHANGED: { text: 'Изменены заказы', styles: 'bg-blue-100 text-blue-800 border-blue-200' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export default function ManagerDashboard() {
  const [tasks, setTasks] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // 🔥 ДОБАВЛЕНО: Состояние проверки прав
  const [isAuthorized, setIsAuthorized] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    } catch (err) {
      console.error('Ошибка при выходе', err);
    }
  };

  useEffect(() => {
    // 🔥 ПРОВЕРКА ПРАВ (Пускаем только OPERATOR и ADMIN)
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then((data) => {
        if (data?.role !== 'OPERATOR' && data?.role !== 'ADMIN') {
          window.location.replace('/dashboard');
          return;
        }
        setIsAuthorized(true);

        // Права есть, грузим уведомления
        return fetch('/api/manager/notifications');
      })
      .then((res) => res?.json())
      .then((data) => {
        if (Array.isArray(data)) setTasks(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Ошибка:', err);
        if (err.message === 'Not logged in') {
          window.location.replace('/login');
        } else {
          setLoading(false);
        }
      });
  }, []);

  const markAsSeen = async (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      const res = await fetch(`/api/manager/notifications/${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Ошибка при скрытии');
    } catch (error) {
      console.error(error);
    }
  };

  // 🔥 Пока идет проверка, не показываем интерфейс
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
          {/* Кнопка открытия профиля (Кружок) */}
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-10 h-10 bg-[#e8e6df] rounded-full flex items-center justify-center text-xl hover:bg-[#dcd9d1] transition-colors"
          >
            👨‍💻
          </button>

          {/* Сама панель профиля (показывается только когда isProfileOpen === true) */}
          {isProfileOpen && (
            <div className="absolute right-0 top-14 z-50">
              <ProfilePanel 
                onClose={() => setIsProfileOpen(false)} 
                onLogout={handleLogout} 
              />
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {loading ? (
          <p className="text-center text-gray-500 mt-10">Загрузка изменений...</p>
        ) : (
          <div className="flex flex-col gap-4 mt-4">
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-[#e8e6df] rounded-2xl shadow-sm gap-4 transition-all hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-14 h-14 bg-[#f5f4f0] rounded-xl font-bold text-lg text-[#1a1a18]">
                    {task.baseTime}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#1a1a18]">
                      {task.firstName} {task.lastName}
                    </p>
                    <p className="text-sm font-medium text-[#a8a49c] uppercase tracking-wider mt-1">
                      Ожидается на базе
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {badgeConfig[task.changeType] ? (
                    <span className={`px-4 py-2 text-sm font-bold border rounded-xl ${badgeConfig[task.changeType].styles}`}>
                      {badgeConfig[task.changeType].text}
                    </span>
                  ) : (
                    <span className="px-4 py-2 text-sm font-bold border rounded-xl bg-gray-100 text-gray-800">
                      Неизвестное изменение
                    </span>
                  )}
                  
                  <button
                    onClick={() => markAsSeen(task.id)}
                    className="flex items-center justify-center w-12 h-12 text-[#a8a49c] bg-[#f5f4f0] hover:text-white hover:bg-[#4a7aff] rounded-xl transition-colors border border-transparent hover:border-[#4a7aff]"
                    title="Пометить как увиденное"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
            
            {tasks.length === 0 && (
              <p className="text-[#a8a49c] font-medium text-center py-12">Нет новых изменений по курьерам</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}