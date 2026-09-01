// prisma/backfill-shops.ts
// Разделение на компании: заводит компанию «Банч», магазины и раскладывает
// по ним всё существующее — пользователей, курьеров и заказы.
//
// Запуск: npx tsx prisma/backfill-shops.ts
// Идемпотентен: можно гонять повторно, ничего не задвоится и не перезапишется.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY = { slug: "bunch", name: "Банч" };

// Значения, которые реально лежат в Order.shop
const SHOPS = [
  { slug: "bunch", name: "Банч", connectorType: "RETAILCRM" },
  { slug: "kaktusfiori", name: "Meura (Kaktus Fiori)", connectorType: "RETAILCRM" },
  { slug: "meura-flowers", name: "Meura Flowers", connectorType: "RETAILCRM" },
  { slug: "Manual", name: "Ручные заказы", connectorType: "WEBHOOK" },
];

async function main() {
  console.log("── Разделение на компании ──\n");

  // 1. Компания
  const company = await prisma.company.upsert({
    where: { slug: COMPANY.slug },
    update: {},
    create: COMPANY,
  });
  console.log(`Компания: ${company.name} → adelivo.ru/join/${company.slug}`);

  // 2. Магазины
  for (const s of SHOPS) {
    await prisma.shop.upsert({
      where: { slug: s.slug },
      update: { companyId: company.id },
      create: { ...s, companyId: company.id },
    });
  }
  const shops = await prisma.shop.findMany({ where: { companyId: company.id } });
  const bySlug = new Map(shops.map((s) => [s.slug, s.id]));
  console.log(`Магазинов: ${shops.length}`);

  // 3. Заказы → магазины
  let linked = 0;
  for (const [slug, id] of bySlug) {
    const res = await prisma.order.updateMany({
      where: { shopId: null, shop: slug },
      data: { shopId: id },
    });
    if (res.count) console.log(`  ${slug}: ${res.count} заказов`);
    linked += res.count;
  }

  // Заказы с пустым или неизвестным shop уходят в основной магазин:
  // без shopId матрица доступов их не увидит и они выпадут из выдачи
  const fallback = bySlug.get("bunch")!;
  const orphans = await prisma.order.updateMany({
    where: { shopId: null },
    data: { shopId: fallback },
  });
  if (orphans.count) console.log(`  без магазина → bunch: ${orphans.count}`);
  console.log(`Всего заказов привязано: ${linked + orphans.count}`);

  // 4. Пользователи → компания.
  //    accessRestricted не трогаем: он false, значит все видят все магазины,
  //    как и раньше. Ограничения включаются точечно в /admin/access.
  const users = await prisma.user.updateMany({
    where: { companyId: null },
    data: { companyId: company.id },
  });
  console.log(`Пользователей привязано: ${users.count}`);

  // 5. Курьеры → компания
  const couriers = await prisma.courier.updateMany({
    where: { companyId: null },
    data: { companyId: company.id },
  });
  console.log(`Курьеров привязано: ${couriers.count}`);

  // 6. Глобальный админ — иначе в /admin/access никто не войдёт
  const supers = await prisma.user.count({ where: { isSuperAdmin: true } });
  if (supers === 0) {
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    });
    if (admin) {
      await prisma.user.update({ where: { id: admin.id }, data: { isSuperAdmin: true } });
      console.log(`Глобальный админ: ${admin.email}`);
    } else {
      console.log("⚠️  ADMIN не найден. Назначьте isSuperAdmin вручную:");
      console.log('    UPDATE "User" SET "isSuperAdmin" = true WHERE email = \'ваша@почта\';');
    }
  } else {
    console.log(`Глобальных админов уже есть: ${supers}`);
  }

  // 7. Допуск к работе — разовая история для тех, кто УЖЕ возит заказы.
  //    Дальше допуск выдаётся только вручную, галочкой в /admin/access.
  //    Ни привязка Консоли, ни что-либо ещё его не выдаёт: Консоль отвечает
  //    за выплаты, а не за право выходить на линию.
  const approved = await prisma.courier.updateMany({
    where: { isActive: true, isApproved: false },
    data: { isApproved: true },
  });
  if (approved.count) console.log(`Курьеров подтверждено (уже работали): ${approved.count}`);


  // 8. Проверка
  const left = await prisma.order.count({ where: { shopId: null } });
  const noCompany = await prisma.user.count({ where: { companyId: null } });
  console.log("\n── Проверка ──");
  console.log(`Заказов без магазина: ${left} (должно быть 0)`);
  console.log(`Пользователей без компании: ${noCompany} (должно быть 0)`);
}

/**
 * ID для курьера, который зарегистрировался сам, без CRM.
 * CRM выдаёт положительные id, поэтому свои берём из отрицательного
 * диапазона — столкнуться они не смогут.
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
