/**
 * One-off import — 11 đơn liên quan đến hạch toán ngày 25/05/2026.
 *
 * Source:
 *   - Ban_hang 25.5.xlsx                  (header — 11 đơn)
 *   - So_chi_tiet_ban_hang 25.5.xlsx      (8 đơn có line items)
 *   - Screenshot MISA cho XK5946/47/48    (anh Philip gửi bổ sung 25/05)
 *
 * Phân bổ ngày (theo NGÀY CHỨNG TỪ, không phải ngày hạch toán):
 *   - 22/05: XK5930  — Kiều Oanh HKD Ma Thị Kiều Oanh (nhập muộn 25/5)
 *   - 23/05: XK5939  — Anh Khương (nhập muộn 25/5, đơn này 21-24/5
 *            ban đầu skip vì chưa có cả header lẫn line item)
 *   - 25/05: XK5941, XK5942, XK5943, XK5944, XK5945, XK5946,
 *            XK5947, XK5948, XK5949 — 9 đơn mới
 *
 * Quy tắc đã chốt:
 *   1. Cost: products.cost_price (DB sync registry 19/05). KHÔNG dùng
 *      cột "Giá vốn" MISA.
 *   2. DT để tính lãi gộp: dùng số CÓ VAT (Tổng tiền thanh toán).
 *
 * Quirks hôm nay:
 *   - XK5941 (Phạm Trang Nhung): VAT 8% — unitPrice CÓ VAT 285k
 *     (= 263_888.89 × 1.08), header 1.425.000đ. NVBH TRỐNG trong Excel
 *     → fallback admin.
 *   - XK5942 (HKD Thùy Trang): tặng VAG_001 ×1 (isGift=true).
 *   - XK5947 (Chị Nguyễn Ngọt): tặng INC_01TRANG ×1 — Ultra Water
 *     Flosser X3A màu trắng (isGift=true). MH_01 giá lẻ 405k/hộp ×3.
 *   - XK5945 (Chị Đỗ Tuyền, Từ Sơn BN): đơn LỚN 125.43M — MH_02 ×78
 *     giá 485k + MH_03 ×120 giá 730k (giá đại lý cấp 1).
 *
 * NVBH mới: Nguyễn Thành Đạt (XK5942, XK5943) — đã có trong DB.
 *
 * Cost MISA lệch lớn (cảnh báo kế toán):
 *   - MH_03 XK5945: MISA cost=0 cho 120 hộp! Registry 655k×120 = 78.6M.
 *   - BIO_07 XK5944: MISA 532k vs registry 588k (-9.5%).
 *   - MH_01 nhiều đơn: MISA 224k vs registry 240k (-6.6%).
 *
 * Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-05-25.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-05-25.ts --apply  # ghi DB
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
  orderDate: string;          // YYYY-MM-DD theo NGÀY CHỨNG TỪ
  misaCode: string;
  customerName: string;
  saleName: string;           // '' nếu MISA bỏ trống → fallback admin
  paymentPaid: boolean;
  paymentMethod: 'cash' | 'bank_transfer' | 'credit';
  address: string;
  province: string;
  ward: string;
  phone: string;
  description: string;
  total: number;              // = "Tổng tiền thanh toán" (có VAT nếu có)
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
  // ── 22/05 (nhập muộn 25/5) ───────────────────────────────────────
  {
    orderCode: 'XK5930',
    orderDate: '2026-05-22',
    misaCode: 'KH000038',
    customerName: 'Kiều Oanh - HỘ KINH DOANH MA THỊ KIỀU OANH',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Thôn An Thịnh - xã Tân An - Tuyên Quang',
    province: 'Tuyên Quang',
    ward: 'Xã Tân An',
    phone: '0982120696',
    description: 'Bán hàng Kiều Oanh - HKD Ma Thị Kiều Oanh (NEU_01 ×5)',
    total: 1_575_000,
    hasVat: false,
  },

  // ── 23/05 (nhập muộn 25/5) ───────────────────────────────────────
  {
    orderCode: 'XK5939',
    orderDate: '2026-05-23',
    misaCode: 'Anh Khương',
    customerName: 'Anh Khương - Nguyễn Đức Khương',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: true,
    paymentMethod: 'bank_transfer',
    address: 'Số 26 hẻm 6/30/2 Đội Nhân, phường Ngọc Hà, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Ngọc Hà',
    phone: '0797999886',
    description: 'Bán hàng Anh Khương - Nguyễn Đức Khương (MH_01 ×10 + NEU_01 ×30, nhập muộn)',
    total: 11_150_000,
    hasVat: false,
  },

  // ── 25/05 (9 đơn) ────────────────────────────────────────────────
  {
    orderCode: 'XK5941',
    orderDate: '2026-05-25',
    misaCode: 'KH001305',
    customerName: 'Phạm Trang Nhung',
    saleName: '',  // MISA bỏ trống NVBH → fallback admin
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '07 Nguyễn Du, phường Hoa Lư, Ninh Bình',
    province: 'Ninh Bình',
    ward: 'Phường Hoa Lư',
    phone: '',
    description: 'Bán hàng Phạm Trang Nhung (VAT 8%, NVBH trống trên MISA)',
    total: 1_425_000,
    hasVat: true,
  },
  {
    orderCode: 'XK5942',
    orderDate: '2026-05-25',
    misaCode: 'KH02505',
    customerName: 'HỘ KINH DOANH QUẦY THUỐC THÙY TRANG',
    saleName: 'Nguyễn Thành Đạt',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Hưng Đạo Đông, Xã Nam Đông Hưng, Hưng Yên',
    province: 'Hưng Yên',
    ward: 'Xã Nam Đông Hưng',
    phone: '',
    description: 'Bán hàng HKD Quầy thuốc Thùy Trang (tặng kèm VAG_001 ×1)',
    total: 5_200_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5943',
    orderDate: '2026-05-25',
    misaCode: 'KH02506',
    customerName: 'Chị Kiều Trinh - HKD Phạm Thành Long',
    saleName: 'Nguyễn Thành Đạt',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Căn hộ số 20A2-06, CC CT1 A2 Vân Canh, xã Sơn Đồng, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Sơn Đồng',
    phone: '0975964955',
    description: 'Bán hàng Chị Kiều Trinh - HKD Phạm Thành Long',
    total: 2_850_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5944',
    orderDate: '2026-05-25',
    misaCode: 'KH00002',
    customerName: 'Chị Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0971299996',
    description: 'Bán hàng Chị Hiền Nguyễn (BIO_07 ×10 — lãi mỏng 3.13%)',
    total: 6_070_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5945',
    orderDate: '2026-05-25',
    misaCode: 'KH00023',
    customerName: 'Chị Đỗ Tuyền',
    saleName: 'Halo VN',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Từ Sơn, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Phường Từ Sơn',
    phone: '0963548858',
    description: 'Bán hàng Chị Đỗ Tuyền (ĐƠN LỚN — MH_02 ×78 + MH_03 ×120, giá đại lý cấp 1)',
    total: 125_430_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5946',
    orderDate: '2026-05-25',
    misaCode: 'KH02507',
    customerName: 'Chị Lê Thị Ánh Lựu',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Thôn Hà Lộc, xã Tam Tiến, huyện Núi Thành, Quảng Nam',
    province: 'Quảng Nam',
    ward: 'Xã Tam Tiến',
    phone: '0989507452',
    description: 'Bán hàng Chị Lê Thị Ánh Lựu (line items bổ sung từ screenshot)',
    total: 1_450_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5947',
    orderDate: '2026-05-25',
    misaCode: 'KH02508',
    customerName: 'Chị Nguyễn Ngọt',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Xóm 19, Xuân Trung, Xuân Trường, Nam Định (gần cầu ông Hào)',
    province: 'Nam Định',
    ward: 'Xã Xuân Trường',
    phone: '0345673609',
    description: 'Bán hàng Chị Nguyễn Ngọt (giá lẻ MH_01 405k ×3 + tặng INC_01TRANG)',
    total: 1_215_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5948',
    orderDate: '2026-05-25',
    misaCode: 'KH000042',
    customerName: 'Trang Trang - HỘ KINH DOANH TRANG VIOLET SPA',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: '137 Phùng Hưng, Đồng Phú, Đồng Hới, Quảng Bình',
    province: 'Quảng Bình',
    ward: 'Phường Đồng Phú',
    phone: '0914909822',
    description: 'Bán hàng Trang Trang - HKD Trang Violet Spa',
    total: 1_425_000,
    hasVat: false,
  },
  {
    orderCode: 'XK5949',
    orderDate: '2026-05-25',
    misaCode: 'KH00001',
    customerName: 'Di Di (Yến Nhi)',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    paymentMethod: 'credit',
    address: 'Số 11, ngõ 21 Lê Văn Lương, Thanh Xuân, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0907586210',
    description: 'Bán hàng Di Di (Yến Nhi)',
    total: 3_800_000,
    hasVat: false,
  },
];

const ITEMS: LineItem[] = [
  // XK5930 - 22/05
  { orderCode: 'XK5930', sku: 'NEU_01',  productName: 'Neubiotics Her 30 viên',                unit: 'Hộp', quantity: 5,  unitPrice: 315_000, lineTotal: 1_575_000 },

  // XK5939 - 23/05
  { orderCode: 'XK5939', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 10, unitPrice: 275_000, lineTotal:  2_750_000 },
  { orderCode: 'XK5939', sku: 'NEU_01',  productName: 'Neubiotics Her 30 viên',                unit: 'Hộp', quantity: 30, unitPrice: 280_000, lineTotal:  8_400_000 },

  // XK5941 - 25/05 (VAT 8% — unitPrice CÓ VAT)
  { orderCode: 'XK5941', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },

  // XK5942 - 25/05 (tặng VAG_001)
  { orderCode: 'XK5942', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',              unit: 'Hộp', quantity: 10, unitPrice: 520_000, lineTotal:  5_200_000 },
  { orderCode: 'XK5942', sku: 'VAG_001', productName: 'Dung dịch vệ sinh Vagisil 240ml (Hồng)',unit: 'Chai',quantity: 1,  unitPrice: 0,       lineTotal: 0, isGift: true },

  // XK5943 - 25/05
  { orderCode: 'XK5943', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 10, unitPrice: 285_000, lineTotal:  2_850_000 },

  // XK5944 - 25/05
  { orderCode: 'XK5944', sku: 'BIO_07',  productName: 'Bioisland Milk Canxi Bon Care 150v',    unit: 'Hộp', quantity: 10, unitPrice: 607_000, lineTotal:  6_070_000 },

  // XK5945 - 25/05 (đơn lớn)
  { orderCode: 'XK5945', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',              unit: 'Hộp', quantity: 78, unitPrice: 485_000, lineTotal: 37_830_000 },
  { orderCode: 'XK5945', sku: 'MH_03',   productName: 'Manhae Menopause 90 viên',              unit: 'Hộp', quantity: 120,unitPrice: 730_000, lineTotal: 87_600_000 },

  // XK5946 - 25/05 (từ screenshot)
  { orderCode: 'XK5946', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 5,  unitPrice: 290_000, lineTotal:  1_450_000 },

  // XK5947 - 25/05 (từ screenshot, giá lẻ 405k + tặng tăm nước INC_01TRANG)
  { orderCode: 'XK5947', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',                          unit: 'Hộp', quantity: 3, unitPrice: 405_000, lineTotal: 1_215_000 },
  { orderCode: 'XK5947', sku: 'INC_01TRANG', productName: 'Tăm nước Ultra Water Flosser X3A màu trắng',        unit: 'Bộ',  quantity: 1, unitPrice: 0,       lineTotal: 0, isGift: true },

  // XK5948 - 25/05 (từ screenshot)
  { orderCode: 'XK5948', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },

  // XK5949 - 25/05
  { orderCode: 'XK5949', sku: 'MH_01',   productName: 'Manhae Menopause 30 viên',              unit: 'Hộp', quantity: 5,  unitPrice: 265_000, lineTotal:  1_325_000 },
  { orderCode: 'XK5949', sku: 'MH_02',   productName: 'Manhae Menopause 60 viên',              unit: 'Hộp', quantity: 5,  unitPrice: 495_000, lineTotal:  2_475_000 },
];

async function main(): Promise<void> {
  console.log(`Import 25/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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

  let currentDate = '';
  for (const o of ORDERS) {
    if (o.orderDate !== currentDate) {
      currentDate = o.orderDate;
      console.log(`\n  ─── ${currentDate} ───`);
    }
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
        internalNote: `Import từ Misa - ${o.description}`,
        productSkus: Array.from(new Set(lineItems.filter((it) => !it.isGift).map((it) => it.sku))),
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

    const giftCount = lineItems.filter((it) => it.isGift).length;
    console.log(
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(13)} đ  ${o.paymentPaid ? '💰' : '🕗'}${o.hasVat ? '🧾' : ' '}  ${lineItems.length} items${giftCount ? ` (${giftCount} gift)` : ''}  sale=${o.saleName || '(trống→admin)'}`
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
