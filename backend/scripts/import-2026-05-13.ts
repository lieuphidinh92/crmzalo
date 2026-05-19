/**
 * One-off import — 9 đơn ngày 13/05/2026
 * (XK5850 → XK5858 liên tục).
 *
 * Source files (Downloads/):
 *   - Ban_hang 13.5.xlsx                (header — 43-col new MISA format)
 *   - So_chi_tiet_ban_hang 13.5.xlsx    (14 line items)
 *
 * Quy tắc giá vốn (anh Philip chốt 13/05/2026):
 *   - TUYỆT ĐỐI KHÔNG dùng cột "Giá vốn" của Excel MISA. Mọi line dùng
 *     `getSkuCost(sku)` từ sku-cost-registry.ts.
 *   - Cảnh báo nếu Excel lệch >5% chỉ để hiển thị, KHÔNG đổi logic ghi DB.
 *
 * Quyết định của anh Philip (13/05/2026):
 *   ① MH_03 (4 lines, 63 hộp): Excel cost 0 → áp registry 655k/hộp. ✅
 *   ② MH_01 (5 đơn nhỏ): Excel 224k → vẫn áp registry 240k. ✅
 *   ③ XK5858 có VAT 8%: lưu gross 1.425.000đ (= net 1.319.444 + VAT 105.556).
 *     Doanh số CRM cộng VAT, khớp công nợ đại lý. unitPrice MH_01 = 285k. ✅
 *
 * Status:
 *   Tất cả 9 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit (đại lý nợ).
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-13.ts            # dry-run
 *   npx tsx scripts/import-2026-05-13.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost, checkCostVariance } from './sku-cost-registry';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-13T00:00:00');

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
  excelCostPerUnit: number;     // cost Excel/đơn vị (để variance check; KHÔNG ghi DB)
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5850',
    misaCode: 'HP Cosmetic',
    customerName: 'CÔNG TY TNHH HP COSMETIC',
    saleName: 'Nguyễn Thành Đạt',
    paymentPaid: false,
    address: 'TT02, HD Mon, Hàm Nghi, Mỹ Đình 2, Nam Từ Liêm, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Từ Liêm',
    phone: '0962958952',
    description: 'Bán hàng CÔNG TY TNHH HP COSMETIC',
    total: 94_020_000,
  },
  {
    orderCode: 'XK5851',
    misaCode: 'KH00072',
    customerName: 'Nấm Thương',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Đội 4 át Thuế An Khánh Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã An Khánh',
    phone: '0964539318',
    description: 'Bán hàng Nấm Thương',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5852',
    misaCode: 'KH00012',
    customerName: 'CÔNG TY CỔ PHẦN PHARMADI',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'NV3-38 TC5, Tân Triều, Huyện Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0973928734',
    description: 'Bán hàng CÔNG TY CỔ PHẦN PHARMADI',
    total: 63_180_000,
  },
  {
    orderCode: 'XK5853',
    misaCode: 'KH00023',
    customerName: 'Chị Đỗ Tuyền',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Từ Sơn, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Từ Sơn',
    phone: '0963548858',
    description: 'Bán hàng Chị Đỗ Tuyền',
    total: 140_256_000,
  },
  {
    orderCode: 'XK5854',
    misaCode: 'KH00028',
    customerName: 'Dược sĩ Nhật Ánh',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Xóm Dầu, xã Đồng Thái, Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Xã Đồng Thái',
    phone: '0854290689',
    description: 'Bán hàng Dược sĩ Nhật Ánh',
    total: 8_250_000,
  },
  {
    orderCode: 'XK5855',
    misaCode: 'PML0007',
    customerName: 'PML Quầy Thuốc Tâm An',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Hàm Hy, Lạc Phượng, Tứ Kỳ, Hải Phòng',
    province: 'Hải Phòng',
    ward: 'Xã Lạc Phượng',
    phone: '0964186376',
    description: 'Bán hàng PML Quầy Thuốc Tâm An',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5856',
    misaCode: 'PML0009',
    customerName: 'PML Nhà thuốc Minh Hồng',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Do Nha, Xã Phương Liễu, thị trấn Quế Võ, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Phương Liễu',
    phone: '0944056756',
    description: 'Bán hàng PML Nhà thuốc Minh Hồng',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5857',
    misaCode: 'PML0010',
    customerName: 'PML Quầy Thuốc Hoa Minh',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Kim Chi, Đô Thành, Yên Thành, Nghệ An',
    province: 'Nghệ An',
    ward: 'Xã Yên Thành',
    phone: '0987835315',
    description: 'Bán hàng PML Quầy Thuốc Hoa Minh',
    total: 5_250_000,
  },
  {
    orderCode: 'XK5858',
    misaCode: 'KH001305',
    customerName: 'Phạm Trang Nhung',
    saleName: '',
    paymentPaid: false,
    address: '07 Nguyễn Du, phường Hoa Lư, Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Phường Hoa Lư',
    phone: '',
    description: 'Bán hàng Phạm Trang Nhung (đã include VAT 8% — gross 1.425.000đ = net 1.319.444 + VAT 105.556)',
    total: 1_425_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5850', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 78,  unitPrice: 265_000,    lineTotal: 20_670_000, excelCostPerUnit: 239_996 },
  { orderCode: 'XK5850', sku: 'MH_02', productName: 'Manhae Menopause 60 viên',  unit: 'Hộp', quantity: 78,  unitPrice: 485_000,    lineTotal: 37_830_000, excelCostPerUnit: 435_995 },
  { orderCode: 'XK5850', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',  unit: 'Hộp', quantity: 48,  unitPrice: 740_000,    lineTotal: 35_520_000, excelCostPerUnit: 0 },
  { orderCode: 'XK5851', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 765_000,    lineTotal: 3_825_000,  excelCostPerUnit: 0 },
  { orderCode: 'XK5852', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 234, unitPrice: 270_000,    lineTotal: 63_180_000, excelCostPerUnit: 239_996 },
  { orderCode: 'XK5853', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 312, unitPrice: 263_000,    lineTotal: 82_056_000, excelCostPerUnit: 239_996 },
  { orderCode: 'XK5853', sku: 'MH_02', productName: 'Manhae Menopause 60 viên',  unit: 'Hộp', quantity: 120, unitPrice: 485_000,    lineTotal: 58_200_000, excelCostPerUnit: 435_995 },
  { orderCode: 'XK5854', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 30,  unitPrice: 275_000,    lineTotal: 8_250_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5855', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 285_000,    lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5856', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 285_000,    lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5857', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 285_000,    lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5857', sku: 'MH_03', productName: 'Manhae Menopause 90 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 765_000,    lineTotal: 3_825_000,  excelCostPerUnit: 0 },
  { orderCode: 'XK5858', sku: 'MH_01', productName: 'Manhae Menopause 30 viên',  unit: 'Hộp', quantity: 5,   unitPrice: 285_000,    lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
];

async function main(): Promise<void> {
  console.log(`Import 13/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(70));

  // Group lines by order
  const itemsByCode = new Map<string, LineItem[]>();
  for (const it of ITEMS) {
    const arr = itemsByCode.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByCode.set(it.orderCode, arr);
  }

  // Verify header == sum(line_total)
  for (const o of ORDERS) {
    const items = itemsByCode.get(o.orderCode) ?? [];
    const sum = items.reduce((s, i) => s + i.lineTotal, 0);
    if (sum !== o.total) {
      throw new Error(`Tổng line items của ${o.orderCode} = ${sum.toLocaleString('vi-VN')} ≠ header ${o.total.toLocaleString('vi-VN')}`);
    }
  }
  console.log('✓ Header totals match line items');

  // ── Cost variance check (chỉ dry-run cảnh báo) ──────────────────────
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
      `| contact: ${reuseContact ? 'reuse' : 'CREATE'} ${o.customerName.slice(0, 35)}`
    );
  }

  // Tính giá vốn theo registry (= source of truth)
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
