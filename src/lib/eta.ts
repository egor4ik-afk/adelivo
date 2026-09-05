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


/**
 * Сколько закладываем на дорогу от последней точки до базы, если посчитать
 * не из чего. Плановое значение обычно уже учтено в estimatedReturnTime —
 * это число нужно только когда времени возврата вовсе не было.
 */
const RETURN_LEG_FALLBACK_MIN = 30;

/**
 * Держит время возврата на базу в актуальном состоянии.
 *
 * Раньше сдвиг применялся только если значение уже стояло в базе, и
 * комментарий это честно фиксировал: «ТОЛЬКО если значение уже есть».
 * Маршруты, созданные без расчёта возврата, так и оставались с пустым
 * полем навсегда — снаружи, и в карточке дашборда, и у курьера, время
 * возврата просто не показывалось.
 *
 * Теперь два случая:
 *   — время есть: двигаем его на ту же разницу, что и остальные точки.
 *     Так сохраняется заложенный в плане участок «последняя точка → база».
 *   — времени нет: считаем от самой поздней ETA среди оставшихся точек
 *     плюс дорога до базы. Когда все точки закрыты, берём последнюю
 *     закрытую: маршрут окончен, и возврат считается от неё.
 */
async function syncReturnTime(
  routeId: string,
  currentReturnTime: string | null,
  diffMinutes: number
) {
  if (currentReturnTime) {
    const mins = parseTimeStr(currentReturnTime);
    if (mins === null) return;
    await prisma.route.update({
      where: { id: routeId },
      data: { estimatedReturnTime: formatTimeStr(mins + diffMinutes) },
    });
    return;
  }

  // Значения не было — собираем его с нуля по текущим ETA маршрута
  const points = await prisma.order.findMany({
    where: { routeId },
    select: { eta: true, status: true, routeOrder: true },
    orderBy: { routeOrder: "asc" },
  });

  const open = points.filter((p) => !["DELIVERED", "RETURNED", "CANCELLED"].includes(p.status));
  const source = open.length > 0 ? open : points;

  const etas = source
    .map((p) => parseTimeStr(p.eta))
    .filter((m): m is number => m !== null);

  if (etas.length === 0) return;

  await prisma.route.update({
    where: { id: routeId },
    data: { estimatedReturnTime: formatTimeStr(Math.max(...etas) + RETURN_LEG_FALLBACK_MIN) },
  });
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

    let diffMinutesToShift = 0;
    let updatedCurrentEta = order.eta;

    if (newStatus === "IN_DELIVERY") {
      if (explicitEta && explicitEta !== "—") {
        const newMins = parseTimeStr(explicitEta);
        if (newMins !== null) {
          diffMinutesToShift = newMins - oldEtaMins;
          updatedCurrentEta = explicitEta;
        }
      } else {
        if (order.routeOrder === 1) {
          let baseMins = getCurrentMskMinutes(); // Фактическое время выезда
          if (order.pickedUpAt) {
              const d = new Date(order.pickedUpAt);
              baseMins = ((d.getUTCHours() + 3) % 24) * 60 + d.getUTCMinutes();
          }

          let diffCalculated = false;

          // 🔥 НОВАЯ ЛОГИКА: Отталкиваемся от точного поля plannedDepartureTime
          if (order.route?.plannedDepartureTime) {
            const plannedMins = parseTimeStr(order.route.plannedDepartureTime);
            if (plannedMins !== null) {
              let rawDiff = baseMins - plannedMins;
              
              // На случай, если выезд был ночью (переход через 00:00)
              if (rawDiff > 720) rawDiff -= 1440;
              if (rawDiff < -720) rawDiff += 1440;

              // Сдвигаем на разницу между фактом и планом
              diffMinutesToShift = rawDiff; 
              const newEtaMins = oldEtaMins + diffMinutesToShift;
              updatedCurrentEta = formatTimeStr(newEtaMins);
              diffCalculated = true;
            }
          }

          // 🔥 СТАРЫЙ ФОЛБЭК: Если поля нет или оно кривое - парсим регулярками как раньше
          if (!diffCalculated) {
            let driveTimeMins = 30; 
            const adviceSource = order.route?.departureAdvice || order.opComment || "";
            const matches = [...adviceSource.matchAll(/Выехать до\s*(\d{1,2}):(\d{2}).*?к\s*(\d{1,2}):(\d{2})/g)];
            
            if (matches.length > 0) {
              const lastMatch = matches[matches.length - 1];
              const depMins = parseInt(lastMatch[1], 10) * 60 + parseInt(lastMatch[2], 10);
              const arrMins = parseInt(lastMatch[3], 10) * 60 + parseInt(lastMatch[4], 10);
              driveTimeMins = ((arrMins - depMins) + 1440) % 1440;
            }
            
            const newEtaMins = baseMins + driveTimeMins;
            diffMinutesToShift = newEtaMins - oldEtaMins;
            updatedCurrentEta = formatTimeStr(newEtaMins);
          }

        } else {
          return; 
        }
      }

      if (diffMinutesToShift !== 0) {
        await prisma.order.update({ where: { id: orderId }, data: { eta: updatedCurrentEta } });
      }

    } else if (newStatus === "DELIVERED") {
      let deliveredMins = getCurrentMskMinutes();

      if (explicitEta && explicitEta !== "—") {
          const parsed = parseTimeStr(explicitEta);
          if (parsed !== null) deliveredMins = parsed;
      }

      diffMinutesToShift = deliveredMins - oldEtaMins;

      // Фактическое время закрытия точки записываем ей же.
      //
      // Раньше eta доставленного заказа оставалась плановой: в базе висело
      // «должен был быть в 14:20», хотя привезли в 13:50. Разницу мы считали
      // и раздавали дальше по маршруту, а сама точка врала.
      if (diffMinutesToShift !== 0) {
        updatedCurrentEta = formatTimeStr(deliveredMins);
        await prisma.order.update({
          where: { id: orderId },
          data: { eta: updatedCurrentEta },
        });
      }
    }

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

      await syncReturnTime(order.routeId, order.route?.estimatedReturnTime ?? null, diffMinutesToShift);
    }
  } catch (err) { 
    console.error(`[ETA UNIVERSAL] Ошибка:`, err); 
  }
}