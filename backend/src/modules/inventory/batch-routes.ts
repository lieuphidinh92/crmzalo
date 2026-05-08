/**
 * Batch CRUD + adjust + audit endpoints (Session 3 — Module Kho).
 *
 * Read endpoints are open to any authenticated user. Mutating endpoints
 * (create / update metadata / adjust / recall) require owner|admin.
 *
 * Stock invariants:
 *   - currentQuantity is NEVER set directly via PUT. Use POST /:id/adjust
 *     so every change emits an `inventory_movements` audit row.
 *   - Order packing/cancellation already manage stock atomically (see
 *     order-transitions.ts) and emit movements with type=export/return.
 *   - Manual operations here use type=import (new lot received) and
 *     type=adjust (count correction). type=`return` is reserved for
 *     order cancellation; type=`export` for order packing.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';

const VALID_BATCH_STATUSES = ['active', 'expired', 'recalled'] as const;

interface CreateBatchBody {
  productId?: string;
  warehouseId?: string;
  batchCode?: string;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  importQuantity?: number;
  importCost?: number | null;
  notes?: string | null;
}

interface UpdateBatchBody {
  batchCode?: string;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
}

interface AdjustBody {
  delta?: number;
  reason?: string;
}

/** Members must not see cost/profit. Owners/admins see everything.
 * Centralized so future role tweaks happen in one place. */
function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** Strip `importCost` from a batch row when the caller is a member. */
function stripBatchCost<T extends { importCost?: unknown }>(b: T, role: string): T {
  if (canSeeCost(role)) return b;
  return { ...b, importCost: null };
}

