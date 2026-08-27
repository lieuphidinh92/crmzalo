/**
 * email-provider.ts — gửi email qua Brevo (HTTP API, không phải SMTP).
 *
 * Vì sao Brevo (anh Philip chốt 27/8/2026): chỉ cần bấm link xác thực MỘT địa
 * chỉ gửi là dùng được, KHÔNG phải sửa DNS của halo.com.vn. Miễn phí 300
 * mail/ngày, gửi được tới bất kỳ ai — sau thêm kế toán mới chỉ cần sửa biến môi
 * trường. (Resend không cần domain thì chỉ gửi về đúng email chủ tài khoản.)
 *
 * Dùng `fetch` sẵn có của Node 22 — cố ý KHÔNG cài nodemailer để tránh thêm
 * thư viện chỉ để gửi 2 mail/ngày.
 *
 * ⚠️ 2 lỗi Brevo hay gặp, đọc kỹ `last_error` trong `notification_logs`:
 *   • 401 `unauthorized`      → API key sai/đã thu hồi.
 *   • 400 `sender not valid`  → EMAIL_FROM chưa bấm xác thực trong Brevo.
 */
import type { NotificationProvider, RenderedMessage, SendResult } from '../notification-types.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10_000;

export class EmailProvider implements NotificationProvider {
  readonly channel = 'email' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fromName: string,
    private readonly recipients: string[],
  ) {}

  async send(message: RenderedMessage): Promise<SendResult> {
    const body = {
      sender: { name: this.fromName, email: this.from },
      to: this.recipients.map(email => ({ email })),
      // Bỏ emoji ĐẦU tiêu đề: vài hộp thư doanh nghiệp chấm điểm spam cao hơn.
      // Chỉ cắt ký tự emoji + khoảng trắng — KHÔNG cắt mọi ký tự không phải chữ,
      // vì thế thì tiêu đề "[THỬ NGHIỆM] ..." bị mất luôn dấu ngoặc mở (gặp thật
      // khi gửi mail thử 27/8).
      subject: message.title.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim(),
      htmlContent: toHtml(message),
      textContent: toPlainText(message),
    };

    let res: Response;
    try {
      res = await fetch(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, error: `Không gọi được Brevo: ${(err as Error).message}` };
    }

    const raw = await res.text();
    // Brevo trả 201 khi nhận đơn gửi thành công (200 cho vài API khác).
    if (res.status !== 201 && res.status !== 200) {
      return { ok: false, error: `Brevo HTTP ${res.status}: ${raw.slice(0, 200)}` };
    }
    return { ok: true };
  }
}

/** Escape để tên khách có ký tự `<`, `&`... không phá vỡ HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `**đậm**` (kiểu Lark/markdown) → `<strong>`. Escape TRƯỚC rồi mới đổi đậm. */
function inline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Email HTML: cố tình dùng thẻ + style nội tuyến đơn giản (không CSS ngoài,
 * không ảnh) — Gmail/Outlook cắt hết mấy thứ đó và dễ vào spam hơn.
 */
function toHtml(m: RenderedMessage): string {
  const rows = m.lines
    .filter(l => l.trim() !== '')
    .map(l => `<p style="margin:4px 0;color:#1f2937">${inline(l)}</p>`)
    .join('');

  const alert = m.alert
    ? `<p style="margin:16px 0;padding:12px;background:#fef2f2;border-left:4px solid #dc2626;color:#b91c1c">
         <strong>${esc(m.alert)}</strong></p>`
    : '';

  const button = m.actionUrl
    ? `<p style="margin:20px 0">
         <a href="${esc(m.actionUrl)}"
            style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;
                   text-decoration:none;border-radius:6px">${esc(m.actionLabel || 'Mở danh sách')}</a></p>
       <p style="margin:8px 0;font-size:12px;color:#6b7280">Nếu nút không bấm được: ${esc(m.actionUrl)}</p>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;line-height:1.6;max-width:600px">
    <h2 style="margin:0 0 12px;font-size:18px;color:${m.severity === 'warning' ? '#b91c1c' : '#111827'}">${esc(m.title)}</h2>
    ${rows}${alert}${button}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="font-size:12px;color:#9ca3af">Thư tự động từ HaloVN CRM — không cần trả lời.</p>
  </div>`;
}

/** Bản chữ trơn cho hộp thư không hiện HTML (và để đỡ bị chấm spam). */
function toPlainText(m: RenderedMessage): string {
  const body = m.lines.map(l => l.replace(/\*\*/g, '')).join('\n');
  return [
    m.title,
    '',
    body,
    m.alert ? `\n⚠️ ${m.alert}` : '',
    m.actionUrl ? `\n${m.actionLabel || 'Mở danh sách'}: ${m.actionUrl}` : '',
    '\n— Thư tự động từ HaloVN CRM, không cần trả lời.',
  ].join('\n');
}
