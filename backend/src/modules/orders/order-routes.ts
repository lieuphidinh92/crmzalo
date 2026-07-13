/**
 * Wholesale order CRUD + list + summary endpoints.
 *
 * Other order concerns are split into sibling files for clarity:
 *   - order-transitions.ts → 6-status pipeline + stock movements
 *   - order-items-routes.ts → add/edit/remove line items
 *   - order-gifts-routes.ts → free gifts (deduct stock if product gift)
 *   - order-payment-routes.ts → record payment, recompute debt
 *   - order-cron.ts → daily debt warning notifications
 *
 * Permission rules — see `order-service.ts`:
 *   - owner | admin: see & edit all orders in org
 *   - member: only sees orders where they are assigned sale,
 *     created_by, or contact owner; can only edit while status is
 *     draft/confirmed
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  ORDER_STATUSES,
  NON_REVENUE_STATUSES,
  type OrderStatus,
  normalizeStatus,
  canEditOrderStatus,
  orderScopeWhere,
  generateOrderCode,
  recomputeOrderTotals,
  ORDER_FULL_INCLUDE,
  stripCostFromOrder,
  reqUser,
  toNumber,
} from './order-service.js';
import { ensureOrderSeeds } from './order-seeds.js';

type OrderQuery = Partial<{
  page: string;
  limit: string;
  search: string;
  status: string;
  saleId: string;
  contactId: string;
  from: string;
  to: string;
  hasDebt: string;
  overdue: string;
}>;

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/orders ─ list with filters + pagination ────────────────
  app.get('/api/v1/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      // Idempotent — seeds 1 warehouse + batches + 5 sample DH orders on first call
      await ensureOrderSeeds(user.orgId);
      const q = request.query as OrderQuery;

      const page = Math.max(1, parseInt(q.page ?? '1') || 1);
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50') || 50));

      const baseScope = orderScopeWhere(user);
      const filters: Prisma.OrderWhereInput[] = [baseScope];

      if (q.status) {
        const statuses = q.status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length) {
          filters.push({ status: { in: statuses } });
        }
      }
      if (q.saleId) {
        filters.push({ assignedSaleId: q.saleId });
      }
      if (q.contactId) {
        filters.push({ contactId: q.contactId });
      }
      if (q.from || q.to) {
        const range: Prisma.DateTimeFilter = {};
        if (q.from) range.gte = new Date(q.from);
        if (q.to) range.lte = new Date(q.to + 'T23:59:59');
        filters.push({ orderDate: range });
      }
      if (q.hasDebt === '1') {
        filters.push({ debtAmountValue: { gt: 0 } });
      } else if (q.hasDebt === '0') {
        filters.push({ debtAmountValue: { lte: 0 } });
      }
      if (q.overdue === '1') {
        filters.push({
          debtAmountValue: { gt: 0 },
          debtDueDate: { lt: new Date() },
          status: { notIn: [...NON_REVENUE_STATUSES] },
        });
      }
      if (q.search) {
        const s = q.search.trim();
        filters.push({
          OR: [
            { orderCode: { contains: s, mode: 'insensitive' } },
            { contact: { fullName: { contains: s, mode: 'insensitive' } } },
            { contact: { phone: { contains: s } } },
            { contact: { storeName: { contains: s, mode: 'insensitive' } } },
          ],
        });
      }

      const where: Prisma.OrderWhereInput = filters.length > 1 ? { AND: filters } : baseScope;

      const [rows, total] = await Promise.all([
        prisma.order.findMany({
          where,
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                storeName: true,
                policyTier: true,
              },
            },
            assignedSale: { select: { id: true, fullName: true, email: true } },
            createdBy: { select: { id: true, fullName: true } },
          },
          orderBy: [{ updatedAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      // Surface a normalized status alongside the raw one so legacy
      // (paid/shipped) rows still render in the right column.
      const orders = rows.map((o: any) => ({
        ...o,
        statusNormalized: normalizeStatus(o.status),
        totalAmountValue:
          o.totalAmountValue !== null && o.totalAmountValue !== undefined
            ? o.totalAmountValue
            : o.totalAmount,
      }));

      return { orders, total, page, limit };
    } catch (err) {
      logger.error('[orders] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch orders' });
    }
  });

  // ── GET /api/v1/orders/pipeline-summary ───────────────────────────────
  // Returns the 6-status counts for the top-of-page summary cards.
  app.get('/api/v1/orders/pipeline-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const q = request.query as { from?: string; to?: string };
      const scope = orderScopeWhere(user);

      // Tab counts follow the list's date range so the numbers match the rows
      // on screen; debt/expiry warnings stay global (they are not range-bound).
      const where: Prisma.OrderWhereInput = { ...scope };
      if (q.from || q.to) {
        const range: Prisma.DateTimeFilter = {};
        if (q.from) range.gte = new Date(q.from);
        if (q.to) range.lte = new Date(q.to + 'T23:59:59');
        where.orderDate = range;
      }

      const grouped = await prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      });

      const counts: Record<OrderStatus, number> = {
        draft: 0,
        confirmed: 0,
        packing: 0,
        shipping: 0,
        completed: 0,
        returned: 0,
        cancelled: 0,
      };
      for (const g of grouped) {
        const s = normalizeStatus(g.status);
        counts[s] += g._count.id;
      }

      // Debt warnings — count of orders with overdue debt that this user can see
      const [overdueCount, expiringBatchesCount] = await Promise.all([
        prisma.order.count({
          where: {
            ...scope,
            debtAmountValue: { gt: 0 },
            debtDueDate: { lt: new Date() },
            status: { notIn: [...NON_REVENUE_STATUSES] },
          },
        }),
        prisma.inventoryBatch.count({
          where: {
            orgId: user.orgId,
            status: 'active',
            currentQuantity: { gt: 0 },
            expiryDate: {
              not: null,
              lt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      return {
        counts,
        statuses: ORDER_STATUSES,
        warnings: {
          overdueDebt: overdueCount,
          expiringBatches: expiringBatchesCount,
        },
      };
    } catch (err) {
      logger.error('[orders] Pipeline summary error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline summary' });
    }
  });

  // ── GET /api/v1/orders/:id ─ full detail with items + gifts ───────────
  app.get('/api/v1/orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        include: ORDER_FULL_INCLUDE,
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      return {
        ...stripCostFromOrder(order, user.role),
        statusNormalized: normalizeStatus(order.status),
        // Mirror legacy total to the new field name when caller reads
        // a MISA row that hasn't been upgraded yet.
        totalAmountValue:
          order.totalAmountValue !== null && order.totalAmountValue !== undefined
            ? order.totalAmountValue
            : order.totalAmount,
      };
    } catch (err) {
      logger.error('[orders] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch order' });
    }
  });

  // ── POST /api/v1/orders ─ create draft ────────────────────────────────
  app.post('/api/v1/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const body = request.body as Record<string, any>;

      if (!body.contactId) {
        return reply.status(400).send({ error: 'Khách hàng là bắt buộc' });
      }

      // Sanity: contact belongs to user's org
      const contact = await prisma.contact.findFirst({
        where: { id: body.contactId, orgId: user.orgId },
        select: { id: true, assignedUserId: true, address: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

      const orderCode = await generateOrderCode(user.orgId);

      const created = await prisma.order.create({
        data: {
          orgId: user.orgId,
          contactId: contact.id,
          createdByUserId: user.id,
          orderCode,
          status: 'draft',
          orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
          assignedSaleId: body.assignedSaleId ?? contact.assignedUserId ?? user.id,
          mktOwnerId: body.mktOwnerId ?? null,
          source: body.source ?? null,
          shippingMethod: body.shippingMethod ?? null,
          shippingProvider: body.shippingProvider ?? null,
          shippingFee: body.shippingFee ?? 0,
          deliveryAddress: body.deliveryAddress ?? contact.address ?? null,
          discountType: body.discountType ?? null,
          discountValue: body.discountValue ?? 0,
          paymentMethod: body.paymentMethod ?? null,
          debtDueDate: body.debtDueDate ? new Date(body.debtDueDate) : null,
          internalNote: body.internalNote ?? null,
          customerNote: body.customerNote ?? null,
          totalAmount: 0, // legacy float; recomputeOrderTotals will sync
          subtotalAmount: 0,
          totalAmountValue: 0,
          discountAmount: 0,
          paidAmount: body.paidAmount ?? 0,
        },
      });

      await recomputeOrderTotals(created.id);

      const full = await prisma.order.findUnique({
        where: { id: created.id },
        include: ORDER_FULL_INCLUDE,
      });
      return reply.status(201).send({
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      });
    } catch (err) {
      logger.error('[orders] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create order' });
    }
  });

  // ── PUT /api/v1/orders/:id ─ update header (not items) ────────────────
  app.put('/api/v1/orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const baseScope = orderScopeWhere(user);
      const existing = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(existing.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({
          error: `Bạn không thể sửa đơn ở trạng thái ${status}. Chỉ admin/owner sửa được đơn đã đóng gói trở đi.`,
        });
      }

      const updateData: Prisma.OrderUpdateInput = {};
      const passthrough = [
        'source', 'shippingMethod', 'shippingProvider', 'trackingCode',
        'deliveryAddress', 'internalNote', 'customerNote', 'paymentMethod',
      ];
      for (const f of passthrough) {
        if (body[f] !== undefined) (updateData as any)[f] = body[f];
      }
      if (body.assignedSaleId !== undefined) {
        updateData.assignedSale = body.assignedSaleId
          ? { connect: { id: body.assignedSaleId } }
          : { disconnect: true };
      }
      if (body.mktOwnerId !== undefined) {
        updateData.mktOwner = body.mktOwnerId
          ? { connect: { id: body.mktOwnerId } }
          : { disconnect: true };
      }
      if (body.orderDate !== undefined) {
        updateData.orderDate = body.orderDate ? new Date(body.orderDate) : null;
      }
      if (body.shippingFee !== undefined) updateData.shippingFee = body.shippingFee;
      if (body.discountType !== undefined) updateData.discountType = body.discountType;
      if (body.discountValue !== undefined) updateData.discountValue = body.discountValue;
      if (body.debtDueDate !== undefined) {
        updateData.debtDueDate = body.debtDueDate ? new Date(body.debtDueDate) : null;
      }

      await prisma.order.update({ where: { id }, data: updateData });
      await recomputeOrderTotals(id);

      const full = await prisma.order.findUnique({
        where: { id },
        include: ORDER_FULL_INCLUDE,
      });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[orders] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update order' });
    }
  });

  // ── DELETE /api/v1/orders/:id ─ admin only, hard delete (rare) ───────
  // Cancel-with-restock is the normal path (order-transitions.ts).
  app.delete('/api/v1/orders/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (user.role !== 'owner' && user.role !== 'admin') {
        return reply.status(403).send({ error: 'Chỉ admin/owner được xoá hẳn đơn' });
      }
      const { id } = request.params as { id: string };
      const existing = await prisma.order.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, status: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(existing.status);
      if (status !== 'draft' && status !== 'cancelled') {
        return reply.status(400).send({
          error: `Không thể xoá đơn đã ${status}. Hãy chuyển sang Huỷ trước nếu muốn loại đơn này khỏi báo cáo.`,
        });
      }

      await prisma.order.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[orders] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete order' });
    }
  });

  // ── Legacy endpoints kept for dashboard / chat / older composables ────
  // GET /api/v1/orders/stats — used by use-dashboard.ts. Aggregates the
  // legacy `totalAmount` Float so MISA-imported rows count correctly.
  app.get('/api/v1/orders/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { from = '', to = '' } = request.query as Record<string, string>;
      const baseScope = orderScopeWhere(user);
      const range: Prisma.DateTimeFilter | undefined =
        from || to
          ? {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to + 'T23:59:59') } : {}),
            }
          : undefined;
      const where: Prisma.OrderWhereInput = range
        ? { AND: [baseScope, { createdAt: range }] }
        : baseScope;

      const [total, completed, revenue, todayRevenue] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.count({ where: { AND: [where, { status: { in: ['completed', 'paid'] } }] } }),
        prisma.order.aggregate({
          where: { AND: [where, { status: { in: ['completed', 'paid'] } }] },
          _sum: { totalAmount: true },
        }),
        prisma.order.aggregate({
          where: {
            AND: [
              baseScope,
              { status: { in: ['completed', 'paid'] } },
              { createdAt: { gte: new Date(new Date().toISOString().split('T')[0]) } },
            ],
          },
          _sum: { totalAmount: true },
        }),
      ]);
      return {
        totalOrders: total,
        completedOrders: completed,
        totalRevenue: revenue._sum.totalAmount ?? 0,
        todayRevenue: todayRevenue._sum.totalAmount ?? 0,
      };
    } catch (err) {
      logger.error('[orders] Stats error:', err);
      return reply.status(500).send({ error: 'Failed to fetch order stats' });
    }
  });

  // GET /api/v1/orders/by-staff — used by OrderStaffTable component
  app.get('/api/v1/orders/by-staff', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const baseScope = orderScopeWhere(user);
      const staffStats = await prisma.order.groupBy({
        by: ['createdByUserId'],
        where: baseScope,
        _count: true,
        _sum: { totalAmount: true },
      });
      const userIds = staffStats.map((s: any) => s.createdByUserId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      });
      const userMap = new Map<string, string>(users.map((u: { id: string; fullName: string }) => [u.id, u.fullName]));
      return {
        staffStats: staffStats.map((s: any) => ({
          userId: s.createdByUserId,
          fullName: userMap.get(s.createdByUserId) ?? 'Unknown',
          orderCount: s._count,
          totalRevenue: s._sum.totalAmount ?? 0,
        })),
      };
    } catch (err) {
      logger.error('[orders] By-staff error:', err);
      return reply.status(500).send({ error: 'Failed to fetch by-staff' });
    }
  });

  // GET /api/v1/contacts/:id/orders — used by ChatOrders.vue
  app.get('/api/v1/contacts/:id/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const baseScope = orderScopeWhere(user);
      const orders = await prisma.order.findMany({
        where: { AND: [baseScope, { contactId: id }] },
        include: { createdBy: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return { orders };
    } catch (err) {
      logger.error('[orders] Contact orders (legacy) error:', err);
      return reply.status(500).send({ error: 'Failed to fetch orders for contact' });
    }
  });

  // ── GET /api/v1/contacts/:id/wholesale-orders ── full wholesale list +
  // aggregate stats (totalValue/orderCount/lastOrderDate). New endpoint
  // because the legacy one above returns a flat list expected by chat.
  app.get('/api/v1/contacts/:id/wholesale-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };

      const baseScope = orderScopeWhere(user);
      const orders = await prisma.order.findMany({
        where: { AND: [baseScope, { contactId: id }] },
        include: {
          assignedSale: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { orderDate: 'desc' },
      });

      const stats = orders.reduce(
        (acc: { totalValue: number; orderCount: number; lastOrderDate: Date | null }, o: any) => {
          const status = normalizeStatus(o.status);
          if (status === 'completed') {
            acc.totalValue += toNumber(o.totalAmountValue ?? o.totalAmount);
            acc.orderCount += 1;
          }
          if (!acc.lastOrderDate || (o.orderDate && o.orderDate > acc.lastOrderDate)) {
            if (o.orderDate) acc.lastOrderDate = o.orderDate;
          }
          return acc;
        },
        { totalValue: 0, orderCount: 0, lastOrderDate: null as Date | null },
      );

      return {
        orders: orders.map((o: any) => ({
          ...o,
          statusNormalized: normalizeStatus(o.status),
          totalAmountValue: o.totalAmountValue ?? o.totalAmount,
        })),
        stats,
      };
    } catch (err) {
      logger.error('[orders] Contact orders error:', err);
      return reply.status(500).send({ error: 'Failed to fetch orders for contact' });
    }
  });
}
