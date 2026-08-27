/**
 * lark-provider.ts — gửi thông báo vào nhóm Lark bằng "Custom Bot" webhook.
 *
 * Cách lấy webhook (anh Philip tự làm được, không cần IT):
 *   Nhóm "Xuất Nhập Kho" → Cài đặt (⚙) → Bot → Add Bot → Custom Bot
 *   → copy "Webhook URL" → dán vào env LARK_WEBHOOK_ACCOUNTING trên Render.
 *   Nếu bật thêm "Signature verification" thì copy luôn Secret vào
 *   LARK_WEBHOOK_SECRET_ACCOUNTING; không bật thì để trống.
 *
 * ⚠️ BẪY: Lark trả **HTTP 200 kèm code != 0** khi lỗi (sai chữ ký, webhook bị
 * thu hồi, bot bị xoá khỏi nhóm). Chỉ nhìn `res.ok` là báo "gửi thành công" mà
 * thật ra không ai nhận được gì → BẮT BUỘC đọc `code` trong body.
 */
import { createHmac } from 'node:crypto';
import type { NotificationProvider, RenderedMessage, SendResult } from '../notification-types.js';

/** Cổng ngoài chậm thì thà báo lỗi để retry, không treo cron. */
const TIMEOUT_MS = 8000;

export class LarkProvider implements NotificationProvider {
  readonly channel = 'lark' as const;

  constructor(
    private readonly webhookUrl: string,
    /** Chỉ dùng khi nhóm bật "Signature verification". */
    private readonly secret: string = '',
  ) {}

  async send(message: RenderedMessage): Promise<SendResult> {
    const body: Record<string, unknown> = {
      msg_type: 'interactive',
      card: buildCard(message),
    };

    // Chữ ký Lark: HMAC-SHA256 với KEY = `${timestamp}\n${secret}`, dữ liệu ký
    // là chuỗi RỖNG, kết quả base64. Timestamp tính bằng GIÂY (không phải ms) —
    // sai đơn vị là lệch quá 1 giờ và Lark từ chối.
    if (this.secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      body.timestamp = timestamp;
      body.sign = createHmac('sha256', `${timestamp}\n${this.secret}`).update('').digest('base64');
    }

    let res: Response;
    try {
      res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Mạng lỗi/timeout → để service đánh dấu failed và retry sau.
      return { ok: false, error: `Không gọi được Lark: ${(err as Error).message}` };
    }

    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Lark HTTP ${res.status}: ${raw.slice(0, 200)}` };
    }

    // 200 nhưng code != 0 vẫn là THẤT BẠI (xem ghi chú đầu file).
    try {
      const json = JSON.parse(raw) as { code?: number; msg?: string; StatusCode?: number };
      const code = json.code ?? json.StatusCode ?? 0;
      if (code !== 0) {
        return { ok: false, error: `Lark code ${code}: ${json.msg ?? raw.slice(0, 200)}` };
      }
    } catch {
      return { ok: false, error: `Lark trả về không phải JSON: ${raw.slice(0, 200)}` };
    }

    return { ok: true };
  }
}

/** Đổi nội dung chung thành thẻ (card) của Lark. */
function buildCard(m: RenderedMessage): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [
    {
      tag: 'div',
      text: { tag: 'lark_md', content: m.lines.join('\n') },
    },
  ];

  if (m.alert) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      // **đậm** + màu đỏ để cảnh báo đập vào mắt trong luồng chat nhóm.
      text: { tag: 'lark_md', content: `<font color="red">**${m.alert}**</font>` },
    });
  }

  if (m.actionUrl) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: m.actionLabel || 'Mở danh sách' },
          url: m.actionUrl,
          type: 'primary',
        },
      ],
    });
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: m.title },
      template: m.severity === 'warning' ? 'red' : 'blue',
    },
    elements,
  };
}
