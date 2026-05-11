/**
 * One-off import — 7 đơn ngày 11/05/2026
 * (XK5830, XK5831, XK5833, XK5834, XK5835, XK5836, XK5837 — gap XK5832).
 *
 * Source files:
 *   - Ban_hang 11.5.xlsx                (header — 43-col new MISA format)
 *   - So_chi_tiet_ban_hang. 11.5.xlsx   (11 line items)
 *
 * Status:
 *   5 đơn `Đã xuất đủ + Chưa thanh toán` → completed/credit (đại lý nợ)
 *   2 đơn `Đã xuất đủ + Đã thanh toán`  → completed/bank_transfer
 *     (XK5830 Anh Thư Dmp, XK5836 Diệu Hiền Nguyễn)
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-11.ts            # dry-run
 *   npx tsx scripts/import-2026-05-11.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-11T00:00:00');

interface OrderHeader {
  orderCode: string;
  misaCode: string;
  customerName: string;
  saleName: string;
  paymentPaid: boolean;       // true = "Đã thanh toán", false = "Chưa thanh toán"
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
    orderCode: 'XK5830',
    misaCode: 'KH00061',
    customerName: 'Anh Thư Dmp',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    address: '110 Đào Sư ích, Phường Hoàng Văn Thụ, Thành Phố Bắc Giang',
    province: '',
    ward: '',
    phone: '0968507565',
    description: 'Bán hàng Anh Thư Dmp',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5831',
    misaCode: 'Nga Lam1',
    customerName: 'Quầy thuốc Trang Sơn - Nguyễn Thị Trang',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Mão Cầu, Hồ Tùng Mậu, Ân Thi, Hưng yên',
    province: 'Hưng Yên',
    ward: 'Xã Ân Thi',
    phone: '033189015948',
    description: 'Bán hàng Quầy thuốc Trang Sơn - Nguyễn Thị Trang',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5833',
    misaCode: 'Chị Hà Tuyền',
    customerName: 'Chị Hà Tuyền - HKD NHÀ THUỐC THANH TUYỀN',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: '874 Võ Nguyên Giáp, Phường An Nhơn Nam, Tỉnh Gia Lai',
    province: 'Gia Lai',
    ward: 'Phường An Nhơn Nam',
    phone: '0333264826',
    description: 'Bán hàng Chị Hà Tuyền - HKD NHÀ THUỐC THANH TUYỀN',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5834',
    misaCode: 'Tuân Trang',
    customerName: 'Chị Trang - HKD Nhà Thuốc Tuân Trang',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    address: 'Ngã Tư Chợ Tiêu, phường Tương Giang, Từ Sơn, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Từ Sơn',
    phone: '0375245263',
    description: 'Bán hàng Chị Trang - HKD Nhà Thuốc Tuân Trang',
    total: 1_710_000,
  },
  {
    orderCode: 'XK5835',
    misaCode: 'KH00049',
    customerName: 'CÔNG TY TNHH CHU PHUONG LINH',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: '175 Lê Lai, Hà Đông',
    province: 'Hải Phòng',
    ward: 'Xã Hà Đông',
    phone: '078 9342000',
    description: 'Bán hàng CÔNG TY TNHH CHU PHUONG LINH',
    total: 41_700_000,
  },
  {
    orderCode: 'XK5836',
    misaCode: 'KH00013',
    customerName: 'Diệu Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    address: '',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0866006586',
    description: 'Bán hàng Diệu Hiền Nguyễn',
    total: 17_880_000,
  },
  {
    orderCode: 'XK5837',
    misaCode: 'Loan Phạm',
    customerName: 'Chị Loan Phạm - HKD Nhà Thuốc Loan Phạm',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    address: 'Số 19 ngõ 199 thôn Tế Xuyên 1, Xã Phù Đổng, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Phù Đổng',
    phone: '0363829263',
    description: 'Bán hàng Chị Loan Phạm - HKD Nhà Thuốc Loan Phạm',
    total: 5_400_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5830', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal: 3_825_000,  costValue: 0 },
  { orderCode: 'XK5831', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_200_195 },
  { orderCode: 'XK5833', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_200_195 },
  { orderCode: 'XK5834', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 6,  unitPrice: 285_000, lineTotal: 1_710_000,  costValue: 1_440_234 },
  { orderCode: 'XK5835', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 50, unitPrice: 265_000, lineTotal: 13_250_000, costValue: 11_999_805 },
  { orderCode: 'XK5835', sku: 'MH_02', productName: 'Manhae Menopause 60 viên',           unit: 'Hộp', quantity: 50, unitPrice: 485_000, lineTotal: 24_250_000, costValue: 21_799_743 },
  { orderCode: 'XK5835', sku: 'MH_05', productName: 'Vitavea FORCE G Libido 60 viên',     unit: 'Hộp', quantity: 10, unitPrice: 420_000, lineTotal: 4_200_000,  costValue: 3_460_000 },
  { orderCode: 'XK5836', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 24, unitPrice: 745_000, lineTotal: 17_880_000, costValue: 0 },
  { orderCode: 'XK5837', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  costValue: 1_200_195 },
  { orderCode: 'XK5837', sku: 'MH_05', productName: 'Vitavea FORCE G Libido 60 viên',     unit: 'Hộp', quantity: 5,  unitPrice: 445_000, lineTotal: 2_225_000,  costValue: 1_730_000 },
  { orderCode: 'XK5837', sku: 'MH_07', productName: 'Manhae Intima Equilibre 30 viên',    unit: 'Hộp', quantity: 5,  unitPrice: 350_000, lineTotal: 1_750_000,  costValue: 1_428_661 },
];

async function main(): Promise<void> {
  console.log(`Import 11/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
