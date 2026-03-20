// src/app/api/debug/route.ts
import { NextResponse } from "next/server";
import axios from "axios";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "20111"; 
  
  try {
    const res = await axios.get(`${process.env.RETAILCRM_API_URL}/api/v5/orders/${id}`, {
      params: { apiKey: process.env.RETAILCRM_API_KEY, by: "id" }
    });
    
    // Выводим только секцию доставки и кастомные поля, чтобы не засорять экран
    return NextResponse.json({ 
      delivery: res.data?.order?.delivery,
      customFields: res.data?.order?.customFields
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}