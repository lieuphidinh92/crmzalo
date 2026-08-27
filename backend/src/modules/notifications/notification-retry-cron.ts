/**
 * notification-retry-cron.ts — gửi lại những thông báo hỏng.
 *
 * Chạy mỗi 10 phút, nhặt các dòng `status='failed'` tới hạn `next_retry_at`.
 * Cố ý KHÔNG dùng hàng đợi (Redis/BullMQ): cả hệ thống mới có 2 tin/ngày, thêm
 * một dịch vụ nữa để chạy 2 tin là over-engineering — bảng + cron là đủ.
 *
 * Nội dung gửi lại được RENDER LẠI TỪ `payload` đã lưu, không phải chụp lại số
 * mới: tin nhắn phải khớp thời điểm sự kiện xảy ra, nếu không kế toán đọc lại
 * sẽ thấy số "nhảy" mà không hiểu vì sao.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { planChannels } from './notification-config.js';
import { renderTemplate } from './templates/index.js';
import { deliver, MAX_ATTEMPTS } from './notification-service.js';
import type { Audience, NotificationEvent } from './notification-types.js';

const TZ = 'Asia/Ho_Chi_Minh';
/** Chặn 1 vòng quét ôm quá nhiều — hỏng hàng loạt thì xử dần, không dồn cục. */
const BATCH = 20;

export function startNotificationRetryCron(): void {
  cron.schedule('*/10 * * * *', () => void runRetrySweep(), { timezone: TZ });
  logger.info(`[notify-retry] Đã hẹn quét gửi lại mỗi 10 phút (${TZ})`);
}

export async function runRetrySweep(): Promise<number> {
  let retried = 0;
  try {
    const due = await prisma.notificationLog.findMany({
      where: {
        status: 'failed',
        attempts: { lt: MAX_ATTEMPTS },
        nextRetryAt: { not: null, lte: new Date() },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: BATCH,
    });

    for (const row of due) {
      const plans = await planChannels(row.orgId, row.audience as Audience);
      const plan = plans.find(p => p.channel === row.channel);

      if (!plan?.provider) {
        // Kênh đã bị tắt/gỡ cấu hình từ lúc gửi hỏng → đừng treo dòng này mãi.
        await prisma.notificationLog.update({
          where: { id: row.id },
          data: { status: 'skipped', nextRetryAt: null, lastError: 'Kênh không còn khả dụng khi gửi lại' },
        });
        continue;
      }

      const message = renderTemplate(
        row.event as NotificationEvent,
        row.payload as Record<string, unknown>,
      );
      await deliver(row.id, plan.provider.send.bind(plan.provider), message, row.attempts + 1);
      retried += 1;
    }

    if (retried > 0) logger.info(`[notify-retry] Đã thử gửi lại ${retried} thông báo.`);
  } catch (err) {
    logger.error('[notify-retry] Lỗi khi quét gửi lại:', err);
  }
  return retried;
}
