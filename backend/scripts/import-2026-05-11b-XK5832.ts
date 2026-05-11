/**
 * One-off — đơn XK5832 (11/05/2026) Nga Lâm - HKD Nhà Thuốc Nga Sơn.
 *
 * Đơn này nhập vào MISA UI SAU khi đã xuất file Sổ chi tiết bán hàng
 * 11/5, nên không có trong `So_chi_tiet_ban_hang. 11.5.xlsx`. CEO gửi
 * screenshot MISA UI + bảng báo giá supplier BTH để derive cost.
 *
 * Phần A — Update catalog MH_03 (CEO báo giá nhập chuẩn 655.000):
 *   costPrice: 608.000 → 655.000
 *
 * Phần B — Import XK5832:
 *   4 lines | total 7.065.000đ | GV 5.882.500đ | profit 1.182.500đ
 *   Sale: Hoàng Bích Huế | Status: completed/credit (nợ 7.065.000đ)
 *   Contact "Nga Lam" — Nga Lâm - HKD Nhà Thuốc Nga Sơn (Quảng Trị) — MỚI
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-11b-XK5832.ts            # dry-run
 *   npx tsx scripts/import-2026-05-11b-XK5832.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient, Prisma } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-11T10:08:41');

const ORDER = {
  orderCode: 'XK5832',
  misaCode: 'Nga Lam',
  customerName: 'Nga Lâm - HKD Nhà Thuốc Nga Sơn',
  saleName: 'Hoàng Bích Huế',
  address: 'Nhà thuốc Nga Sơn, chợ Đồng phú, Đồng Hới, Quảng Trị',
  province: 'Quảng Trị',
  ward: '',
  phone: '044172008547', // MST/CCCD field — không phải SĐT thực, nhưng MISA lưu vào đây
  description: 'Bán hàng Nga Lâm - HKD Nhà Thuốc Nga Sơn',
  total: 7_065_000,
};

interface LineItem {
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costPerUnit: number;
}

const ITEMS: LineItem[] = [
  { sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',                    unit: 'Hộp',  quantity: 5, unitPrice: 765_000, lineTotal: 3_825_000, costPerUnit: 655_000 },
  { sku: 'MH_05',   productName: 'Viên uống FORCE G Libido 60 viên',            unit: 'Hộp',  quantity: 5, unitPrice: 445_000, lineTotal: 2_225_000, costPerUnit: 346_000 },
  { sku: 'PBB_01',  productName: "Xịt nước muối biển P'tit BOBO ISOTONIC 100ml", unit: 'Hộp', quantity: 5, unitPrice: 108_000, lineTotal:   540_000, costPerUnit:  94_250 },
  { sku: 'PBB_001', productName: "Xịt nước muối biển P'tit BOBO ISOTONIC 50ml",  unit: 'Chai', quantity: 5, unitPrice:  95_000, lineTotal:   475_000, costPerUnit:  81_250 },
];

const MH03_NEW_COST = 655_000;

async function main(): Promise<void> {
  console.log(`Import XK5832 (11/05/2026) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  // Sanity check
  const sum = ITEMS.reduce((s, i) => s + i.lineTotal, 0);
  if (sum !== ORDER.total) {
    throw new Error(`Tổng line items = ${sum.toLocaleString('vi-VN')} ≠ header ${ORDER.total.toLocaleString('vi-VN')}`);
  }
  console.log('✓ Header total khớp line items');

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');

  const users = await prisma.user.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, role: true },
  });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner user');
  const saleId = userByName.get(ORDER.saleName.toLowerCase()) ?? adminUser.id;
  const saleMatched = userByName.has(ORDER.saleName.toLowerCase());

  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: ITEMS.map((i) => i.sku) } },
    select: { id: true, sku: true, costPrice: true },
  });
  const skuToId = new Map(products.map((p) => [p.sku, p.id]));
  const skuToCost = new Map(products.map((p) => [p.sku, p.costPrice ? Number(p.costPrice) : null]));
  for (const it of ITEMS) {
    if (!skuToId.has(it.sku)) throw new Error(`SKU ${it.sku} not in catalog`);
  }

  const existingOrder = await prisma.order.findFirst({
    where: { orgId: org.id, orderCode: ORDER.orderCode },
    select: { id: true },
  });
  const existingContact = await prisma.contact.findFirst({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: ORDER.misaCode },
        { fullName: ORDER.customerName },
      ],
    },
    select: { id: true, fullName: true },
  });

  // ── Phần A: Update MH_03 catalog ────────────────────────────────────
  const mh03Cost = skuToCost.get('MH_03');
  const needMH03Update = mh03Cost !== MH03_NEW_COST;

  console.log('\n─── PHẦN A — Catalog ────────────────────────────────────');
  console.log(`  MH_03 costPrice: ${mh03Cost?.toLocaleString('vi-VN') ?? 'NULL'} → ${MH03_NEW_COST.toLocaleString('vi-VN')}  ${needMH03Update ? '(UPDATE)' : '(OK, skip)'}`);

  // ── Phần B: Import XK5832 ───────────────────────────────────────────
  console.log('\n─── PHẦN B — Order XK5832 ───────────────────────────────');
  console.log(`  Order:   ${existingOrder ? `⏭ exists (id=${existingOrder.id})` : '➕ CREATE'}`);
  console.log(`  Contact: ${existingContact ? `⏭ reuse "${existingContact.fullName}"` : `➕ CREATE "${ORDER.customerName}" (mã ${ORDER.misaCode})`}`);
  console.log(`  Sale:    ${saleMatched ? `✓ ${ORDER.saleName}` : `→Admin (${ORDER.saleName} not found)`}`);
  console.log('\n  Lines:');
  let costSum = 0;
  for (const it of ITEMS) {
    const lineCost = it.costPerUnit * it.quantity;
    costSum += lineCost;
    console.log(`    ${it.sku.padEnd(8)} ×${String(it.quantity).padStart(3)} @${it.unitPrice.toLocaleString('vi-VN').padStart(9)} = ${it.lineTotal.toLocaleString('vi-VN').padStart(11)} đ  | cost ${it.costPerUnit.toLocaleString('vi-VN').padStart(8)}/đv = ${lineCost.toLocaleString('vi-VN').padStart(10)} đ`);
  }
  console.log(`\n  Doanh số: ${ORDER.total.toLocaleString('vi-VN').padStart(11)} đ`);
  console.log(`  Giá vốn:  ${costSum.toLocaleString('vi-VN').padStart(11)} đ`);
  console.log(`  Lãi gộp:  ${(ORDER.total - costSum).toLocaleString('vi-VN').padStart(11)} đ`);
  console.log(`  Margin:   ${(((ORDER.total - costSum) / ORDER.total) * 100).toFixed(2)}%`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');

  // Phần A
  if (needMH03Update) {
    await prisma.product.update({
      where: { id: skuToId.get('MH_03')! },
      data: { costPrice: new Prisma.Decimal(MH03_NEW_COST) },
    });
    console.log(`  ✓ Updated MH_03 costPrice → ${MH03_NEW_COST.toLocaleString('vi-VN')}`);
  } else {
    console.log(`  ⏭ MH_03 costPrice đã đúng`);
  }

  // Phần B — Order
  if (existingOrder) {
    console.log(`  ⏭ Order ${ORDER.orderCode} đã tồn tại — skip`);
    await prisma.$disconnect();
    return;
  }

  let contactId = existingContact?.id;
  if (!contactId) {
    const fullAddress = [ORDER.address, ORDER.ward].filter(Boolean).join(', ') || null;
    const c = await prisma.contact.create({
      data: {
        orgId: org.id,
        misaCustomerCode: ORDER.misaCode,
        fullName: ORDER.customerName,
        // Phone column trong screenshot MISA là field "MST/CCCD chủ hộ" = 044172008547 —
        // không phải SĐT. Để NULL cho đến khi CEO bổ sung SĐT thực.
        phone: null,
        address: fullAddress,
        province: ORDER.province || null,
        source: 'misa_import',
        assignedUserId: saleId,
      },
      select: { id: true },
    });
    contactId = c.id;
    console.log(`  ➕ Contact: ${ORDER.customerName} (id=${contactId})`);
  }

  const order = await prisma.order.create({
    data: {
      orgId: org.id,
      contactId: contactId!,
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
      const lineCost = it.costPerUnit * it.quantity;
      return {
        orderId: order.id,
        productId: skuToId.get(it.sku)!,
        sku: it.sku,
        productName: it.productName,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountValue: 0,
        lineTotal: it.lineTotal,
        costValue: lineCost,
        unitCost: it.costPerUnit,
        lineCost,
        profit: it.lineTotal - lineCost,
        returnQty: 0,
        returnValue: 0,
      };
    }),
  });

  await prisma.contact.update({
    where: { id: contactId! },
    data: { lastOrderDate: ORDER_DATE },
  });

  console.log(`  ✓ Order ${ORDER.orderCode} created (id=${order.id}) — ${ITEMS.length} items`);
  console.log(`  ✓ Synced contact.lastOrderDate`);

  console.log('\n✅ Done.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
