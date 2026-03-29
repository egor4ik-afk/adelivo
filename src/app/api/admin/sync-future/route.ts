// src/app/api/konsol/force-act/route.ts
import { NextResponse } from "next/server";
import { getKonsolTask } from "@/lib/konsol";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) return NextResponse.json({ error: "Укажите taskId" }, { status: 400 });

  try {
    const task = await getKonsolTask(taskId);
    if (!task) return NextResponse.json({ error: "Задание не найдено" });
    const oldDuties = task.duties || task.data?.duties || [];
    
    const logs = [];
    const KONSOL_API = `https://api.konsol.pro/bus/alpha`;
    const headers = {
      "Authorization": `Bearer ${process.env.KONSOL_API_KEY}`,
      "Content-Type": "application/json"
    };

    // 1. ДОБАВЛЯЕМ ПЕРВУЮ УСЛУГУ
    const add1 = await fetch(`${KONSOL_API}/workflow/duties`, {
      method: "POST", headers,
      body: JSON.stringify({ 
        task_id: Number(taskId), 
        template_id: 89135, 
        measure: "Штука", // 🔥 Вот чего ей не хватало!
        price: 530, 
        quantity: 2 
      })
    });
    logs.push({ action: "ДОБАВЛЕНИЕ 89135", status: add1.status, response: await add1.json().catch(()=>({})) });

    // 2. ДОБАВЛЯЕМ ВТОРУЮ УСЛУГУ
    const add2 = await fetch(`${KONSOL_API}/workflow/duties`, {
      method: "POST", headers,
      body: JSON.stringify({ 
        task_id: Number(taskId), 
        template_id: 89952, 
        measure: "Штука", // 🔥 Передаем и сюда
        price: 954, 
        quantity: 1 
      })
    });
    logs.push({ action: "ДОБАВЛЕНИЕ 89952", status: add2.status, response: await add2.json().catch(()=>({})) });

    // 3. УДАЛЯЕМ СТАРУЮ
    if (logs[0].status === 201 || logs[1].status === 201) {
      for (const old of oldDuties) {
        if (!old.id) continue;
        const delRes = await fetch(`${KONSOL_API}/workflow/duties/${old.id}`, { method: "DELETE", headers });
        logs.push({ action: `УДАЛЕНИЕ (ID: ${old.id})`, status: delRes.status, response: await delRes.json().catch(()=>({})) });
      }
    } else {
      logs.push({ action: "УДАЛЕНИЕ ОТМЕНЕНО", message: "Новые услуги не добавились" });
    }

    return NextResponse.json({ success: true, logs });

  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}