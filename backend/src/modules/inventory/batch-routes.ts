/**
 * Read-only inventory endpoints used by the order entry flow:
 *  - GET /api/v1/products/:id/batches    → list active batches with stock
 *  - GET /api/v1/inventory/expiring      → batches expiring within N days
 *
 * Full inventory management UI (manual import, adjust, audit log) is
 * Session 3.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function batchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/products/:id/batches — FIFO-sorted (earliest expiry first)
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

      const where: Record<string, unknown> = {
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
      logger.error('[batches] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch batches' });
    }
  });

  // GET /api/v1/inventory/expiring?days=90 — used for the dashboard banner
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
        include: {
          product: { select: { id: true, sku: true, name: true } },
        },
        take: 50,
      });
      return { batches };
    } catch (err) {
      logger.error('[batches] Expiring error:', err);
      return reply.status(500).send({ error: 'Failed to fetch expiring batches' });
    }
  });
}
