# Патч: ссылка на матрицу доступов со страницы `/admin`

Файл: `src/app/(app)/admin/page.tsx` (после применения тем строка выглядит уже
с переменными — используйте вариант «стало» из вашей версии файла).

**Найти:**

```tsx
      <h1 className="text-2xl font-bold mb-6 text-[var(--color-text)]">Управление доступом (Админ)</h1>
```

**Заменить на:**

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Управление доступом (Админ)</h1>
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
```

**И добавить импорт** в начало файла:

```tsx
import Link from 'next/link';
```

---

## Про проверку прав на этой странице

Сейчас `/admin` пускает любого с ролью `ADMIN`. После введения глобального и локального
админа это стоит уточнить: страница `/admin/access` уже проверяет `isSuperAdmin` на сервере
(в `getViewer`), а сама `/admin` — по-прежнему только роль.

Логика получается такая:

| Страница | Кто пускается |
|---|---|
| `/admin` (роли пользователей) | любой `ADMIN` — локальный админ управляет своими людьми |
| `/admin/access` (матрица магазинов) | только `isSuperAdmin` |

Если хотите закрыть и `/admin` от локальных админов — замените клиентскую проверку
`data?.role !== 'ADMIN'` на серверную через `getViewer()`, как это сделано
в `src/app/(app)/admin/access/page.tsx`. Клиентская проверка через `useEffect`
в любом случае слабее: разметка отдаётся браузеру до редиректа.
