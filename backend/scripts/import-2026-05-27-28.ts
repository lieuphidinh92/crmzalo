/**
 * One-off import — 16 đơn ngày 27-28/05/2026 (XK5958-XK5973).
 *
 * Source:
 *   - Ban_hang 27-28.5.xlsx              (header — 16 đơn)
 *   - So_chi_tiet_ban_hang 27-28.5.xlsx  (đầy đủ line items)
 *
 * Phân bổ:
 *   - 27/05: 10 đơn (XK5958-XK5967)
 *   - 28/05:  6 đơn (XK5968-XK5973)
 *
 * Quy tắc: cost từ registry (DB), DT lãi gộp dùng số CÓ VAT (hôm nay
 * không có đơn VAT).
 *
 * SKU mới / tặng kèm:
 *   - NEU_04 (Neubria Neu Kid — vitamin tổng hợp cho bé): XK5970, cost
 *     DB 270k, lần đầu xuất hiện trong order import.
 *   - VAG_01 (Vagisil Tím) tặng kèm XK5964 ×2 (Thúy Hằng) — isGift.
 *
 * Điểm chú ý:
 *   - Chị Hiền Nguyễn (KH00002): mua BIO_07 ×30 (XK5958) + ×24 (XK5973)
 *     — margin chỉ 2.49%, vấn đề lặp lại nhiều ngày (anh Philip review giá).
 *   - 6 PML mới (PML0023-0028) + NT Sông Đà 1&2 mở rộng mạng lưới.
 *   - Thế Thảo Pharma (KH00006) — công ty mới.
 *
 * Status: tất cả 16 đơn = Đã xuất đủ + Chưa thanh toán → completed/credit.
 * Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-05-27-28.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-05-27-28.ts --apply  # ghi DB
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
  // ── 27/05 (10 đơn) ───────────────────────────────────────────────
  { orderCode: 'XK5958', orderDate: '2026-05-27', misaCode: 'KH00002',   customerName: 'Chị Hiền Nguyễn',                          saleName: 'Lê Huỳnh Đức',     paymentPaid: false, paymentMethod: 'credit', address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',        province: 'Hà Nội',    ward: 'Phường Thanh Xuân', phone: '0971299996', description: 'Bán hàng Chị Hiền Nguyễn (BIO_07 ×30 — lãi mỏng 2.49%)', total: 18_090_000, hasVat: false },
  { orderCode: 'XK5959', orderDate: '2026-05-27', misaCode: 'LT000001',  customerName: 'LT HKD Nhà thuốc Đức Minh',                saleName: 'Lê Huỳnh Đức',     paymentPaid: false, paymentMethod: 'credit', address: 'Nguyễn Chí Thanh, KĐT Đồng Sơn, Phúc Yên, Vĩnh Phúc', province: 'Vĩnh Phúc', ward: 'Phường Hai Bà Trưng', phone: '0974399666', description: 'Bán hàng LT HKD Nhà thuốc Đức Minh',            total: 4_050_000,  hasVat: false },
  { orderCode: 'XK5960', orderDate: '2026-05-27', misaCode: 'KH0000046', customerName: 'Chị Nguyễn Tuyết',                         saleName: 'Hoàng Bích Huế',   paymentPaid: false, paymentMethod: 'credit', address: 'Thôn An Liệt 3, Thanh Hải, Thanh Hà, Hải Dương',     province: 'Hải Dương', ward: 'Xã Thanh Hải',      phone: '0862059886', description: 'Bán hàng Chị Nguyễn Tuyết',                     total: 3_825_000,  hasVat: false },
  { orderCode: 'XK5961', orderDate: '2026-05-27', misaCode: 'PML0023',   customerName: 'PML Quầy thuốc Hoài Trang',                saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: 'Thôn Bằng Châu, Xã Mai Phụ, Hà Tĩnh',                province: 'Hà Tĩnh',   ward: 'Xã Mai Phụ',        phone: '0961838799', description: 'Bán hàng PML Quầy thuốc Hoài Trang',           total: 1_425_000,  hasVat: false },
  { orderCode: 'XK5962', orderDate: '2026-05-27', misaCode: 'PML0024',   customerName: 'PML Quầy Thuốc Thanh Hoa',                 saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: 'Thôn 1, Xã Chí Minh, Hưng Yên',                      province: 'Hưng Yên',  ward: 'Xã Chí Minh',       phone: '0372345836', description: 'Bán hàng PML Quầy Thuốc Thanh Hoa',           total: 1_425_000,  hasVat: false },
  { orderCode: 'XK5963', orderDate: '2026-05-27', misaCode: 'PML0025',   customerName: 'PML Quầy thuốc Hoàng Yến',                 saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: 'Thôn Thành Công, Quỳnh Mai, Nghệ An',                province: 'Nghệ An',   ward: 'Phường Quỳnh Mai',  phone: '0705274962', description: 'Bán hàng PML Quầy thuốc Hoàng Yến',           total: 4_025_000,  hasVat: false },
  { orderCode: 'XK5964', orderDate: '2026-05-27', misaCode: 'KH00057',   customerName: 'Chị Thúy Hằng',                            saleName: 'Lê Huỳnh Đức',     paymentPaid: false, paymentMethod: 'credit', address: 'Thôn Dương Xá, Xã Dương Quang, Mỹ Hào, Hưng Yên',    province: 'Hưng Yên',  ward: 'Phường Mỹ Hào',     phone: '0333107963', description: 'Bán hàng Chị Thúy Hằng (MH_03 ×24, tặng VAG_01 ×2)', total: 18_120_000, hasVat: false },
  { orderCode: 'XK5965', orderDate: '2026-05-27', misaCode: 'PML0026',   customerName: 'PML Vy Thị Thúy',                          saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: 'Bản Trường Sơn, Xã Nậm Cắn, Nghệ An',                province: 'Nghệ An',   ward: 'Xã Nậm Cắn',        phone: '0977912270', description: 'Bán hàng PML Vy Thị Thúy',                     total: 1_425_000,  hasVat: false },
  { orderCode: 'XK5966', orderDate: '2026-05-27', misaCode: 'KH000011',  customerName: 'Nhà Thuốc Sông Đà',                        saleName: 'Nguyễn Thành Đạt', paymentPaid: false, paymentMethod: 'credit', address: 'Số 141, Đại lộ Thịnh Lang, Tổ 9, phường Hòa Bình, Phú Thọ', province: 'Phú Thọ', ward: 'Phường Hòa Bình', phone: '0908012453', description: 'Bán hàng Nhà Thuốc Sông Đà',                total: 2_600_000,  hasVat: false },
  { orderCode: 'XK5967', orderDate: '2026-05-27', misaCode: 'KH000012',  customerName: 'Nhà Thuốc Sông Đà 2',                      saleName: 'Nguyễn Thành Đạt', paymentPaid: false, paymentMethod: 'credit', address: 'Số 141, Đại lộ Thịnh Lang, Tổ 9, phường Hòa Bình, Phú Thọ', province: 'Phú Thọ', ward: 'Phường Hòa Bình', phone: '0908012453', description: 'Bán hàng Nhà Thuốc Sông Đà 2',              total: 3_825_000,  hasVat: false },

  // ── 28/05 (6 đơn) ────────────────────────────────────────────────
  { orderCode: 'XK5968', orderDate: '2026-05-28', misaCode: 'KH000049',  customerName: 'Quầy thuốc Ngọc Diệp',                     saleName: 'Nguyễn Thành Đạt', paymentPaid: false, paymentMethod: 'credit', address: '117/634 Kim Giang, phường Kim Giang, Thanh Xuân, Hà Nội', province: 'Hà Nội',  ward: 'Phường Thanh Xuân', phone: '0346518477', description: 'Bán hàng Quầy thuốc Ngọc Diệp',              total: 1_450_000,  hasVat: false },
  { orderCode: 'XK5969', orderDate: '2026-05-28', misaCode: 'KH001305',  customerName: 'Phạm Trang Nhung',                         saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: '07 Nguyễn Du, phường Hoa Lư, Ninh Bình',             province: 'Ninh Bình', ward: 'Phường Hoa Lư',     phone: '0856067777', description: 'Bán hàng Phạm Trang Nhung',                    total: 1_425_000,  hasVat: false },
  { orderCode: 'XK5970', orderDate: '2026-05-28', misaCode: 'PML0027',   customerName: 'PML Đỗ Tiến Đạt',                          saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: '100 Vũ Trọng Phụng, Thanh Xuân, Hà Nội',             province: 'Hà Nội',    ward: 'Phường Thanh Xuân', phone: '0852047604', description: 'Bán hàng PML Đỗ Tiến Đạt (NEU_04 ×5)',         total: 1_575_000,  hasVat: false },
  { orderCode: 'XK5971', orderDate: '2026-05-28', misaCode: 'PML0028',   customerName: 'PML Quầy thuốc Bảo Phúc - C Loan',         saleName: 'Halo VN',          paymentPaid: false, paymentMethod: 'credit', address: 'Giang Liễu, Phương Liễu, Quế Võ, Bắc Ninh',          province: 'Bắc Ninh',  ward: 'Phường Phương Liễu', phone: '0937683139', description: 'Bán hàng PML Quầy thuốc Bảo Phúc - C Loan',    total: 2_600_000,  hasVat: false },
  { orderCode: 'XK5972', orderDate: '2026-05-28', misaCode: 'KH00006',   customerName: 'CÔNG TY CỔ PHẦN THẾ THẢO PHARMA',          saleName: 'Lê Huỳnh Đức',     paymentPaid: false, paymentMethod: 'credit', address: 'Tầng 1 sảnh B toà nhà 57 Vũ Trọng Phụng',            province: 'Hà Nội',    ward: 'Phường Thanh Xuân', phone: '0373825115', description: 'Bán hàng CTCP Thế Thảo Pharma (MH_01 ×20 + MH_02 ×10)', total: 10_350_000, hasVat: false },
  { orderCode: 'XK5973', orderDate: '2026-05-28', misaCode: 'KH00002',   customerName: 'Chị Hiền Nguyễn',                          saleName: 'Lê Huỳnh Đức',     paymentPaid: false, paymentMethod: 'credit', address: '328/56 Nguyễn Trãi, Thanh Xuân Trung, Hà Nội',        province: 'Hà Nội',    ward: 'Phường Thanh Xuân', phone: '0971299996', description: 'Bán hàng Chị Hiền Nguyễn (BIO_07 ×24 — lãi mỏng 2.49%)', total: 14_472_000, hasVat: false },
];

const ITEMS: LineItem[] = [
  // 27/05
  { orderCode: 'XK5958', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150v',     unit: 'Hộp', quantity: 30, unitPrice: 603_000, lineTotal: 18_090_000 },
  { orderCode: 'XK5959', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 290_000, lineTotal:  1_450_000 },
  { orderCode: 'XK5959', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 520_000, lineTotal:  2_600_000 },
  { orderCode: 'XK5960', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal:  3_825_000 },
  { orderCode: 'XK5961', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },
  { orderCode: 'XK5962', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },
  { orderCode: 'XK5963', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },
  { orderCode: 'XK5963', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 520_000, lineTotal:  2_600_000 },
  { orderCode: 'XK5964', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',               unit: 'Hộp', quantity: 24, unitPrice: 755_000, lineTotal: 18_120_000 },
  { orderCode: 'XK5964', sku: 'VAG_01', productName: 'Dung dịch vệ sinh Vagisil 240ml (Tím)',  unit: 'Hộp', quantity: 2,  unitPrice: 0,       lineTotal: 0, isGift: true },
  { orderCode: 'XK5965', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },
  { orderCode: 'XK5966', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 520_000, lineTotal:  2_600_000 },
  { orderCode: 'XK5967', sku: 'MH_03',  productName: 'Manhae Menopause 90 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 765_000, lineTotal:  3_825_000 },

  // 28/05
  { orderCode: 'XK5968', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 290_000, lineTotal:  1_450_000 },
  { orderCode: 'XK5969', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 285_000, lineTotal:  1_425_000 },
  { orderCode: 'XK5970', sku: 'NEU_04', productName: 'Neubria Neu Kid 30 viên',                unit: 'Hộp', quantity: 5,  unitPrice: 315_000, lineTotal:  1_575_000 },
  { orderCode: 'XK5971', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',               unit: 'Hộp', quantity: 5,  unitPrice: 520_000, lineTotal:  2_600_000 },
  { orderCode: 'XK5972', sku: 'MH_01',  productName: 'Manhae Menopause 30 viên',               unit: 'Hộp', quantity: 20, unitPrice: 270_000, lineTotal:  5_400_000 },
  { orderCode: 'XK5972', sku: 'MH_02',  productName: 'Manhae Menopause 60 viên',               unit: 'Hộp', quantity: 10, unitPrice: 495_000, lineTotal:  4_950_000 },
  { orderCode: 'XK5973', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150v',     unit: 'Hộp', quantity: 24, unitPrice: 603_000, lineTotal: 14_472_000 },
];

async function main(): Promise<void> {
  console.log(`Import 27-28/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
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
      `  ${exists ? '⏭ ' : '➕'} ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)} đ  ` +
      `${o.paymentPaid ? '💰' : '🕗'} ` +
      `| sale: ${saleMatched ? '✓' : '→Adm'} ${(o.saleName || '(trống)').padEnd(18)} ` +
      `| ${reuseContact ? 'reuse ' : 'CREATE'} ${o.customerName.slice(0, 33)}` +
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
      `  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)} đ  ${lineItems.length} items${giftCount ? ` (${giftCount} gift)` : ''}  sale=${o.saleName || '(trống)'}`
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
