/**
 * hide-skus-2026-06-30.ts — Ngừng bán 6 mã TRÙNG/CŨ (đặt sellable=false) cho
 * khớp catalog đã chốt. CHỈ đổi cờ hiển thị — KHÔNG đụng đơn/khách/giá/tồn.
 *
 * 6 mã (theo anh Philip 30/06/2026):
 *   MNH-MEN-60 (đã có MH_02 thay), BIO-CAL-90, BIO-VTD-90, INO-COL-60,
 *   MNH-CYC-60, MNH-PMS-60.
 *
 * DRY_RUN mặc định. DRY_RUN=0 để ghi. In backup trước khi ghi.
 *   Render Shell (prod): npx tsx scripts/hide-skus-2026-06-30.ts          # xem
 *                        DRY_RUN=0 npx tsx scripts/hide-skus-2026-06-30.ts # ghi
 */
import { prisma } from '../src/shared/database/prisma-client.js';

const DRY = process.env.DRY_RUN !== '0';
const SKUS = ['MNH-MEN-60', 'BIO-CAL-90', 'BIO-VTD-90', 'INO-COL-60', 'MNH-CYC-60', 'MNH-PMS-60'];

async function main() {
  console.log(`\n=== HIDE SKUS (Ngừng bán) — ${DRY ? 'DRY-RUN' : '⚠️  GHI THẬT'} ===\n`);
  const rows = await prisma.product.findMany({
    where: { sku: { in: SKUS } },
    select: { id: true, sku: true, name: true, hasSales: true, sellable: true },
    orderBy: { sku: 'asc' },
  });

  const found = new Set(rows.map((r) => r.sku));
  const missing = SKUS.filter((s) => !found.has(s));

  console.log('Backup (trạng thái cũ):');
  console.log(JSON.stringify(rows.map((r) => ({ sku: r.sku, hasSales: r.hasSales, sellable: r.sellable }))));
  console.log('');
  for (const r of rows) {
    const willChange = r.sellable === true;
    console.log(`  ${r.sku.padEnd(12)} ${r.name}`);
    console.log(`      sellable: ${r.sellable} → false ${willChange ? '(đổi)' : '(đã ẩn rồi, bỏ qua)'}`);
  }
  if (missing.length) console.log(`\n⚠️  Không tìm thấy: ${missing.join(', ')}`);

  if (DRY) {
    console.log('\n[DRY-RUN] Chưa ghi. Chạy lại DRY_RUN=0 để ngừng bán thật.\n');
    return;
  }

  const res = await prisma.product.updateMany({
    where: { sku: { in: SKUS }, sellable: true },
    data: { sellable: false },
  });
  console.log(`\n[APPLY] Đã đặt Ngừng bán ${res.count} mã.`);

  const after = await prisma.product.count({ where: { sku: { in: SKUS }, sellable: true } });
  console.log(after === 0 ? '✅ Cả 6 mã đã Ngừng bán.' : `⚠️  Còn ${after} mã vẫn đang bán — kiểm lại.`);
}
main().catch((e) => { console.error('ERR', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
