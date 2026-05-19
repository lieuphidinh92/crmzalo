/**
 * One-off import — đơn XK5864 ngày 14/05/2026 (bổ sung).
 *
 * Lý do tách script riêng: Sổ chi tiết bán hàng 14.5 MISA xuất thiếu line
 * items cho XK5864. Anh Philip confirm là đơn thật và gửi screenshot MISA
 * (chứng từ bán hàng XK5864) cho em đọc thủ công 2 line items.
 *
 * Đơn này KHÔNG nằm trong script import-2026-05-14.ts vì khi chạy script
 * chính, em chưa biết SKU/SL cụ thể.
 *
 * Đơn:
 *   XK5864 — Chị Hoài - Vũ Thị Hoài (KH000026)
 *   Sale: Phí Hữu Luận | Bệnh viện Tâm Thần Vĩnh Phúc, Định Trung, Phú Thọ
 *   Phone: 0973938878 | Chưa thanh toán → completed/credit
 *
 * Line items:
 *   MH_03 ×6 × 770.000đ = 4.620.000đ
 *   MH_07 ×4 × 360.000đ = 1.440.000đ
 *   Tổng: 6.060.000đ
 *
 * Giá vốn (Registry):
 *   MH_03: 655.000đ × 6 = 3.930.000đ
 *   MH_07: 286.000đ × 4 = 1.144.000đ
 *   Tổng cost: 5.074.000đ → lãi gộp 986.000đ (margin 16.27%)
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-14b-XK5864.ts            # dry-run
 *   npx tsx scripts/import-2026-05-14b-XK5864.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost } from './sku-cost-registry';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-14T00:00:00');

const ORDER = {
  orderCode: 'XK5864',
  misaCode: 'KH000026',
  customerName: 'Chị Hoài - Vũ Thị Hoài',
  saleName: 'Phí Hữu Luận',
  address: 'Bệnh viện Tâm Thần Vĩnh Phúc, phường Định Trung, tỉnh Phú Thọ',
  province: 'Phú Thọ',
  ward: 'Phường Vĩnh Phúc',
  phone: '0973938878',
  description: 'Bán hàng Chị Hoài - Vũ Thị Hoài',
  total: 6_060_000,
};

const ITEMS = [
  { sku: 'MH_03', productName: 'Manhae Menopause 90 viên',        unit: 'Hộp', quantity: 6, unitPrice: 770_000, lineTotal: 4_620_000 },
  { sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên', unit: 'Hộp', quantity: 4, unitPrice: 360_000, lineTotal: 1_440_000 },
];

async function main(): Promise<void> {
  console.log(`Import XK5864 (bổ sung 14/05/2026) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const headerSum = ITEMS.reduce((s, i) => s + i.lineTotal, 0);
  if (headerSum !== ORDER.total) {
    throw new Error(`Tổng line items = ${headerSum.toLocaleString('vi-VN')} ≠ header ${ORDER.total.toLocaleString('vi-VN')}`);
  }
  console.log('✓ Header total matches line items');

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  console.log(`Org: ${org.name}`);

  const users = await prisma.user.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, role: true },
  });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner user');

  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: ITEMS.map((i) => i.sku) } },
    select: { id: true, sku: true },
  });
  const skuToId = new Map(products.map((p) => [p.sku, p.id]));

  const existing = await prisma.order.findFirst({
    where: { orgId: org.id, orderCode: ORDER.orderCode },
    select: { id: true },
  });

  const existingContact = await prisma.contact.findFirst({
    where: {
      orgId: org.id,
      OR: [{ misaCustomerCode: ORDER.misaCode }, { fullName: ORDER.customerName }],
    },
    select: { id: true, misaCustomerCode: true, fullName: true },
  });

  const saleMatched = userByName.has(ORDER.saleName.toLowerCase());

  console.log('\n─── PLAN ──────────────────────────────────────────────────');
  console.log(`  ${existing ? '⏭ ' : '➕'} ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(12)} đ  🕗 nợ`);
  console.log(`    Sale:    ${saleMatched ? '✓' : '→Admin'} ${ORDER.saleName}`);
  console.log(`    Contact: ${existingContact ? `reuse (${existingContact.fullName})` : `CREATE (${ORDER.customerName})`}`);
  console.log(`    Items:`);
  for (const it of ITEMS) {
    const cost = getSkuCost(it.sku) * it.quantity;
    console.log(
      `      ${it.sku.padEnd(6)} ×${String(it.quantity).padStart(2)}  ` +
      `${it.unitPrice.toLocaleString('vi-VN').padStart(9)}đ/hộp  → ` +
      `doanh thu ${it.lineTotal.toLocaleString('vi-VN').padStart(9)}đ  ` +
      `cost ${cost.toLocaleString('vi-VN').padStart(9)}đ  ` +
      `lãi ${(it.lineTotal - cost).toLocaleString('vi-VN').padStart(8)}đ`
    );
  }

  const totalCost = ITEMS.reduce((s, i) => s + getSkuCost(i.sku) * i.quantity, 0);
  const profit = ORDER.total - totalCost;
  console.log(`\n  Doanh số:      ${ORDER.total.toLocaleString('vi-VN').padStart(9)} đ`);
  console.log(`  Giá vốn (Reg): ${totalCost.toLocaleString('vi-VN').padStart(9)} đ`);
  console.log(`  Lãi gộp:       ${profit.toLocaleString('vi-VN').padStart(9)} đ`);
  console.log(`  Margin:        ${((profit / ORDER.total) * 100).toFixed(2)}%`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  if (existing) {
    console.log(`\n⏭  ${ORDER.orderCode} đã tồn tại — skip apply.`);
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');

  const saleId = userByName.get(ORDER.saleName.toLowerCase()) ?? adminUser.id;

  let contactId = existingContact?.id;
  if (!contactId) {
    const fullAddress = [ORDER.address, ORDER.ward].filter(Boolean).join(', ') || null;
    const c = await prisma.contact.create({
      data: {
        orgId: org.id,
        misaCustomerCode: ORDER.misaCode,
        fullName: ORDER.customerName,
        phone: ORDER.phone || null,
        address: fullAddress,
        province: ORDER.province || null,
        source: 'misa_import',
        assignedUserId: saleId,
      },
      select: { id: true },
    });
    contactId = c.id;
    console.log(`  ➕ contact: ${ORDER.customerName} (id=${contactId})`);
  }

  const order = await prisma.order.create({
    data: {
      orgId: org.id,
      contactId,
      createdByUserId: adminUser.id,
      assignedSaleId: saleId,
      orderCode: ORDER.orderCode,
      orderDate: ORDER_DATE,
      status: 'completed',
      paymentMethod: 'credit',
      totalAmount: ORDER.total,
      subtotalAmount: ORDER.total,
      discountAmount: 0,
      totalAmountValue: ORDER.total,
      paidAmount: 0,
      debtAmountValue: ORDER.total,
      internalNote: ORDER.description,
      productSkus: Array.from(new Set(ITEMS.map((it) => it.sku))),
      confirmedAt: ORDER_DATE,
      packedAt: ORDER_DATE,
      shippedAt: ORDER_DATE,
      completedAt: ORDER_DATE,
    },
    select: { id: true },
  });

  await prisma.orderItem.createMany({
    data: ITEMS.map((it) => {
      const unitCostRegistry = getSkuCost(it.sku);
      const lineCost = unitCostRegistry * it.quantity;
      return {
        orderId: order.id,
        productId: skuToId.get(it.sku) ?? null,
        sku: it.sku,
        productName: it.productName,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountValue: 0,
        lineTotal: it.lineTotal,
        costValue: lineCost,
        unitCost: unitCostRegistry,
        lineCost: lineCost,
        profit: it.lineTotal - lineCost,
        returnQty: 0,
        returnValue: 0,
      };
    }),
  });

  console.log(`  ✓ ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(9)} đ  🕗  ${ITEMS.length} items  sale=${ORDER.saleName}`);

  const last = await prisma.order.findFirst({
    where: { contactId, status: 'completed' },
    orderBy: { orderDate: 'desc' },
    select: { orderDate: true },
  });
  if (last?.orderDate) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastOrderDate: last.orderDate },
    });
  }
  console.log(`  ✓ Synced contact.lastOrderDate`);

  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
