// src/app/api/auth/link-courier/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
// Импортируем отправку почты (если у вас для курьеров другая функция, просто переименуйте)
import { sendRequestAlert } from "@/lib/mailer";

const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const tgChat  = process.env.TELEGRAM_CHAT_ID;

// Фоновая функция для ТГ (3 попытки, таймаут 4 секунды на каждую)
async function sendTelegramBackground(text: string) {
  if (!tgToken || !tgChat) return;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChat,
          text,
          parse_mode: "Markdown",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        console.log(`[LinkCourier] Telegram success (attempt ${attempt})`);
        return; // Успешно отправлено — выходим
      } else {
        const err = await res.text();
        console.error(`[LinkCourier] Telegram error (attempt ${attempt}):`, err);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error(`[LinkCourier] Telegram fetch failed (attempt ${attempt}):`, e.message);
    }

    // Ждем 2 секунды перед следующей попыткой
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSession(); 
    if (!user || user.role !== "COURIER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { firstName, lastName, phone } = await request.json();

    if (!firstName || !lastName || !phone) {
      return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const standardFullName = `${cleanLastName} ${cleanFirstName}`;

    const nameParts = [cleanFirstName, cleanLastName].filter(Boolean);

    let courier = await prisma.courier.findFirst({
      where: {
        AND: nameParts.map(part => ({
          fullName: { contains: part, mode: 'insensitive' }
        }))
      }
    });

    // 🔥 Флаг — найден профиль или создан новый
    const profileFound = !!courier;

    if (courier) {
      // Профиль найден в БД — обновляем
      courier = await prisma.courier.update({
        where: { id: courier.id },
        data: {
          phone,
          email: user.email,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          fullName: standardFullName,
          isActive: true,
        }
      });

      console.log(`[LinkCourier] Профиль найден и обновлён: ${standardFullName} (ID ${courier.id})`);
    } else {
      // Профиль не найден — создаём.
      //
      // Раньше КАЖДЫЙ новый курьер уезжал в RetailCRM Банча: ключ брался
      // из общих переменных окружения независимо от того, к какой компании
      // человек относится. Теперь в CRM отправляем только тогда, когда
      // у компании курьера есть хотя бы один магазин на RetailCRM.
      // У остальных курьер живёт только у нас, а в CRM попадёт позже,
      // когда компания подключит магазин.
      const account = await prisma.user.findUnique({
        where: { id: user.id },
        select: { companyId: true },
      });

      const crmShop = account?.companyId
        ? await prisma.shop.findFirst({
            where: { companyId: account.companyId, connectorType: "RETAILCRM" },
            select: { id: true },
          })
        : null;

      const crmUrl = process.env.RETAILCRM_API_URL;
      const crmKey = process.env.RETAILCRM_API_KEY;
      const pushToCrm = !!crmShop && !!crmUrl && !!crmKey;

      let crmCourierId: number | null = null;

      if (pushToCrm) {
      const courierPayload = {
        firstName: cleanFirstName,
        lastName: cleanLastName,
        active: true,
        email: user.email ? user.email : undefined,
        phone: { number: phone.replace(/[^\d+]/g, "") },
      };

      const formData = new URLSearchParams();
      formData.append("apiKey", crmKey);
      formData.append("courier", JSON.stringify(courierPayload));

      const crmRes = await fetch(`${crmUrl}/api/v5/reference/couriers/create`, {
        method: "POST",
        body: formData,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const crmData = await crmRes.json();
      console.log("[LinkCourier] CRM ответ:", JSON.stringify(crmData, null, 2));

      if (!crmData.success) {
        throw new Error(`Ошибка CRM: ${crmData.errorMsg} ` + JSON.stringify(crmData.errors || {}));
      }

      crmCourierId = crmData.id;
      }

      // Идентификатор без CRM берём из отрицательного диапазона: CRM выдаёт
      // положительные, поэтому столкнуться они не могут никогда.
      if (crmCourierId === null) {
        const min = await prisma.courier.aggregate({ _min: { id: true } });
        const current = min._min.id ?? 0;
        crmCourierId = current > 0 ? -1 : current - 1;
      }

      courier = await prisma.courier.create({
        data: {
          id: crmCourierId,
          companyId: account?.companyId ?? null,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          fullName: standardFullName,
          phone,
          email: user.email,
          isActive: true,
          // Профиль создаётся сам при регистрации, поэтому на линию
          // курьер выходит только после подтверждения в админке
          isApproved: false,
        }
      });

      console.log(
        `[LinkCourier] Новый профиль создан: ${standardFullName} (ID ${courier.id})` +
        (pushToCrm ? " — отправлен в RetailCRM" : " — только в нашей системе, магазина на RetailCRM у компании нет")
      );
    }

    const eventType = profileFound ? "Курьер авторизовался" : "Новый курьер зарегистрировался";
    const dateStr = new Date().toLocaleString("ru", { timeZone: "Europe/Moscow" });

    // 1. Отправляем дубль на почту (синхронно, без Markdown)
    try {
      const emailText = [
        `[СОБЫТИЕ] ${eventType}`,
        `Имя: ${standardFullName}`,
        `Телефон: ${phone}`,
        `Email: ${user.email ?? "—"}`,
        `ID: ${courier.id}`,
        `Профиль: ${profileFound ? "найден в базе" : "создан новый"}`,
        `Дата: ${dateStr}`
      ].join("\n");
      
      await sendRequestAlert(emailText);
    } catch (e) {
      console.error("[LinkCourier] Email error:", e);
    }

    // 2. Telegram уведомление (В ФОНЕ)
    if (tgToken && tgChat) {
      const msg = [
        `🚴 *${eventType}*`,
        ``,
        `👤 *Имя:* ${standardFullName}`,
        `📞 *Телефон:* ${phone}`,
        `📧 *Email:* ${user.email ?? "—"}`,
        `🆔 *ID:* ${courier.id}`,
        `🔍 *Профиль:* ${profileFound ? "найден в базе" : "создан новый"}`,
        `📅 *Дата:* ${dateStr}`,
      ].join("\n");

      // Запускаем без await, чтобы не тормозить ответ клиенту
      sendTelegramBackground(msg).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      courierId: courier.id,
      // 🔥 Возвращаем клиенту — найден профиль или создан новый
      profileFound,
      message: profileFound
        ? `Профиль найден: ${standardFullName}`
        : `Новый профиль создан: ${standardFullName}`,
    });

  } catch (error: any) {
    console.error("Link courier error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}