/**
 * Daily inventory housekeeping cron (Session 3.5D-1).
 *
 * Single job: at 00:30 Asia/Ho_Chi_Minh, sweep `inventory_batches`
 * where status='active' AND expiry_date < today and flip them to
 * status='expired'. The FIFO allocator (3.5B) already filters
 * status='active' so any pack after this run skips expired lots.
 *
 * We log a single summary line per run; no per-batch alerts here —
 * the alerts endpoint (3.5D-2) reads status directly. Adjust qty to
 * 0 is NOT performed; the warehouse may want to dispose them with a
 * paper trail (manual recall via batch-routes).
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function startInventoryCronJobs(): void {
  cron.schedule(
    '30 0 * * *',
    async () => {
      try {
        const expiredCount = await sweepExpiredBatches();
        logger.info(`[inventory-cron] Marked ${expiredCount} batch(es) as expired`);
      } catch (err) {
        logger.error('[inventory-cron] Sweep error:', err);
      }
    },
    { timezone: TZ },
  );
  logger.info(`[inventory-cron] Expired-batch sweep scheduled at 00:30 ${TZ}`);
}

/** Set status='expired' on every active batch whose expiry_date is in
 * the past (Asia/Ho_Chi_Minh). Returns the count flipped. Exported so
 * tests can call it directly without waiting for cron. */
export async function sweepExpiredBatches(): Promise<number> {
  const today = new Date();
  // Anchor on local-day-start (00:00 VN) so a batch with expiry today
  // is NOT yet expired — only strictly past dates flip.
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const result = await prisma.inventoryBatch.updateMany({
    where: {
      status: 'active',
      expiryDate: { not: null, lt: todayStart },
    },
    data: { status: 'expired' },
  });
  return result.count;
}
