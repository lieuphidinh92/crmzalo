/**
 * Nạp giá vốn cho các lô kiểm kê còn thiếu `import_cost`   (14/08/2026)
 *
 * VẤN ĐỀ
 *   26 lô do kiểm kê tạo (mã `KK-*`) đang `import_cost = NULL` mà vẫn còn tồn
 *   (826 đv). `fifo-service.ts:172` xử lý null bằng `costPerUnit = 0`:
 *
 *       const costPerUnit = batch.importCost == null ? 0 : Number(batch.importCost);
 *
 *   → bán từ các lô này thì `order_item_batches.cost_at_time = 0`, tức GIÁ VỐN 0
 *   → lãi gộp báo cáo bị thổi phồng bằng đúng toàn bộ doanh thu phần đó.
 *
 *   Kiểm 14/08: CHƯA có đơn nào bán từ 26 lô này (0 dòng order_item_batches)
 *   → chưa hỏng báo cáo quá khứ, đây là mìn chưa nổ. Nạp giá trước khi bán.
 *
 *   Vì sao script `kiemke-2026-08-03-followup.ts` bỏ sót: nó lọc theo prefix
 *   `KK20260803-*` (lô của kiểm kê 3/8), còn 26 lô này sinh từ kiểm kê 14/07
 *   nên mã là `KK-20280101` / `KK-NODATE`. Script này lọc theo ĐIỀU KIỆN
 *   (`import_cost` thiếu + còn tồn) nên không bỏ sót đợt nào nữa.
 *
 * NGUỒN GIÁ
 *   `products.cost_price` — cost registry trong CRM, nguồn chuẩn của công ty
 *   (KHÔNG tin Excel MISA). Đã đối chiếu: cả 26 SKU này CHƯA từng có đơn nhập
 *   nào trong hệ thống (`import_order_items` rỗng, không lô nào khác có giá)
 *   → registry là nguồn duy nhất, không có số nào để so lệch >5%.
 *
 * KHÔNG ĐỤNG
 *   số lượng lô · `products.total_stock` (đối soát 14/08 đã khớp, 0 mã lệch)
 *   · `products.cost_price` · công nợ · đơn hàng.
 *
 * Lô registry KHÔNG có giá (>0) sẽ bị BỎ QUA và in ra để anh Philip cấp giá.
 *
 * Chạy:
 *   Xem trước:  DATABASE_URL='<url>' npx tsx scripts/fix-cost-lo-kiemke-2026-08-14.ts
 *   Ghi thật:   DATABASE_URL='<url>' npx tsx scripts/fix-cost-lo-kiemke-2026-08-14.ts --apply
 *
 * Idempotent: chạy lại chỉ thấy các lô chưa có giá (đã nạp thì không khớp filter nữa).
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
const vnd = (n: number) => n.toLocaleString('vi-VN');

async function main(): Promise<void> {
  // ── Tìm lô còn tồn mà thiếu giá vốn ────────────────────────────────────
  const lots = await prisma.inventoryBatch.findMany({
    where: {
      currentQuantity: { gt: 0 },
      OR: [{ importCost: null }, { importCost: { lte: 0 } }],
    },
    select: {
      id: true,
      batchCode: true,
      currentQuantity: true,
      importCost: true,
      status: true,
      product: { select: { id: true, sku: true, name: true, costPrice: true } },
    },
  });

  if (lots.length === 0) {
    console.log('✅ Không còn lô nào thiếu giá vốn. Không phải làm gì.');
    await prisma.$disconnect();
    return;
  }

  const plan: Array<{ id: string; sku: string; batchCode: string; qty: number; cost: number }> = [];
  const skipped: Array<{ sku: string; name: string; batchCode: string; qty: number }> = [];

  for (const l of lots) {
    const cost = l.product.costPrice ? Number(l.product.costPrice) : 0;
    if (!Number.isFinite(cost) || cost <= 0) {
      skipped.push({
        sku: l.product.sku,
        name: l.product.name,
        batchCode: l.batchCode,
        qty: l.currentQuantity,
      });
      continue;
    }
    plan.push({
      id: l.id,
      sku: l.product.sku,
      batchCode: l.batchCode,
      qty: l.currentQuantity,
      cost,
    });
  }

  plan.sort((a, b) => b.cost * b.qty - a.cost * a.qty);

  console.log(`\n📦 ${lots.length} lô còn tồn đang thiếu giá vốn\n`);
  console.log('SẼ NẠP (giá từ cost registry products.cost_price):');
  for (const p of plan) {
    console.log(
      `  ${p.sku.padEnd(11)} ${p.batchCode.padEnd(13)} ${String(p.qty).padStart(4)} đv × ` +
        `${vnd(p.cost).padStart(9)} đ = ${vnd(p.cost * p.qty).padStart(12)} đ`,
    );
  }
  const totalValue = plan.reduce((s, p) => s + p.cost * p.qty, 0);
  const totalQty = plan.reduce((s, p) => s + p.qty, 0);
  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${plan.length} lô · ${totalQty} đv · giá trị ${vnd(totalValue)} đ`);

  if (skipped.length > 0) {
    console.log('\n❌ BỎ QUA — registry KHÔNG có giá vốn, chờ anh Philip cấp:');
    for (const s of skipped) {
      console.log(`  ${s.sku.padEnd(11)} ${s.batchCode.padEnd(13)} ${String(s.qty).padStart(4)} đv — ${s.name}`);
    }
    console.log('  → Các lô này vẫn ghi giá vốn 0 khi bán. KHÔNG bán trước khi có giá.');
  }

  if (!APPLY) {
    console.log('\n👀 XEM TRƯỚC — chưa ghi gì. Thêm --apply để ghi thật.\n');
    await prisma.$disconnect();
    return;
  }

  // ── Backup trước khi ghi ───────────────────────────────────────────────
  const dir = path.join(import.meta.dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'backup-fix-cost-lo-kiemke-2026-08-14.json');
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: 'import_cost TRƯỚC khi nạp (tất cả đang null/0). Rollback: set lại null theo batchId.',
        lots: lots.map((l) => ({
          batchId: l.id,
          batchCode: l.batchCode,
          sku: l.product.sku,
          currentQuantity: l.currentQuantity,
          importCostBefore: l.importCost === null ? null : Number(l.importCost),
          costPriceRegistry: l.product.costPrice ? Number(l.product.costPrice) : 0,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\n💾 Backup: ${file}`);

  // ── Ghi ────────────────────────────────────────────────────────────────
  await prisma.$transaction(
    async (tx: any) => {
      for (const p of plan) {
        await tx.inventoryBatch.update({
          where: { id: p.id },
          data: { importCost: p.cost },
        });
      }
    },
    { timeout: 120_000 },
  );
  console.log(`✍️  Đã nạp giá vốn cho ${plan.length} lô.`);

  // ── Verify ─────────────────────────────────────────────────────────────
  const stillMissing = await prisma.inventoryBatch.findMany({
    where: {
      currentQuantity: { gt: 0 },
      OR: [{ importCost: null }, { importCost: { lte: 0 } }],
    },
    select: { batchCode: true, product: { select: { sku: true } } },
  });
  console.log(
    `\n🔍 Còn thiếu giá vốn: ${stillMissing.length} lô` +
      (stillMissing.length
        ? ` (${stillMissing.map((l: any) => l.product.sku).join(', ')})`
        : ''),
  );
  const expected = skipped.length;
  console.log(
    stillMissing.length === expected
      ? `   ✅ Đúng như dự kiến (${expected} lô registry chưa có giá).`
      : `   ⚠️  LỆCH: dự kiến còn ${expected} lô.`,
  );

  // Đối soát tồn: script này KHÔNG được đổi số lượng.
  const mismatch = await prisma.$queryRaw<Array<{ sku: string }>>`
    select p.sku from products p
    left join inventory_batches b
      on b.product_id = p.id and b.status = 'active' and b.current_quantity > 0
    group by p.id, p.sku, p.total_stock
    having p.total_stock <> coalesce(sum(b.current_quantity), 0)
  `;
  console.log(
    `🔍 Mã lệch total_stock: ${mismatch.length}` +
      (mismatch.length === 0 ? ' ✅ (không đụng số lượng, đúng)' : ' ⚠️'),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('LỖI:', err);
  await prisma.$disconnect();
  process.exit(1);
});
