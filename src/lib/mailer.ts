import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const FROM = `"EventWave" <${process.env.EMAIL_USER}>`;
const TO   = process.env.RECIPIENT_EMAIL!;

export async function sendAuthCode(email: string, code: string) {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Код входа: ${code}`,
    text: `Ваш код: ${code}\n\nДействителен 10 минут.`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
        <h2 style="margin:0 0 8px;color:#111">EventWave</h2>
        <p style="color:#666;margin:0 0 24px;font-size:14px">Код для входа в систему</p>
        <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:24px;text-align:center">
          <p style="margin:0 0 8px;font-size:13px;color:#999">Ваш одноразовый код</p>
          <p style="margin:0;font-size:36px;font-weight:700;letter-spacing:8px;color:#111;font-family:monospace">${code}</p>
        </div>
        <p style="margin:16px 0 0;font-size:12px;color:#999">Код действителен 10 минут. Не передавайте третьим лицам.</p>
      </div>`,
  });
}

export async function sendNewOrderAlert(order: {
  externalId: string | null;
  address: string | null;
  slotRaw: string | null;
  courier: string | null;
  items: string | null;
}) {
  if (!TO) return;
  await transporter.sendMail({
    from: FROM,
    to: TO,
    subject: `Новый заказ ${order.externalId ?? "—"} · ${order.slotRaw ?? ""}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#f9f9f9;border-radius:12px">
        <h3 style="margin:0 0 16px;color:#111">Новый заказ: ${order.externalId ?? "—"}</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr><td style="color:#888;padding:6px 0;width:120px">Адрес</td><td style="font-weight:600">${order.address ?? "—"}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Слот</td><td>${order.slotRaw ?? "—"}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Курьер</td><td>${order.courier ?? "Не назначен"}</td></tr>
          <tr><td style="color:#888;padding:6px 0">Состав</td><td style="color:#999">${order.items ?? "—"}</td></tr>
        </table>
      </div>`,
  });
}

export async function sendOrderUpdateAlert(order: {
  externalId: string | null;
  address: string | null;
  status: string;
  previousStatus?: string;
}) {
  if (!TO) return;
  await transporter.sendMail({
    from: FROM,
    to: TO,
    subject: `Заказ ${order.externalId ?? "—"} изменён → ${order.status}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:24px;background:#f9f9f9;border-radius:12px">
        <h3 style="margin:0 0 16px;color:#111">Изменение: ${order.externalId ?? "—"}</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr><td style="color:#888;padding:6px 0;width:120px">Адрес</td><td>${order.address ?? "—"}</td></tr>
          ${order.previousStatus ? `<tr><td style="color:#888;padding:6px 0">Был</td><td style="color:#888">${order.previousStatus}</td></tr>` : ""}
          <tr><td style="color:#888;padding:6px 0">Стал</td><td style="font-weight:600">${order.status}</td></tr>
        </table>
      </div>`,
  });
}

// Один аргумент — адрес берётся из RECIPIENT_EMAIL
export async function sendInvalidAddressAlert(
  orders: Array<{ externalId: string | null; address: string | null; reason: string }>
) {
  if (!TO || orders.length === 0) return;
  const rows = orders
    .map(o => `<tr>
      <td style="padding:6px 8px">${o.externalId ?? "—"}</td>
      <td style="padding:6px 8px;color:#888">${o.address ?? "—"}</td>
      <td style="padding:6px 8px;color:#d94040">${o.reason}</td>
    </tr>`).join("");
  await transporter.sendMail({
    from: FROM,
    to: TO,
    subject: `⚠ ${orders.length} заказ(ов) с проблемными адресами`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;padding:24px;background:#f9f9f9;border-radius:12px">
        <h3 style="margin:0 0 16px;color:#d94040">Проблемные адреса (${orders.length})</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse;background:#fff;border-radius:8px">
          <thead><tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left;color:#888">ID</th>
            <th style="padding:8px;text-align:left;color:#888">Адрес</th>
            <th style="padding:8px;text-align:left;color:#888">Причина</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
  });
}
export async function sendRequestAlert(text: string) {
  if (!TO) return;
  await transporter.sendMail({
    from: FROM,
    to: TO, // Письмо уйдет на адрес из переменной RECIPIENT_EMAIL
    subject: "🆕 Новая заявка с сайта Event Wave",
    text: text,
  });
}