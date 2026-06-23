/**
 * PR2 — Daily recompute hạng KH (top_1 → top_4) cho tất cả org.
 *
 * 02:00 Asia/Ho_Chi_Minh — đảm bảo cron tasks/orders đã chạy xong,
 * dữ liệu order_date đã ổn định cho ngày hôm trước.
 */
import cron from 'node-cron';
import { logger } from '../../shared/utils/logger.js';
import { recomputeRanksAllOrgs } from './customer-rank-service.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function startCustomerRankCron(): void {
  cron.schedule(
    '0 2 * * *',
    async () => {
      logger.info('[customer-rank-cron] start');
      try {
        await recomputeRanksAllOrgs();
        logger.info('[customer-rank-cron] done');
      } catch (err) {
        logger.error('[customer-rank-cron] failed:', err);
      }
    },
    { timezone: TZ },
  );
  logger.info('Customer rank cron scheduled (02:00 daily, ' + TZ + ')');
}
