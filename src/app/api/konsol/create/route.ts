import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    
    // 1. Проверяем наличие необходимых данных от фронтенда
    // Предполагаем, что с фронта приходит массив couriers и дата (date)
    if (!data.couriers || !data.couriers.length || !data.date) {
      return NextResponse.json(
        { error: 'Не указаны курьеры или дата для создания задания' }, 
        { status: 400 }
      );
    }

    // Достаем ID курьеров в Консоли. Если у тебя они лежат в другом поле - поменяй konsolId на нужное.
    const contractorIds = data.couriers
      .map((c: any) => c.konsolId)
      .filter(Boolean);

    if (contractorIds.length === 0) {
        return NextResponse.json(
          { error: 'У выбранных курьеров нет ID в Консоли (konsolId)' }, 
          { status: 400 }
        );
    }

    // 2. Формируем тело запроса строго по документации Konsol
    const payload = {
      title: "Оказание курьерских услуг", // Название задания
      since_date: data.date,               // Формат YYYY-MM-DD
      upto_date: data.date,                // Для задания на 1 день совпадают
      remote_work: true,                   // Используем удаленную работу (без address_id)
      contractor_ids: contractorIds,       // Массив ID исполнителей [123, 456]
      duties: [
        {
          title: "Доставка заказов",
          measure: "день",
          quantity: 1,
          price: data.price || 1500        // Передаем цену (или дефолтную)
        }
      ]
    };

    // 3. Отправляем запрос в Консоль
    const konsolUrl = `${process.env.KONSOL_API_URL || 'https://api.konsol.pro/bus/alpha'}/workflow/platform/tasks`;
    
    const response = await fetch(konsolUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.KONSOL_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    // 4. Если Консоль вернула ошибку валидации (400, 422 и т.д.)
    if (!response.ok) {
      console.error('Ошибка создания задания в Консоли:', result);
      return NextResponse.json(
        { 
          success: false, 
          error: result.message || JSON.stringify(result) 
        }, 
        { status: response.status }
      );
    }

    // 5. Успех
    return NextResponse.json({ 
      success: true, 
      data: result 
    });

  } catch (error: any) {
    console.error('Сбой в api/konsol/create:', error);
    return NextResponse.json(
      { success: false, error: 'Внутренняя ошибка сервера: ' + error.message }, 
      { status: 500 }
    );
  }
}
