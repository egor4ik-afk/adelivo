# ADelivo — пакет 4: тема в кабинетах, матрица магазинов, патч БД

Порядок как договорились: сначала тема на авторизованные экраны, затем матрица.
Схема БД заложена сразу под биржу, компании и коннекторы — чтобы не гнать прод
через несколько миграций подряд.

---

## Часть 1. Тема во всех кабинетах

### Как решено

Кабинеты написаны на Tailwind с произвольными значениями (`bg-[#f5f4f0]`,
`text-[#1a1a18]`) — такие классы компилируются в литеральный цвет и темизации
не поддаются. Поэтому все они переведены на CSS-переменные:
`bg-[var(--color-bg)]`, `text-[var(--color-text)]`. Значения переменных
меняются вместе с темой, разметка остаётся прежней.

Бейджи статусов (`bg-green-100 text-green-800` и ещё 80 вхождений) переписывать
не стал — вместо этого в `globals.css` переопределены сами утилиты внутри
`:root[data-ew-theme="dark"]`: бледные заливки заменены на полупрозрачные,
тёмный текст — на светлый. Одно место вместо восьмидесяти правок в разметке.

### Файлы

**Заменить:**

```
src/app/globals.css                     светлая + тёмная палитра, оверрайды утилит
src/app/layout.tsx                      + <ThemeScript /> в <head>
src/app/(public)/layout.tsx             ThemeScript убран — он теперь в корневом
src/components/ProfilePanel.tsx         + строка переключателя темы
```

**Сконвертированы (класть поверх, 15 файлов):**

```
src/app/(app)/admin/page.tsx
src/app/(app)/courier/layout.tsx
src/app/(app)/courier/points/page.tsx
src/app/(app)/courier/profile/page.tsx
src/app/(app)/courier/routes/page.tsx
src/app/(app)/login/page.tsx
src/app/(app)/manager/page.tsx
src/components/CourierNav.tsx
src/components/CouriersClient.tsx
src/components/DashboardClient.tsx
src/components/GlobalChat.tsx
src/components/OrderDetail.tsx
src/components/PWABanner.tsx
src/components/RouteEditor.tsx
```

**Новый:**

```
src/components/theme/AppThemeRow.tsx    переключатель в панели профиля (авто/светлая/тёмная)
```

⚠️ Если вы ещё не раскатали пакет 3 — `src/components/theme/ThemeScript.tsx`
и `theme.ts` лежат там, они нужны и здесь.

### Что осталось намеренно жёстким

Цвета Telegram (`#2AABEE`) и SMS (`#34C759`) в кнопках связи — это брендовые цвета
сервисов, они не должны меняться. Всё остальное переведено на переменные.

### Проверка

- Профиль → «Тема оформления» → три положения: Авто / ☀ / ☾.
- «Авто» убирает сохранённый выбор и следует за системой.
- Пройти по `/manager`, `/dashboard`, `/couriers`, `/courier/routes`, `/courier/profile`,
  `/admin`, `/login` в тёмной теме — особенно посмотреть бейджи статусов
  и блоки комментариев (заказчик — красноватый, оператор — зелёный).
- Карта в дашборде: Яндекс отдаёт светлые тайлы, для тёмной темы они приглушены
  фильтром `brightness(0.86)`. Если не понравится — уберите правило `.ymaps-*`
  в конце `globals.css`.

---

## Часть 2. Матрица магазинов

### Логика доступа

Одно правило, три флага:

| Кто | Что видит |
|---|---|
| `isSuperAdmin` | все магазины, матрицу игнорирует, управляет ей |
| `accessRestricted = false` | все магазины (как сейчас) |
| `accessRestricted = true` | только отмеченные галочками |

Роли не трогаются: `OPERATOR`, `COURIER`, `ADMIN` остаются как есть. «Глобальный
админ» — это флаг `isSuperAdmin`, «локальный» — `ADMIN` без него. Так enum не растёт,
а правило остаётся одно.

Как вы и просили: **сначала видят все**. У всех существующих пользователей
`accessRestricted = false`, поэтому после раскатки ничего не меняется. Ограничения
включаются по одному человеку кнопкой «видит всё / по галочкам» — можно раскатывать
доступы постепенно, не останавливая работу.

### Файлы

