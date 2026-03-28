// src/app/api/admin/sync-future/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { upsertOrder, type CrmOrder } from "@/lib/crm";
import { prisma } from "@/lib/prisma";

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY = process.env.RETAILCRM_API_KEY;

function toYMD(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  if (!CRM_URL || !CRM_KEY) {
    return NextResponse.json({ error: "Не настроены ключи CRM" }, { status: 500 });
  }

  try {
    const todayStr = toYMD(new Date());
    
    let currentPage = 1;
    let totalPages = 1;
    let addedOrdersCount = 0;
    const addedOrdersInfo: any[] = []; // 🔥 Массив для сбора информации

    do {
      const res = await axios.get(`${CRM_URL}/api/v5/orders`, {
        params: { 
          apiKey: CRM_KEY, 
          "filter[deliveryDateFrom]": todayStr,
          "filter[extendedStatus][]": "new",
          limit: 100,
          page: currentPage
        },
        timeout: 15000,
      });

      const orders: CrmOrder[] = res.data?.orders || [];
      totalPages = res.data?.pagination?.totalPageCount || 1;

      for (const order of orders) {
        const existing = await prisma.order.findUnique({
          where: { crmId: String(order.id) }
        });

        if (!existing) {
          await upsertOrder(order);
          addedOrdersCount++;
          
          // 🔥 Записываем инфо, чтобы показать вам на экране
          addedOrdersInfo.push({
            id: order.externalId ?? order.number ?? order.id,
            date: order.delivery?.date ?? "Без даты",
            address: order.delivery?.address?.text ?? "Без адреса",
            time: order.delivery?.time ?? "Без времени"
          });
        }
      }

      currentPage++;
    } while (currentPage <= totalPages);

    // 🔥 Теперь скрипт вернет подробный красивый список!
    return NextResponse.json({ 
      success: true, 
      message: `Синхронизация завершена. Найдено и добавлено будущих НОВЫХ заказов: ${addedOrdersCount}`,
      addedOrders: addedOrdersInfo
    });

  } catch (error: any) {
    console.error("[Sync Future] Ошибка:", error?.response?.data ?? error.message);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}