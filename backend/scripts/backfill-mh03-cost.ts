/**
 * Backfill MH_03 line cost cho các đơn lịch sử có line_cost NULL.
 *
 * Lý do: MISA xuất file Sổ chi tiết với costValue=0 cho MH_03 → script
 * import-misa-full lưu NULL. CEO báo giá nhập chuẩn = 655.000đ/hộp
 * (11/05/2026) → backfill các line MH_03 đang NULL để dashboard P&L
 * phản ánh đúng.
 *
 * Idempotent: chỉ update các line MH_03 có line_cost IS NULL. Các line
 * đã có cost (kể cả 0 explicit) sẽ không bị động.
 *
 * Cập nhật trên order_items: costValue, unitCost, lineCost, profit.
 *
 * Usage:
 *   # Backfill cho 1 đơn:
 *   npx tsx scripts/backfill-mh03-cost.ts --orders=XK5812
 *
 *   # Backfill toàn bộ 7 đơn (CEO confirm):
 *   npx tsx scripts/backfill-mh03-cost.ts --orders=XK5812,XK5816,XK5820,XK5822,XK5823,XK5830,XK5836
 *
 *   # --apply để ghi DB (mặc định dry-run)
 *   npx tsx scripts/backfill-mh03-cost.ts --orders=XK5812 --apply
 */
import prismaPkg from '@prisma/client';
const { PrismaClient, Prisma } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const MH03_COST_PER_UNIT = 655_000;

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length) : undefined;
}

const ordersArg = getArg('orders');
if (!ordersArg) {
  console.error('❌ Thiếu --orders=XK5812,XK5816,...');
  process.exit(1);
}
const ORDER_CODES = ordersArg.split(',').map((s) => s.trim()).filter(Boolean);

async function main(): Promise<void> {
  console.log(`Backfill MH_03 cost = ${MH03_COST_PER_UNIT.toLocaleString('vi-VN')}đ/hộp — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Orders: ${ORDER_CODES.join(', ')}`);
  console.log('─'.repeat(70));

  const org = await prisma.organization.findFirst({ select: { id: true } });
  if (!org) throw new Error('No organization');

  const lines = await prisma.orderItem.findMany({
    where: {
      sku: 'MH_03',
      lineCost: null,
      order: { orgId: org.id, orderCode: { in: ORDER_CODES } },
    },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      lineCost: true,
      costValue: true,
      order: { select: { orderCode: true, orderDate: true } },
    },
    orderBy: { order: { orderDate: 'asc' } },
  });

  // Cảnh báo về các orderCode trong CLI args không có line MH_03 NULL
  const foundCodes = new Set(lines.map((l) => l.order.orderCode));
  const missing = ORDER_CODES.filter((c) => !foundCodes.has(c));
  if (missing.length) {
    console.log(`⚠ Không có line MH_03 (NULL cost) cho: ${missing.join(', ')}`);
    console.log('  → có thể đơn không tồn tại, hoặc đã có cost.\n');
  }

  if (lines.length === 0) {
    console.log('✓ Không có gì để backfill.');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nSẽ update ${lines.length} line item:`);
  let totalNewCost = 0;
  let totalNewProfit = 0;
  for (const l of lines) {
    const newLineCost = MH03_COST_PER_UNIT * l.quantity;
    const newProfit = l.lineTotal - newLineCost;
    totalNewCost += newLineCost;
    totalNewProfit += newProfit;
    console.log(
      `  ${l.order.orderCode}  ×${String(l.quantity).padStart(3)}  ` +
      `doanh thu ${l.lineTotal.toLocaleString('vi-VN').padStart(11)}đ  ` +
      `→ cost ${newLineCost.toLocaleString('vi-VN').padStart(11)}đ  ` +
      `lãi ${newProfit.toLocaleString('vi-VN').padStart(10)}đ`
    );
  }

  const totalRevenue = lines.reduce((s, l) => s + l.lineTotal, 0);
  console.log('\nSummary:');
  console.log(`  Số line: ${lines.length}`);
  console.log(`  Tổng doanh thu MH_03: ${totalRevenue.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Tổng giá vốn (backfill): ${totalNewCost.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Tổng lãi gộp: ${totalNewProfit.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Margin: ${((totalNewProfit / totalRevenue) * 100).toFixed(2)}%`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');
  for (const l of lines) {
    const newLineCost = MH03_COST_PER_UNIT * l.quantity;
    const newProfit = l.lineTotal - newLineCost;
    await prisma.orderItem.update({
      where: { id: l.id },
      data: {
        costValue: newLineCost,
        unitCost: new Prisma.Decimal(MH03_COST_PER_UNIT),
        lineCost: new Prisma.Decimal(newLineCost),
        profit: new Prisma.Decimal(newProfit),
      },
    });
    console.log(`  ✓ ${l.order.orderCode}  line cost = ${newLineCost.toLocaleString('vi-VN')} đ`);
  }

  console.log(`\n✅ Done. Updated ${lines.length} lines.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
