import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

// Читаем .env вручную без dotenv
const env = readFileSync('.env', 'utf-8');
env.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) process.env[k.trim()] = v.join('=').trim();
});

const p = new PrismaClient();

webpush.setVapidDetails(
  process.env.VAPID_MAILTO || 'mailto:sat.open.world@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const subs = await p.pushSubscription.findMany();
console.log('Подписок:', subs.length);

for (const sub of subs) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({
        title: 'FlowerOps — тест',
        body: 'Новый заказ #test-001 · с 20:00 до 22:00 · Тверская 7',
        data: { type: 'order.new', orderId: 'test-1' }
      })
    );
    console.log('✓ Отправлено');
  } catch (e) {
    console.log('✗ Ошибка:', e.statusCode, e.body ?? e.message);
  }
}

await p.$disconnect();
