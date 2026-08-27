/**
 * vat-digest.ts — tổng hợp hàng chờ xuất VAT để đưa vào thông báo.
 *
 * Tách khỏi `vat-routes.ts` vì 2 nơi cùng cần: cron 10:00/16:00 và nút "gửi
 * thử" của admin. Cố ý KHÔNG gọi qua HTTP nội bộ — cùng tiến trình thì gọi
 * thẳng hàm, khỏi phải cầm token.
 *
 * ⚠️ Phạm vi: hàm này chạy trong cron nên KHÔNG có user → cố tình quét TOÀN BỘ
 * đơn của org (đúng như bàn xuất VAT của kế toán, vốn dùng `canIssueVatInvoice`
 * chứ không lọc theo sale). Đây là lý do nội dung gửi đi chỉ có số tổng hợp.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { config } from '../../config/index.js';
import type { VatPendingData } from '../notifications/templates/vat-pending.js';

/** Ngưỡng "chờ quá lâu" — anh Philip chốt 24 giờ. */
const OVERDUE_HOURS = 24;
/** Liệt kê tối đa 5 đơn, đủ nhận diện mà không biến tin nhắn thành bảng kê. */
const TOP_N = 5;

function hoursSince(d: Date | null, now: Date): number {
  if (!d) return 0;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 3_600_000));
}

/** Tổng tiền đơn — ưu tiên cột số (`totalAmountValue`), có VAT. */
function orderTotal(o: { totalAmountValue: unknown; totalAmount: unknown }): number {
  const v = Number(o.totalAmountValue ?? 0);
  if (v > 0) return Math.round(v);
  return Math.round(Number(o.totalAmount ?? 0));
}

/**
 * Đọc hàng chờ xuất VAT của 1 org.
 * `requested` = tab "Chờ xuất"; `partial` = tab "Xuất 1 phần" (còn thiếu tiền
 * nên vẫn phải xuất tiếp) — anh chốt 27/8/2026 là tính cả hai.
 */
export async function getVatPendingDigest(orgId: string): Promise<VatPendingData> {
  const now = new Date();

  const rows = await prisma.order.findMany({
    where: {
      orgId,
      vatInvoiceStatus: { in: ['requested', 'partial'] },
    },
    select: {
      orderCode: true,
      vatInvoiceStatus: true,
      vatRequestedAt: true,
      vatIssuedAmount: true,
      totalAmount: true,
      totalAmountValue: true,
      invoiceBuyerName: true,
      contact: { select: { storeName: true, fullName: true } },
    },
    // Chờ lâu nhất lên đầu; đơn thiếu mốc yêu cầu (data cũ) xuống cuối.
    orderBy: [{ vatRequestedAt: 'asc' }],
  });

  let requestedCount = 0;
  let requestedAmount = 0;
  let partialCount = 0;
  let partialRemaining = 0;
  let over24hCount = 0;
  let oldest: Date | null = null;

  // Kiểu ghi tay: ở repo này type của Prisma hay suy biến thành `any`, để trơ
  // thì `tsc` báo TS7006 (implicit any) — xem luật "code mới không thêm lỗi type".
  type VatRow = {
    orderCode: string;
    vatInvoiceStatus: string;
    vatRequestedAt: Date | null;
    vatIssuedAmount: number | null;
    totalAmount: unknown;
    totalAmountValue: unknown;
    invoiceBuyerName: string | null;
    contact: { storeName: string | null; fullName: string | null } | null;
  };

  const enriched = (rows as VatRow[]).map((r: VatRow) => {
    const total = orderTotal(r);
    // Đơn xuất 1 phần: kế toán chỉ quan tâm phần CÒN PHẢI xuất.
    const remaining =
      r.vatInvoiceStatus === 'partial'
        ? Math.max(0, total - Number(r.vatIssuedAmount ?? 0))
        : total;
    const waited = hoursSince(r.vatRequestedAt, now);

    if (r.vatInvoiceStatus === 'partial') {
      partialCount += 1;
      partialRemaining += remaining;
    } else {
      requestedCount += 1;
      requestedAmount += remaining;
    }
    if (r.vatRequestedAt && waited >= OVERDUE_HOURS) over24hCount += 1;
    if (r.vatRequestedAt && (!oldest || r.vatRequestedAt < oldest)) oldest = r.vatRequestedAt;

    return {
      orderCode: r.orderCode,
      buyer:
        r.invoiceBuyerName?.trim() ||
        r.contact?.storeName?.trim() ||
        r.contact?.fullName?.trim() ||
        'Khách lẻ',
      amount: remaining,
      waitedHours: waited,
    };
  });

  const oldestDate = oldest as Date | null;

  return {
    requestedCount,
    requestedAmount,
    partialCount,
    partialRemaining,
    totalCount: requestedCount + partialCount,
    totalAmount: requestedAmount + partialRemaining,
    over24hCount,
    oldestRequestedAt: oldestDate ? oldestDate.toISOString() : null,
    oldestWaitedHours: hoursSince(oldestDate, now),
    topOrders: enriched.slice(0, TOP_N),
    // Màn "Xuất VAT" của kế toán nằm ở sale-app, tab mặc định là "Chờ xuất".
    actionUrl: `${config.saleAppUrl}/vat/requested`,
  };
}

/**
 * Bộ số MẪU cho nút "gửi thử" khi không có yêu cầu nào đang chờ.
 *
 * Vì sao cần: luật là "0 đơn chờ thì không gửi", nên lúc hàng chờ trống mà bấm
 * gửi thử sẽ không có gì xảy ra — không phân biệt được "hệ thống im vì không có
 * việc" với "hệ thống hỏng". Tin mẫu luôn mang cờ `isTest` nên nội dung tự ghi
 * rõ là số giả.
 */
export function sampleVatDigest(): VatPendingData {
  const now = Date.now();
  return {
    requestedCount: 2,
    requestedAmount: 49_040_000,
    partialCount: 1,
    partialRemaining: 40_340_000,
    totalCount: 3,
    totalAmount: 89_380_000,
    over24hCount: 1,
    oldestRequestedAt: new Date(now - 30 * 3_600_000).toISOString(),
    oldestWaitedHours: 30,
    topOrders: [
      { orderCode: 'DH-TEST-0001', buyer: 'Khách hàng mẫu (dữ liệu giả)', amount: 7_700_000, waitedHours: 30 },
    ],
    actionUrl: `${config.saleAppUrl}/vat/requested`,
    isTest: true,
  };
}