async function syncProductTotalStock(productId: string): Promise<void> {
  const sum = await prisma.inventoryBatch.aggregate({
    where: { productId, status: 'active' },
    _sum: { currentQuantity: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { totalStock: sum._sum.currentQuantity ?? 0 },
  });
}

export async function batchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/inventory/batches — list with rich filters ────────
  app.get('/api/v1/inventory/batches', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        productId = '',
        brandId = '',
        warehouseId = '',
        status = '',
        expiryWindow = '',
        search = '',
      } = request.query as Record<string, string>;

      const filters: Prisma.InventoryBatchWhereInput[] = [{ orgId: user.orgId }];
      if (productId) filters.push({ productId });
      if (brandId) {
        filters.push({ product: { brandId: { in: brandId.split(',').filter(Boolean) } } });
      }
      if (warehouseId) filters.push({ warehouseId });
      if (status) {
        const sts = status.split(',').filter(Boolean);
        filters.push({ status: { in: sts } });
      }
      if (expiryWindow) {
        const now = new Date();
        if (expiryWindow === 'expired') {
          filters.push({ expiryDate: { lt: now } });
        } else {
          const days = parseInt(expiryWindow);
          if (!Number.isNaN(days) && days > 0) {
            const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            filters.push({ expiryDate: { not: null, gte: now, lt: horizon } });
          }
        }
      }
      if (search) {
        filters.push({
          OR: [
            { batchCode: { contains: search, mode: 'insensitive' } },
            { product: { sku: { contains: search, mode: 'insensitive' } } },
            { product: { name: { contains: search, mode: 'insensitive' } } },
          ],
        });
      }

      const where: Prisma.InventoryBatchWhereInput = filters.length > 1 ? { AND: filters } : { orgId: user.orgId };

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

      const [batches, total] = await Promise.all([
        prisma.inventoryBatch.findMany({
          where,
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true, brandId: true, brand: { select: { id: true, name: true } } } },
            warehouse: { select: { id: true, name: true } },
          },
          orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.inventoryBatch.count({ where }),
      ]);

      const now = Date.now();
      const enriched = batches.map((b: any) => {
        let warning: 'expired' | 'expiring_30' | 'expiring_60' | 'expiring_90' | null = null;
        if (b.expiryDate) {
          const days = (b.expiryDate.getTime() - now) / (24 * 60 * 60 * 1000);
          if (days < 0) warning = 'expired';
          else if (days < 30) warning = 'expiring_30';
          else if (days < 60) warning = 'expiring_60';
          else if (days < 90) warning = 'expiring_90';
        }
        return stripBatchCost({ ...b, warning }, user.role);
      });

      return { batches: enriched, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[batches] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch batches' });
    }
  });

  // ── GET /api/v1/products/:id/batches — kept for OrderProductPicker ─
  app.get('/api/v1/products/:id/batches', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { includeEmpty = '0' } = request.query as Record<string, string>;

      const product = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: 'Product not found' });

      const where: Prisma.InventoryBatchWhereInput = {
        orgId: user.orgId,
        productId: id,
        status: 'active',
      };
      if (includeEmpty !== '1') {
        where.currentQuantity = { gt: 0 };
      }

      const batches = await prisma.inventoryBatch.findMany({
        where,
        orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
        include: { warehouse: { select: { id: true, name: true } } },
      });
      const now = Date.now();
      const enriched = batches.map((b: any) => {
        let warning: 'expired' | 'expiring_soon' | null = null;
        if (b.expiryDate) {
          const days = (b.expiryDate.getTime() - now) / (24 * 60 * 60 * 1000);
          if (days < 0) warning = 'expired';
          else if (days < 90) warning = 'expiring_soon';
        }
        return { ...b, warning };
      });
      return { batches: enriched };
    } catch (err) {
      logger.error('[batches] By-product error:', err);
      return reply.status(500).send({ error: 'Failed to fetch batches' });
    }
  });

  // ── GET /api/v1/inventory/expiring — banner source ───────────────
  app.get('/api/v1/inventory/expiring', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { days = '90' } = request.query as Record<string, string>;
      const horizon = new Date(Date.now() + (parseInt(days) || 90) * 24 * 60 * 60 * 1000);
      const batches = await prisma.inventoryBatch.findMany({
        where: {
          orgId: user.orgId,
          status: 'active',
          currentQuantity: { gt: 0 },
          expiryDate: { not: null, lt: horizon },
        },
        orderBy: { expiryDate: 'asc' },
        include: { product: { select: { id: true, sku: true, name: true } } },
        take: 50,
      });
      return { batches };
    } catch (err) {
      logger.error('[batches] Expiring error:', err);
      return reply.status(500).send({ error: 'Failed to fetch expiring batches' });
    }
  });

  // ── GET /api/v1/inventory/batches/:id — detail with recent movements
  app.get('/api/v1/inventory/batches/:id', async (request, reply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const batch = await prisma.inventoryBatch.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, brand: { select: { id: true, name: true } } } },
          warehouse: { select: { id: true, name: true } },
        },
      });
      if (!batch) return reply.status(404).send({ error: 'Batch not found' });
      return stripBatchCost(batch, user.role);
    } catch (err) {
      logger.error('[batches] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch batch' });
    }
  });

  // ── POST /api/v1/inventory/batches — admin: import new lot ────────
  app.post(
    '/api/v1/inventory/batches',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const body = request.body as CreateBatchBody;

        if (!body.productId) return reply.status(400).send({ error: 'productId là bắt buộc' });
        if (!body.batchCode?.trim()) return reply.status(400).send({ error: 'Mã lô là bắt buộc' });
        if (!body.importQuantity || body.importQuantity <= 0) {
          return reply.status(400).send({ error: 'Số lượng nhập phải > 0' });
        }

        const product = await prisma.product.findFirst({
          where: { id: body.productId, orgId: user.orgId },
          select: { id: true, costPrice: true },
        });
        if (!product) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

        // Resolve warehouse: provided OR first active in org
        let warehouseId = body.warehouseId ?? null;
        if (!warehouseId) {
          const wh = await prisma.warehouse.findFirst({
            where: { orgId: user.orgId, active: true },
            select: { id: true },
          });
          if (!wh) return reply.status(400).send({ error: 'Chưa có kho nào trong hệ thống' });
          warehouseId = wh.id;
        }

        const batchCode = body.batchCode.trim();
        const dup = await prisma.inventoryBatch.findFirst({
          where: { orgId: user.orgId, productId: product.id, batchCode },
          select: { id: true },
        });
        if (dup) {
          return reply.status(400).send({
            error: `Lô "${batchCode}" đã tồn tại cho sản phẩm này`,
          });
        }

        const qty = Math.round(body.importQuantity);
        const created = await prisma.$transaction(async (tx: any) => {
          const b = await tx.inventoryBatch.create({
            data: {
              orgId: user.orgId,
              productId: product.id,
              warehouseId,
              batchCode,
              manufactureDate: body.manufactureDate ? new Date(body.manufactureDate) : null,
              expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
              importQuantity: qty,
              currentQuantity: qty,
              importCost: body.importCost ?? product.costPrice ?? null,
              notes: body.notes ?? null,
              createdById: user.id,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              orgId: user.orgId,
              productId: product.id,
              batchId: b.id,
              type: 'import',
              quantity: qty,
              referenceType: 'manual_import',
              note: `Nhập lô mới ${batchCode}`,
              createdById: user.id,
            },
          });
          return b;
        });

        await syncProductTotalStock(product.id);

        const full = await prisma.inventoryBatch.findUnique({
          where: { id: created.id },
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true, brand: { select: { id: true, name: true } } } },
            warehouse: { select: { id: true, name: true } },
          },
        });
        return reply.status(201).send(full);
      } catch (err) {
        logger.error('[batches] Create error:', err);
        return reply.status(500).send({ error: 'Failed to create batch' });
      }
    },
  );

  // ── PUT /api/v1/inventory/batches/:id — admin: edit metadata only ─
  app.put(
    '/api/v1/inventory/batches/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as UpdateBatchBody;

        const existing = await prisma.inventoryBatch.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, productId: true, batchCode: true },
        });
        if (!existing) return reply.status(404).send({ error: 'Batch not found' });

        const data: Prisma.InventoryBatchUpdateInput = {};
        if (body.batchCode !== undefined) {
          const code = body.batchCode.trim();
          if (!code) return reply.status(400).send({ error: 'Mã lô không được rỗng' });
          if (code !== existing.batchCode) {
            const clash = await prisma.inventoryBatch.findFirst({
              where: { orgId: user.orgId, productId: existing.productId, batchCode: code, NOT: { id } },
              select: { id: true },
            });
            if (clash) return reply.status(400).send({ error: 'Mã lô đã tồn tại trên SP này' });
          }
          data.batchCode = code;
        }
        if (body.manufactureDate !== undefined) {
          data.manufactureDate = body.manufactureDate ? new Date(body.manufactureDate) : null;
        }
        if (body.expiryDate !== undefined) {
          data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
        }
        if (body.notes !== undefined) data.notes = body.notes;

        const updated = await prisma.inventoryBatch.update({
          where: { id },
          data,
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true, brand: { select: { id: true, name: true } } } },
            warehouse: { select: { id: true, name: true } },
          },
        });
        return updated;
      } catch (err) {
        logger.error('[batches] Update error:', err);
        return reply.status(500).send({ error: 'Failed to update batch' });
      }
    },
  );

  // ── POST /api/v1/inventory/batches/:id/adjust — admin: stock adjust
  app.post(
    '/api/v1/inventory/batches/:id/adjust',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = request.body as AdjustBody;

        if (typeof body.delta !== 'number' || body.delta === 0) {
          return reply.status(400).send({ error: 'delta phải là số khác 0' });
        }
        if (!body.reason?.trim()) {
          return reply.status(400).send({ error: 'Lý do điều chỉnh là bắt buộc' });
        }

        const batch = await prisma.inventoryBatch.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, productId: true, currentQuantity: true, batchCode: true },
        });
        if (!batch) return reply.status(404).send({ error: 'Batch not found' });

        const delta = Math.round(body.delta);
        const newQty = batch.currentQuantity + delta;
        // Allow negative — surfaces real counting errors. Frontend warns.

        await prisma.$transaction(async (tx: any) => {
          await tx.inventoryBatch.update({
            where: { id },
            data: { currentQuantity: newQty },
          });
          await tx.inventoryMovement.create({
            data: {
              orgId: user.orgId,
              productId: batch.productId,
              batchId: batch.id,
              type: 'adjust',
              quantity: delta,
              referenceType: 'manual_adjust',
              note: `[${batch.batchCode}] ${body.reason!.trim()}`,
              createdById: user.id,
            },
          });
        });

        await syncProductTotalStock(batch.productId);

        const full = await prisma.inventoryBatch.findUnique({
          where: { id },
          include: {
            product: { select: { id: true, sku: true, name: true, unit: true, brand: { select: { id: true, name: true } } } },
            warehouse: { select: { id: true, name: true } },
          },
        });
        return full;
      } catch (err) {
        logger.error('[batches] Adjust error:', err);
        return reply.status(500).send({ error: 'Failed to adjust batch' });
      }
    },
  );

  // ── POST /api/v1/inventory/batches/:id/recall — admin: recall lot ─
  app.post(
    '/api/v1/inventory/batches/:id/recall',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as { reason?: string };
        if (!body.reason?.trim()) {
          return reply.status(400).send({ error: 'Lý do thu hồi là bắt buộc' });
        }

        const batch = await prisma.inventoryBatch.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, productId: true, currentQuantity: true, batchCode: true, status: true },
        });
        if (!batch) return reply.status(404).send({ error: 'Batch not found' });
        if (batch.status === 'recalled') {
          return reply.status(400).send({ error: 'Lô đã ở trạng thái thu hồi' });
        }

        await prisma.$transaction(async (tx: any) => {
          await tx.inventoryBatch.update({
            where: { id },
            data: { status: 'recalled' },
          });
          // If there was active stock, write a "recall" adjust to zero it
          // out so the audit trail reflects what was removed from sellable
          // inventory.
          if (batch.currentQuantity > 0) {
            await tx.inventoryBatch.update({
              where: { id },
              data: { currentQuantity: 0 },
            });
            await tx.inventoryMovement.create({
              data: {
                orgId: user.orgId,
                productId: batch.productId,
                batchId: batch.id,
                type: 'adjust',
                quantity: -batch.currentQuantity,
                referenceType: 'manual_adjust',
                note: `[${batch.batchCode}] THU HỒI: ${body.reason!.trim()}`,
                createdById: user.id,
              },
            });
          }
        });

        await syncProductTotalStock(batch.productId);

        const full = await prisma.inventoryBatch.findUnique({
          where: { id },
          include: {
            product: { select: { id: true, sku: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        });
        return full;
      } catch (err) {
        logger.error('[batches] Recall error:', err);
        return reply.status(500).send({ error: 'Failed to recall batch' });
      }
    },
  );

  // ── GET /api/v1/inventory/movements — audit log ───────────────────
  app.get('/api/v1/inventory/movements', async (request, reply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        productId = '',
        batchId = '',
        type = '',
        from = '',
        to = '',
      } = request.query as Record<string, string>;

      const where: Prisma.InventoryMovementWhereInput = { orgId: user.orgId };
      if (productId) where.productId = productId;
      if (batchId) where.batchId = batchId;
      if (type) where.type = { in: type.split(',').filter(Boolean) };
      if (from || to) {
        where.createdAt = {};
        if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
        if (to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to + 'T23:59:59');
      }

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

      const [movements, total] = await Promise.all([
        prisma.inventoryMovement.findMany({
          where,
          include: {
            batch: { select: { id: true, batchCode: true, productId: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.inventoryMovement.count({ where }),
      ]);

      // Hydrate product/user info, plus polymorphic reference lookups
      // for order vs import_order — referenceId is no longer a Prisma
      // FK (movements can point at either parent type).
      const productIds = Array.from(new Set(movements.map((m: any) => m.productId)));
      const userIds = Array.from(
        new Set(
          movements
            .map((m: any) => m.createdById)
            .filter((id: any): id is string => Boolean(id)),
        ),
      );
      const orderIds = Array.from(
        new Set(
          movements
            .filter((m: any) => m.referenceType === 'order' && m.referenceId)
            .map((m: any) => m.referenceId as string),
        ),
      );
      const importOrderIds = Array.from(
        new Set(
          movements
            .filter((m: any) => m.referenceType === 'import_order' && m.referenceId)
            .map((m: any) => m.referenceId as string),
        ),
      );
      const [products, users, orders, imports] = await Promise.all([
        prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, name: true } }),
        prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
        orderIds.length
          ? prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderCode: true } })
          : Promise.resolve([] as Array<{ id: string; orderCode: string }>),
        importOrderIds.length
          ? prisma.importOrder.findMany({ where: { id: { in: importOrderIds } }, select: { id: true, importCode: true } })
          : Promise.resolve([] as Array<{ id: string; importCode: string }>),
      ]);
      const productMap = new Map<string, { id: string; sku: string; name: string }>(
        products.map((p: any) => [p.id, p]),
      );
      const userMap = new Map<string, string>(users.map((u: any) => [u.id, u.fullName]));
      const orderMap = new Map<string, { id: string; orderCode: string }>(
        orders.map((o: any) => [o.id, o]),
      );
      const importMap = new Map<string, { id: string; importCode: string }>(
        imports.map((i: any) => [i.id, i]),
      );

      const enriched = movements.map((m: any) => ({
        ...m,
        product: productMap.get(m.productId) ?? null,
        createdByName: m.createdById ? userMap.get(m.createdById) ?? null : null,
        order:
          m.referenceType === 'order' && m.referenceId
            ? orderMap.get(m.referenceId) ?? null
            : null,
        importOrder:
          m.referenceType === 'import_order' && m.referenceId
            ? importMap.get(m.referenceId) ?? null
            : null,
      }));

      return { movements: enriched, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[movements] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch movements' });
    }
  });
}
