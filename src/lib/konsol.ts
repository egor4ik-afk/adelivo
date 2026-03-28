// src/lib/konsol.ts

const KONSOL_V2  = "https://api.konsol.pro/v2";        // исполнители, приглашения
const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";  // задания, акты, workflow
const API_KEY    = process.env.KONSOL_API_KEY;
const SCENARIO_ID = process.env.KONSOL_SCENARIO_ID;

const headers = {
  "Authorization": `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// ✅ Поиск исполнителя по телефону
export async function findContractorByPhone(phone: string): Promise<string | null> {
  const cleanPhone = "+" + phone.replace(/[^\d]/g, "");
  const res = await fetch(`${KONSOL_V2}/contractors?phone=${cleanPhone}`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data ?? [];
  return list.length > 0 ? String(list[0].id) : null;
}

// ✅ Приглашение нового исполнителя
export async function inviteContractor(name: string, phone: string): Promise<{ id: number; onboarding_url: string | null } | null> {
  const res = await fetch(`${KONSOL_V2}/contractor_invites`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      phone: "+" + phone.replace(/[^\d]/g, ""),
      scenario_id: SCENARIO_ID,
      skip_notification: false,
    }),
  });
  if (!res.ok) {
    console.error("[Konsol] Ошибка приглашения:", await res.text());
    return null;
  }
  return res.json();
}

// ✅ Создание задания
export async function createKonsolTask(contractorId: string | number, baseAmount: number, dateStart: string, dateEnd: string) {
  const payload = {
    title: `Курьерская доставка для цветочного магазина "Банч"`,
    since_date: dateStart.split(".").reverse().join("-"),
    upto_date: dateEnd.split(".").reverse().join("-"),
    contractor_ids: [Number(contractorId)], 
    transit_to_submitted_after_creation: true,
    duties: [
      { 
        description: "Доставка цветов по городу Москве",
        price: baseAmount, 
        quantity: 1, 
        measure: "шт" 
      }
    ],
  };

  const res = await fetch(`${KONSOL_BUS}/workflow/platform/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[Konsol] Ошибка создания задания:", JSON.stringify(data, null, 2));
    throw new Error(data.message || JSON.stringify(data));
  }

  // 🔥 ИСПРАВЛЕНИЕ ТУТ: Добавили data?.task_id
  return data?.task_id ?? data?.id ?? data?.data?.id ?? null;
}

// ✅ Получение задания
export async function getKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/${taskId}`, { 
    headers,
    cache: "no-store" // 🔥 Обязательно! Чтобы Next.js каждый раз реально ходил в Консоль
  });
  
  if (!res.ok) {
    console.error(`[Konsol] Ошибка получения задания ${taskId}:`, await res.text());
    return null;
  }
  
  return res.json();
}

// ✅ Обновление задания (заменяем цену на итоговую и сдвигаем даты на сегодня)
export async function updateKonsolTask(taskId: string, newPrice: number) {
  // 1. Получаем задание, чтобы узнать внутренний ID самой услуги (duty)
  const task = await getKonsolTask(taskId);
  if (!task || !task.duties || task.duties.length === 0) {
    throw new Error(`[updateTask] Не найдено задание или услуги для ${taskId}`);
  }
  const dutyId = task.duties[0].id;

  // 2. Генерируем даты (сегодня и конец недели), чтобы Консоль не ругалась
  const today = new Date();
  const ddStart = String(today.getDate()).padStart(2, '0');
  const mmStart = String(today.getMonth() + 1).padStart(2, '0');
  const yyyyStart = today.getFullYear();
  const todayStr = `${yyyyStart}-${mmStart}-${ddStart}`;

  const endOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  endOfWeek.setDate(today.getDate() + daysUntilSunday);
  
  const ddEnd = String(endOfWeek.getDate()).padStart(2, '0');
  const mmEnd = String(endOfWeek.getMonth() + 1).padStart(2, '0');
  const yyyyEnd = endOfWeek.getFullYear();
  const endOfWeekStr = `${yyyyEnd}-${mmEnd}-${ddEnd}`;

  // 3. Отправляем PATCH-запрос: меняем дату и ставим НОВУЮ общую цену
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/${taskId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      since_date: todayStr,
      upto_date: endOfWeekStr,
      duties: [
        {
          id: dutyId,
          price: newPrice,
          quantity: 1
        }
      ]
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[updateTask] ${data.message || JSON.stringify(data)}`);
  }
  return true;
}

// ✅ Принятие задания
export async function acceptKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/accept`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [taskId] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[acceptTask] ${data.message || JSON.stringify(data)}`);
  }
  return true;
}

// ✅ Финализация задания (создание акта)
export async function finalizeKonsolTask(taskId: string): Promise<string | null> {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [taskId] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[finalizeTask] ${data.message || JSON.stringify(data)}`);
  }
  const acts = data?.acts_ids ?? data?.data?.acts_ids ?? [];
  return acts.length > 0 ? acts[0] : null;
}

// ✅ Подписание акта
export async function signKonsolAct(actId: string) {
  const res = await fetch(`${KONSOL_BUS}/acts/sign`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [actId] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[signAct] ${data.message || JSON.stringify(data)}`);
  }
  return true;
}

// ✅ Автооплата акта
export async function autopayKonsolAct(actId: string) {
  const res = await fetch(`${KONSOL_BUS}/acts/autopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [actId] }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`[autopayAct] ${data.message || JSON.stringify(data)}`);
  }
  return true;
}