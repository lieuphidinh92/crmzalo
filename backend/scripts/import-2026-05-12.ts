/**
 * One-off import — 11 đơn ngày 12/05/2026
 * (XK5839 → XK5849 liên tục, không gap).
 *
 * Source files (Downloads/):
 *   - Ban_hang 12.5.xlsx                (header — 43-col new MISA format, 12 đơn)
 *   - So_chi_tiet_ban_hang 12.5.xlsx    (12 line items cho 11 đơn)
 *
 * Lưu ý — XK5838 SKIP:
 *   Ban_hang có 12 đơn (XK5838 → XK5849) nhưng Sổ chi tiết chỉ có
 *   XK5839 → XK5849. XK5838 là Chị Linh Nữ 3,175,000đ tạo lúc 08:25
 *   (không địa chỉ); XK5839 cũng Chị Linh Nữ 3,175,000đ tạo 08:27
 *   (full địa chỉ Bản Phúc, Tạ Khoa, Sơn La). XK5838 nhiều khả năng
 *   là đơn nháp trùng → không có line item → KHÔNG IMPORT.
 *   Anh Philip nên xóa XK5838 trên MISA để khớp Sổ chi tiết.
 *
 * Status:
 *   Tất cả 11 đơn = `Đã xuất đủ + Chưa thanh toán` → completed/credit (đại lý nợ).
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-12.ts            # dry-run
 *   npx tsx scripts/import-2026-05-12.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-12T00:00:00');

interface OrderHeader {
  orderCode: string;
  misaCode: string;
  customerName: string;
  saleName: string;
  paymentPaid: boolean;
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
    orderCode: 'XK5839',
    misaCode: 'Chị Linh Nữ',
    customerName: 'Chị Linh Nữ',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    address: 'Bản Phúc, xã Tạ Khoa, tỉnh Sơn La',
    province: 'Sơn La',
    ward: 'Xã Tạ Khoa',
    phone: '0339989140',
    description: 'Bán hàng Chị Linh Nữ',
    total: 3_175_000,
  },
  {
    orderCode: 'XK5840',
    misaCode: 'Chị Nga Hoàng',
    customerName: 'Chị Nga Hoang- HKD Nhà Thuốc Quý Nga - BS Quý',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'SN 30, Vân Sa 1, Tản Hồng, Ba Vì, Hà Nội',
    province: '',
    ward: '',
    phone: '0868068591',
    description: 'Bán hàng Chị Nga Hoang- HKD Nhà Thuốc Quý Nga - BS Quý',
    total: 3_120_000,
  },
  {
    orderCode: 'XK5841',
    misaCode: 'KH00006',
    customerName: 'CÔNG TY CỔ PHẦN THẾ THẢO PHARMA',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Tầng 1 sảnh B toà nhà 57 Vũ Trọng Phụng',
    province: '',
    ward: '',
    phone: '0373825115',
    description: 'Bán hàng CÔNG TY CỔ PHẦN THẾ THẢO PHARMA',
    total: 7_700_000,
  },
  {
    orderCode: 'XK5842',
    misaCode: 'Anh Khương',
    customerName: 'Anh Khương - Nguyễn Đức Khương',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Số 26 hẻm 6/30/2 Đội Nhân, phường Ngọc Hà, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Ngọc Hà',
    phone: '0797999886',
    description: 'Bán hàng Anh Khương - Nguyễn Đức Khương',
    total: 21_450_000,
  },
  {
    orderCode: 'XK5843',
    misaCode: 'KH00061',
    customerName: 'Anh Thư Dmp - Bùi Thị Vân',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Số 281, Minh Khai, Thị Trấn Chũ, Huyện Lục Ngạn, Bắc Giang',
    province: '',
    ward: '',
    phone: '0968507565',
    description: 'Bán hàng Anh Thư Dmp - Bùi Thị Vân',
    total: 13_005_000,
  },
  {
    orderCode: 'XK5844',
    misaCode: 'PML0004',
    customerName: 'Nhà Thuốc Quỳnh Lịch',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'chợ chiều, xã Văn Môn, tỉnh Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Xã Văn Môn',
    phone: '0987378617',
    description: 'Bán hàng Nhà Thuốc Quỳnh Lịch',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5845',
    misaCode: 'PML0005',
    customerName: 'Quầy Thuốc Thanh Thoa',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Thôn Đông, đặc khu Lý Sơn, Quảng Ngãi',
    province: 'Quảng Ngãi',
    ward: 'Đặc khu Lý Sơn',
    phone: '0968552014',
    description: 'Bán hàng Quầy Thuốc Thanh Thoa',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5846',
    misaCode: 'PML0006',
    customerName: 'Nhà thuốc Thanh Dũng',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Thôn 4, xã Sam Mứn, Tỉnh Điện Biên',
    province: 'Điện Biên',
    ward: 'Xã Sam Mứn',
    phone: '0368059899',
    description: 'Bán hàng Nhà thuốc Thanh Dũng',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5847',
    misaCode: 'Chị Hằng',
    customerName: 'Chị Hằng - HKD Nhà thuốc Mai Anh 01',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    address: 'Thôn Đồng Ván, xã Bình Ca, tỉnh Tuyên Quang',
    province: 'Tuyên Quang',
    ward: 'Xã Bình Ca',
    phone: '0813898555',
    description: 'Bán hàng Chị Hằng - HKD Nhà thuốc Mai Anh 01',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5848',
    misaCode: 'Chị Hương',
    customerName: 'Chị Hương - Quách Thị Hương',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Quầy thuốc Dũng Hương Thôn Thống Nhất, Yên Thọ, Thanh Hóa',
    province: '',
    ward: '',
    phone: '0964318115',
    description: 'Bán hàng Chị Hương - Quách Thị Hương',
    total: 2_850_000,
  },
  {
    orderCode: 'XK5849',
    misaCode: 'Hằng Ni',
    customerName: 'Chị Hằng Ni',
    saleName: 'Nguyễn Thành Đạt',
    paymentPaid: false,
    address: 'Quầy thuốc Hưng Phát, ấp Rạch, xã Đất Mũi, Ngọc Hiển, Cà Mau',
    province: 'Cà Mau',
    ward: 'Xã Đất Mũi',
    phone: '0949682687',
    description: 'Bán hàng Chị Hằng Ni',
    total: 1_425_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5839', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_199_980 },
  { orderCode: 'XK5839', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên',    unit: 'Hộp', quantity: 5,  unitPrice: 350_000, lineTotal: 1_750_000,  costValue: 1_428_661 },
  { orderCode: 'XK5840', sku: 'MH_02', productName: 'Manhae Menopause 60 viên',           unit: 'Hộp', quantity: 6,  unitPrice: 520_000, lineTotal: 3_120_000,  costValue: 2_615_969 },
  { orderCode: 'XK5841', sku: 'OTB02', productName: 'Optibac For Women 90 viên',          unit: 'Hộp', quantity: 10, unitPrice: 770_000, lineTotal: 7_700_000,  costValue: 7_480_000 },
  { orderCode: 'XK5842', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 78, unitPrice: 275_000, lineTotal: 21_450_000, costValue: 18_719_695 },
  { orderCode: 'XK5843', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 17, unitPrice: 765_000, lineTotal: 13_005_000, costValue: 0 },
  { orderCode: 'XK5844', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_199_980 },
  { orderCode: 'XK5845', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_199_980 },
  { orderCode: 'XK5846', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5847', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5848', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 10, unitPrice: 285_000, lineTotal: 2_850_000,  costValue: 2_399_961 },
  { orderCode: 'XK5849', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_199_980 },
];

async function main(): Promise<void> {
  console.log(`Import 12/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

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
  console.log('✓ Header totals match line items');

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
    const saleMatched = userByName.has(o.saleName.toLowerCase());

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)} đ  ` +
      `${o.paymentPaid ? '💰 đã TT' : '🕗 nợ   '} ` +
      `| sale: ${saleMatched ? '✓' : '→Admin'} ${o.saleName.padEnd(16)} ` +
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 45)}`
    );
  }

  const headerSum = ORDERS.reduce((s, o) => s + o.total, 0);
  const costSum = ITEMS.reduce((s, i) => s + i.costValue, 0);
  const debtSum = ORDERS.filter((o) => !o.paymentPaid).reduce((s, o) => s + o.total, 0);
  const paidSum = ORDERS.filter((o) => o.paymentPaid).reduce((s, o) => s + o.total, 0);
  console.log('\nSummary:');
  console.log(`  Orders:   create ${toCreateOrder}, skip(existing) ${toSkipOrder}`);
  console.log(`  Contacts: create ${toCreateContact}, reuse ${toReuseContact}`);
  console.log(`  Sale:     matched ${ORDERS.length - unmatchedSale}/${ORDERS.length} (rest → Admin)`);
  console.log(`  Items:    ${ITEMS.length} rows`);
  console.log(`  Doanh số: ${headerSum.toLocaleString('vi-VN')} đ`);
  console.log(`    - Đã thu:  ${paidSum.toLocaleString('vi-VN')} đ`);
  console.log(`    - Còn nợ:  ${debtSum.toLocaleString('vi-VN')} đ`);
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

    let contactId = contactByMisa.get(o.misaCode) ?? contactByName.get(o.customerName);
    if (!contactId) {
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
    const paymentMethod = o.paymentPaid ? 'bank_transfer' : 'credit';
    const paidAmount = o.paymentPaid ? o.total : 0;
    const debtAmount = o.paymentPaid ? 0 : o.total;

    const order = await prisma.order.create({
      data: {
        orgId: org.id,
        contactId,
        createdByUserId: adminUser.id,
        assignedSaleId: saleId,
        orderCode: o.orderCode,
        orderDate: ORDER_DATE,
        status: 'completed',
        paymentMethod,
        totalAmount: o.total,
        subtotalAmount: o.total,
        discountAmount: 0,
        totalAmountValue: o.total,
        paidAmount,
        debtAmountValue: debtAmount,
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
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)} đ  ${o.paymentPaid ? '💰' : '🕗'}  ${lineItems.length} items  sale=${o.saleName}`
    );
  }

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
