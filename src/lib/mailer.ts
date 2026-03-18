// src/lib/mailer.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.yandex.ru",
  port: 465,
  secure: true,
  auth: {
    user: process.env.YANDEX_EMAIL,
    pass: process.env.YANDEX_PASSWORD,
  },
});

export async function sendAuthCode(email: string, code: string) {
  await transporter.sendMail({
    from: `"FlowerOps" <${process.env.YANDEX_EMAIL}>`,
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
    from: `"FlowerOps" <${process.env.YANDEX_EMAIL}>`,
    to: operatorEmail,
    subject: `⚠ ${orders.length} заказ(ов) с проблемными адресами`,
    text: `Требуют проверки:\n\n${list}`,
  });
}
