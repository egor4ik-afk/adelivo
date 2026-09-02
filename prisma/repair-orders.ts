// prisma/repair-orders.ts
// Чинит заказы и курьеров, оставшихся без привязки.
//
// Запуск: npx tsx prisma/repair-orders.ts
//
// Зачем: доступ считается по shopId, а поллинг RetailCRM его не проставлял —
// каждый приехавший из CRM заказ оказывался «ничьим» и пропадал из выдачи
// у всех, включая администратора. Патч crm.ts чинит это на будущее,
// а скрипт — то, что уже накопилось.
//
// Идемпотентен, можно гонять повторно.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Восстановление привязок ──\n");

  const shops = await prisma.shop.findMany({ select: { id: true, slug: true, companyId: true } });
  if (shops.length === 0) {
    console.log("Магазинов нет — сначала запустите prisma/backfill-shops.ts");
    return;
  }
  const bySlug = new Map(shops.map((s) => [s.slug, s]));

  // 1. Заказы: shopId по строковому shop
  let linked = 0;
  for (const [slug, shop] of bySlug) {
    const res = await prisma.order.updateMany({
      where: { shopId: null, shop: slug },
      data: { shopId: shop.id },
    });
    if (res.count) console.log(`  ${slug}: ${res.count} заказов`);
    linked += res.count;
  }

  // 2. Заказы с неизвестным или пустым shop — в первый магазин.
  //    Оставлять их без привязки нельзя: они не видны никому.
  const orphanOrders = await prisma.order.count({ where: { shopId: null } });
  if (orphanOrders > 0) {
    const fallback = bySlug.get("bunch") ?? shops[0];
    const res = await prisma.order.updateMany({
      where: { shopId: null },
      data: { shopId: fallback.id },
    });
    console.log(`  без магазина → ${fallback.slug}: ${res.count} заказов`);
    linked += res.count;
  }
  console.log(`Заказов привязано: ${linked}`);

  // 3. Курьеры без компании: берём её из магазинов заказов, которые он возил.
  //    Так курьер попадает именно в ту компанию, на которую работает,
  //    а не в первую попавшуюся.
  const orphanCouriers = await prisma.courier.findMany({
    where: { companyId: null },
    select: { id: true, fullName: true },
  });

  let fixed = 0;
  for (const c of orphanCouriers) {
    const order = await prisma.order.findFirst({
      where: { courierId: c.id, shopId: { not: null } },
      select: { shopId: true },
      orderBy: { createdAt: "desc" },
    });

    const shop = order?.shopId ? shops.find((s) => s.id === order.shopId) : null;
    const companyId = shop?.companyId ?? shops[0].companyId;
    if (!companyId) continue;

    await prisma.courier.update({ where: { id: c.id }, data: { companyId } });
    fixed++;
  }
  console.log(`Курьеров привязано к компании: ${fixed} из ${orphanCouriers.length}`);

  // 4. Проверка
  const left = await prisma.order.count({ where: { shopId: null } });
  const leftC = await prisma.courier.count({ where: { companyId: null } });
  console.log("\n── Проверка ──");
  console.log(`Заказов без магазина: ${left} (должно быть 0)`);
  console.log(`Курьеров без компании: ${leftC} (должно быть 0)`);

  // 5. Сводка по магазинам — видно, всё ли разложилось ожидаемо
  console.log("\nЗаказов по магазинам:");
  for (const s of shops) {
    const n = await prisma.order.count({ where: { shopId: s.id } });
    console.log(`  ${s.slug.padEnd(20)} ${n}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
