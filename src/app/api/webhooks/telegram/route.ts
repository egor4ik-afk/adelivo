import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import { upsertOrder } from "@/lib/crm";

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
    await axios.post(url, { chat_id: chatId, text }, { timeout: 5000 });
  } catch (err: any) {
    // Улучшили логирование ошибки ТГ, чтобы видеть точную причину
    console.error("❌ Ошибка отправки уведомления админу в ТГ:", JSON.stringify(err?.response?.data || err.message));
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

// 🔥 ИСПРАВЛЕНО: Теперь ищем в CRM сразу по двум вариантам (с # и без)
async function fetchAndUpsertFromCrm(orderId: string) {
  if (!CRM_URL || !CRM_KEY) return null;

  try {
    console.log(`🔍 [CRM Fetch] Идем искать заказ ${orderId} напрямую в RetailCRM...`);
    
    // 1. Ищем по externalId (передаем вариант без решетки и с решеткой)
    const paramsExt = new URLSearchParams({ apiKey: CRM_KEY });
    paramsExt.append("filter[externalIds][]", orderId);
    paramsExt.append("filter[externalIds][]", `#${orderId}`);
    
    let res = await axios.get(`${CRM_URL}/api/v5/orders?${paramsExt.toString()}`, { timeout: 7000 });
    let orders = res.data?.orders || [];

    // 2. Если не нашли, ищем по внутреннему ID/номеру (также оба варианта)
    if (orders.length === 0) {
      const paramsNum = new URLSearchParams({ apiKey: CRM_KEY });
      paramsNum.append("filter[numbers][]", orderId);
      paramsNum.append("filter[numbers][]", `#${orderId}`);
      
      res = await axios.get(`${CRM_URL}/api/v5/orders?${paramsNum.toString()}`, { timeout: 7000 });
      orders = res.data?.orders || [];
    }

    if (orders.length > 0) {
      console.log(`✅ [CRM Fetch] Нашли заказ ${orderId} в RetailCRM! Создаем локально...`);
      const newOrder = await upsertOrder(orders[0]); 
      return newOrder;
    }
    console.log(`❌ [CRM Fetch] Заказ ${orderId} не найден в RetailCRM даже с решеткой.`);
  } catch (e: any) {
    console.error("❌ [CRM Fetch] Ошибка API RetailCRM:", JSON.stringify(e?.response?.data || e.message));
  }
  return null;
}

// 🔥 ИСПРАВЛЕНО: Увеличили количество попыток до 5, пауза 2.5 сек (максимум ~10 сек ожидания)
async function findOrderLocal(orderId: string | null, address: string | null, retries = 5, delayMs = 2500) {
  for (let i = 0; i < retries; i++) {
    if (orderId) {
      const order = await prisma.order.findFirst({
        where: {
          OR: [
            { crmId: orderId }, { externalId: orderId },
            { crmId: `#${orderId}` }, { externalId: `#${orderId}` },
          ],
        },
      });
      if (order) return order;
    } 
    else if (address) {
      const cleanAddr = address
        .replace(/россия,?/i, "")
        .replace(/москва,?/i, "")
        .replace(/г\.?\s*москва,?/i, "")
        .trim();

      const shortAddress = cleanAddr.substring(0, 18).trim();

      if (shortAddress.length > 4) {
        const order = await prisma.order.findFirst({
          where: {
            status: { in: ["NEW", "ASSIGNED"] },
            address: { contains: shortAddress, mode: "insensitive" },
          },
        });
        if (order) return order;
      }
    }

    if (i < retries - 1 && orderId) {
      console.log(`⏳ Заказ ${orderId} не найден локально. Попытка ${i + 1}/${retries}, ждем ${delayMs / 1000} сек...`);
      await new Promise(res => setTimeout(res, delayMs));
    } else if (!orderId) {
      break; 
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

    if (!isAllowed) return NextResponse.json({ status: "ignored_wrong_chat" });
    if (!/Номер заказа/i.test(text)) return NextResponse.json({ status: "ignored_not_order" });

    const { orderId, name, phone, address } = parseOrderText(text);
    console.log("📦 Распарсили:", { orderId, name, phone, address });

    if (!orderId && !address) return NextResponse.json({ status: "not_enough_data" });
    if (!phone && !name) return NextResponse.json({ status: "no_contacts" });

    // 1. Ищем локально с увеличенным интервалом ожидания
    let targetOrder = await findOrderLocal(orderId, address);

    // 2. ФОЛБЭК: Идем в RetailCRM, ища как чистый ID, так и ID с решеткой
    if (!targetOrder && orderId) {
      targetOrder = await fetchAndUpsertFromCrm(orderId);
    }

    if (!targetOrder) {
      console.log("⚠️ Заказ не найден ни в БД, ни в CRM.");
      await sendNotificationToAdmin(
        `⚠️ Пришел контакт, но заказ не найден ни у нас, ни в CRM:\nИскал по ID: ${orderId || "отсутствует"} или адресу.`
      );
      return NextResponse.json({ status: "order_not_found" });
    }

    // 3. Обновляем контакты
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

    console.log("🎉 Успешно завершено!");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Ошибка Telegram Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}