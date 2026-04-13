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
          let driveTimeMins = 30; 
          const adviceSource = order.route?.departureAdvice || order.opComment || "";
          const matches = [...adviceSource.matchAll(/Выехать до\s*(\d{1,2}):(\d{2}).*?к\s*(\d{1,2}):(\d{2})/g)];
          
          if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            const depMins = parseInt(lastMatch[1], 10) * 60 + parseInt(lastMatch[2], 10);
            const arrMins = parseInt(lastMatch[3], 10) * 60 + parseInt(lastMatch[4], 10);
            driveTimeMins = ((arrMins - depMins) + 1440) % 1440;
          }
          
          let baseMins = getCurrentMskMinutes();
          if (order.pickedUpAt) {
              const d = new Date(order.pickedUpAt);
              baseMins = ((d.getUTCHours() + 3) % 24) * 60 + d.getUTCMinutes();
          }

          const newEtaMins = baseMins + driveTimeMins;
          diffMinutesToShift = newEtaMins - oldEtaMins;
          updatedCurrentEta = formatTimeStr(newEtaMins);
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

      // 🔥 ЛОГИКА ДЛЯ МАРШРУТА: Сдвигаем ТОЛЬКО если значение уже есть.
      // Никаких прикидок и выдуманных +30 минут здесь больше нет.
      if (order.route?.estimatedReturnTime) {
        const routeMins = parseTimeStr(order.route.estimatedReturnTime);
        if (routeMins !== null) {
          await prisma.route.update({
            where: { id: order.routeId },
            data: { 
              estimatedReturnTime: formatTimeStr(routeMins + diffMinutesToShift) 
            }
          });
        }
      }
    }
  } catch (err) { console.error(`[ETA UNIVERSAL] Ошибка:`, err); }
}