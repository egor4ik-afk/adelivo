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

// 1. Поиск подрядчика (СЗ) по телефону
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

// 2. Создание задания с БАЗОВОЙ услугой (500 руб + 6% = 530 руб)
export async function createKonsolTask(contractorId: string, baseAmount: number, dateStart: string, dateEnd: string) {
  try {
    const res = await api.post(`/workflow/platform/tasks`, {
      title: `Курьерские услуги ${dateStart} - ${dateEnd}`,
      since_date: dateStart.split('.').reverse().join('-'), // YYYY-MM-DD
      upto_date: dateEnd.split('.').reverse().join('-'),
      contractor_ids: [contractorId],
      transit_to_submitted_after_creation: true, // Сразу предлагаем курьеру
      duties: [
        {
          title: "Базовая услуга (Выход)",
          price: baseAmount,
          quantity: 1,
          measure: "шт"
        }
      ]
    });
    return res.data?.id || res.data?.data?.id; 
  } catch (e: any) {
    console.error("[Konsol] Ошибка создания задания:", e.response?.data || e.message);
    return null;
  }
}

// 3. ДОБАВЛЕНИЕ дополнительных услуг (доставленных заказов) к заданию
export async function addKonsolDuty(taskId: string, title: string, price: number, quantity: number) {
  try {
    await api.post(`/workflow/duties`, {
      task_id: taskId,
      title: title,
      price: price,
      quantity: quantity,
      measure: "шт"
    });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка добавления услуги к заданию ${taskId}:`, e.response?.data || e.message);
    return false;
  }
}

// 4. Завершение задания со стороны компании (Выполнено / accepted)
export async function acceptKonsolTask(taskId: string) {
  try {
    await api.post(`/workflow/tasks/accept`, { ids: [taskId] });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка принятия задания ${taskId}:`, e.response?.data || e.message);
    return false; 
  }
}

// 5. Формирование акта из выполненного задания (finalize)
export async function finalizeKonsolTask(taskId: string) {
  try {
    const res = await api.post(`/workflow/tasks/finalize`, { ids: [taskId] });
    const acts = res.data?.acts_ids || res.data?.data?.acts_ids || [];
    return acts.length > 0 ? acts[0] : null;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка формирования акта для ${taskId}:`, e.response?.data || e.message);
    return null;
  }
}

// 6. Подписание акта нашей компанией
export async function signKonsolAct(actId: string) {
  try {
    await api.post(`/acts/sign`, { ids: [actId] });
    return true;
  } catch (e: any) {
    console.error(`[Konsol] Ошибка подписания акта ${actId}:`, e.response?.data || e.message);
    return false;
  }
}