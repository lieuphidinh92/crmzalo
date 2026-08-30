/**
 * Sale Lite app — CÔNG NỢ (receivables).
 *
 * Sale (member) chỉ XEM để đi đòi nợ. Ghi nhận thu tiền là quyền owner/admin
 * (kế toán): nhập 1 số tiền → tự gạt FIFO vào các đơn nợ cũ nhất, append-only,
 * đảo bút toán được (không xoá cứng).
 *
 *  GET  /api/v1/sale-app/debt/customers              → đại lý đang nợ (quá hạn lên đầu)
 *  GET  /api/v1/sale-app/debt/customers/:id/orders   → các đơn còn nợ của 1 KH
 *  POST /api/v1/sale-app/debt/payments               → ghi thu nợ (FIFO) [owner/admin]
 *  POST /api/v1/sale-app/debt/payments/:id/reverse   → đảo bút toán      [owner/admin]
 *  GET  /api/v1/sale-app/debt/customers/:id/payments → lịch sử thu nợ
 *  GET  /api/v1/sale-app/debt/customers/:id/ledger   → sổ chi tiết công nợ (Nợ/Có + số dư luỹ kế)
 *  GET  /api/v1/sale-app/debt/update-log             → lịch sử KẾ TOÁN nhập liệu [owner/admin]
 *  POST /api/v1/sale-app/uploads/proof               → upload ảnh chứng từ [owner/admin]
 *
 * Scope: member sees debt on orders they're assigned to / created
 * (assignedSaleId OR createdByUserId — mirrors /debt-summary). Owner/admin
 * see the whole org. Money is returned as integer đồng VND. Responses are
 * bare objects/arrays (no {success,data} envelope). Errors: status + {error}.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  toNumber,
  reqUser,
  effectiveDebtDueDate,
  debtDaysOverdue,
} from '../orders/order-service.js';
import { requireRole } from '../auth/role-middleware.js';
import { uploadToStorage, extForMime } from '../../shared/storage/supabase-storage.js';

// Chứng từ thanh toán được lưu trong cột proof_url dạng:
//   - bản ghi cũ: 1 URL thuần ("https://...")
//   - bản ghi mới (nhiều chứng từ): chuỗi JSON mảng ("[\"https://a\",\"https://b\"]")
// parseProofUrls chuẩn hoá về mảng URL để trả cho FE; serializeProofUrls đóng gói khi ghi.
function parseProofUrls(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
    } catch {
      return [s];
    }
  }
  return [s];
}
function serializeProofUrls(urls: string[]): string | null {
  const clean = urls.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim());
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

// Orders that still owe money and aren't cancelled.
function debtOrderWhere(user: { id: string; orgId: string; role: string }) {
  const where: any = {
    orgId: user.orgId,
    debtAmountValue: { gt: 0 },
    status: { notIn: ['cancelled', 'returned'] },
  };
  if (user.role === 'member') {
    where.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
  }
  return where;
}

export async function debtRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/sale-app/debt/customers ───────────────────────────────
  // Danh sách đại lý còn công nợ. Mỗi KH gộp từ các đơn còn nợ:
  //   debt           = SUM(debt_amount_value)
  //   overdue_debt   = SUM nợ của đơn quá hạn (debt_due_date < hôm nay)
  //   overdue_orders = số đơn quá hạn
  //   earliest_due   = hạn gần nhất trong các đơn còn nợ
  // Sắp xếp: KH có đơn quá hạn lên đầu, rồi theo hạn gần nhất, rồi nợ nhiều.
  app.get('/api/v1/sale-app/debt/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const orderWhere = debtOrderWhere(user);
      const now = new Date();

      // Pull every outstanding order in scope; aggregate per contact in code
      // so we can compute earliest-due + overdue split in one pass. Debt rows
      // are a small slice of all orders, so this stays cheap.
      const orders = await prisma.order.findMany({
        where: orderWhere,
        select: {
          contactId: true,
          debtAmountValue: true,
          debtDueDate: true,
          orderDate: true,
          createdAt: true,
          contact: { select: { creditTermDays: true } },
        },
      });

      if (orders.length === 0) return { customers: [] };

      type Agg = {
        debt: number;
        overdue_debt: number;
        order_count: number;
        overdue_orders: number;
        earliest_due: Date | null;
        earliest_overdue_due: Date | null;
      };
      const byContact = new Map<string, Agg>();

      for (const o of orders) {
        if (!o.contactId) continue;
        const debt = toNumber(o.debtAmountValue);
        const due = effectiveDebtDueDate({
          orderDate: o.orderDate,
          createdAt: o.createdAt,
          debtDueDate: o.debtDueDate,
          creditTermDays: o.contact.creditTermDays,
        });
        const isOverdue = debtDaysOverdue(due, now) > 0;
        let a = byContact.get(o.contactId);
        if (!a) {
          a = {
            debt: 0,
            overdue_debt: 0,
            order_count: 0,
            overdue_orders: 0,
            earliest_due: null,
            earliest_overdue_due: null,
          };
          byContact.set(o.contactId, a);
        }
        a.debt += debt;
        a.order_count += 1;
        if (due && (!a.earliest_due || due < a.earliest_due)) a.earliest_due = due;
        if (isOverdue) {
          a.overdue_debt += debt;
          a.overdue_orders += 1;
          if (due && (!a.earliest_overdue_due || due < a.earliest_overdue_due)) {
            a.earliest_overdue_due = due;
          }
        }
      }

      const contactIds = Array.from(byContact.keys());
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        select: {
          id: true,
          fullName: true,
          storeName: true,
          phone: true,
          zaloUid: true,
          province: true,
          policyTier: true,
          customerType: true,
          creditTermDays: true,
        },
      });
      const cmap = new Map(contacts.map((c: any) => [c.id, c]));

      const items = contactIds
        .map((id) => {
          const a = byContact.get(id)!;
          const c: any = cmap.get(id);
          if (!c) return null; // contact deleted but order lingers — skip
          return {
            id: c.id,
            full_name: c.fullName,
            store_name: c.storeName,
            phone: c.phone,
            zalo_uid: c.zaloUid,
            province: c.province,
            policy_tier: c.policyTier,
            customer_type: c.customerType,
            credit_term_days: c.creditTermDays,
            debt: a.debt,
            overdue_debt: a.overdue_debt,
            order_count: a.order_count,
            overdue_orders: a.overdue_orders,
            earliest_due_date: a.earliest_due,
            // The due date to surface as the badge: prefer the earliest overdue
            // one, otherwise the earliest upcoming.
            due_date: a.earliest_overdue_due ?? a.earliest_due,
            is_overdue: a.overdue_orders > 0,
          };
        })
        .filter(Boolean) as Array<{
        overdue_orders: number;
        due_date: Date | null;
        debt: number;
      }>;

      // Sort: overdue first → earliest due first → larger debt first.
      items.sort((a, b) => {
        const ao = a.overdue_orders > 0 ? 1 : 0;
        const bo = b.overdue_orders > 0 ? 1 : 0;
        if (ao !== bo) return bo - ao;
        const ad = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return b.debt - a.debt;
      });

      return { customers: items };
    } catch (err) {
      logger.error('[sale-app] debt/customers error:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách công nợ' });
    }
  });

  // ── GET /api/v1/sale-app/debt/customers/:id/orders ────────────────────
  // Các đơn CÒN NỢ của 1 KH (debt_amount_value > 0, chưa huỷ). Member chỉ
  // thấy đơn trong phạm vi của mình. Sắp xếp quá hạn / hạn gần nhất lên đầu.
  app.get(
    '/api/v1/sale-app/debt/customers/:id/orders',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { id } = request.params as { id: string };
        const now = new Date();

        const contact = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: {
            id: true,
            fullName: true,
            storeName: true,
            phone: true,
            zaloUid: true,
            province: true,
            policyTier: true,
            creditTermDays: true,
          },
        });
        if (!contact) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

        const where: any = { ...debtOrderWhere(user), contactId: id };

        const orders = await prisma.order.findMany({
          where,
          select: {
            id: true,
            orderCode: true,
            status: true,
            totalAmount: true,
            totalAmountValue: true,
            paidAmount: true,
            debtAmountValue: true,
            debtDueDate: true,
            orderDate: true,
            createdAt: true,
          },
          // nulls last so dated orders surface first; final order fixed below.
          orderBy: [{ debtDueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        });

        const items = orders.map((o: any) => {
          const due = effectiveDebtDueDate({
            orderDate: o.orderDate,
            createdAt: o.createdAt,
            debtDueDate: o.debtDueDate,
            creditTermDays: contact.creditTermDays,
          });
          const daysOverdue = debtDaysOverdue(due, now);
          const isOverdue = daysOverdue > 0;
          return {
            id: o.id,
            order_code: o.orderCode,
            status: o.status,
            total_amount: toNumber(o.totalAmountValue ?? o.totalAmount),
            paid_amount: toNumber(o.paidAmount),
            debt_amount: toNumber(o.debtAmountValue),
            due_date: due,
            is_overdue: isOverdue,
            days_overdue: daysOverdue,
            order_date: o.orderDate,
            created_at: o.createdAt,
          };
        });
        items.sort((a, b) => {
          if (a.days_overdue !== b.days_overdue) return b.days_overdue - a.days_overdue;
          return new Date(a.order_date ?? a.created_at).getTime()
            - new Date(b.order_date ?? b.created_at).getTime();
        });

        let totalDebt = 0;
        let overdueDebt = 0;
        for (const o of items) {
          totalDebt += o.debt_amount;
          if (o.is_overdue) overdueDebt += o.debt_amount;
        }

        return {
          customer: {
            id: contact.id,
            full_name: contact.fullName,
            store_name: contact.storeName,
            phone: contact.phone,
            zalo_uid: contact.zaloUid,
            province: contact.province,
            policy_tier: contact.policyTier,
            credit_term_days: contact.creditTermDays,
          },
          total_debt: totalDebt,
          overdue_debt: overdueDebt,
          order_count: items.length,
          orders: items,
        };
      } catch (err) {
        logger.error('[sale-app] debt/customers/:id/orders error:', err);
        return reply.status(500).send({ error: 'Lỗi tải đơn công nợ' });
      }
    },
  );

  // ── POST /api/v1/sale-app/debt/payments ─ ghi nhận khách trả nợ (FIFO) ──
  // CHỈ owner/admin (kế toán). Nhập 1 số tiền → tự gạt vào các đơn nợ CŨ NHẤT
  // trước. Chuyển khoản BẮT BUỘC ảnh chứng từ. Append-only + lưu allocations.
  app.post(
    '/api/v1/sale-app/debt/payments',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const body = request.body as {
          contactId?: string; amount?: number; paymentMethod?: string;
          paymentDate?: string; reference?: string; note?: string;
          proofUrl?: string; proofUrls?: string[];
        };
        const amount = Math.round(Number(body.amount) || 0);
        const method = body.paymentMethod || 'bank_transfer';
        // Gộp cả proofUrls (mảng, mới) lẫn proofUrl (chuỗi, tương thích cũ).
        const proofUrls = [
          ...(Array.isArray(body.proofUrls) ? body.proofUrls : []),
          ...(body.proofUrl ? [body.proofUrl] : []),
        ]
          .filter((u) => typeof u === 'string' && u.trim())
          .map((u) => u.trim());
        if (!body.contactId) return reply.status(400).send({ error: 'Thiếu khách hàng' });
        if (amount <= 0) return reply.status(400).send({ error: 'Số tiền phải lớn hơn 0' });
        if (method === 'bank_transfer' && proofUrls.length === 0) {
          return reply.status(400).send({ error: 'Chuyển khoản bắt buộc đính ảnh chứng từ' });
        }

        const contact = await prisma.contact.findFirst({
          where: { id: body.contactId, orgId: user.orgId },
          select: { id: true },
        });
        if (!contact) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

        const result = await prisma.$transaction(async (tx) => {
          // Các đơn còn nợ, CŨ NHẤT trước (FIFO theo ngày đặt).
          const orders = await tx.order.findMany({
            where: {
              orgId: user.orgId, contactId: contact.id,
              debtAmountValue: { gt: 0 }, status: { notIn: ['cancelled', 'returned'] },
            },
            select: { id: true, orderCode: true, debtAmountValue: true, paidAmount: true },
            orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
          });
          const totalDebt = orders.reduce((s, o) => s + toNumber(o.debtAmountValue), 0);
          if (amount > totalDebt) {
            throw Object.assign(
              new Error(`Số tiền ${amount.toLocaleString('vi-VN')}đ vượt tổng nợ hiện tại ${totalDebt.toLocaleString('vi-VN')}đ`),
              { statusCode: 400 },
            );
          }

          let remaining = amount;
          const allocations: { orderId: string; orderCode: string; applied: number }[] = [];
          for (const o of orders) {
            if (remaining <= 0) break;
            const applied = Math.min(remaining, toNumber(o.debtAmountValue));
            if (applied <= 0) continue;
            // Trừ THẲNG vào nợ + cộng đã thu. KHÔNG dùng recomputeOrderTotals:
            // hàm đó tính lại tổng từ DÒNG HÀNG, nên đơn "nợ đầu kỳ" (không có
            // dòng hàng) sẽ bị xóa nợ oan. Với đơn thường, tổng không đổi khi
            // thu tiền nên (debt - applied) == kết quả recompute → an toàn.
            await tx.order.update({
              where: { id: o.id },
              data: {
                paidAmount: toNumber(o.paidAmount) + applied,
                debtAmountValue: Math.max(0, toNumber(o.debtAmountValue) - applied),
              },
            });
            allocations.push({ orderId: o.id, orderCode: o.orderCode, applied });
            remaining -= applied;
          }

          const payment = await tx.customerPayment.create({
            data: {
              orgId: user.orgId, contactId: contact.id, amount,
              paymentMethod: method,
              paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
              reference: body.reference?.trim() || null,
              note: body.note?.trim() || null,
              proofUrl: serializeProofUrls(proofUrls),
              allocations: allocations as any,
              createdById: user.id,
            },
          });
          return { paymentId: payment.id, allocations, remainingDebt: totalDebt - amount };
        });

        return reply.status(201).send({
          payment_id: result.paymentId,
          allocated: result.allocations,
          remaining_debt: result.remainingDebt,
        });
      } catch (err: any) {
        if (err?.statusCode === 400) return reply.status(400).send({ error: err.message });
        logger.error('[sale-app] debt/payments create error:', err);
        return reply.status(500).send({ error: 'Lỗi ghi nhận thanh toán' });
      }
    },
  );

  // ── POST /api/v1/sale-app/debt/payments/:id/reverse ─ đảo bút toán ─────
  // Không xoá cứng: đánh dấu reversedAt + hoàn lại nợ các đơn đã gạt → truy được.
  app.post(
    '/api/v1/sale-app/debt/payments/:id/reverse',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { id } = request.params as { id: string };
        const pay = await prisma.customerPayment.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, reversedAt: true, allocations: true },
        });
        if (!pay) return reply.status(404).send({ error: 'Không tìm thấy phiếu thu' });
        if (pay.reversedAt) return reply.status(400).send({ error: 'Phiếu thu này đã được đảo trước đó' });

        await prisma.$transaction(async (tx) => {
          for (const a of (pay.allocations as any[]) || []) {
            const o = await tx.order.findUnique({
              where: { id: a.orderId },
              select: { paidAmount: true, debtAmountValue: true },
            });
            if (!o) continue;
            const applied = Number(a.applied);
            // Hoàn lại nợ đã gạt, trừ lại đã thu — không recompute (xem lý do ở
            // handler tạo phiếu thu phía trên).
            await tx.order.update({
              where: { id: a.orderId },
              data: {
                paidAmount: Math.max(0, toNumber(o.paidAmount) - applied),
                debtAmountValue: toNumber(o.debtAmountValue) + applied,
              },
            });
          }
          await tx.customerPayment.update({
            where: { id },
            data: { reversedAt: new Date(), reversedById: user.id },
          });
        });

        return { success: true };
      } catch (err) {
        logger.error('[sale-app] debt/payments reverse error:', err);
        return reply.status(500).send({ error: 'Lỗi đảo phiếu thu' });
      }
    },
  );

  // ── GET /api/v1/sale-app/debt/customers/:id/payments ─ lịch sử thu nợ ──
  app.get(
    '/api/v1/sale-app/debt/customers/:id/payments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { id } = request.params as { id: string };
        const rows = await prisma.customerPayment.findMany({
          where: { orgId: user.orgId, contactId: id },
          orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        });
        const uids = [
          ...new Set(rows.flatMap((r) => [r.createdById, r.reversedById]).filter(Boolean)),
        ] as string[];
        const users = uids.length
          ? await prisma.user.findMany({ where: { id: { in: uids } }, select: { id: true, fullName: true } })
          : [];
        const uname = (uid: string | null) => (uid ? users.find((u) => u.id === uid)?.fullName ?? '—' : '—');

        return {
          payments: rows.map((r) => ({
            id: r.id,
            amount: toNumber(r.amount),
            payment_method: r.paymentMethod,
            payment_date: r.paymentDate,
            reference: r.reference,
            note: r.note,
            proof_url: parseProofUrls(r.proofUrl)[0] || null, // tương thích cũ: ảnh đầu tiên
            proof_urls: parseProofUrls(r.proofUrl), // mảng đầy đủ chứng từ
            allocations: r.allocations,
            created_by: uname(r.createdById),
            created_at: r.createdAt,
            reversed: !!r.reversedAt,
            reversed_at: r.reversedAt,
            reversed_by: uname(r.reversedById),
          })),
        };
      } catch (err) {
        logger.error('[sale-app] debt/customers/:id/payments error:', err);
        return reply.status(500).send({ error: 'Lỗi tải lịch sử thu nợ' });
      }
    },
  );

  // ── GET /api/v1/sale-app/debt/customers/:id/ledger ─ sổ chi tiết công nợ ──
  // Ghép đơn hàng (phát sinh NỢ) + phiếu thu (phát sinh CÓ) theo thời gian,
  // tính số dư luỹ kế. Số dư cuối kỳ = công nợ hiện tại (khớp header drawer).
  //   originalDebt(đơn) = debtAmount hiện tại + tổng đã gạt vào đơn đó
  //   → 1 dòng "Bán hàng" / đơn (chỉ đơn từng phát sinh nợ). Đơn trả đủ ngay: bỏ.
  app.get(
    '/api/v1/sale-app/debt/customers/:id/ledger',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { id } = request.params as { id: string };

        const contact = await prisma.contact.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, fullName: true, phone: true, storeName: true, misaCustomerCode: true },
        });
        if (!contact) return reply.status(404).send({ error: 'Không tìm thấy khách hàng' });

        // Đơn của KH (bỏ đơn huỷ). Member chỉ thấy đơn mình phụ trách/tạo.
        const orderWhere: any = { orgId: user.orgId, contactId: id, status: { notIn: ['cancelled', 'returned'] } };
        if (user.role === 'member') {
          orderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
        }
        const orders = await prisma.order.findMany({
          where: orderWhere,
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            createdAt: true,
            debtAmountValue: true,
          },
        });
        const inScope = new Set(orders.map((o: { id: string }) => o.id));

        // Phiếu thu CHƯA ĐẢO. allocations = [{ orderId, orderCode, applied }].
        const pays = await prisma.customerPayment.findMany({
          where: { orgId: user.orgId, contactId: id, reversedAt: null },
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            allocations: true,
          },
        });

        // Tổng đã gạt vào từng đơn (từ mọi phiếu thu chưa đảo).
        const appliedByOrder = new Map<string, number>();
        for (const p of pays) {
          const allocs = Array.isArray(p.allocations) ? (p.allocations as any[]) : [];
          for (const a of allocs) {
            if (!a?.orderId) continue;
            appliedByOrder.set(a.orderId, (appliedByOrder.get(a.orderId) || 0) + toNumber(a.applied));
          }
        }

        const rows: any[] = [];
        let opening = 0; // Số dư đầu kỳ = tổng nợ các đơn "NDK-" (nợ đầu kỳ chuyển sổ từ MISA).

        // Dòng BÁN HÀNG (Nợ) — 1 dòng / đơn từng phát sinh nợ.
        // Đơn mã NDK- là nợ đầu kỳ (chuyển sổ) → gộp vào số dư đầu kỳ, không phải bán hàng.
        for (const o of orders) {
          const originalDebt = toNumber(o.debtAmountValue) + (appliedByOrder.get(o.id) || 0);
          if (originalDebt <= 0) continue;
          if (String(o.orderCode || '').toUpperCase().startsWith('NDK')) {
            opening += originalDebt;
            continue;
          }
          rows.push({
            date: o.orderDate || o.createdAt,
            sort: 0, // bán hàng đứng trước thu tiền cùng ngày
            type: 'sale',
            code: o.orderCode,
            description: 'Bán hàng',
            debit: originalDebt,
            credit: 0,
          });
        }

        // Dòng THU TIỀN (Có). Member: chỉ tính phần gạt vào đơn trong phạm vi.
        for (const p of pays) {
          const allocs = Array.isArray(p.allocations) ? (p.allocations as any[]) : [];
          let credit = 0;
          if (user.role === 'member') {
            for (const a of allocs) {
              if (a?.orderId && inScope.has(a.orderId)) credit += toNumber(a.applied);
            }
          } else {
            credit = allocs.reduce((s, a) => s + toNumber(a?.applied), 0);
            if (credit <= 0) credit = toNumber(p.amount); // fallback phiếu cũ chưa có allocations
          }
          if (credit <= 0) continue;
          rows.push({
            date: p.paymentDate,
            sort: 1,
            type: 'payment',
            code: p.reference || 'Thu tiền',
            description: 'Thu tiền công nợ',
            method: p.paymentMethod,
            debit: 0,
            credit,
          });
        }

        // Sắp theo ngày tăng dần, cùng ngày: bán hàng trước thu tiền.
        rows.sort((a, b) => {
          const ta = new Date(a.date).getTime();
          const tb = new Date(b.date).getTime();
          if (ta !== tb) return ta - tb;
          return a.sort - b.sort;
        });

        let balance = opening; // số dư chạy từ số dư đầu kỳ
        let sumDebit = 0;
        let sumCredit = 0;
        for (const r of rows) {
          balance += r.debit - r.credit;
          r.balance = balance;
          sumDebit += r.debit;
          sumCredit += r.credit;
          delete r.sort;
        }

        return {
          customer: {
            id: contact.id,
            name: contact.fullName,
            phone: contact.phone,
            store_name: contact.storeName,
            code: contact.misaCustomerCode,
          },
          opening_balance: opening,
          rows,
          totals: { debit: sumDebit, credit: sumCredit, closing: balance },
        };
      } catch (err) {
        logger.error('[sale-app] debt/customers/:id/ledger error:', err);
        return reply.status(500).send({ error: 'Lỗi tải sổ chi tiết công nợ' });
      }
    },
  );

  // ── GET /api/v1/sale-app/debt/ledger ─ SỔ NHẬT KÝ CÔNG NỢ TOÀN CÔNG TY ──
  // Gom mọi giao dịch của cả org theo thời gian: bán hàng (phát sinh NỢ) +
  // thu tiền (CÓ). Số dư mỗi dòng = TỔNG công nợ công ty tại thời điểm đó
  // (luỹ kế từ đầu). Kế toán dùng để đối chiếu chứng từ nhanh.
  // Chỉ owner/admin. Lọc: from/to (mặc định tháng hiện tại, giờ VN), q (tìm khách).
  app.get(
    '/api/v1/sale-app/debt/ledger',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const query = request.query as {
          from?: string; to?: string; q?: string; page?: string; pageSize?: string;
        };

        // Mặc định: KHÔNG chặn đầu (từ đầu lịch sử) → hôm nay, theo giờ VN (UTC+7).
        // Kế toán muốn thấy toàn bộ lịch sử; muốn bó tháng thì tự chọn "Từ ngày".
        const pad = (n: number) => String(n).padStart(2, '0');
        const nowVn = new Date(Date.now() + 7 * 3600 * 1000);
        const y = nowVn.getUTCFullYear();
        const mo = nowVn.getUTCMonth(); // 0-based
        const todayVn = `${y}-${pad(mo + 1)}-${pad(nowVn.getUTCDate())}`;
        const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
        const from = isDate(query.from) ? query.from! : '1900-01-01';
        const to = isDate(query.to) ? query.to! : todayVn;

        const q = (query.q || '').trim().toLowerCase();
        const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
        const pageSize = Math.min(500, Math.max(10, parseInt(query.pageSize || '100', 10) || 100));

        // Ngày calendar theo giờ VN (date-only field lưu midnight UTC → +7h vẫn đúng ngày).
        const vnDate = (d: Date | string) =>
          new Date(new Date(d).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

        // Toàn bộ đơn (bỏ huỷ/trả) + phiếu thu (chưa đảo) của org, kèm thông tin khách.
        const orders = await prisma.order.findMany({
          where: { orgId: user.orgId, status: { notIn: ['cancelled', 'returned'] } },
          select: {
            id: true,
            orderCode: true,
            orderDate: true,
            createdAt: true,
            debtAmountValue: true,
            contact: { select: { id: true, fullName: true, phone: true, storeName: true } },
          },
        });
        const pays = await prisma.customerPayment.findMany({
          where: { orgId: user.orgId, reversedAt: null },
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            reference: true,
            allocations: true,
            proofUrl: true,
            contact: { select: { id: true, fullName: true, phone: true, storeName: true } },
          },
        });

        // Tổng đã gạt vào từng đơn (mọi phiếu thu chưa đảo) → suy ra nợ gốc mỗi đơn.
        const appliedByOrder = new Map<string, number>();
        for (const p of pays) {
          const allocs = Array.isArray(p.allocations) ? (p.allocations as any[]) : [];
          for (const a of allocs) {
            if (!a?.orderId) continue;
            appliedByOrder.set(a.orderId, (appliedByOrder.get(a.orderId) || 0) + toNumber(a.applied));
          }
        }

        // Danh sách sự kiện: bán hàng (Nợ) + thu tiền (Có).
        type Ev = {
          date: Date | string; sort: number; type: string; code: string | null;
          orderId: string | null; description: string; customer: any;
          debit: number; credit: number; method: string | null;
          proof_urls: string[]; balance?: number; vnDate?: string;
        };
        const events: Ev[] = [];
        for (const o of orders) {
          const originalDebt = toNumber(o.debtAmountValue) + (appliedByOrder.get(o.id) || 0);
          if (originalDebt <= 0) continue;
          const isNdk = String(o.orderCode || '').toUpperCase().startsWith('NDK');
          const c = o.contact;
          events.push({
            date: o.orderDate || o.createdAt,
            sort: 0, // bán hàng đứng trước thu tiền cùng ngày
            type: 'sale',
            code: o.orderCode,
            orderId: o.id,
            description: isNdk ? 'Nợ đầu kỳ' : 'Bán hàng',
            customer: c ? { id: c.id, name: c.fullName, phone: c.phone, store_name: c.storeName } : null,
            debit: originalDebt,
            credit: 0,
            method: null,
            proof_urls: [],
          });
        }
        for (const p of pays) {
          const allocs = Array.isArray(p.allocations) ? (p.allocations as any[]) : [];
          let credit = allocs.reduce((s, a) => s + toNumber(a?.applied), 0);
          if (credit <= 0) credit = toNumber(p.amount); // fallback phiếu cũ chưa có allocations
          if (credit <= 0) continue;
          const c = p.contact;
          events.push({
            date: p.paymentDate,
            sort: 1,
            type: 'payment',
            code: p.reference || 'Thu tiền',
            orderId: null,
            description: 'Thu tiền công nợ',
            customer: c ? { id: c.id, name: c.fullName, phone: c.phone, store_name: c.storeName } : null,
            debit: 0,
            credit,
            method: p.paymentMethod,
            proof_urls: parseProofUrls(p.proofUrl),
          });
        }

        // Sắp theo ngày tăng dần (cùng ngày: bán hàng trước thu tiền) rồi tính số dư
        // luỹ kế TOÀN CÔNG TY cho MỌI sự kiện.
        events.sort((a, b) => {
          const ta = new Date(a.date).getTime();
          const tb = new Date(b.date).getTime();
          if (ta !== tb) return ta - tb;
          return a.sort - b.sort;
        });
        let balance = 0;
        for (const e of events) {
          balance += e.debit - e.credit;
          e.balance = balance;
          e.vnDate = vnDate(e.date);
        }
        const companyClosing = balance; // tổng công nợ hiện tại toàn công ty

        // Cắt cửa sổ ngày. opening = số dư luỹ kế ngay trước dòng đầu cửa sổ.
        let opening = 0;
        const windowRows: Ev[] = [];
        for (const e of events) {
          if (e.vnDate! < from) {
            opening = e.balance!; // số dư tới hết ngày trước cửa sổ
            continue;
          }
          if (e.vnDate! > to) continue;
          windowRows.push(e);
        }

        // Lọc tìm khách (số dư vẫn là số dư công ty).
        const filtered = q
          ? windowRows.filter((e) => {
              const c = e.customer;
              if (!c) return false;
              return (
                (c.name || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q) ||
                (c.store_name || '').toLowerCase().includes(q)
              );
            })
          : windowRows;

        const sumDebit = filtered.reduce((s, e) => s + e.debit, 0);
        const sumCredit = filtered.reduce((s, e) => s + e.credit, 0);
        const total = filtered.length;
        const start = (page - 1) * pageSize;
        const pageRows = filtered.slice(start, start + pageSize).map((e) => ({
          date: e.date,
          type: e.type,
          code: e.code,
          order_id: e.orderId,
          description: e.description,
          customer: e.customer,
          debit: e.debit,
          credit: e.credit,
          method: e.method,
          balance: e.balance,
          proof_urls: e.proof_urls,
        }));

        return {
          range: { from, to },
          opening_balance: opening,
          company_closing: companyClosing,
          totals: { debit: sumDebit, credit: sumCredit },
          page,
          page_size: pageSize,
          total,
          rows: pageRows,
        };
      } catch (err) {
        logger.error('[sale-app] debt/ledger error:', err);
        return reply.status(500).send({ error: 'Lỗi tải sổ nhật ký công nợ toàn công ty' });
      }
    },
  );

  // ── POST /api/v1/sale-app/uploads/proof ─ upload ảnh chứng từ thanh toán ─
  // Nhận 1 ảnh (multipart, field "file") → đẩy lên Supabase Storage → trả URL.
  // Owner/admin (kế toán) — cùng quyền với người ghi nhận thu tiền.
  app.post(
    '/api/v1/sale-app/uploads/proof',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const file = await (request as any).file?.();
        if (!file) return reply.status(400).send({ error: 'Thiếu file ảnh chứng từ' });

        const mime = String(file.mimetype || '');
        if (!extForMime(mime)) {
          return reply.status(400).send({ error: 'Chỉ nhận ảnh JPG/PNG/WEBP hoặc PDF' });
        }
        const buffer = await file.toBuffer();
        if (buffer.length === 0) return reply.status(400).send({ error: 'File rỗng' });

        const url = await uploadToStorage(buffer, mime, 'proofs', user.orgId);
        return reply.status(201).send({ url });
      } catch (err: any) {
        const code = err?.statusCode;
        if (code && code >= 400 && code < 600) {
          return reply.status(code).send({ error: err.message });
        }
        logger.error('[sale-app] uploads/proof error:', err);
        return reply.status(500).send({ error: 'Lỗi upload ảnh chứng từ' });
      }
    },
  );
  // ── GET /api/v1/sale-app/debt/update-log ─ LỊCH SỬ KẾ TOÁN CẬP NHẬT ─────
  // Anh Philip 25/8/2026: "nhiều khi kế toán quên update, anh còn check được xem
  // bạn ấy cập nhật đến đâu rồi".
  //
  // ⚠️ KHÁC `debt/ledger`: sổ nhật ký xếp theo NGÀY GIAO DỊCH để đối chiếu số dư;
  // bảng này xếp theo THỜI ĐIỂM NHẬP LIỆU (`created_at`) và trả về AI nhập +
  // nhập TRỄ mấy ngày so với ngày thu thật — đó mới là thứ đo được "quên update".
  // Chỉ owner/admin (giống mọi thứ ghi/xem công nợ toàn công ty).
  app.get(
    '/api/v1/sale-app/debt/update-log',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const query = request.query as {
          from?: string; to?: string; q?: string; userId?: string;
          page?: string; pageSize?: string;
        };

        const isDate = (x?: string) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
        const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
        const pageSize = Math.min(200, Math.max(10, parseInt(query.pageSize || '50', 10) || 50));

        // Lọc theo NGÀY NHẬP, 2 đầu cùng hệ quy chiếu giờ VN. Để `new Date(from)`
        // trơ là nửa đêm UTC = 07:00 VN → sót phiếu nhập lúc rạng sáng (bài học
        // 4/8/2026 ở /api/v1/orders).
        const createdFilter: any = {};
        if (isDate(query.from)) createdFilter.gte = new Date(query.from + 'T00:00:00');
        if (isDate(query.to)) createdFilter.lte = new Date(query.to + 'T23:59:59');

        const where: any = { orgId: user.orgId };
        if (Object.keys(createdFilter).length) where.createdAt = createdFilter;
        if (query.userId) where.createdById = query.userId;
        const q = (query.q || '').trim();
        if (q) {
          where.contact = {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { storeName: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          };
        }

        const [total, pays] = await Promise.all([
          prisma.customerPayment.count({ where }),
          prisma.customerPayment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
              reference: true,
              note: true,
              proofUrl: true,
              allocations: true,
              createdAt: true,
              createdById: true,
              reversedAt: true,
              reversedById: true,
              contact: { select: { id: true, fullName: true, storeName: true, phone: true } },
            },
          }),
        ]);

        // `created_by` / `reversed_by` là cột String, KHÔNG có relation sang User →
        // phải tra tên bằng 1 query riêng (đừng thử `include`, Prisma sẽ vỡ).
        const userIds = [
          ...new Set(
            pays.flatMap((p: any) => [p.createdById, p.reversedById]).filter(Boolean),
          ),
        ] as string[];
        const users = userIds.length
          ? await prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, fullName: true },
            })
          : [];
        const nameById = new Map(users.map((u: any) => [u.id, u.fullName]));

        // Ngày theo lịch VN (cột @db.Date lưu midnight UTC nên +7h vẫn đúng ngày).
        const vnDay = (d: Date | string) =>
          new Date(new Date(d).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        const dayDiff = (a: string, b: string) =>
          Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);

        const rows = pays.map((p: any) => {
          const allocs = Array.isArray(p.allocations) ? (p.allocations as any[]) : [];
          const entryDay = vnDay(p.createdAt);
          const payDay = vnDay(p.paymentDate);
          return {
            id: p.id,
            created_at: p.createdAt,
            created_by: p.createdById ? nameById.get(p.createdById) || 'Không rõ' : 'Không rõ',
            created_by_id: p.createdById,
            contact_id: p.contact?.id ?? null,
            contact_name: p.contact?.storeName || p.contact?.fullName || '—',
            contact_phone: p.contact?.phone ?? null,
            amount: Math.round(toNumber(p.amount)),
            payment_date: payDay,
            // Nhập sau ngày thu bao nhiêu ngày. 0 = nhập trong ngày. Số này mới
            // là thứ anh Philip cần để biết kế toán có nhập kịp hay không.
            lag_days: Math.max(0, dayDiff(entryDay, payDay)),
            payment_method: p.paymentMethod ?? null,
            reference: p.reference ?? null,
            note: p.note ?? null,
            has_proof: !!p.proofUrl,
            orders: allocs.map((a: any) => ({
              order_code: a?.orderCode ?? null,
              applied: Math.round(toNumber(a?.applied)),
            })),
            reversed_at: p.reversedAt,
            reversed_by: p.reversedById ? nameById.get(p.reversedById) || 'Không rõ' : null,
          };
        });

        // Tổng hợp trên TOÀN khoảng lọc (không chỉ trang hiện tại) — nếu chỉ tính
        // theo trang thì con số "cập nhật đến đâu" sai ngay khi sang trang 2.
        const [agg, latest, lateCount] = await Promise.all([
          prisma.customerPayment.aggregate({ where, _sum: { amount: true } }),
          prisma.customerPayment.findFirst({
            where: { orgId: user.orgId },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, createdById: true },
          }),
          // Nhập trễ > 3 ngày so với ngày thu. Phải viết SQL vì Prisma không so
          // được 2 cột với nhau. Cùng khoảng ngày với bộ lọc (COALESCE để khỏi
          // phải ghép SQL động); ô tìm khách `q` KHÔNG áp vào số này — nó là
          // "cả kỳ có bao nhiêu phiếu nhập trễ", không phụ thuộc đang tìm ai.
          prisma.$queryRaw<Array<{ n: bigint }>>`
            SELECT COUNT(*)::bigint AS n
            FROM customer_payments
            WHERE org_id = ${user.orgId}
              AND reversed_at IS NULL
              AND created_at >= COALESCE(${createdFilter.gte ?? null}::timestamp, '-infinity'::timestamp)
              AND created_at <= COALESCE(${createdFilter.lte ?? null}::timestamp, 'infinity'::timestamp)
              AND ((created_at + interval '7 hours')::date - payment_date::date) > 3
          `,
        ]);

        let lastBy: string | null = null;
        if (latest?.createdById) {
          lastBy =
            nameById.get(latest.createdById) ||
            (
              await prisma.user.findUnique({
                where: { id: latest.createdById },
                select: { fullName: true },
              })
            )?.fullName ||
            'Không rõ';
        }
        const daysSince = latest?.createdAt
          ? dayDiff(vnDay(new Date()), vnDay(latest.createdAt))
          : null;

        return {
          range: { from: query.from || null, to: query.to || null },
          summary: {
            // Mốc nhập gần nhất tính trên TOÀN BỘ lịch sử, không theo bộ lọc —
            // đây là câu trả lời cho "kế toán cập nhật đến đâu rồi".
            last_entry_at: latest?.createdAt ?? null,
            last_entry_by: lastBy,
            days_since_last_entry: daysSince,
            count: total,
            total_amount: Math.round(toNumber(agg._sum.amount ?? 0)),
            late_count: Number(lateCount?.[0]?.n ?? 0),
          },
          page,
          page_size: pageSize,
          total,
          rows,
        };
      } catch (err) {
        logger.error('[sale-app] debt/update-log error:', err);
        return reply.status(500).send({ error: 'Lỗi tải lịch sử cập nhật công nợ' });
      }
    },
  );
}
