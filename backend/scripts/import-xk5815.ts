/**
 * One-off import — XK5815 (2026-05-08).
 *
 * Edge case: MISA file `Ban_hang (4).xlsx` was missing this order's
 * header but `So_chi_tiet_ban_hang (2).xlsx` carried 2 line items for
 * it. Per user instruction (2026-05-08):
 *   - Create a NEW contact named "Pharmarlink" with misa code PML0001
 *     (do NOT merge with existing "Quầy thuốc Thu Hà" KH00994)
 *   - Assign sale = Admin (data missing in file)
 *   - Status = completed (consistent with sibling new orders 5811-5814)
 *
 * Idempotent: re-running is a no-op (checks orderCode + misa code
 * before creating).
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/import-xk5815.ts --apply
 *   (without --apply prints what would happen and exits)
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_CODE = 'XK5815';
const ORDER_DATE = new Date('2026-05-08T00:00:00');
const MISA_CODE = 'PML0001';
const CONTACT_NAME = 'Pharmarlink';
const STORE_NAME = 'Quầy Thuốc Thu Hà';

interface SeedItem {
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costValue: number;
}
const ITEMS: SeedItem[] = [
  {
    sku: 'MH_01',
    productName: 'Viên uống nội tiết tố nữ Manhae Nutrisante 30v',
    unit: 'Hộp',
    quantity: 5,
    unitPrice: 285_000,
    costValue: 1_200_195,
  },
  {
    sku: 'MH_07',
    productName: 'Men lợi khuẩn — MANHAE Intima Equilibre 30v',
    unit: 'Hộp',
    quantity: 5,
    unitPrice: 350_000,
    costValue: 1_428_661,
  },
];

async function main(): Promise<void> {
  console.log(`XK5815 import — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(60));

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  const adminUser = await prisma.user.findFirst({
    where: { orgId: org.id, role: { in: ['owner', 'admin'] } },
    orderBy: { role: 'asc' },
    select: { id: true, fullName: true },
  });
  if (!adminUser) throw new Error('No admin/owner user');
  console.log(`Org: ${org.name}`);
  console.log(`Admin user: ${adminUser.fullName}`);

  // Pre-checks (idempotent)
  const existingOrder = await prisma.order.findFirst({
    where: { orgId: org.id, orderCode: ORDER_CODE },
    select: { id: true },
  });
  if (existingOrder) {
    console.log(`✓ Order ${ORDER_CODE} already exists (id=${existingOrder.id}) — nothing to do.`);
    await prisma.$disconnect();
    return;
  }
  let contact = await prisma.contact.findFirst({
    where: { orgId: org.id, misaCustomerCode: MISA_CODE },
    select: { id: true, fullName: true },
  });
  if (contact) {
    console.log(`✓ Contact PML0001 already exists (id=${contact.id}, name=${contact.fullName})`);
  }

  // Look up products by sku
  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: ITEMS.map((i) => i.sku) } },
    select: { id: true, sku: true },
  });
  const skuToId = new Map(products.map((p) => [p.sku, p.id]));
  for (const it of ITEMS) {
    if (!skuToId.has(it.sku)) {
      console.warn(`  ⚠ SKU ${it.sku} not in catalog — order_item.product_id will be NULL`);
    }
  }

  const subtotal = ITEMS.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = subtotal; // no discount, no shipping
  const totalCost = ITEMS.reduce((s, i) => s + i.costValue, 0);

  console.log('\nPlan:');
  console.log(`  Contact: ${contact ? 'reuse PML0001' : `CREATE "${CONTACT_NAME}" (mã ${MISA_CODE}, store=${STORE_NAME})`}`);
  console.log(`  Order:   CREATE ${ORDER_CODE} | ${ITEMS.length} items | total ${total.toLocaleString('vi-VN')} đ | sale=Admin | status=completed`);
  console.log(`  Items:   ${ITEMS.map((i) => `${i.sku} ×${i.quantity} = ${(i.unitPrice * i.quantity).toLocaleString('vi-VN')}`).join('; ')}`);
  console.log(`  Cost:    ${totalCost.toLocaleString('vi-VN')} đ → profit ${(total - totalCost).toLocaleString('vi-VN')} đ`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\nApplying…');
  // 1. Contact
  if (!contact) {
    const created = await prisma.contact.create({
      data: {
        orgId: org.id,
        misaCustomerCode: MISA_CODE,
        fullName: CONTACT_NAME,
        storeName: STORE_NAME,
        source: 'misa_import',
        assignedUserId: adminUser.id,
      },
      select: { id: true, fullName: true },
    });
    contact = created;
    console.log(`  ✓ Contact created: ${created.fullName} (id=${created.id})`);
  }

  // 2. Order
  const order = await prisma.order.create({
    data: {
      orgId: org.id,
      contactId: contact.id,
      createdByUserId: adminUser.id,
      assignedSaleId: adminUser.id,
      orderCode: ORDER_CODE,
      orderDate: ORDER_DATE,
      status: 'completed',
      paymentMethod: 'bank_transfer',
      totalAmount: total,
      subtotalAmount: total,
      discountAmount: 0,
      totalAmountValue: total,
      paidAmount: total,
      debtAmountValue: 0,
      productSkus: ITEMS.map((i) => i.sku),
      confirmedAt: ORDER_DATE,
      packedAt: ORDER_DATE,
      shippedAt: ORDER_DATE,
      completedAt: ORDER_DATE,
    },
    select: { id: true },
  });
  console.log(`  ✓ Order created: id=${order.id}`);

  // 3. Items
  await prisma.orderItem.createMany({
    data: ITEMS.map((i) => {
      const lineTotal = i.unitPrice * i.quantity;
      return {
        orderId: order.id,
        productId: skuToId.get(i.sku) ?? null,
        sku: i.sku,
        productName: i.productName,
        unit: i.unit,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountValue: 0,
        lineTotal,
        costValue: i.costValue,
        unitCost: i.costValue / i.quantity,
        lineCost: i.costValue,
        profit: lineTotal - i.costValue,
        returnQty: 0,
        returnValue: 0,
      };
    }),
  });
  console.log(`  ✓ Inserted ${ITEMS.length} order items`);

  // 4. Sync contact.lastOrderDate
  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastOrderDate: ORDER_DATE },
  });
  console.log(`  ✓ Synced contact.lastOrderDate`);

  console.log('\n✅ Done.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
