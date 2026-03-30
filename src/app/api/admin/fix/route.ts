// src/app/api/admin/fix/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: NextRequest) {
  const KONSOL_API_KEY = process.env.KONSOL_API_KEY;
  const KONSOL_BUS = "https://api.konsol.pro/bus/alpha";

  if (!KONSOL_API_KEY) {
    return NextResponse.json({ error: "Нет ключа API KONSOL_API_KEY" }, { status: 500 });
  }

  try {
    // 1. Строго и надежно получаем ID из параметра ?id=...
    let taskId = req.nextUrl.searchParams.get("id");
    
    // Очищаем от мусора (оставляем только цифры)
    if (taskId) {
      taskId = taskId.replace(/\D/g, "");
    }

    if (!taskId) {
      return NextResponse.json({ 
        error: "Укажите ID задания через параметр id",
        example: "https://твой-домен/api/admin/fix?id=4768627" 
      }, { status: 400 });
    }

    const headers = {
      "Authorization": `Bearer ${KONSOL_API_KEY}`,
      "Content-Type": "application/json"
    };

    // 2. Получаем инфу о задании
    const taskRes = await axios.get(`${KONSOL_BUS}/workflow/tasks/${taskId}`, { headers });
    const taskData = taskRes.data?.data || taskRes.data;

    // 3. Вытаскиваем все возможные даты (по документации Консоли)
    const sinceDate = taskData.since_date; // "2025-02-15"
    const uptoDate = taskData.upto_date;   // "2025-02-15"
    const createdAt = taskData.created_at; // "2025-02-14T09:00:00.000+00:00"
    const acceptedAt = taskData.accepted_at; // "15.02.2025" (бывает и в таком формате)
    const submittedAt = taskData.submitted_at; 

    // 4. Логика подбора Идеальной Даты для Акта
    let targetActDate = new Date().toISOString().split('T')[0]; // сегодня по UTC

    if (submittedAt) {
      targetActDate = submittedAt.split('T')[0];
    } else if (uptoDate) {
      targetActDate = uptoDate.split('T')[0];
    } else if (sinceDate) {
      targetActDate = sinceDate.split('T')[0];
    }

    // 5. Пробуем пробить финализацию с ИХ же датой
    let finalizeResult = null;
    let finalizeError = null;

    try {
      const finRes = await axios.post(`${KONSOL_BUS}/workflow/tasks/finalize`, {
        ids: [Number(taskId)],
        act_date: targetActDate,
        date: targetActDate
      }, { headers });
      
      finalizeResult = finRes.data;
    } catch (err: any) {
      finalizeError = err.response?.data || err.message;
    }

    // 6. Выводим красивый отчет
    return NextResponse.json({
      status: finalizeError ? "❌ ОШИБКА ФИНАЛИЗАЦИИ" : "✅ УСПЕШНО ФИНАЛИЗИРОВАНО",
      used_taskId: taskId,
      used_act_date: targetActDate,
      extracted_dates: {
        since_date: sinceDate,
        upto_date: uptoDate,
        created_at: createdAt,
        accepted_at: acceptedAt,
        submitted_at: submittedAt,
      },
      task_info: {
        id: taskData.id,
        state: taskData.state?.code || taskData.status, // статус задания
        act_id: taskData.act_id || finalizeResult?.acts_ids?.[0] || "Акта нет",
      },
      finalize_response: finalizeResult,
      finalize_error: finalizeError,
      raw_task_data: taskData // сырые данные
    });

  } catch (e: any) {
    return NextResponse.json({ 
      error: "Не удалось получить задание из Консоли", 
      details: e.response?.data || e.message 
    }, { status: 500 });
  }
}