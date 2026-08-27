/**
 * debt-digest.ts — tổng hợp CÔNG NỢ QUÁ HẠN cho tin nhắc hằng ngày.
 *
 * Gồm 2 chiều, đừng lẫn:
 *   • Khách nợ mình  (`orders.debt_amount_value`, hạn `debt_due_date`)
 *   • Mình nợ NCC    (`import_orders.debt_amount`, hạn `payment_due_date`)
 *
 * Loại `cancelled` + `returned` khỏi công nợ khách — đúng `NON_REVENUE_STATUSES`
 * của `order-service.ts`. Đơn huỷ mà vẫn đòi nợ là sai.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { vnDateKey } from '../notifications/format-vn.js';

/** Liệt kê tối đa 3 dòng mỗi mục — tin nhắn để NHẮC, không phải bảng kê. */
const TOP_N = 3;

export interface DebtDigest {
  /** Khách nợ mình, đã quá hạn. */
  customerCount: number;
  customerAmount: number;
  topCustomers: Array<{ orderCode: string; who: string; amount: number; overdueDays: number }>;
  /** Mình nợ nhà cung cấp, đã quá hạn. */
  supplierCount: number;
  supplierAmount: number;
  topSuppliers: Array<{ importCode: string; who: string; amount: number; overdueDays: number }>;
}

/**
 * Mốc "quá hạn": ĐẦU NGÀY HÔM NAY theo lịch Việt Nam, dựng bằng
 * `new Date('YYYY-MM-DDT00:00:00Z')` — đúng luật ghi/đọc cột `@db.Date` của dự án.
 *
 * ⚠️ Vì sao KHÔNG dùng `{ lt: new Date() }` như vài chỗ cũ trong repo:
 * `debt_due_date` là cột DATE, Prisma CẮT mốc so sánh về ngày. Truyền thẳng
 * `new Date()` thì từ 00:00–07:00 giờ VN, giờ UTC vẫn là NGÀY HÔM TRƯỚC → mốc
 * lùi 1 ngày → SÓT các đơn quá hạn của hôm qua. Rạng sáng là đúng khung giờ mọi
 * lỗi múi giờ của dự án lộ ra.
 *
 * Đơn đến hạn ĐÚNG HÔM NAY thì CHƯA quá hạn (còn cả ngày để trả) — nên dùng
 * `lt` chứ không phải `lte`.
 */
function startOfTodayVN(): Date {
  return new Date(`${vnDateKey()}T00:00:00Z`);
}

function overdueDays(due: Date | null, moc: Date): number {
  if (!due) return 0;
  return Math.max(0, Math.round((moc.getTime() - due.getTime()) / 86_400_000));
}

export async function getDebtDigest(orgId: string): Promise<DebtDigest> {
  const moc = startOfTodayVN();

  const [orders, imports] = await Promise.all([
    prisma.order.findMany({
      where: {
        orgId,
        debtAmountValue: { gt: 0 },
        debtDueDate: { lt: moc },
        status: { notIn: ['cancelled', 'returned'] },
      },
      select: {
        orderCode: true, debtAmountValue: true, debtDueDate: true,
        contact: { select: { storeName: true, fullName: true } },
      },
      orderBy: { debtDueDate: 'asc' },
    }),
    prisma.importOrder.findMany({
      where: { orgId, status: 'confirmed', debtAmount: { gt: 0 }, paymentDueDate: { lt: moc } },
      select: {
        importCode: true, debtAmount: true, paymentDueDate: true,
        supplier: { select: { name: true } },
      },
      orderBy: { paymentDueDate: 'asc' },
    }),
  ]);

  type OrderRow = {
    orderCode: string; debtAmountValue: unknown; debtDueDate: Date | null;
    contact: { storeName: string | null; fullName: string | null } | null;
  };
  type ImportRow = {
    importCode: string; debtAmount: unknown; paymentDueDate: Date | null;
    supplier: { name: string } | null;
  };

  const customers = (orders as OrderRow[]).map((o: OrderRow) => ({
    orderCode: o.orderCode,
    who: o.contact?.storeName?.trim() || o.contact?.fullName?.trim() || 'Khách lẻ',
    amount: Math.round(Number(o.debtAmountValue ?? 0)),
    overdueDays: overdueDays(o.debtDueDate, moc),
  }));

  const suppliers = (imports as ImportRow[]).map((i: ImportRow) => ({
    importCode: i.importCode,
    who: i.supplier?.name?.trim() || 'NCC chưa đặt tên',
    amount: Math.round(Number(i.debtAmount ?? 0)),
    overdueDays: overdueDays(i.paymentDueDate, moc),
  }));

  return {
    customerCount: customers.length,
    customerAmount: customers.reduce((s, c) => s + c.amount, 0),
    // Sắp theo SỐ TIỀN để 3 dòng hiện ra là 3 khoản đáng đòi nhất, không phải
    // 3 khoản lẻ tẻ chỉ vì quá hạn lâu nhất.
    topCustomers: [...customers].sort((a, b) => b.amount - a.amount).slice(0, TOP_N),
    supplierCount: suppliers.length,
    supplierAmount: suppliers.reduce((s, x) => s + x.amount, 0),
    topSuppliers: [...suppliers].sort((a, b) => b.amount - a.amount).slice(0, TOP_N),
  };
}
