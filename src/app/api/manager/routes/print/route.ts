// src/app/api/manager/routes/print/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PDFDocument, rgb } from 'pdf-lib';
// @ts-ignore
import fontkit from '@pdf-lib/fontkit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { orderIds } = await req.json();
    
    if (!orderIds || !orderIds.length) {
      return NextResponse.json({ error: 'Нет выбранных заказов для печати' }, { status: 400 });
    }

    // Ищем именно ЗАКАЗЫ
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

    // Подгружаем шрифты Roboto с Google Fonts (обычный и жирный)
    const fontUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf';
    const fontBoldUrl = 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf';
    
    const [fontBytes, fontBoldBytes] = await Promise.all([
      fetch(fontUrl).then(res => res.arrayBuffer()),
      fetch(fontBoldUrl).then(res => res.arrayBuffer())
    ]);
    
    const font = await pdfDoc.embedFont(fontBytes);
    const fontBold = await pdfDoc.embedFont(fontBoldBytes);

    // 🔥 ГОРИЗОНТАЛЬНЫЙ ФОРМАТ 120 x 75 мм (Перевод в поинты)
    const pageWidth = 120 * 2.83465;  // ~340.16 pt (Ширина)
    const pageHeight = 75 * 2.83465;  // ~212.60 pt (Высота)

    // Функция умного переноса текста по словам
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

    // Генерируем по одной этикетке (странице) на каждый заказ
    for (const order of orders) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - 16; // Начинаем чуть выше, так как высота небольшая

      const drawText = (text: string, x: number, y: number, size = 10, isBold = false, color = rgb(0,0,0)) => {
        page.drawText(text, { x, y, size, font: isBold ? fontBold : font, color });
      };

      // 1. ИМЯ КУРЬЕРА (Самый верх)
      const courierName = order.route?.courier 
        ? `${order.route.courier.firstName} ${order.route.courier.lastName}`.trim() 
        : 'Не назначен';
        
      drawText(`Курьер: ${courierName}`, 12, cursorY, 11, true);
      cursorY -= 12;
      
      // Разделительная линия
      page.drawLine({ start: { x: 10, y: cursorY }, end: { x: pageWidth - 10, y: cursorY }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      cursorY -= 20;

      // 2. НОМЕР ЗАКАЗА И СЛОТ
      const rawId = order.externalId || order.crmId || order.id.slice(-6);
      const cleanId = String(rawId).replace(/^#/, ''); // Убираем возможные решетки из начала
      
      drawText(`Заказ #${cleanId}`, 12, cursorY, 15, true);
      
      // Выравниваем слот по правому краю
      if (order.slotRaw) {
        const slotText = `Время: ${order.slotRaw}`;
        const slotWidth = fontBold.widthOfTextAtSize(slotText, 12);
        drawText(slotText, pageWidth - slotWidth - 12, cursorY, 12, true);
      }
      
      cursorY -= 22;

      // 3. АДРЕС (Жирным, с авто-переносом)
      const addressLines = splitTextToLines(`📍 ${order.address || 'Адрес не указан'}`, pageWidth - 24, fontBold, 11);
      for (const line of addressLines) {
        drawText(line, 12, cursorY, 11, true);
        cursorY -= 14;
      }
      cursorY -= 6;

      // 4. СОСТАВ ЗАКАЗА (уменьшенный шрифт, чтобы точно влезло по высоте)
      const compLines = splitTextToLines(`📦 Состав: ${order.items || '—'}`, pageWidth - 24, font, 10);
      for (const line of compLines) {
        drawText(line, 12, cursorY, 10, false, rgb(0.1, 0.1, 0.1));
        cursorY -= 12;
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes as any, { 
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Labels_120x75_${Date.now()}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Ошибка PDF:', error);
    return new NextResponse(`Ошибка генерации PDF: ${error.message}`, { status: 500 });
  }
}