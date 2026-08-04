/**
 * 04/08/2026 — 2 việc:
 *
 *  [1] Sửa tồn NEU_01: phiếu kiểm 3/8 điền nhầm 7 (đúng là 74 — anh Philip xác nhận 4/8).
 *      Hôm nay 14:26 đã bán 5 hủ (đơn đóng gói, FIFO trừ lô 32281AA).
 *      → tồn đích HIỆN TẠI = 74 − 5 = 69.
 *
 *  [2] Resync `products.total_stock` cho MỌI SKU đang lệch tổng lô.
 *      Nguyên nhân gốc: processFIFO/reverseFIFO trừ-cộng lô mà KHÔNG sync cột
 *      denormalized này (đã vá trong fifo-service.ts cùng ngày). Script dọn phần
 *      số liệu đã lệch từ trước khi vá.
 *
 * Chạy:
 *   Xem trước:  DATABASE_URL='<url>' npx tsx scripts/fix-neu01-va-resync-2026-08-04.ts
 *   Ghi thật:   DATABASE_URL='<url>' npx tsx scripts/fix-neu01-va-resync-2026-08-04.ts --apply
 */
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
const SKU = 'NEU_01';
const TARGET = 69; // 74 (kiểm đúng 3/8) − 5 (đã bán 4/8)
const NOTE = 'Sửa số kiểm 3/8 điền nhầm 7 → 74; trừ 5 hủ đã bán 4/8 → 69';

async function main() {
  console.log(`\n=== 4/8/2026 — ${APPLY ? '⚠️  GHI THẬT' : 'XEM TRƯỚC'} ===\n`);

  const org = await prisma.organization.findFirst({ select: { id: true } });
  const actor = await prisma.user.findFirst({
    where: { role: { in: ['owner', 'admin'] }, isActive: true },
    select: { id: true, email: true },
  });
  if (!org || !actor) throw new Error('Không tìm thấy org / user owner-admin');

  // ── [1] NEU_01 ───────────────────────────────────────────────────────────
  const p = await prisma.product.findFirst({
    where: { orgId: org.id, sku: SKU },
    select: {
      id: true, sku: true, name: true, totalStock: true,
      batches: {
        where: { status: 'active' },
        select: { id: true, batchCode: true, currentQuantity: true, importCost: true, expiryDate: true },
        orderBy: [{ expiryDate: 'desc' }, { importedAt: 'desc' }],
      },
    },
  });
  if (!p) throw new Error(`Không tìm thấy SKU ${SKU}`);

  const lotSum = p.batches.reduce((s, b) => s + b.currentQuantity, 0);
  const delta = TARGET - lotSum;
  // Dồn chênh lệch vào lô mới nhất CÓ giá vốn (để lãi gộp vẫn tính được).
  const target = p.batches.find((b) => b.importCost != null) ?? p.batches[0];

  console.log(`[1] ${p.sku} — ${p.name}`);
  console.log(`    total_stock đang hiện : ${p.totalStock}`);
  console.log(`    tổng lô thật          : ${lotSum}`);
  console.log(`    tồn đích              : ${TARGET}  (74 kiểm đúng − 5 đã bán hôm nay)`);
  console.log(`    → cộng ${delta > 0 ? '+' : ''}${delta} vào lô ${target?.batchCode} (${target?.currentQuantity} → ${(target?.currentQuantity ?? 0) + delta})`);

  // ── [2] Mọi SKU lệch total_stock ─────────────────────────────────────────
  const all = await prisma.product.findMany({
    where: { orgId: org.id },
    select: {
      id: true, sku: true, totalStock: true,
      batches: { where: { status: 'active' }, select: { currentQuantity: true } },
    },
  });
  const drift = all
    .map((x) => ({ id: x.id, sku: x.sku, total: x.totalStock, lots: x.batches.reduce((s, b) => s + b.currentQuantity, 0) }))
    .filter((r) => r.total !== r.lots && r.sku !== SKU);

  console.log(`\n[2] SKU lệch total_stock vs tổng lô: ${drift.length}`);
  for (const d of drift.sort((a, b) => Math.abs(b.total - b.lots) - Math.abs(a.total - a.lots))) {
    console.log(`    ${d.sku.padEnd(12)} hiện ${String(d.total).padStart(5)} → đúng ${String(d.lots).padStart(5)}  (${d.lots - d.total})`);
  }
  if (drift.length === 0) console.log('    ✅ không có mã nào lệch');

  if (!APPLY) {
    console.log('\n👀 XEM TRƯỚC — chưa ghi. Thêm --apply để ghi.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx: any) => {
    if (delta !== 0 && target) {
      await tx.inventoryBatch.update({
        where: { id: target.id },
        data: { currentQuantity: target.currentQuantity + delta },
      });
      await tx.inventoryMovement.create({
        data: {
          orgId: org.id, productId: p.id, batchId: target.id,
          type: 'adjust', quantity: delta,
          referenceType: 'manual_adjust',
          note: `[${target.batchCode}] ${NOTE}`,
          createdById: actor.id,
        },
      });
    }
    // Sync NEU_01 + mọi mã lệch
    for (const pid of [p.id, ...drift.map((d) => d.id)]) {
      const sum = await tx.inventoryBatch.aggregate({
        where: { productId: pid, status: 'active' },
        _sum: { currentQuantity: true },
      });
      const total = sum._sum.currentQuantity ?? 0;
      await tx.product.update({
        where: { id: pid },
        data: { totalStock: total, ...(total > 0 ? { hasSales: true } : {}) },
      });
    }
  }, { timeout: 120_000 });

  // ── VERIFY ───────────────────────────────────────────────────────────────
  const after = await prisma.product.findMany({
    where: { orgId: org.id },
    select: {
      sku: true, totalStock: true,
      batches: { where: { status: 'active' }, select: { currentQuantity: true } },
    },
  });
  const stillDrift = after.filter((x) => x.totalStock !== x.batches.reduce((s, b) => s + b.currentQuantity, 0));
  const neu = after.find((x) => x.sku === SKU);

  console.log('\n─── VERIFY ───');
  console.log(`${neu?.totalStock === TARGET ? '✅' : '❌'} ${SKU} = ${neu?.totalStock} (đích ${TARGET})`);
  console.log(`${stillDrift.length === 0 ? '✅' : '❌'} Không còn SKU lệch total_stock: ${stillDrift.length} mã${stillDrift.length ? ' → ' + stillDrift.map((x) => x.sku).join(', ') : ''}`);
  console.log(`Tổng tồn công ty: ${after.reduce((s, x) => s + x.totalStock, 0)} đv`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ LỖI — transaction rollback, không ghi gì:');
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
