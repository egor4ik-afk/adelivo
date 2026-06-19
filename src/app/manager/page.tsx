// src/app/manager/page.tsx
'use client';

import { useState } from 'react';

// Заглушка, позже заменим на API (Prisma)
const initialTasks = [
  { id: '1', firstName: 'Иван', lastName: 'Иванов', baseTime: '09:15', changeType: 'TIME_CHANGED', isSeen: false },
  { id: '2', firstName: 'Алексей', lastName: 'Смирнов', baseTime: '08:30', changeType: 'ROUTE_REASSIGNED', isSeen: false },
  { id: '3', firstName: 'Петр', lastName: 'Васильев', baseTime: '10:00', changeType: 'ORDERS_CHANGED', isSeen: false },
  { id: '4', firstName: 'Дмитрий', lastName: 'Соколов', baseTime: '08:45', isSeen: true },
];

const badgeConfig: Record<string, { text: string; styles: string }> = {
  TIME_CHANGED: { text: 'Изменено время', styles: 'bg-orange-100 text-orange-800 border-orange-200' },
  ORDERS_CHANGED: { text: 'Изменены заказы', styles: 'bg-blue-100 text-blue-800 border-blue-200' },
  ROUTE_REASSIGNED: { text: 'Новый маршрут', styles: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export default function ManagerDashboard() {
  const [tasks, setTasks] = useState(initialTasks);

  // Сортировка: самые ранние курьеры сверху
  const sortedTasks = [...tasks].sort((a, b) => a.baseTime.localeCompare(b.baseTime));

  const markAsSeen = (id: string) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, isSeen: true } : task)));
    // TODO: Здесь будет запрос к БД для обновления статуса
  };

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen bg-gray-50">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Кабинет менеджера</h1>
      </div>
      
      <div className="flex flex-col gap-4">
        {sortedTasks.map((task) => (
          <div 
            key={task.id} 
            className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-gray-200 rounded-xl shadow-sm gap-4"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 bg-gray-100 rounded-xl font-bold text-lg text-gray-800">
                {task.baseTime}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {task.firstName} {task.lastName}
                </p>
                <p className="text-sm text-gray-500">Назначено на базе</p>
              </div>
            </div>

            {!task.isSeen && task.changeType && (
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 text-sm font-semibold border rounded-lg ${badgeConfig[task.changeType].styles}`}>
                  {badgeConfig[task.changeType].text}
                </span>
                
                <button
                  onClick={() => markAsSeen(task.id)}
                  className="flex items-center justify-center w-10 h-10 text-gray-400 bg-gray-50 hover:text-white hover:bg-green-500 rounded-lg transition-all border border-gray-200 hover:border-green-600"
                  title="Пометить как увиденное"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
        
        {sortedTasks.length === 0 && (
          <p className="text-gray-500 text-center py-8">Нет назначенных курьеров</p>
        )}
      </div>
    </div>
  );
}
