// src/lib/konsol.ts
import axios from "axios";

const KONSOL_URL = process.env.KONSOL_API_URL || "https://api.konsol.pro/v2"; 
const API_KEY = process.env.KONSOL_API_KEY;

const api = axios.create({
  baseURL: KONSOL_URL,
  headers: {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
});

export async function findContractorByPhone(phone: string) {
  try {
    const cleanPhone = phone.replace(/[^\d]/g, ""); 
    const res = await api.get(`/contractors`, { params: { phone: cleanPhone } });
    const contractors = res.data?.data || res.data || [];
    return contractors.length > 0 ? contractors[0].id : null;
  } catch (e: any) {
    console.error("[Konsol] Ошибка поиска:", e.response?.data || e.message);
    return null;
  }
}

export async function createKonsolTask(contractorId: string, baseAmount: number, dateStart: string, dateEnd: string) {
  try {
    const res = await api.post(`/workflow/platform/tasks`, {
      title: `Курьерские услуги ${dateStart} - ${dateEnd}`,
      since_date: dateStart.split('.').reverse().join('-'),
      upto_date: dateEnd.split('.').reverse().join('-'),
      contractor_ids: [contractorId],
      transit_to_submitted_after_creation: true,
      duties: [
        { title: "Базовый выход", price: baseAmount, quantity: 1, measure: "шт" }
      ]
    });
    return res.data?.id || res.data?.data?.id; 
  } catch (e: any) {
    console.error("[Konsol] Ошибка создания задания:", e.response?.data || e.message);
    return null;
  }
}

// 🔥 Получение задания (для проверки статуса)
export async function getKonsolTask(taskId: string) {
  try {
    const res = await api.get(`/workflow/tasks/${taskId}`);
    return res.data; 
  } catch (e: any) {
    console.error(`[Konsol] Ошибка получения задания ${taskId}:`, e.response?.data || e.message);
    return null;
  }
}

export async function addKonsolDuty(taskId: string, title: string, price: number, quantity: number) {
  try {
    await api.post(`/workflow/duties`, {
      task_id: taskId, title, price, quantity, measure: "шт"
    });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка добавления услуги:`, e.response?.data || e.message);
    return false;
  }
}

export async function acceptKonsolTask(taskId: string) {
  try {
    await api.post(`/workflow/tasks/accept`, { ids: [taskId] });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка принятия задания:`, e.response?.data || e.message);
    return false; 
  }
}

export async function finalizeKonsolTask(taskId: string) {
  try {
    const res = await api.post(`/workflow/tasks/finalize`, { ids: [taskId] });
    const acts = res.data?.acts_ids || res.data?.data?.acts_ids || [];
    return acts.length > 0 ? acts[0] : null;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка формирования акта:`, e.response?.data || e.message);
    return null;
  }
}

export async function signKonsolAct(actId: string) {
  try {
    await api.post(`/acts/sign`, { ids: [actId] });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка подписания акта:`, e.response?.data || e.message);
    return false;
  }
}