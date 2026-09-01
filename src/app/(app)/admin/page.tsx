'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface User {
  id: string;
  // API отдаёт firstName/lastName, а тип ждал name — из-за этого
  // в таблице у всех было «Имя не указано». Держим оба варианта.
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  phone: string | null;
  role: 'COURIER' | 'OPERATOR' | 'ADMIN';
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'OPERATOR' | 'COURIER'>('ALL');
  
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

  const shownUsers = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (!q.trim()) return true;
    const hay = `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.name ?? ''} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase().trim());
  });

  return (
    <div className="max-w-4xl mx-auto p-6 min-h-screen bg-[var(--color-bg)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Управление доступом (Админ)</h1>
        <div className="flex gap-2">
          <Link
            href="/company"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-2)] text-sm font-bold hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors"
          >
            Компания и магазины
          </Link>
          <Link
            href="/admin/access"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-bold shadow-sm hover:bg-[var(--color-accent-dark)] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Матрица магазинов
          </Link>
        </div>
      </div>
      
      {/* Поиск и фильтр — как в матрице доступов и в заказах */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Имя, почта, телефон"
          className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] min-w-[220px] flex-1"
        />
        <div className="flex bg-[var(--color-border)] p-1 rounded-xl gap-1">
          {(['ALL', 'ADMIN', 'OPERATOR', 'COURIER'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                roleFilter === r
                  ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]'
                  : 'text-[var(--color-text-2)] hover:text-[var(--color-text)]'
              }`}
            >
              {r === 'ALL' ? 'Все' : r === 'ADMIN' ? 'Админы' : r === 'OPERATOR' ? 'Операторы' : 'Курьеры'}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-[var(--color-text-3)]">
          {shownUsers.length} из {users.length}
        </span>
      </div>

      <div className="bg-[var(--color-card)] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
            <tr>
              <th className="p-4 text-xs font-bold text-[var(--color-text-3)] uppercase tracking-wider">Сотрудник</th>
              <th className="p-4 text-xs font-bold text-[var(--color-text-3)] uppercase tracking-wider">Роль</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {shownUsers.map((user) => (
              <tr key={user.id} className="hover:bg-[var(--color-surface)] transition-colors">
                <td className="p-4">
                  <div className="font-bold text-[var(--color-text)]">{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Имя не указано'}</div>
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
