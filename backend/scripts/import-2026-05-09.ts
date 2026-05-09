/**
 * One-off import — 10 đơn ngày 09/05/2026 (XK5816, XK5819-XK5827).
 *
 * Source files:
 *   - Ban_hang 9.5.xlsx           (header — 43-col new MISA format)
 *   - So_chi_tiet_ban_hang 9.5.xlsx (15 line items)
 *
 * Vì format MISA đổi từ 47 cột → 43 cột (bỏ "Mã NVBH", "Người mua hàng"
 * shifted, etc.), `import-misa-full.ts` đọc lệch cột nên script này dùng
 * dữ liệu đã extract sẵn (hardcoded) để bypass parser cũ.
 *
 * Status: tất cả 10 đơn `Đã xuất đủ + Chưa thanh toán` →
 *   status='completed', paymentMethod='credit', paid=0, debt=total.
 *
 * Idempotent: re-chạy là no-op (skip orderCode đã tồn tại; reuse contact
 * theo misaCustomerCode hoặc fullName).
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-09.ts            # dry-run
 *   npx tsx scripts/import-2026-05-09.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-09T00:00:00');

interface OrderHeader {
  orderCode: string;
  misaCode: string;       // Col "Mã khách hàng" — có thể là code KHxxx hoặc tên freeform
  customerName: string;
  saleName: string;       // Empty/Halo VN → fallback admin
  address: string;
  province: string;
  ward: string;
  phone: string;
  description: string;
  total: number;
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  costValue: number;
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5816',
    misaCode: 'Chị Trần THị Thoa',
    customerName: 'Chị Trần Thị Thoa - HKD NHÀ THUỐC TƯ NHÂN CƯỜNG THOA',
    saleName: 'Phí Hữu Luận',
    address: 'Nhà thuốc Cường Thoa D6 lL 12, Định Công, Phương Liệt, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Phương Liệt',
    phone: '0988552281',
    description: 'Bán hàng Chị Trần Thị Thoa - HKD NHÀ THUỐC TƯ NHÂN CƯỜNG THOA',
    total: 5_575_000,
  },
  {
    orderCode: 'XK5819',
    misaCode: 'PML0003',
    customerName: 'Quầy thuốc Nam Huyền',
    saleName: 'Halo VN',
    address: 'Trung tâm thương mại Dân Tiến, Thôn An Bình, Xã Dân Tiến, Khoái Châu, Hưng Yên',
    province: 'Thái Nguyên',
    ward: 'Xã Dân Tiến',
    phone: '0986009824',
    description: 'Bán hàng Quầy thuốc Nam Huyền',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5820',
    misaCode: 'Chị Minh Minh',
    customerName: 'Chị Minh Minh',
    saleName: 'Nguyễn Thành Đạt',
    address: 'Số nhà 234 tổ 6 khu trới 1 Hạ Long, Quảng ninh',
    province: 'Quảng Ninh',
    ward: 'Phường Hạ Long',
    phone: '0347556286',
    description: 'Bán hàng Chị Minh Minh',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5821',
    misaCode: 'Chị Minh Thư',
    customerName: 'Chị Minh Thư',
    saleName: 'Nguyễn Thành Đạt',
    address: 'Số 1 Phạm Văn Đồng, Tích Sơn, Vĩnh Yên, Vĩnh Phúc',
    province: '',
    ward: '',
    phone: '0916371234',
    description: 'Bán hàng Chị Minh Thư',
    total: 5_500_000,
  },
  {
    orderCode: 'XK5822',
    misaCode: 'KH00023',
    customerName: 'Chị Đỗ Tuyền',
    saleName: 'Halo VN',
    address: 'Từ Sơn, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Từ Sơn',
    phone: '0963548858',
    description: 'Bán hàng Chị Đỗ Tuyền',
    total: 87_600_000,
  },
  {
    orderCode: 'XK5823',
    misaCode: 'KH00025',
    customerName: 'Uyển Nhi - CÔNG TY TNHH NHÀ THUỐC THẮNG HƯƠNG',
    saleName: 'Lê Huỳnh Đức',
    address: 'Số nhà 41, Tổ dân phố 6, Phường Phổ Yên, Thái Nguyên',
    province: 'Thái Nguyên',
    ward: 'Phường Phổ Yên',
    phone: '',
    description: 'Bán hàng Uyển Nhi - CÔNG TY TNHH NHÀ THUỐC THẮNG HƯƠNG',
    total: 6_675_000,
  },
  {
    orderCode: 'XK5824',
    misaCode: 'KH011111',
    customerName: 'Chị Ngụy Thị Lan',
    saleName: 'Phí Hữu Luận',
    address: '60 Tân Mỹ, Tiền Phong, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Tiền Phong',
    phone: '0352012812',
    description: 'Bán hàng Chị Ngụy Thị Lan',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5825',
    misaCode: 'KH00006',
    customerName: 'CÔNG TY CỔ PHẦN THẾ THẢO PHARMA',
    saleName: 'Lê Huỳnh Đức',
    address: 'Tầng 1 sảnh B toà nhà 57 Vũ Trọng Phụng',
    province: '',
    ward: '',
    phone: '0373825115',
    description: 'Bán hàng CÔNG TY CỔ PHẦN THẾ THẢO PHARMA',
    total: 10_750_000,
  },
  {
    orderCode: 'XK5826',
    misaCode: 'Dược Sĩ Thương',
    customerName: 'Dược Sĩ Thương',
    saleName: 'Lê Huỳnh Đức',
    address: '90 Phố Sàn, Phương Sơn Lục Nam, Bắc Giang',
    province: '',
    ward: '',
    phone: '0942560815',
    description: 'Bán hàng Dược Sĩ Thương',
    total: 21_450_000,
  },
  {
    orderCode: 'XK5827',
    misaCode: 'HKD Nhà thuốc Khánh Ngân',
    customerName: 'HKD Nhà thuốc Khánh Ngân',
    saleName: 'Nguyễn Thành Đạt',
    address: '1 số 6 ngõ 126 đường Đào Sư Tích, phường Bắc Giang, tỉnh Bắc Giang',
    province: 'Bắc Ninh',
    ward: 'Phường Bắc Giang',
    phone: '0973639910',
    description: 'Bán hàng HKD Nhà thuốc Khánh Ngân',
    total: 2_850_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5816', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 5,   unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5816', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên', unit: 'Hộp', quantity: 5,   unitPrice: 350_000, lineTotal: 1_750_000,  costValue: 1_428_661 },
  { orderCode: 'XK5819', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_200_195 },
  { orderCode: 'XK5820', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 5,   unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5821', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 20,  unitPrice: 275_000, lineTotal: 5_500_000,  costValue: 4_800_781 },
  { orderCode: 'XK5822', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 120, unitPrice: 730_000, lineTotal: 87_600_000, costValue: 0 },
  { orderCode: 'XK5823', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 10,  unitPrice: 285_000, lineTotal: 2_850_000,  costValue: 2_400_391 },
  { orderCode: 'XK5823', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 5,   unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5824', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_200_195 },
  { orderCode: 'XK5825', sku: 'OTB01', productName: 'Optibac For Women 30 viên', unit: 'Hộp', quantity: 10,  unitPrice: 350_000, lineTotal: 3_500_000,  costValue: 3_399_984 },
  { orderCode: 'XK5825', sku: 'MH_09', productName: 'Manhae Collagen Expert 30 Viên', unit: 'Hộp', quantity: 5,   unitPrice: 395_000, lineTotal: 1_975_000,  costValue: 1_650_000 },
  { orderCode: 'XK5825', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 10,  unitPrice: 275_000, lineTotal: 2_750_000,  costValue: 2_400_391 },
  { orderCode: 'XK5825', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', unit: 'Hộp', quantity: 5,   unitPrice: 505_000, lineTotal: 2_525_000,  costValue: 2_179_974 },
  { orderCode: 'XK5826', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 78,  unitPrice: 275_000, lineTotal: 21_450_000, costValue: 18_723_047 },
  { orderCode: 'XK5827', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 10,  unitPrice: 285_000, lineTotal: 2_850_000,  costValue: 2_400_391 },
];

async function main(): Promise<void> {
  console.log(`Import 09/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  // Sanity: header total = items sum per order
  const itemsByCode = new Map<string, LineItem[]>();
  for (const it of ITEMS) {
    const arr = itemsByCode.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByCode.set(it.orderCode, arr);
  }
  for (const o of ORDERS) {
    const items = itemsByCode.get(o.orderCode) ?? [];
    const sum = items.reduce((s, i) => s + i.lineTotal, 0);
    if (sum !== o.total) {
      throw new Error(`Tổng line items của ${o.orderCode} = ${sum.toLocaleString('vi-VN')} ≠ header ${o.total.toLocaleString('vi-VN')}`);
    }
  }
  console.log('✓ Header totals match line items for all 10 orders');

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
    where: { orgId: org.id, sku: { in: Array.from(new Set(ITEMS.map((i) => i.sku))) } },
    select: { id: true, sku: true },
  });
  const skuToId = new Map(products.map((p) => [p.sku, p.id]));
  for (const sku of new Set(ITEMS.map((i) => i.sku))) {
    if (!skuToId.has(sku)) console.warn(`  ⚠ SKU ${sku} not in catalog`);
  }

  // Pre-load existing data
  const existingOrders = await prisma.order.findMany({
    where: { orgId: org.id, orderCode: { in: ORDERS.map((o) => o.orderCode) } },
    select: { orderCode: true, id: true },
  });
  const existingOrderCodes = new Set(existingOrders.map((o) => o.orderCode));

  const existingContacts = await prisma.contact.findMany({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: { in: ORDERS.map((o) => o.misaCode) } },
        { fullName: { in: ORDERS.map((o) => o.customerName) } },
      ],
    },
    select: { id: true, misaCustomerCode: true, fullName: true },
  });
  const contactByMisa = new Map(existingContacts.filter((c) => c.misaCustomerCode).map((c) => [c.misaCustomerCode!, c.id]));
  const contactByName = new Map(existingContacts.map((c) => [c.fullName, c.id]));

  console.log('\n─── DIFF ─────────────────────────────────────────────────');
  let toCreateOrder = 0, toSkipOrder = 0;
  let toCreateContact = 0, toReuseContact = 0;
  let unmatchedSale = 0;

  console.log('\nOrder plan:');
  for (const o of ORDERS) {
    const exists = existingOrderCodes.has(o.orderCode);
    const contactId = contactByMisa.get(o.misaCode) ?? contactByName.get(o.customerName);
    const reuseContact = !!contactId;
    const saleId = userByName.get(o.saleName.toLowerCase()) ?? adminUser.id;
    const saleMatched = userByName.has(o.saleName.toLowerCase());

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)} đ  ` +
      `| sale: ${saleMatched ? '✓' : '→Admin'} ${o.saleName.padEnd(18)} ` +
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 50)}`
    );
  }

  const headerSum = ORDERS.reduce((s, o) => s + o.total, 0);
  const costSum = ITEMS.reduce((s, i) => s + i.costValue, 0);
  console.log('\nSummary:');
  console.log(`  Orders:   create ${toCreateOrder}, skip(existing) ${toSkipOrder}`);
  console.log(`  Contacts: create ${toCreateContact}, reuse ${toReuseContact}`);
  console.log(`  Sale:     matched ${ORDERS.length - unmatchedSale}/${ORDERS.length} (rest → Admin)`);
  console.log(`  Items:    ${ITEMS.length} rows`);
  console.log(`  Doanh số: ${headerSum.toLocaleString('vi-VN')} đ`);
  console.log(`  Giá vốn:  ${costSum.toLocaleString('vi-VN')} đ`);
  console.log(`  Lãi gộp:  ${(headerSum - costSum).toLocaleString('vi-VN')} đ`);

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────');

  const touchedContacts = new Set<string>();

  for (const o of ORDERS) {
    if (existingOrderCodes.has(o.orderCode)) {
      console.log(`  ⏭  ${o.orderCode} đã tồn tại — skip`);
      continue;
    }

    const saleId = userByName.get(o.saleName.toLowerCase()) ?? adminUser.id;

    // Resolve / create contact
    let contactId = contactByMisa.get(o.misaCode) ?? contactByName.get(o.customerName);
    if (!contactId) {
      // Schema chỉ có address + province (không có ward/district) — gộp ward
      // vào address giống `import-misa-full.ts`.
      const fullAddress = [o.address, o.ward].filter(Boolean).join(', ') || null;
      const c = await prisma.contact.create({
        data: {
          orgId: org.id,
          misaCustomerCode: o.misaCode,
          fullName: o.customerName,
          phone: o.phone || null,
          address: fullAddress,
          province: o.province || null,
          source: 'misa_import',
          assignedUserId: saleId,
        },
        select: { id: true },
      });
      contactId = c.id;
      contactByMisa.set(o.misaCode, contactId);
      contactByName.set(o.customerName, contactId);
      console.log(`  ➕ contact: ${o.customerName} (id=${contactId})`);
    }
    touchedContacts.add(contactId);

    const lineItems = itemsByCode.get(o.orderCode) ?? [];

    const order = await prisma.order.create({
      data: {
        orgId: org.id,
        contactId,
        createdByUserId: adminUser.id,
        assignedSaleId: saleId,
        orderCode: o.orderCode,
        orderDate: ORDER_DATE,
        status: 'completed',
        paymentMethod: 'credit',
        totalAmount: o.total,
        subtotalAmount: o.total,
        discountAmount: 0,
        totalAmountValue: o.total,
        paidAmount: 0,
        debtAmountValue: o.total,
        internalNote: o.description,
        productSkus: Array.from(new Set(lineItems.map((it) => it.sku))),
        confirmedAt: ORDER_DATE,
        packedAt: ORDER_DATE,
        shippedAt: ORDER_DATE,
        completedAt: ORDER_DATE,
      },
      select: { id: true },
    });

    await prisma.orderItem.createMany({
      data: lineItems.map((it) => {
        const lineCost = it.costValue;
        const profit = it.lineTotal - lineCost;
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
          costValue: it.costValue || null,
          unitCost: it.costValue && it.quantity > 0 ? it.costValue / it.quantity : null,
          lineCost: it.costValue || null,
          profit: profit || null,
          returnQty: 0,
          returnValue: 0,
        };
      }),
    });

    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN')} đ  ${lineItems.length} items  sale=${saleId === adminUser.id && !userByName.has(o.saleName.toLowerCase()) ? 'Admin (fallback)' : o.saleName}`
    );
  }

  // Sync contact.lastOrderDate (only for completed orders → these are all completed)
  console.log('\nSyncing contact.lastOrderDate…');
  for (const cid of touchedContacts) {
    const last = await prisma.order.findFirst({
      where: { contactId: cid, status: 'completed' },
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });
    if (last?.orderDate) {
      await prisma.contact.update({
        where: { id: cid },
        data: { lastOrderDate: last.orderDate },
      });
    }
  }
  console.log(`  ✓ Synced ${touchedContacts.size} contacts`);

  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
