// src/lib/eta.ts
import { prisma } from "./prisma";

export function getCurrentMskMinutes() {
  const mskDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return mskDate.getHours() * 60 + mskDate.getMinutes();
}

export function parseTimeStr(timeStr: string | null | undefined) {
  if (!timeStr || timeStr === "—") return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function formatTimeStr(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440; 
  const h = Math.floor(normalized / 60).toString().padStart(2, '0');
  const m = (normalized % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export async function applyUniversalEtaShift(orderId: string, newStatus: string, explicitEta?: string | null) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { route: true }
    });

    if (!order || !order.eta || !order.routeId || !order.routeOrder) return;

    const oldEtaMins = parseTimeStr(order.eta);
    if (oldEtaMins === null) return;

    const currentMins = getCurrentMskMinutes();
    let diffMinutesToShift = 0;
    let updatedCurrentEta = order.eta;

    if (newStatus === "IN_DELIVERY") {
      if (explicitEta && explicitEta !== "—") {
        // 1. Точное время с карты курьера (из Яндекса)
        const newMins = parseTimeStr(explicitEta);
        if (newMins !== null) {
          diffMinutesToShift = newMins - oldEtaMins;
          updatedCurrentEta = explicitEta;
        }
      } else {
        // 2. Нажали "В пути" вслепую (без Яндекса)
        if (order.routeOrder === 1) {
          // 🔥 ЭТО ПЕРВАЯ ТОЧКА! Считаем, на сколько курьер опоздал с выездом
          let driveTimeMins = 30; 
          const adviceSource = order.route?.departureAdvice || order.opComment || "";
          const matches = [...adviceSource.matchAll(/Выехать до\s*(\d{1,2}):(\d{2}).*?к\s*(\d{1,2}):(\d{2})/g)];
          
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const depMins = parseInt(lastMatch[1], 10) * 60 + parseInt(lastMatch[2], 10);
            const arrMins = parseInt(lastMatch[3], 10) * 60 + parseInt(lastMatch[4], 10);
            driveTimeMins = ((arrMins - depMins) + 1440) % 1440;
          }
          
          const newEtaMins = currentMins + driveTimeMins;
          diffMinutesToShift = newEtaMins - oldEtaMins;
          updatedCurrentEta = formatTimeStr(newEtaMins);
        } else {
          // 🔥 ЭТО 2, 3 ИЛИ 4 ТОЧКА! Их ETA УЖЕ ИДЕАЛЬНО РАССЧИТАНО!
          // Ничего не сдвигаем, просто выходим из функции.
          console.log(`[ETA UNIVERSAL] Точка ${order.routeOrder} переведена 'В пути'. ETA не меняем.`);
          return;
        }
      }

      // Перезаписываем ETA для ТЕКУЩЕЙ точки
      if (diffMinutesToShift !== 0) {
        await prisma.order.update({
          where: { id: orderId },
          data: { eta: updatedCurrentEta }
        });
      }

    } else if (newStatus === "DELIVERED") {
      // 3. ДОСТАВЛЕН: смотрим, на сколько опоздали/опередили План
      diffMinutesToShift = currentMins - oldEtaMins;
    }

    // 4. СДВИГАЕМ ВСЕ ОСТАЛЬНЫЕ ТОЧКИ В МАРШРУТЕ
    if (diffMinutesToShift !== 0) {
      const futureOrders = await prisma.order.findMany({
        where: { 
          routeId: order.routeId, 
          routeOrder: { gt: order.routeOrder }, 
          status: { in: ["NEW", "ASSIGNED", "IN_DELIVERY"] } 
        }
      });

      for (const o of futureOrders) {
        const oMins = parseTimeStr(o.eta);
        if (oMins !== null) {
          await prisma.order.update({ 
            where: { id: o.id }, 
            data: { eta: formatTimeStr(oMins + diffMinutesToShift) } 
          });
        }
      }
      console.log(`[ETA UNIVERSAL] Сдвинуто ${futureOrders.length} точек на ${diffMinutesToShift} мин. (Заказ ${orderId}, Статус ${newStatus})`);
    }

  } catch (err) {
    console.error(`[ETA UNIVERSAL] Ошибка:`, err);
  }
}