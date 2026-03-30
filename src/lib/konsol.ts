// src/lib/konsol.ts

const KONSOL_V2  = "https://api.konsol.pro/v2";        // исполнители, приглашения
const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";  // задания, акты, workflow
const API_KEY    = process.env.KONSOL_API_KEY;
const SCENARIO_ID = process.env.KONSOL_SCENARIO_ID;

const headers = {
  "Authorization": `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// 🔥 ЕДИНАЯ ФУНКЦИЯ ДЛЯ МОСКОВСКОГО ВРЕМЕНИ
// Всегда возвращает YYYY-MM-DD по Москве, независимо от времени сервера
function getMoscowDateStr(): string {
  const moscowDate = new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" });
  const d = new Date(moscowDate);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  // dateStart и dateEnd обычно приходят в DD.MM.YYYY, переворачиваем в YYYY-MM-DD
  const payload = {
    title: `Курьерская доставка для цветочного магазина "Банч"`,
    since_date: dateStart.split(".").reverse().join("-"),
    upto_date: dateEnd.split(".").reverse().join("-"),
    contractor_ids: [Number(contractorId)], 
    transit_to_submitted_after_creation: true,
    duties: [
      { 
        template_id: 89135, // 🔥 Используем твой шаблон услуги
        category_id: 1,     // 🔥 Категория из твоего справочника
        description: "Доставка цветов по городу Москве",
        price: baseAmount, 
        quantity: 1
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

  return data?.task_id ?? data?.id ?? data?.data?.id ?? null;
}

// ✅ Получение задания
export async function getKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/${taskId}`, { 
    headers,
    cache: "no-store" 
  });
  
  if (!res.ok) {
    console.error(`[Konsol] Ошибка получения задания ${taskId}:`, await res.text());
    return null;
  }
  
  return res.json();
}

// ✅ Обновление задания (добавляем новые услуги по шаблонам, удаляем старые)
export async function updateKonsolTask(taskId: string | number, newDuties: any[]) {
  const task = await getKonsolTask(String(taskId));
  if (!task) throw new Error(`[updateTask] Задание ${taskId} не найдено`);

  const oldDuties = task.duties || task.data?.duties || [];

  // 1. ДОБАВЛЯЕМ НОВЫЕ УСЛУГИ
  let addedCount = 0;
  for (const duty of newDuties) {
    const resAdd = await fetch(`${KONSOL_BUS}/workflow/duties`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        task_id: Number(taskId),
        template_id: duty.template_id, 
        measure: "Штука",              
        price: duty.price,            
        quantity: duty.quantity        
      }),
    });
    
    if (!resAdd.ok) {
      const err = await resAdd.json().catch(() => ({}));
      throw new Error(`[updateTask ADD] ${JSON.stringify(err)}`);
    }
    addedCount++;
  }

  // 2. УДАЛЯЕМ СТАРЫЕ УСЛУГИ
  if (addedCount > 0) {
    for (const old of oldDuties) {
      if (old.id) {
        await fetch(`${KONSOL_BUS}/workflow/duties/${old.id}`, {
          method: "DELETE",
          headers
        });
      }
    }
  }

  // 3. ОБНОВЛЯЕМ ДАТЫ ЗАДАНИЯ ПО МОСКВЕ
  const moscowYMD = getMoscowDateStr();

  await fetch(`${KONSOL_BUS}/workflow/tasks/${taskId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      since_date: moscowYMD,
      upto_date: moscowYMD
    }),
  });

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
// ✅ Финализация задания (создание акта)
export async function finalizeKonsolTask(taskId: string | number): Promise<string | null> {
  const moscowYMD = getMoscowDateStr();

  let res = await fetch(`${KONSOL_BUS}/workflow/tasks/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      ids: [Number(taskId)],
      act_date: moscowYMD,
      date: moscowYMD
    }),
  });
  
  let data = await res.json();

  const errStr = JSON.stringify(data);

  // 🔥 УМНЫЙ ОБХОД: Ловим ВСЕ вариации ошибок из-за часовых поясов!
  const isTimezoneError = 
    errStr.includes("в будущем") || 
    errStr.includes("текущей датой") || 
    errStr.includes("Дата акта должна быть");

  if (!res.ok && isTimezoneError) {
    console.log(`[Konsol] Консоль ругается на даты: ${errStr}. Откатываемся на UTC...`);
    
    // Берем серверную дату (UTC), которая для Консоли сейчас является "сегодня"
    const utcYMD = new Date().toISOString().split('T')[0];
    
    res = await fetch(`${KONSOL_BUS}/workflow/tasks/finalize`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
        ids: [Number(taskId)],
        act_date: utcYMD,
        date: utcYMD
      }),
    });
    
    data = await res.json();
  }

  if (!res.ok) throw new Error(`[finalizeTask] ${data.message || JSON.stringify(data)}`);
  
  const acts = data?.acts_ids ?? data?.data?.acts_ids ?? [];
  return acts.length > 0 ? String(acts[0]) : null;
}

export async function signKonsolAct(actId: string | number) {
  console.log(`[signAct] Вызов для акта ${actId}, тип: ${typeof actId}`);
  console.log(`[signAct] Payload:`, JSON.stringify({ ids: [Number(actId)] }));
 
  const res = await fetch(`${KONSOL_V2}/acts/sign`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [Number(actId)] }),
  });
 
  const text = await res.text();
  console.log(`[signAct] Статус: ${res.status}`);
  console.log(`[signAct] Тело ответа: ${text}`);
 
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.message || text; } catch {}
    throw new Error(`[signAct] ${res.status}: ${msg}`);
  }
  return true;
}
 
// ✅ Автооплата акта (Внимание: тут KONSOL_V2)
export async function autopayKonsolAct(actId: string | number) {
  const res = await fetch(`${KONSOL_V2}/acts/autopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [Number(actId)] }),
  });
 
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.message || text; } catch {}
    throw new Error(`[autopayAct] ${res.status}: ${msg}`);
  }
  return true;
}
