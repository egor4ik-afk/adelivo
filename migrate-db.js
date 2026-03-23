// migrate-db.js
const { Client } = require('pg');
const SOURCE_URL = "postgresql://neondb_owner:npg_U7HMrwz4iBvI@ep-soft-hill-alt5qg1o.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require"; // Куда заливаем
// migrate-db.js

// ОТКУДА: Твой Neon (источник)

// КУДА: Твой Yandex Cloud (база event)
const TARGET_URL = "postgresql://relaxdev_user:DWEjv5hZRSiKVru@c-c9qus4d0oi5d0gke65tu.rw.mdb.yandexcloud.net:6432/event?";

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

// Поля, которые были удалены в новой схеме (чтобы скрипт их игнорировал)
const IGNORED_COLUMNS = ['customerName', 'customerPhone', 'customerEmail'];

async function run() {
  const src = new Client({ connectionString: SOURCE_URL, ssl: { rejectUnauthorized: false } });
  const tgt = new Client({ connectionString: TARGET_URL, ssl: { rejectUnauthorized: false } });

  try { // Оставили только ОДИН блок try
    await src.connect();
    await tgt.connect();
    console.log("🚀 Успешно подключились к обеим базам данных!");

    // 1. Сначала очищаем все таблицы в новой БД
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

      // Получаем все колонки из старой базы и отфильтровываем удаленные
      const allColumns = Object.keys(rows[0]);
      const validColumns = allColumns.filter(col => !IGNORED_COLUMNS.includes(col));
      const colNames = validColumns.map(c => `"${c}"`).join(', ');

      const BATCH_SIZE = 500;
      let inserted = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        let valuesArr = [];
        let queryParams = [];
        let paramIndex = 1;

        for (const row of batch) {
          let rowParams = [];
          
          // Проходимся только по тем колонкам, которые есть в новой БД
          for (const col of validColumns) {
            let val = row[col];
            
            // Обработка объектов для JSON полей
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