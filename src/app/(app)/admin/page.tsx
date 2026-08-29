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
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <p className="text-[var(--color-text-3)] font-medium animate-pulse">Проверка прав доступа...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen bg-[var(--color-bg)]">
      <h1 className="text-2xl font-bold mb-6 text-[var(--color-text)]">Управление доступом (Админ)</h1>
      
      <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-4 text-xs font-bold text-[var(--color-text-3)] uppercase tracking-wider">Сотрудник</th>
              <th className="p-4 text-xs font-bold text-[var(--color-text-3)] uppercase tracking-wider">Роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-[var(--color-surface)] transition-colors">
                <td className="p-4">
                  <div className="font-bold text-[var(--color-text)]">{user.name || 'Имя не указано'}</div>
                  <div className="text-sm font-medium text-[var(--color-text-3)]">{user.email || user.phone}</div>
                </td>
                <td className="p-4">
                  <select
                    value={user.role}
                    disabled={loadingId === user.id}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="p-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-card)] text-[var(--color-text)] font-medium focus:outline-none focus:border-[var(--color-accent)] disabled:opacity-50 cursor-pointer"
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
