/**
 * One-off — Update `products.cost_price` cho 12 SKU theo cost registry mới
 * (sync sau khi review đơn nhập 1/5/2026 → 8/6/2026, anh Philip duyệt 9/6).
 *
 * Phát hiện 12 SKU có cost lệch / thay đổi:
 *
 *   P0 — CRITICAL (lệch lớn):
 *     NM_1     1.065.000 → 660.000  (-405k, -38%) — DB cũ SAI cao
 *     MH_003     815.000 → 763.200  (-51,8k, -6,4%) — Manhae 120v mới
 *     PRT_06      86.000 → 135.000  (+49k, +57%)
 *     PRT_35      90.000 → 115.000  (+25k, +28%)
 *
 *   P1 — Tăng giá NCC (cập nhật lên):
 *     MH_05      360.000 → 381.000  (+5.8%) — Vitavea Force G
 *     VTPB_02    360.000 → 380.000  (+5.6%) — Pregnacare Breast-Feeding
 *     HC_02      168.518 → 185.000  (+9.8%) — HC Ginkgo Biloba
 *     NOW_13     240.000 → 260.000  (+8.3%) — NOW Sunflower Lecithin
 *
 *   P1 — Giảm giá NCC (cập nhật xuống):
 *     VTR_18     217.250 → 173.000  (-20.4%) — Vitatree D3K2MK7 DHA Spray
 *     VTR_04     348.000 → 295.000  (-15.2%) — Vitatree Organ Fat Detox
 *
 *   P3 — SKU mới chưa có cost:
 *     USL_28           0 → 356.400  — Sun Block Cream SPF50+
 *     USL_30           0 → 653.400  — Body & Spa Whitening Scrub
 *
 * KHÔNG đụng: HC_03 (đang xem xét đổi NCC), Bioisland (-7.1% có thể là
 * buffer phí ship), PRT series biến động USD (chưa chốt chính sách),
 * NOW_01/OTB07/VTR_02/OL_03 (lệch <5%, an toàn).
 *
 * KHÔNG backfill đơn cũ — cost registry chỉ áp cho đơn mới import từ
 * hôm nay (9/6) trở đi (theo memory feedback_cost_registry rule).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/update-cost-2026-06-09.ts          # dry-run
 *   npx tsx --env-file=.env scripts/update-cost-2026-06-09.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

interface CostUpdate {
  sku: string;
  newCost: number;
  reason: string;
  priority: 'P0' | 'P1' | 'P3';
}

const UPDATES: CostUpdate[] = [
  // P0
  { sku: 'NM_1',     newCost: 660_000,  priority: 'P0', reason: 'DB cũ 1.065k sai cao 38% — NCC Hiệp Trần thực 660k' },
  { sku: 'MH_003',   newCost: 763_200,  priority: 'P0', reason: 'Manhae 120v mới — đã nhập 288 hộp T6 @763.2k' },
  { sku: 'PRT_06',   newCost: 135_000,  priority: 'P0', reason: 'Evening Primrose Oil — NCC Ngọc Liên 135k (cũ 86k sai)' },
  { sku: 'PRT_35',   newCost: 115_000,  priority: 'P0', reason: 'PRT Biotin 50v — NCC Ngọc Liên tăng giá +28%' },
  // P1 tăng
  { sku: 'MH_05',    newCost: 381_000,  priority: 'P1', reason: 'Vitavea Force G — sync registry 381k' },
  { sku: 'VTPB_02',  newCost: 380_000,  priority: 'P1', reason: 'Pregnacare Breast-Feeding — Việt Hương tăng giá 6/5' },
  { sku: 'HC_02',    newCost: 185_000,  priority: 'P1', reason: 'HC Ginkgo Biloba — KQ Minh Cảnh tăng giá +9.8%' },
  { sku: 'NOW_13',   newCost: 260_000,  priority: 'P1', reason: 'NOW Sunflower Lecithin — Ngọc Liên tăng giá +8.3%' },
  // P1 giảm
  { sku: 'VTR_18',   newCost: 173_000,  priority: 'P1', reason: 'Vitatree D3K2MK7 DHA Spray — VTC giảm giá -20.4%' },
  { sku: 'VTR_04',   newCost: 295_000,  priority: 'P1', reason: 'Vitatree Organ Fat Detox — VTC giảm giá -15.2%' },
  // P3 SKU mới
  { sku: 'USL_28',   newCost: 356_400,  priority: 'P3', reason: 'Sun Block SPF50+ — SKU mới, thêm cost' },
  { sku: 'USL_30',   newCost: 653_400,  priority: 'P3', reason: 'Body Spa Whitening Scrub — SKU mới, thêm cost' },
];

async function main(): Promise<void> {
  console.log(`Update cost registry 9/6/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(80));

  const products = await prisma.product.findMany({
    where: { sku: { in: UPDATES.map(u => u.sku) } },
    select: { id: true, sku: true, name: true, costPrice: true },
  });
  const bySku = new Map(products.map(p => [p.sku, p]));

  console.log('\n─── PLAN ─────────────────────────────────────────────────────');
  console.log(`${'Prio'.padEnd(5)}${'SKU'.padEnd(11)}${'Cost cũ'.padEnd(13)} → ${'Cost mới'.padEnd(12)}  ${'Lệch'.padStart(10)}  Lý do`);
  console.log('─'.repeat(80));

  let willUpdate = 0, willSkip = 0;
  for (const u of UPDATES) {
    const p = bySku.get(u.sku);
    if (!p) {
      console.log(`  ⚠ ${u.sku}: KHÔNG tìm thấy sản phẩm trong DB — skip`);
      willSkip++;
      continue;
    }
    const oldCost = Number(p.costPrice ?? 0);
    const diff = u.newCost - oldCost;
    const sign = diff >= 0 ? '+' : '';
    const fmt = (n: number) => n.toLocaleString('vi-VN').padStart(12);
    console.log(
      `${u.priority.padEnd(5)}${u.sku.padEnd(11)}${fmt(oldCost)} → ${fmt(u.newCost)}  ${sign}${diff.toLocaleString('vi-VN').padStart(9)}  ${u.reason.slice(0, 50)}`
    );
    if (oldCost === u.newCost) {
      console.log(`     (đã đúng — skip)`);
      willSkip++;
    } else {
      willUpdate++;
    }
  }

  console.log('');
  console.log(`Summary: ${willUpdate} sẽ update, ${willSkip} skip (đã đúng hoặc không có SP)`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────────');
  let done = 0;
  for (const u of UPDATES) {
    const p = bySku.get(u.sku);
    if (!p) continue;
    const oldCost = Number(p.costPrice ?? 0);
    if (oldCost === u.newCost) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { costPrice: u.newCost },
    });
    done++;
    console.log(`  ✓ ${u.sku.padEnd(10)} ${oldCost.toLocaleString('vi-VN').padStart(12)} → ${u.newCost.toLocaleString('vi-VN').padStart(12)}đ`);
  }
  console.log(`\n✅ Updated ${done} SKUs in DB.`);
  console.log(`Note: KHÔNG backfill OrderItem cũ — cost mới chỉ áp cho đơn import từ 9/6 trở đi.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