```
prisma/schema.patch.prisma              что добавить в схему (с комментариями)
prisma/backfill-shops.ts                разовый скрипт заполнения
src/lib/access.ts                       getViewer, visibleShopIds, shopFilter, canEditShop
src/app/api/admin/access/route.ts       GET матрицы + PATCH галочек
src/components/admin/AccessMatrix.tsx   таблица с чекбоксами
src/app/(app)/admin/access/page.tsx     страница /admin/access
PATCH-admin-link.md                     ссылка на матрицу со страницы /admin
```

### Порядок применения

```bash
# 1. Внести правки в prisma/schema.prisma по prisma/schema.patch.prisma
#    (новые модели целиком + добавления полей в User / Courier / Order)

npx prisma migrate dev --name shops_access_exchange
npx prisma generate

# 2. Бэкфилл: компания, магазины, привязка заказов
npx tsx prisma/backfill-shops.ts

# 3. Проверить в БД, что заказов без shopId не осталось:
#    SELECT count(*) FROM "Order" WHERE "shopId" IS NULL;

# 4. Только теперь — вторая миграция со сменой уникального ключа
#    crmId @unique → @@unique([shopId, crmId])
npx prisma migrate dev --name order_unique_per_shop
```

Две миграции вместо одной здесь не перестраховка: если сменить `@unique` до бэкфилла,
у всех заказов `shopId = NULL`, а `@@unique([shopId, crmId])` с NULL в Postgres
не работает как ограничение — дубли пролезут.

### Что даёт `src/lib/access.ts`

Подключение к существующим роутам — одна строка:

```ts
// было
const orders = await prisma.order.findMany({ where });

// стало
const viewer = await getViewer(req);
const orders = await prisma.order.findMany({
  where: { ...where, ...(await shopFilter(viewer!)) },
});
```

`shopFilter` возвращает пустой объект, если ограничений нет, — то есть на текущих
данных запрос не меняется вообще. Это позволяет подключать роуты по одному
и проверять каждый, а не переписывать тридцать штук разом.

**Роуты, которые нужно обернуть** (в порядке важности):

1. `GET /api/orders` — основной список
2. `GET /api/manager/routes` — маршруты
3. `GET/PATCH /api/orders/[id]` — карточка
4. `GET /api/manager/notifications` — табло изменений
5. `GET /api/couriers` — курьеры (когда появится `Courier.companyId`)

---

## Часть 3. Задел на биржу и коннекторы

В патч схемы уже включены поля, чтобы не делать третью миграцию:

**Биржа** (`Order`): `onExchange`, `exchangeAt`, `exchangeById`, `takenByCourierId`,
`takenAt` + индекс `[onExchange, exchangeAt]`. По вашим ответам: цена берётся из заказа,
таймаута нет, заказ висит до снятия вручную, брать могут только курьеры
с `canTakeExchange` (привязанная Консоль), а видят — все.

Единственное, что важно не забыть при реализации, — атомарный захват:

```ts
// правильно: гонка исключена на уровне БД
const res = await prisma.order.updateMany({
  where: { id, onExchange: true, takenByCourierId: null },
  data: { takenByCourierId: courierId, takenAt: new Date(), onExchange: false },
});
if (res.count === 0) return { error: "Заказ уже забрали" };
```

Через `findUnique` + `update` два курьера, нажавшие одновременно, получат заказ оба.

**Компании и коннекторы**: модели `Company` (со слагом и `inviteToken` под
`adelivo.ru/{slug}`), `Shop` (с `crmKey`, `crmUrl`, координатами склада) и `Connector`
(с `fieldMap` / `statusMap` под маппинг полей). Архитектура перехода
`lib/crm.ts` → три коннектора расписана в `CONNECTORS.md`.

---

## Сводка изменений схемы

| Модель | Изменение | Ломающее |
|---|---|---|
| `Company` | новая | нет |
| `Shop` | новая | нет |
| `ShopAccess` | новая | нет |
| `Connector` | новая | нет |
| `User` | +`isSuperAdmin`, `companyId`, `accessRestricted`, `shopAccess`, `courierId` | нет |
| `Courier` | +`canTakeExchange`, `companyId` | нет |
| `Order` | +`shopId`, 5 полей биржи, 2 индекса | нет |
| `Order` | `crmId @unique` → `@@unique([shopId, crmId])` | **да, после бэкфилла** |

Все новые поля с дефолтами или опциональные, поэтому первая миграция проходит
на живой базе без простоя.
