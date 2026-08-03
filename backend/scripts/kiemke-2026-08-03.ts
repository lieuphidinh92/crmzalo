/**
 * KIỂM KÊ THỰC TẾ 03/08/2026 — kho tầng 1 (toàn bộ tồn công ty).
 *
 * Nguồn: "HALO KIỂM THỰC TẾ T08_2026 - KHO TẦNG 1.pdf" (CEO gửi 3/8/2026).
 * Anh chốt 3 điểm trước khi chạy:
 *   1. VTR_16 có 2 dòng trong file (7 và 20, cùng date 1/2027) → lấy 20, dòng 7 là ghi trùng.
 *   2. File = TOÀN BỘ tồn → số kiểm THAY THẾ tồn hệ thống; mã không có trong file về 0.
 *   3. Brand Inocare KHÔNG kiểm → giữ nguyên số cũ, script tuyệt đối không đụng.
 *
 * Cách làm: bám đúng logic tính năng Kiểm kho có sẵn (stocktake-routes.ts):
 * tạo 1 phiên StocktakeSession (KK-202608-NNN) đã chốt + StocktakeItem cho từng lô +
 * inventory_movements (type=adjust, referenceType=stocktake) + resync products.total_stock.
 * → Anh xem lại được toàn bộ lịch sử điều chỉnh trong màn Kiểm kho, không phải sửa ngầm.
 *
 * Chạy:
 *   Xem trước (KHÔNG ghi):  DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03.ts
 *   Ghi thật:               DATABASE_URL='<url>' npx tsx scripts/kiemke-2026-08-03.ts --apply
 *
 * An toàn: chạy lại lần 2 → lệch = 0 → không tạo phiên mới (idempotent).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { prisma } from '../src/shared/database/prisma-client.js';

const APPLY = process.argv.includes('--apply');
const COUNT_DATE = '2026-08-03';
const NOTE = 'Kiểm kê thực tế 03/08/2026 — kho tầng 1 (CEO gửi file)';

/** Số kiểm thực tế. exp = date lô trên file (YYYY-MM) để khớp lô khi có nhiều lô. */
type SheetRow = { sku: string; qty: number; exp: string | null; name: string };
const SHEET: SheetRow[] = [
  { sku: 'HB_01', qty: 99, exp: '2029-01', name: 'Happi Baby Lactoferrin Powder 28g' },
  { sku: 'BT_04', qty: 108, exp: '2027-04', name: 'Better You Vitamin D 400 IU Infant Spray - Xanh' },
  { sku: 'KL_25', qty: 14, exp: '2027-07', name: 'Natrol Gummies Melatonin 10mg 90 viên' },
  { sku: 'OL_02', qty: 205, exp: '2028-03', name: 'Ostelin Calcium & Vitamin D3 130 viên' },
  { sku: 'VTR_04', qty: 13, exp: '2028-06', name: 'Vitatree Organ Fat Detox 60 Viên' },
  { sku: 'VTR_05', qty: 1, exp: '2028-03', name: 'Vitatree Essence Of Kangaroo 40000 Max' },
  { sku: 'VTR_08', qty: 1, exp: '2026-10', name: 'Vitatree Mega Ginkgo 9500mg Max 60 Viên' },
  { sku: 'VTR_12', qty: 10, exp: '2027-05', name: 'Vitatree Marine Collagen Plus 100V' },
  { sku: 'VTR_16', qty: 20, exp: '2027-01', name: 'Vitatree Glucosamine 1500 Plus Shark Cartilage' },
  { sku: 'VTR_18', qty: 133, exp: '2029-03', name: 'Vitatree D3 K2 MK7 Plus DHA Spray 20ml' },
  { sku: 'HC_01', qty: 52, exp: '2028-02', name: 'Healthy Care Super Lecithin 100 tablets' },
  { sku: 'HC_02', qty: 7, exp: '2028-08', name: 'Healthy Care Ginkgo Biloba 100 viên' },
  { sku: 'HC_03', qty: 1, exp: '2028-08', name: 'Healthy Care Fish Oil 1000mg Omega 3 400 tablets' },
  { sku: 'HC_05', qty: 1, exp: '2028-07', name: 'Healthy Care Vitamin E 500IU 200 tablets' },
  { sku: 'HC_11', qty: 20, exp: '2028-10', name: 'Healthy Care Ultimate Omega 3 6 9 200 tablets' },
  { sku: 'HC_14', qty: 1, exp: '2028-11', name: 'Healthy Care Kids High Strengthy DHA 60 tablets' },
  { sku: 'HC_20', qty: 44, exp: '2028-09', name: 'Healthy Care Shark Cartilage 750mg 200v' },
  { sku: 'MH_02', qty: 0, exp: null, name: 'Manhae Menopause 60 viên' },
  { sku: 'MH_03', qty: 0, exp: null, name: 'Manhae Menopause 90 viên' },
  { sku: 'MH_003', qty: 4, exp: '2029-02', name: 'Manhae Menopause 120 viên - Hàng móp méo' },
  { sku: 'MH_04', qty: 23, exp: '2027-09', name: 'Manhae Femmes enceintes Pregnant women 30 viên' },
  { sku: 'MH_05', qty: 12, exp: '2027-05', name: 'FORCE G Libido 60 viên' },
  { sku: 'MH_07', qty: 39, exp: '2029-02', name: 'Manhae Intima Equilibre 30 viên' },
  { sku: 'MH_09', qty: 17, exp: '2027-08', name: 'Manhae Collagene Expert 30 Viên' },
  { sku: 'OTB01', qty: 188, exp: '2027-11', name: 'Optibac For Women 30 viên' },
  { sku: 'OTB02', qty: 45, exp: '2027-09', name: 'Optibac For Women 90 viên' },
  { sku: 'OTB03', qty: 24, exp: '2027-09', name: 'Optibac Pregnancy 30 viên' },
  { sku: 'OTB04', qty: 7, exp: '2027-12', name: 'Optibac Babies & Children 30 gói' },
  { sku: 'OTB06', qty: 10, exp: '2028-10', name: 'Optibac Bifido & Fibre 30 gói' },
  { sku: 'OTB07', qty: 63, exp: '2027-10', name: 'Optibac Every Day 30 viên' },
  { sku: 'OTB08', qty: 38, exp: '2027-01', name: 'Optibac Baby Drops 30 viên' },
  { sku: 'USL_0021', qty: 8, exp: '2029-04', name: 'USOLAB BIO Intensive K Cream (15ml)' },
  { sku: 'USL_0032', qty: 6, exp: '2027-09', name: 'BIO TONE UP WHITENING FACE MASK 250ml' },
  { sku: 'USL_021', qty: 39, exp: '2027-11', name: 'BIO INTENSIVE K CREAM 1.2ml' },
  { sku: 'USL_032', qty: 0, exp: null, name: 'BIO TONE UP WHITENING FACE MASK 50ml' },
  { sku: 'USL_033', qty: 29, exp: '2029-05', name: 'BIO INTENSIVE LIGHT CREAM 250ml' },
  { sku: 'USL_0333', qty: 16, exp: '2027-05', name: '(QUÀ TẶNG) 50ML Kem truyền trắng Light Cream' },
  { sku: 'USL_01', qty: 5, exp: '2029-03', name: 'BIO DEEP CLEANSING WATER' },
  { sku: 'USL_04', qty: 4, exp: null, name: 'BIO INTENSIVE MOISTURIZING CLEANSER 150ml' },
  { sku: 'USL_06', qty: 1, exp: null, name: 'BIO INTENSIVE BRIGHTENING CLEANSER 150ml' },
  { sku: 'USL_07', qty: 2, exp: null, name: 'BIO GENTLE CLEANSER FOAM 150ml' },
  { sku: 'USL_08', qty: 10, exp: '2027-08', name: 'SOFT OATMEAL ENZYME POWER WASH 50g' },
  { sku: 'USL_09', qty: 10, exp: '2027-08', name: 'SOFT CHARCOAL ENZYME POWER WASH 50g' },
  { sku: 'USL_10', qty: 2, exp: null, name: 'BIO RENATURATION REPAIR MIST 150ml' },
  { sku: 'USL_11', qty: 14, exp: '2027-01', name: 'BIO MOISTURIZING HYALURON MIST 150ml' },
  { sku: 'USL_12', qty: 5, exp: '2027-01', name: 'BIO SENSITIVE PURIFYING MIST 150ml' },
  { sku: 'USL_13', qty: 4, exp: '2027-08', name: 'BIO BRIGHTENING BLEACHING MIST 150ml' },
  { sku: 'USL_14', qty: 5, exp: null, name: 'BIO RENATURATION REPAIR AMPOULE 50ml' },
  { sku: 'USL_15', qty: 6, exp: null, name: 'BIO MOISTURIZING HYALURON AMPOULE 50ml' },
  { sku: 'USL_16', qty: 1, exp: null, name: 'BIO SENSITIVE PURIFYING AMPOULE 50ml' },
  { sku: 'USL_18', qty: 4, exp: '2027-07', name: 'BIO INTENSIVE HYALURON CREAM 50ml' },
  { sku: 'USL_21', qty: 10, exp: '2028-09', name: 'BIO INTENSIVE K CREAM 50ml' },
  { sku: 'USL_023', qty: 0, exp: null, name: 'BIO RENATURATION PDRN CALMING MASK PACK (1 miếng)' },
  { sku: 'USL_024', qty: 60, exp: '2028-03', name: 'BIO MOISTURIZING HYDRATING HYALURON MASK PACK (1 miếng)' },
  { sku: 'USL_28', qty: 5, exp: null, name: 'USOLAB SUN BLOCK CREAM SPF50+/PA++++ (50ml)' },
  { sku: 'USL_29', qty: 9, exp: '2028-12', name: 'BIO SENSITIVE SUN BLOCK MATTE 50ml' },
  { sku: 'USL_30', qty: 3, exp: '2028-03', name: 'BODY AND SPA WHITENING SCRUB 200ml' },
  { sku: 'USL_38', qty: 4, exp: null, name: 'BIO INTENSIVE RESCUE LIP GEL 10ml' },
  { sku: 'USL_39', qty: 4, exp: '2028-02', name: 'BIO INTENSIVE HAND CREAM 50ml' },
  { sku: 'USL_45', qty: 120, exp: '2028-10', name: 'ABO MASK 1 miếng' },
  { sku: 'USL_46', qty: 16, exp: '2028-03', name: 'B9 30ml' },
  { sku: 'USL_48', qty: 7, exp: '2028-03', name: 'B5+HA 30ml' },
  { sku: 'USL_49', qty: 4, exp: null, name: 'RETIN A 30ml' },
  { sku: 'USL_53', qty: 1, exp: '2027-07', name: 'Serum Ampoule Vitamin K 30ml' },
  { sku: 'USL_55', qty: 4, exp: null, name: 'Usolab Sữa rửa mặt Bio Intensive Foaming K Cleanser 120ml' },
  { sku: 'VAG_01', qty: 7, exp: '2027-10', name: 'Dung dịch vệ sinh Vagisil 240ml (Tím)' },
  { sku: 'VAG_02', qty: 10, exp: '2027-07', name: 'Dung dịch vệ sinh Vagisil 354ml (Vàng)' },
  { sku: 'VTPB_02', qty: 111, exp: '2028-09', name: 'Vitabiotics Pregnacare Breast-Feeding 84 viên' },
  { sku: 'VTPM_01', qty: 44, exp: '2028-07', name: 'Vitabiotics Pregnacare Max 84 viên' },
  // NM_1 kiểm theo 2 LÔ riêng — script khớp theo expiryDate, không gộp.
  { sku: 'NM_1', qty: 17, exp: '2027-09', name: 'Nature Made Prenatal Folic Acid + DHA 150 viên (lô 9/2027)' },
  { sku: 'NM_1', qty: 191, exp: '2027-12', name: 'Nature Made Prenatal Folic Acid + DHA 150 viên (lô 12/2027)' },
  { sku: 'NM_5', qty: 9, exp: '2027-10', name: 'Nature Made Acid Folic 400mcg 250 viên' },
  { sku: 'BIO_01', qty: 29, exp: '2028-06', name: 'Bioisland DHA For Kids 60 viên' },
  { sku: 'BIO_03', qty: 20, exp: '2028-06', name: 'Bioisland milk calcium for kids 90 viên' },
  { sku: 'BIO_05', qty: 113, exp: '2028-05', name: 'Bioisland Lysine viên 60 viên' },
  { sku: 'BIO_06', qty: 1, exp: '2028-03', name: 'Bioisland DHA bầu' },
  { sku: 'BIO_07', qty: 4, exp: '2028-08', name: 'Bioisland Milk Canxi Bon Care 150 viên' },
  { sku: 'DDR_01', qty: 16, exp: '2029-01', name: 'DDrop Vitamin D3 Ddrops 400IU (90 giọt)' },
  { sku: 'MR_04', qty: 13, exp: '2028-08', name: 'Mavis Classic Strong Mint 85ml' },
  { sku: 'MR_07', qty: 7, exp: '2028-10', name: 'Marvis Ginger Mint 85ml' },
  { sku: 'MR_08', qty: 27, exp: '2028-10', name: 'Marvis Jasmin Mint 85ml' },
  { sku: 'MR_09', qty: 15, exp: '2028-09', name: 'Marvis Amarelli Licorice 85ml' },
  { sku: 'MR_10', qty: 9, exp: '2028-07', name: 'Marvis Dreamy Osmanthus 75ml' },
  { sku: 'MR_11', qty: 8, exp: '2028-10', name: 'Marvis Orange Blossom Bloom 75ml' },
  { sku: 'MR_12', qty: 6, exp: '2028-10', name: 'Marvis Black Forest 75ml' },
  { sku: 'MR_13', qty: 12, exp: '2028-10', name: 'Marvis Aquatic Mint 85ml' },
  { sku: 'PBB_001', qty: 1, exp: '2027-10', name: "Xịt nước muối biển ưu trương P'tit BOBO ISOTONIC 50ml" },
  { sku: 'PBB_01', qty: 3, exp: '2027-10', name: "Xịt nước muối biển đẳng trương P'tit BOBO ISOTONIC 100ml" },
  { sku: 'NEU_01', qty: 7, exp: '2028-03', name: 'Neubria Neubiotics Her 30 viên' },
  { sku: 'NEU_04', qty: 13, exp: '2028-05', name: 'Neubria Neu Kid 30 viên' },
  { sku: 'SM_01', qty: 5, exp: '2029-03', name: 'Solvitale Magnefol - 30 viên' },
  { sku: 'GH_001', qty: 0, exp: null, name: 'GH Creatinon EX+ 270 viên' },
  { sku: 'SBC_01', qty: 45, exp: '2027-04', name: 'Sambucol Black Elderberry Liquid Kids + Vitamin C (120ml)' },
];

