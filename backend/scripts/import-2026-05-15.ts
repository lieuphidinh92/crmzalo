/**
 * One-off import — 14 đơn ngày 15/05/2026
 * (XK5867, 5868, 5872, 5873, 5874, 5875, 5876, 5877, 5878, 5879, 5880,
 *  5881, 5882, 5883 — gap XK5869/5870/5871).
 *
 * Source files (Downloads/):
 *   - Ban_hang 15.5.xlsx                (header — 15 đơn)
 *   - So_chi_tiet_ban_hang.15.5.xlsx    (22 line items cho 14 đơn)
 *
 * Lưu ý — XK5869 (anh Philip yêu cầu xoá trên MISA 15/05/2026):
 *   Ban_hang có XK5869 "Chị Ds Hằng - HKD HOÀNG VĂN VINH" 5.575.000đ
 *   nhưng Sổ chi tiết KHÔNG có line item. Anh Philip confirm xoá trên MISA
 *   (trùng khách với XK5875 đã giữ lại). KHÔNG IMPORT vào CRM.
 *
 * Lưu ý — XK5868 có quà tặng:
 *   XK5868 Chị Lê Vân Anh ngoài MH_09 ×3 còn tặng kèm INC_01TRANG ×1
 *   (Tăm nước Ultra Flosser trắng) với unit_price=0, line_total=0.
 *   Cost gift = 236.414đ (Registry) → ghi nhận thành OrderItem (gift line)
 *   để Dashboard P&L tính đúng profit (lỗ giá vốn quà tặng).
 *
 * Quy tắc giá vốn (anh Philip chốt 13/05/2026):
 *   - TUYỆT ĐỐI KHÔNG dùng cột "Giá vốn" Excel MISA.
 *   - Dùng `getSkuCost(sku)` từ sku-cost-registry.ts cho mọi line.
 *
 * Cost variance đáng chú ý (lần đầu thấy):
 *   - MH_07 XK5867 24 hộp: Excel 253k vs Registry 286k (-11.5%).
 *     Có thể FIFO lô cũ rẻ hơn. Script vẫn dùng Registry như chỉ thị.
 *
 * Status:
 *   Tất cả 13 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 *
 * Idempotent: re-chạy là no-op.
 *
 * Usage:
 *   npx tsx scripts/import-2026-05-15.ts            # dry-run
 *   npx tsx scripts/import-2026-05-15.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import { getSkuCost, checkCostVariance } from './sku-cost-registry';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const ORDER_DATE = new Date('2026-05-15T00:00:00');

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
  isGift?: boolean;
}

const ORDERS: OrderHeader[] = [
  {
    orderCode: 'XK5867',
    misaCode: 'KH00012',
    customerName: 'CÔNG TY CỔ PHẦN PHARMADI',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'NV3-38 TC5, Tân Triều, Huyện Thanh Trì, Hà Nội',
    province: 'Hà Nội',
    ward: 'Xã Thanh Trì',
    phone: '0973928734',
    description: 'Bán hàng CÔNG TY CỔ PHẦN PHARMADI',
    total: 71_340_000,
  },
  {
    orderCode: 'XK5868',
    misaCode: 'KH000027',
    customerName: 'Chị Lê Vân Anh',
    saleName: 'Nguyễn Thành Đạt',
    paymentPaid: false,
    address: 'Bệnh viện thú y Hellopet, Phố Thanh Hoài, Thanh Khương, Thuận Thành, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: '',
    phone: '0867766887',
    description: 'Bán hàng Chị Lê Vân Anh (tặng kèm INC_01TRANG ×1)',
    total: 1_782_000,
  },
  {
    orderCode: 'XK5872',
    misaCode: 'KH00001',
    customerName: 'Di Di (Yến Nhi)',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Số 11, ngõ 21 Lê Văn Lương, Thanh Xuân, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0907586210',
    description: 'Bán hàng Di Di (Yến Nhi)',
    total: 54_605_000,
  },
  {
    orderCode: 'XK5873',
    misaCode: 'KH000029',
    customerName: 'Lê Thị Sen - HKD Nhà thuốc Anh Tuấn',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Thôn Tiên Phong, xã Phong Hải, Lào Cai',
    province: 'Lào Cai',
    ward: 'Xã Phong Hải',
    phone: '0966303788',
    description: 'Bán hàng Lê Thị Sen - HKD Nhà thuốc Anh Tuấn',
    total: 2_225_000,
  },
  {
    orderCode: 'XK5874',
    misaCode: 'KH000030',
    customerName: 'Chị Hoa - HKD QUẦY THUỐC SƠN HOA',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Quầy thuốc Sơn Hoa, Đại Lâm, Tam Đa, Yên Phong, Bắc Ninh',
    province: 'Bắc Ninh',
    ward: 'Xã Yên Phong',
    phone: '0393715110',
    description: 'Bán hàng Chị Hoa - HKD QUẦY THUỐC SƠN HOA',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5875',
    misaCode: 'KH000028',
    customerName: 'Chị Ds Hằng - HỘ KINH DOANH HOÀNG VĂN VINH',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'Xóm Tân Mỹ, Xã Tam Hợp, Nghệ An',
    province: 'Nghệ An',
    ward: 'Xã Tam Hợp',
    phone: '0989200751',
    description: 'Bán hàng Chị Ds Hằng - HỘ KINH DOANH HOÀNG VĂN VINH',
    total: 3_825_000,
  },
  {
    orderCode: 'XK5876',
    misaCode: 'KH000031',
    customerName: 'Chị Nhi',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: '33 Nguyễn Hữu Thọ, phường Tân Hưng, Q7, HCM',
    province: 'Hồ Chí Minh',
    ward: 'Phường Tân Hưng',
    phone: '0904171247',
    description: 'Bán hàng Chị Nhi',
    total: 1_710_000,
  },
  {
    orderCode: 'XK5877',
    misaCode: 'KH14825',
    customerName: 'Hải Đăng - CÔNG TY TNHH DƯỢC PHẨM HẢI ĐĂNG PHARMACY',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: '745/109 Quang Trung, Phường An Hội Tây, Hồ Chí Minh',
    province: 'Hồ Chí Minh',
    ward: 'Phường An Hội Tây',
    phone: '0983971599',
    description: 'Bán hàng Hải Đăng - CÔNG TY TNHH DƯỢC PHẨM HẢI ĐĂNG PHARMACY',
    total: 2_850_000,
  },
  {
    orderCode: 'XK5878',
    misaCode: 'KH00034',
    customerName: 'Võ Thị Nam - CÔNG TY TNHH XUẤT NHẬP KHẨU CUỘC SỐNG MỚI',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Chung cư Bông Sao Lô A1 hẻm 258 đường Bông Sao, P5, Quận 8, HCM',
    province: 'Hồ Chí Minh',
    ward: '',
    phone: '0919023920',
    description: 'Bán hàng Võ Thị Nam - CÔNG TY TNHH XUẤT NHẬP KHẨU CUỘC SỐNG MỚI',
    total: 39_390_000,
  },
  {
    orderCode: 'XK5879',
    misaCode: 'KH00991',
    customerName: 'Chị Hoàng Hương - HKD THUỐC TỐT PHARMA',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: 'Thôn Tân Trung, Xã Tân Hội, Tỉnh Lâm Đồng',
    province: 'Lâm Đồng',
    ward: 'Xã Tân Hội',
    phone: '0983507212',
    description: 'Bán hàng Chị Hoàng Hương - HKD THUỐC TỐT PHARMA',
    total: 2_850_000,
  },
  {
    orderCode: 'XK5880',
    misaCode: 'ĐT00001',
    customerName: 'ĐT HỘ KINH DOANH THOMSONCARE',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'No02 LK30 khu đất dịch vụ LK16 LK17 LK18A LK18B đường Phan Kế Toại, P. Dương Nội, TP. Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Dương Nội',
    phone: '0823113515',
    description: 'Bán hàng ĐT HỘ KINH DOANH THOMSONCARE',
    total: 1_425_000,
  },
  {
    orderCode: 'XK5881',
    misaCode: 'KH00002',
    customerName: 'Chị Hiền Nguyễn',
    saleName: 'Lê Huỳnh Đức',
    paymentPaid: false,
    address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',
    province: 'Hà Nội',
    ward: 'Phường Thanh Xuân',
    phone: '0971299996',
    description: 'Bán hàng Chị Hiền Nguyễn',
    total: 14_472_000,
  },
  {
    orderCode: 'XK5882',
    misaCode: 'ĐT00002',
    customerName: 'ĐT Quầy thuốc Hà Anh',
    saleName: 'Halo VN',
    paymentPaid: false,
    address: 'Quầy thuốc Hà Anh, Dưỡng Mông, An Thành, TP Hải Phòng',
    province: 'Hải Phòng',
    ward: 'Xã An Thành',
    phone: '0357709829',
    description: 'Bán hàng ĐT Quầy thuốc Hà Anh',
    total: 2_375_000,
  },
  {
    orderCode: 'XK5883',
    misaCode: 'KH000033',
    customerName: 'Chị Thanh Nguyen - Công ty TNHH Thương Mại Quốc Tế JK Beauty',
    saleName: 'Hoàng Bích Huế',
    paymentPaid: false,
    address: 'A1 Vinhomes Gardenia Hàm Nghi, Từ Liêm, Hà Nội',
    province: 'Hà Nội',
    ward: '',
    phone: '0973328946',
    description: 'Bán hàng Chị Thanh Nguyen - Công ty TNHH Thương Mại Quốc Tế JK Beauty',
    total: 29_995_000,
  },
];

const ITEMS: LineItem[] = [
  { orderCode: 'XK5867', sku: 'MH_07',       productName: 'Manhae Intima Equilibre 30 viên', unit: 'Hộp', quantity: 24,  unitPrice: 340_000, lineTotal: 8_160_000,  excelCostPerUnit: 253_248 },
  { orderCode: 'XK5867', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 234, unitPrice: 270_000, lineTotal: 63_180_000, excelCostPerUnit: 224_148 },
  { orderCode: 'XK5868', sku: 'MH_09',       productName: 'Manhae Collagen Expert 30 Viên',  unit: 'Hộp', quantity: 3,   unitPrice: 594_000, lineTotal: 1_782_000,  excelCostPerUnit: 330_000 },
  { orderCode: 'XK5868', sku: 'INC_01TRANG', productName: 'Tăm nước Ultra Water Flosser X3A màu trắng', unit: 'Bộ', quantity: 1, unitPrice: 0, lineTotal: 0, excelCostPerUnit: 236_414, isGift: true },
  { orderCode: 'XK5872', sku: 'MH_03',       productName: 'Manhae Menopause 90 viên',        unit: 'Hộp', quantity: 72,  unitPrice: 740_000, lineTotal: 53_280_000, excelCostPerUnit: 0 },
  { orderCode: 'XK5872', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 5,   unitPrice: 265_000, lineTotal: 1_325_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5873', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5873', sku: 'MH_09',       productName: 'Manhae Collagen Expert 30 Viên',  unit: 'Hộp', quantity: 2,   unitPrice: 400_000, lineTotal: 800_000,    excelCostPerUnit: 330_000 },
  { orderCode: 'XK5874', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5875', sku: 'MH_03',       productName: 'Manhae Menopause 90 viên',        unit: 'Hộp', quantity: 5,   unitPrice: 765_000, lineTotal: 3_825_000,  excelCostPerUnit: 0 },
  { orderCode: 'XK5876', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 6,   unitPrice: 285_000, lineTotal: 1_710_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5877', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 10,  unitPrice: 285_000, lineTotal: 2_850_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5878', sku: 'MH_02',       productName: 'Manhae Menopause 60 viên',        unit: 'Hộp', quantity: 78,  unitPrice: 505_000, lineTotal: 39_390_000, excelCostPerUnit: 435_995 },
  { orderCode: 'XK5879', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 10,  unitPrice: 285_000, lineTotal: 2_850_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5880', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 5,   unitPrice: 285_000, lineTotal: 1_425_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5881', sku: 'BIO_07',      productName: 'Bioisland Milk Canxi Bon Care 150v', unit: 'Hộp', quantity: 24, unitPrice: 603_000, lineTotal: 14_472_000, excelCostPerUnit: 532_000 },
  { orderCode: 'XK5882', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 2,   unitPrice: 285_000, lineTotal: 570_000,    excelCostPerUnit: 224_148 },
  { orderCode: 'XK5882', sku: 'MH_02',       productName: 'Manhae Menopause 60 viên',        unit: 'Hộp', quantity: 2,   unitPrice: 520_000, lineTotal: 1_040_000,  excelCostPerUnit: 435_995 },
  { orderCode: 'XK5882', sku: 'MH_03',       productName: 'Manhae Menopause 90 viên',        unit: 'Hộp', quantity: 1,   unitPrice: 765_000, lineTotal: 765_000,    excelCostPerUnit: 0 },
  { orderCode: 'XK5883', sku: 'MH_01',       productName: 'Manhae Menopause 30 viên',        unit: 'Hộp', quantity: 10,  unitPrice: 275_000, lineTotal: 2_750_000,  excelCostPerUnit: 224_148 },
  { orderCode: 'XK5883', sku: 'MH_02',       productName: 'Manhae Menopause 60 viên',        unit: 'Hộp', quantity: 39,  unitPrice: 505_000, lineTotal: 19_695_000, excelCostPerUnit: 435_995 },
  { orderCode: 'XK5883', sku: 'MH_03',       productName: 'Manhae Menopause 90 viên',        unit: 'Hộp', quantity: 10,  unitPrice: 755_000, lineTotal: 7_550_000,  excelCostPerUnit: 0 },
];

async function main(): Promise<void> {
  console.log(`Import 15/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
        `   ${v.code}  ${v.sku.padEnd(12)}  Excel=${v.excel.toLocaleString('vi-VN').padStart(10)}  ` +
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
  const costSum = ITEMS.reduce((s, i) => s + getSkuCost(i.sku) * i.quantity, 0);
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
