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

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { 
        route: { 
          include: { courier: true } 
        } 
      },
      orderBy: { routeOrder: 'asc' }
    });

    if (orders.length === 0) {
      return NextResponse.json({ error: 'Заказы не найдены в БД' }, { status: 404 });
    }

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf';
    const fontBoldUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf';
    
    const [fontBytes, fontBoldBytes] = await Promise.all([
      fetch(fontUrl).then(res => res.arrayBuffer()),
      fetch(fontBoldUrl).then(res => res.arrayBuffer())
    ]);
    
    const font = await pdfDoc.embedFont(fontBytes);
    const fontBold = await pdfDoc.embedFont(fontBoldBytes);

    const isA4 = format === 'A4';

    // Размеры А4 в поинтах
    const a4Width = 595.28;
    const a4Height = 841.89;
    const a4Cols = 2;
    const a4Rows = 4; // Будет 8 этикеток на страницу
    const a4CellW = a4Width / a4Cols; 
    const a4CellH = a4Height / a4Rows; 

    // Размеры одиночной этикетки 120 x 75 мм
    const singleWidth = 120 * 2.83465;
    const singleHeight = 75 * 2.83465;

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

    let currentPage: any;

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      let baseX = 0;
      let baseY = 0;
      let cellW = singleWidth;
      let cellH = singleHeight;

      // Логика расстановки по сетке или создания новых страниц
      if (isA4) {
        const posInPage = i % (a4Cols * a4Rows);
        
        // Создаем новую страницу А4 каждые 8 заказов
        if (posInPage === 0) {
          currentPage = pdfDoc.addPage([a4Width, a4Height]);
          
          // Рисуем пунктирные разделительные линии (для удобства разрезания)
          currentPage.drawLine({ start: { x: a4CellW, y: 0 }, end: { x: a4CellW, y: a4Height }, thickness: 1, color: rgb(0.8, 0.8, 0.8), dashArray: [5, 5] });
          for (let r = 1; r < a4Rows; r++) {
            currentPage.drawLine({ start: { x: 0, y: r * a4CellH }, end: { x: a4Width, y: r * a4CellH }, thickness: 1, color: rgb(0.8, 0.8, 0.8), dashArray: [5, 5] });
          }
        }
        
        const col = posInPage % a4Cols;
        const row = Math.floor(posInPage / a4Cols);
        
        baseX = col * a4CellW;
        baseY = a4Height - (row * a4CellH); // Y считается снизу вверх
        cellW = a4CellW;
        cellH = a4CellH;
      } else {
        // Одиночный формат
        currentPage = pdfDoc.addPage([singleWidth, singleHeight]);
        baseX = 0;
        baseY = singleHeight;
      }

      // Отступы внутри ячейки/страницы
      let cursorY = baseY - 16;
      const marginX = 12;

      // Локальная функция отрисовки с учетом смещения (baseX)
      const drawTextLocal = (text: string, xOffset: number, y: number, size = 10, isBold = false, color = rgb(0,0,0)) => {
        currentPage.drawText(text, { x: baseX + xOffset, y, size, font: isBold ? fontBold : font, color });
      };

      // 1. ИМЯ КУРЬЕРА
      const courierName = order.route?.courier 
        ? `${order.route.courier.firstName} ${order.route.courier.lastName}`.trim() 
        : 'Не назначен';
        
      drawTextLocal(`Курьер: ${courierName}`, marginX, cursorY, 11, true);
      cursorY -= 12;
      
      // Разделительная линия
      currentPage.drawLine({ start: { x: baseX + 10, y: cursorY }, end: { x: baseX + cellW - 10, y: cursorY }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      cursorY -= 20;

      // 2. НОМЕР ЗАКАЗА И СЛОТ
      const rawId = order.externalId || order.crmId || order.id.slice(-6);
      const cleanId = String(rawId).replace(/^#/, '');
      
      drawTextLocal(`Заказ #${cleanId}`, marginX, cursorY, 15, true);
      
      if (order.slotRaw) {
        const slotText = `Время: ${order.slotRaw}`;
        const slotWidth = fontBold.widthOfTextAtSize(slotText, 12);
        drawTextLocal(slotText, cellW - slotWidth - marginX, cursorY, 12, true);
      }
      cursorY -= 22;

      // 3. АДРЕС
      const addressLines = splitTextToLines(`📍 ${order.address || 'Адрес не указан'}`, cellW - (marginX * 2), fontBold, 11);
      for (const line of addressLines) {
        drawTextLocal(line, marginX, cursorY, 11, true);
        cursorY -= 14;
      }
      cursorY -= 6;

      // 4. СОСТАВ ЗАКАЗА (с защитой от выхода за пределы ячейки вниз)
      const compLines = splitTextToLines(`📦 Состав: ${order.items || '—'}`, cellW - (marginX * 2), font, 10);
      for (const line of compLines) {
        // Если текст состава слишком длинный и мы рискуем залезть на чужую ячейку — обрезаем
        if (cursorY < baseY - cellH + 15) {
          drawTextLocal('...', marginX, cursorY, 10, false, rgb(0.1, 0.1, 0.1));
          break;
        }
        drawTextLocal(line, marginX, cursorY, 10, false, rgb(0.1, 0.1, 0.1));
        cursorY -= 12;
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