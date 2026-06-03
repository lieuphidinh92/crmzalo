/**
 * One-off import — 13 đơn ngày 1-2/06/2026 (từ Google Sheet bán hàng).
 *
 * Quy tắc:
 *   - Giá vốn lấy từ product.cost_price (đã sync registry) — KHÔNG từ sheet.
 *   - Khớp khách theo SĐT CHUẨN HOÁ (bỏ ký tự không phải số) để không tạo
 *     trùng SĐT (vd Flora lưu "096 6886241"). KH00023 (Đỗ Tuyền) khớp mã.
 *   - Bỏ qua dòng tăm nước (chưa có giá vốn, anh Philip bổ sung sau).
 *   - Mặc định công nợ (chưa thu); STT6 có hạn nợ 10 ngày.
 *   - Mã đơn DH-202606-0001..0013 (liên tục, để generator app tiếp 0014).
 *   - Idempotent: skip nếu orderCode đã tồn tại.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/import-2026-06-01-02.ts          # dry-run
 *   npx tsx --env-file=.env scripts/import-2026-06-01-02.ts --apply  # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const normPhone = (p: string): string => (p || '').replace(/[^0-9]/g, '');

type Status = 'confirmed' | 'shipping' | 'completed';
interface OrderHeader {
  orderCode: string;
  orderDate: string;
  saleName: string;        // '' = Admin/owner
  customerName: string;
  matchMisa?: string;      // ưu tiên khớp khách theo mã này
  phone: string;           // '' nếu không có
  address: string;
  status: Status;
  debtDueDate?: string;    // YYYY-MM-DD nếu có hạn công nợ
  trackingCode?: string;
  note: string;
  total: number;
}
interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountValue?: number;
  lineTotal: number;
}

const ORDERS: OrderHeader[] = [
  { orderCode: 'DH-202606-0001', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'Chị Flora Thanh Huế',            phone: '0966886241', address: '11/35/97 Văn Cao, Liễu Giai, Ba Đình, HN',                              status: 'completed', debtDueDate: '2026-06-11', note: 'Công nợ 10 ngày', total: 177_600_000 },
  { orderCode: 'DH-202606-0002', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'Nhung Nguyễn - CÔNG TY TNHH ĐẦU TƯ VÀ XÚC TIẾN THƯƠNG MẠI PHƯƠNG LINH', phone: '0988096083', address: 'Trường Lương Thế Vinh cơ sở Tân Triều, Thanh Trì, Hà Nội',        status: 'completed', note: '', total: 29_040_000 },
  { orderCode: 'DH-202606-0003', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'CÔNG TY CỔ PHẦN THẾ THẢO PHARMA', matchMisa: 'KH00006', phone: '0373825115', address: '57 Vũ Trọng Phụng',                                                       status: 'completed', note: '', total: 7_176_000 },
  { orderCode: 'DH-202606-0004', orderDate: '2026-06-01', saleName: '',                 customerName: 'Chị Trà',                         phone: '0971306696', address: 'Sn 14 ngách 18/79 Định Công Thượng, Định Công, Hoàng Mai, Hà Nội',            status: 'shipping',  note: 'Đinh Thương', total: 1_530_000 },
  { orderCode: 'DH-202606-0005', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'Chị Thanh Nguyen - Công ty TNHH Thương Mại Quốc Tế JK Beauty', matchMisa: 'KH000033', phone: '0973328946', address: 'A1 Vinhomes Gardenia Hàm Nghi, Từ Liêm, Hà Nội',  status: 'completed', note: '', total: 20_175_000 },
  { orderCode: 'DH-202606-0006', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'Chị Bich Nguyen',                 phone: '0938087079', address: '65 Hồ Văn Huê, P. Phú Nhuận, TP.HCM',                                       status: 'shipping',  trackingCode: '143316613426', note: 'Mua với giá NY giảm 10%', total: 1_215_000 },
  { orderCode: 'DH-202606-0007', orderDate: '2026-06-01', saleName: '',                 customerName: 'Chị Đỗ Tuyền',                    matchMisa: 'KH00023', phone: '', address: 'Từ Sơn, Bắc Ninh',                                                          status: 'completed', note: 'Khách cũ KH00023', total: 80_300_000 },
  { orderCode: 'DH-202606-0008', orderDate: '2026-06-01', saleName: 'Lê Huỳnh Đức',     customerName: 'Chị Vũ Thu Thủy',                 phone: '0964216216', address: 'Quầy thuốc Thủy Văn, khu phố Soi, Xã Thanh Sơn, Tỉnh Phú Thọ',              status: 'shipping',  trackingCode: '143365392422', note: 'HKD Quầy thuốc Thủy Văn - MST 025188006482', total: 3_850_000 },
  { orderCode: 'DH-202606-0009', orderDate: '2026-06-02', saleName: 'Lê Huỳnh Đức',     customerName: 'Chị Trang Trang - HKD TRANG VIOLET SPA', matchMisa: 'PML0014', phone: '0914909822', address: '137 Phùng Hưng, Phường Đồng Hới, Tỉnh Quảng Trị',          status: 'confirmed', trackingCode: '143395337221', note: '', total: 2_600_000 },
  { orderCode: 'DH-202606-0010', orderDate: '2026-06-02', saleName: 'Nguyễn Thành Đạt', customerName: 'Chị Chu Diệp Thu',                phone: '0834180448', address: '37 Ngô Quyền, Hoàn Kiếm, Hà Nội',                                          status: 'completed', note: '', total: 9_180_000 },
  { orderCode: 'DH-202606-0011', orderDate: '2026-06-02', saleName: 'Nguyễn Thành Đạt', customerName: 'Chị Sầm Hồng',                    phone: '0947128051', address: 'Khoa khám bệnh - BV đa khoa Tỉnh Cao Bằng, P. Tân Giang, Cao Bằng',           status: 'shipping',  note: '', total: 2_600_000 },
  { orderCode: 'DH-202606-0012', orderDate: '2026-06-02', saleName: 'Nguyễn Thành Đạt', customerName: 'Chị Trần Hằng',                   phone: '0392526372', address: 'Số 25 xóm Tây, thôn Thái Phù, Sóc Sơn, Hà Nội',                              status: 'confirmed', trackingCode: '143397258732', note: '', total: 840_000 },
  { orderCode: 'DH-202606-0013', orderDate: '2026-06-02', saleName: 'Lê Huỳnh Đức',     customerName: 'Công Ty Cổ Phần PharmaDi',        matchMisa: 'KH00012', phone: '0973928734', address: 'NV3-38, Tổng Cục 5, Tân Triều, Hà Nội',                                  status: 'completed', note: '', total: 71_040_000 },
];

const ITEMS: LineItem[] = [
  { orderCode: 'DH-202606-0001', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 240, unitPrice: 740_000, lineTotal: 177_600_000 },
  { orderCode: 'DH-202606-0002', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150 viên', quantity: 48, unitPrice: 605_000, lineTotal: 29_040_000 },
  { orderCode: 'DH-202606-0003', sku: 'BIO_07', productName: 'Bioisland Milk Canxi Bon Care 150 viên', quantity: 12, unitPrice: 598_000, lineTotal: 7_176_000 },
  { orderCode: 'DH-202606-0004', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 2, unitPrice: 765_000, lineTotal: 1_530_000 },
  { orderCode: 'DH-202606-0005', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 25, unitPrice: 505_000, lineTotal: 12_625_000 },
  { orderCode: 'DH-202606-0005', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 10, unitPrice: 755_000, lineTotal: 7_550_000 },
  { orderCode: 'DH-202606-0006', sku: 'MH_01', productName: 'Manhae Menopause 30 viên', quantity: 3, unitPrice: 450_000, discountValue: 135_000, lineTotal: 1_215_000 },
  { orderCode: 'DH-202606-0007', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 110, unitPrice: 730_000, lineTotal: 80_300_000 },
  { orderCode: 'DH-202606-0008', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 5, unitPrice: 770_000, lineTotal: 3_850_000 },
  { orderCode: 'DH-202606-0009', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 5, unitPrice: 520_000, lineTotal: 2_600_000 },
  { orderCode: 'DH-202606-0010', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 12, unitPrice: 765_000, lineTotal: 9_180_000 },
  { orderCode: 'DH-202606-0011', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 5, unitPrice: 520_000, lineTotal: 2_600_000 },
  { orderCode: 'DH-202606-0012', sku: 'MH_02', productName: 'Manhae Menopause 60 viên', quantity: 1, unitPrice: 840_000, lineTotal: 840_000 },
  { orderCode: 'DH-202606-0013', sku: 'MH_03', productName: 'Manhae Menopause 90 viên', quantity: 96, unitPrice: 740_000, lineTotal: 71_040_000 },
];

// Thanh toán: completed = đã thu đủ; trừ đơn có hạn công nợ (Flora) → vẫn nợ.
// shipping/confirmed (chưa giao xong) = chưa thu → công nợ, thu khi giao (COD).
const paidOf = (o: OrderHeader): number => (o.status === 'completed' && !o.debtDueDate ? o.total : 0);
const payMethodOf = (o: OrderHeader): string => (o.debtDueDate ? 'credit' : 'cod');

const TS = (s: Status, d: Date) => ({
  confirmedAt: d,
  packedAt: s === 'shipping' || s === 'completed' ? d : null,
  shippedAt: s === 'shipping' || s === 'completed' ? d : null,
  completedAt: s === 'completed' ? d : null,
});

async function main(): Promise<void> {
  console.log(`Import 1-2/06/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('─'.repeat(72));

  const itemsByCode = new Map<string, LineItem[]>();
  for (const it of ITEMS) {
    const arr = itemsByCode.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByCode.set(it.orderCode, arr);
  }
  for (const o of ORDERS) {
    const sum = (itemsByCode.get(o.orderCode) ?? []).reduce((s, i) => s + i.lineTotal, 0);
    if (sum !== o.total) throw new Error(`Tổng dòng ${o.orderCode} = ${sum} ≠ header ${o.total}`);
  }
  console.log(`✓ Khớp tổng tiền (${ORDERS.length} đơn / ${ITEMS.length} dòng)`);

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');

  const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, fullName: true, role: true } });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner');

  const skus = Array.from(new Set(ITEMS.map((i) => i.sku)));
  const products = await prisma.product.findMany({ where: { orgId: org.id, sku: { in: skus } }, select: { id: true, sku: true, costPrice: true } });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  for (const s of skus) if (!productBySku.has(s)) throw new Error(`SKU ${s} không có trong catalog — DỪNG`);

  // Khớp khách: theo mã misa + theo SĐT chuẩn hoá (toàn bộ contact).
  const contacts = await prisma.contact.findMany({ where: { orgId: org.id }, select: { id: true, fullName: true, phone: true, misaCustomerCode: true } });
  const byMisa = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const c of contacts) {
    if (c.misaCustomerCode) byMisa.set(c.misaCustomerCode, c.id);
    const np = normPhone(c.phone || '');
    if (np && !byPhone.has(np)) byPhone.set(np, c.id);
  }

  const existing = await prisma.order.findMany({ where: { orgId: org.id, orderCode: { in: ORDERS.map((o) => o.orderCode) } }, select: { orderCode: true } });
  const existingCodes = new Set(existing.map((o) => o.orderCode));

  console.log('\n─── CHI TIẾT ───');
  let revenue = 0, cost = 0, debtSum = 0;
  for (const o of ORDERS) {
    const its = itemsByCode.get(o.orderCode) ?? [];
    const cReuse = (o.matchMisa && byMisa.get(o.matchMisa)) || (o.phone && byPhone.get(normPhone(o.phone)));
    const saleId = o.saleName ? userByName.get(o.saleName.toLowerCase()) : adminUser.id;
    let lineCostSum = 0;
    for (const it of its) lineCostSum += Number(productBySku.get(it.sku)!.costPrice ?? 0) * it.quantity;
    revenue += o.total; cost += lineCostSum; debtSum += o.total - paidOf(o);
    console.log(
      `  ${existingCodes.has(o.orderCode) ? '⏭' : '➕'} ${o.orderCode} | ${o.orderDate.slice(5)} | ${o.status.padEnd(9)} | ${String(o.total.toLocaleString('vi-VN')).padStart(12)}đ | ` +
      `${cReuse ? 'reuse ' : 'TẠO MỚI'} ${o.customerName.slice(0, 30).padEnd(30)} | sale:${o.saleName ? (saleId ? '✓' : '✗?') : 'Admin'} ${o.saleName || ''}`
    );
  }
  console.log('\nTổng:');
  console.log(`  Doanh thu (có VAT):  ${revenue.toLocaleString('vi-VN').padStart(14)} đ`);
  console.log(`  Giá vốn (DB):        ${cost.toLocaleString('vi-VN').padStart(14)} đ`);
  console.log(`  Lãi gộp:             ${(revenue - cost).toLocaleString('vi-VN').padStart(14)} đ  (${((revenue - cost) / revenue * 100).toFixed(2)}%)`);
  console.log(`  Đã thu (đơn giao thành công): ${(revenue - debtSum).toLocaleString('vi-VN').padStart(14)} đ`);
  console.log(`  Công nợ (đang giao/đã lên đơn + Flora): ${debtSum.toLocaleString('vi-VN')} đ`);

  if (!APPLY) { console.log('\n💡 Chạy lại với --apply để ghi DB.'); await prisma.$disconnect(); return; }

  console.log('\n─── ĐANG GHI ───');
  const touched = new Set<string>();
  for (const o of ORDERS) {
    if (existingCodes.has(o.orderCode)) { console.log(`  ⏭ ${o.orderCode} đã có — skip`); continue; }
    const saleId = (o.saleName ? userByName.get(o.saleName.toLowerCase()) : adminUser.id) ?? adminUser.id;
    let contactId = (o.matchMisa && byMisa.get(o.matchMisa)) || (o.phone && byPhone.get(normPhone(o.phone))) || undefined;
    if (!contactId) {
      const c = await prisma.contact.create({ data: { orgId: org.id, fullName: o.customerName, phone: o.phone || null, address: o.address || null, source: 'sheet_import_2026-06', assignedUserId: saleId }, select: { id: true } });
      contactId = c.id;
      if (o.phone) byPhone.set(normPhone(o.phone), contactId);
      console.log(`  ➕ khách mới: ${o.customerName}`);
    }
    touched.add(contactId);

    const its = itemsByCode.get(o.orderCode) ?? [];
    // Lưu nửa đêm UTC của ngày (không lệ thuộc TZ máy chạy) — để dashboard
    // lọc theo tháng (order_date >= monthStart UTC) đếm đúng ngày 01 đầu tháng.
    const d = new Date(`${o.orderDate}T00:00:00Z`);
    const order = await prisma.order.create({
      data: {
        orgId: org.id, contactId, createdByUserId: adminUser.id, assignedSaleId: saleId,
        orderCode: o.orderCode, orderDate: d, status: o.status,
        paymentMethod: payMethodOf(o), shippingProvider: o.trackingCode ? 'Viettel Post' : null, trackingCode: o.trackingCode ?? null,
        deliveryAddress: o.address || null, recipientName: o.customerName, recipientPhone: o.phone || null,
        totalAmount: o.total, subtotalAmount: o.total + its.reduce((s, i) => s + (i.discountValue ?? 0), 0),
        discountAmount: its.reduce((s, i) => s + (i.discountValue ?? 0), 0), totalAmountValue: o.total,
        paidAmount: paidOf(o), debtAmountValue: o.total - paidOf(o), debtDueDate: o.debtDueDate ? new Date(o.debtDueDate) : null,
        internalNote: `Import sheet 1-2/6${o.note ? ' — ' + o.note : ''}`,
        productSkus: Array.from(new Set(its.map((i) => i.sku))),
        ...TS(o.status, d),
      },
      select: { id: true },
    });
    await prisma.orderItem.createMany({
      data: its.map((it) => {
        const p = productBySku.get(it.sku)!;
        const unitCost = Number(p.costPrice ?? 0);
        const lineCost = unitCost * it.quantity;
        return { orderId: order.id, productId: p.id, sku: it.sku, productName: it.productName, unit: 'Hộp', quantity: it.quantity, unitPrice: it.unitPrice, discountValue: it.discountValue ?? 0, lineTotal: it.lineTotal, costValue: lineCost, unitCost, lineCost, profit: it.lineTotal - lineCost, returnQty: 0, returnValue: 0 };
      }),
    });
    console.log(`  ✓ ${o.orderCode}  ${o.total.toLocaleString('vi-VN').padStart(12)}đ  ${its.length} dòng`);
  }

  console.log('\nĐồng bộ lastOrderDate…');
  for (const cid of touched) {
    const last = await prisma.order.findFirst({ where: { contactId: cid, status: 'completed' }, orderBy: { orderDate: 'desc' }, select: { orderDate: true } });
    if (last?.orderDate) await prisma.contact.update({ where: { id: cid }, data: { lastOrderDate: last.orderDate } });
  }
  console.log('\n✅ Xong.');
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error('❌ Failed:', err); await prisma.$disconnect(); process.exit(1); });
