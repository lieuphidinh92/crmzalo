/**
 * inventory-digest.ts — cảnh báo tồn kho cho tin nhắc hằng ngày.
 *
 * Anh Philip chốt 27/8/2026 — CHỈ 2 mục, không liệt kê cả kho:
 *   1. **Hàng bán chạy sắp hết** — trong 10 SKU bán chạy nhất, mã nào tồn không
 *      đủ bán 7 ngày tới theo tốc độ bán gần đây.
 *   2. **Hàng cận date** — lô còn tồn, hết hạn trong vòng 6 tháng.
 * Chi tiết đầy đủ xem trên phần mềm qua link, tin nhắn chỉ để NHẮC.
 *
 * ⚠️ Vì sao KHÔNG dùng `warning_stock`: ngưỡng đó mặc định 30 cho cả 977 mã
 * (gồm mã ngừng bán, mã chưa từng nhập) → cảnh báo ra 931 mã, đọc 2 hôm là cả
 * nhóm tắt thông báo. Đo thật 27/8/2026.
 *
 * ⚠️ Tốc độ bán lấy MAX(7 ngày, 30 ngày) chứ không chỉ 7 ngày: bán sỉ đơn to
 * mà thưa, nhiều mã bán chạy cả tháng nhưng đúng 7 ngày qua không có đơn nào
 * (vd OL_02: 1.060 đv/30 ngày, 0 đv/7 ngày, tồn 63 — chỉ đủ 1,8 ngày mà nhìn
 * mốc 7 ngày sẽ tưởng không cần cảnh báo).
 */
import { prisma } from '../../shared/database/prisma-client.js';

/** Xét bao nhiêu mã bán chạy nhất. */
const TOP_SELLERS = 10;
/** Tồn không đủ bán bấy nhiêu ngày tới thì cảnh báo. */
const COVER_DAYS = 7;
/** "Cận date" = hết hạn trong vòng 6 tháng. */
export const NEAR_EXPIRY_DAYS = 180;
/** Số dòng chi tiết tối đa mỗi mục trong tin nhắn. */
const TOP_N = 5;

export interface InventoryDigest {
  /** Mã bán chạy mà tồn sắp không đủ bán (gồm cả mã đã hết sạch). */
  atRisk: Array<{
    sku: string; name: string; stock: number;
    /** Tồn đủ bán bao nhiêu ngày nữa (0 = hết hàng). */
    coverDays: number;
    /** Số lượng bán trung bình 1 ngày, dùng để giải thích con số trên. */
    perDay: number;
  }>;
  /** Trong nhóm trên, bao nhiêu mã đã hết sạch. */
  outOfStockCount: number;
  /** Lô còn tồn, hết hạn trong 6 tháng tới. */
  nearExpiry: Array<{ sku: string; name: string; batchCode: string; quantity: number; daysLeft: number }>;
  /** Lô ĐÃ hết hạn mà vẫn còn tồn — phải xử lý giấy tờ, không bán được. */
  expiredCount: number;
}

export async function getInventoryDigest(orgId: string): Promise<InventoryDigest> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const expiryCutoff = new Date(now.getTime() + NEAR_EXPIRY_DAYS * 86_400_000);

  // Gộp theo SKU (không theo productId): đơn nhập từ MISA cũ có productId rỗng,
  // gộp theo productId sẽ bỏ sót lịch sử bán của chính mã đó.
  const [sold30, sold7, expiring, expiredCount] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ['sku'],
      where: { order: { orgId, orderDate: { gte: d30 }, status: { notIn: ['cancelled', 'returned'] } } },
      _sum: { quantity: true },
    }),
    prisma.orderItem.groupBy({
      by: ['sku'],
      where: { order: { orgId, orderDate: { gte: d7 }, status: { notIn: ['cancelled', 'returned'] } } },
      _sum: { quantity: true },
    }),
    prisma.inventoryBatch.findMany({
      where: {
        orgId, status: 'active', currentQuantity: { gt: 0 },
        expiryDate: { not: null, gte: now, lt: expiryCutoff },
      },
      select: {
        batchCode: true, currentQuantity: true, expiryDate: true,
        product: { select: { sku: true, name: true } },
      },
      orderBy: { expiryDate: 'asc' },
    }),
    prisma.inventoryBatch.count({ where: { orgId, status: 'expired', currentQuantity: { gt: 0 } } }),
  ]);

  type SoldRow = { sku: string; _sum: { quantity: number | null } };
  const qty30 = new Map<string, number>();
  for (const r of sold30 as SoldRow[]) qty30.set(r.sku, Number(r._sum.quantity ?? 0));
  const qty7 = new Map<string, number>();
  for (const r of sold7 as SoldRow[]) qty7.set(r.sku, Number(r._sum.quantity ?? 0));

  const topSkus = [...qty30.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_SELLERS)
    .map(([sku]) => sku);

  const products = topSkus.length
    ? await prisma.product.findMany({
        where: { orgId, sku: { in: topSkus }, sellable: true },
        select: { sku: true, name: true, totalStock: true },
      })
    : [];

  type ProductRow = { sku: string; name: string; totalStock: number };
  const atRisk = (products as ProductRow[])
    .map((p: ProductRow) => {
      // Tốc độ bán/ngày — lấy mốc nào cho con số cao hơn (xem ghi chú đầu file).
      const perDay = Math.max((qty7.get(p.sku) ?? 0) / 7, (qty30.get(p.sku) ?? 0) / 30);
      const coverDays = perDay > 0 ? p.totalStock / perDay : Infinity;
      return { sku: p.sku, name: p.name, stock: p.totalStock, coverDays, perDay };
    })
    .filter(r => r.stock <= 0 || r.coverDays < COVER_DAYS)
    .sort((a, b) => a.coverDays - b.coverDays)
    .map(r => ({
      sku: r.sku, name: r.name, stock: r.stock,
      coverDays: Number.isFinite(r.coverDays) ? Math.round(r.coverDays * 10) / 10 : 0,
      perDay: Math.round(r.perDay * 10) / 10,
    }));

  type BatchRow = {
    batchCode: string; currentQuantity: number; expiryDate: Date | null;
    product: { sku: string; name: string } | null;
  };

  return {
    atRisk,
    outOfStockCount: atRisk.filter(r => r.stock <= 0).length,
    nearExpiry: (expiring as BatchRow[]).slice(0, TOP_N).map((b: BatchRow) => ({
      sku: b.product?.sku ?? '',
      name: b.product?.name ?? '',
      batchCode: b.batchCode,
      quantity: b.currentQuantity,
      daysLeft: b.expiryDate ? Math.max(0, Math.floor((b.expiryDate.getTime() - now.getTime()) / 86_400_000)) : 0,
    })),
    expiredCount,
  };
}

/** Tổng số lô cận date (không cắt TOP_N) — để tin nhắn ghi đúng con số tổng. */
export async function countNearExpiry(orgId: string): Promise<number> {
  const now = new Date();
  return prisma.inventoryBatch.count({
    where: {
      orgId, status: 'active', currentQuantity: { gt: 0 },
      expiryDate: { not: null, gte: now, lt: new Date(now.getTime() + NEAR_EXPIRY_DAYS * 86_400_000) },
    },
  });
}
