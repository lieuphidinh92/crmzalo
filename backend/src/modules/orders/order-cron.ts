/**
 * Daily cron jobs for the wholesale-order workflow.
 *
 * Notifications themselves are computed on-the-fly by the
 * `/api/v1/notifications` endpoint (see notification-routes.ts), so this
 * cron does NOT enqueue records — it just emits a single log line per
 * day for ops/observability and could be extended later (e.g. Slack
 * webhook, daily digest email).
 *
 * Timezone: Asia/Ho_Chi_Minh per CLAUDE.md.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function startOrderCronJobs(): void {
  // 08:00 daily — overdue debt + expiring-batch summary across all orgs.
  cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        await runDailyDigest();
      } catch (err) {
        logger.error('[order-cron] Daily digest error:', err);
      }
    },
    { timezone: TZ },
  );

  logger.info(`[order-cron] Daily digest scheduled at 08:00 ${TZ}`);
}

async function runDailyDigest(): Promise<void> {
  const now = new Date();
  const horizon90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [overdueAll, expiringAll, orgs] = await Promise.all([
    prisma.order.count({
      where: {
        debtAmountValue: { gt: 0 },
        debtDueDate: { lt: now },
        status: { notIn: ['cancelled'] },
      },
    }),
    prisma.inventoryBatch.count({
      where: {
        status: 'active',
        currentQuantity: { gt: 0 },
        expiryDate: { not: null, lt: horizon90 },
      },
    }),
    prisma.organization.findMany({ select: { id: true, name: true } }),
  ]);

  logger.info(
    `[order-cron] Daily digest — ${orgs.length} org(s) · ${overdueAll} đơn quá hạn nợ · ${expiringAll} lô sắp hết hạn`,
  );
}

/**
 * Manual trigger for tests + ad-hoc admin runs (not exposed via HTTP).
 */
export async function runOrderDailyDigestNow(): Promise<void> {
  return runDailyDigest();
}
