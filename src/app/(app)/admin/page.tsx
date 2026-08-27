'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: 'COURIER' | 'OPERATOR' | 'ADMIN';
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  
  // 🔥 ДОБАВЛЕНО: Состояние проверки прав
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // 🔥 ПРОВЕРКА ПРАВ ДОСТУПА
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then((data) => {
        // Пускаем ТОЛЬКО Админов
        if (data?.role !== 'ADMIN') {
          window.location.replace('/dashboard'); // Если не админ, выкидываем
          return;
        }
        
        setIsAuthorized(true); // Права подтверждены, показываем страницу
        
        // Только после подтверждения прав грузим список пользователей
        fetch('/api/admin/users')
          .then((res) => res.json())
          .then((data) => setUsers(Array.isArray(data) ? data : []));
      })
      .catch(() => {
        window.location.replace('/login'); // Если вообще не авторизован
      });
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setLoadingId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole as User['role'] } : u))
        );
      } else {
        alert('Не удалось изменить роль');
      }
    } catch (error) {
      console.error('Ошибка:', error);
    } finally {
      setLoadingId(null);
    }
  };

  // Пока проверяем права, показываем загрузку (чтобы интерфейс не мелькал)
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f4f0]">
        <p className="text-[#a8a49c] font-medium animate-pulse">Проверка прав доступа...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen bg-[#f5f4f0]">
      <h1 className="text-2xl font-bold mb-6 text-[#1a1a18]">Управление доступом (Админ)</h1>
      
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e6df] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#fafaf8] border-b border-[#e8e6df]">
            <tr>
              <th className="p-4 text-xs font-bold text-[#a8a49c] uppercase tracking-wider">Сотрудник</th>
              <th className="p-4 text-xs font-bold text-[#a8a49c] uppercase tracking-wider">Роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8e6df]">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-[#fafaf8] transition-colors">
                <td className="p-4">
                  <div className="font-bold text-[#1a1a18]">{user.name || 'Имя не указано'}</div>
                  <div className="text-sm font-medium text-[#a8a49c]">{user.email || user.phone}</div>
                </td>
                <td className="p-4">
                  <select
                    value={user.role}
                    disabled={loadingId === user.id}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="p-2 border border-[#e8e6df] rounded-lg bg-white text-[#1a1a18] font-medium focus:outline-none focus:border-[#4a7aff] disabled:opacity-50 cursor-pointer"
                  >
                    <option value="COURIER">Курьер</option>
                    <option value="OPERATOR">Менеджер</option>
                    <option value="ADMIN">Админ</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
