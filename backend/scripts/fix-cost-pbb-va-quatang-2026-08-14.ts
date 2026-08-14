/**
 * Sửa giá vốn gõ nhầm nghìn/đồng (2 lô PBB) + đánh dấu lô quà tặng  (14/08/2026)
 *
 * [1] LỖI GÕ NHẦM NGHÌN/ĐỒNG — phiếu NK-202608-016 (11/08/2026)
 *     Lô `24SP33` (PBB_01)  ghi giá vốn      94 đ/hộp — đúng là  94.250 đ
 *     Lô `24SP31` (PBB_001) ghi giá vốn      81 đ/hộp — đúng là  81.250 đ
 *     (94 và 81 khớp CHÍNH XÁC phần nghìn của giá thật → gõ theo nghìn.
 *      Giá chuẩn lấy từ `scripts/seed-product-pbb.ts`: bảng báo giá BTH
 *      01/11/2025, giá nhập = 65% giá lẻ niêm yết.)
 *
 *     Hệ quả đã xảy ra: `syncProductCostAndStock` tính cost_price = trung bình
 *     gia quyền theo lô active → registry bị kéo xuống
 *       PBB_01 : (48×94 + 3×94.250)/51 = 5.633 đ   (đúng phải 94.250)
 *       PBB_001: (48×81 + 1×81.250)/49 = 1.738 đ   (đúng phải 81.250)
 *     → giá vốn hiển thị ở màn sản phẩm sai, và 96 hộp này khi bán sẽ ghi
 *     `order_item_batches.cost_at_time` ≈ 0 → lãi gộp thổi phồng ~8,4 triệu.
 *
 *     Kiểm 14/08: CHƯA bán hộp nào từ 2 lô này → chưa hỏng báo cáo quá khứ.
 *
 *     ⚠️ KHÔNG ĐỤNG PHIẾU NHẬP & CÔNG NỢ NCC. Tổng phiếu NK-202608-016 hiện là
 *     51.068.424 đ (tính theo giá sai) nên công nợ BTH có thể đang thiếu
 *     ~8,4 triệu. Anh Philip đối chiếu hóa đơn BTH rồi mới sửa phiếu + công nợ
 *     ở bước riêng — đó là bút toán kế toán, không gộp vào việc sửa giá vốn kho.
 *
 * [2] LÔ QUÀ TẶNG — `USL_0333` "(QUÀ TẶNG) 50ML Kem truyền trắng Light Cream"
 *     Anh Philip chốt 14/08/2026: giá vốn **0 là ĐÚNG** (hàng tặng, không mua).
 *     Ghi 0 tường minh + ghi chú vào lô để lần sau không ai tưởng là thiếu sót.
 *
 * [3] `USL_49` "RETIN A 30ml" (4 đv) — CHỜ anh Philip cấp giá nhập. Chỉ ghi chú,
 *     KHÔNG đặt giá. Lô này bán ra sẽ ghi giá vốn 0 → đừng bán trước khi có giá.
 *
 * Chạy:
 *   Xem trước:  DATABASE_URL='<url>' npx tsx scripts/fix-cost-pbb-va-quatang-2026-08-14.ts
 *   Ghi thật:   DATABASE_URL='<url>' npx tsx scripts/fix-cost-pbb-va-quatang-2026-08-14.ts --apply
 *
 * Idempotent: chạy lại cho cùng kết quả (update theo giá trị đích, không cộng dồn).
 */
import fs from 'node:fs';
import path from 'node:path';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
const vnd = (n: number) => n.toLocaleString('vi-VN');

/** Giá nhập chuẩn theo bảng báo giá BTH 01/11/2025 (xem seed-product-pbb.ts). */
const COST_FIX: Array<{ batchCode: string; sku: string; cost: number }> = [
  { batchCode: '24SP33', sku: 'PBB_01', cost: 94_250 },
  { batchCode: '24SP31', sku: 'PBB_001', cost: 81_250 },
];

const GIFT_LOT = { batchCode: 'KK-20270501', sku: 'USL_0333' };
const PENDING_LOT = { batchCode: 'KK-NODATE', sku: 'USL_49' };
const GIFT_NOTE = 'Quà tặng NCC — giá vốn 0 là CỐ Ý (anh Philip chốt 14/08/2026), không phải thiếu sót.';
const PENDING_NOTE = 'THIẾU giá vốn — chờ anh Philip cấp giá nhập (ghi 14/08/2026). Đừng bán trước khi có giá.';

