/**
 * Seed/update PBB catalog từ bảng báo giá BTH (01/11/2025).
 *
 * Nguồn dữ liệu (CEO cung cấp 11/05/2026):
 *   PBB_01  — đẳng trương 100ml — giá lẻ 145.000 — giá nhập 94.250 (65%)
 *   PBB_001 — ưu trương 50ml   — giá lẻ 125.000 — giá nhập 81.250 (65%)
 *
 * Hành động:
 *   - PBB_01  (đã có): UPDATE name + costPrice = 94.250 + add price tier "Lẻ niêm yết" 145.000
 *   - PBB_001 (mới):  CREATE + cost 81.250 + price tier 125.000
 *
 * Idempotent: check trước khi create/update; price tier dùng upsert theo (productId, tierName).
 *
 * Usage:
 *   npx tsx scripts/seed-product-pbb.ts            # dry-run
 *   npx tsx scripts/seed-product-pbb.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient, Prisma } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const BRAND_PBB_ID = 'dbe6a933-eeb3-45bb-9431-3b9471368afc';

interface ProductSeed {
  sku: string;
  name: string;
  unit: string;
  costPrice: number;
  retailPrice: number; // tier "Lẻ niêm yết"
}

const PRODUCTS: ProductSeed[] = [
  {
    sku: 'PBB_01',
    name: "Xịt nước muối biển đẳng trương P'tit BOBO ISOTONIC 100ml",
    unit: 'hộp',
    costPrice: 94_250,
    retailPrice: 145_000,
  },
  {
    sku: 'PBB_001',
    name: "Xịt nước muối biển ưu trương P'tit BOBO ISOTONIC 50ml",
    unit: 'Chai',
    costPrice: 81_250,
    retailPrice: 125_000,
  },
];

async function main(): Promise<void> {
  console.log(`Seed PBB catalog — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  console.log(`Org: ${org.name}`);

  const brand = await prisma.brand.findFirst({ where: { id: BRAND_PBB_ID, orgId: org.id } });
  if (!brand) throw new Error(`Brand PBB (${BRAND_PBB_ID}) not found`);
  console.log(`Brand: ${brand.name}`);

  for (const p of PRODUCTS) {
    const existing = await prisma.product.findFirst({
      where: { orgId: org.id, sku: p.sku },
      select: {
        id: true, name: true, unit: true, costPrice: true,
        prices: { where: { active: true }, select: { id: true, tierName: true, price: true } },
      },
    });

    if (existing) {
      const currentCost = existing.costPrice ? Number(existing.costPrice) : null;
      const needNameUpdate = existing.name !== p.name;
      const needCostUpdate = currentCost !== p.costPrice;
      const hasRetailTier = existing.prices.some(
        (t) => Number(t.price) === p.retailPrice,
      );

      console.log(`\n• ${p.sku} (id=${existing.id})  — exists`);
      console.log(`    name:  ${needNameUpdate ? `UPDATE: "${existing.name}" → "${p.name}"` : 'OK'}`);
      console.log(`    cost:  ${needCostUpdate ? `UPDATE: ${currentCost?.toLocaleString('vi-VN') ?? 'NULL'} → ${p.costPrice.toLocaleString('vi-VN')}` : 'OK'}`);
      console.log(`    tier:  ${hasRetailTier ? `OK (đã có tier ${p.retailPrice.toLocaleString('vi-VN')})` : `ADD tier "Lẻ niêm yết" ${p.retailPrice.toLocaleString('vi-VN')}`}`);

      if (APPLY) {
        if (needNameUpdate || needCostUpdate) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              ...(needNameUpdate ? { name: p.name } : {}),
              ...(needCostUpdate ? { costPrice: new Prisma.Decimal(p.costPrice) } : {}),
            },
          });
        }
        if (!hasRetailTier) {
          await prisma.productPrice.create({
            data: {
              productId: existing.id,
              tierName: 'Lẻ niêm yết',
              price: new Prisma.Decimal(p.retailPrice),
              isDefault: existing.prices.length === 0,
              displayOrder: existing.prices.length,
              active: true,
            },
          });
        }
      }
    } else {
      console.log(`\n• ${p.sku}  — CREATE`);
      console.log(`    name:  "${p.name}"`);
      console.log(`    unit:  ${p.unit}`);
      console.log(`    cost:  ${p.costPrice.toLocaleString('vi-VN')} đ`);
      console.log(`    tier:  "Lẻ niêm yết" ${p.retailPrice.toLocaleString('vi-VN')} đ`);

      if (APPLY) {
        const created = await prisma.product.create({
          data: {
            orgId: org.id,
            sku: p.sku,
            name: p.name,
            unit: p.unit,
            brandId: BRAND_PBB_ID,
            costPrice: new Prisma.Decimal(p.costPrice),
            status: 'active',
            totalStock: 0,
            warningStock: 30,
            prices: {
              create: [
                {
                  tierName: 'Lẻ niêm yết',
                  price: new Prisma.Decimal(p.retailPrice),
                  isDefault: true,
                  displayOrder: 0,
                  active: true,
                },
              ],
            },
          },
          select: { id: true },
        });
        console.log(`    ✓ created id=${created.id}`);
      }
    }
  }

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
  } else {
    console.log('\n✅ Done.');
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
