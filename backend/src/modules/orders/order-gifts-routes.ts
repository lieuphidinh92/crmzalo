/**
 * Add / remove free gifts on an order. Two flavours:
 *  - product gift: `productId` set; deducts stock from `batchId` on
 *    packing (handled in order-transitions.ts)
 *  - custom gift: just `giftName` + qty; doesn't touch inventory
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  normalizeStatus,
  canEditOrderStatus,
  orderScopeWhere,
  reqUser,
} from './order-service.js';

interface GiftBody {
  productId?: string | null;
  batchId?: string | null;
  giftName?: string;
  quantity?: number;
  note?: string;
}

export async function orderGiftsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/orders/:id/gifts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as GiftBody;

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true, orgId: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(order.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({ error: `Không thể thêm quà ở trạng thái ${status}` });
      }

      const qty = body.quantity ?? 1;
      if (qty <= 0) return reply.status(400).send({ error: 'Số lượng quà phải > 0' });

      let giftName = body.giftName?.trim() ?? '';
      let productId: string | null = null;
      let batchId: string | null = null;

      if (body.productId) {
        const product = await prisma.product.findFirst({
          where: { id: body.productId, orgId: order.orgId },
          select: { id: true, name: true, sku: true },
        });
        if (!product) return reply.status(404).send({ error: 'Sản phẩm quà không tồn tại' });
        productId = product.id;
        if (!giftName) giftName = product.name;

        if (body.batchId) {
          const batch = await prisma.inventoryBatch.findFirst({
            where: { id: body.batchId, productId: product.id },
            select: { id: true, batchCode: true, currentQuantity: true },
          });
          if (!batch) return reply.status(400).send({ error: 'Lô quà không tồn tại' });
          if (batch.currentQuantity < qty) {
            return reply.status(400).send({
              error: `Lô ${batch.batchCode} chỉ còn ${batch.currentQuantity}`,
            });
          }
          batchId = batch.id;
        }
      } else {
        // Custom gift — name is required
        if (!giftName) return reply.status(400).send({ error: 'Tên quà custom là bắt buộc' });
      }

      const created = await prisma.orderGift.create({
        data: {
          orderId: order.id,
          productId,
          batchId,
          giftName,
          quantity: qty,
          note: body.note ?? null,
        },
      });
      return reply.status(201).send(created);
    } catch (err) {
      logger.error('[order-gifts] Add error:', err);
      return reply.status(500).send({ error: 'Failed to add gift' });
    }
  });

  app.delete('/api/v1/orders/:id/gifts/:giftId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id, giftId } = request.params as { id: string; giftId: string };
      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(order.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({ error: `Không thể xoá quà ở trạng thái ${status}` });
      }

      await prisma.orderGift.delete({ where: { id: giftId } });
      return { success: true };
    } catch (err) {
      logger.error('[order-gifts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete gift' });
    }
  });
}
