/**
 * Gộp SP trùng MNH-MEN-60 (mã cũ MISA) → MH_02 (bản chuẩn, đang active).
 *
 * Hai SKU là CÙNG 1 sản phẩm "Manhae Menopause 60 viên"; mã cũ giữ lẻ doanh số
 * + tồn kho → chia đôi số liệu (vi phạm luật chống trùng tên). Script dời TẤT
 * CẢ order item, lô tồn (InventoryBatch) + tồn kho sang MH_02 rồi ẩn mã cũ
 * (hasSales=false). KHÔNG xoá SP (backend giữ đủ). Idempotent + transaction.
 *
 *   npx tsx --env-file=.env scripts/merge-mnh-men-60.ts          # DRY-RUN
 *   npx tsx --env-file=.env scripts/merge-mnh-men-60.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const DUP_SKU = 'MNH-MEN-60';
const CANON_SKU = 'MH_02';

async function main(): Promise<void> {
  const org = await prisma.organization.findFirst({ select: { id: true } });
  const orgId = org!.id;
  const dup = await prisma.product.findFirst({ where: { orgId, sku: DUP_SKU } });
  const canon = await prisma.product.findFirst({ where: { orgId, sku: CANON_SKU } });
  if (!dup || !canon) throw new Error('Không tìm thấy SP nguồn/đích');

  const [oiCount, batchCount, dupStock] = await Promise.all([
    prisma.orderItem.count({ where: { productId: dup.id } }),
    prisma.inventoryBatch.count({ where: { productId: dup.id } }),
    Promise.resolve(dup.totalStock),
  ]);

  console.log(`\n=== GỘP ${DUP_SKU} → ${CANON_SKU} (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(`Nguồn  ${DUP_SKU} "${dup.name}": tồn=${dup.totalStock}, order_item=${oiCount}, lô=${batchCount}`);
  console.log(`Đích   ${CANON_SKU} "${canon.name}": tồn(trước)=${canon.totalStock}`);

  if (!APPLY) {
    console.log(`\n[DRY] Sẽ dời ${oiCount} order item + ${batchCount} lô (${dupStock} tồn) sang ${CANON_SKU}, rồi ẩn ${DUP_SKU}.`);
    console.log(`     Chạy lại với --apply để ghi.\n`);
    return;
  }

  await prisma.$transaction(async (tx: any) => {
    // 1) Dời order item (doanh số) — đổi cả productId + sku để nhất quán.
    await tx.orderItem.updateMany({
      where: { productId: dup.id },
      data: { productId: canon.id, sku: CANON_SKU },
    });
    // 2) Dời lô tồn (InventoryBatch giữ nguyên cost/HSD/currentQuantity).
    await tx.inventoryBatch.updateMany({
      where: { productId: dup.id },
      data: { productId: canon.id },
    });
    // 3) Recompute tồn kho đích từ lô active; nguồn về 0.
    const agg = await tx.inventoryBatch.aggregate({
      where: { productId: canon.id, status: 'active' },
      _sum: { currentQuantity: true },
    });
    const canonStock = agg._sum.currentQuantity ?? 0;
    await tx.product.update({ where: { id: canon.id }, data: { totalStock: canonStock, hasSales: true } });
    // 4) Ẩn mã cũ khỏi catalog: hasSales=false + tồn 0 (SP vẫn còn trong backend).
    await tx.product.update({ where: { id: dup.id }, data: { hasSales: false, totalStock: 0 } });
    // 5) Tắt 4 bảng giá orphan của mã cũ (không xoá).
    await tx.productPrice.updateMany({ where: { productId: dup.id, active: true }, data: { active: false } });
    console.log(`[APPLY] Đích ${CANON_SKU} tồn(sau)=${canonStock}, đã gộp xong.`);
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error('Gộp thất bại:', err); await prisma.$disconnect(); process.exit(1); });
