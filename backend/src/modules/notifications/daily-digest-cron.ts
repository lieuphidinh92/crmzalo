/**
 * daily-digest-cron.ts — MỘT tin nhắc gộp 3 việc, 10:00 và 16:00 giờ VN.
 *
 * Anh Philip chốt 27/8/2026: gộp VAT + công nợ quá hạn + tồn kho vào 1 tin gửi
 * nhóm Lark "Xuất Nhập Kho", thay vì 3 tin rời (3 tin/ngày là nhóm tắt thông báo).
 *
 * File này KHÔNG biết Lark/email tồn tại — nó gom số từ 3 module nghiệp vụ rồi
 * phát `event: 'DAILY_DIGEST', audience: 'ACCOUNTING'`. Đổi kênh nhận thì sửa
 * `notification-config.ts`; bật/tắt kênh thì dùng tab Thông báo trong Cài đặt.
 *
 * Cả 3 mục đều trống → KHÔNG gửi gì (không spam tin "hôm nay không có việc").
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { notify } from './notification-service.js';
import { vnDateKey, vnHour } from './format-vn.js';
import { getVatPendingDigest, sampleVatDigest } from '../orders/vat-digest.js';
import { getDebtDigest } from '../orders/debt-digest.js';
import { getInventoryDigest, countNearExpiry } from '../inventory/inventory-digest.js';
import type { DailyDigestData } from './templates/daily-digest.js';

const TZ = 'Asia/Ho_Chi_Minh';

export function startDailyDigestCron(): void {
  cron.schedule('0 10 * * *', () => void runDailyDigest('cron'), { timezone: TZ });
  cron.schedule('0 16 * * *', () => void runDailyDigest('cron'), { timezone: TZ });
  logger.info(`[digest] Đã hẹn tin nhắc gộp lúc 10:00 và 16:00 ${TZ}`);
}

/** Ngày kiểu Việt Nam cho tiêu đề tin: 27/08/2026. */
function ngayVN(): string {
  const [y, m, d] = vnDateKey().split('-');
  return `${d}/${m}/${y}`;
}

function links() {
  // Link mở THẲNG đúng bộ lọc trên màn Tồn kho của sale-app (`?filter=`), không
  // bắt người đọc tự bấm chip. `days=180` để màn hình hiện đúng mốc 6 tháng như
  // trong tin — mặc định màn đó lọc 90 ngày.
  return {
    vat: `${config.saleAppUrl}/vat/requested`,
    congNo: `${config.saleAppUrl}/debt`,
    tonKhoHetHang: `${config.saleAppUrl}/inventory?filter=low-stock`,
    tonKhoCanDate: `${config.saleAppUrl}/inventory?filter=near-expiry&days=180`,
  };
}

/**
 * @param source 'cron' = tự động; 'manual' = anh bấm "Gửi thử" trong Cài đặt.
 *   Bấm thử dùng khoá chống trùng RIÊNG, nếu không lần thử lúc 09:00 sẽ "ăn mất"
 *   tin 10:00 thật. Không có việc gì thì bấm thử vẫn gửi TIN MẪU để biết hệ
 *   thống còn sống.
 */
export async function runDailyDigest(
  source: 'cron' | 'manual' = 'cron',
): Promise<Array<{ orgId: string; coViec: boolean; outcomes: unknown }>> {
  const results: Array<{ orgId: string; coViec: boolean; outcomes: unknown }> = [];
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true } });

    for (const org of orgs) {
      // 3 truy vấn độc lập → bắn cùng lúc, tốn đúng thời gian câu chậm nhất.
      const [vat, congNo, tonKho, nearExpiryTotal] = await Promise.all([
        getVatPendingDigest(org.id),
        getDebtDigest(org.id),
        getInventoryDigest(org.id),
        countNearExpiry(org.id),
      ]);

      const coVat = vat.totalCount > 0;
      const coCongNo = congNo.customerCount > 0 || congNo.supplierCount > 0;
      const coTonKho = tonKho.atRisk.length > 0 || nearExpiryTotal > 0 || tonKho.expiredCount > 0;
      const coViec = coVat || coCongNo || coTonKho;

      let data: DailyDigestData = {
        ngay: ngayVN(),
        vat: coVat ? vat : null,
        congNo: coCongNo
          ? {
              customerCount: congNo.customerCount, customerAmount: congNo.customerAmount,
              supplierCount: congNo.supplierCount, supplierAmount: congNo.supplierAmount,
            }
          : null,
        tonKho: coTonKho ? { ...tonKho, nearExpiryTotal } : null,
        links: links(),
      };

      if (!coViec) {
        if (source === 'cron') {
          logger.info(`[digest] Org ${org.id}: không có việc nào — không gửi.`);
          results.push({ orgId: org.id, coViec: false, outcomes: [] });
          continue;
        }
        logger.info(`[digest] Org ${org.id}: không có việc — gửi TIN MẪU để kiểm tra.`);
        data = { ...data, vat: sampleVatDigest(), isTest: true };
      }

      // Khoá chống trùng theo NGÀY + KHUNG GIỜ tính bằng giờ VN (xem format-vn).
      const slot = source === 'manual' ? `manual-${Date.now()}` : `${vnHour()}h`;

      const outcomes = await notify({
        orgId: org.id,
        event: 'DAILY_DIGEST',
        audience: 'ACCOUNTING',
        dedupeKey: `daily_digest:${vnDateKey()}:${slot}`,
        data: data as unknown as Record<string, unknown>,
      });

      logger.info(
        `[digest] Org ${org.id}: VAT ${vat.totalCount} · nợ KH ${congNo.customerCount} · ` +
          `nợ NCC ${congNo.supplierCount} · bán chạy sắp hết ${tonKho.atRisk.length} · ` +
          `cận date ${nearExpiryTotal} → ${JSON.stringify(outcomes)}`,
      );
      results.push({ orgId: org.id, coViec, outcomes });
    }
  } catch (err) {
    logger.error('[digest] Lỗi khi chạy tin nhắc gộp:', err);
  }
  return results;
}
