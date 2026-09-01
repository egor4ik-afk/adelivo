// prisma/grant-shop-access.ts
// РАЗОВЫЙ СКРИПТ. Запускать ДО выкладки нового кода.
//
// Доступ переехал из companyId в матрицу ShopAccess. У существующих
// пользователей строк в матрице нет — значит после выкладки они увидят
// пустые экраны. Скрипт выдаёт каждому доступ ко всем магазинам его компании,
// то есть фиксирует ровно то, что человек видит сейчас.
//
// Безопасен для старого кода: только добавляет строки в ShopAccess,
// а старая логика их всё равно игнорировала, пока accessRestricted = false.
// Поэтому правильный порядок такой:
//   1. npx tsx prisma/grant-shop-access.ts   ← сейчас, на работающем проде
//   2. деплой нового кода
//
// Идемпотентен: повторный запуск ничего не задвоит.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("── Перенос доступов в матрицу ──\n");

  const companies = await prisma.company.findMany({
    include: {
      shops: { select: { id: true, slug: true } },
      users: { select: { id: true, email: true, role: true } },
    },
  });

  let total = 0;

  for (const company of companies) {
    if (company.shops.length === 0 || company.users.length === 0) {
      console.log(`${company.name}: магазинов ${company.shops.length}, сотрудников ${company.users.length} — пропуск`);
      continue;
    }

    const data = company.users.flatMap((u) =>
      company.shops.map((s) => ({ userId: u.id, shopId: s.id }))
    );

    const res = await prisma.shopAccess.createMany({ data, skipDuplicates: true });
    total += res.count;

    console.log(
      `${company.name}: ${company.users.length} сотрудников × ${company.shops.length} магазинов → выдано ${res.count} доступов`
    );
  }

  // Пользователи без компании остаются без доступов — это и есть курьеры,
  // зарегистрировавшиеся сами, не по ссылке. Раньше они видели чужие данные.
  const orphans = await prisma.user.count({ where: { companyId: null } });

  // Глобальным админам матрица не нужна, они вне её
  const supers = await prisma.user.count({ where: { isSuperAdmin: true } });

  console.log(`\nВсего выдано доступов: ${total}`);
  console.log(`Пользователей без компании (останутся без доступа): ${orphans}`);
  console.log(`Глобальных админов (видят всё в обход матрицы): ${supers}`);

  if (supers === 0) {
    console.log("\n⚠️  Глобального админа нет. Назначьте, иначе управлять матрицей будет некому:");
    console.log(`    UPDATE "User" SET "isSuperAdmin" = true WHERE email = 'ваша@почта';`);
  }

  // Контрольная выборка: кто сколько магазинов получил
  const sample = await prisma.user.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      email: true, role: true, companyId: true,
      _count: { select: { shopAccess: true } },
    },
  });

  console.log("\nПоследние 10 пользователей:");
  for (const u of sample) {
    console.log(`  ${u.email.padEnd(32)} ${u.role.padEnd(9)} магазинов: ${u._count.shopAccess}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