/**
 * Mốc kiểm: **Đức kiểm kho 08:00 ngày 3/8** (CEO xác nhận).
 *
 * Trong ngày có movement, NHƯNG phải phân biệt 2 loại — đây là chỗ dễ sai nhất:
 *
 *  (a) HÀNG THẬT di chuyển sau khi kiểm → PHẢI cộng/trừ.
 *      Vd: phiếu nhập NK-202608-001 tạo 09:46, +20đv SM_01 → tồn = kiểm + 20.
 *
 *  (b) DỌN DỮ LIỆU đơn cũ → PHẢI BỎ QUA.
 *      12:00 Đức sửa trạng thái loạt đơn sai. Hệ quả: 4 đơn cũ (DH-202607-0131/0178/
 *      0174/0106, tạo 20–31/7) chuyển completed → FIFO trừ kho lúc 14h, và 2 đơn cũ
 *      (DH-202607-0089 shipped 17/7, DH-202607-0156 shipped 31/7) bị huỷ → hoàn kho
 *      +429đv MH_02. Hàng của các đơn này ĐÃ rời kho từ tháng 7 → lúc kiểm 08:00 đã
 *      không có trong kho → số kiểm đã phản ánh đúng. Cộng/trừ thêm = tính 2 lần.
 *
 * Cách phân biệt (không đoán): xem CHỨNG TỪ GỐC của movement được tạo lúc nào.
 * Chứng từ tạo sau 08:00 hôm nay = hàng thật vừa nhập/xuất. Chứng từ tạo từ tháng 7 =
 * dọn dữ liệu → bỏ. Movement của chính phiên kiểm (stocktake) cũng bỏ (giữ idempotent).
 */
