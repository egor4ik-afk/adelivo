// src/app/api/auth/link-courier/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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
      // Профиль не найден — создаём в CRM и у нас
      const crmUrl = process.env.RETAILCRM_API_URL;
      const crmKey = process.env.RETAILCRM_API_KEY;

      if (!crmUrl || !crmKey) {
        throw new Error("Не настроены ключи RetailCRM");
      }

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

      courier = await prisma.courier.create({
        data: {
          id: crmData.id,
          firstName: cleanFirstName,
          lastName: cleanLastName,
          fullName: standardFullName,
          phone,
          email: user.email,
          isActive: true,
        }
      });

      console.log(`[LinkCourier] Новый профиль создан: ${standardFullName} (ID ${courier.id})`);
    }

    // Telegram уведомление
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat  = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const msg = [
        `🚴 *${profileFound ? "Курьер авторизовался" : "Новый курьер зарегистрировался"}*`,
        ``,
        `👤 *Имя:* ${standardFullName}`,
        `📞 *Телефон:* ${phone}`,
        `📧 *Email:* ${user.email ?? "—"}`,
        `🆔 *ID:* ${courier.id}`,
        `🔍 *Профиль:* ${profileFound ? "найден в базе" : "создан новый"}`,
        `📅 *Дата:* ${new Date().toLocaleString("ru", { timeZone: "Europe/Moscow" })}`,
      ].join("\n");

      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tgChat, text: msg, parse_mode: "Markdown" }),
      }).catch(e => console.error("[TG] Ошибка уведомления:", e));
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