/**
 * catalog-diff.ts — CHỈ ĐỌC. Liệt kê tập sản phẩm ĐANG HIỂN THỊ trên catalog
 * sale-app (hasSales=true AND sellable=true) để so giữa local và prod.
 *
 * Chạy:  Local: npx tsx --env-file=.env scripts/catalog-diff.ts
 *        Render Shell (prod): npx tsx scripts/catalog-diff.ts
 */
import { prisma } from '../src/shared/database/prisma-client.js';

async function main() {
  // Org có nhiều product nhất (tránh đoán sai khi có nhiều org).
  const orgs = await prisma.product.groupBy({ by: ['orgId'], _count: { id: true } });
  orgs.sort((a, b) => b._count.id - a._count.id);
  const orgId = orgs[0]?.orgId;
  if (!orgId) { console.log('Không có product nào.'); return; }

  const all = await prisma.product.findMany({
    where: { orgId },
    select: { sku: true, name: true, hasSales: true, sellable: true },
    orderBy: { sku: 'asc' },
  });

  const visible = all.filter((p) => p.hasSales && p.sellable);
  const hiddenByStop = all.filter((p) => p.hasSales && !p.sellable); // ngừng bán

  console.log(`\n=== CATALOG DIFF — org ${orgId} ===`);
  console.log(`Tổng product: ${all.length}`);
  console.log(`hasSales=true: ${all.filter((p) => p.hasSales).length}`);
  console.log(`ĐANG HIỂN THỊ (hasSales & sellable): ${visible.length}`);
  console.log(`Ẩn do "Ngừng bán" (hasSales & !sellable): ${hiddenByStop.length}`);

  console.log(`\n--- DANH SÁCH SKU HIỂN THỊ (sắp xếp) ---`);
  console.log(visible.map((p) => p.sku).join(','));

  console.log(`\n--- Ẩn do Ngừng bán ---`);
  console.log(hiddenByStop.map((p) => `${p.sku} (${p.name})`).join(' | ') || '(không có)');
}
main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
