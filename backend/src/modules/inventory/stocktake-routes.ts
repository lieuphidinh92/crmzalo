/**
 * Kiểm kho (stocktaking) endpoints — Module Kho.
 *
 * A stocktake session snapshots every active lot in a warehouse with its
 * current system stock, the counter enters the physical count per lot, and on
 * completion each lot whose count differs from the LIVE stock is corrected via
 * a real adjustment + an `inventory_movements` audit row (type=adjust,
 * referenceType=stocktake). This reuses the same audit/sync machinery as the
 * manual batch-adjust endpoint so kiểm-kho corrections show up in the Audit log
 * and keep `Product.totalStock` in sync.
 *
 * Read endpoints are open to any authenticated user; cost-sensitive fields
 * (varianceValue / unitCost) are stripped for members. All mutations require
 * owner|admin.
 *
 * Design notes:
 *   - Only ONE open session (status=counting) is allowed per org at a time —
 *     concurrent counts would fight over the same lots.
 *   - The displayed `variance` (counted − systemQty snapshot) is informational.
 *     The applied adjustment at completion is recomputed against the lot's
 *     live currentQuantity, so a concurrent order packing mid-count cannot be
 *     silently reverted.
 *   - Uncounted lots (countedQty null) are left untouched on completion.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';

interface CreateSessionBody {
  warehouseId?: string;
  note?: string | null;
}

interface SaveCountsBody {
  items?: Array<{ id?: string; countedQty?: number | null; note?: string | null }>;
}

function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/** KK-YYYYMM-NNN — monthly sequence, mirrors generateImportCode (NK-...). */
async function generateStocktakeCode(orgId: string, when = new Date()): Promise<string> {
  const ym = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `KK-${ym}-`;
  const last = await prisma.stocktakeSession.findFirst({
    where: { orgId, code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const nextNum = last ? parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

/** "YYYY-MM" in local (server) time — used for the monthly-cadence reminder. */
function periodMonthOf(when = new Date()): string {
  return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
}

async function syncProductTotalStock(productId: string, tx?: any): Promise<void> {
  const client = tx ?? prisma;
  const sum = await client.inventoryBatch.aggregate({
    where: { productId, status: 'active' },
    _sum: { currentQuantity: true },
  });
  await client.product.update({
    where: { id: productId },
    data: { totalStock: sum._sum.currentQuantity ?? 0 },
  });
}

/** Drop cost-sensitive fields from a session row for members. */
function stripSessionCost<T extends { varianceValue?: unknown }>(s: T, role: string): T {
  if (canSeeCost(role)) return s;
  return { ...s, varianceValue: null };
}

export async function stocktakeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/inventory/stocktakes — list sessions ──────────────
  app.get('/api/v1/inventory/stocktakes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { status = '' } = request.query as Record<string, string>;
      const where: Prisma.StocktakeSessionWhereInput = { orgId: user.orgId };
      if (status) where.status = { in: status.split(',').filter(Boolean) };

      const sessions = await prisma.stocktakeSession.findMany({
        where,
        include: { warehouse: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Hydrate creator/completer names (no FK on those columns).
      const userIds = Array.from(
        new Set(
          sessions
            .flatMap((s: any) => [s.createdById, s.completedById])
            .filter((id: any): id is string => Boolean(id)),
        ),
      );
      const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
        : [];
      const userMap = new Map<string, string>(users.map((u: any) => [u.id, u.fullName]));

      const enriched = sessions.map((s: any) =>
        stripSessionCost(
          {
            ...s,
            createdByName: s.createdById ? userMap.get(s.createdById) ?? null : null,
            completedByName: s.completedById ? userMap.get(s.completedById) ?? null : null,
          },
          user.role,
        ),
      );
      return { sessions: enriched };
    } catch (err) {
      logger.error('[stocktake] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch stocktake sessions' });
    }
  });

  // ── GET /api/v1/inventory/stocktakes/:id — detail with items ──────
  app.get('/api/v1/inventory/stocktakes/:id', async (request, reply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const session = await prisma.stocktakeSession.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          warehouse: { select: { id: true, name: true } },
          items: {
            include: {
              batch: {
                select: {
                  id: true,
                  batchCode: true,
                  expiryDate: true,
                  status: true,
                  currentQuantity: true,
                  product: { select: { id: true, sku: true, name: true, unit: true, brand: { select: { id: true, name: true } } } },
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!session) return reply.status(404).send({ error: 'Không tìm thấy phiên kiểm kho' });

      const showCost = canSeeCost(user.role);
      const items = session.items.map((it: any) => ({
        ...it,
        unitCost: showCost ? it.unitCost : null,
      }));
      return stripSessionCost({ ...session, items }, user.role);
    } catch (err) {
      logger.error('[stocktake] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch stocktake session' });
    }
  });

  // ── POST /api/v1/inventory/stocktakes — admin: open a session ─────
  app.post(
    '/api/v1/inventory/stocktakes',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const body = (request.body ?? {}) as CreateSessionBody;

        // Only one open session at a time.
        const open = await prisma.stocktakeSession.findFirst({
          where: { orgId: user.orgId, status: 'counting' },
          select: { id: true, code: true },
        });
        if (open) {
          return reply.status(400).send({
            error: `Đang có phiên kiểm kho "${open.code}" chưa chốt. Hãy chốt hoặc huỷ trước khi tạo phiên mới.`,
          });
        }

        // Resolve warehouse: provided OR first active in org.
        let warehouseId = body.warehouseId ?? null;
        if (!warehouseId) {
          const wh = await prisma.warehouse.findFirst({
            where: { orgId: user.orgId, active: true },
            select: { id: true },
          });
          if (!wh) return reply.status(400).send({ error: 'Chưa có kho nào trong hệ thống' });
          warehouseId = wh.id;
        }

        // Snapshot every active lot in the warehouse (incl. zero-stock so the
        // counter can confirm phantom-empty lots too).
        const batches = await prisma.inventoryBatch.findMany({
          where: { orgId: user.orgId, warehouseId, status: 'active' },
          select: { id: true, productId: true, currentQuantity: true, importCost: true },
          orderBy: [{ expiryDate: 'asc' }, { importedAt: 'asc' }],
        });
        if (batches.length === 0) {
          return reply.status(400).send({ error: 'Kho chưa có lô hàng nào đang bán để kiểm.' });
        }

        const code = await generateStocktakeCode(user.orgId);
        const periodMonth = periodMonthOf();

        const created = await prisma.$transaction(async (tx: any) => {
          const s = await tx.stocktakeSession.create({
            data: {
              orgId: user.orgId,
              warehouseId,
              code,
              status: 'counting',
              periodMonth,
              note: body.note ?? null,
              itemCount: batches.length,
              createdById: user.id,
            },
          });
          await tx.stocktakeItem.createMany({
            data: batches.map((b: any) => ({
              sessionId: s.id,
              batchId: b.id,
              productId: b.productId,
              systemQty: b.currentQuantity,
              unitCost: b.importCost ?? null,
            })),
          });
          return s;
        });

        return reply.status(201).send({ id: created.id, code: created.code });
      } catch (err) {
        logger.error('[stocktake] Create error:', err);
        return reply.status(500).send({ error: 'Failed to create stocktake session' });
      }
    },
  );

  // ── PUT /api/v1/inventory/stocktakes/:id/items — admin: save counts
  app.put(
    '/api/v1/inventory/stocktakes/:id/items',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as SaveCountsBody;

        const session = await prisma.stocktakeSession.findFirst({
          where: { id, orgId: user.orgId },
          include: { items: { select: { id: true, systemQty: true, unitCost: true } } },
        });
        if (!session) return reply.status(404).send({ error: 'Không tìm thấy phiên kiểm kho' });
        if (session.status !== 'counting') {
          return reply.status(400).send({ error: 'Phiên đã chốt/huỷ, không thể sửa số đếm.' });
        }

        const updates = body.items ?? [];
        const itemMap = new Map<string, { systemQty: number; unitCost: any }>(
          session.items.map((it: any) => [it.id, { systemQty: it.systemQty, unitCost: it.unitCost }]),
        );

        await prisma.$transaction(async (tx: any) => {
          for (const u of updates) {
            if (!u.id || !itemMap.has(u.id)) continue;
            const base = itemMap.get(u.id)!;
            const counted =
              u.countedQty === null || u.countedQty === undefined
                ? null
                : Math.round(Number(u.countedQty));
            const variance = counted === null ? 0 : counted - base.systemQty;
            await tx.stocktakeItem.update({
              where: { id: u.id },
              data: {
                countedQty: counted,
                variance,
                note: u.note ?? undefined,
              },
            });
          }

          // Recompute session aggregates from the saved rows.
          const items = await tx.stocktakeItem.findMany({
            where: { sessionId: id },
            select: { countedQty: true, variance: true, unitCost: true },
          });
          let countedCount = 0;
          let varianceQty = 0;
          let varianceValue = new Prisma.Decimal(0);
          for (const it of items) {
            if (it.countedQty !== null) {
              countedCount += 1;
              varianceQty += it.variance;
              const cost = it.unitCost ?? new Prisma.Decimal(0);
              varianceValue = varianceValue.plus(new Prisma.Decimal(it.variance).times(cost));
            }
          }
          await tx.stocktakeSession.update({
            where: { id },
            data: { countedCount, varianceQty, varianceValue },
          });
        });

        return { ok: true };
      } catch (err) {
        logger.error('[stocktake] Save counts error:', err);
        return reply.status(500).send({ error: 'Failed to save counts' });
      }
    },
  );

  // ── POST /api/v1/inventory/stocktakes/:id/complete — admin: finalize
  app.post(
    '/api/v1/inventory/stocktakes/:id/complete',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };

        const session = await prisma.stocktakeSession.findFirst({
          where: { id, orgId: user.orgId },
          include: {
            items: {
              include: { batch: { select: { id: true, batchCode: true, status: true } } },
            },
          },
        });
        if (!session) return reply.status(404).send({ error: 'Không tìm thấy phiên kiểm kho' });
        if (session.status !== 'counting') {
          return reply.status(400).send({ error: 'Phiên đã chốt hoặc đã huỷ.' });
        }

        const affectedProductIds = new Set<string>();

        await prisma.$transaction(async (tx: any) => {
          for (const it of session.items) {
            if (it.countedQty === null || it.countedQty === undefined) continue;
            // Re-read live stock so a concurrent order packing isn't reverted.
            const live = await tx.inventoryBatch.findUnique({
              where: { id: it.batchId },
              select: { currentQuantity: true, status: true },
            });
            if (!live || live.status === 'recalled') continue;
            const delta = it.countedQty - live.currentQuantity;
            if (delta === 0) continue;

            await tx.inventoryBatch.update({
              where: { id: it.batchId },
              data: { currentQuantity: it.countedQty },
            });
            await tx.inventoryMovement.create({
              data: {
                orgId: user.orgId,
                productId: it.productId,
                batchId: it.batchId,
                type: 'adjust',
                quantity: delta,
                referenceType: 'stocktake',
                referenceId: session.id,
                note: `[${it.batch?.batchCode ?? ''}] Kiểm kho ${session.code}: ${delta > 0 ? '+' : ''}${delta}`,
                createdById: user.id,
              },
            });
            affectedProductIds.add(it.productId);
          }

          await tx.stocktakeSession.update({
            where: { id },
            data: { status: 'completed', completedById: user.id, completedAt: new Date() },
          });

          for (const pid of affectedProductIds) {
            await syncProductTotalStock(pid, tx);
          }
        });

        return { ok: true, adjusted: affectedProductIds.size };
      } catch (err) {
        logger.error('[stocktake] Complete error:', err);
        return reply.status(500).send({ error: 'Failed to complete stocktake' });
      }
    },
  );

  // ── POST /api/v1/inventory/stocktakes/:id/cancel — admin: cancel ──
  app.post(
    '/api/v1/inventory/stocktakes/:id/cancel',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const user = request.user!;
        const { id } = request.params as { id: string };
        const session = await prisma.stocktakeSession.findFirst({
          where: { id, orgId: user.orgId },
          select: { id: true, status: true },
        });
        if (!session) return reply.status(404).send({ error: 'Không tìm thấy phiên kiểm kho' });
        if (session.status !== 'counting') {
          return reply.status(400).send({ error: 'Chỉ huỷ được phiên đang kiểm.' });
        }
        await prisma.stocktakeSession.update({
          where: { id },
          data: { status: 'cancelled' },
        });
        return { ok: true };
      } catch (err) {
        logger.error('[stocktake] Cancel error:', err);
        return reply.status(500).send({ error: 'Failed to cancel stocktake' });
      }
    },
  );
}
