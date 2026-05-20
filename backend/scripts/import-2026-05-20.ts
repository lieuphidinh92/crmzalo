/**
 * One-off import — 8 đơn ngày 20/05/2026 (XK5909-XK5915 + PT00647).
 *
 * Source files (Downloads/):
 *   - Ban_hang 20.5.xlsx                (header — 8 đơn)
 *   - So_chi_tiet_ban_hang 20.5.xlsx    (11 line items)
 *
 * Quy tắc đã chốt với anh Philip:
 *
 *   1. Giá vốn (13/05): KHÔNG dùng cột "Giá vốn" Excel MISA. Dùng
 *      products.cost_price từ DB (đã sync registry 19/05).
 *
 *   2. Doanh thu để tính lãi gộp (21/05): dùng số CÓ VAT (Tổng tiền
 *      thanh toán), vì cost registry đã bao gồm VAT đầu vào.
 *      → XK5909 (LB Global): unitPrice CÓ VAT, header = 114_690_000đ.
 *      → 7 đơn còn lại: VAT=0, số gốc giữ nguyên.
 *
 * Đặc thù XK5909 (LB Global, đơn duy nhất có VAT 8%):
 *   Excel MISA ghi unitPrice CHƯA VAT lẻ đẹp:
 *     MH_01 245_370.37 → ×1.08 = 265_000  ✓ tròn
 *     MH_02 449_074.08 → ×1.08 = 485_000  ✓ tròn
 *     MH_03 685_185.19 → ×1.08 = 740_000  ✓ tròn
 *   Sum line items CÓ VAT = 114_690_000đ (MISA Tổng TT 114_690_001 —
 *   chênh 1đ do MISA tự làm tròn VAT). Lấy 114_690_000 cho clean.
 *
 * Quà tặng:
 *   XK5913 có VAG_001 ×1 kèm (unitPrice=0, lineTotal=0, isGift=true).
 *   Vẫn record để trừ kho + tính chi phí marketing 148k.
 *
 * Thanh toán:
 *   PT00647 (PK BS Ngọc Diễm) = "Bán hàng hóa trong nước - Tiền mặt"
 *     → paymentPaid=true, paymentMethod='cash'.
 *   7 đơn XK còn lại = "Chưa thanh toán" → paymentPaid=false, credit.
 *
 * Status: tất cả 8 đơn = Đã xuất đủ → status='completed'.
 *
 * Idempotent: re-chạy là no-op (skip nếu orderCode đã tồn tại).
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-20.ts            # dry-run
 *   npx tsx scripts/import-2026-05-20.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-20T00:00:00');

interface OrderHeader {
  orderCode: string;
  misaCode: string;
  customerName: string;
  saleName: string;
  paymentPaid: boolean;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  address: string;
  province: string;
  ward: string;
  phone: string;
  description: string;
  total: number;          // = "Tổng tiền thanh toán" (có VAT nếu có)
  hasVat: boolean;        // chỉ XK5909 LB Global
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;      // CÓ VAT (nếu đơn có VAT) — khớp với lineTotal
  lineTotal: number;
  isGift?: boolean;
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5909',
    misaCode: 'KH2005',
    customerName: 'CÔNG TY CỔ PHẦN THƯƠNG MẠI QUỐC TẾ LB GLOBAL',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 23, ngõ 66/18/24 Dịch Vọng Hậu, phường Cầu Giấy, thành phố Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Cầu Giấy',
    phone: '0966831395',
    description: 'Bán hàng CÔNG TY CỔ PHẦN THƯƠNG MẠI QUỐC TẾ LB GLOBAL (VAT 8%)',
    total: 114_690_000,
    hasVat: true,
  },
  {
    orderCode: 'XK5910',
    misaCode: 'PML0016',
    customerName: 'PML QT Thanh Nguyệt',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'tổ dân phố Tân Sơn, thị trấn Hùng Sơn, Đại Từ, Thái Nguyên',
    province: 'Thái Nguyên',
    ward: 'Xã Đại Từ',
    phone: '0984812466',
    description: 'Bán hàng PML QT Thanh Nguyệt',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5911',
    misaCode: 'KH00002',
    customerName: 'Chị Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0971299996',
    description: 'Bán hàng Chị Hiền Nguyễn',
    total: 14_472_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5912',
    misaCode: 'KH20061',
    customerName: 'Chị Đào Thị Ninh - HKD AN NINH HEALTHTECH CARE',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Nhà số 7, ngách 66, ngõ Đìa 4, thôn Đìa, Phúc Thịnh, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Phúc Thịnh',
    phone: '0962686582',
    description: 'Bán hàng Chị Đào Thị Ninh - HKD AN NINH HEALTHTECH CARE',
    total: 1_450_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5913',
    misaCode: 'KH01003',
    customerName: 'Chị Nhật Hà',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Thôn số 1, Xã Sơn Động, Tỉnh Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Xã Sơn Động',
    phone: '0838998098',
    description: 'Bán hàng Chị Nhật Hà (tặng kèm VAG_001 ×1)',
    total: 7_650_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5914',
    misaCode: 'KH20071',
    customerName: 'Chị Huong Ly',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '81 Lý Hồng Nhật, Cát Bi, Hải An, Hải phòng',
    province: 'Hải Phòng',
    ward: 'Phường Hải An',
    phone: '0902166968',
    description: 'Bán hàng Chị Huong Ly',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5915',
    misaCode: 'KH20081',
    customerName: 'Lại Thị Hà - HKD QUẦY THUỐC NAM HÀ - HÀ NAM',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 100, tổ 5, thôn Xuân Sen, xã Xuân Mai, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Xuân Mai',
    phone: '0975493800',
    description: 'Bán hàng Lại Thị Hà - HKD QUẦY THUỐC NAM HÀ - HÀ NAM',
    total: 2_600_000,
    hasVat: false,
  },
  {
    orderCode: 'PT00647',
    misaCode: 'KH2005.1',
    customerName: 'PK Sản phụ khoa BS Ngọc Diễm',
    saleName: 'Halo VN',
    paymentPaid: true,
    paymentMethod: 'cash',
    address: 'Làng Dưới - Xuân Lương - Yên Thế - Bắc Giang',
    province: 'Bắc Giang',
    ward: 'Xã Xuân Lương',
    phone: '',
    description: 'Thu tiền bán hàng PK Sản phụ khoa BS Ngọc Diễm (Tiền mặt)',
    total: 1_425_000,
    hasVat: false,
  },
];

const ITEMS: LineItem[] = [
  // XK5909 LB Global — unitPrice CÓ VAT 8% (số tròn đẹp)
  { orderCode: 'XK5909', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 156, unitPrice: 265_000, lineTotal: 41_340_000 },
  { orderCode: 'XK5909', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 78,  unitPrice: 485_000, lineTotal: 37_830_000 },
  { orderCode: 'XK5909', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 48,  unitPrice: 740_000, lineTotal: 35_520_000 },
  // 7 đơn còn lại — không VAT
  { orderCode: 'XK5910', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5911', sku: 'BIO_07',  productName: 'Bioisland Milk Canxi Bon Care 150v',unit: 'Hộp', quantity: 24,  unitPrice: 603_000, lineTotal: 14_472_000 },
  { orderCode: 'XK5912', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,   unitPrice: 290_000, lineTotal: 1_450_000 },
  { orderCode: 'XK5913', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 10,  unitPrice: 765_000, lineTotal: 7_650_000 },
  { orderCode: 'XK5913', sku: 'VAG_001', productName: 'Dung dịch vệ sinh Vagisil 240ml (Hồng)', unit: 'Chai', quantity: 1, unitPrice: 0, lineTotal: 0, isGift: true },
  { orderCode: 'XK5914', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000 },
  { orderCode: 'XK5915', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 5,   unitPrice: 520_000, lineTotal: 2_600_000 },
  { orderCode: 'PT00647', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000 },
];

async function main(): Promise<void> {
  console.log(`Import 20/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
      `${o.hasVat ? '🧾VAT ' : '     '}` +
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
  console.log(`  Doanh thu (có VAT):       ${headerSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Đã thu:               ${paidSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Còn nợ:               ${debtSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Giá vốn (DB cost_price):  ${costSum.toLocaleString('vi-VN').padStart(13)} đ`);
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
        paymentMethod: o.paymentMethod,
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
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${o.paymentPaid ? '💰' : '🕗'}${o.hasVat ? '🧾' : ' '}  ${lineItems.length} items${giftCount ? ` (${giftCount} gift)` : ''}  sale=${o.saleName || '(trống)'}`
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
