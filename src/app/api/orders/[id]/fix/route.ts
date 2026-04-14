// src/app/api/orders/[id]/fix/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/crm";
import OpenAI from "openai";

const YANDEX_CLOUD_FOLDER = process.env.YANDEX_CATALOG_ID || "b1gcr5m4ptniag2qpsqm";
const YANDEX_CLOUD_API_KEY = process.env.YANDEX_LLM_API_KEY;
const YANDEX_CLOUD_MODEL = "aliceai-llm/latest";

const client = new OpenAI({
  apiKey: YANDEX_CLOUD_API_KEY,
  baseURL: "https://ai.api.cloud.yandex.net/v1",
  defaultHeaders: {
    "OpenAI-Project": YANDEX_CLOUD_FOLDER,
  },
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { mode, manualAddress } = body;

    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── РЕЖИМ 1: ПРЕДПРОСМОТР AI (Только генерация и запрос координат, БЕЗ сохранения в БД) ──
    if (mode === "ai_preview") {
      const prompt = `У нас есть грязный адрес доставки: "${order.address}". 
      Комментарий клиента: "${order.comment || ''}". 
      Город: Москва или МО (если в комментарии не указан другой, например Химки).
      
      Твоя задача — исправить адрес и отделить детали доставки от гео-координат.
      
      ПРАВИЛА:
      1. В поле "cleanAddress" должен быть ТОЛЬКО чистый гео-адрес: Страна, Город, Улица, Дом, Корпус, Строение. Не пиши сюда квартиры, этажи и домофоны! (Пример: "Россия, г. Москва, ул. Островитянова, д. 5к1").
      2. Всю остальную информацию (подъезд, этаж, квартира, домофон, код двери) собери в одну строку и помести в поле "deliveryDetails". Если таких деталей нет, оставь пустую строку "".
      3. Различай "к" как корпус и "кв" как квартиру.
      
      ВЕРНИ ОТВЕТ СТРОГО В ФОРМАТЕ JSON. Пример:
      {
        "cleanAddress": "Россия, г. Москва, ул. Ленина, д. 1",
        "deliveryDetails": "кв. 15, подъезд 3, этаж 5, домофон 15В"
      }`;

      const response = await client.chat.completions.create({
        model: `gpt://${YANDEX_CLOUD_FOLDER}/${YANDEX_CLOUD_MODEL}`,
        messages: [
          { role: "system", content: "Ты строгий картографический редактор. Твой ответ содержит только валидный JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 300,
      });

      const rawContent = response.choices[0]?.message?.content?.trim() || "{}";
      
      // Пытаемся распарсить JSON. Если Yandex LLM вернул markdown обертку (```json ... ```), вырезаем её.
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : "{}";
      
      let parsedData = { cleanAddress: order.address, deliveryDetails: "" };
      try {
          parsedData = JSON.parse(jsonString);
      } catch (e) {
          console.error("[AI Fix] Ошибка парсинга JSON:", rawContent);
      }

      const suggestedAddress = parsedData.cleanAddress || order.address || "";
      const suggestedDetails = parsedData.deliveryDetails || "";
      
      // Геокодируем ЧИСТУЮ строку
      const geo = await geocodeAddress(suggestedAddress);
      
      // Возвращаем на фронт и чистый адрес, и детали, чтобы фронтенд мог склеить их в комментарий
      return NextResponse.json({ 
          suggestedAddress, 
          suggestedDetails,
          geo 
      });
    }

    // ── РЕЖИМ 2: РУЧНОЙ ПРЕДПРОСМОТР НА КАРТЕ (БЕЗ сохранения в БД) ──
    if (mode === "manual_preview") {
      const geo = await geocodeAddress(manualAddress);
      return NextResponse.json({ geo });
    }

    // ── РЕЖИМ 3: ФИНАЛЬНОЕ СОХРАНЕНИЕ В БАЗУ ──
    if (mode === "commit") {
      const geo = await geocodeAddress(manualAddress);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { address: manualAddress, geocoded: true };

      if (!geo) {
        updateData.isInvalid = true;
        updateData.invalidReason = "Адрес не найден";
      } else if (!geo.isExact) {
        updateData.lat = geo.lat;
        updateData.lng = geo.lng;
        updateData.isInvalid = true;
        updateData.invalidReason = `Неточный геокод: ${geo.precision}`;
      } else {
        updateData.lat = geo.lat;
        updateData.lng = geo.lng;
        updateData.isInvalid = false;
        updateData.invalidReason = null;
      }

      const updated = await prisma.order.update({ where: { id }, data: updateData });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}