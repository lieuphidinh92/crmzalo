/**
 * gom-don-sang-dang-giao-2026-07-15.ts
 *
 * One-off (dọn quá khứ, chạy 1 lần): gom mọi đơn đang kẹt ở
 *   "Chờ xác nhận" (status=draft) + "Đã xác nhận" (status=confirmed)
 * sang "Đang giao" (status=shipping).
 *
 * Bối cảnh: mấy đơn này HÀNG ĐÃ GIAO cho khách thật từ trước, anh vừa kiểm kê
 * kho xong (tồn hiện tại = đúng thực tế). Vì vậy KHÔNG trừ kho lần nữa (trừ nữa
 * là double-count → thiếu kho). Chỉ đổi trạng thái + đóng dấu mốc thời gian.
 *
 * KHÔNG đụng:
 *  - Tồn kho / lô (inventory_batches) — hàng đã ra khỏi kho thật, kiểm kê đã chốt.
 *  - Giá vốn / lãi (unitCost/lineCost/profit) — đã stamp sẵn lúc tạo đơn.
 *  - Công nợ (paidAmount/debtAmountValue) — độc lập, giữ nguyên.
 *  - Cờ legacyCost — GIỮ false. Nhờ vậy nếu sau này lỡ huỷ đơn, reverseFIFO là
 *    no-op (đơn không có bản ghi order_item_batches) → không phồng kho.
 *
 * An toàn:
 *  - DRY_RUN=1 (mặc định): chỉ LIỆT KÊ đơn sẽ đụng + kế hoạch, KHÔNG ghi.
 *  - DRY_RUN=0: backup trạng thái cũ ra scripts/backup-gom-dang-giao-<ts>.json
 *    rồi mới ghi (trong 1 transaction).
 *  - BEFORE=YYYY-MM-DD (tuỳ chọn): chỉ gom đơn có orderDate TRƯỚC ngày này —
 *    dùng để loại các đơn MỚI hợp lệ đang chờ xử lý bình thường. Rất khuyến nghị
 *    xem list dry-run trước, nếu có đơn mới lẫn vào thì đặt BEFORE để giới hạn.
 *  - Bỏ qua (không gom) đơn 0 sản phẩm — không phải đơn giao thật.
 *
 * Chạy (LOCAL):
 *   npx tsx --env-file=.env scripts/gom-don-sang-dang-giao-2026-07-15.ts            # dry-run
 *   DRY_RUN=0 npx tsx --env-file=.env scripts/gom-don-sang-dang-giao-2026-07-15.ts  # ghi thật
 * Chạy (PROD Supabase):
 *   DATABASE_URL='<pooler url>' npx tsx scripts/gom-don-sang-dang-giao-2026-07-15.ts            # dry-run
 *   DRY_RUN=0 DATABASE_URL='<pooler url>' npx tsx scripts/gom-don-sang-dang-giao-2026-07-15.ts  # ghi thật
 *   # giới hạn theo ngày:   BEFORE=2026-07-01 DATABASE_URL='...' npx tsx scripts/...
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { writeFileSync } from 'node:fs';

const DRY = process.env.DRY_RUN !== '0';
const SOURCE_STATUSES = ['draft', 'confirmed'] as const;
const TARGET_STATUS = 'shipping';

// BEFORE=YYYY-MM-DD → chỉ gom đơn orderDate < mốc này (giờ VN, đầu ngày).
function parseBefore(): Date | null {
  const raw = process.env.BEFORE?.trim();
  if (!raw) return null;
  // Diễn giải là 00:00 giờ VN (UTC+7) để không lệch ngày.
  const d = new Date(`${raw}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`BEFORE không hợp lệ: "${raw}" (định dạng YYYY-MM-DD)`);
  }
  return d;
}

function vnd(x: unknown): string {
  const n = Number(x ?? 0);
  return n.toLocaleString('en-US') + 'đ';
}

async function resolveOrgId(): Promise<string> {
  if (process.env.ORG_ID?.trim()) return process.env.ORG_ID.trim();
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  if (orgs.length === 0) throw new Error('Không có Organization nào trong DB.');
  if (orgs.length > 1) {
    const list = orgs.map((o) => `  - ${o.id}  (${o.name})`).join('\n');
    throw new Error(
      `Có ${orgs.length} organization. Đặt ORG_ID=<id> để chỉ định org cần gom:\n${list}`,
    );
  }
  return orgs[0].id;
}

async function main() {
  const before = parseBefore();
  const orgId = await resolveOrgId();

  const where: any = { orgId, status: { in: [...SOURCE_STATUSES] } };
  if (before) where.orderDate = { lt: before };

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      orderCode: true,
      status: true,
      orderDate: true,
      createdAt: true,
      confirmedAt: true,
      packedAt: true,
      shippedAt: true,
      totalAmount: true,
      totalAmountValue: true,
      paidAmount: true,
      debtAmountValue: true,
      contact: { select: { fullName: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
  });

  const empty = orders.filter((o) => o._count.items === 0);
  const eligible = orders.filter((o) => o._count.items > 0);

  console.log('════════════════════════════════════════════════════════════');
  console.log(`  GOM ĐƠN → "ĐANG GIAO"  ${DRY ? '(DRY-RUN — không ghi)' : '(GHI THẬT)'}`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Org:            ${orgId}`);
  console.log(`Nguồn:          ${SOURCE_STATUSES.join(' + ')}  →  ${TARGET_STATUS}`);
  console.log(`Giới hạn ngày:  ${before ? `orderDate < ${process.env.BEFORE}` : 'KHÔNG (toàn bộ)'}`);
  console.log(`Tìm thấy:       ${orders.length} đơn  (gom ${eligible.length}, bỏ qua ${empty.length} đơn rỗng)`);
  console.log('────────────────────────────────────────────────────────────');

  const nDraft = eligible.filter((o) => o.status === 'draft').length;
  const nConfirmed = eligible.filter((o) => o.status === 'confirmed').length;
  console.log(`  Chờ xác nhận (draft):   ${nDraft}`);
  console.log(`  Đã xác nhận (confirmed):${nConfirmed}`);
  console.log('────────────────────────────────────────────────────────────');

  for (const o of eligible) {
    const date = o.orderDate ?? o.createdAt;
    const dstr = date ? date.toISOString().slice(0, 10) : '??';
    const total = o.totalAmountValue ?? o.totalAmount;
    const flag = o.status === 'draft' ? ' ⚠draft-kiểm-tra-kỹ' : '';
    console.log(
      `  ${o.orderCode.padEnd(16)} ${o.status.padEnd(10)} ${dstr}  ` +
        `${String(o._count.items).padStart(2)}sp  ${vnd(total).padStart(14)}  ` +
        `nợ ${vnd(o.debtAmountValue)}  ${o.contact?.fullName ?? '(không tên)'}${flag}`,
    );
  }

  if (empty.length > 0) {
    console.log('────────────────────────────────────────────────────────────');
    console.log(`  BỎ QUA ${empty.length} đơn rỗng (0 sản phẩm):`);
    for (const o of empty) console.log(`    - ${o.orderCode} (${o.status})`);
  }

  if (eligible.length === 0) {
    console.log('\nKhông có đơn nào để gom. Kết thúc.');
    return;
  }

  if (DRY) {
    console.log('\n── DRY-RUN: chưa ghi gì. Xem kỹ danh sách trên. ──');
    console.log('Chạy thật:  DRY_RUN=0 ' + (process.env.BEFORE ? `BEFORE=${process.env.BEFORE} ` : '') + 'npx tsx --env-file=.env scripts/gom-don-sang-dang-giao-2026-07-15.ts');
    return;
  }

  // ── GHI THẬT ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `scripts/backup-gom-dang-giao-${ts}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify(
      eligible.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        status: o.status,
        confirmedAt: o.confirmedAt,
        packedAt: o.packedAt,
        shippedAt: o.shippedAt,
      })),
      null,
      2,
    ),
  );
  console.log(`\nĐã backup trạng thái cũ → ${backupPath}`);

  let done = 0;
  await prisma.$transaction(async (tx: any) => {
    for (const o of eligible) {
      // Đóng dấu mốc pipeline theo orderDate (truthful hơn "now"); chỉ điền
      // các mốc còn trống, không đè mốc đã có. Không đụng kho/giá vốn/công nợ.
      const stamp = o.orderDate ?? o.createdAt ?? new Date();
      await tx.order.update({
        where: { id: o.id },
        data: {
          status: TARGET_STATUS,
          confirmedAt: o.confirmedAt ?? stamp,
          packedAt: o.packedAt ?? stamp,
          shippedAt: o.shippedAt ?? stamp,
        },
      });
      done++;
    }
  });

  console.log(`✅ Đã gom ${done} đơn sang "${TARGET_STATUS}". Không đụng kho/giá vốn/công nợ.`);
  console.log(`   Khôi phục nếu cần: dùng file ${backupPath}.`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
