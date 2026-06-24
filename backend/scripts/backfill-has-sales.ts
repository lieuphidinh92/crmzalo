/**
 * Backfill Product.hasSales for existing data.
 *
 * Marks hasSales=true for every product that has ever appeared on an order
 * line (including legacy MISA-imported orders). Run once after `db push`
 * adds the column. Idempotent — safe to re-run.
 *
 *   npx tsx scripts/backfill-has-sales.ts
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL chưa được set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main(): Promise<void> {
  const rows = await prisma.orderItem.findMany({
    where: { productId: { not: null } },
    distinct: ['productId'],
    select: { productId: true },
  });
  const ids = rows.map((r) => r.productId).filter((id): id is string => Boolean(id));

  if (ids.length === 0) {
    console.log('Không có order item nào gắn productId — bỏ qua.');
    return;
  }

  const res = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: { hasSales: true },
  });

  const hidden = await prisma.product.count({ where: { hasSales: false } });
  console.log(
    `Backfill hasSales xong: ${ids.length} SKU đã từng bán → cập nhật ${res.count} sản phẩm. ` +
      `Còn ${hidden} sản phẩm chưa phát sinh doanh số (sẽ ẩn khỏi danh mục, vẫn tìm được bằng mã).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Backfill thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
