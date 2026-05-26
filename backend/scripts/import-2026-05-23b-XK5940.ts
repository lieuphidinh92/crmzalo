/**
 * One-off import — đơn XK5940 bổ sung (ngày chứng từ 23/05/2026).
 *
 * Khi import 21-24/05 (commit 112d6de), em đã SKIP XK5940 vì sổ chi
 * tiết MISA thiếu line items (pattern XK5905/5940/5946-48). Anh Philip
 * confirm 27/05 đơn này đã giao thành công và gửi screenshot MISA →
 * line items bây giờ có đủ.
 *
 * Đơn:
 *   - XK5940 — Chị Hoàng Hoa - HKD TRẦN DUY HẢI (KH00060, Bắc Ninh)
 *   - NVBH: Lê Huỳnh Đức
 *   - Ngày chứng từ: 23/05/2026
 *   - Total: 37.750.000đ — Chưa thanh toán
 *
 * Line items:
 *   - MH_03 ×50 hộp @ 755.000đ = 37.750.000đ
 *   - VAG_01 ×5 hộp (tặng kèm) — Vagisil 240ml TÍM (khác VAG_001 màu Hồng)
 *
 * Cost calc:
 *   - MH_03: 50 × 655.000 = 32.750.000đ (registry)
 *   - VAG_01: 5 × 137.000 = 685.000đ (cost marketing tặng kèm)
 *   - Total cost: 33.435.000đ → Lãi gộp 4.315.000đ (11.43%)
 *
 * Pattern script: giống import-2026-05-11b-XK5832.ts và
 * import-2026-05-14b-XK5864.ts (bổ sung 1 đơn lẻ).
 *
 * Idempotent: skip nếu XK5940 đã tồn tại.
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-23T00:00:00');

interface LineItem {
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isGift?: boolean;
}

const ORDER = {
  orderCode: 'XK5940',
  misaCode: 'KH00060',
  customerName: 'Chị Hoàng Hoa - HKD TRẦN DUY HẢI',
  saleName: 'Lê Huỳnh Đức',
  paymentPaid: false,
  paymentMethod: 'credit' as const,
  address: 'Chung Cư Đông Dương, Phường Kinh Bắc, TP Bắc Ninh, Bắc Ninh',
  province: 'Bắc Ninh',
  ward: 'Phường Kinh Bắc',
  phone: '0865115595',
  description: 'Bán hàng Chị Hoàng Hoa - HKD Trần Duy Hải (bổ sung 27/5 sau khi anh confirm đã giao thành công, tặng kèm VAG_01 ×5)',
  total: 37_750_000,
};

const ITEMS: LineItem[] = [
  { sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',                   unit: 'Hộp', quantity: 50, unitPrice: 755_000, lineTotal: 37_750_000 },
  { sku: 'VAG_01', productName: 'Dung dịch vệ sinh Vagisil 240ml (Tím)',      unit: 'Hộp', quantity: 5,  unitPrice: 0,       lineTotal: 0, isGift: true },
];

async function main(): Promise<void> {
  console.log(`Import XK5940 (23/05/2026) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const sum = ITEMS.reduce((s, i) => s + i.lineTotal, 0);
  if (sum !== ORDER.total) {
    throw new Error(`Tổng line items = ${sum.toLocaleString('vi-VN')} ≠ header ${ORDER.total.toLocaleString('vi-VN')}`);
  }
  console.log('✓ Header total matches line items');

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');

  const users = await prisma.user.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, role: true },
  });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner user');

  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: ITEMS.map((i) => i.sku) } },
    select: { id: true, sku: true, costPrice: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  for (const it of ITEMS) {
    if (!productBySku.has(it.sku)) throw new Error(`SKU ${it.sku} không có trong DB catalog`);
  }

  const existing = await prisma.order.findFirst({
    where: { orgId: org.id, orderCode: ORDER.orderCode },
    select: { id: true },
  });
  if (existing) {
    console.log(`⏭  ${ORDER.orderCode} đã tồn tại trong DB — skip`);
    await prisma.$disconnect();
    return;
  }

  const existingContact = await prisma.contact.findFirst({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: ORDER.misaCode },
        { fullName: ORDER.customerName },
      ],
    },
    select: { id: true },
  });

  const saleId = userByName.get(ORDER.saleName.toLowerCase()) ?? adminUser.id;

  // Compute cost preview
  let costSum = 0;
  for (const it of ITEMS) {
    const p = productBySku.get(it.sku)!;
    costSum += Number(p.costPrice ?? 0) * it.quantity;
  }
  const giftCost = ITEMS.filter((i) => i.isGift).reduce((s, i) => s + Number(productBySku.get(i.sku)!.costPrice ?? 0) * i.quantity, 0);

  console.log(`\nOrder plan:`);
  console.log(`  ➕ ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ  🕗 nợ  | sale: ${ORDER.saleName} | contact: ${existingContact ? 'reuse' : 'CREATE'} ${ORDER.customerName}  🎁`);
  console.log(`\nSummary:`);
  console.log(`  Doanh thu:              ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Giá vốn (registry):     ${costSum.toLocaleString('vi-VN').padStart(13)} đ  (gồm ${giftCost.toLocaleString('vi-VN')}đ tặng kèm)`);
  console.log(`  Lãi gộp:                ${(ORDER.total - costSum).toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Margin:                 ${((ORDER.total - costSum) / ORDER.total * 100).toFixed(2)}%`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');

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
      paymentMethod: ORDER.paymentMethod,
      totalAmount: ORDER.total,
      subtotalAmount: ORDER.total,
      discountAmount: 0,
      totalAmountValue: ORDER.total,
      paidAmount: 0,
      debtAmountValue: ORDER.total,
      internalNote: `Import từ Misa - ${ORDER.description}`,
      productSkus: ITEMS.filter((it) => !it.isGift).map((it) => it.sku),
      confirmedAt: ORDER_DATE,
      packedAt: ORDER_DATE,
      shippedAt: ORDER_DATE,
      completedAt: ORDER_DATE,
    },
    select: { id: true },
  });

  await prisma.orderItem.createMany({
    data: ITEMS.map((it) => {
      const p = productBySku.get(it.sku)!;
      const unitCost = Number(p.costPrice ?? 0);
      const lineCost = unitCost * it.quantity;
      return {
        orderId: order.id,
        productId: p.id,
        sku: it.sku,
        productName: it.productName,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountValue: 0,
        lineTotal: it.lineTotal,
        costValue: lineCost,
        unitCost,
        lineCost,
        profit: it.lineTotal - lineCost,
        returnQty: 0,
        returnValue: 0,
      };
    }),
  });

  await prisma.contact.update({
    where: { id: contactId },
    data: { lastOrderDate: ORDER_DATE },
  });

  console.log(`  ✓ ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ  🕗  ${ITEMS.length} items (1 gift)  sale=${ORDER.saleName}`);
  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
