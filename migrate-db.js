// migrate-db.js
const { Client } = require('pg');

const SOURCE_URL = "postgresql://neondb_owner:npg_huWUM8EwNL9e@ep-weathered-king-agkh6xje.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require"; // Откуда качаем
const TARGET_URL = "postgresql://neondb_owner:npg_U7HMrwz4iBvI@ep-soft-hill-alt5qg1o.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"; // Куда заливаем
// migrate-db.js

// 🔥 СТРОГИЙ ПОРЯДОК ТАБЛИЦ (Сначала независимые, потом зависимые)
const TABLE_ORDER = [
  'SyncState',
  'NotificationLog',
  'User',
  'Courier',
  'Session',
  'AuthCode',
  'PushSubscription',
  'CourierShift',
  'CourierPayment',
  'Route',
  'Order',
  'RouteMessage'
];

async function run() {
  const src = new Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
  const tgt = new Client({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

  await src.connect();
  await tgt.connect();
  console.log("🚀 Успешно подключились к обеим базам данных!");

  try {
    // 1. Сначала очищаем все таблицы в новой БД (CASCADE удалит всё связанное)
    console.log("🧹 Очищаем новую базу перед заливкой...");
    for (const tablename of [...TABLE_ORDER].reverse()) {
      await tgt.query(`TRUNCATE TABLE "${tablename}" CASCADE;`).catch(() => {});
    }

    // 2. Копируем данные строго по порядку
    for (const tablename of TABLE_ORDER) {
      console.log(`\n📦 Копируем таблицу: ${tablename}`);
      
      const { rows } = await src.query(`SELECT * FROM "${tablename}"`);
      
      if (rows.length === 0) {
        console.log(`   Таблица пуста, пропускаем.`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');

      const BATCH_SIZE = 500;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        
        let valuesArr = [];
        let queryParams = [];
        let paramIndex = 1;

        for (const row of batch) {
          let rowParams = [];
          for (const col of columns) {
            let val = row[col];
            if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
              val = JSON.stringify(val);
            }
            queryParams.push(val);
            rowParams.push(`$${paramIndex++}`);
          }
          valuesArr.push(`(${rowParams.join(', ')})`);
        }

        const query = `INSERT INTO "${tablename}" (${colNames}) VALUES ${valuesArr.join(', ')}`;
        await tgt.query(query, queryParams);
        inserted += batch.length;
        
        process.stdout.write(`\r   Скопировано: ${inserted} / ${rows.length}`);
      }
      console.log(`\n   ✅ ${tablename} завершена`);
    }

    // 3. Синхронизируем счетчики (если есть автоинкременты)
    console.log("\n🔄 Проверяем счетчики автоинкремента...");
    const { rows: sequences } = await src.query(`
      SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public';
    `);

    for (const { sequence_name } of sequences) {
      const { rows: seqData } = await src.query(`SELECT last_value FROM "${sequence_name}"`);
      const lastValue = seqData[0]?.last_value;
      if (lastValue) {
        await tgt.query(`SELECT setval('"${sequence_name}"', ${lastValue}, true);`);
        console.log(`   Счетчик ${sequence_name} установлен на ${lastValue}`);
      }
    }

    console.log("\n🎉 БАЗА ПОЛНОСТЬЮ И УСПЕШНО СКОПИРОВАНА!");

  } catch (err) {
    console.error("\n❌ Ошибка во время миграции:", err);
  } finally {
    await src.end();
    await tgt.end();
  }
}

run();