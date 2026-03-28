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
export async function createKonsolTask(contractorId: string, baseAmount: number, dateStart: string, dateEnd: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/platform/tasks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: `Курьерские услуги ${dateStart} - ${dateEnd}`,
      since_date: dateStart.split(".").reverse().join("-"),
      upto_date:  dateEnd.split(".").reverse().join("-"),
      contractor_ids: [contractorId],
      transit_to_submitted_after_creation: true,
      duties: [{ title: "Базовый выход", price: baseAmount, quantity: 1, measure: "шт" }],
    }),
  });
  const data = await res.json();
  return data?.id ?? data?.data?.id ?? null;
}

// ✅ Получение задания
export async function getKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/${taskId}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

// ✅ Добавление услуги в задание
export async function addKonsolDuty(taskId: string, title: string, price: number, quantity: number) {
  const res = await fetch(`${KONSOL_BUS}/workflow/duties`, {
    method: "POST",
    headers,
    body: JSON.stringify({ task_id: taskId, title, price, quantity, measure: "шт" }),
  });
  return res.ok;
}

// ✅ Принятие задания
export async function acceptKonsolTask(taskId: string) {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/accept`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [taskId] }),
  });
  return res.ok;
}

// ✅ Финализация задания (создание акта)
export async function finalizeKonsolTask(taskId: string): Promise<string | null> {
  const res = await fetch(`${KONSOL_BUS}/workflow/tasks/finalize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [taskId] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
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
  return res.ok;
}

// ✅ Автооплата акта
export async function autopayKonsolAct(actId: string) {
  const res = await fetch(`${KONSOL_BUS}/acts/autopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: [actId] }),
  });
  return res.ok;
}