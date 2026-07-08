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
import { toNumber, reqUser } from '../orders/order-service.js';
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
    status: { notIn: ['cancelled'] },
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
        const due = o.debtDueDate ? new Date(o.debtDueDate) : null;
        const isOverdue = !!due && due < now;
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
          const due = o.debtDueDate ? new Date(o.debtDueDate) : null;
          const isOverdue = !!due && due < now;
          const daysOverdue = isOverdue
            ? Math.floor((now.getTime() - due.getTime()) / 86400_000)
            : 0;
          return {
            id: o.id,
            order_code: o.orderCode,
            status: o.status,
            total_amount: toNumber(o.totalAmountValue ?? o.totalAmount),
            paid_amount: toNumber(o.paidAmount),
            debt_amount: toNumber(o.debtAmountValue),
            due_date: o.debtDueDate,
            is_overdue: isOverdue,
            days_overdue: daysOverdue,
            order_date: o.orderDate,
            created_at: o.createdAt,
          };
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
              debtAmountValue: { gt: 0 }, status: { notIn: ['cancelled'] },
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
        const orderWhere: any = { orgId: user.orgId, contactId: id, status: { notIn: ['cancelled'] } };
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
}
