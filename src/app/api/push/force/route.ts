import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Настраиваем ключи
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_MAILTO || 'admin@event-wave.ru'}`,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    // 2. Ищем именно твоего юзера по ID из сообщения
    const userId = "cmnh87ivn0064sn3qjajkrmw7";
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pushSubscriptions: true }
    });

    if (!user || user.pushSubscriptions.length === 0) {
      return NextResponse.json({ error: "У этого юзера нет подписок в базе!" });
    }

    const payload = JSON.stringify({
      title: "🔥 БОЕВОЙ ТЕСТ ПУША!",
      body: "Если ты это видишь, значит ключи, БД и Service Worker работают идеально.",
      url: "/manager",
      tag: `force-test-${Date.now()}`
    });

    let results = [];

    // 3. Отправляем пуш на все его Android/Chrome устройства
    for (const sub of user.pushSubscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, 
          payload
        );
        results.push({ endpoint: sub.endpoint.substring(0, 30) + '...', status: "✅ ДОСТАВЛЕНО" });
      } catch (e: any) {
        results.push({ 
          endpoint: sub.endpoint.substring(0, 30) + '...', 
          status: "❌ ОШИБКА", 
          code: e.statusCode,
          details: e.body || e.message 
        });
      }
    }

    return NextResponse.json({ results });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}