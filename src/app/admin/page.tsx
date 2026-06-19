'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  firstName: string | null;
  email: string | null;
  phone: string | null;
  role: 'COURIER' | 'MANAGER' | 'ADMIN';
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Загружаем юзеров при открытии страницы
  useEffect(() => {
    fetch('/api/admin/users')
      .then((res) => res.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []));
  }, []);

  // Функция изменения роли
  const handleRoleChange = async (userId: string, newRole: string) => {
    setLoadingId(userId);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      
      if (res.ok) {
        // Локально обновляем UI, если сервер ответил 200 OK
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Управление пользователями</h1>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-600">Сотрудник</th>
              <th className="p-4 text-sm font-semibold text-gray-600">Роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <div className="font-medium text-gray-900">{user.firstName || 'Имя не указано'}</div>
                  <div className="text-sm text-gray-500">{user.email || user.phone}</div>
                </td>
                <td className="p-4">
                  <select
                    value={user.role}
                    disabled={loadingId === user.id}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="COURIER">Курьер</option>
                    <option value="MANAGER">Менеджер</option>
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
