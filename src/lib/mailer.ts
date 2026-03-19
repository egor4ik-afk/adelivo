import nodemailer from "nodemailer";

// Используем переменные из вашего .env
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // true для 465, false для остальных (включая 587)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Адрес отправителя по умолчанию
const sender = `"FlowerOps" <${process.env.EMAIL_USER}>`;

export async function sendAuthCode(email: string, code: string) {
  await transporter.sendMail({
    from: sender,
    to: email,
    subject: `Код входа: ${code}`,
    text: `Ваш код для входа: ${code}\n\nКод действителен 10 минут.\n\nЕсли вы не запрашивали код — игнорируйте это письмо.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#111">FlowerOps</h2>
        <p style="color:#666;margin:0 0 24px;font-size:14px">Код для входа в систему</p>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:24px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#999">Ваш одноразовый код</p>
          <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:#111;font-family:monospace">${code}</p>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#999">Код действителен 10 минут. Не передавайте его третьим лицам.</p>
      </div>
    `,
  });
}

export async function sendInvalidAddressAlert(
  operatorEmail: string,
  orders: Array<{ externalId: string | null; address: string | null; reason: string }>
) {
  const list = orders
    .map((o) => `• ${o.externalId ?? "—"}: ${o.address ?? "нет адреса"} (${o.reason})`)
    .join("\n");

  await transporter.sendMail({
    from: sender,
    to: operatorEmail, // Можно использовать process.env.RECIPIENT_EMAIL, если нужно отправлять всегда на один адрес
    subject: `⚠ ${orders.length} заказ(ов) с проблемными адресами`,
    text: `Требуют проверки:\n\n${list}`,
  });
}