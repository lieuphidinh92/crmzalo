/**
 * One-off import — đơn XK5956 LB Global (ngày 26/05/2026, bổ sung).
 *
 * Khi import 26/05 (commit 19b5eda), em SKIP XK5956 vì khách CHƯA CHỐT
 * (anh Philip confirm lúc đó: mai mới ship). Ngày 28/05 anh confirm
 * "a Nam Bến đã chốt đơn và giao hàng" + gửi Phiếu xuất kho XK5956.
 *
 * Đơn:
 *   - XK5956 — CÔNG TY CỔ PHẦN THƯƠNG MẠI QUỐC TẾ LB GLOBAL (KH2005)
 *   - NVBH: Halo VN
 *   - Ngày: 26/05/2026
 *   - Total: 252.560.000đ — KHÔNG VAT (Tiền thuế GTGT = 0 trên phiếu xuất)
 *   - Đơn LỚN NHẤT tháng 5/2026
 *
 * Line items (theo Phiếu xuất kho):
 *   Hàng bán:
 *     - MH_01 ×78  @265.000 = 20.670.000đ
 *     - MH_02 ×234 @485.000 = 113.490.000đ
 *     - MH_03 ×160 @740.000 = 118.400.000đ
 *   Hàng tặng kèm (khuyến mãi mua nhiều, đơn giá 0):
 *     - MH_01 ×2, MH_02 ×4, MH_03 ×2 = 8 hộp Manhae
 *
 * Cost (registry):
 *   Bán: 78×240 + 234×436 + 160×655 = 18.720 + 102.024 + 104.800 = 225.544.000
 *   Tặng: 2×240 + 4×436 + 2×655 = 480 + 1.744 + 1.310 = 3.534.000
 *   Tổng GV: 229.078.000đ → Lãi gộp 23.482.000đ (9.30%)
 *
 * Lưu ý VAT: 20/5 (XK5909) LB Global có VAT 8%, nhưng đơn 26/5 này
 * Phiếu xuất kho ghi Tiền thuế GTGT = 0 → KHÔNG VAT. Total = số hàng.
 *
 * Status: Đã xuất đủ + Chưa thanh toán → completed/credit.
 * Idempotent: skip nếu XK5956 đã tồn tại.
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-26T00:00:00');

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
  orderCode: 'XK5956',
  misaCode: 'KH2005',
  customerName: 'CÔNG TY CỔ PHẦN THƯƠNG MẠI QUỐC TẾ LB GLOBAL',
  saleName: 'Halo VN',
  paymentPaid: false,
  paymentMethod: 'credit' as const,
  address: 'Số 23, ngõ 66/18/24 Dịch Vọng Hậu, phường Cầu Giấy, thành phố Hà Nội',
  province: 'Hà Nội',
  ward: 'Phường Cầu Giấy',
  phone: '0966831395',
  description: 'Bán hàng CTCP TM QT LB Global (đơn lớn nhất T5, chốt+ship 28/5, tặng kèm 8 hộp Manhae)',
  total: 252_560_000,
};

const ITEMS: LineItem[] = [
  // Hàng bán
  { sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 78,  unitPrice: 265_000, lineTotal:  20_670_000 },
  { sku: 'MH_02', productName: 'Manhae Menopause 60 viên', unit: 'Hộp', quantity: 234, unitPrice: 485_000, lineTotal: 113_490_000 },
  { sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 160, unitPrice: 740_000, lineTotal: 118_400_000 },
  // Hàng tặng kèm (khuyến mãi mua nhiều — đơn giá 0)
  { sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 2, unitPrice: 0, lineTotal: 0, isGift: true },
  { sku: 'MH_02', productName: 'Manhae Menopause 60 viên', unit: 'Hộp', quantity: 4, unitPrice: 0, lineTotal: 0, isGift: true },
  { sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 2, unitPrice: 0, lineTotal: 0, isGift: true },
];

async function main(): Promise<void> {
  console.log(`Import XK5956 LB Global (26/05/2026) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  const sum = ITEMS.reduce((s, i) => s + i.lineTotal, 0);
  if (sum !== ORDER.total) {
    throw new Error(`Tổng line items = ${sum.toLocaleString('vi-VN')} ≠ header ${ORDER.total.toLocaleString('vi-VN')}`);
  }
  console.log('✓ Header total matches line items (3 dòng bán + 3 dòng tặng)');

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
    where: { orgId: org.id, sku: { in: Array.from(new Set(ITEMS.map((i) => i.sku))) } },
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
      OR: [{ misaCustomerCode: ORDER.misaCode }, { fullName: ORDER.customerName }],
    },
    select: { id: true },
  });

  const saleId = userByName.get(ORDER.saleName.toLowerCase()) ?? adminUser.id;

  let costSum = 0, giftCost = 0;
  for (const it of ITEMS) {
    const c = Number(productBySku.get(it.sku)!.costPrice ?? 0) * it.quantity;
    costSum += c;
    if (it.isGift) giftCost += c;
  }

  console.log(`\nOrder plan:`);
  console.log(`  ➕ ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ  🕗 nợ  | sale: ${ORDER.saleName}→Admin | contact: ${existingContact ? 'reuse' : 'CREATE'} LB Global`);
  console.log(`\nSummary:`);
  console.log(`  Doanh thu:              ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ  (không VAT)`);
  console.log(`  Giá vốn (registry):     ${costSum.toLocaleString('vi-VN').padStart(13)} đ  (gồm ${giftCost.toLocaleString('vi-VN')}đ tặng 8 hộp)`);
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
      productSkus: Array.from(new Set(ITEMS.filter((it) => !it.isGift).map((it) => it.sku))),
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

  console.log(`  ✓ ${ORDER.orderCode}  ${ORDER.total.toLocaleString('vi-VN').padStart(13)} đ  🕗  ${ITEMS.length} items (3 gift)  sale=${ORDER.saleName}`);
  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
