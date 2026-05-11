/**
 * Link orphan order_items (productId IS NULL) tới Product theo SKU.
 *
 * Lý do: MISA legacy imports lưu line items với chỉ SKU text (productId
 * NULL). Dashboard SP-level cần product_id để aggregate đúng theo brand
 * + báo cáo lịch sử bán theo SP.
 *
 * Match strategy: (orgId, sku) — unique trong catalog.
 * SKU không có trong catalog (vd SUA_3) sẽ skip — báo cảnh báo.
 *
 * Idempotent: chỉ update line có productId IS NULL.
 *
 * Usage:
 *   npx tsx scripts/link-orphan-order-items.ts            # dry-run
 *   npx tsx scripts/link-orphan-order-items.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

async function main(): Promise<void> {
  console.log(`Link orphan order_items — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const orphans = await prisma.orderItem.findMany({
    where: { productId: null },
    select: {
      id: true,
      sku: true,
      quantity: true,
      lineTotal: true,
      order: { select: { orderCode: true, orgId: true, orderDate: true } },
    },
    orderBy: { order: { orderDate: 'asc' } },
  });

  if (orphans.length === 0) {
    console.log('✓ Không có orphan order_item.');
    await prisma.$disconnect();
    return;
  }

  // Pre-fetch catalog map (orgId, sku) → productId
  const distinctSkus = Array.from(new Set(orphans.map((o) => o.sku)));
  const products = await prisma.product.findMany({
    where: { sku: { in: distinctSkus } },
    select: { id: true, sku: true, orgId: true },
  });
  const catalogMap = new Map(products.map((p) => [`${p.orgId}|${p.sku}`, p.id]));

  let toLink = 0;
  let toSkip = 0;
  const bySku: Record<string, { link: number; skip: number; revenue: number }> = {};

  console.log(`\nFound ${orphans.length} orphan line items:\n`);
  for (const oi of orphans) {
    const key = `${oi.order.orgId}|${oi.sku}`;
    const productId = catalogMap.get(key);
    const entry = bySku[oi.sku] ?? { link: 0, skip: 0, revenue: 0 };
    entry.revenue += oi.lineTotal;
    if (productId) {
      entry.link++;
      toLink++;
    } else {
      entry.skip++;
      toSkip++;
    }
    bySku[oi.sku] = entry;
  }

  for (const [sku, s] of Object.entries(bySku)) {
    const status = s.skip > 0 ? '⚠ SKU không có catalog' : '✓ match catalog';
    console.log(`  ${sku.padEnd(10)} ${(s.link + s.skip)} lines | doanh thu ${s.revenue.toLocaleString('vi-VN').padStart(12)} đ  | ${status}`);
  }

  console.log(`\nSummary:`);
  console.log(`  Sẽ link:     ${toLink} line items`);
  console.log(`  Skip:        ${toSkip} line items (SKU không có catalog)`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');
  let linked = 0;
  for (const oi of orphans) {
    const productId = catalogMap.get(`${oi.order.orgId}|${oi.sku}`);
    if (!productId) continue;
    await prisma.orderItem.update({
      where: { id: oi.id },
      data: { productId },
    });
    linked++;
    console.log(`  ✓ ${oi.order.orderCode}  ${oi.sku} ×${oi.quantity}  → productId=${productId.slice(0, 8)}…`);
  }
  console.log(`\n✅ Linked ${linked} line items. ${toSkip} skipped (no catalog).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
