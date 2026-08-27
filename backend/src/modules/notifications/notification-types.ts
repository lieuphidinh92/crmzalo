/**
 * notification-types.ts — hợp đồng chung của Notification Service.
 *
 * Luật kiến trúc (anh Philip chốt 27/8/2026): module nghiệp vụ (VAT, kho, công
 * nợ...) CHỈ được phát ra `{ event, audience, data }`. Nó KHÔNG biết Lark hay
 * email tồn tại. Muốn thêm kênh mới thì viết thêm 1 file trong `providers/` và
 * khai vào `notification-config.ts` — không sửa module nghiệp vụ.
 *
 * Cùng khuôn với `modules/jobs/ai-provider.ts` (interface + factory) đã chạy ổn
 * cho 3 nhà cung cấp AI — cố ý không phát minh khuôn mới.
 */

/** Nhóm người nhận. Thêm nhóm mới (SALE, KHO...) thì khai thêm ở đây. */
export const AUDIENCES = ['ACCOUNTING'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Sự kiện nghiệp vụ. Tên phải ổn định — nó nằm trong `notification_logs`. */
// VAT_PENDING giữ lại dù cron không còn phát nữa: các dòng log CŨ trên
// production mang tên này, và cron gửi-lại render LẠI từ payload cũ → xoá tên
// sự kiện là những dòng đó vỡ khi retry.
export const NOTIFICATION_EVENTS = ['VAT_PENDING', 'DAILY_DIGEST'] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Mã kênh. Trùng với cột `channel` trong `notification_logs`. */
export const CHANNELS = ['lark', 'email', 'log'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Nội dung đã render nhưng CHƯA gắn với kênh nào — mỗi provider tự chuyển thành
 * định dạng của nó (Lark thành card, email thành HTML, Telegram thành markdown).
 * Nhờ vậy đổi/thêm kênh không phải viết lại nội dung.
 */
export interface RenderedMessage {
  /** Tiêu đề 1 dòng. */
  title: string;
  /** Các dòng nội dung, đã format sẵn tiền/ngày theo kiểu VN. */
  lines: string[];
  /** Câu cảnh báo in đậm/đỏ (đơn chờ quá lâu). Không có thì bỏ trống. */
  alert?: string;
  /** Link mở thẳng màn danh sách đã lọc sẵn. */
  actionUrl?: string;
  actionLabel?: string;
  /** 'warning' → Lark tô đỏ. */
  severity: 'info' | 'warning';
}

export interface SendResult {
  ok: boolean;
  /** Câu lỗi ngắn để ghi vào `last_error` — không nhét cả stack trace. */
  error?: string;
}

/** Mọi kênh gửi đều implement đúng 2 thứ này. */
export interface NotificationProvider {
  readonly channel: Channel;
  send(message: RenderedMessage): Promise<SendResult>;
}

/** Cái mà module nghiệp vụ đưa cho `notify()`. */
export interface NotifyInput {
  orgId: string;
  event: NotificationEvent;
  audience: Audience;
  /**
   * Khoá chống trùng. Phải tự sinh theo giờ VN (xem `vnDedupeStamp`), vd
   * `vat_pending:2026-08-27:10h`. Cùng khoá + cùng kênh = chỉ gửi 1 lần duy nhất.
   */
  dedupeKey: string;
  /** Dữ liệu thô để render + lưu lại vào log. */
  data: Record<string, unknown>;
}