/** Tính lại products.cost_price = TB gia quyền lô active (mirror syncProductCostAndStock). */
async function resyncCostPrice(tx: any, productId: string): Promise<number | null> {
  const batches = await tx.inventoryBatch.findMany({
    where: { productId, status: 'active', currentQuantity: { gt: 0 } },
    select: { currentQuantity: true, importCost: true },
  });
  let costSum = 0;
  let qtySum = 0;
  for (const b of batches) {
    if (b.importCost == null) continue;
    costSum += Number(b.importCost) * b.currentQuantity;
    qtySum += b.currentQuantity;
  }
  if (qtySum === 0) return null;
  const avg = costSum / qtySum;
  await tx.product.update({
    where: { id: productId },
    data: { costPrice: new Prisma.Decimal(avg.toFixed(2)) },
  });
  return avg;
}

async function findLot(sku: string, batchCode: string) {
  return prisma.inventoryBatch.findFirst({
    where: { batchCode, product: { sku } },
    select: {
      id: true,
      batchCode: true,
      currentQuantity: true,
      importCost: true,
      notes: true,
      product: { select: { id: true, sku: true, name: true, costPrice: true } },
    },
  });
}

async function main(): Promise<void> {
  console.log('\n[1] SỬA GIÁ VỐN GÕ NHẦM NGHÌN/ĐỒNG — phiếu NK-202608-016\n');
  const fixes: Array<{ id: string; productId: string; sku: string; batchCode: string; from: number; to: number; qty: number }> = [];
  for (const f of COST_FIX) {
    const lot = await findLot(f.sku, f.batchCode);
    if (!lot) {
      console.log(`  ⚠️  Không tìm thấy lô ${f.batchCode} của ${f.sku} — bỏ qua`);
      continue;
    }
    const from = lot.importCost == null ? 0 : Number(lot.importCost);
    if (from === f.cost) {
      console.log(`  ✅ ${f.sku.padEnd(9)} ${f.batchCode} đã đúng ${vnd(f.cost)} đ — không cần sửa`);
      continue;
    }
    fixes.push({
      id: lot.id, productId: lot.product.id, sku: f.sku, batchCode: f.batchCode,
      from, to: f.cost, qty: lot.currentQuantity,
    });
    console.log(
      `  ${f.sku.padEnd(9)} ${f.batchCode}  ${lot.currentQuantity} đv:  ` +
        `${vnd(from)} đ → ${vnd(f.cost)} đ   (giá trị tồn +${vnd((f.cost - from) * lot.currentQuantity)} đ)`,
    );
    console.log(`      registry hiện tại: ${vnd(Number(lot.product.costPrice ?? 0))} đ → sẽ resync sau khi sửa lô`);
  }

  console.log('\n[2] LÔ QUÀ TẶNG — ghi 0 tường minh + ghi chú');
  const gift = await findLot(GIFT_LOT.sku, GIFT_LOT.batchCode);
  if (gift) {
    const already = Number(gift.importCost ?? -1) === 0 && (gift.notes ?? '').includes('Quà tặng NCC');
    console.log(
      `  ${GIFT_LOT.sku.padEnd(9)} ${gift.batchCode}  ${gift.currentQuantity} đv  ` +
        `giá vốn ${gift.importCost == null ? 'NULL' : vnd(Number(gift.importCost))} → 0 + ghi chú` +
        (already ? '  (đã làm rồi)' : ''),
    );
  } else console.log(`  ⚠️  Không tìm thấy lô ${GIFT_LOT.batchCode} của ${GIFT_LOT.sku}`);

  console.log('\n[3] LÔ CHỜ GIÁ — chỉ ghi chú, KHÔNG đặt giá');
  const pending = await findLot(PENDING_LOT.sku, PENDING_LOT.batchCode);
  if (pending) {
    console.log(
      `  ${PENDING_LOT.sku.padEnd(9)} ${pending.batchCode}  ${pending.currentQuantity} đv  ` +
        `giá vốn vẫn để trống — ${pending.product.name}`,
    );
  } else console.log(`  ⚠️  Không tìm thấy lô ${PENDING_LOT.batchCode} của ${PENDING_LOT.sku}`);

  if (!APPLY) {
    console.log('\n👀 XEM TRƯỚC — chưa ghi gì. Thêm --apply để ghi thật.\n');
    await prisma.$disconnect();
    return;
  }

  // ── Backup ─────────────────────────────────────────────────────────────
  const dir = path.join(import.meta.dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'backup-fix-cost-pbb-va-quatang-2026-08-14.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: 'Giá vốn lô + registry TRƯỚC khi sửa. Rollback: set lại các giá trị "before".',
        lots: fixes.map((f) => ({ batchCode: f.batchCode, sku: f.sku, importCostBefore: f.from })),
        registryBefore: await Promise.all(
          [...new Set(fixes.map((f) => f.sku))].map(async (sku) => {
            const p = await prisma.product.findFirst({ where: { sku }, select: { sku: true, costPrice: true } });
            return { sku, costPrice: p?.costPrice ? Number(p.costPrice) : null };
          }),
        ),
        giftLot: gift ? { batchCode: gift.batchCode, sku: gift.product.sku, importCostBefore: gift.importCost == null ? null : Number(gift.importCost), notesBefore: gift.notes } : null,
        pendingLot: pending ? { batchCode: pending.batchCode, sku: pending.product.sku, notesBefore: pending.notes } : null,
      },
      null,
      2,
    ),
  );
  console.log(`\n💾 Backup: ${file}`);

  // ── Ghi ────────────────────────────────────────────────────────────────
  const resynced: Array<{ sku: string; avg: number | null }> = [];
  await prisma.$transaction(
    async (tx: any) => {
      for (const f of fixes) {
        await tx.inventoryBatch.update({
          where: { id: f.id },
          data: { importCost: new Prisma.Decimal(f.to.toFixed(2)) },
        });
      }
      // Resync registry SAU khi lô đã đúng.
      for (const pid of [...new Set(fixes.map((f) => f.productId))]) {
        const sku = fixes.find((f) => f.productId === pid)!.sku;
        resynced.push({ sku, avg: await resyncCostPrice(tx, pid) });
      }
      if (gift) {
        const notes = (gift.notes ?? '').includes('Quà tặng NCC')
          ? gift.notes
          : [gift.notes, GIFT_NOTE].filter(Boolean).join(' — ');
        await tx.inventoryBatch.update({
          where: { id: gift.id },
          data: { importCost: new Prisma.Decimal('0.00'), notes },
        });
      }
      if (pending) {
        const notes = (pending.notes ?? '').includes('chờ anh Philip cấp giá')
          ? pending.notes
          : [pending.notes, PENDING_NOTE].filter(Boolean).join(' — ');
        await tx.inventoryBatch.update({ where: { id: pending.id }, data: { notes } });
      }
    },
    { timeout: 120_000 },
  );
  console.log(`✍️  Đã sửa ${fixes.length} lô + ghi chú 2 lô đặc biệt.`);
  for (const r of resynced) {
    console.log(`    registry ${r.sku}: → ${r.avg === null ? 'giữ nguyên' : vnd(Math.round(r.avg)) + ' đ'}`);
  }

  // ── Verify ─────────────────────────────────────────────────────────────
  console.log('\n🔍 VERIFY');
  for (const f of COST_FIX) {
    const lot = await findLot(f.sku, f.batchCode);
    const lotCost = Number(lot?.importCost ?? 0);
    const reg = Number(lot?.product.costPrice ?? 0);
    console.log(
      `  ${f.sku.padEnd(9)} lô=${vnd(lotCost)} đ · registry=${vnd(reg)} đ  ` +
        (lotCost === f.cost && reg === f.cost ? '✅' : '⚠️ LỆCH'),
    );
  }
  const lowCost = await prisma.$queryRaw<Array<{ sku: string; batch_code: string }>>`
    select p.sku, b.batch_code from inventory_batches b join products p on p.id = b.product_id
    where b.import_cost > 0 and b.current_quantity > 0
      and b.import_cost < 0.10 * coalesce((select min(pr.price) from product_prices pr
                                            where pr.product_id = p.id and pr.active), 0)
  `;
  console.log(`  Lô còn giá vốn bất thường (<10% giá bán): ${lowCost.length}` +
    (lowCost.length ? ` → ${lowCost.map((l) => l.sku + '/' + l.batch_code).join(', ')}` : ' ✅'));

  const mismatch = await prisma.$queryRaw<Array<{ sku: string }>>`
    select p.sku from products p
    left join inventory_batches b on b.product_id = p.id and b.status = 'active' and b.current_quantity > 0
    group by p.id, p.sku, p.total_stock
    having p.total_stock <> coalesce(sum(b.current_quantity), 0)
  `;
  console.log(`  Mã lệch total_stock: ${mismatch.length}` + (mismatch.length === 0 ? ' ✅ (không đụng số lượng)' : ' ⚠️'));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('LỖI:', err);
  await prisma.$disconnect();
  process.exit(1);
});
