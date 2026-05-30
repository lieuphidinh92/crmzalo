/**
 * Sale Lite app — CÔNG NỢ (receivables) read-only views.
 *
 * Sale staff use these to chase outstanding debt. They never write here;
 * recording a payment lives in POST /orders/:id/payment (admin/kế toán).
 *
 *  GET /api/v1/sale-app/debt/customers            → đại lý đang nợ (quá hạn lên đầu)
 *  GET /api/v1/sale-app/debt/customers/:id/orders → các đơn còn nợ của 1 KH
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
}
