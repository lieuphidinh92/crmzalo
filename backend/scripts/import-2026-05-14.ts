/**
 * One-off import — 6 đơn ngày 14/05/2026
 * (XK5859, XK5860, XK5861, XK5863, XK5865, XK5866 — gap XK5862).
 *
 * Source files (Downloads/):
 *   - Ban_hang 14.5.xlsx                (header — 7 đơn, gap XK5862)
 *   - So_chi_tiet_ban_hang 14.5.xlsx    (11 line items cho 6 đơn)
 *
 * Lưu ý — XK5864 SKIP:
 *   Ban_hang có XK5864 "Chị Hoài - Vũ Thị Hoài" 6.060.000đ (sale Phí Hữu Luận)
 *   nhưng Sổ chi tiết KHÔNG có line item. Tương tự pattern XK5838 (12/5) →
 *   nghi đơn nháp/lỗi. Anh Philip cần check trên MISA. KHÔNG IMPORT.
 *
 * Quy tắc giá vốn (anh Philip chốt 13/05/2026):
 *   - TUYỆT ĐỐI KHÔNG dùng cột "Giá vốn" Excel MISA.
 *   - Dùng `getSkuCost(sku)` từ sku-cost-registry.ts cho mọi line.
 *
 * Status:
 *   Tất cả 6 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-14.ts            # dry-run
 *   npx tsx scripts/import-2026-05-14.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost, checkCostVariance } from './sku-cost-registry';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-14T00:00:00');

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
  excelCostPerUnit: number;
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5859',
    misaCode: 'KH00022',
    customerName: 'Chị Lê Hường',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Số 4/20 Ngô Quyền, Vạn Phúc, Hà Đông, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Hà Đông',
    phone: '0929898585',
    description: 'Bán hàng Chị Lê Hường',
    total: 3_615_000,
  },
  {
    orderCode: 'XK5860',
    misaCode: 'KH00024',
    customerName: 'Chị Anh Ori - HỘ KINH DOANH MỸ PHẨM ÁNH ORI 2',
    saleName: 'Phí Hữu Luận',
    paymentPaid: false,
    address: '256 Trần Hưng Đạo - Xã Lục Nam - Bắc Ninh',
    province: 'Bắc Ninh',
    ward: '',
    phone: '0876936666',
    description: 'Bán hàng Chị Anh Ori - HỘ KINH DOANH MỸ PHẨM ÁNH ORI 2',
    total: 44_010_000,
  },
  {
    orderCode: 'XK5861',
    misaCode: 'KH00025',
    customerName: 'Uyển Nhi',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Số nhà 41, Tổ dân phố 6, Phường Phổ Yên, Thái Nguyên',
    province: 'Thái Nguyên',
    ward: 'Phường Phổ Yên',
    phone: '',
    description: 'Bán hàng Uyển Nhi (CCCD 4601638041)',
    total: 2_955_000,
  },
  {
    orderCode: 'XK5863',
    misaCode: 'KH000025',
    customerName: 'Dược Sĩ Thanh Loan - Đặng Thị Loan',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Tổ, Phường Quyết Thắng, Tỉnh Thái Nguyên',
    province: 'Thái Nguyên',
    ward: 'Phường Quyết Thắng',
    phone: '0911706887',
    description: 'Bán hàng Dược Sĩ Thanh Loan - Đặng Thị Loan',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5865',
    misaCode: 'PML0011',
    customerName: 'PML Nhà thuốc Phúc Hải 1',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Xóm Chợ, Xã Uy Nỗ, Đông Anh, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Đông Anh',
    phone: '0398257267',
    description: 'Bán hàng PML Nhà thuốc Phúc Hải 1',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5866',
    misaCode: 'PML0004',
    customerName: 'Nhà Thuốc Quỳnh Lịch',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'chợ chiều, xã Văn Môn, tỉnh Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Xã Văn Môn',
    phone: '0987378617',
    description: 'Bán hàng Nhà Thuốc Quỳnh Lịch',
    total: 2_600_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5859', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 10, unitPrice: 285_000, lineTotal: 2_850_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5859', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 1,  unitPrice: 765_000, lineTotal: 765_000,    excelCostPerUnit: 0 },
  { orderCode: 'XK5860', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 78, unitPrice: 270_000, lineTotal: 21_060_000, excelCostPerUnit: 224_148 },
  { orderCode: 'XK5860', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 24, unitPrice: 750_000, lineTotal: 18_000_000, excelCostPerUnit: 0 },
  { orderCode: 'XK5860', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', unit: 'Hộp', quantity: 10, unitPrice: 495_000, lineTotal: 4_950_000,  excelCostPerUnit: 435_995 },
  { orderCode: 'XK5861', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5861', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 2,  unitPrice: 765_000, lineTotal: 1_530_000,  excelCostPerUnit: 0 },
  { orderCode: 'XK5863', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal: 3_825_000,  excelCostPerUnit: 0 },
  { orderCode: 'XK5865', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5866', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', unit: 'Hộp', quantity: 5,  unitPrice: 520_000, lineTotal: 2_600_000,  excelCostPerUnit: 435_995 },
];

async function main(): Promise<void> {
  console.log(`Import 14/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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

  console.log('\n─── COST VARIANCE CHECK (Excel vs Registry) ─────────────');
  const variances: { code: string; sku: string; excel: number; registry: number; pct: number }[] = [];
  for (const it of ITEMS) {
    const { ok, registryCost, diffPct } = checkCostVariance(it.sku, it.excelCostPerUnit);
    if (!ok) {
      variances.push({ code: it.orderCode, sku: it.sku, excel: it.excelCostPerUnit, registry: registryCost, pct: diffPct });
    }
  }
  if (variances.length === 0) {
    console.log('✓ Tất cả line cost Excel khớp registry trong ngưỡng ±5%');
  } else {
    console.log(`⚠ ${variances.length} line cost lệch >5% (script sẽ DÙNG REGISTRY, KHÔNG dùng Excel):`);
    for (const v of variances) {
      console.log(
        `   ${v.code}  ${v.sku.padEnd(6)}  Excel=${v.excel.toLocaleString('vi-VN').padStart(10)}  ` +
        `Registry=${v.registry.toLocaleString('vi-VN').padStart(10)}  lệch=${v.pct.toFixed(1)}%`
      );
    }
  }

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  console.log(`\nOrg: ${org.name}`);

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
    const saleMatched = o.saleName ? userByName.has(o.saleName.toLowerCase()) : false;

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ` +
      `${o.paymentPaid ? '💰 đã TT' : '🕗 nợ   '} ` +
      `| sale: ${saleMatched ? '✓' : '→Admin'} ${(o.saleName || '(trống)').padEnd(20)} ` +
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 40)}`
    );
  }

  const headerSum = ORDERS.reduce((s, o) => s + o.total, 0);
  const costSum = ITEMS.reduce((s, i) => s + getSkuCost(i.sku) * i.quantity, 0);
  const debtSum = ORDERS.filter((o) => !o.paymentPaid).reduce((s, o) => s + o.total, 0);
  const paidSum = ORDERS.filter((o) => o.paymentPaid).reduce((s, o) => s + o.total, 0);

  console.log('\nSummary:');
  console.log(`  Orders:   create ${toCreateOrder}, skip(existing) ${toSkipOrder}`);
  console.log(`  Contacts: create ${toCreateContact}, reuse ${toReuseContact}`);
  console.log(`  Sale:     matched ${ORDERS.length - unmatchedSale}/${ORDERS.length} (rest → Admin)`);
  console.log(`  Items:    ${ITEMS.length} rows`);
  console.log(`  Doanh số:                 ${headerSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Đã thu:               ${paidSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Còn nợ:               ${debtSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`  Giá vốn (Registry):       ${costSum.toLocaleString('vi-VN').padStart(13)} đ`);
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
        const unitCostRegistry = getSkuCost(it.sku);
        const lineCost = unitCostRegistry * it.quantity;
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
          costValue: lineCost,
          unitCost: unitCostRegistry,
          lineCost: lineCost,
          profit: profit,
          returnQty: 0,
          returnValue: 0,
        };
      }),
    });

    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${o.paymentPaid ? '💰' : '🕗'}  ${lineItems.length} items  sale=${o.saleName || '(trống)'}`
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
