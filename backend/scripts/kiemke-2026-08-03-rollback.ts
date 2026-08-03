/**
 * HOÀN TÁC phiên kiểm kê 03/08/2026 — dùng file backup do script kiểm kê ghi ra.
 *
 * Khôi phục: current_quantity từng lô về số trong backup · xoá lô do phiên tạo
 * (batch_code KK20260803-*) · xoá movements + items + session của phiên · resync total_stock.
 *
 * Chạy:
 *   Xem trước:  DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03-rollback.ts
 *   Ghi thật:   DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03-rollback.ts --apply
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
// Truyền đúng file backup của lần chạy muốn hoàn tác (script kiểm kê in ra đường dẫn):
//   npx tsx scripts/kiemke-2026-08-03-rollback.ts backups/kiemke-20260803-before-<giờ>.csv --apply
const argPath = process.argv.slice(2).find((a) => a.endsWith('.csv'));
if (!argPath) {
  console.error('Thiếu đường dẫn file backup CSV (script kiểm kê in ra sau khi ghi).');
  process.exit(1);
}
const BACKUP = argPath.startsWith('/') ? argPath : new URL(`../${argPath}`, import.meta.url).pathname;
const SESSION_CODE_PREFIX = 'KK-202608-';
const NEW_LOT_PREFIX = 'KK20260803-';

async function main() {
  const lines = readFileSync(BACKUP, 'utf8').trim().split('\n').slice(1);
  const backup = lines.map((l) => {
    const [sku, batchId, , , qty] = l.split(',');
    return { sku, batchId, qty: Number(qty) };
  });
  console.log(`Backup: ${backup.length} lô từ ${BACKUP}`);

  const sessions = await prisma.stocktakeSession.findMany({
    where: { code: { startsWith: SESSION_CODE_PREFIX }, note: { contains: '03/08/2026' } },
    select: { id: true, code: true },
  });
  const newLots = await prisma.inventoryBatch.findMany({
    where: { batchCode: { startsWith: NEW_LOT_PREFIX } },
    select: { id: true, batchCode: true, currentQuantity: true },
  });

  // Lô cần trả lại số cũ
  const live = await prisma.inventoryBatch.findMany({
    where: { id: { in: backup.map((b) => b.batchId) } },
    select: { id: true, currentQuantity: true, productId: true },
  });
  const liveMap = new Map(live.map((l) => [l.id, l]));
  const toRestore = backup.filter((b) => liveMap.get(b.batchId)?.currentQuantity !== b.qty);

  console.log(`Phiên kiểm sẽ xoá   : ${sessions.map((s) => s.code).join(', ') || '(không có)'}`);
  console.log(`Lô do phiên tạo, xoá: ${newLots.length} (${newLots.map((l) => l.batchCode).join(', ') || '-'})`);
  console.log(`Lô trả lại số cũ    : ${toRestore.length}`);

  if (!APPLY) {
    console.log('\n👀 XEM TRƯỚC — chưa ghi. Thêm --apply để hoàn tác thật.');
    await prisma.$disconnect();
    return;
  }

  const affected = new Set<string>();
  await prisma.$transaction(async (tx: any) => {
    for (const s of sessions) {
      await tx.inventoryMovement.deleteMany({ where: { referenceType: 'stocktake', referenceId: s.id } });
      await tx.stocktakeItem.deleteMany({ where: { sessionId: s.id } });
      await tx.stocktakeSession.delete({ where: { id: s.id } });
    }
    for (const l of newLots) {
      await tx.inventoryMovement.deleteMany({ where: { batchId: l.id } });
      const b = await tx.inventoryBatch.findUnique({ where: { id: l.id }, select: { productId: true } });
      if (b) affected.add(b.productId);
      await tx.inventoryBatch.delete({ where: { id: l.id } });
    }
    for (const b of toRestore) {
      await tx.inventoryBatch.update({ where: { id: b.batchId }, data: { currentQuantity: b.qty } });
      const pid = liveMap.get(b.batchId)?.productId;
      if (pid) affected.add(pid);
    }
    for (const pid of affected) {
      const sum = await tx.inventoryBatch.aggregate({
        where: { productId: pid, status: 'active' },
        _sum: { currentQuantity: true },
      });
      await tx.product.update({ where: { id: pid }, data: { totalStock: sum._sum.currentQuantity ?? 0 } });
    }
  }, { timeout: 120_000 });

  const total = await prisma.product.aggregate({ _sum: { totalStock: true } });
  console.log(`\n✅ Đã hoàn tác ${toRestore.length} lô, xoá ${newLots.length} lô mới + ${sessions.length} phiên.`);
  console.log(`Tổng tồn công ty sau hoàn tác: ${total._sum.totalStock} đv`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
