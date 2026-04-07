// src/app/api/webhooks/telegram/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CATALOG_ID || "b1gcr5m4ptniag2qpsqm";
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SOURCE_CHAT_ID = process.env.TELEGRAM_SOURCE_CHAT_ID; // Группа-донор
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;   // Твой личный чат

// 💡 НАСТРОЙКА ПАПОК: Укажи здесь ID папок, которые нужно слушать. 
// Сейчас бот будет обрабатывать сообщения из папок 2 и 3. 
// Если захочешь только 3, сделай так: ["3"]
const ALLOWED_THREAD_IDS = ["2", "3"];

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: { "OpenAI-Project": YANDEX_CLOUD_FOLDER },
});

// Функция отправки сообщений (теперь шлет ТОЛЬКО тебе)
async function sendNotificationToAdmin(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID, // Строго твой чат
      text: text,
    }),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 💡 БЛОК ЛОГИРОВАНИЯ: Поможет нам всё проверить
    console.log("\n👀 ПРИШЛО НОВОЕ СООБЩЕНИЕ ИЗ ТЕЛЕГРАМА:");
    console.log("👉 Chat ID (Группа):", body.message?.chat?.id);
    console.log("👉 Thread ID (Папка):", body.message?.message_thread_id || "Главная тема");
    console.log("👉 Текст сообщения:", body.message?.text);
    console.log("------------------------------------\n");

    if (!body.message || !body.message.text) {
      return NextResponse.json({ status: "ignored" });
    }

    const chatId = String(body.message.chat.id);
    const text = body.message.text;
    
    // Получаем ID папки (темы)
    const messageThreadId = body.message.message_thread_id 
      ? String(body.message.message_thread_id) 
      : null;

    // 1. БЛОКИРОВКА: Читаем только из разрешенной группы-донора
    if (SOURCE_CHAT_ID && chatId !== SOURCE_CHAT_ID) {
      console.log("❌ Игнорируем: сообщение не из группы-донора.");
      return NextResponse.json({ status: "ignored_wrong_chat" });
    }

    // 1.1 БЛОКИРОВКА ПО ПАПКЕ: Проверяем, есть ли ID папки в нашем списке разрешенных
    if (messageThreadId && !ALLOWED_THREAD_IDS.includes(messageThreadId)) {
      console.log(`❌ Игнорируем: папка ${messageThreadId} не входит в список разрешенных ${ALLOWED_THREAD_IDS}.`);
      return NextResponse.json({ status: "ignored_wrong_topic" });
    }

    // 2. Отсеиваем спам (если нет цифр или слов "заказ", "#")
    if (!/\d{5,}/.test(text) && !text.toLowerCase().includes("заказ") && !text.toLowerCase().includes("#")) {
      console.log("❌ Игнорируем: похоже на спам или обычное общение.");
      return NextResponse.json({ status: "ignored" });
    }

    // 3. ПАРСИМ ТЕКСТ ЧЕРЕЗ ИИ
    console.log("🤖 Отправляем текст в Яндекс ИИ...");
    const systemPrompt = `Ты — AI-ассистент логиста. Вытащи из текста сообщения данные для доставки.
    Внимательно найди:
    - Номер заказа (без символа #, только буквы и цифры).
    - Имя получателя.
    - Телефон (очисти от скобок и пробелов, оставь только цифры и +, например +79036881005).
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

    // Если нет номера заказа и адреса — ИИ не понял, что это
    if (!orderId && !address) {
      return NextResponse.json({ status: "not_enough_data" });
    }
    
    // Если нет телефона и имени — нечего обновлять
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

    // Если заказ не нашли в базе — уведомляем тебя в личку
    if (!targetOrder) {
      console.log("⚠️ Заказ не найден в базе.");
      await sendNotificationToAdmin(`⚠️ В группе-доноре пришел заказ, но я не нашел его в нашей базе.\nИскал по: ${orderId ? `#${orderId}` : `адресу "${address?.substring(0, 20)}..."`}`);
      return NextResponse.json({ status: "order_not_found" });
    }

    // 5. ОБНОВЛЯЕМ БАЗУ ДАННЫХ
    // 💡 Здесь мы склеиваем Имя и Телефон, чтобы сохранить их вместе
    const updatedPhone = name ? `${name} ${phone || ""}`.trim() : phone;
    console.log(`💾 Обновляем базу... Пишем контакт: ${updatedPhone}`);
    
    await prisma.order.update({
      where: { id: targetOrder.id },
      data: { recipientPhone: updatedPhone }
    });

    // 6. ОТПРАВЛЯЕМ УСПЕШНЫЙ ОТЧЕТ ТЕБЕ В ЛИЧКУ
    const foundByText = orderId ? `#${orderId}` : `(найден по адресу)`;
    await sendNotificationToAdmin(`✅ Шпион-бот обновил заказ ${foundByText}\n👤 Имя: ${name || "Не указано"}\n📞 Телефон: ${phone || "Не указан"}\n📍 Адрес: ${targetOrder.address}`);

    console.log("🎉 Успешно завершено!");
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Ошибка Telegram Webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}