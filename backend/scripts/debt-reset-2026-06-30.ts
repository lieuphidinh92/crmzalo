/**
 * debt-reset-2026-06-30.ts
 *
 * RESET công nợ khách hàng theo bảng anh Philip chốt 30/06/2026
 * (CHƯA gồm đơn ship COD — bổ sung sau). Tổng đích = 1.851.867.080đ.
 *
 * Việc làm:
 *  1) Xóa sạch nợ cũ: mọi đơn (trừ 'cancelled') có debtAmountValue>0 → set
 *     paidAmount = totalAmountValue (đánh dấu đã thu) + debtAmountValue = 0.
 *     Đồng thời reset Contact.debtAmount = 0 cho toàn org.
 *  2) Nạp 11 "đơn nợ đầu kỳ" (status='opening_balance'):
 *       totalAmount = 0           → KHÔNG vào doanh số (mọi report cộng cột này)
 *       totalAmountValue = số nợ  → màn Công nợ hiển thị "Tổng"
 *       debtAmountValue  = số nợ  → màn Công nợ cộng nợ
 *       KHÔNG có dòng hàng (line item) → không trừ kho. Thu tiền FIFO vẫn chạy
 *       vì debt-routes đã trừ thẳng debtAmountValue (không recompute).
 *     Đồng thời set Contact.debtAmount = số nợ cho 11 khách này.
 *
 * AN TOÀN:
 *  - DRY_RUN mặc định (không set DRY_RUN=0): chỉ IN kế hoạch, KHÔNG ghi gì.
 *  - Khớp khách theo SỐ ĐIỆN THOẠI (unique per org), fallback mã KH.
 *  - Apply sẽ DỪNG nếu: có khách chưa khớp, hoặc đã tồn tại đơn opening_balance
 *    (chống chạy 2 lần nhân đôi), hoặc tổng 11 dòng != 1.851.867.080.
 *  - Backup trạng thái cũ ra scripts/backup-debt-reset-<ts>.json + in stdout.
 *
 * CHẠY:
 *   Local:  npx tsx --env-file=.env scripts/debt-reset-2026-06-30.ts            # dry-run
 *           DRY_RUN=0 npx tsx --env-file=.env scripts/debt-reset-2026-06-30.ts  # ghi thật
 *   Render Shell (prod, DATABASE_URL có sẵn trong env):
 *           npx tsx scripts/debt-reset-2026-06-30.ts                            # dry-run
 *           DRY_RUN=0 npx tsx scripts/debt-reset-2026-06-30.ts                  # ghi thật
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { writeFileSync } from 'node:fs';

const DRY = process.env.DRY_RUN !== '0';
const AS_OF = new Date(); // ngày chốt = lúc chạy script

type Target = { name: string; phone: string; amount: number; code?: string };

// Bảng "CÔNG NỢ KHÁCH HÀNG" — Philip 30/06/2026 (chưa gồm COD).
const TARGETS: Target[] = [
  { name: 'Chị Đỗ Tuyền', phone: '0963548858', amount: 306_688_080 },
  { name: 'Công ty TNHH TMT Global', phone: '0968981893', amount: 74_948_000 },
  { name: 'Chị Quyên', phone: '0815220099', amount: 130_350_000 },
  { name: 'CÔNG TY CỔ PHẦN THƯƠNG MẠI QUỐC TẾ LB GLOBAL', phone: '0966831395', amount: 286_725_000 },
  { name: 'CÔNG TY CỔ PHẦN THẾ THẢO PHARMA', phone: '0373825115', amount: 27_636_000 },
  { name: 'Di Di (CÔNG TY TNHH THƯƠNG MẠI DDI AESTHETIC)', phone: '0907586210', amount: 17_760_000 },
  { name: 'CÔNG TY TNHH CHU PHƯƠNG LINH', phone: '0789342000', amount: 26_500_000 },
  { name: 'Chị Hiền Nguyễn', phone: '0971299996', amount: 9_300_000 },
  { name: 'CÔNG TY CỔ PHẦN PHARMADI', phone: '0973928734', amount: 199_905_000, code: 'KH00012' },
  { name: 'CÔNG TY TNHH THƯƠNG MẠI KTDV (Thanh Huế)', phone: '0966886241', amount: 518_090_000, code: 'KH00084' },
  { name: 'CÔNG TY TNHH DƯỢC MỸ PHẨM TMOON AUTHENTIC (Thảo Moon)', phone: '0902113027', amount: 253_965_000, code: 'KH000044' },
];
const EXPECTED_TOTAL = 1_851_867_080;

const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN') + 'đ';
const num = (d: unknown) => (d == null ? 0 : Number(d));

// Lõi số điện thoại để so khớp: bỏ ký tự lạ, bỏ 84/0 ở đầu, lấy phần còn lại.
function phoneCore(p: string | null | undefined): string {
  if (!p) return '';
  let d = String(p).replace(/\D/g, '');
  if (d.startsWith('84')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

async function main() {
  console.log(`\n=== DEBT RESET 30/06/2026 — ${DRY ? 'DRY-RUN (chỉ đọc)' : '⚠️  GHI THẬT (DRY_RUN=0)'} ===\n`);

  // Kiểm tổng bảng.
  const sumTargets = TARGETS.reduce((s, t) => s + t.amount, 0);
  if (sumTargets !== EXPECTED_TOTAL) {
    throw new Error(`Tổng 11 dòng = ${vnd(sumTargets)} != đích ${vnd(EXPECTED_TOTAL)} — KIỂM LẠI BẢNG`);
  }
  console.log(`Tổng đích 11 khách: ${vnd(sumTargets)} ✓\n`);

  // Khớp khách theo phone (fallback customerCode). Tải contacts đủ field.
  const contacts = await prisma.contact.findMany({
    select: { id: true, orgId: true, fullName: true, phone: true, customerCode: true, assignedUserId: true, debtAmount: true },
  });
  const byCore = new Map<string, typeof contacts[number]>();
  for (const c of contacts) {
    const core = phoneCore(c.phone);
    if (core) byCore.set(core, c);
  }
  const byCode = new Map<string, typeof contacts[number]>();
  for (const c of contacts) if (c.customerCode) byCode.set(c.customerCode, c);

  const matched: Array<{ t: Target; c: typeof contacts[number] }> = [];
  const unmatched: Target[] = [];
  for (const t of TARGETS) {
    let c = byCore.get(phoneCore(t.phone));
    if (!c && t.code) c = byCode.get(t.code);
    if (c) matched.push({ t, c });
    else unmatched.push(t);
  }

  // Xác định org (tất cả khách khớp phải cùng 1 org).
  const orgs = new Set(matched.map((m) => m.c.orgId));
  if (orgs.size > 1) throw new Error(`Khách khớp nằm ở ${orgs.size} org khác nhau — DỪNG`);
  const orgId = matched[0]?.c.orgId;
  if (!orgId) throw new Error('Không khớp được khách nào — DỪNG');

  const owner = await prisma.user.findFirst({
    where: { orgId, role: { in: ['owner', 'admin'] } },
    select: { id: true, fullName: true },
    orderBy: { role: 'asc' },
  });
  if (!owner) throw new Error('Không tìm thấy user owner/admin trong org — DỪNG');

  // Công nợ hệ thống hiện tại.
  const debtOrders = await prisma.order.findMany({
    where: { orgId, status: { not: 'cancelled' }, debtAmountValue: { gt: 0 } },
    select: { id: true, orderCode: true, contactId: true, status: true, paidAmount: true, debtAmountValue: true, totalAmount: true, totalAmountValue: true },
  });
  const currentTotal = debtOrders.reduce((s, o) => s + num(o.debtAmountValue), 0);

  console.log(`Org: ${orgId}`);
  console.log(`Người tạo đơn (owner/admin): ${owner.fullName}\n`);
  console.log(`── Công nợ hệ thống HIỆN TẠI: ${vnd(currentTotal)} trên ${debtOrders.length} đơn ──\n`);

  console.log(`── Khớp khách (${matched.length}/${TARGETS.length}) ──`);
  for (const { t, c } of matched) {
    const curDebt = debtOrders.filter((o) => o.contactId === c.id).reduce((s, o) => s + num(o.debtAmountValue), 0);
    console.log(`  ✓ ${t.name}\n      → DB: ${c.fullName} (${c.customerCode ?? 'no-code'}, ${c.phone}) | nợ cũ ${vnd(curDebt)} → MỚI ${vnd(t.amount)}`);
  }
  if (unmatched.length) {
    console.log(`\n── ⚠️  CHƯA KHỚP (${unmatched.length}) — cần xử lý trước khi apply ──`);
    for (const t of unmatched) console.log(`  ✗ ${t.name} | SĐT ${t.phone}${t.code ? ' | ' + t.code : ''}`);
  }

  // Existing opening_balance? (chống chạy 2 lần)
  const existingOB = await prisma.order.count({ where: { orgId, status: 'opening_balance' } });

  console.log('\n── KẾ HOẠCH ──');
  console.log(`  • Zero nợ ${debtOrders.length} đơn cũ (paidAmount=totalAmountValue, debt=0)`);
  console.log(`  • Reset Contact.debtAmount=0 toàn org, set lại cho ${matched.length} khách`);
  console.log(`  • Tạo ${matched.length} đơn opening_balance (mã NDK-...), tổng nợ ${vnd(matched.reduce((s, m) => s + m.t.amount, 0))}`);
  console.log(`  • Đơn opening_balance đang tồn tại: ${existingOB}`);

  // Backup.
  const backup = {
    at: AS_OF.toISOString(),
    orgId,
    debtOrders: debtOrders.map((o) => ({
      id: o.id, orderCode: o.orderCode, contactId: o.contactId, status: o.status,
      paidAmount: num(o.paidAmount), debtAmountValue: num(o.debtAmountValue),
      totalAmount: num(o.totalAmount), totalAmountValue: num(o.totalAmountValue),
    })),
    contactsDebt: contacts.filter((c) => c.orgId === orgId && num(c.debtAmount) !== 0)
      .map((c) => ({ id: c.id, debtAmount: num(c.debtAmount) })),
  };
  const ts = AS_OF.toISOString().replace(/[:.]/g, '-');
  const backupPath = `scripts/backup-debt-reset-${ts}.json`;

  if (DRY) {
    console.log(`\n[DRY-RUN] Sẽ backup ra ${backupPath} (chưa ghi). Không sửa gì.`);
    console.log('[DRY-RUN] Để ghi thật: chạy lại với DRY_RUN=0.\n');
    console.log('=== BACKUP PREVIEW (sẽ lưu khi apply) ===');
    console.log(JSON.stringify(backup, null, 2).slice(0, 1500) + '\n... (rút gọn)\n');
    return;
  }

  // ── APPLY ──
  if (unmatched.length) throw new Error(`Còn ${unmatched.length} khách chưa khớp — DỪNG, không apply.`);
  if (existingOB > 0) throw new Error(`Đã có ${existingOB} đơn opening_balance — có vẻ đã chạy rồi. DỪNG để tránh nhân đôi.`);

  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\n[APPLY] Đã backup → ${backupPath}`);
  console.log('=== BACKUP JSON (copy lại phòng hờ) ===');
  console.log(JSON.stringify(backup));
  console.log('=== HẾT BACKUP ===\n');

  await prisma.$transaction(async (tx) => {
    // 1) Zero nợ cũ.
    for (const o of debtOrders) {
      const total = num(o.totalAmountValue) || num(o.totalAmount);
      await tx.order.update({
        where: { id: o.id },
        data: { paidAmount: total, debtAmountValue: 0 },
      });
    }
    // 2) Reset Contact.debtAmount toàn org.
    await tx.contact.updateMany({ where: { orgId }, data: { debtAmount: 0 } });

    // 3) Tạo 11 đơn opening_balance + set debtAmount khách.
    let seq = 0;
    const ym = `${AS_OF.getFullYear()}${String(AS_OF.getMonth() + 1).padStart(2, '0')}`;
    for (const { t, c } of matched) {
      seq += 1;
      const orderCode = `NDK-${ym}-${String(seq).padStart(2, '0')}`;
      await tx.order.create({
        data: {
          orgId,
          contactId: c.id,
          createdByUserId: owner.id,
          assignedSaleId: c.assignedUserId ?? null,
          orderCode,
          status: 'opening_balance',
          orderDate: AS_OF,
          paymentMethod: 'credit',
          subtotalAmount: t.amount,
          totalAmountValue: t.amount,
          totalAmount: 0, // legacy Float — giữ 0 để KHÔNG vào doanh số
          paidAmount: 0,
          debtAmountValue: t.amount,
          internalNote: 'Nợ đầu kỳ (chốt 30/06/2026, script debt-reset) — chưa gồm COD',
        },
      });
      await tx.contact.update({ where: { id: c.id }, data: { debtAmount: t.amount } });
    }
  }, { timeout: 120_000, maxWait: 20_000 });

  // Kiểm sau apply.
  const after = await prisma.order.aggregate({
    where: { orgId, status: { not: 'cancelled' }, debtAmountValue: { gt: 0 } },
    _sum: { debtAmountValue: true }, _count: { id: true },
  });
  const afterTotal = num(after._sum.debtAmountValue);
  console.log(`[APPLY] XONG. Công nợ hệ thống sau reset: ${vnd(afterTotal)} trên ${after._count.id} đơn.`);
  console.log(afterTotal === EXPECTED_TOTAL ? '✅ KHỚP đích 1.851.867.080đ' : `⚠️  LỆCH đích ${vnd(EXPECTED_TOTAL)} — kiểm lại!`);
}

main()
  .catch((e) => { console.error('\n❌ LỖI:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
