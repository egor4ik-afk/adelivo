import * as fs from 'fs';

// 1. Функция для ручной загрузки .env (чтобы не ставить лишних библиотек)
function loadEnv() {
  try {
    const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^#\s]+)\s*=\s*(.*)$/);
      if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (e) {
    console.warn("⚠️ Не удалось загрузить .env файл");
  }
}
loadEnv();

const CRM_URL = process.env.RETAILCRM_API_URL;
const CRM_KEY_BUNCH = process.env.RETAILCRM_API_KEY;
const CRM_KEY_MEURA = process.env.RETAILCRM_API_KEY_MEURA;

async function testRealOrders() {
  if (!CRM_URL || !CRM_KEY_BUNCH || !CRM_KEY_MEURA) {
    console.error("❌ Не найдены ключи (RETAILCRM_API_URL, RETAILCRM_API_KEY, RETAILCRM_API_KEY_MEURA) в .env файле!");
    return;
  }

  // Ищем за последние 3 дня, чтобы 100% найти заказы всех магазинов
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 3);
  const fromStr = dateFrom.toISOString().split('T')[0];

  console.log(`🚀 Запрашиваем реальные заказы (по 2 шт) из CRM...\n`);

  try {
    // ЗАПРОС 1: Meura (kaktusfiori)
    const urlMeura = `${CRM_URL}/api/v5/orders?filter[createdAtFrom]=${fromStr}&filter[sites][]=kaktusfiori&limit=20`;
    const resMeura = await fetch(urlMeura, { headers: { "X-API-KEY": CRM_KEY_MEURA } });
    const dataMeura = await resMeura.json();

    // ЗАПРОС 2: Bunch
    const urlBunch = `${CRM_URL}/api/v5/orders?filter[createdAtFrom]=${fromStr}&filter[sites][]=bunch&limit=20`;
    const resBunch = await fetch(urlBunch, { headers: { "X-API-KEY": CRM_KEY_BUNCH } });
    const dataBunch = await resBunch.json();

    const ordersMeura = dataMeura.success && dataMeura.orders ? dataMeura.orders.slice(0, 2) : [];
    const ordersBunch = dataBunch.success && dataBunch.orders ? dataBunch.orders.slice(0, 2) : [];
    
    const allOrders = [...ordersMeura, ...ordersBunch];

    if (allOrders.length === 0) {
      console.log("🤷 Заказов за последние дни не найдено.");
      return;
    }

    allOrders.forEach((order) => {
      const shopCode = order.site || "неизвестно";
      const rawAddress = order.delivery?.address?.text || "";

      let dbAddress = rawAddress;
      let dbName = null;
      let dbPhone = null;

      // ЛОГИКА РАЗДЕЛЕНИЯ
      if (shopCode === 'kaktusfiori' || shopCode === 'meura-flowers') {
        const parsed = parseMeuraAddress(rawAddress);
        dbAddress = parsed.cleanAddress;
        dbName = parsed.name;
        dbPhone = parsed.phone;
      }

      console.log(`=== ЗАКАЗ ${order.id} [${shopCode.toUpperCase()}] ===`);
      console.log(`ОРИГИНАЛ АДРЕСА: "${rawAddress}"`);
      
      if (shopCode === 'kaktusfiori' || shopCode === 'meura-flowers') {
        console.log(`⚙️ РЕЗУЛЬТАТ ПАРСЕРА:`);
      } else {
        console.log(`⚙️ BUNCH (Не парсим, ждем ТГ-бота):`);
      }
      
      console.log(`  📍 Чистый адрес: ${dbAddress}`);
      console.log(`  👤 Имя:          ${dbName || "null (останется из БД)"}`);
      console.log(`  📞 Телефон:      ${dbPhone || "null (останется из БД)"}\n`);
    });

  } catch (error: any) {
    console.error("❌ Ошибка при запросе:", error.message);
  }
}

// Наш парсер адреса
function parseMeuraAddress(rawAddress: string | null) {
  if (!rawAddress) return { cleanAddress: null, name: null, phone: null };

  const phoneRegex = /(\+?[78][-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/;
  const phoneMatch = rawAddress.match(phoneRegex);
  const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : null;

  let cleanAddress = rawAddress;
  let name = null;

  if (phoneMatch) {
    cleanAddress = cleanAddress.replace(phoneMatch[0], '');

    const parts = rawAddress.split(phoneMatch[0]);
    if (parts[1] && parts[1].trim()) {
       const tailMatch = parts[1].trim().match(/[А-ЯЁа-яёA-Za-z]+/);
       if (tailMatch) {
           name = tailMatch[0];
           cleanAddress = cleanAddress.replace(parts[1], '');
       }
    }
    
    if (!name) {
       const endNameRegex = /[\s,]+([А-ЯЁ][а-яёA-Za-z]+)\s*$/;
       const matchName = cleanAddress.match(endNameRegex);
       if (matchName && !['этаж', 'кв', 'подъезд', 'д'].includes(matchName[1].toLowerCase())) {
           name = matchName[1];
           cleanAddress = cleanAddress.replace(endNameRegex, '');
       }
    }
  }

  cleanAddress = cleanAddress.replace(/,\s*$/, '').trim();
  return { cleanAddress, name, phone };
}

testRealOrders();