/**
 * merge-KH253-into-KH057.ts — gộp KH253 (Ken Phạm - HKD Phạm Cường) vào KH057
 * (Công ty TNHH Sắc Diện Mới). Giữ KH057 (account cũ, nhiều lịch sử), chuyển toàn
 * bộ dữ liệu của KH253 sang KH057, đổi tên, rồi xoá KH253. Có backup trước.
 * Chạy: npx tsx --env-file=.env scripts/merge-KH253-into-KH057.ts
 */
import { prisma } from '../src/shared/database/prisma-client.js';
import { writeFileSync } from 'node:fs';

const ORG = '7dc86328-624d-4e2d-b0b6-bc62b574a95a';
const NEW_NAME = 'HKD Phạm Cường (Công ty TNHH Sắc Diện Mới)';

async function main() {
  const keeper = await prisma.contact.findFirst({ where: { orgId: ORG, customerCode: 'KH057' } });
  const loser = await prisma.contact.findFirst({ where: { orgId: ORG, customerCode: 'KH253' } });
  if (!keeper) throw new Error('Không tìm thấy KH057');
  if (!loser) { console.log('KH253 không còn — có thể đã gộp. Dừng.'); return; }

  // ── BACKUP ──
  const [orders, tasks, convos, appts, care, stages, compliance] = await Promise.all([
    prisma.order.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.task.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.conversation.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.appointment.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.contactCareLog.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.stageHistory.findMany({ where: { contactId: loser.id }, select: { id: true } }),
    prisma.saleComplianceLog.findMany({ where: { contactId: loser.id }, select: { id: true } }),
  ]);
  const moved = {
    orders: orders.map((o) => o.id), tasks: tasks.map((t) => t.id),
    conversations: convos.map((c) => c.id), appointments: appts.map((a) => a.id),
    careLogs: care.map((c) => c.id), stageHistory: stages.map((s) => s.id),
    saleComplianceLogs: compliance.map((c) => c.id),
  };
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `scripts/backup-merge-KH253-into-KH057-${ts}.json`;
  writeFileSync(backupPath, JSON.stringify({ keeper, loser, movedFromLoser: moved },
    (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
  console.log(`✅ Backup: ${backupPath}`);
  console.log(`Chuyển từ KH253 → KH057: orders=${moved.orders.length} tasks=${moved.tasks.length} `
    + `convos=${moved.conversations.length} appts=${moved.appointments.length} `
    + `care=${moved.careLogs.length} stageHist=${moved.stageHistory.length} compliance=${moved.saleComplianceLogs.length}`);

  // Ghi chú giữ SĐT phụ + tên cũ của KH253
  const noteAdd = `[Gộp KH253 ${ts.slice(0,10)}] SĐT phụ: ${loser.phone ?? '—'} (${loser.fullName ?? ''}).`;
  const newNote = keeper.internalNote ? `${keeper.internalNote}\n${noteAdd}` : noteAdd;

  await prisma.$transaction(async (tx: any) => {
    const reassign = { contactId: keeper.id };
    await tx.order.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.task.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.conversation.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.appointment.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.contactCareLog.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.stageHistory.updateMany({ where: { contactId: loser.id }, data: reassign });
    await tx.saleComplianceLog.updateMany({ where: { contactId: loser.id }, data: reassign });

    // cập nhật KH057: tên + ghi chú + lastOrderDate
    const maxOrder = await tx.order.aggregate({ where: { contactId: keeper.id }, _max: { orderDate: true } });
    await tx.contact.update({
      where: { id: keeper.id },
      data: { fullName: NEW_NAME, internalNote: newNote, lastOrderDate: maxOrder._max.orderDate ?? keeper.lastOrderDate },
    });

    // xoá KH253 (giờ đã rỗng FK)
    await tx.contact.delete({ where: { id: loser.id } });
  });

  // ── VERIFY ──
  const after = await prisma.contact.findFirst({ where: { id: keeper.id },
    select: { customerCode: true, fullName: true, phone: true, internalNote: true } });
  const ordCount = await prisma.order.count({ where: { contactId: keeper.id } });
  const rev = await prisma.order.aggregate({ where: { contactId: keeper.id, status: { notIn: ['cancelled'] } }, _sum: { totalAmount: true } });
  const loserGone = await prisma.contact.findFirst({ where: { orgId: ORG, customerCode: 'KH253' } });
  const orphans = await prisma.order.count({ where: { contactId: loser.id } });
  console.log(`\n✅ XONG:`);
  console.log(`  KH057 tên mới: ${after?.fullName}`);
  console.log(`  Đơn: ${ordCount} | Doanh thu: ${Number(rev._sum.totalAmount || 0).toLocaleString('vi-VN')} đ`);
  console.log(`  KH253 còn tồn tại? ${loserGone ? 'CÒN (LỖI)' : 'Đã xoá ✓'}`);
  console.log(`  Đơn mồ côi trỏ KH253 cũ: ${orphans} (mong đợi 0)`);
  console.log(`  Ghi chú: ${after?.internalNote}`);
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
