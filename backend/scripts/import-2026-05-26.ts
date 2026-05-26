/**
 * One-off import — 7 đơn ngày 26/05/2026 (XK5950, 5951, 5952, 5953,
 * 5954, 5955, 5957). Skip XK5956 (LB Global 252.56M) — khách CHƯA
 * CHỐT, anh Philip nhập sau khi ship.
 *
 * Source:
 *   - Ban_hang 26.5.xlsx              (header — 8 đơn, có XK5956)
 *   - So_chi_tiet_ban_hang 26.5.xlsx  (10 line items / 7 đơn)
 *
 * SKIP XK5956 (lý do):
 *   - LB Global 252.56M không VAT (khác 20/5 cùng KH có VAT 8%)
 *   - Sổ chi tiết KHÔNG có line items
 *   - Anh Philip confirm: "khách chưa chốt, mai a mới ship sẽ nhập sau"
 *   - Theo memory feedback_don_thieu_line_items.md: Loại 2 → KHÔNG
 *     import, đợi anh chốt + ship rồi anh sẽ nhập sang ngày khác
 *
 * Quy tắc đã chốt:
 *   1. Cost: products.cost_price (DB sync registry).
 *   2. DT lãi gộp: số CÓ VAT (Tổng tiền thanh toán) — hôm nay không
 *      có đơn nào VAT.
 *
 * Đơn lớn / điểm chú ý:
 *   - XK5953 Chị Thảo Moon (HN, Dương Nội, KH MỚI KH000044): 166.22M
 *     — MH_01 ×78 + MH_02 ×117 + MH_03 ×120 (giá đại lý cấp 1, kiểu
 *     Đỗ Tuyền 25/5). Đại lý cấp 1 mới thứ 2 trong tuần.
 *   - XK5952 Pharmadi: 54.44M (MH_02 ×39 + MH_03 ×48 giá B2B 740k).
 *   - XK5950 Nguyễn Thị Hoàn (HP, KH lẻ): MH_03 ×1 giá 1.26M — giá
 *     lẻ cao kỷ lục, lãi 48% (pattern giống XK5903 Chị Hằng).
 *   - XK5957 PML Vân Anh (Hà Giang) — PML mới (PML0022).
 *
 * Cost MISA lệch (cảnh báo kế toán):
 *   - MH_03: 179 hộp ghi cost=0! Registry 655k × 179 = 117.245M chênh.
 *   - MH_01: ~6.6% lệch (224k vs 240k).
 *
 * Status: tất cả 7 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 * Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-05-26.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-05-26.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-26T00:00:00');

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
  total: number;
  hasVat: boolean;
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
    orderCode: 'XK5950',
    misaCode: 'KH000043',
    customerName: 'Chị Nguyễn Thị Hoàn',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 580 Lê Thánh Tông, Đông Hải, Hải An, Hải Phòng',
    province: 'Hải Phòng',
    ward: 'Phường Đông Hải',
    phone: '0384923773',
    description: 'Bán hàng Chị Nguyễn Thị Hoàn (KH lẻ — MH_03 1 hộp giá 1.260.000đ, lãi 48%)',
    total: 1_260_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5951',
    misaCode: 'KH00028',
    customerName: 'Dược sĩ Nhật Ánh',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Xóm Dầu, xã Đồng Thái, Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Xã Đồng Thái',
    phone: '0854290689',
    description: 'Bán hàng Dược sĩ Nhật Ánh (MH_03 ×10)',
    total: 7_550_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5952',
    misaCode: 'KH00012',
    customerName: 'CÔNG TY CỔ PHẦN PHARMADI',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'NV3-38 TC5, Tân Triều, Huyện Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0973928734',
    description: 'Bán hàng CTCP Pharmadi (MH_02 ×39 + MH_03 ×48, giá B2B)',
    total: 54_435_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5953',
    misaCode: 'KH000044',
    customerName: 'Chị Thảo Moon',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '35LK1, KĐT An Hưng, Phường Dương Nội, TP. Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Dương Nội',
    phone: '0902113027',
    description: 'Bán hàng Chị Thảo Moon (ĐƠN LỚN — đại lý cấp 1: MH_01 ×78 + MH_02 ×117 + MH_03 ×120)',
    total: 166_215_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5954',
    misaCode: 'KH000036',
    customerName: 'Chị Thi Ngô - HỘ KINH DOANH CÔ BA DƯỢC',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '10/3 Đinh Tiên Hoàng, Cẩm Thành, Quảng Ngãi',
    province: 'Quảng Ngãi',
    ward: 'Phường Cẩm Thành',
    phone: '0365004695',
    description: 'Bán hàng Chị Thi Ngô - HKD Cô Ba Dược (MH_01 ×30 giá 275k)',
    total: 8_250_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5955',
    misaCode: 'KH000045',
    customerName: 'Chị Xuyên Ngô',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Thôn Đông Du Núi, Phường Đào Viên, Tỉnh Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Đào Viên',
    phone: '0399152663',
    description: 'Bán hàng Chị Xuyên Ngô',
    total: 1_450_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5957',
    misaCode: 'PML0022',
    customerName: 'PML Nhà thuốc Vân Anh',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'SN 53, tổ 7, thị trấn Đồng Văn, huyện Đồng Văn, tỉnh Hà Giang',
    province: 'Hà Giang',
    ward: 'Thị trấn Đồng Văn',
    phone: '0327987989',
    description: 'Bán hàng PML Nhà thuốc Vân Anh (PML mới Hà Giang, NEU_01 ×5)',
    total: 1_575_000,
    hasVat: false,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5950', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 1,   unitPrice: 1_260_000, lineTotal:  1_260_000 },
  { orderCode: 'XK5951', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 10,  unitPrice:   755_000, lineTotal:  7_550_000 },
  { orderCode: 'XK5952', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 48,  unitPrice:   740_000, lineTotal: 35_520_000 },
  { orderCode: 'XK5952', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 39,  unitPrice:   485_000, lineTotal: 18_915_000 },
  // XK5953 — đại lý cấp 1 Thảo Moon
  { orderCode: 'XK5953', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 78,  unitPrice:   265_000, lineTotal: 20_670_000 },
  { orderCode: 'XK5953', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',          unit: 'Hộp', quantity: 117, unitPrice:   485_000, lineTotal: 56_745_000 },
  { orderCode: 'XK5953', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',          unit: 'Hộp', quantity: 120, unitPrice:   740_000, lineTotal: 88_800_000 },
  { orderCode: 'XK5954', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 30,  unitPrice:   275_000, lineTotal:  8_250_000 },
  { orderCode: 'XK5955', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',          unit: 'Hộp', quantity: 5,   unitPrice:   290_000, lineTotal:  1_450_000 },
  { orderCode: 'XK5957', sku: 'NEU_01', productName: 'Neubiotics Her 30 viên',            unit: 'Hộp', quantity: 5,   unitPrice:   315_000, lineTotal:  1_575_000 },
];

async function main(): Promise<void> {
  console.log(`Import 26/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
  console.log(`✓ Header totals match line items (${ORDERS.length} đơn / ${ITEMS.length} dòng)`);

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
  console.log('');
  console.log(`  ⏸  XK5956 LB Global (252.560.000đ) — SKIP, khách chưa chốt.`);
  console.log(`     Anh Philip sẽ nhập sau khi ship.`);

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
