/**
 * reset-june-2026.ts — RESET đơn hàng tháng 6 + nhập lại từ file "Bán hàng
 * tháng 6.xlsx" (đã parse ra /tmp/june_orders.json). Đích = 4.029.151.500đ.
 *
 * AN TOÀN (đã kiểm): đơn T6 KHÔNG có FIFO kho / VAT / phiếu thu → xóa không
 * lệch kho/công nợ. GIỮ NGUYÊN 11 đơn nợ đầu kỳ (status='opening_balance').
 *
 * DRY_RUN mặc định (chỉ in kế hoạch + kiểm tra). DRY_RUN=0 để ghi thật:
 *   npx tsx --env-file=.env.prod scripts/reset-june-2026.ts           # dry-run
 *   DRY_RUN=0 npx tsx --env-file=.env.prod scripts/reset-june-2026.ts # ghi
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { readFileSync, writeFileSync } from 'node:fs';

const DRY = process.env.DRY_RUN !== '0';
const ORG = '7dc86328-624d-4e2d-b0b6-bc62b574a95a';
const AS_OF = new Date();
const fmt = (x: any) => Math.round(Number(x || 0)).toLocaleString('vi-VN') + 'đ';
const EXPECTED = 4_029_151_500;

// Tên file → SKU (anh Philip xác nhận 30/06/2026, dựa trên đơn T6 thật).
const PRODUCT_MAP: Record<string, string> = {
  'Nội tiết 30 viên': 'MH_01', 'Nội tiết 60 viên': 'MH_02', 'Nội tiết 90 viên': 'MH_03',
  'Nội tiết 120 viên': 'MH_003', 'NeuHer': 'NEU_01', 'NEUKID': 'NEU_04', 'Bone Care': 'BIO_07',
  'Prenatal 150 viên': 'NM_1', 'Bio DHA bầu 60v': 'BIO_06', 'Sinh lí Nam': 'MH_05',
  'Bổ bầu': 'MH_04', 'Phụ khoa': 'MH_07', 'Collagen': 'MH_09', 'Lysine 60 viên': 'BIO_05',
  'Tăm nước Pro Màu Trắng': 'INC_02T', 'Tăm Nước Pro Màu đen': 'INC_02D',
  'Tăn Nước Mini Màu Trắng': 'INC_01TRANG', 'Tăm nước Mini màu Hồng': 'INC_01H',
  'Op For Women 30v': 'OTB01', 'Optibac For Women 90v': 'OTB02',
  'HC 369 200 viên': 'HC_11', 'Bàn chải điện màu trắng': 'INC_03T',
};
const SALE_MAP: Record<string, string> = {
  'Đức': 'Lê Huỳnh Đức', 'Admin': 'Admin', 'Đạt': 'Nguyễn Thành Đạt',
  'Mai Hiền': 'Mai Hiền', 'Huế': 'Hoàng Bích Huế', 'Huy': 'Trần Quốc Huy', 'Luận': 'Phí Hữu Luận',
};
// Khách đã có nhưng Mã KH/SĐT trong file khác hệ thống → nối tay theo customerCode.
const CONTACT_OVERRIDE: Record<string, string> = {
  'Ken Phạm - HKD Phạm Cường': 'KH057',
  'Thảo Moon': 'KH195',
};

type Item = { name: string; qty: number; price: number; total: number };
type FileOrder = { ngay: string; sale: string; makh: string; ten: string; sdt: string; items: Item[]; total: number };

const phoneCore = (p: string | null | undefined) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('84')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
};
// Ép về tháng 6/2026: blank → carry-forward; tháng khác → đổi sang 06 (giữ ngày).
function juneDate(raw: string, prev: Date): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw || '');
  if (!m) return prev;
  let [_, y, mo, d] = m;
  const day = Math.min(Math.max(parseInt(d), 1), 30);
  return new Date(`2026-06-${String(day).padStart(2, '0')}T09:00:00+07:00`);
}

async function main() {
  console.log(`\n=== RESET ĐƠN THÁNG 6 — ${DRY ? 'DRY-RUN (chỉ đọc)' : '⚠️  GHI THẬT'} ===\n`);
  const fileOrders: FileOrder[] = JSON.parse(readFileSync('/tmp/june_orders.json', 'utf8'));
  const fileTotal = fileOrders.reduce((s, o) => s + o.total, 0);
  if (fileTotal !== EXPECTED) throw new Error(`Tổng file ${fmt(fileTotal)} != đích ${fmt(EXPECTED)}`);

  // Tra cứu hệ thống
  const owner = await prisma.user.findFirst({ where: { orgId: ORG, role: { in: ['owner', 'admin'] } }, orderBy: { role: 'asc' }, select: { id: true } });
  const users = await prisma.user.findMany({ where: { orgId: ORG }, select: { id: true, fullName: true } });
  const products = await prisma.product.findMany({ where: { orgId: ORG }, select: { id: true, sku: true, name: true } });
  const contacts = await prisma.contact.findMany({ where: { orgId: ORG }, select: { id: true, customerCode: true, phone: true, fullName: true } });
  const skuMap = new Map(products.map((p) => [p.sku, p]));
  const userByName = (n: string) => users.find((u) => u.fullName === n) || users.find((u) => (u.fullName || '').includes(n));
  const contactByCode = new Map(contacts.filter((c) => c.customerCode).map((c) => [c.customerCode!, c]));
  const contactByPhone = new Map(contacts.map((c) => [phoneCore(c.phone), c]).filter(([k]) => k));
  // Khớp theo TÊN gần đúng: bỏ dấu + tiền tố (chị/anh/hkd/cty/quầy thuốc...) rồi so token.
  const normName = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(chi|anh|c|cty|cong ty|tnhh|cp|co phan|hkd|ho kinh doanh|quay thuoc|nha thuoc|pml|rio|npp|ds|duoc si|bs|bac si)\b/g, ' ')
    .replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const contactNorm = contacts.map((c) => ({ c, tokens: new Set(normName(c.fullName || '').split(' ').filter((w) => w.length > 1)) }));
  function fuzzyContact(name: string) {
    const t = new Set(normName(name).split(' ').filter((w) => w.length > 1));
    if (t.size === 0) return null;
    let best: any = null, bestScore = 0;
    for (const { c, tokens } of contactNorm) {
      if (tokens.size === 0) continue;
      let m = 0; for (const w of t) if (tokens.has(w)) m++;
      const score = m / Math.max(t.size, tokens.size);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return bestScore >= 0.6 ? best : null;
  }

  // Resolve từng đơn + gom lỗi
  const unmappedProducts = new Set<string>();
  const toCreate = new Map<string, { makh: string; ten: string; sdt: string }>(); // khách mới cần tạo
  const unmatchedSales = new Set<string>();
  const dateAdjusted: string[] = [];
  let prevDate = new Date('2026-06-01T09:00:00+07:00');
  const resolved = fileOrders.map((o, idx) => {
    const dt = juneDate(o.ngay, prevDate);
    if (!o.ngay || !o.ngay.startsWith('2026-06')) dateAdjusted.push(`${o.ten} (${o.ngay || 'trống'} → ${dt.toISOString().slice(0, 10)})`);
    prevDate = dt;
    const saleName = SALE_MAP[o.sale];
    const saleUser = saleName ? userByName(saleName) : null;
    if (o.sale && !saleUser) unmatchedSales.add(o.sale);
    const overrideCode = CONTACT_OVERRIDE[o.ten?.trim()];
    let contact: any = (overrideCode && contactByCode.get(overrideCode))
      || (o.makh && contactByCode.get(o.makh)) || contactByPhone.get(phoneCore(o.sdt))
      || contacts.find((c) => c.fullName && o.ten && c.fullName.trim() === o.ten.trim())
      || fuzzyContact(o.ten);
    let createKey = '';
    if (!contact) {
      createKey = (o.makh || 'NAME:' + o.ten).trim();
      if (o.ten && !toCreate.has(createKey)) toCreate.set(createKey, { makh: o.makh, ten: o.ten, sdt: o.sdt });
    }
    const items = o.items.map((it) => {
      const sku = PRODUCT_MAP[it.name];
      const prod = sku ? skuMap.get(sku) : null;
      if (!sku || !prod) unmappedProducts.add(it.name);
      return { ...it, sku, prod };
    });
    return { o, dt, saleUser, contact, createKey, items };
  });

  console.log(`File: ${fileOrders.length} đơn, ${fileOrders.reduce((s, o) => s + o.items.length, 0)} dòng hàng, tổng ${fmt(fileTotal)} ✓`);

  // Đơn T6 hiện tại sẽ xóa
  const from = new Date('2026-06-01T00:00:00+07:00'), to = new Date('2026-06-30T23:59:59+07:00');
  const existing = await prisma.order.findMany({ where: { orgId: ORG, orderDate: { gte: from, lte: to }, status: { not: 'opening_balance' } }, select: { id: true, orderCode: true, totalAmount: true } });
  const existTotal = existing.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
  console.log(`\nSẼ XÓA: ${existing.length} đơn T6 hiện tại (tổng ${fmt(existTotal)}) — GIỮ 11 đơn nợ đầu kỳ.`);
  console.log(`SẼ TẠO: ${fileOrders.length} đơn mới từ file (tổng ${fmt(fileTotal)}).`);

  console.log('\n── KIỂM TRA ──');
  console.log(`  SP chưa map SKU: ${unmappedProducts.size ? [...unmappedProducts].join(', ') : '✓ hết'}`);
  console.log(`  Sale chưa khớp user: ${unmatchedSales.size ? [...unmatchedSales].join(', ') : '✓ hết'}`);
  console.log(`  Khách MỚI sẽ tạo (${toCreate.size}):`);
  [...toCreate.values()].forEach((c) => console.log(`     + ${c.ten} | ${c.sdt || '(không SĐT)'} | file ${c.makh || '-'}`));
  console.log(`  Đơn phải chỉnh ngày về T6 (${dateAdjusted.length}):`);
  dateAdjusted.slice(0, 20).forEach((d) => console.log(`     - ${d}`));

  const blockers = unmappedProducts.size + unmatchedSales.size;
  if (DRY) {
    console.log(`\n[DRY-RUN] Chưa ghi gì. ${blockers ? `⚠️ Còn ${blockers} SP/sale chưa khớp.` : '✓ Sẵn sàng apply (khách mới sẽ được tạo tự động).'}`);
    console.log('[DRY-RUN] Chạy lại DRY_RUN=0 để ghi thật.\n');
    return;
  }

  // ── APPLY ──
  if (unmappedProducts.size || unmatchedSales.size) throw new Error('Còn SP/sale chưa khớp — DỪNG.');

  const backup = { at: AS_OF.toISOString(), deleted: existing.map((o) => ({ id: o.id, orderCode: o.orderCode, totalAmount: Number(o.totalAmount || 0) })) };
  const bpath = `scripts/backup-reset-june-${AS_OF.toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(bpath, JSON.stringify(backup), 'utf8');
  console.log(`\n[APPLY] Backup → ${bpath} (${existing.length} đơn)`);

  await prisma.$transaction(async (tx) => {
    const ids = existing.map((o) => o.id);
    await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await tx.order.deleteMany({ where: { id: { in: ids } } });
    // Tạo khách mới trước.
    const createdContacts = new Map<string, string>();
    for (const [key, info] of toCreate.entries()) {
      const nc = await tx.contact.create({
        data: { orgId: ORG, fullName: info.ten, phone: phoneCore(info.sdt) ? '0' + phoneCore(info.sdt) : null, internalNote: 'Tạo từ reset đơn T6 (file Philip)' },
        select: { id: true },
      });
      createdContacts.set(key, nc.id);
    }
    console.log(`[APPLY] Đã tạo ${createdContacts.size} khách mới.`);
    let seq = 0;
    for (const r of resolved) {
      seq += 1;
      const code = `DH-202606-${String(seq).padStart(4, '0')}`;
      const contactId = r.contact?.id ?? createdContacts.get(r.createKey);
      if (!contactId) throw new Error(`Đơn ${r.o.ten} không có contact — DỪNG`);
      const order = await tx.order.create({
        data: {
          orgId: ORG, contactId, createdByUserId: owner!.id,
          assignedSaleId: r.saleUser?.id ?? null, orderCode: code, status: 'completed',
          orderDate: r.dt, paymentMethod: 'cash',
          subtotalAmount: r.o.total, totalAmountValue: r.o.total, totalAmount: r.o.total,
          paidAmount: r.o.total, debtAmountValue: 0,
          internalNote: 'Nhập lại từ file Bán hàng T6 (reset 30/06/2026)',
        },
      });
      for (const it of r.items) {
        await tx.orderItem.create({
          data: { orderId: order.id, sku: it.sku!, productId: it.prod!.id, productName: it.prod!.name, quantity: it.qty, unitPrice: it.price, lineTotal: it.total },
        });
      }
    }
  }, { timeout: 180_000, maxWait: 30_000 });

  const after = await prisma.order.aggregate({ where: { orgId: ORG, status: 'completed', orderDate: { gte: from, lte: to } }, _sum: { totalAmount: true }, _count: { id: true } });
  console.log(`[APPLY] XONG. Đơn T6 mới: ${after._count.id} | doanh số: ${fmt(after._sum.totalAmount)}`);
  console.log(Math.round(Number(after._sum.totalAmount)) === EXPECTED ? '✅ KHỚP 4.029.151.500đ' : '⚠️ LỆCH — kiểm lại');
}
main().catch((e) => { console.error('\n❌ LỖI:', e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
