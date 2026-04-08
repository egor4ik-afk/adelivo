// test-real-parser.js

async function testRealOrders() {
  // Используем ключ из вашего первого скрипта
  const apiKey = "3YxiSGgbHMlvXAgLPJp099on6YvjkxrQ";
  
  // Получаем дату на завтра в формате YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  // Ищем заказы с датой доставки на завтра
  const apiUrl = `https://kaktusfiori.retailcrm.ru/api/v5/orders?filter[deliveryDate]=${tomorrowStr}&limit=5`;
  
  console.log(`🚀 Запрашиваем реальные заказы из CRM на завтра (${tomorrowStr})...\n`);

  try {
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: { "X-API-KEY": apiKey }
    });

    const data = await response.json();

    if (!data.success) {
      console.log("❌ Ошибка CRM:", data.errorMsg);
      return;
    }

    const orders = data.orders;
    if (orders.length === 0) {
      console.log("🤷 На завтра пока нет заказов в CRM.");
      return;
    }

    console.log(`✅ Найдено заказов для теста: ${orders.length}\n`);

    orders.forEach((order) => {
      const shopCode = order.site || "неизвестно";
      const rawAddress = order.delivery?.address?.text || "";

      let dbAddress = rawAddress;
      let dbName = null;
      let dbPhone = null;

      // Применяем логику только для Meura
      if (shopCode === 'kaktusfiori' || shopCode === 'meura-flowers') {
        const parsed = parseMeuraAddress(rawAddress);
        dbAddress = parsed.cleanAddress;
        dbName = parsed.name;
        dbPhone = parsed.phone;
      }

      console.log(`=== ЗАКАЗ ${order.id} ===`);
      console.log(`ВХОД ИЗ CRM: site="${shopCode}", address="${rawAddress}"`);
      if (shopCode === 'kaktusfiori' || shopCode === 'meura-flowers') {
        console.log(`⚙️ ЛОГИКА: Это ${shopCode}. Распарсили адрес.`);
      } else {
        console.log(`⚙️ ЛОГИКА: Это ${shopCode}. Адрес не трогаем (ждет данных от ТГ-бота).`);
      }
      
      console.log(`ГОТОВО ДЛЯ БД:`);
      console.log(`  -> shop:           ${shopCode}`);
      console.log(`  -> address:        ${dbAddress}`);
      console.log(`  -> name:           ${dbName || "null"}`);
      console.log(`  -> recipientPhone: ${dbPhone || "null"}\n`);
    });

  } catch (error) {
    console.error("❌ Ошибка:", error.message);
  }
}

// Умный парсер адреса (тот самый, что мы будем внедрять)
function parseMeuraAddress(rawAddress) {
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