/**
 * Record a payment against an order. Updates `paidAmount` (cumulative
 * if `mode=add`, replaces if `mode=set`) and lets `recomputeOrderTotals`
 * derive the new debt.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  recomputeOrderTotals,
  orderScopeWhere,
  reqUser,
  toNumber,
  normalizeStatus,
  ORDER_FULL_INCLUDE,
  stripCostFromOrder,
} from './order-service.js';

interface PaymentBody {
  paidAmount?: number;
  paymentMethod?: string;
  debtDueDate?: string | null;
  mode?: 'add' | 'set';
}

export async function orderPaymentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Ghi nhận thanh toán = quyền owner/admin (thu tiền tập trung ở màn Công nợ).
  app.post('/api/v1/orders/:id/payment', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as PaymentBody;

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, paidAmount: true, paymentMethod: true, status: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      if (normalizeStatus(order.status) === 'cancelled') {
        return reply.status(400).send({ error: 'Không thể thu tiền cho đơn đã huỷ' });
      }

      const updateData: Record<string, unknown> = {};

      if (body.paidAmount !== undefined) {
        if (body.paidAmount < 0) {
          return reply.status(400).send({ error: 'Số tiền thanh toán phải ≥ 0' });
        }
        if (body.mode === 'add') {
          updateData.paidAmount = toNumber(order.paidAmount) + body.paidAmount;
        } else {
          updateData.paidAmount = body.paidAmount;
        }
      }
      if (body.paymentMethod !== undefined) {
        updateData.paymentMethod = body.paymentMethod;
      }
      if (body.debtDueDate !== undefined) {
        updateData.debtDueDate = body.debtDueDate ? new Date(body.debtDueDate) : null;
      }

      // Validate: credit method must have a due date.
      const finalMethod = body.paymentMethod ?? order.paymentMethod;
      const finalDueDate = body.debtDueDate ?? null;
      if (finalMethod === 'credit' && body.debtDueDate !== undefined && !finalDueDate) {
        return reply.status(400).send({
          error: 'Đơn công nợ bắt buộc có hạn thanh toán',
        });
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
      logger.error('[order-payment] Record error:', err);
      return reply.status(500).send({ error: 'Failed to record payment' });
    }
  });
}
