// src/app/api/webhooks/telegram/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CATALOG_ID || "b1gcr5m4ptniag2qpsqm";
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOURCE_CHAT_ID = process.env.TELEGRAM_SOURCE_CHAT_ID; // Группа-донор
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;   // Твой личный чат

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: { "OpenAI-Project": YANDEX_CLOUD_FOLDER },
});

// Функция отправки отчетов тебе
async function sendNotificationToAdmin(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      text: text,
    }),
  });
}

// Умная маска для телефона
function normalizePhone(rawPhone: string | null): string | null {
  if (!rawPhone) return null;
  
  let digits = rawPhone.replace(/\D/g, "");
  
  // Отрезаем лишний код страны, если ИИ прислал 11 или 12 цифр
  if ((digits.startsWith("7") || digits.startsWith("8")) && digits.length === 11) {
    digits = digits.slice(1);
  } else if ((digits.startsWith("77") || digits.startsWith("78")) && digits.length === 12) {
    digits = digits.slice(2);
  }

  // Красивый формат для российских номеров
  if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }

  return rawPhone.startsWith("+") ? rawPhone : `+${digits}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.message) {
      return NextResponse.json({ status: "ignored_no_message" });
    }

    // Читаем и обычный текст, и подписи к пересланным фото
    const text = body.message.text || body.message.caption;
    const chatId = String(body.message.chat.id);

    console.log("\n👀 ПРИШЛО СООБЩЕНИЕ ИЗ ТЕЛЕГРАМА:");
    console.log(`👉 Chat ID: [${chatId}]`);
    console.log(`👉 Текст: ${text ? text.substring(0, 50) + "..." : "Без текста"}`);
    console.log("------------------------------------\n");

    if (!text) {
      return NextResponse.json({ status: "ignored_no_text" });
    }

    // 1. СТРОГАЯ БЛОКИРОВКА: Читаем только из ОДНОГО чата
    if (SOURCE_CHAT_ID && chatId !== SOURCE_CHAT_ID) {
      console.log(`❌ Игнорируем чат [${chatId}]. Ждем сообщения только из [${SOURCE_CHAT_ID}]`);
      return NextResponse.json({ status: "ignored_wrong_chat" });
    }

    // 2. Фильтр от спама (ищем цифры, слово заказ или решетку)
    if (!/\d{5,}/.test(text) && !text.toLowerCase().includes("заказ") && !text.toLowerCase().includes("#")) {
      console.log("❌ Игнорируем: похоже на обычное общение.");
      return NextResponse.json({ status: "ignored_spam" });
    }

    // 3. ПАРСИМ ТЕКСТ ЧЕРЕЗ ИИ
    console.log("🤖 Отправляем текст в Яндекс ИИ...");
    const systemPrompt = `Ты — AI-ассистент логиста. Вытащи из текста сообщения данные для доставки.
    Внимательно найди:
    - Номер заказа (без символа #, только буквы и цифры).
    - Имя получателя.
    - Телефон (просто верни все цифры как есть, ничего не добавляй от себя).
    - Адрес доставки.

    Верни СТРОГО JSON без лишних слов:
    {
      "orderId": "string | null",
      "name": "string | null",
      "phone": "string | null",
      "address": "string | null"
    }`;

    const response = await client.chat.completions.create({
      model: `gpt://${YANDEX_CLOUD_FOLDER}/${YANDEX_CLOUD_MODEL}`,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.1,
    });

    let content = response.choices[0]?.message?.content?.trim() || "{}";
    if (content.startsWith("```")) content = content.replace(/^```json/g, "").replace(/^```/g, "").replace(/```$/g, "").trim();
    
    const parsedData = JSON.parse(content);
    console.log("🧠 ИИ вернул данные:", parsedData);
    const { orderId, name, phone, address } = parsedData;

    if (!orderId && !address) {
      return NextResponse.json({ status: "not_enough_data" });
    }
    
    if (!phone && !name) {
      return NextResponse.json({ status: "no_contacts" });
    }

    // 4. ИЩЕМ ЗАКАЗ В БД
    let targetOrder = null;

    if (orderId) {
      targetOrder = await prisma.order.findFirst({
        where: {
          OR: [
            { crmId: orderId },
            { externalId: orderId },
            { crmId: `#${orderId}` },
            { externalId: `#${orderId}` }
          ]
        }
      });
    } else if (address) {
      const shortAddress = address.substring(0, 15).trim();
      targetOrder = await prisma.order.findFirst({
        where: {
          status: { in: ["NEW", "ASSIGNED"] },
          address: { contains: shortAddress, mode: "insensitive" }
        }
      });
    }

    if (!targetOrder) {
      console.log("⚠️ Заказ не найден в базе.");
      await sendNotificationToAdmin(`⚠️ Пришел контакт для заказа, но я не нашел его в базе.\nИскал по: ${orderId ? `#${orderId}` : `адресу "${address?.substring(0, 20)}..."`}`);
      return NextResponse.json({ status: "order_not_found" });
    }

    // 5. ОБНОВЛЯЕМ БАЗУ ДАННЫХ
    const formattedPhone = normalizePhone(phone);
    console.log(`💾 Пишем в базу [Заказ ${targetOrder.crmId}] -> Имя: ${name || "нет"}, Телефон: ${formattedPhone || "нет"}`);
    
    await prisma.order.update({
      where: { id: targetOrder.id },
      data: { 
        recipientPhone: formattedPhone || targetOrder.recipientPhone,
        name: name || targetOrder.name 
      }
    });

    // 6. ОТПРАВЛЯЕМ УСПЕШНЫЙ ОТЧЕТ АДМИНУ
    const foundByText = orderId ? `#${orderId}` : `(найден по адресу)`;
    await sendNotificationToAdmin(`✅ Шпион-бот обновил заказ ${foundByText}\n👤 Имя: ${name || "—"}\n📞 Тел: ${formattedPhone || "—"}\n📍 Адрес: ${targetOrder.address}`);

    console.log("🎉 Успешно завершено!");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Ошибка Telegram Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}