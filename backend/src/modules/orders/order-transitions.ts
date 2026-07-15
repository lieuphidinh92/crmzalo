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
import {
  processFIFO,
  reverseFIFO,
  validateFifoStock,
} from './fifo-service.js';
import { uploadToStorage, extForMime } from '../../shared/storage/supabase-storage.js';

interface TransitionBody {
  to_status?: string;
  toStatus?: string;
  trackingCode?: string;
  shippingProvider?: string;
  shipperPhone?: string;
  shippingPhotos?: string[];
  handoverPhotos?: string[];
  handoverNote?: string;
  deliveryPhotos?: string[];
  cancelReason?: string;
}

// Chuẩn hoá mảng URL ảnh gửi lên (bỏ rỗng, giới hạn 10 ảnh).
function cleanPhotoUrls(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    .map((u) => u.trim())
    .slice(0, 10);
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
      if (to === 'returned') {
        return reply.status(400).send({ error: 'Dùng /return để đánh dấu đơn hoàn (yêu cầu lý do)' });
      }
      if (!canTransition(from, to)) {
        return reply.status(400).send({
          error: `Không thể chuyển từ ${from} → ${to}. Chỉ được chuyển qua bước kế tiếp.`,
        });
      }

      // ── Per-target validation ──
      const now = new Date();
      const stageData: Prisma.OrderUpdateInput = { status: to };

      // Trừ kho FIFO + chốt giá vốn xảy ra khi đơn rời "Đã xác nhận" lần đầu —
      // dù qua bước packing (luồng CRM cũ) hay đi thẳng shipping từ confirmed
      // (luồng mới, sale-app đã bỏ Đóng gói). Guard from==='confirmed' để đơn cũ
      // đã trừ ở packing (packing→shipping) KHÔNG bị trừ lần hai.
      const deductsStockNow = to === 'packing' || (to === 'shipping' && from === 'confirmed');

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

      if (deductsStockNow) {
        if (order.legacyCost) {
          // Legacy path: every line item must have a batch picked, every
          // batch must have enough stock. Pre-FIFO MISA imports stay on
          // this flow so their snapshot unit_cost stays untouched.
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
        } else {
          // FIFO path: items don't need a batch picked — the allocator
          // chooses one (or several) automatically. Gifts still go through
          // the manual batch flow because clearance lots are usually
          // hand-picked. Validate availability up-front so we can return
          // 400 without entering the write transaction.
          const giftStockNeed = new Map<string, number>();
          for (const g of order.gifts) {
            if (g.batchId) {
              giftStockNeed.set(g.batchId, (giftStockNeed.get(g.batchId) ?? 0) + g.quantity);
            }
          }
          if (giftStockNeed.size > 0) {
            type BatchSnapshot = { id: string; batchCode: string; currentQuantity: number };
            const giftBatches = await prisma.inventoryBatch.findMany({
              where: { id: { in: Array.from(giftStockNeed.keys()) } },
              select: { id: true, batchCode: true, currentQuantity: true },
            });
            const map = new Map<string, BatchSnapshot>(
              giftBatches.map((b: BatchSnapshot) => [b.id, b]),
            );
            for (const [batchId, need] of giftStockNeed) {
              const b = map.get(batchId);
              if (!b) {
                return reply.status(400).send({ error: `Lô quà tặng ${batchId} không tồn tại` });
              }
              if (b.currentQuantity < need) {
                return reply.status(400).send({
                  error: `Lô quà tặng ${b.batchCode} chỉ còn ${b.currentQuantity}, cần ${need}.`,
                });
              }
            }
          }
          // Sum-per-product FIFO availability check.
          try {
            await validateFifoStock(prisma, order.id);
          } catch (e: any) {
            return reply.status(400).send({ error: e.message ?? 'Không đủ tồn FIFO' });
          }
        }
        stageData.packedAt = now;
      }

      if (to === 'shipping') {
        const trackingCode = (body.trackingCode ?? order.trackingCode ?? '').trim();
        const provider = (body.shippingProvider ?? order.shippingProvider ?? '').trim();
        const shipperPhone = (body.shipperPhone ?? order.shipperPhone ?? '').trim();
        const photos = cleanPhotoUrls(
          body.shippingPhotos ?? (order.shippingPhotos as unknown),
        );
        const isPickup = order.shippingMethod === 'pickup_at_warehouse';
        // Đơn giao (không phải khách tự lấy): bắt buộc đủ thông tin giao hàng.
        if (!isPickup) {
          if (!trackingCode) {
            return reply.status(400).send({ error: 'Bắt buộc có Mã vận đơn trước khi chuyển sang Đang giao.' });
          }
          if (!provider) {
            return reply.status(400).send({ error: 'Bắt buộc có Đơn vị vận chuyển / Số ship.' });
          }
          if (!shipperPhone) {
            return reply.status(400).send({ error: 'Bắt buộc có SĐT shipper.' });
          }
          if (photos.length === 0) {
            return reply.status(400).send({ error: 'Bắt buộc có ít nhất 1 ảnh chụp lúc bàn giao vận chuyển.' });
          }
        }
        if (trackingCode) stageData.trackingCode = trackingCode;
        if (provider) stageData.shippingProvider = provider;
        if (shipperPhone) stageData.shipperPhone = shipperPhone;
        if (photos.length) stageData.shippingPhotos = photos;
        stageData.shippedAt = now;
      }

      if (to === 'completed') {
        // Bằng chứng giao thành công: biên bản bàn giao (ảnh/file) + ảnh giao thành công.
        const handoverPhotos = cleanPhotoUrls(
          body.handoverPhotos ?? (order.handoverPhotos as unknown),
        );
        const handoverNote = (body.handoverNote ?? order.handoverNote ?? '').trim();
        const deliveryPhotos = cleanPhotoUrls(
          body.deliveryPhotos ?? (order.deliveryPhotos as unknown),
        );
        if (handoverPhotos.length === 0) {
          return reply.status(400).send({ error: 'Bắt buộc đính kèm ảnh/file biên bản bàn giao trước khi Giao thành công.' });
        }
        if (deliveryPhotos.length === 0) {
          return reply.status(400).send({ error: 'Bắt buộc có ít nhất 1 ảnh chụp đơn giao thành công.' });
        }
        // KHÔNG chặn theo thanh toán: cho phép Giao thành công dù chưa thu đủ
        // tiền (đơn công nợ được theo dõi & thu ở màn Công nợ).
        stageData.handoverPhotos = handoverPhotos;
        if (handoverNote) stageData.handoverNote = handoverNote;
        stageData.deliveryPhotos = deliveryPhotos;
        stageData.completedAt = now;
      }

      // ── Apply transition + side effects atomically ──
      // FIFO packing needs Serializable so two concurrent packs that each
      // see enough stock can't both succeed (Postgres surfaces the
      // conflict as P2034 → caller returns 409).
      const txOpts: { isolationLevel?: Prisma.TransactionIsolationLevel } =
        deductsStockNow && !order.legacyCost
          ? { isolationLevel: 'Serializable' as Prisma.TransactionIsolationLevel }
          : {};
      try {
        await prisma.$transaction(async (tx: any) => {
          await tx.order.update({ where: { id: order.id }, data: stageData });

          if (deductsStockNow) {
            if (order.legacyCost) {
              await deductStockForOrder(order.id, user, tx);
            } else {
              await processFIFO(tx, order.id, user);
              await deductGiftsOnly(order.id, user, tx);
            }
          }

          if (to === 'completed') {
            await applyCompletionSideEffects(order.id, user, tx);
          }
        }, txOpts);
      } catch (e: any) {
        if (e?.code === 'P2034') {
          return reply.status(409).send({
            error: 'Đơn vừa được đóng gói bởi giao dịch khác. Vui lòng tải lại và thử lại.',
          });
        }
        // FIFO race: validate passed but allocator found stock drained.
        // Surface as 409 so frontend can prompt retry.
        if (typeof e?.message === 'string' && e.message.includes('Tồn kho thay đổi')) {
          return reply.status(409).send({ error: e.message });
        }
        throw e;
      }

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

  // POST /api/v1/orders/:id/photos — upload 1 ảnh (giao hàng / giao thành công)
  // → Supabase Storage → trả URL. Ai xem được đơn thì upload được (khớp scope
  // với quyền chuyển trạng thái). Frontend gom URL rồi gửi kèm khi transition.
  app.post('/api/v1/orders/:id/photos', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        select: { id: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const file = await (request as any).file?.();
      if (!file) return reply.status(400).send({ error: 'Thiếu file ảnh' });
      const mime = String(file.mimetype || '');
      if (!extForMime(mime)) {
        return reply.status(400).send({ error: 'Chỉ nhận ảnh JPG/PNG/WEBP hoặc PDF' });
      }
      const buffer = await file.toBuffer();
      if (buffer.length === 0) return reply.status(400).send({ error: 'File rỗng' });

      const url = await uploadToStorage(buffer, mime, 'orders', order.id);
      return reply.status(201).send({ url });
    } catch (err: any) {
      const code = err?.statusCode;
      if (code && code >= 400 && code < 600) {
        return reply.status(code).send({ error: err.message });
      }
      logger.error('[orders] upload photo error:', err);
      return reply.status(500).send({ error: 'Lỗi upload ảnh đơn hàng' });
    }
  });

  // PATCH /api/v1/orders/:id/documents — bổ sung/sửa tài liệu (ảnh/file) của
  // từng giai đoạn mà KHÔNG đổi trạng thái đơn. Cho phép thêm bằng chứng sau
  // khi đơn đã đi qua giai đoạn đó.
  app.patch('/api/v1/orders/:id/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        shippingPhotos?: string[];
        handoverPhotos?: string[];
        deliveryPhotos?: string[];
      };
      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const data: Prisma.OrderUpdateInput = {};
      if (body.shippingPhotos !== undefined) data.shippingPhotos = cleanPhotoUrls(body.shippingPhotos);
      if (body.handoverPhotos !== undefined) data.handoverPhotos = cleanPhotoUrls(body.handoverPhotos);
      if (body.deliveryPhotos !== undefined) data.deliveryPhotos = cleanPhotoUrls(body.deliveryPhotos);
      if (Object.keys(data).length === 0) {
        return reply.status(400).send({ error: 'Không có tài liệu nào để cập nhật' });
      }

      await prisma.order.update({ where: { id: order.id }, data });
      const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_FULL_INCLUDE });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[orders] Update documents error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật tài liệu đơn' });
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
          if (order.legacyCost) {
            await restoreStockForOrder(order.id, user, tx);
          } else {
            await reverseFIFO(tx, order.id, user);
            await restoreGiftsOnly(order.id, user, tx);
          }
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

  // POST /api/v1/orders/:id/return — mark a DELIVERED order returned.
  // Only allowed from `completed` (a shipped/delivered order the customer
  // sent back). Restocks inventory exactly like /cancel (stock was already
  // deducted at packing) and excludes the order from revenue/debt via
  // NON_REVENUE_STATUSES. Admin-only: reversing a completed sale is a
  // financial action that should stay with owner/admin.
  app.post('/api/v1/orders/:id/return', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (user.role !== 'owner' && user.role !== 'admin') {
        return reply.status(403).send({ error: 'Chỉ Quản lý (owner/admin) được đánh dấu đơn hoàn' });
      }
      const { id } = request.params as { id: string };
      const body = request.body as { returnReason?: string };
      if (!body.returnReason?.trim()) {
        return reply.status(400).send({ error: 'Vui lòng nhập lý do hoàn đơn' });
      }

      const baseScope = orderScopeWhere(user);
      const order = await prisma.order.findFirst({
        where: { AND: [baseScope, { id }] },
        include: { items: true, gifts: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const from = normalizeStatus(order.status);
      if (from === 'returned') {
        return reply.status(400).send({ error: 'Đơn đã ở trạng thái hoàn' });
      }
      if (from !== 'completed') {
        return reply.status(400).send({
          error: 'Chỉ đơn đã "Giao thành công" mới đánh dấu hoàn được. Đơn chưa giao xong dùng Huỷ đơn.',
        });
      }

      // A completed order always had its stock deducted at packing → restock.
      await prisma.$transaction(async (tx: any) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'returned',
            returnReason: body.returnReason!.trim(),
            returnedAt: new Date(),
          },
        });
        if (order.legacyCost) {
          await restoreStockForOrder(order.id, user, tx);
        } else {
          await reverseFIFO(tx, order.id, user);
          await restoreGiftsOnly(order.id, user, tx);
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
      logger.error('[orders] Return error:', err);
      return reply.status(500).send({ error: 'Failed to mark order returned' });
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

/** FIFO path counterpart: deduct stock for `order_gifts` rows that
 * carry an explicit `batchId`. Items are handled by `processFIFO`. */
async function deductGiftsOnly(
  orderId: string,
  user: { id: string; orgId: string; role: string },
  tx: any,
): Promise<void> {
  const gifts = await tx.orderGift.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });
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

/** Restore counterpart for `deductGiftsOnly`. */
async function restoreGiftsOnly(
  orderId: string,
  user: { id: string; orgId: string; role: string },
  tx: any,
): Promise<void> {
  const gifts = await tx.orderGift.findMany({
    where: { orderId, batchId: { not: null } },
    select: { id: true, productId: true, batchId: true, quantity: true },
  });
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
 *    first completed order on a contact still in trial. Records the
 *    transition in stage_history so the resale/pipeline reports see it.
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
      contact: { select: { firstContactDate: true, stage: true } },
    },
  });

  const completionDate = order.orderDate ?? new Date();
  const data: Record<string, unknown> = {
    lastOrderDate: completionDate,
  };
  if (!order.contact.firstContactDate) {
    data.firstContactDate = completionDate;
  }

  // Auto-promote: dang_thu_hang → dai_ly_chinh_thuc on first completed order.
  // We check there is no PRIOR completed order on this contact (so we only
  // promote once). Use Prisma `findFirst` excluding the current order id.
  let promotedStage: string | null = null;
  if (order.contact.stage === 'dang_thu_hang') {
    const priorCompleted = await tx.order.count({
      where: {
        contactId: order.contactId,
        status: 'completed',
        id: { not: orderId },
      },
    });
    if (priorCompleted === 0) {
      promotedStage = 'dai_ly_chinh_thuc';
      data.stage = 'dai_ly_chinh_thuc';
      data.stageUpdatedAt = new Date();
    }
  }

  await tx.contact.update({
    where: { id: order.contactId },
    data,
  });

  if (promotedStage) {
    await tx.stageHistory.create({
      data: {
        contactId: order.contactId,
        fromStage: 'dang_thu_hang',
        toStage: 'dai_ly_chinh_thuc',
        changedAt: new Date(),
        changedByUserId: user.id,
        reason: `Tự động chuyển khi đơn ${orderId.slice(0, 8)} hoàn tất`,
      },
    });
  }
}
