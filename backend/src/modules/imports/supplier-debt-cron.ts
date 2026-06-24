/**
 * Supplier Debt Cron — daily check for overdue import order payments.
 *
 * Runs at 08:00 AM Asia/Ho_Chi_Minh daily. Logs a warning for each
 * import order with debtAmount > 0 and paymentDueDate < today.
 * Future: push notification to Owner/Admin.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export function startSupplierDebtCron(): void {
  // Use setInterval aligned to next 08:00 ICT
  const TZ_OFFSET = 7; // Asia/Ho_Chi_Minh = UTC+7
  const TARGET_HOUR = 8;

  function msUntilNext8am(): number {
    const now = new Date();
    const ict = new Date(now.getTime() + TZ_OFFSET * 3600_000);
    const next = new Date(ict);
    next.setUTCHours(TARGET_HOUR - TZ_OFFSET, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  async function runCheck() {
    try {
      const now = new Date();
      const overdueOrders = await prisma.importOrder.findMany({
        where: {
          status: 'confirmed',
          debtAmount: { gt: 0 },
          paymentDueDate: { lt: now },
        },
        select: {
          id: true,
          importCode: true,
          supplierId: true,
          debtAmount: true,
          paymentDueDate: true,
          supplier: { select: { name: true } },
        },
      });

      if (overdueOrders.length === 0) {
        logger.info('[supplier-debt-cron] No overdue supplier payments.');
        return;
      }

      logger.warn(
        `[supplier-debt-cron] ${overdueOrders.length} overdue supplier payment(s):`,
      );
      for (const o of overdueOrders) {
        const debt = Number(o.debtAmount);
        logger.warn(
          `  ${o.importCode} — NCC: ${o.supplier?.name ?? '?'} — Nợ: ${debt.toLocaleString()}đ — Hạn: ${o.paymentDueDate?.toISOString().slice(0, 10)}`,
        );
      }

      // Future: push notification to admin users
    } catch (err) {
      logger.error('[supplier-debt-cron] Error:', err);
    }
  }

  // Schedule first run
  const delay = msUntilNext8am();
  logger.info(
    `[supplier-debt-cron] First check in ${Math.round(delay / 60_000)}min`,
  );

  setTimeout(() => {
    runCheck();
    // Then every 24h
    setInterval(runCheck, 24 * 3600_000);
  }, delay);
}
