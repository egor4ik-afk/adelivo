function testParsing(text) {
  console.log(`\n🔍 Текст для проверки:\n"${text}"`);
  
  // Точная регулярка с нашего бэкенда (ищет все вхождения)
  const matches = [...text.matchAll(/Выехать до\s*(\d{1,2}):(\d{2})/g)];
  
  if (matches.length > 0) {
      console.log(`✅ Найдено вхождений: ${matches.length}`);
      
      // Бэкенд берет САМОЕ ПОСЛЕДНЕЕ вхождение (matches[matches.length - 1])
      const lastMatch = matches[matches.length - 1];
      const planH = parseInt(lastMatch[1], 10);
      const planM = parseInt(lastMatch[2], 10);
      
      console.log(`🎯 Итоговое время, которое берет скрипт: ${planH}:${planM.toString().padStart(2, '0')}`);
      console.log(`🧮 В минутах от начала суток: ${planH * 60 + planM}`);
  } else {
      console.log("❌ Скрипт НЕ НАШЕЛ фразу 'Выехать до HH:mm' в этом тексте.");
  }
}

// Тест 1: Идеальная строка
testParsing("💡 Выехать до 08:49 — первый заказ к 10:00 (зак. 20172C)");

// Тест 2: Твой пример с дубликатами (сработает последнее)
testParsing("💡 Выехать до 08:49 — первый заказ к 10:00 (зак. 20172C) 💡 Выехать до 08:57 — первый заказ к 10:00 (зак. 20172C)");

// Тест 3: Без нулей, с лишними пробелами
testParsing("Просто текст. Выехать до 9:05. И еще текст.");

// Тест 4: Если текста вообще нет
testParsing("Курьер Камран, позвонить за час");