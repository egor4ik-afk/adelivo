import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PDFDocument, rgb } from 'pdf-lib';
// @ts-ignore
import fontkit from '@pdf-lib/fontkit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { routeIds } = await req.json();
    if (!routeIds || !routeIds.length) {
      return NextResponse.json({ error: 'Нет маршрутов' }, { status: 400 });
    }

    const routes: any[] = await prisma.route.findMany({
        where: { id: { in: routeIds } },
        include: { courier: true, orders: { orderBy: { routeOrder: 'asc' } } }
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

    // ФОРМАТ 120 x 85 мм (Перевод в поинты)
    const pageWidth = 120 * 2.83465; // ~340.15 pt
    const pageHeight = 85 * 2.83465; // ~240.94 pt

    // Умный перенос текста на новые строки, чтобы длинные адреса не улетали за край
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
    for (const route of routes) {
      const courierName = route.courier ? `${route.courier.firstName} ${route.courier.lastName}` : 'Не назначен';
      const timeOnBase = route.plannedDepartureTime || '—';

      if (!route.orders || route.orders.length === 0) continue;

      for (const order of route.orders) {
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        let cursorY = pageHeight - 20;

        const drawText = (text: string, x: number, y: number, size = 10, isBold = false, color = rgb(0,0,0)) => {
          page.drawText(text, { x, y, size, font: isBold ? fontBold : font, color });
        };

        // 1. ШАПКА: Имя курьера и время
        drawText(`Курьер: ${courierName}`, 15, cursorY, 12, true);
        drawText(`На базе: ${timeOnBase}`, pageWidth - 100, cursorY, 12, true, rgb(0.8, 0.1, 0.1));
        cursorY -= 15;
        
        // Линия
        page.drawLine({ start: { x: 10, y: cursorY }, end: { x: pageWidth - 10, y: cursorY }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
        cursorY -= 25;

        // 2. ЗАКАЗ И ВРЕМЯ (Крупно)
        drawText(`ЗАКАЗ #${order.number || order.id.slice(-4)}`, 15, cursorY, 18, true);
        drawText(`⏱ ${order.slotRaw || ''}`, pageWidth - 110, cursorY, 14, true);
        cursorY -= 25;

        // 3. АДРЕС (Жирным, с авто-переносом)
        const addressLines = splitTextToLines(`📍 ${order.address || 'Адрес не указан'}`, pageWidth - 30, fontBold, 12);
        for (const line of addressLines) {
          drawText(line, 15, cursorY, 12, true);
          cursorY -= 16;
        }
        cursorY -= 5;

        // 4. ПОЛУЧАТЕЛЬ
        drawText(`👤 ${order.clientName || 'Без имени'}   📞 ${order.clientPhone || ''}`, 15, cursorY, 11, true, rgb(0.2, 0.2, 0.2));
        cursorY -= 20;

        // 5. СОСТАВ ЗАКАЗА (Обычным шрифтом)
        const compLines = splitTextToLines(`Состав: ${order.composition || order.items || '—'}`, pageWidth - 30, font, 10);
        for (const line of compLines) {
          drawText(line, 15, cursorY, 10, false, rgb(0.1, 0.1, 0.1));
          cursorY -= 14;
        }
        
        // 6. КОММЕНТАРИИ (если влезет)
        if (order.clientComment || order.opComment) {
          cursorY -= 5;
          const commText = `${order.clientComment ? 'Кл: ' + order.clientComment : ''} ${order.opComment ? ' | Оп: ' + order.opComment : ''}`;
          const commLines = splitTextToLines(commText, pageWidth - 30, font, 9);
          for (let i = 0; i < Math.min(commLines.length, 2); i++) { // Максимум 2 строки
            drawText(commLines[i], 15, cursorY, 9, false, rgb(0.4, 0.4, 0.4));
            cursorY -= 12;
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Labels_120x85_${Date.now()}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Ошибка PDF:', error);
    return new NextResponse(`Ошибка генерации PDF: ${error.message}`, { status: 500 });
  }
}