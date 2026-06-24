/**
 * Add / edit / remove order line items.
 *
 * Editing items is only allowed while the order is in draft or
 * confirmed (admin/owner can edit at any non-completed/cancelled stage,
 * but it's safer to do that through the cancel-and-recreate flow).
 *
 * Each line item snapshots `unitPrice`, `unitCost`, and the
 * `priceTierId` it came from so future changes to the product or its
 * tiers don't retroactively rewrite finalized orders.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { markProductsHasSales } from '../products/product-sales-flag.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  normalizeStatus,
  canEditOrderStatus,
  orderScopeWhere,
  recomputeOrderTotals,
  reqUser,
  toNumber,
  canSeeAllOrders,
} from './order-service.js';

interface ItemBody {
  productId?: string;
  batchId?: string | null;
  quantity?: number;
  unitPrice?: number;
  priceTierId?: string | null;
  discountValue?: number;
}

export async function orderItemsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/orders/:id/items — add a line item
  app.post('/api/v1/orders/:id/items', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as ItemBody;

      if (!body.productId) return reply.status(400).send({ error: 'productId là bắt buộc' });
      if (!body.quantity || body.quantity <= 0) {
        return reply.status(400).send({ error: 'Số lượng phải > 0' });
      }
      if (body.unitPrice === undefined || body.unitPrice < 0) {
        return reply.status(400).send({ error: 'Đơn giá phải ≥ 0' });
      }

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true, orgId: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(order.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({
          error: `Không thể thêm SP vào đơn ở trạng thái ${status}`,
        });
      }

      const product = await prisma.product.findFirst({
        where: { id: body.productId, orgId: order.orgId },
        select: { id: true, sku: true, name: true, unit: true, costPrice: true },
      });
      if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      // Validate batch (if provided) belongs to product and has stock.
      if (body.batchId) {
        const batch = await prisma.inventoryBatch.findFirst({
          where: { id: body.batchId, productId: product.id },
          select: { id: true, batchCode: true, currentQuantity: true, status: true },
        });
        if (!batch) return reply.status(400).send({ error: 'Lô không tồn tại hoặc không thuộc SP này' });
        if (batch.status !== 'active') {
          return reply.status(400).send({ error: `Lô ${batch.batchCode} đang ở trạng thái ${batch.status}` });
        }
        if (batch.currentQuantity < body.quantity) {
          return reply.status(400).send({
            error: `Lô ${batch.batchCode} chỉ còn ${batch.currentQuantity}, cần ${body.quantity}`,
          });
        }
      }

      // Validate tier (if provided) belongs to product
      if (body.priceTierId) {
        const tier = await prisma.productPrice.findFirst({
          where: { id: body.priceTierId, productId: product.id, active: true },
          select: { id: true },
        });
        if (!tier) return reply.status(400).send({ error: 'Mức giá không hợp lệ' });
      }

      const qty = body.quantity;
      const unitPrice = body.unitPrice;
      const discount = body.discountValue ?? 0;
      const lineTotal = qty * unitPrice - discount;
      const unitCost = product.costPrice == null ? null : toNumber(product.costPrice);
      const lineCost = unitCost == null ? null : Math.round(qty * unitCost);
      const profit = lineCost == null ? null : lineTotal - lineCost;

      const created = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          batchId: body.batchId ?? null,
          priceTierId: body.priceTierId ?? null,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          quantity: qty,
          unitPrice: unitPrice,
          discountValue: discount,
          lineTotal,
          unitCost: unitCost,
          lineCost,
          profit,
          costValue: unitCost,
        },
      });

      await markProductsHasSales([product.id]);
      await recomputeOrderTotals(order.id);
      return reply.status(201).send(canSeeAllOrders(user.role) ? created : { ...created, unitCost: null, lineCost: null, profit: null, costValue: null });
    } catch (err) {
      logger.error('[order-items] Add error:', err);
      return reply.status(500).send({ error: 'Failed to add item' });
    }
  });

  // PUT /api/v1/orders/:id/items/:itemId — edit qty / price / batch
  app.put('/api/v1/orders/:id/items/:itemId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id, itemId } = request.params as { id: string; itemId: string };
      const body = request.body as ItemBody;

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true, orgId: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(order.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({ error: `Không thể sửa item ở trạng thái ${status}` });
      }

      const item = await prisma.orderItem.findFirst({
        where: { id: itemId, orderId: order.id },
      });
      if (!item) return reply.status(404).send({ error: 'Item not found' });

      const newQty = body.quantity ?? item.quantity;
      const newUnitPrice = body.unitPrice ?? item.unitPrice;
      const newDiscount = body.discountValue ?? item.discountValue;
      const newBatchId = body.batchId === undefined ? item.batchId : body.batchId;
      const newTierId = body.priceTierId === undefined ? item.priceTierId : body.priceTierId;

      // Re-validate batch if changed
      if (newBatchId && newBatchId !== item.batchId) {
        const batch = await prisma.inventoryBatch.findFirst({
          where: { id: newBatchId, productId: item.productId ?? '' },
          select: { id: true, batchCode: true, currentQuantity: true, status: true },
        });
        if (!batch) return reply.status(400).send({ error: 'Lô không tồn tại' });
        if (batch.currentQuantity < newQty) {
          return reply.status(400).send({
            error: `Lô ${batch.batchCode} chỉ còn ${batch.currentQuantity}`,
          });
        }
      }

      const unitCostNum = toNumber(item.unitCost);
      const lineTotal = newQty * newUnitPrice - newDiscount;
      const lineCost = unitCostNum > 0 ? Math.round(newQty * unitCostNum) : null;
      const profit = lineCost == null ? null : lineTotal - lineCost;

      const updated = await prisma.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: newQty,
          unitPrice: newUnitPrice,
          discountValue: newDiscount,
          batchId: newBatchId,
          priceTierId: newTierId,
          lineTotal,
          lineCost,
          profit,
        },
      });

      await recomputeOrderTotals(order.id);
      return canSeeAllOrders(user.role) ? updated : { ...updated, unitCost: null, lineCost: null, profit: null, costValue: null };
    } catch (err) {
      logger.error('[order-items] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update item' });
    }
  });

  // DELETE /api/v1/orders/:id/items/:itemId
  app.delete('/api/v1/orders/:id/items/:itemId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id, itemId } = request.params as { id: string; itemId: string };
      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true, status: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const status = normalizeStatus(order.status);
      if (!canEditOrderStatus(user.role, status)) {
        return reply.status(403).send({ error: `Không thể xoá item ở trạng thái ${status}` });
      }

      await prisma.orderItem.delete({ where: { id: itemId } });
      await recomputeOrderTotals(order.id);
      return { success: true };
    } catch (err) {
      logger.error('[order-items] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete item' });
    }
  });
}
