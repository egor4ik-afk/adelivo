// src/app/api/manager/routes/print/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PDFDocument, rgb } from 'pdf-lib';
// @ts-ignore
import fontkit from '@pdf-lib/fontkit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { orderIds, format = '120x75' } = await req.json();
    
    if (!orderIds || !orderIds.length) {
      return NextResponse.json({ error: 'Нет выбранных заказов для печати' }, { status: 400 });
    }

    // Загружаем заказы из БД
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { 
        route: { 
          include: { courier: true } 
        } 
      }
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: 'Заказы не найдены в БД' }, { status: 404 });
    }

    // СОРТИРОВКА: Сначала по курьеру (алфавит), затем по их порядку в маршруте (routeOrder)
    orders.sort((a, b) => {
      const courierA = a.route?.courier 
        ? `${a.route.courier.firstName} ${a.route.courier.lastName}`.trim() 
        : 'ЯЯЯ_Без курьера';
      const courierB = b.route?.courier 
        ? `${b.route.courier.firstName} ${b.route.courier.lastName}`.trim() 
        : 'ЯЯЯ_Без курьера';
      
      if (courierA !== courierB) {
        return courierA.localeCompare(courierB);
      }
      return (a.routeOrder ?? 9999) - (b.routeOrder ?? 9999);
    });

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Подгружаем шрифты Roboto с Google Fonts
    const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf';
    const fontBoldUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf';
    
    const [fontBytes, fontBoldBytes] = await Promise.all([
      fetch(fontUrl).then(res => res.arrayBuffer()),
      fetch(fontBoldUrl).then(res => res.arrayBuffer())
    ]);
    
    const font = await pdfDoc.embedFont(fontBytes);
    const fontBold = await pdfDoc.embedFont(fontBoldBytes);

    const isA4 = format === 'A4';

    // Размеры листа А4 в поинтах
    const a4Width = 595.28;
    const a4Height = 841.89;
    const a4CellW = a4Width / 2; // Ровно 2 колонки в ряд
    
    // 1 см = 28.35 pt. Внутри renderOrderContent уже есть отступ в 16pt, 
    // добавляем еще ~12.35pt, чтобы суммарно от края листа выходил ровно 1 см.
    const a4MarginTop = 8.35; 

    // Размеры одиночной этикетки 120 x 75 мм
    const singleWidth = 120 * 2.83465;
    const singleHeight = 75 * 2.83465;

    // Умный перенос текста по словам
    const splitTextToLines = (text: string, maxWidth: number, textFont: any, fontSize: number) => {
      if (!text) return [];
      const words = text.split(' ');
      let lines = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = textFont.widthOfTextAtSize(currentLine + " " + word, fontSize);
        if (width < maxWidth) {
          currentLine += " " + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      }
      lines.push(currentLine);
      return lines;
    };

    // Функция точного расчета высоты карточки на основе объема текста
    const getOrderHeight = (order: any, cellWidth: number) => {
      let currentHeight = 16; // Внутренний верхний отступ
      currentHeight += 12;    // Имя курьера
      currentHeight += 15;    // Разделительная линия
      currentHeight += 18;    // Номер заказа и время
      
      const addressText = order.address || 'Адрес не указан';
      const addressLines = splitTextToLines(addressText, cellWidth - 24, fontBold, 14); 
      currentHeight += addressLines.length * 17;
      currentHeight += 12;    // Промежуток перед составом
      
      const compText = `Состав: ${order.items || '—'}`;
      const compLines = splitTextToLines(compText, cellWidth - 24, fontBold, 12); // РАЗМЕР СОСТАВА 12pt
      currentHeight += compLines.length * 15; // Интервал для 12pt
      
      currentHeight += 16;    // Нижний безопасный отступ ячейки
      return currentHeight;
    };

    // Общая функция отрисовки содержимого этикетки
    const renderOrderContent = (page: any, order: any, baseX: number, baseY: number, cellW: number) => {
      let cursorY = baseY - 16; // Стандартный отступ карточки
      const marginX = 12;

      const drawTextLocal = (text: string, xOffset: number, y: number, size = 10, isBold = false) => {
        page.drawText(text, { x: baseX + xOffset, y, size, font: isBold ? fontBold : font, color: rgb(0,0,0) });
      };

      // 1. ИМЯ КУРЬЕРА И ВРЕМЯ ВЫЕЗДА (справа)
      const courierName = order.route?.courier 
        ? `${order.route.courier.firstName} ${order.route.courier.lastName}`.trim() 
        : 'Не назначен';
        
      drawTextLocal(`Курьер: ${courierName}`, marginX, cursorY, 11, true);

      // Если есть время выезда, вычисляем его ширину и печатаем справа
      if (order.route?.plannedDepartureTime && order.route.plannedDepartureTime !== "—") {
        const timeText = order.route.plannedDepartureTime;
        const timeWidth = fontBold.widthOfTextAtSize(timeText, 11);
        drawTextLocal(timeText, cellW - timeWidth - marginX, cursorY, 11, true);
      }

      cursorY -= 12;
      
      // Линия под курьером
      page.drawLine({ 
        start: { x: baseX + 10, y: cursorY }, 
        end: { x: baseX + cellW - 10, y: cursorY }, 
        thickness: 1, 
        color: rgb(0.8, 0.8, 0.8) 
      });
      cursorY -= 15;

      // 2. НОМЕР ЗАКАЗА И СЛОТ ВРЕМЕНИ
      const rawId = order.externalId || order.crmId || order.id.slice(-6);
      const cleanId = String(rawId).replace(/^#/, '');
      
      drawTextLocal(`Заказ #${cleanId}`, marginX, cursorY, 15, true);
      
      if (order.slotRaw) {
        const slotText = `Время: ${order.slotRaw}`;
        const slotWidth = fontBold.widthOfTextAtSize(slotText, 12);
        drawTextLocal(slotText, cellW - slotWidth - marginX, cursorY, 12, true);
      }
      cursorY -= 18;

      // 3. АДРЕС (Шрифт 14pt, жирный)
      const addressText = order.address || 'Адрес не указан';
      const addressLines = splitTextToLines(addressText, cellW - (marginX * 2), fontBold, 14);
      for (const line of addressLines) {
        drawTextLocal(line, marginX, cursorY, 14, true);
        cursorY -= 17;
      }
      cursorY -= 12;

      // 4. СОСТАВ ЗАКАЗА (Шрифт 12pt, жирный)
      const compText = `Состав: ${order.items || '—'}`;
      const compLines = splitTextToLines(compText, cellW - (marginX * 2), fontBold, 12);
      for (const line of compLines) {
        drawTextLocal(line, marginX, cursorY, 12, true);
        cursorY -= 15; // Интервал под 12pt шрифт
      }
    };

    if (isA4) {
      // ЛОГИКА ДЛЯ ФОРМАТА А4
      let currentPage = pdfDoc.addPage([a4Width, a4Height]);
      let currentY = a4Height - a4MarginTop; // Сразу отступаем сверху страницы на 1 см

      for (let i = 0; i < orders.length; i += 2) {
        const orderLeft = orders[i];
        const orderRight = orders[i + 1];

        const heightLeft = getOrderHeight(orderLeft, a4CellW);
        const heightRight = orderRight ? getOrderHeight(orderRight, a4CellW) : 0;
        const rowHeight = Math.max(heightLeft, heightRight);

        // Если строка не влезает на текущий лист — переносим на новый А4
        if (currentY - rowHeight < 20) {
          currentPage = pdfDoc.addPage([a4Width, a4Height]);
          currentY = a4Height - a4MarginTop; // На новой странице тоже отступаем 1 см сверху
        }

        const baseY = currentY;

        // Рисуем левую и правую (если есть) карточку
        renderOrderContent(currentPage, orderLeft, 0, baseY, a4CellW);
        if (orderRight) {
          renderOrderContent(currentPage, orderRight, a4CellW, baseY, a4CellW);
        }

        // РАЗДЕЛИТЕЛЬНЫЕ ЛИНИИ (Более контрастные для удобной резки)
        // Если это верхняя строка страницы, тянем вертикальную линию разреза до самого края листа
        const lineTopY = (baseY === a4Height - a4MarginTop) ? a4Height : baseY;
        
        currentPage.drawLine({
          start: { x: a4CellW, y: lineTopY },
          end: { x: a4CellW, y: baseY - rowHeight },
          thickness: 1.2,
          color: rgb(0.5, 0.5, 0.5),
          dashArray: [5, 5]
        });

        // Горизонтальный пунктир снизу (ограничивает строку)
        currentPage.drawLine({
          start: { x: 0, y: baseY - rowHeight },
          end: { x: orderRight ? a4Width : a4CellW, y: baseY - rowHeight },
          thickness: 1.2,
          color: rgb(0.5, 0.5, 0.5),
          dashArray: [5, 5]
        });

        currentY -= rowHeight;
      }
    } else {
      // ЛОГИКА ДЛЯ ОДИНОЧНОГО ФОРМАТА (термопринтер 120х75мм)
      for (const order of orders) {
        const currentPage = pdfDoc.addPage([singleWidth, singleHeight]);
        renderOrderContent(currentPage, order, 0, singleHeight, singleWidth);
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes as any, { 
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Labels_${isA4 ? 'A4' : '120x75'}_${Date.now()}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Ошибка PDF:', error);
    return new NextResponse(`Ошибка генерации PDF: ${error.message}`, { status: 500 });
  }
}