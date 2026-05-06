/**
 * Stage transition routes for the wholesale order pipeline.
 *
 * Wires the 6-status flow draft → confirmed → packing → shipping →
 * completed, plus a `cancel` action allowed from any non-terminal
 * status. The packing transition is the one that touches inventory:
 * each (productId, batchId, quantity) triple decrements
 * `inventory_batches.current_quantity` AND inserts an
 * `inventory_movements` audit row in the same transaction. Cancelling
 * an order that has already shipped/packed reverses the movement.
 *
 * Transition guards live next to the route, not in `order-service.ts`,
 * because they are HTTP-shaped (return 400 with a Vietnamese reason).
 * Pure helpers (`canTransition`, `recomputeOrderTotals`) live in the
 * service.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  ORDER_STATUSES,
  type OrderStatus,
  normalizeStatus,
  canTransition,
  orderScopeWhere,
  ORDER_FULL_INCLUDE,
  stripCostFromOrder,
  reqUser,
  toNumber,
} from './order-service.js';

interface TransitionBody {
  to_status?: string;
  toStatus?: string;
  trackingCode?: string;
  shippingProvider?: string;
  cancelReason?: string;
}

export async function orderTransitionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/orders/:id/transition — move forward in the pipeline
  app.post('/api/v1/orders/:id/transition', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as TransitionBody;
      const target = (body.to_status ?? body.toStatus ?? '') as string;

      if (!(ORDER_STATUSES as readonly string[]).includes(target)) {
        return reply.status(400).send({
          error: `to_status không hợp lệ. Phải là 1 trong: ${ORDER_STATUSES.join(', ')}`,
        });
      }

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        include: {
          items: true,
          gifts: true,
          contact: { select: { id: true, stage: true, firstContactDate: true, assignedUserId: true } },
        },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const from = normalizeStatus(order.status);
      const to = target as OrderStatus;

      if (to === 'cancelled') {
        return reply.status(400).send({ error: 'Dùng /cancel để huỷ đơn (yêu cầu lý do)' });
      }
      if (!canTransition(from, to)) {
        return reply.status(400).send({
          error: `Không thể chuyển từ ${from} → ${to}. Chỉ được chuyển qua bước kế tiếp.`,
        });
      }

      // ── Per-target validation ──
      const now = new Date();
      const stageData: Prisma.OrderUpdateInput = { status: to };

      if (to === 'confirmed') {
        // Validate full info present
        if (order.items.length === 0) {
          return reply.status(400).send({ error: 'Đơn cần ít nhất 1 sản phẩm trước khi xác nhận' });
        }
        if (!order.assignedSaleId) {
          return reply.status(400).send({ error: 'Đơn cần có sale phụ trách trước khi xác nhận' });
        }
        stageData.confirmedAt = now;
      }

      if (to === 'packing') {
        // Validate every line item has a batch picked AND batch has enough stock.
        const missingBatch = order.items.filter((it: { batchId: string | null }) => !it.batchId);
        if (missingBatch.length > 0) {
          return reply.status(400).send({
            error: `${missingBatch.length} sản phẩm chưa chọn lô. Vui lòng chọn lô cho từng dòng trước khi đóng gói.`,
          });
        }
        // Validate stock for items + product gifts
        const stockNeed = new Map<string, number>();
        for (const it of order.items) {
          if (!it.batchId) continue;
          stockNeed.set(it.batchId, (stockNeed.get(it.batchId) ?? 0) + it.quantity);
        }
        for (const g of order.gifts) {
          if (g.batchId) {
            stockNeed.set(g.batchId, (stockNeed.get(g.batchId) ?? 0) + g.quantity);
          }
        }
        const batchIds = Array.from(stockNeed.keys());
        type BatchSnapshot = { id: string; batchCode: string; currentQuantity: number; productId: string };
        const batches = await prisma.inventoryBatch.findMany({
          where: { id: { in: batchIds } },
          select: { id: true, batchCode: true, currentQuantity: true, productId: true },
        });
        const batchMap = new Map<string, BatchSnapshot>(
          batches.map((b: BatchSnapshot) => [b.id, b]),
        );
        for (const [batchId, need] of stockNeed) {
          const b = batchMap.get(batchId);
          if (!b) {
            return reply.status(400).send({ error: `Lô ${batchId} không tồn tại` });
          }
          if (b.currentQuantity < need) {
            return reply.status(400).send({
              error: `Lô ${b.batchCode} chỉ còn ${b.currentQuantity}, cần ${need}. Vui lòng chọn lô khác.`,
            });
          }
        }
        stageData.packedAt = now;
      }

      if (to === 'shipping') {
        const trackingCode = body.trackingCode ?? order.trackingCode;
        const provider = body.shippingProvider ?? order.shippingProvider;
        const isPickup = order.shippingMethod === 'pickup_at_warehouse';
        if (!isPickup && !trackingCode) {
          return reply.status(400).send({
            error: 'Bắt buộc có Mã vận đơn (tracking_code) trước khi chuyển sang Đang giao.',
          });
        }
        if (trackingCode) stageData.trackingCode = trackingCode;
        if (provider) stageData.shippingProvider = provider;
        stageData.shippedAt = now;
      }

      if (to === 'completed') {
        const total = toNumber(order.totalAmountValue ?? order.totalAmount);
        const paid = toNumber(order.paidAmount);
        const allowDebt = order.paymentMethod === 'credit';
        if (!allowDebt && paid < total) {
          return reply.status(400).send({
            error: `Đã thu ${paid.toLocaleString('vi-VN')} / cần ${total.toLocaleString('vi-VN')}. Chưa thu đủ tiền — chuyển payment_method sang "credit" nếu cho phép nợ.`,
          });
        }
        stageData.completedAt = now;
      }

      // ── Apply transition + side effects atomically ──
      await prisma.$transaction(async (tx: any) => {
        await tx.order.update({ where: { id: order.id }, data: stageData });

        if (to === 'packing') {
          await deductStockForOrder(order.id, user, tx);
        }

        if (to === 'completed') {
          await applyCompletionSideEffects(order.id, user, tx);
        }
      });

      const full = await prisma.order.findUnique({
        where: { id: order.id },
        include: ORDER_FULL_INCLUDE,
      });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[orders] Transition error:', err);
      return reply.status(500).send({ error: (err as Error).message || 'Failed to transition order' });
    }
  });

  // POST /api/v1/orders/:id/cancel — cancel + restock if needed
  app.post('/api/v1/orders/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as { cancelReason?: string };
      if (!body.cancelReason?.trim()) {
        return reply.status(400).send({ error: 'Vui lòng nhập lý do huỷ đơn' });
      }

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        include: { items: true, gifts: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const from = normalizeStatus(order.status);
      if (from === 'completed') {
        return reply.status(400).send({ error: 'Không thể huỷ đơn đã hoàn tất' });
      }
      if (from === 'cancelled') {
        return reply.status(400).send({ error: 'Đơn đã ở trạng thái huỷ' });
      }

      const stockWasDeducted = (
        ['packing', 'shipping'] as readonly OrderStatus[]
      ).includes(from);

      await prisma.$transaction(async (tx: any) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            cancelReason: body.cancelReason!.trim(),
            cancelledAt: new Date(),
          },
        });
        if (stockWasDeducted) {
          await restoreStockForOrder(order.id, user, tx);
        }
      });

      const full = await prisma.order.findUnique({
        where: { id: order.id },
        include: ORDER_FULL_INCLUDE,
      });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[orders] Cancel error:', err);
      return reply.status(500).send({ error: 'Failed to cancel order' });
    }
  });
}

// ─── Stock helpers (private) ──────────────────────────────────────────────
async function deductStockForOrder(
  orderId: string,
  user: { id: string; orgId: string; role: string },
  tx: any,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });
  const gifts = await tx.orderGift.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });

  for (const it of items) {
    if (!it.batchId || !it.productId) continue;
    await tx.inventoryBatch.update({
      where: { id: it.batchId },
      data: { currentQuantity: { decrement: it.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        orgId: user.orgId,
        productId: it.productId,
        batchId: it.batchId,
        type: 'export',
        quantity: -Math.round(it.quantity),
        referenceType: 'order',
        referenceId: orderId,
        note: `Đóng gói đơn (item ${it.id})`,
        createdById: user.id,
      },
    });
  }
  for (const g of gifts) {
    if (!g.batchId || !g.productId) continue;
    await tx.inventoryBatch.update({
      where: { id: g.batchId },
      data: { currentQuantity: { decrement: g.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        orgId: user.orgId,
        productId: g.productId,
        batchId: g.batchId,
        type: 'export',
        quantity: -g.quantity,
        referenceType: 'order',
        referenceId: orderId,
        note: `Đóng gói đơn — quà tặng (gift ${g.id})`,
        createdById: user.id,
      },
    });
  }
}

async function restoreStockForOrder(
  orderId: string,
  user: { id: string; orgId: string; role: string },
  tx: any,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });
  const gifts = await tx.orderGift.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });
  for (const it of items) {
    if (!it.batchId || !it.productId) continue;
    await tx.inventoryBatch.update({
      where: { id: it.batchId },
      data: { currentQuantity: { increment: it.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        orgId: user.orgId,
        productId: it.productId,
        batchId: it.batchId,
        type: 'return',
        quantity: Math.round(it.quantity),
        referenceType: 'order',
        referenceId: orderId,
        note: `Hoàn kho do huỷ đơn (item ${it.id})`,
        createdById: user.id,
      },
    });
  }
  for (const g of gifts) {
    if (!g.batchId || !g.productId) continue;
    await tx.inventoryBatch.update({
      where: { id: g.batchId },
      data: { currentQuantity: { increment: g.quantity } },
    });
    await tx.inventoryMovement.create({
      data: {
        orgId: user.orgId,
        productId: g.productId,
        batchId: g.batchId,
        type: 'return',
        quantity: g.quantity,
        referenceType: 'order',
        referenceId: orderId,
        note: `Hoàn kho do huỷ đơn — quà tặng (gift ${g.id})`,
        createdById: user.id,
      },
    });
  }
}

/**
 * Auto-updates triggered when an order moves to `completed`.
 *  - Update contact.lastOrderDate
 *  - Set first_contact_date if missing (for retention math)
 *  - Promote stage `dang_thu_hang → dai_ly_chinh_thuc` if this is the
 *    first completed order (handled in Session 2B — placeholder log here)
 */
async function applyCompletionSideEffects(
  orderId: string,
  user: { id: string; orgId: string; role: string },
  tx: any,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderDate: true,
      contactId: true,
      contact: { select: { firstContactDate: true } },
    },
  });

  await tx.contact.update({
    where: { id: order.contactId },
    data: {
      lastOrderDate: order.orderDate ?? new Date(),
      ...(order.contact.firstContactDate
        ? {}
        : { firstContactDate: order.orderDate ?? new Date() }),
    },
  });
}
