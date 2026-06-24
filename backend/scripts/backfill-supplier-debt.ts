/**
 * Backfill Công nợ NCC cho các đơn nhập đã confirm TRƯỚC khi có tính năng.
 *
 * Quy tắc (anh Philip cấp danh sách đã trả):
 *   - Mặc định: đơn confirm có NCC → coi CHƯA trả → debt = tổng tiền,
 *     hạn TT = ngày nhập + paymentTermDays của NCC.
 *   - Đơn nằm trong PAID_IMPORT_CODES → coi ĐÃ trả đủ: tạo 1 bản ghi
 *     SupplierPayment "đối soát đầu kỳ" = tổng tiền (để syncImportOrderDebt
 *     sau này vẫn ra đúng), debt = 0, status = paid.
 *   - Đơn không có NCC → bỏ qua (không thể theo dõi/đòi nợ).
 *
 * Idempotent: paid tính lại từ SupplierPayment nên chạy nhiều lần an toàn
 * (đơn đã có bản ghi đối soát sẽ không bị nhân đôi vì check theo note).
 *
 *   # xem trước (không ghi):
 *   npx tsx --env-file=.env scripts/backfill-supplier-debt.ts
 *   # ghi, kèm danh sách đã trả:
 *   PAID_IMPORT_CODES="NK-202605-001,NK-202605-003" \
 *     npx tsx --env-file=.env scripts/backfill-supplier-debt.ts --apply
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL chưa được set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const APPLY = process.argv.includes('--apply');
const PAID_CODES = new Set(
  (process.env.PAID_IMPORT_CODES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const RECON_NOTE = 'Đối soát đầu kỳ (Philip xác nhận đã trả)';

const toNum = (v: unknown): number => (v == null ? 0 : Number(v));

async function main(): Promise<void> {
  const orders = await prisma.importOrder.findMany({
    where: { status: 'confirmed', supplierId: { not: null } },
    orderBy: { importDate: 'asc' },
    select: {
      id: true,
      orgId: true,
      importCode: true,
      importDate: true,
      totalAmount: true,
      supplierId: true,
      supplier: { select: { paymentTermDays: true } },
    },
  });

  let owe = 0;
  let cleared = 0;
  for (const o of orders) {
    const total = toNum(o.totalAmount);

    // Existing recorded payments (real or prior reconciliation).
    const agg = await prisma.supplierPayment.aggregate({
      where: { importOrderId: o.id },
      _sum: { amount: true },
    });
    let paid = toNum(agg._sum.amount);

    const markPaid = PAID_CODES.has(o.importCode);
    if (markPaid && paid === 0) {
      // Create a reconciliation payment so the running balance stays correct.
      if (APPLY) {
        await prisma.supplierPayment.create({
          data: {
            orgId: o.orgId,
            importOrderId: o.id,
            supplierId: o.supplierId!,
            amount: total,
            paymentMethod: 'other',
            paymentDate: o.importDate ?? new Date(),
            note: RECON_NOTE,
            createdById: null,
          },
        });
      }
      paid = total;
    }

    const debt = Math.max(0, total - paid);
    const status = debt <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const term = o.supplier?.paymentTermDays ?? 30;
    const due = o.importDate ? new Date(o.importDate) : new Date();
    due.setDate(due.getDate() + term);

    if (APPLY) {
      await prisma.importOrder.update({
        where: { id: o.id },
        data: { debtAmount: debt, paidAmount: paid, paymentStatus: status, paymentDueDate: due },
      });
    }

    console.log(
      `${APPLY ? '[APPLY]' : '[DRY] '} ${o.importCode}: tổng=${total.toLocaleString('vi-VN')} ` +
        `đã trả=${paid.toLocaleString('vi-VN')} nợ=${debt.toLocaleString('vi-VN')} ` +
        `[${status}] hạn=${due.toISOString().slice(0, 10)}${markPaid ? ' (Philip: đã trả)' : ''}`,
    );
    debt > 0 ? owe++ : cleared++;
  }

  console.log(
    `\nTổng ${orders.length} đơn confirm có NCC → còn nợ: ${owe}, đã tất toán: ${cleared}.`,
  );
  if (!APPLY) {
    console.log(
      'DRY-RUN — chưa ghi gì. Thêm --apply để ghi. Đặt PAID_IMPORT_CODES="NK-...,NK-..." cho đơn đã trả.',
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('Backfill thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