const COUNT_AT = new Date('2026-08-03T08:00:00+07:00');

/** SKU áp ĐÚNG số kiểm, bỏ qua mọi movement sau đó. Rỗng vì quy tắc chứng từ gốc ở
 *  trên đã xử lý đúng cả MH_02 (429đv hoàn kho thuộc đơn tháng 7 → tự động bỏ). */
const RAW_COUNT_SKUS = new Set<string>([]);

/** Inocare KHÔNG kiểm — chặn 2 tầng (brand + tiền tố SKU) để không bao giờ đụng tới. */
const isInocare = (brandName: string | null, sku: string) =>
  /inocare/i.test(brandName ?? '') || /^(INC[_-]|INO-)/i.test(sku);

const ym = (d: Date | null) =>
  d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : null;

type Change = {
  sku: string;
  productId: string;
  batchId: string;
  batchCode: string;
  exp: string | null;
  system: number;
  counted: number;
  delta: number;
  isNewLot: boolean;
};

async function main() {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`KIỂM KÊ ${COUNT_DATE} — ${APPLY ? '⚠️  CHẾ ĐỘ GHI THẬT (--apply)' : 'XEM TRƯỚC (chưa ghi gì)'}`);
  console.log('='.repeat(78));

  // ── Bối cảnh: org / user ghi nhận / kho ──────────────────────────────────
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('Không tìm thấy organization');
  const orgCount = await prisma.organization.count();
  if (orgCount > 1) throw new Error(`Có ${orgCount} org — script chỉ an toàn khi 1 org. DỪNG.`);

  const actor = await prisma.user.findFirst({
    where: { orgId: org.id, role: { in: ['owner', 'admin'] }, isActive: true },
    orderBy: { role: 'asc' },
    select: { id: true, email: true, role: true },
  });
  if (!actor) throw new Error('Không có user owner/admin để ghi nhận phiên kiểm');

  const warehouses = await prisma.warehouse.findMany({
    where: { orgId: org.id, active: true },
    select: { id: true, name: true },
  });
  if (warehouses.length === 0) throw new Error('Không có kho active');
  if (warehouses.length > 1) {
    console.log(`⚠️  Có ${warehouses.length} kho active: ${warehouses.map((w) => w.name).join(', ')}`);
    console.log('    File chỉ kiểm "kho tầng 1" nhưng anh chốt = toàn bộ tồn → dùng kho đầu tiên.');
  }
  const warehouse = warehouses[0];
  console.log(`Org: ${org.name} · ghi nhận bởi: ${actor.email} (${actor.role}) · kho: ${warehouse.name}`);

  // ── Nạp toàn bộ SP + lô active ───────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: { orgId: org.id },
    select: {
      id: true, sku: true, name: true, totalStock: true, status: true,
      brand: { select: { name: true } },
      batches: {
        where: { status: 'active' },
        select: { id: true, batchCode: true, currentQuantity: true, expiryDate: true },
        orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
      },
    },
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  // ── Movement sau mốc kiểm — CHỈ tính cái có chứng từ gốc cũng tạo sau mốc kiểm ─
  const movsAfter = await prisma.inventoryMovement.findMany({
    where: { orgId: org.id, createdAt: { gte: COUNT_AT }, NOT: { referenceType: 'stocktake' } },
    select: { productId: true, quantity: true, referenceType: true, referenceId: true, note: true },
  });

  const orderIds = movsAfter.filter((m) => m.referenceType === 'order' && m.referenceId).map((m) => m.referenceId!);
  const importIds = movsAfter.filter((m) => m.referenceType === 'import_order' && m.referenceId).map((m) => m.referenceId!);
  const [ordersSrc, importsSrc] = await Promise.all([
    orderIds.length
      ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderCode: true, createdAt: true } })
      : Promise.resolve([]),
    importIds.length
      ? prisma.importOrder.findMany({ where: { id: { in: importIds } }, select: { id: true, importCode: true, createdAt: true } })
      : Promise.resolve([]),
  ]);
  const docAt = new Map<string, { code: string; at: Date }>();
  for (const o of ordersSrc) docAt.set(o.id, { code: o.orderCode, at: o.createdAt });
  for (const i of importsSrc) docAt.set(i.id, { code: i.importCode, at: i.createdAt });

  const netAfter = new Map<string, number>();
  const ignoredCleanup = new Map<string, { qty: number; docs: Set<string> }>();
  for (const m of movsAfter) {
    const doc = m.referenceId ? docAt.get(m.referenceId) : undefined;
    const isRealAfterCount = doc ? doc.at >= COUNT_AT : false;
    if (isRealAfterCount) {
      netAfter.set(m.productId, (netAfter.get(m.productId) ?? 0) + m.quantity);
    } else {
      // Dọn dữ liệu đơn cũ — bỏ qua, nhưng ghi ra để anh thấy đã bỏ cái gì.
      const e = ignoredCleanup.get(m.productId) ?? { qty: 0, docs: new Set<string>() };
      e.qty += m.quantity;
      e.docs.add(doc?.code ?? '(không rõ chứng từ)');
      ignoredCleanup.set(m.productId, e);
    }
  }

  // Gộp các dòng cùng SKU trong file (chỉ NM_1 — 2 lô)
  const sheetBySku = new Map<string, SheetRow[]>();
  for (const r of SHEET) {
    if (!sheetBySku.has(r.sku)) sheetBySku.set(r.sku, []);
    sheetBySku.get(r.sku)!.push(r);
  }

  const changes: Change[] = [];
  const newLots: Array<{ sku: string; productId: string; qty: number; exp: string | null }> = [];
  const notFound: string[] = [];
  const inocareSkipped: Array<{ sku: string; stock: number }> = [];
  /** SKU có giao dịch sau khi kiểm → tồn đích = kiểm + net. */
  const adjusted: Array<{ sku: string; counted: number; net: number; target: number }> = [];
  /** SKU KHÔNG tự xử lý được, chờ anh quyết — script bỏ qua, giữ nguyên tồn. */
  const needDecision: Array<{ sku: string; counted: number; net: number; reason: string }> = [];

  // ── 1. SKU có trong file kiểm ────────────────────────────────────────────
  for (const [sku, rows] of sheetBySku) {
    const p = bySku.get(sku);
    if (!p) { notFound.push(sku); continue; }
    if (isInocare(p.brand?.name ?? null, p.sku)) {
      // Không bao giờ xảy ra (file không có Inocare) — chốt chặn cho chắc.
      inocareSkipped.push({ sku, stock: p.totalStock });
      continue;
    }

    const lots = [...p.batches];

    const net = RAW_COUNT_SKUS.has(sku) ? 0 : netAfter.get(p.id) ?? 0;

    // Trường hợp file kiểm theo TỪNG LÔ (NM_1): khớp lô theo tháng HSD.
    if (rows.length > 1) {
      if (net !== 0) {
        // Không tự đoán nên phân bổ chênh lệch vào lô nào — báo để anh quyết.
        needDecision.push({ sku, counted: rows.reduce((s, r) => s + r.qty, 0), net, reason: 'kiểm theo từng lô + có giao dịch sau khi kiểm' });
        continue;
      }
      const matched = new Set<string>();
      for (const r of rows) {
        const lot = lots.find((l) => ym(l.expiryDate) === r.exp && !matched.has(l.id));
        if (!lot) {
          newLots.push({ sku, productId: p.id, qty: r.qty, exp: r.exp });
          continue;
        }
        matched.add(lot.id);
        if (lot.currentQuantity !== r.qty) {
          changes.push({
            sku, productId: p.id, batchId: lot.id, batchCode: lot.batchCode, exp: ym(lot.expiryDate),
            system: lot.currentQuantity, counted: r.qty, delta: r.qty - lot.currentQuantity, isNewLot: false,
          });
        }
      }
      // Lô KHÔNG có trong file → về 0. Thiếu bước này thì tồn cộng dồn sai:
      // NM_1 có lô 10/2027 (10 đv) không ai kiểm, để nguyên sẽ ra 218 thay vì 208.
      for (const lot of lots) {
        if (matched.has(lot.id) || lot.currentQuantity === 0) continue;
        changes.push({
          sku, productId: p.id, batchId: lot.id, batchCode: lot.batchCode, exp: ym(lot.expiryDate),
          system: lot.currentQuantity, counted: 0, delta: -lot.currentQuantity, isNewLot: false,
        });
      }
      continue;
    }

    // Trường hợp thường: 1 con số cho cả SKU (+ giao dịch phát sinh sau khi kiểm).
    const target = rows[0].qty + net;
    if (net !== 0) adjusted.push({ sku, counted: rows[0].qty, net, target });
    if (target < 0) {
      needDecision.push({ sku, counted: rows[0].qty, net, reason: `số kiểm ${rows[0].qty} + giao dịch ${net} = ${target} < 0` });
      continue;
    }
    const sysTotal = lots.reduce((s, l) => s + l.currentQuantity, 0);
    if (target === sysTotal) continue;

    if (lots.length === 0) {
      if (target > 0) newLots.push({ sku, productId: p.id, qty: target, exp: rows[0].exp });
      continue;
    }

    if (target < sysTotal) {
      // Giảm theo FIFO: trừ lô HSD sớm nhất trước (hàng cũ coi như đã bán).
      let remaining = sysTotal - target;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const cut = Math.min(lot.currentQuantity, remaining);
        if (cut <= 0) continue;
        changes.push({
          sku, productId: p.id, batchId: lot.id, batchCode: lot.batchCode, exp: ym(lot.expiryDate),
          system: lot.currentQuantity, counted: lot.currentQuantity - cut, delta: -cut, isNewLot: false,
        });
        remaining -= cut;
      }
    } else {
      // Tăng: dồn vào lô khớp HSD trên file, không khớp thì lô HSD muộn nhất.
      const add = target - sysTotal;
      const lot = lots.find((l) => ym(l.expiryDate) === rows[0].exp) ?? lots[lots.length - 1];
      changes.push({
        sku, productId: p.id, batchId: lot.id, batchCode: lot.batchCode, exp: ym(lot.expiryDate),
        system: lot.currentQuantity, counted: lot.currentQuantity + add, delta: add, isNewLot: false,
      });
    }
  }

  // ── 2. SKU KHÔNG có trong file → về 0 (trừ Inocare) ──────────────────────
  const zeroed: Array<{ sku: string; stock: number }> = [];
  for (const p of products) {
    if (sheetBySku.has(p.sku)) continue;
    if (isInocare(p.brand?.name ?? null, p.sku)) {
      if (p.totalStock !== 0) inocareSkipped.push({ sku: p.sku, stock: p.totalStock });
      continue;
    }
    const sysTotal = p.batches.reduce((s, l) => s + l.currentQuantity, 0);
    if (sysTotal === 0 && p.totalStock === 0) continue;
    if (sysTotal !== 0) {
      zeroed.push({ sku: p.sku, stock: sysTotal });
      for (const lot of p.batches) {
        if (lot.currentQuantity === 0) continue;
        changes.push({
          sku: p.sku, productId: p.id, batchId: lot.id, batchCode: lot.batchCode, exp: ym(lot.expiryDate),
          system: lot.currentQuantity, counted: 0, delta: -lot.currentQuantity, isNewLot: false,
        });
      }
    }
  }

  // ── 3. Lệch total_stock vs tổng lô (cột denormalized bị trôi) ────────────
  const drift = products
    .filter((p) => !isInocare(p.brand?.name ?? null, p.sku))
    .map((p) => ({
      sku: p.sku, id: p.id, total: p.totalStock,
      lotSum: p.batches.reduce((s, l) => s + l.currentQuantity, 0),
    }))
    .filter((r) => r.total !== r.lotSum);

  // ── BÁO CÁO ──────────────────────────────────────────────────────────────
  const pad = (s: any, n: number) => String(s).padEnd(n);
  const num = (n: any, w = 6) => String(n).padStart(w);

  console.log(`\n─── ĐIỀU CHỈNH LÔ (${changes.length} lô, ${new Set(changes.map((c) => c.sku)).size} SKU) ───`);
  console.log(`${pad('SKU', 11)}${pad('lô', 20)}${num('hệ thống')}${num('kiểm')}${num('lệch', 8)}`);
  for (const c of [...changes].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))) {
    console.log(`${pad(c.sku, 11)}${pad(c.batchCode.slice(0, 19), 20)}${num(c.system)}${num(c.counted)}${num((c.delta > 0 ? '+' : '') + c.delta, 8)}`);
  }

  if (ignoredCleanup.size) {
    console.log(`\n─── BỎ QUA vì là DỌN DỮ LIỆU đơn cũ, không phải hàng thật (${ignoredCleanup.size} SKU) ───`);
    console.log('Hàng các đơn này đã rời kho từ tháng 7 → số kiểm 08:00 đã đúng, không cộng/trừ thêm:');
    for (const [pid, e] of ignoredCleanup) {
      const sku = products.find((p) => p.id === pid)?.sku ?? pid;
      console.log(`${pad(sku, 11)}${(e.qty > 0 ? '+' : '') + e.qty} đv (bỏ)   chứng từ: ${[...e.docs].join(', ')}`);
    }
  }
  if (adjusted.length) {
    console.log(`\n─── CỘNG/TRỪ GIAO DỊCH SAU KHI KIỂM (${adjusted.length} SKU) ───`);
    console.log('Kiểm đầu ngày → cộng nhập / trừ xuất trong ngày → tồn đích hiện tại:');
    for (const a of adjusted.sort((x, y) => Math.abs(y.net) - Math.abs(x.net))) {
      console.log(`${pad(a.sku, 11)}kiểm ${num(a.counted, 5)}  ${a.net > 0 ? '+' : ''}${String(a.net).padStart(5)} (giao dịch)  → đích ${num(a.target, 5)}`);
    }
  }
  if (needDecision.length) {
    console.log(`\n⚠️  ─── CHỜ ANH QUYẾT — script BỎ QUA, giữ nguyên tồn (${needDecision.length} SKU) ───`);
    for (const d of needDecision) {
      console.log(`${pad(d.sku, 11)}kiểm ${num(d.counted, 5)}  giao dịch sau kiểm ${d.net > 0 ? '+' : ''}${d.net}  — ${d.reason}`);
    }
  }
  if (newLots.length) {
    console.log(`\n─── TẠO LÔ MỚI (${newLots.length}) — SP đang 0 tồn nhưng kiểm có hàng ───`);
    for (const n of newLots) console.log(`${pad(n.sku, 11)}${num(n.qty)} đv   HSD ${n.exp ?? '(không có)'}`);
    console.log('  ⚠️  Lô mới KHÔNG có giá vốn (importCost=null) → chưa tính được lãi gộp cho các mã này.');
  }
  if (zeroed.length) {
    console.log(`\n─── VỀ 0 vì không có trong file (${zeroed.length} SKU) ───`);
    for (const z of zeroed.sort((a, b) => b.stock - a.stock)) console.log(`${pad(z.sku, 11)}${num(z.stock)} đv → 0`);
  }
  if (notFound.length) console.log(`\n⚠️  SKU trong file KHÔNG có trong DB (${notFound.length}): ${notFound.join(', ')}`);
  if (drift.length) {
    console.log(`\n─── total_stock LỆCH tổng lô (${drift.length} SKU) — sẽ resync ───`);
    for (const d of drift) console.log(`${pad(d.sku, 11)}total_stock=${num(d.total)}  tổng lô=${num(d.lotSum)}`);
  }

  const inoTotal = products
    .filter((p) => isInocare(p.brand?.name ?? null, p.sku))
    .reduce((s, p) => s + p.totalStock, 0);
  console.log(`\n─── INOCARE: giữ nguyên, KHÔNG đụng ───`);
  console.log(`${products.filter((p) => isInocare(p.brand?.name ?? null, p.sku)).length} SKU · tổng tồn ${inoTotal} đv (script bỏ qua hoàn toàn)`);

  const sheetTotal = SHEET.reduce((s, r) => s + r.qty, 0);
  console.log(`\n─── TỔNG KẾT ───`);
  console.log(`Tồn theo file kiểm      : ${sheetTotal} đv / ${sheetBySku.size} SKU`);
  console.log(`Lô cần điều chỉnh       : ${changes.length}`);
  console.log(`Lô mới cần tạo          : ${newLots.length}`);
  console.log(`SKU về 0 (không có file): ${zeroed.length}`);
  console.log(`SKU cần resync total    : ${drift.length}`);

  if (changes.length === 0 && newLots.length === 0 && drift.length === 0) {
    console.log('\n✅ Không có gì cần sửa — dữ liệu đã khớp file kiểm (idempotent, chạy lại an toàn).');
    await prisma.$disconnect();
    return;
  }

  if (!APPLY) {
    console.log('\n👀 ĐANG XEM TRƯỚC — chưa ghi gì vào DB.');
    console.log('   Muốn ghi thật, chạy lại với: --apply');
    await prisma.$disconnect();
    return;
  }

  // ── BACKUP trước khi ghi ─────────────────────────────────────────────────
  const stamp = COUNT_DATE.replace(/-/g, '');
  const dir = new URL('./backups/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  // Tên file có giờ chạy — KHÔNG dùng tên cố định: chạy lần 2 sẽ ghi đè backup của
  // lần 1 (backup mới chỉ còn trạng thái ĐÃ sửa) → mất đường lùi. Đã bị 1 lần khi
  // rehearsal trên local, đừng để lặp lại trên production.
  const runAt = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${dir}kiemke-${stamp}-before-${runAt}.csv`;
  const backupRows = ['sku,batch_id,batch_code,expiry,current_quantity,product_total_stock'];
  for (const p of products) {
    for (const l of p.batches) {
      backupRows.push([p.sku, l.id, `"${l.batchCode}"`, ym(l.expiryDate) ?? '', l.currentQuantity, p.totalStock].join(','));
    }
  }
  writeFileSync(backupPath, backupRows.join('\n'));
  console.log(`\n💾 Backup ${backupRows.length - 1} lô → ${backupPath}`);

  // ── GHI: 1 transaction, tạo phiên kiểm kho đã chốt ──────────────────────
  const affected = new Set<string>([...changes.map((c) => c.productId), ...newLots.map((n) => n.productId), ...drift.map((d) => d.id)]);

  const result = await prisma.$transaction(async (tx: any) => {
    // Mã phiên KK-YYYYMM-NNN (giống generateStocktakeCode)
    const prefix = `KK-${COUNT_DATE.slice(0, 4)}${COUNT_DATE.slice(5, 7)}-`;
    const last = await tx.stocktakeSession.findFirst({
      where: { orgId: org.id, code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const code = `${prefix}${String(last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1).padStart(3, '0')}`;

    const session = await tx.stocktakeSession.create({
      data: {
        orgId: org.id, warehouseId: warehouse.id, code, status: 'completed',
        periodMonth: COUNT_DATE.slice(0, 7), note: NOTE,
        itemCount: changes.length, countedCount: changes.length,
        varianceQty: changes.reduce((s, c) => s + c.delta, 0),
        createdById: actor.id, completedById: actor.id, completedAt: new Date(`${COUNT_DATE}T01:00:00+07:00`),
      },
      select: { id: true, code: true },
    });

    // Điều chỉnh từng lô + ghi movement audit
    for (const c of changes) {
      const live = await tx.inventoryBatch.findUnique({
        where: { id: c.batchId },
        select: { currentQuantity: true, status: true },
      });
      if (!live || live.status === 'recalled') continue;

      await tx.stocktakeItem.create({
        data: {
          sessionId: session.id, batchId: c.batchId, productId: c.productId,
          systemQty: c.system, countedQty: c.counted, variance: c.delta,
        },
      });
      await tx.inventoryBatch.update({ where: { id: c.batchId }, data: { currentQuantity: c.counted } });
      await tx.inventoryMovement.create({
        data: {
          orgId: org.id, productId: c.productId, batchId: c.batchId,
          type: 'adjust', quantity: c.delta,
          referenceType: 'stocktake', referenceId: session.id,
          note: `[${c.batchCode}] Kiểm kê ${session.code}: ${c.delta > 0 ? '+' : ''}${c.delta}`,
          createdById: actor.id,
        },
      });
    }

    // Lô mới cho SP kiểm có hàng nhưng hệ thống 0 tồn
    for (const n of newLots) {
      const batch = await tx.inventoryBatch.create({
        data: {
          orgId: org.id, productId: n.productId, warehouseId: warehouse.id,
          batchCode: `KK${stamp}-${n.sku}`,
          // Cột @db.Date: PHẢI ghi midnight UTC. Dùng +07:00 sẽ thành 17:00Z hôm
          // trước → Postgres cắt DATE lùi 1 ngày (2028-06-01 → 2028-05-31), lô mới
          // lệch tháng HSD nên lần chạy sau không khớp lại được (P2002 trùng mã lô).
          expiryDate: n.exp ? new Date(`${n.exp}-01T00:00:00Z`) : null,
          importQuantity: n.qty, currentQuantity: n.qty,
          status: 'active', notes: NOTE, createdById: actor.id,
        },
        select: { id: true, batchCode: true },
      });
      await tx.inventoryMovement.create({
        data: {
          orgId: org.id, productId: n.productId, batchId: batch.id,
          type: 'adjust', quantity: n.qty,
          referenceType: 'stocktake', referenceId: session.id,
          note: `[${batch.batchCode}] Kiểm kê ${session.code}: lô mới +${n.qty}`,
          createdById: actor.id,
        },
      });
    }

    // Resync total_stock (BÀI HỌC 15/7: cột denormalized, sửa lô là chưa đủ)
    for (const pid of affected) {
      const sum = await tx.inventoryBatch.aggregate({
        where: { productId: pid, status: 'active' },
        _sum: { currentQuantity: true },
      });
      const total = sum._sum.currentQuantity ?? 0;
      await tx.product.update({
        where: { id: pid },
        data: { totalStock: total, ...(total > 0 ? { hasSales: true } : {}) },
      });
    }

    return session;
  }, { timeout: 120_000 });

  console.log(`\n✅ ĐÃ GHI — phiên kiểm kho ${result.code} (xem lại trong màn Kiểm kho)`);

  // ── VERIFY sau khi ghi ───────────────────────────────────────────────────
  const recheck = await prisma.product.findMany({
    where: { orgId: org.id },
    select: {
      sku: true, totalStock: true, brand: { select: { name: true } },
      batches: { where: { status: 'active' }, select: { currentQuantity: true } },
    },
  });

  const stillDrift = recheck.filter(
    (p) => p.totalStock !== p.batches.reduce((s, l) => s + l.currentQuantity, 0),
  );
  const skipped = new Set(needDecision.map((d) => d.sku));
  const wrongCount: string[] = [];
  for (const [sku, rows] of sheetBySku) {
    const p = recheck.find((x) => x.sku === sku);
    if (!p || skipped.has(sku)) continue;
    // Tồn đích = số kiểm + giao dịch sau khi kiểm (cùng công thức lúc lập kế hoạch).
    const prod = bySku.get(sku)!;
    const net = RAW_COUNT_SKUS.has(sku) ? 0 : netAfter.get(prod.id) ?? 0;
    const target = rows.reduce((s, r) => s + r.qty, 0) + net;
    if (p.totalStock !== target) wrongCount.push(`${sku}: DB=${p.totalStock} ≠ đích=${target}`);
  }
  const inoAfter = recheck
    .filter((p) => isInocare(p.brand?.name ?? null, p.sku))
    .reduce((s, p) => s + p.totalStock, 0);

  console.log(`\n─── VERIFY ───`);
  console.log(`${stillDrift.length === 0 ? '✅' : '❌'} total_stock khớp tổng lô: ${stillDrift.length} SKU còn lệch${stillDrift.length ? ' → ' + stillDrift.map((p) => p.sku).join(', ') : ''}`);
  console.log(`${wrongCount.length === 0 ? '✅' : '❌'} Tồn khớp file kiểm: ${wrongCount.length} SKU sai${wrongCount.length ? '\n   ' + wrongCount.join('\n   ') : ''}`);
  console.log(`${inoAfter === inoTotal ? '✅' : '❌'} Inocare giữ nguyên: trước ${inoTotal} đv → sau ${inoAfter} đv`);
  console.log(`Tổng tồn công ty sau kiểm: ${recheck.reduce((s, p) => s + p.totalStock, 0)} đv`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n❌ LỖI — KHÔNG có thay đổi nào được ghi (transaction rollback):');
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
