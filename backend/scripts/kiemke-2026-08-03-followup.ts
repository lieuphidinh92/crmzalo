/**
 * VIỆC SAU KIỂM KÊ 03/08/2026 — 3 việc anh chốt:
 *
 *  [1] Huỷ phiên kiểm kho treo `KK-202608-001` (admin@local.dev mở 3/8 14:34, đếm 0/139 lô).
 *      Để `counting` thì app CHẶN tạo phiên kiểm mới. Kiểm đã làm bằng file → huỷ.
 *
 *  [2] Inocare: "lấy tồn trên database". Đã verify `tồn lô == tổng sổ movement` ở cả 7 mã
 *      → sổ lô là số ĐÚNG, `products.total_stock` là cột cache bị trôi (cao hơn 48đv).
 *      → resync total_stock = tổng lô active. KHÔNG đụng số lượng lô.
 *
 *  [3] Giá vốn 4 lô mới do kiểm kê tạo (`KK20260803-*`, đang `import_cost=null`).
 *      Nguồn: **cost registry `products.cost_price`** trong CRM (nguồn chuẩn của công ty,
 *      không tin Excel MISA). NM_1 khớp cả giá nhập lô gần nhất (NK-202607-015, 740.000đ).
 *      BIO_03/06/07 CHƯA có đơn nhập nào trong hệ thống — anh rà soát đơn nhập thực tế sau,
 *      tạm dùng registry để tính được lãi gộp ngay.
 *
 * Chạy:
 *   Xem trước:  DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03-followup.ts
 *   Ghi thật:   DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03-followup.ts --apply
 */
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
const STUCK_SESSION = 'KK-202608-001';
const NEW_LOT_PREFIX = 'KK20260803-';
const isInocare = (brandName: string | null, sku: string) =>
  /inocare/i.test(brandName ?? '') || /^(INC[_-]|INO-)/i.test(sku);

