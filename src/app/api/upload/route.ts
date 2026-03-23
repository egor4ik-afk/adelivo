import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSession } from "@/lib/auth";

const s3 = new S3Client({
  region: process.env.YANDEX_REGION || "ru-central1",
  endpoint: "https://storage.yandexcloud.net",
  credentials: {
    accessKeyId: process.env.YANDEX_ACCESS_KEY_ID!,
    secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    const ext = filename.split('.').pop() || "bin";
    const key = `chat/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.YANDEX_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    });

    // Генерируем ссылку, которая действительна 1 час (3600 секунд)
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    // Итоговая публичная ссылка на файл
    const fileUrl = `https://${process.env.YANDEX_BUCKET_NAME}.storage.yandexcloud.net/${key}`;

    return NextResponse.json({ uploadUrl, fileUrl });
  } catch (e) {
    console.error("Presigned URL error:", e);
    return NextResponse.json({ error: "Failed to generate URL" }, { status: 500 });
  }
}