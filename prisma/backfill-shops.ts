// prisma/backfill-shops.ts
// Разовый скрипт: заводит компанию, магазины и проставляет shopId существующим заказам.
// Запуск: npx tsx prisma/backfill-shops.ts
//
// Идемпотентен — можно гонять повторно, ничего не задвоится.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Что сейчас реально лежит в Order.shop (см. lib/crm.ts: isMeura)
const SHOPS = [
  { slug: "bunch", name: "Банч", connectorType: "RETAILCRM" },
  { slug: "kaktusfiori", name: "Meura (Kaktus Fiori)", connectorType: "RETAILCRM" },
  { slug: "meura-flowers", name: "Meura Flowers", connectorType: "RETAILCRM" },
  { slug: "Manual", name: "Ручные заказы", connectorType: "WEBHOOK" },
];

async function main() {
  // 1. Компания-владелец текущих магазинов
  const company = await prisma.company.upsert({
    where: { slug: "bunch" },
    update: {},
    create: { slug: "bunch", name: "Банч" },
  });
  console.log(`компания: ${company.name} → adelivo.ru/${company.slug}`);

  // 2. Магазины
  for (const s of SHOPS) {
    await prisma.shop.upsert({
      where: { slug: s.slug },
      update: { companyId: company.id },
      create: { ...s, companyId: company.id },
    });
  }
  const shops = await prisma.shop.findMany();
  const bySlug = new Map(shops.map((s) => [s.slug, s.id]));
  console.log(`магазинов: ${shops.length}`);

  // 3. Заказы без shopId → привязываем по строковому shop
  let linked = 0;
  for (const [slug, id] of bySlug) {
    const res = await prisma.order.updateMany({
      where: { shopId: null, shop: slug },
      data: { shopId: id },
    });
    if (res.count) console.log(`  ${slug}: ${res.count} заказов`);
    linked += res.count;
  }

  // 4. Осиротевшие заказы (shop пустой или неизвестный) → в основной магазин
  const fallback = bySlug.get("bunch")!;
  const orphans = await prisma.order.updateMany({
    where: { shopId: null },
    data: { shopId: fallback },
  });
  if (orphans.count) console.log(`  без магазина → bunch: ${orphans.count}`);
  console.log(`всего привязано заказов: ${linked + orphans.count}`);

  // 5. Существующие пользователи и курьеры → в компанию.
  //    Матрицу доступов НЕ заполняем: по договорённости пока все видят всё,
  //    ограничения включаются флагом accessRestricted у конкретного пользователя.
  await prisma.user.updateMany({ where: { companyId: null }, data: { companyId: company.id } });

  // 6. Первый ADMIN становится глобальным админом
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
  });
  if (admin && !admin.isSuperAdmin) {
    await prisma.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
    console.log(`глобальный админ: ${admin.email}`);
  } else if (!admin) {
    console.log("⚠️  ADMIN не найден — назначьте isSuperAdmin вручную, иначе в админку никто не войдёт");
  }

  // 7. Курьерам проставляем признак доступа к бирже
  const ready = await prisma.courier.updateMany({
    where: { isSelfEmployed: true, konsolContractorId: { not: null } },
    data: { canTakeExchange: true },
  });
  console.log(`курьеров с доступом к бирже: ${ready.count}`);
}

/**
 * ID для курьера, который зарегистрировался сам (без CRM).
 * CRM выдаёт положительные id — свои берём из отрицательного диапазона,
 * чтобы они никогда не столкнулись.
 */
export async function nextLocalCourierId(): Promise<number> {
  const min = await prisma.courier.aggregate({ _min: { id: true } });
  const current = min._min.id ?? 0;
  return current > 0 ? -1 : current - 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