async function main() {
  console.log(`\n=== VIỆC SAU KIỂM KÊ 3/8 — ${APPLY ? '⚠️  GHI THẬT' : 'XEM TRƯỚC'} ===\n`);

  // ── [1] Phiên kiểm treo ──────────────────────────────────────────────────
  const stuck = await prisma.stocktakeSession.findFirst({
    where: { code: STUCK_SESSION, status: 'counting' },
    select: { id: true, code: true, itemCount: true, countedCount: true, note: true },
  });
  console.log('[1] PHIÊN KIỂM TREO');
  if (!stuck) {
    console.log(`    ${STUCK_SESSION} không còn ở trạng thái counting — bỏ qua.`);
  } else if (stuck.countedCount > 0) {
    // Có số đếm rồi thì huỷ là mất dữ liệu của người khác → dừng, báo anh.
    console.log(`    ❌ DỪNG: ${stuck.code} đã đếm ${stuck.countedCount}/${stuck.itemCount} lô — có dữ liệu, KHÔNG tự huỷ.`);
  } else {
    console.log(`    ${stuck.code} · đếm ${stuck.countedCount}/${stuck.itemCount} lô · "${stuck.note}" → sẽ huỷ`);
  }

  // ── [2] Inocare: total_stock lệch tổng lô ────────────────────────────────
  const inoProducts = await prisma.product.findMany({
    where: { OR: [{ brand: { name: { contains: 'nocare' } } }, { sku: { startsWith: 'INC_' } }, { sku: { startsWith: 'INO-' } }] },
    select: {
      id: true, sku: true, totalStock: true, brand: { select: { name: true } },
      batches: { where: { status: 'active' }, select: { currentQuantity: true } },
    },
  });
  const inoFix = inoProducts
    .filter((p) => isInocare(p.brand?.name ?? null, p.sku))
    .map((p) => ({ id: p.id, sku: p.sku, total: p.totalStock, lots: p.batches.reduce((s, b) => s + b.currentQuantity, 0) }))
    .filter((r) => r.total !== r.lots);

  console.log('\n[2] INOCARE — resync total_stock về tổng lô (số đúng theo sổ movement)');
  let delta = 0;
  for (const r of inoFix) {
    delta += r.lots - r.total;
    console.log(`    ${r.sku.padEnd(12)} total_stock ${String(r.total).padStart(5)} → ${String(r.lots).padStart(5)}  (${r.lots - r.total})`);
  }
  console.log(`    → ${inoFix.length} mã, tổng thay đổi ${delta} đv (sale-app đang hiện nhiều hơn tồn thật)`);

  // ── [3] Giá vốn 4 lô mới ─────────────────────────────────────────────────
  const newLots = await prisma.inventoryBatch.findMany({
    where: { batchCode: { startsWith: NEW_LOT_PREFIX }, importCost: null },
    select: {
      id: true, batchCode: true, currentQuantity: true,
      product: { select: { id: true, sku: true, costPrice: true } },
    },
  });
  console.log('\n[3] GIÁ VỐN 4 LÔ MỚI — lấy từ cost registry (products.cost_price)');
  const costPlan: Array<{ id: string; sku: string; cost: number; qty: number }> = [];
  for (const l of newLots) {
    const cost = l.product.costPrice ? Number(l.product.costPrice) : null;
    if (cost === null || cost <= 0) {
      console.log(`    ${l.batchCode.padEnd(22)} ❌ registry KHÔNG có giá → bỏ qua, chờ anh cấp giá nhập`);
      continue;
    }
    costPlan.push({ id: l.id, sku: l.product.sku, cost, qty: l.currentQuantity });
    console.log(`    ${l.batchCode.padEnd(22)} ${l.currentQuantity} đv × ${cost.toLocaleString('vi-VN')} đ = ${(cost * l.currentQuantity).toLocaleString('vi-VN')} đ`);
  }
  if (newLots.length === 0) console.log('    (không còn lô nào thiếu giá vốn)');

  if (!APPLY) {
    console.log('\n👀 XEM TRƯỚC — chưa ghi gì. Thêm --apply để ghi.');
    await prisma.$disconnect();
    return;
  }

  // ── GHI ──────────────────────────────────────────────────────────────────
  await prisma.$transaction(async (tx: any) => {
    if (stuck && stuck.countedCount === 0) {
      await tx.stocktakeSession.update({ where: { id: stuck.id }, data: { status: 'cancelled' } });
    }
    for (const r of inoFix) {
      await tx.product.update({ where: { id: r.id }, data: { totalStock: r.lots } });
    }
    for (const c of costPlan) {
      await tx.inventoryBatch.update({ where: { id: c.id }, data: { importCost: c.cost } });
    }
  }, { timeout: 120_000 });

  // ── VERIFY ───────────────────────────────────────────────────────────────
  const openNow = await prisma.stocktakeSession.count({ where: { status: 'counting' } });
  const inoAfter = await prisma.product.findMany({
    where: { OR: [{ sku: { startsWith: 'INC_' } }, { sku: { startsWith: 'INO-' } }] },
    select: { sku: true, totalStock: true, batches: { where: { status: 'active' }, select: { currentQuantity: true } } },
  });
  const stillDrift = inoAfter.filter((p) => p.totalStock !== p.batches.reduce((s, b) => s + b.currentQuantity, 0));
  const noCost = await prisma.inventoryBatch.count({ where: { batchCode: { startsWith: NEW_LOT_PREFIX }, importCost: null } });
  const allTotal = await prisma.product.aggregate({ _sum: { totalStock: true } });

  console.log('\n─── VERIFY ───');
  console.log(`${openNow === 0 ? '✅' : '❌'} Không còn phiên kiểm treo: ${openNow} phiên đang counting`);
  console.log(`${stillDrift.length === 0 ? '✅' : '❌'} Inocare total_stock khớp tổng lô: ${stillDrift.length} mã còn lệch`);
  console.log(`${noCost === 0 ? '✅' : '⚠️ '} Lô kiểm kê còn thiếu giá vốn: ${noCost}`);
  console.log(`Tổng tồn công ty: ${allTotal._sum.totalStock} đv`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ LỖI — transaction rollback, không có thay đổi nào:');
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
