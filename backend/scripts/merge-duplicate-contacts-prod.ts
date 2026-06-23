/**
 * PROD merge — 15 nhóm trùng SĐT theo quyết định anh Philip (PROD migration).
 *
 * 14 nhóm khớp với local đã merge (chỉ khác customer_code do thứ tự
 * createdAt prod khác local 1-2 vị trí). 1 nhóm mới #16 KH222+KH223
 * Rio Kiều Dung / Rio Thanh — anh chốt MERGE.
 *
 * 1 ngoại lệ (nhóm #9): KH117+KH239 (Hải Yến / Hoàng Thị Yến) — anh chốt
 * "2 KH khác" → clear phone KH239.
 *
 * Usage:
 *   npx tsx --env-file=.env.prod.local scripts/merge-duplicate-contacts-prod.ts
 *   npx tsx --env-file=.env.prod.local scripts/merge-duplicate-contacts-prod.ts --apply
 */

import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
if (conn.includes('localhost')) throw new Error('Refuse to run on localhost — PROD script');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const MERGE_GROUPS: Array<{ keep: string; merge: string; note: string }> = [
  { keep: 'KH008', merge: 'KH246', note: 'An Trần Authentic' },
  { keep: 'KH018', merge: 'KH248', note: 'Chị Thái Oanh' },
  { keep: 'KH030', merge: 'KH232', note: 'Chị Quyên / C Quyên Minh Khai' },
  { keep: 'KH037', merge: 'KH220', note: 'Chị Kim Ngân' },
  { keep: 'KH039', merge: 'KH224', note: 'Shop Mẹ Kẹo' },
  { keep: 'KH057', merge: 'KH228', note: 'Sắc Diện Mới / Ken Phạm' },
  { keep: 'KH081', merge: 'KH199', note: 'Chị Tuyết Nguyễn / Chị Nguyễn Tuyết' },
  { keep: 'KH094', merge: 'KH253', note: 'Chị Nhật Hà' },
  { keep: 'KH132', merge: 'KH244', note: 'Nhà Thuốc Quý Nga' },
  { keep: 'KH133', merge: 'KH254', note: 'Anh Khương / NGUYỄN ĐỨC KHƯƠNG' },
  { keep: 'KH143', merge: 'KH245', note: 'PML Quầy Thuốc Hoa Minh' },
  { keep: 'KH164', merge: 'KH242', note: 'Cô Ba Dược' },
  { keep: 'KH195', merge: 'KH247', note: 'Chị Thảo Moon' },
  { keep: 'KH204', merge: 'KH205', note: 'Nhà Thuốc Sông Đà (cùng chủ)' },
  { keep: 'KH222', merge: 'KH223', note: 'Rio Kiều Dung / Rio Thanh — PROD only' },
];

const CLEAR_PHONE_CODES: string[] = ['KH239'];

type ContactRow = {
  id: string;
  customerCode: string | null;
  fullName: string | null;
  phone: string | null;
};

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (ghi DB)' : 'DRY-RUN (không ghi DB)'}`);
  console.log(`Merge groups: ${MERGE_GROUPS.length}`);
  console.log(`Clear phone: ${CLEAR_PHONE_CODES.join(', ')}\n`);

  const allCodes = Array.from(
    new Set([
      ...MERGE_GROUPS.flatMap(g => [g.keep, g.merge]),
      ...CLEAR_PHONE_CODES,
    ]),
  );
  const contacts = await prisma.contact.findMany({
    where: { customerCode: { in: allCodes } },
    select: { id: true, customerCode: true, fullName: true, phone: true },
  });
  const byCode = new Map<string, ContactRow>(
    contacts.map((c: ContactRow) => [c.customerCode!, c]),
  );

  let preflightOk = true;
  for (const g of MERGE_GROUPS) {
    const a = byCode.get(g.keep);
    const b = byCode.get(g.merge);
    if (!a) { console.error(`❌ ${g.keep} không tồn tại (giữ).`); preflightOk = false; continue; }
    if (!b) { console.log(`ℹ️  ${g.merge} đã không tồn tại — skip (idempotent).`); continue; }
    if (a.phone !== b.phone) {
      console.error(`❌ ${g.keep}/${g.merge}: SĐT raw khác nhau ("${a.phone}" vs "${b.phone}") — chặn merge.`);
      preflightOk = false;
    }
  }
  if (!preflightOk) {
    console.error('\nPre-flight FAIL. Sửa data rồi chạy lại.');
    await prisma.$disconnect();
    process.exit(2);
  }

  const groupStats: Array<{
    keep: string; merge: string; note: string;
    counts: Record<string, number>;
    skipped?: boolean;
  }> = [];

  for (const g of MERGE_GROUPS) {
    const keep = byCode.get(g.keep)!;
    const merge = byCode.get(g.merge);
    if (!merge) { groupStats.push({ ...g, counts: {}, skipped: true }); continue; }

    const [orders, appts, convs, tasks, stages, comply] = await Promise.all([
      prisma.order.count({ where: { contactId: merge.id } }),
      prisma.appointment.count({ where: { contactId: merge.id } }),
      prisma.conversation.count({ where: { contactId: merge.id } }),
      prisma.task.count({ where: { contactId: merge.id } }),
      prisma.stageHistory.count({ where: { contactId: merge.id } }),
      prisma.saleComplianceLog.count({ where: { contactId: merge.id } }),
    ]);
    const counts = { orders, appts, convs, tasks, stages, comply };
    groupStats.push({ ...g, counts });

    console.log(
      `[${g.keep}] ← [${g.merge}] (${g.note})  ` +
        `orders=${orders} appts=${appts} convs=${convs} tasks=${tasks} stages=${stages} comply=${comply}`,
    );

    if (!APPLY) continue;

    await prisma.$transaction(
      async (tx: any) => {
        if (orders) await tx.order.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        if (appts) await tx.appointment.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        if (convs) await tx.conversation.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        if (tasks) await tx.task.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        if (stages) await tx.stageHistory.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        if (comply) await tx.saleComplianceLog.updateMany({ where: { contactId: merge.id }, data: { contactId: keep.id } });
        await tx.contact.delete({ where: { id: merge.id } });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  for (const code of CLEAR_PHONE_CODES) {
    const c = byCode.get(code);
    if (!c) continue;
    console.log(`\nClear phone: ${code} "${c.fullName}" (raw=${c.phone})`);
    if (APPLY) {
      await prisma.contact.update({ where: { id: c.id }, data: { phone: null } });
    }
  }

  const totals = groupStats.reduce(
    (acc, g) => {
      if (g.skipped) { acc.skipped++; return acc; }
      acc.merged++;
      for (const [k, v] of Object.entries(g.counts)) acc.records[k] = (acc.records[k] ?? 0) + (v as number);
      return acc;
    },
    { merged: 0, skipped: 0, records: {} as Record<string, number> },
  );
  console.log('\n=== TỔNG KẾT ===');
  console.log(`Đã merge: ${totals.merged} nhóm (skipped ${totals.skipped})`);
  console.log(`Records chuyển:`, totals.records);
  console.log(`Clear phone: ${CLEAR_PHONE_CODES.length} KH`);

  if (!APPLY) {
    console.log('\nDRY-RUN xong. Chạy lại với --apply để ghi DB.');
  } else {
    console.log('\nĐã apply. Tiếp theo: normalize phone --apply + push unique constraint.');
  }

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
