/**
 * vat-notify-cron.ts — nhắc kế toán còn yêu cầu xuất VAT đang chờ.
 *
 * 10:00 và 16:00 giờ Việt Nam mỗi ngày (anh Philip chốt 27/8/2026).
 * KHÔNG có đơn nào chờ → KHÔNG gửi gì (không spam nhóm bằng tin "0 đơn").
 *
 * File này KHÔNG biết Lark hay email tồn tại — nó chỉ phát ra
 * `event: 'VAT_PENDING', audience: 'ACCOUNTING'`. Muốn đổi kênh nhận thì sửa
 * `modules/notifications/notification-config.ts`, không sửa ở đây.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { notify } from '../notifications/notification-service.js';
import { vnDateKey, vnHour } from '../notifications/format-vn.js';
import { getVatPendingDigest } from './vat-digest.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function startVatNotifyCron(): void {
  // 2 khung giờ, cùng 1 hàm. node-cron tự quy đổi theo TZ nên không phải tính tay.
  cron.schedule('0 10 * * *', () => void runVatPendingDigest('cron'), { timezone: TZ });
  cron.schedule('0 16 * * *', () => void runVatPendingDigest('cron'), { timezone: TZ });
  logger.info(`[vat-notify] Đã hẹn nhắc xuất VAT lúc 10:00 và 16:00 ${TZ}`);
}

/**
 * Quét mọi org rồi phát thông báo.
 *
 * @param source 'cron' = chạy tự động; 'manual' = anh bấm nút gửi thử.
 *   Bấm thử KHÔNG được dùng chung khoá chống trùng với cron, nếu không lần thử
 *   lúc 09:00 sẽ "ăn mất" tin 10:00 thật (dòng log đã tồn tại → cron im lặng bỏ qua).
 */
export async function runVatPendingDigest(
  source: 'cron' | 'manual' = 'cron',
): Promise<Array<{ orgId: string; totalCount: number; outcomes: unknown }>> {
  const results: Array<{ orgId: string; totalCount: number; outcomes: unknown }> = [];
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true } });

    for (const org of orgs) {
      const digest = await getVatPendingDigest(org.id);

      if (digest.totalCount === 0) {
        logger.info(`[vat-notify] Org ${org.id}: không có yêu cầu chờ — không gửi.`);
        results.push({ orgId: org.id, totalCount: 0, outcomes: [] });
        continue;
      }

      // Khoá chống trùng: theo NGÀY + KHUNG GIỜ tính bằng giờ VN.
      // Dùng vnDateKey/vnHour chứ không phải toISOString — lúc 00:00–07:00 giờ
      // VN, toISOString trả ngày HÔM TRƯỚC nên khoá sẽ trùng sang ngày cũ.
      const slot = source === 'manual' ? `manual-${Date.now()}` : `${vnHour()}h`;
      const dedupeKey = `vat_pending:${vnDateKey()}:${slot}`;

      const outcomes = await notify({
        orgId: org.id,
        event: 'VAT_PENDING',
        audience: 'ACCOUNTING',
        dedupeKey,
        data: digest as unknown as Record<string, unknown>,
      });

      logger.info(
        `[vat-notify] Org ${org.id}: ${digest.totalCount} yêu cầu chờ ` +
          `(${digest.over24hCount} quá 24h) → ${JSON.stringify(outcomes)}`,
      );
      results.push({ orgId: org.id, totalCount: digest.totalCount, outcomes });
    }
  } catch (err) {
    logger.error('[vat-notify] Lỗi khi chạy digest:', err);
  }
  return results;
}
