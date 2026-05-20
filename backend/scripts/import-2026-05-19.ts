/**
 * One-off import — 8 đơn ngày 19/05/2026 (XK5900-XK5908, skip XK5905).
 *
 * Source files (Downloads/):
 *   - Ban_hang 19.5.xlsx                (header — 9 đơn)
 *   - So_chi_tiet_ban_hang 19.5.xlsx    (12 line items cho 8 đơn)
 *
 * Lưu ý — XK5905 SKIP (thiếu line item):
 *   Ban_hang có XK5905 "Uyển Nhi" 2.055.000đ (sale Lê Huỳnh Đức, Thái Nguyên)
 *   nhưng Sổ chi tiết KHÔNG có line item. Pattern quen (XK5838, XK5864,
 *   XK5869 trước đây). Anh Philip check MISA — nếu thật thì gửi screenshot
 *   line items cho em bổ sung sau.
 *
 * Quy tắc giá vốn (anh Philip chốt 13/05 + 19/05):
 *   - TUYỆT ĐỐI KHÔNG dùng cột "Giá vốn" Excel MISA.
 *   - Dùng products.cost_price từ DB (đã update theo Bảng giá vốn 1/5/2026).
 *
 * Điểm bất thường (note trong report):
 *   - XK5903 (Chị Hằng, KH lẻ): MH_03 1 hộp × 1.260.000đ (giá lẻ cao ~1.7× sỉ).
 *   - XK5906 BIO_07: giá bán 592k vs cost mới 588k → margin chỉ 0.68%.
 *   - XK5908: có VAG_001 quà tặng (lineTotal=0, cost 148k).
 *
 * Status: tất cả 8 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-19.ts            # dry-run
 *   npx tsx scripts/import-2026-05-19.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-19T00:00:00');

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
  isGift?: boolean;
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5900',
    misaCode: 'Anh Khương',
    customerName: 'Anh Khương - Nguyễn Đức Khương',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Số 26 hẻm 6/30/2 Đội Nhân, phường Ngọc Hà, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Ngọc Hà',
    phone: '0797999886',
    description: 'Bán hàng Anh Khương - Nguyễn Đức Khương',
    total: 19_695_000,
  },
  {
    orderCode: 'XK5901',
    misaCode: 'PML0015',
    customerName: 'PML Nhà Thuốc Tâm - Chị Lý Thanh Tâm',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: '89 Phai Vệ, Phường Đông Kinh, Thành phố Lạng Sơn, Lạng Sơn',
    province: 'Lạng Sơn',
    ward: 'Phường Đông Kinh',
    phone: '0813990662',
    description: 'Bán hàng PML Nhà Thuốc Tâm - Chị Lý Thanh Tâm',
    total: 10_460_000,
  },
  {
    orderCode: 'XK5902',
    misaCode: 'KH90001',
    customerName: 'Bác Sĩ Cam',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Phòng khám sản phụ khoa An Sinh Hạ Long, Số 25, Tổ 1, Khu Trới 10, Hoành Bồ, Hạ Long, Quảng Ninh',
    province: 'Quảng Ninh',
    ward: 'Phường Hoành Bồ',
    phone: '0332020168',
    description: 'Bán hàng Bác Sĩ Cam',
    total: 19_695_000,
  },
  {
    orderCode: 'XK5903',
    misaCode: 'KH90002',
    customerName: 'Chị Hằng',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Ngõ 469 Phan Trọng Tuệ, số 103 dãy B5, Tổ dân phố 2 khu B, Thanh Liệt, Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Liệt',
    phone: '0865776406',
    description: 'Bán hàng Chị Hằng (KH lẻ, MH_03 giá 1.260.000đ)',
    total: 1_260_000,
  },
  {
    orderCode: 'XK5904',
    misaCode: 'KH90003',
    customerName: 'Chị Chu Ha',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Đường 10 thôn Phú Bình, Khánh Phú, phường Đông Hoa Lư, tỉnh Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Phường Đông Hoa Lư',
    phone: '0977667611',
    description: 'Bán hàng Chị Chu Ha',
    total: 1_450_000,
  },
  {
    orderCode: 'XK5906',
    misaCode: 'KH01011',
    customerName: 'Chị Trần Hà Giang',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Số 227, đường 422, Tân Lập, Đan Phượng, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Đan Phượng',
    phone: '0825878286',
    description: 'Bán hàng Chị Trần Hà Giang',
    total: 8_880_000,
  },
  {
    orderCode: 'XK5907',
    misaCode: 'KH90004',
    customerName: 'Nguyễn Thị Hiền',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Tổ 1 Thị Trấn Trạm Tấu, Yên Bái',
    province: 'Yên Bái',
    ward: 'Thị Trấn Trạm Tấu',
    phone: '0968133238',
    description: 'Bán hàng Nguyễn Thị Hiền',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5908',
    misaCode: 'KH14824',
    customerName: 'Anh Dương Hoàng Hà',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: '16a Tổ 4 Thôn Tân Bình, Xã Xuân Mai, TP Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Hà Đông',
    phone: '0374321900',
    description: 'Bán hàng Anh Dương Hoàng Hà (tặng kèm VAG_001 ×1)',
    total: 19_785_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5900', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 39, unitPrice: 505_000,  lineTotal: 19_695_000 },
  { orderCode: 'XK5901', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 6,  unitPrice: 285_000,  lineTotal: 1_710_000 },
  { orderCode: 'XK5901', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 8,  unitPrice: 520_000,  lineTotal: 4_160_000 },
  { orderCode: 'XK5901', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 6,  unitPrice: 765_000,  lineTotal: 4_590_000 },
  { orderCode: 'XK5902', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 39, unitPrice: 505_000,  lineTotal: 19_695_000 },
  { orderCode: 'XK5903', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 1,  unitPrice: 1_260_000, lineTotal: 1_260_000 },
  { orderCode: 'XK5904', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 290_000,  lineTotal: 1_450_000 },
  { orderCode: 'XK5906', sku: 'BIO_07',  productName: 'Bioisland Milk Canxi Bon Care 150v',unit: 'Hộp', quantity: 15, unitPrice: 592_000,  lineTotal: 8_880_000 },
  { orderCode: 'XK5907', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,  unitPrice: 285_000,  lineTotal: 1_425_000 },
  { orderCode: 'XK5908', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 39, unitPrice: 275_000,  lineTotal: 10_725_000 },
  { orderCode: 'XK5908', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 12, unitPrice: 755_000,  lineTotal: 9_060_000 },
  { orderCode: 'XK5908', sku: 'VAG_001', productName: 'Dung dịch vệ sinh Vagisil 240ml (Hồng)', unit: 'Chai', quantity: 1, unitPrice: 0, lineTotal: 0, isGift: true },
];

async function main(): Promise<void> {
  console.log(`Import 19/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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

  const allSkus = Array.from(new Set(ITEMS.map((i) => i.sku)));
  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: allSkus } },
    select: { id: true, sku: true, costPrice: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  for (const sku of allSkus) {
    if (!productBySku.has(sku)) console.warn(`  ⚠ SKU ${sku} not in catalog`);
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
    const saleMatched = o.saleName ? userByName.has(o.saleName.toLowerCase()) : false;
    const hasGift = (itemsByCode.get(o.orderCode) ?? []).some((it) => it.isGift);

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ` +
      `${o.paymentPaid ? '💰 đã TT' : '🕗 nợ   '} ` +
      `| sale: ${saleMatched ? '✓' : '→Admin'} ${(o.saleName || '(trống)').padEnd(20)} ` +
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 35)}` +
      `${hasGift ? ' 🎁' : ''}`
    );
  }

  const headerSum = ORDERS.reduce((s, o) => s + o.total, 0);
  let costSum = 0;
  for (const it of ITEMS) {
    const p = productBySku.get(it.sku);
    if (p?.costPrice) costSum += Number(p.costPrice) * it.quantity;
  }
  const debtSum = ORDERS.filter((o) => !o.paymentPaid).reduce((s, o) => s + o.total, 0);
  const paidSum = ORDERS.filter((o) => o.paymentPaid).reduce((s, o) => s + o.total, 0);

  console.log('\nSummary:');
  console.log(`  Orders:   create ${toCreateOrder}, skip(existing) ${toSkipOrder}`);
  console.log(`  Contacts: create ${toCreateContact}, reuse ${toReuseContact}`);
  console.log(`  Sale:     matched ${ORDERS.length - unmatchedSale}/${ORDERS.length} (rest → Admin)`);
  console.log(`  Items:    ${ITEMS.length} rows (${ITEMS.filter((i) => i.isGift).length} gift)`);
  console.log(`  Doanh số:                 ${headerSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Đã thu:               ${paidSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Còn nợ:               ${debtSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Giá vốn (products.cost_price): ${costSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Lãi gộp:                  ${(headerSum - costSum).toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Margin:                   ${((headerSum - costSum) / headerSum * 100).toFixed(2)}%`);

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

    const saleId = o.saleName ? (userByName.get(o.saleName.toLowerCase()) ?? adminUser.id) : adminUser.id;

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
        internalNote: `Import từ Misa - ${o.description}`,
        productSkus: Array.from(new Set(lineItems.filter((it) => !it.isGift).map((it) => it.sku))),
        confirmedAt: ORDER_DATE,
        packedAt: ORDER_DATE,
        shippedAt: ORDER_DATE,
        completedAt: ORDER_DATE,
      },
      select: { id: true },
    });

    await prisma.orderItem.createMany({
      data: lineItems.map((it) => {
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

    const giftCount = lineItems.filter((it) => it.isGift).length;
    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${o.paymentPaid ? '💰' : '🕗'}  ${lineItems.length} items${giftCount ? ` (${giftCount} gift)` : ''}  sale=${o.saleName || '(trống)'}`
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
