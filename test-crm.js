import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();
const GEO_KEY = process.env.YANDEX_GEOCODER_KEY;

// Формула расстояния (чистый JS, без типов)
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

async function runTest() {
  const testIds = ["21153C", "20172C"];
  
  console.log("🚀 Запуск тестирования геокодинга и цен...\n");

  for (const externalId of testIds) {
    const order = await prisma.order.findFirst({
      where: { OR: [{ externalId: externalId }, { crmId: externalId }] }
    });

    if (!order) {
      console.log(`❌ Заказ ${externalId} не найден в базе.`);
      continue;
    }

    console.log(`📦 ЗАКАЗ: ${externalId}`);
    console.log(`📍 Исходный адрес: ${order.address}`);
    console.log(`💲 Текущая цена в БД: ${order.price || "пусто"}`);

    if (!order.address) {
      console.log(`⚠️ Нет адреса для проверки.\n`);
      continue;
    }

    // Симуляция логики геокодинга
    const searchAddress = order.address.toLowerCase().includes("москва") ? order.address : `Москва, ${order.address}`;
    
    try {
      const res = await axios.get("https://geocode-maps.yandex.ru/1.x/", {
        params: { apikey: GEO_KEY, geocode: searchAddress, format: "json", results: 1 },
      });
      
      const point = res.data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.Point?.pos;
      
      if (!point) {
        console.log(`❌ Яндекс не смог найти этот адрес.\n`);
        continue;
      }

      const [lng, lat] = point.split(" ").map(Number);
      
      // Координаты базы/центра
      const BASE_LAT = 55.755864; 
      const BASE_LNG = 37.617698;
      
      const distance = getDistanceFromLatLonInKm(BASE_LAT, BASE_LNG, lat, lng);
      console.log(`🧭 Найдена точка: [${lat}, ${lng}]`);
      console.log(`📏 Расстояние от базы: ${distance.toFixed(1)} км`);

      if (distance > 45) {
        console.log(`🛑 ВЕРДИКТ: ОШИБКА! Адрес улетел за пределы 45 км (Вне зоны доставки)`);
      } else {
        console.log(`✅ ВЕРДИКТ: Адрес в пределах нормы (Доставка разрешена)`);
        
        // Симуляция логики расчета цены
        let simPrice = order.price || 500;
        if ([500, 900, 1300].includes(simPrice)) {
          simPrice += 100;
          console.log(`💰 При назначении авто-курьера цена станет: ${simPrice} ₽`);
        } else {
          console.log(`💰 Цена не подпадает под базовые тарифы CRM, останется: ${simPrice} ₽`);
        }
      }
    } catch (e) {
      console.log(`❌ Ошибка запроса к Яндексу: ${e.message}`);
    }
    console.log("--------------------------------------------------\n");
  }

  await prisma.$disconnect();
}

runTest();