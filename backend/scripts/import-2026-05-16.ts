/**
 * One-off import — 4 đơn ngày 16/05/2026 (XK5884 → XK5887).
 *
 * Source files (Downloads/):
 *   - Ban_hang 16.5.xlsx                (header — 4 đơn)
 *   - So_chi_tiet_ban_hang 16.5.xlsx    (5 line items)
 *
 * Lần đầu sau 4 ngày KHÔNG có đơn nháp/thiếu line item → file sạch.
 *
 * Quy tắc giá vốn (anh Philip chốt 13/05/2026):
 *   - TUYỆT ĐỐI KHÔNG dùng cột "Giá vốn" Excel MISA.
 *   - Dùng `getSkuCost(sku)` từ sku-cost-registry.ts cho mọi line.
 *
 * Status:
 *   Tất cả 4 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-16.ts            # dry-run
 *   npx tsx scripts/import-2026-05-16.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost, checkCostVariance } from './sku-cost-registry';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-16T00:00:00');

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
    orderCode: 'XK5884',
    misaCode: 'KH00083',
    customerName: 'Dược Sĩ Lâm',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Lô 6D1 đường 25 tổ 21 khu TĐC Kì Bá, P.Kì Bá, Tp Thái Bình',
    province: 'Thái Bình',
    ward: 'Phường Kì Bá',
    phone: '0914295536',
    description: 'Bán hàng Dược Sĩ Lâm',
    total: 203_000,
  },
  {
    orderCode: 'XK5885',
    misaCode: 'KH00023',
    customerName: 'Chị Đỗ Tuyền',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Từ Sơn, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Từ Sơn',
    phone: '0963548858',
    description: 'Bán hàng Chị Đỗ Tuyền',
    total: 87_600_000,
  },
  {
    orderCode: 'XK5886',
    misaCode: 'KH000034',
    customerName: 'Chị Cúc Nguyễn',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Thôn Phú Hải, xã Lộc Vĩnh Phú, Lộc Huế',
    province: 'Huế',
    ward: '',
    phone: '0702506167',
    description: 'Bán hàng Chị Cúc Nguyễn',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5887',
    misaCode: 'KH000035',
    customerName: 'Chị Thanh Loan',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Yên Xá, Tân Triều, Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0988699922',
    description: 'Bán hàng Chị Thanh Loan',
    total: 1_425_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5884', sku: 'PBB_01',  productName: "Xịt nước muối biển P'tit BOBO ISOTONIC 100ml", unit: 'Chai', quantity: 1, unitPrice: 108_000, lineTotal: 108_000, excelCostPerUnit: 94_000 },
  { orderCode: 'XK5884', sku: 'PBB_001', productName: "Xịt nước muối biển P'tit BOBO ISOTONIC 50ml",  unit: 'Chai', quantity: 1, unitPrice: 95_000,  lineTotal: 95_000,  excelCostPerUnit: 81_000 },
  { orderCode: 'XK5885', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',                      unit: 'Hộp', quantity: 120, unitPrice: 730_000, lineTotal: 87_600_000, excelCostPerUnit: 0 },
  { orderCode: 'XK5886', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',                      unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5887', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',                      unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
];

async function main(): Promise<void> {
  console.log(`Import 16/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
        `   ${v.code}  ${v.sku.padEnd(8)}  Excel=${v.excel.toLocaleString('vi-VN').padStart(10)}  ` +
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
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 35)}`
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
