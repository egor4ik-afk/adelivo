import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import { upsertOrder } from "@/lib/crm"; // 🔥 Импортируем вашу функцию создания заказа

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOURCE_CHAT_ID = process.env.TELEGRAM_SOURCE_CHAT_ID;
const ADMIN_CHAT_ID = process.env.TELEGRAM_SPAM_ID;

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

const TARGET_SUPERGROUP_ID = "-1003732491171";
const ALLOWED_TOPICS = [4, 5];

async function sendNotificationToAdmin(text: string) {
  const token = TELEGRAM_BOT_TOKEN?.replace(/\s+/g, "")?.replace(/^bot/i, "");
  const chatId = ADMIN_CHAT_ID?.replace(/\s+/g, "");

  if (!token || !chatId) {
    console.log("⚠️ Пропуск отправки: нет токена или ID чата");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ ТГ ответил ошибкой:", errorData.description || response.statusText);
    }
  } catch (err: any) {
    console.error("❌ Ошибка сети в ТГ (Админ):", err.message);
  }
}

function normalizePhone(rawPhone: string | null): string | null {
  if (!rawPhone) return null;
  let digits = rawPhone.replace(/\D/g, "");
  if ((digits.startsWith("7") || digits.startsWith("8")) && digits.length === 11) {
    digits = digits.slice(1);
  } else if ((digits.startsWith("77") || digits.startsWith("78")) && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  return rawPhone.startsWith("+") ? rawPhone : `+${digits}`;
}

function parseOrderText(text: string) {
  const get = (pattern: RegExp) => text.match(pattern)?.[1]?.trim() || null;
  const orderId = get(/Номер заказа:\s*#?(\S+)/i);
  const name    = get(/Имя получателя:\s*(.+)/i);
  const phone   = get(/Телефон получателя:\s*(.+)/i);
  const address = get(/Адрес:\s*(.+)/i);
  return { orderId, name, phone, address };
}

// 🔥 НОВАЯ ФУНКЦИЯ: Прямой запрос в RetailCRM
async function fetchAndUpsertFromCrm(orderId: string) {
  if (!CRM_URL || !CRM_KEY) return null;

  try {
    console.log(`🔍 [CRM Fetch] Идем искать заказ ${orderId} напрямую в RetailCRM...`);
    
    // 1. Пробуем найти по externalId
    const paramsExt = new URLSearchParams({ apiKey: CRM_KEY });
    paramsExt.append("filter[externalIds][]", orderId);
    
    let res = await axios.get(`${CRM_URL}/api/v5/orders?${paramsExt.toString()}`, { timeout: 7000 });
    let orders = res.data?.orders || [];

    // 2. Если не нашли, пробуем по внутреннему номеру
    if (orders.length === 0) {
      const paramsNum = new URLSearchParams({ apiKey: CRM_KEY });
      paramsNum.append("filter[numbers][]", orderId);
      res = await axios.get(`${CRM_URL}/api/v5/orders?${paramsNum.toString()}`, { timeout: 7000 });
      orders = res.data?.orders || [];
    }

    if (orders.length > 0) {
      console.log(`✅ [CRM Fetch] Нашли заказ ${orderId} в RetailCRM! Сохраняем в нашу БД...`);
      // Прогоняем заказ через вашу стандартную функцию сохранения
      const newOrder = await upsertOrder(orders[0]); 
      return newOrder;
    } else {
       console.log(`❌ [CRM Fetch] Заказ ${orderId} не найден даже в CRM.`);
    }
  } catch (e: any) {
    console.error("❌ [CRM Fetch] Ошибка при запросе в CRM:", e?.response?.data || e.message);
  }
  return null;
}

// Поиск заказа в локальной БД с паузами
async function findOrderWithRetry(orderId: string | null, address: string | null, retries = 3, delayMs = 2500) {
  for (let i = 0; i < retries; i++) {
    let order = null;

    if (orderId) {
      order = await prisma.order.findFirst({
        where: {
          OR: [
            { crmId: orderId },
            { externalId: orderId },
            { crmId: `#${orderId}` },
            { externalId: `#${orderId}` },
          ],
        },
      });
    }

    if (!order && address) {
      const shortAddress = address.substring(0, 15).trim();
      order = await prisma.order.findFirst({
        where: {
          status: { in: ["NEW", "ASSIGNED"] },
          address: { contains: shortAddress, mode: "insensitive" },
        },
      });
    }

    if (order) return order;

    if (i < retries - 1) {
      console.log(`⏳ Заказ ${orderId || ''} пока не найден в БД. Ждем ${delayMs / 1000} сек (попытка ${i + 1}/${retries})...`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
  
  return null;
}


export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.message) return NextResponse.json({ status: "ignored_no_message" });

    const text = body.message.text || body.message.caption;
    const chatId = String(body.message.chat.id);
    const messageThreadId = body.message.message_thread_id; 

    console.log("\n👀 ПРИШЛО СООБЩЕНИЕ ИЗ ТЕЛЕГРАМА:");
    console.log(`👉 Chat ID: [${chatId}]`);
    console.log(`👉 Topic ID (Ветка): [${messageThreadId || 'Главная тема'}]`);
    console.log(`👉 Текст: ${text ? text.substring(0, 50) + "..." : "Без текста"}`);
    console.log("------------------------------------\n");

    if (!text) return NextResponse.json({ status: "ignored_no_text" });

    let isAllowed = false;
    if (SOURCE_CHAT_ID && chatId === SOURCE_CHAT_ID) {
      isAllowed = true;
    } else if (chatId === TARGET_SUPERGROUP_ID) {
      if (messageThreadId && ALLOWED_TOPICS.includes(messageThreadId)) {
        isAllowed = true;
      } else {
        console.log(`❌ Игнорируем топик [${messageThreadId}] в группе [${chatId}]`);
      }
    }

    if (!isAllowed) {
        return NextResponse.json({ status: "ignored_wrong_chat" });
    }

    if (!/Номер заказа/i.test(text)) {
      return NextResponse.json({ status: "ignored_not_order" });
    }

    const { orderId, name, phone, address } = parseOrderText(text);
    console.log("📦 Распарсили:", { orderId, name, phone, address });

    if (!orderId && !address) return NextResponse.json({ status: "not_enough_data" });
    if (!phone && !name) return NextResponse.json({ status: "no_contacts" });

    // 1. Ищем локально с ожиданием
    let targetOrder = await findOrderWithRetry(orderId, address);

    // 2. 🔥 ФОЛБЭК: Если локально не нашли, дергаем CRM напрямую!
    if (!targetOrder && orderId) {
      targetOrder = await fetchAndUpsertFromCrm(orderId);
    }

    // 3. Если и в CRM не нашли — сдаемся
    if (!targetOrder) {
      console.log("⚠️ Заказ так и не появился в базе и не найден в CRM.");
      await sendNotificationToAdmin(
        `⚠️ Пришел контакт для заказа, но я не нашел его в базе и в CRM.\nИскал по: ${orderId ? `#${orderId}` : `адресу "${address?.substring(0, 20)}..."`}`
      );
      return NextResponse.json({ status: "order_not_found" });
    }

    // 4. Обновляем данные получателя
    const formattedPhone = normalizePhone(phone);
    console.log(`💾 Обновляем [${targetOrder.crmId}] -> Имя: ${name}, Тел: ${formattedPhone}`);

    await prisma.order.update({
      where: { id: targetOrder.id },
      data: {
        recipientPhone: formattedPhone || targetOrder.recipientPhone,
        name: name || targetOrder.name,
      },
    });

    const foundByText = orderId ? `#${orderId}` : `(найден по адресу)`;
    await sendNotificationToAdmin(
      `✅ Обновлен заказ ${foundByText}\n👤 Имя: ${name || "—"}\n📞 Тел: ${formattedPhone || "—"}\n📍 Адрес: ${targetOrder.address}`
    );

    console.log("🎉 Успешно!");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Ошибка Telegram Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}