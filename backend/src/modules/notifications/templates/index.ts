/**
 * templates/index.ts — bảng tra sự kiện → hàm render.
 *
 * Thêm sự kiện mới: viết 1 file trong thư mục này, khai tên vào
 * `NOTIFICATION_EVENTS` (notification-types.ts) và thêm 1 dòng ở đây. Không
 * đụng vào service, không đụng vào provider.
 */
import { renderVatPending, type VatPendingData } from './vat-pending.js';
import { renderDailyDigest, type DailyDigestData } from './daily-digest.js';
import type { NotificationEvent, RenderedMessage } from '../notification-types.js';

export function renderTemplate(
  event: NotificationEvent,
  data: Record<string, unknown>,
): RenderedMessage {
  switch (event) {
    case 'VAT_PENDING':
      return renderVatPending(data as unknown as VatPendingData);
    case 'DAILY_DIGEST':
      return renderDailyDigest(data as unknown as DailyDigestData);
    default: {
      // Bắt lỗi ngay lúc biên dịch nếu quên khai template cho sự kiện mới.
      const never: never = event;
      throw new Error(`Chưa có template cho sự kiện: ${never}`);
    }
  }
}
