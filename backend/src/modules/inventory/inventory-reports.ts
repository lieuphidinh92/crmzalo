/**
 * Inventory aggregate / report endpoints (Session 3).
 *
 *  - GET /api/v1/inventory/summary    → 4 KPI cards on InventoryView
 *  - GET /api/v1/inventory/by-brand   → table grouped by brand
 *  - GET /api/v1/inventory/low-stock  → products with totalStock <= warning
 *
 * Read-only, scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

/** stockValue = sum(qty × cost) → bí mật, chỉ owner/admin thấy. */
function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export async function inventoryReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/inventory/summary — 4 KPIs
  app.get('/api/v1/inventory/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const now = new Date();
      const horizon90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      const [
        skuTotal,
        skuOutOfStock,
        batchActive,
        expiringSoon,
        valueAgg,
      ] = await Promise.all([
        prisma.product.count({
          where: { orgId: user.orgId, status: { in: ['active', 'coming_soon'] } },
        }),
        prisma.product.count({
          where: { orgId: user.orgId, status: { in: ['active', 'coming_soon'] }, totalStock: 0 },
        }),
        prisma.inventoryBatch.count({
          where: { orgId: user.orgId, status: 'active', currentQuantity: { gt: 0 } },
        }),
        prisma.inventoryBatch.count({
          where: {
            orgId: user.orgId,
            status: 'active',
            currentQuantity: { gt: 0 },
            expiryDate: { not: null, lt: horizon90, gte: now },
          },
        }),
        // Sum (currentQuantity * importCost) — best-effort cost value of stock.
        // Prisma can't do row-multiply; pull all rows. Inventory rarely
        // exceeds a few hundred batches per org so this is fine.
        prisma.inventoryBatch.findMany({
          where: { orgId: user.orgId, status: 'active' },
          select: { currentQuantity: true, importCost: true },
        }),
      ]);

      const stockValue = valueAgg.reduce((sum: number, b: any) => {
        const cost = b.importCost == null ? 0 : Number(b.importCost);
        return sum + (b.currentQuantity || 0) * cost;
      }, 0);

      return {
        skuTotal,
        skuOutOfStock,
        batchActive,
        expiringSoon,
        stockValue: canSeeCost(user.role) ? stockValue : null,
      };
    } catch (err) {
      logger.error('[inventory] Summary error:', err);
      return reply.status(500).send({ error: 'Failed to fetch summary' });
    }
  });

  // GET /api/v1/inventory/by-brand — group by brand
  app.get('/api/v1/inventory/by-brand', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const brands = await prisma.brand.findMany({
        where: { orgId: user.orgId, active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const result: Array<{
        brandId: string;
        brandName: string;
        productCount: number;
        batchCount: number;
        totalQuantity: number;
        stockValue: number | null;
        expiringCount: number;
      }> = [];
      const now = new Date();
      const horizon90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      for (const b of brands) {
        const [productCount, batches, expiringCount] = await Promise.all([
          prisma.product.count({
            where: { orgId: user.orgId, brandId: b.id, status: { not: 'discontinued' } },
          }),
          prisma.inventoryBatch.findMany({
            where: { orgId: user.orgId, status: 'active', product: { brandId: b.id } },
            select: { currentQuantity: true, importCost: true },
          }),
          prisma.inventoryBatch.count({
            where: {
              orgId: user.orgId,
              status: 'active',
              currentQuantity: { gt: 0 },
              expiryDate: { not: null, lt: horizon90, gte: now },
              product: { brandId: b.id },
            },
          }),
        ]);
        const totalQuantity = batches.reduce((s: number, x: any) => s + (x.currentQuantity || 0), 0);
        const stockValue = batches.reduce(
          (s: number, x: any) => s + (x.currentQuantity || 0) * (x.importCost == null ? 0 : Number(x.importCost)),
          0,
        );
        result.push({
          brandId: b.id,
          brandName: b.name,
          productCount,
          batchCount: batches.length,
          totalQuantity,
          stockValue: canSeeCost(user.role) ? stockValue : null,
          expiringCount,
        });
      }
      return { brands: result };
    } catch (err) {
      logger.error('[inventory] By-brand error:', err);
      return reply.status(500).send({ error: 'Failed to fetch by-brand' });
    }
  });

  // GET /api/v1/inventory/low-stock — products at/below warning threshold
  app.get('/api/v1/inventory/low-stock', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const products = await prisma.product.findMany({
        where: { orgId: user.orgId, status: { not: 'discontinued' } },
        include: { brand: { select: { id: true, name: true } } },
        orderBy: { totalStock: 'asc' },
      });
      const filtered = products.filter((p: any) => p.totalStock <= p.warningStock);
      return { products: filtered };
    } catch (err) {
      logger.error('[inventory] Low-stock error:', err);
      return reply.status(500).send({ error: 'Failed to fetch low-stock' });
    }
  });
}
