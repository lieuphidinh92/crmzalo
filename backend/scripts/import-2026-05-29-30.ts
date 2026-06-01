/**
 * One-off import — 5 đơn ngày 29-30/05/2026 (XK5974-XK5978).
 *
 * Source: Google Sheet anh Philip share (không phải file MISA Excel).
 *   https://docs.google.com/spreadsheets/d/1fOnbQA1T1BI6ZV9k64TwsYTIb89dG8u9NYAB-zMMHD4
 *
 * orderCode: tiếp tục dãy XK MISA hiện tại (anh chốt 31/05/2026: Option A).
 *   Nếu sau này MISA tự generate khác → re-map qua script update.
 *
 * Đơn (theo Google Sheet):
 *   29/05 (NVBH Hoàng Bích Huế, 3 đơn COD):
 *     XK5974 - Nguyễn Thu Quỳnh (Thái Nguyên, HKD MST 019182001416)
 *              MH_01 ×5 @285k = 1.425.000đ
 *     XK5975 - Giang Nguyễn (Phú Thọ, HKD MST 025188012254)
 *              MH_01 ×10 @290k + MH_09 (Collagen) ×5 @400k = 4.900.000đ
 *     XK5976 - Phạm Thu Hằng (Hana Pharmacy, HN, HKD)
 *              NEU_04 ×5 @315k = 1.575.000đ
 *
 *   30/05 (NVBH Lê Huỳnh Đức, 2 đơn LỚN):
 *     XK5977 - Di Di (Yến Nhi) (KH00001, KH cũ)
 *              MH_03 ×72 @740k = 53.280.000đ
 *              Đã thanh toán (chuyển khoản trước)
 *     XK5978 - Chị Flora Thanh Huế (KH00084, KH cũ TOP)
 *              MH_02 ×390 @485k = 189.150.000đ
 *              Công nợ 10 ngày
 *
 * Tổng: 5 đơn / 250.330.000đ DT
 * GV registry: 223.800.000đ → Lãi gộp 26.530.000đ (10.60%)
 *
 * Payment status:
 *   - COD (Cash On Delivery): paymentMethod='cash', paymentPaid=false
 *     (đợi shipper trả tiền sau khi giao thành công)
 *   - Đã TT: paymentMethod='bank_transfer', paymentPaid=true
 *   - Công nợ 10 ngày: paymentMethod='credit', paymentPaid=false
 *
 * SKU mapping (tên rút gọn trong Google Sheet → SKU registry):
 *   - "Nội tiết 30 viên" → MH_01
 *   - "Nội tiết 60 viên" → MH_02
 *   - "Nội tiết 90 viên" → MH_03
 *   - "Collagen"         → MH_09 (Manhae Collagen Expert 30v)
 *   - "NEUKID"           → NEU_04 (Neubria Neu Kid 30v)
 *
 * Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-05-29-30.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-05-29-30.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

interface OrderHeader {
  orderCode: string;
  orderDate: string;
  misaCode: string;   // có thể rỗng → match by fullName
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
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

const ORDERS: OrderHeader[] = [
  // ── 29/05 — 3 đơn COD (NVBH Hoàng Bích Huế) ──────────────────────
  {
    orderCode: 'XK5974',
    orderDate: '2026-05-29',
    misaCode: '',  // KH mới, không có mã MISA
    customerName: 'Nguyễn Thu Quỳnh',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'cash',  // COD
    address: 'Xóm Cả, xã Vạn Phú, tỉnh Thái Nguyên',
    province: 'Thái Nguyên',
    ward: 'Xã Vạn Phú',
    phone: '0973270949',
    description: 'Bán hàng Nguyễn Thu Quỳnh (HKD, MST 019182001416, COD - GS source)',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5975',
    orderDate: '2026-05-29',
    misaCode: '',
    customerName: 'Giang Nguyễn',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'cash',  // COD
    address: 'Giang khoa dược trung tâm y tế huyện Thanh Ba xã Thanh Ba tỉnh Phú Thọ',
    province: 'Phú Thọ',
    ward: 'Xã Thanh Ba',
    phone: '0982949635',
    description: 'Bán hàng Giang Nguyễn (HKD, MST 025188012254, COD, MH_01 ×10 + MH_09 ×5 - GS source)',
    total: 4_900_000,
  },
  {
    orderCode: 'XK5976',
    orderDate: '2026-05-29',
    misaCode: '',
    customerName: 'Phạm Thu Hằng',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'cash',  // COD
    address: 'Nhà thuốc Hana Pharmacy, Tòa s103 Vinhomes Ocean Park, xã Gia Lâm, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Gia Lâm',
    phone: '0374040599',
    description: 'Bán hàng Phạm Thu Hằng - Hana Pharmacy (HKD, COD, NEU_04 ×5 - GS source)',
    total: 1_575_000,
  },

  // ── 30/05 — 2 đơn LỚN (NVBH Lê Huỳnh Đức) ───────────────────────
  {
    orderCode: 'XK5977',
    orderDate: '2026-05-30',
    misaCode: 'KH00001',  // Di Di đã có sẵn trong DB
    customerName: 'Di Di (Yến Nhi)',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',  // Đã thanh toán chuyển khoản
    address: 'Số 11 ngõ 21 Lê Văn Lương, Thanh Xuân, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0565060736',
    description: 'Bán hàng Di Di (Yến Nhi) - đơn lớn MH_03 ×72, đã chuyển khoản trước - GS source',
    total: 53_280_000,
  },
  {
    orderCode: 'XK5978',
    orderDate: '2026-05-30',
    misaCode: 'KH00084',  // Flora Thanh Huế đã có sẵn
    customerName: 'Chị Flora Thanh Huế',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '11/35/97 Văn Cao, Liễu Giai, Ba Đình, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Ba Đình',
    phone: '0966886241',
    description: 'Bán hàng Chị Flora Thanh Huế - ĐƠN KHỦNG MH_02 ×390 hộp, công nợ 10 ngày (hạn 09/06/2026) - GS source',
    total: 189_150_000,
  },
];

const ITEMS: LineItem[] = [
  // XK5974
  { orderCode: 'XK5974', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal: 1_425_000 },

  // XK5975 (2 SKU)
  { orderCode: 'XK5975', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',           unit: 'Hộp', quantity: 10, unitPrice: 290_000, lineTotal: 2_900_000 },
  { orderCode: 'XK5975', sku: 'MH_09',  productName: 'Manhae Collagen Expert 30 viên',     unit: 'Hộp', quantity: 5,  unitPrice: 400_000, lineTotal: 2_000_000 },

  // XK5976
  { orderCode: 'XK5976', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên',            unit: 'Hộp', quantity: 5,  unitPrice: 315_000, lineTotal: 1_575_000 },

  // XK5977 - Di Di
  { orderCode: 'XK5977', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',           unit: 'Hộp', quantity: 72, unitPrice: 740_000, lineTotal: 53_280_000 },

  // XK5978 - Flora Thanh Huế
  { orderCode: 'XK5978', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',           unit: 'Hộp', quantity: 390, unitPrice: 485_000, lineTotal: 189_150_000 },
];

async function main(): Promise<void> {
  console.log(`Import 29-30/05/2026 (Google Sheet) — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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

  const misaCodes = ORDERS.map((o) => o.misaCode).filter((c) => c !== '');
  const fullNames = ORDERS.map((o) => o.customerName);
  const existingContacts = await prisma.contact.findMany({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: { in: misaCodes } },
        { fullName: { in: fullNames } },
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

  let currentDate = '';
  for (const o of ORDERS) {
    if (o.orderDate !== currentDate) {
      currentDate = o.orderDate;
      console.log(`\n  ─── ${currentDate} ───`);
    }
    const exists = existingOrderCodes.has(o.orderCode);
    const contactId = (o.misaCode && contactByMisa.get(o.misaCode)) || contactByName.get(o.customerName);
    const reuseContact = !!contactId;
    const saleMatched = o.saleName ? userByName.has(o.saleName.toLowerCase()) : false;

    if (exists) toSkipOrder++; else toCreateOrder++;
    if (reuseContact) toReuseContact++; else toCreateContact++;
    if (!saleMatched) unmatchedSale++;

    const tag = o.paymentPaid ? '💰 đã TT' : (o.paymentMethod === 'cash' ? '📦 COD  ' : '🕗 nợ   ');
    console.log(
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ` +
      `${tag}  | sale: ${saleMatched ? '✓' : '→Adm'} ${o.saleName.padEnd(18)} ` +
      `| ${reuseContact ? 'reuse ' : 'CREATE'} ${o.customerName.slice(0, 35)}`
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
  console.log(`  Items:    ${ITEMS.length} rows`);
  console.log(`  Doanh thu:                ${headerSum.toLocaleString('vi-VN').padStart(13)} đ`);
  console.log(`    - Đã thu:               ${paidSum.toLocaleString('vi-VN').padStart(13)} đ  (1 đơn Di Di)`);
  console.log(`    - Còn nợ/COD:           ${debtSum.toLocaleString('vi-VN').padStart(13)} đ  (4 đơn)`);
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

    let contactId = (o.misaCode && contactByMisa.get(o.misaCode)) || contactByName.get(o.customerName);
    if (!contactId) {
      const fullAddress = [o.address, o.ward].filter(Boolean).join(', ') || null;
      const c = await prisma.contact.create({
        data: {
          orgId: org.id,
          misaCustomerCode: o.misaCode || null,
          fullName: o.customerName,
          phone: o.phone || null,
          address: fullAddress,
          province: o.province || null,
          source: 'google_sheet',
          assignedUserId: saleId,
        },
        select: { id: true },
      });
      contactId = c.id;
      if (o.misaCode) contactByMisa.set(o.misaCode, contactId);
      contactByName.set(o.customerName, contactId);
      console.log(`  ➕ contact: ${o.customerName} (id=${contactId})`);
    }
    touchedContacts.add(contactId);

    const lineItems = itemsByCode.get(o.orderCode) ?? [];
    const paidAmount = o.paymentPaid ? o.total : 0;
    const debtAmount = o.paymentPaid ? 0 : o.total;
    const orderDate = new Date(`${o.orderDate}T00:00:00`);

    const order = await prisma.order.create({
      data: {
        orgId: org.id,
        contactId,
        createdByUserId: adminUser.id,
        assignedSaleId: saleId,
        orderCode: o.orderCode,
        orderDate,
        status: 'completed',
        paymentMethod: o.paymentMethod,
        totalAmount: o.total,
        subtotalAmount: o.total,
        discountAmount: 0,
        totalAmountValue: o.total,
        paidAmount,
        debtAmountValue: debtAmount,
        internalNote: `Import từ Google Sheet - ${o.description}`,
        productSkus: Array.from(new Set(lineItems.map((it) => it.sku))),
        confirmedAt: orderDate,
        packedAt: orderDate,
        shippedAt: orderDate,
        completedAt: orderDate,
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

    const tag = o.paymentPaid ? '💰' : (o.paymentMethod === 'cash' ? '📦' : '🕗');
    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${tag}  ${lineItems.length} items  sale=${o.saleName}`
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
