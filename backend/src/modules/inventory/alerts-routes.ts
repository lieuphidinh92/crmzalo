/**
 * Inventory alerts (Session 3.5D-2).
 *
 * One endpoint that consolidates the three warehouse-wide health
 * signals the dashboard banner needs:
 *
 *   - lowStock:   products with totalStock <= warningStock
 *   - expiringIn90: active batches whose HSD lands in the next 90 days
 *   - expired:    batches that already passed HSD but still carry stock
 *                 (cron sweeps `status='active'` → `'expired'` daily;
 *                 we surface BOTH unswept-active and post-cron expired
 *                 lots that still need disposal so admin sees them).
 *
 * The two import-time warnings (cost > price, price-jump) live on
 * `/imports/:id/warnings` because they're per-import, not warehouse-
 * wide — keeping endpoints distinct so frontend can poll dashboard
 * cheaply without recomputing per-line price comparisons.
 *
 * No cost field in the response → safe to expose to every role.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

interface LowStockRow {
  productId: string;
  sku: string;
  name: string;
  totalStock: number;
  warningStock: number;
  unit: string | null;
}

interface BatchAlertRow {
  batchId: string;
  batchCode: string;
  productId: string;
  productSku: string;
  productName: string;
  expiryDate: string | null;
  currentQuantity: number;
  daysLeft: number; // negative when already past HSD
}

export async function inventoryAlertsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/api/v1/inventory/alerts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user!;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const horizon90 = new Date(todayStart.getTime() + 90 * 24 * 60 * 60 * 1000);

        // Pull all the candidates concurrently — three independent reads.
        const [lowStockProducts, expiringBatches, expiredBatches] = await Promise.all([
          prisma.product.findMany({
            where: {
              orgId: user.orgId,
              status: 'active', // skip 'coming_soon' (chưa nhập là bình thường) + 'discontinued'
            },
            select: {
              id: true,
              sku: true,
              name: true,
              unit: true,
              totalStock: true,
              warningStock: true,
            },
            orderBy: { totalStock: 'asc' },
          }),
          prisma.inventoryBatch.findMany({
            where: {
              orgId: user.orgId,
              status: 'active',
              currentQuantity: { gt: 0 },
              expiryDate: { not: null, gte: todayStart, lt: horizon90 },
            },
            include: {
              product: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { expiryDate: 'asc' },
          }),
          prisma.inventoryBatch.findMany({
            where: {
              orgId: user.orgId,
              currentQuantity: { gt: 0 },
              expiryDate: { not: null, lt: todayStart },
              // Surface BOTH unswept active (cron not run yet) and post-
              // cron expired lots that still hold stock — admin needs to
              // dispose either way.
              OR: [{ status: 'active' }, { status: 'expired' }],
            },
            include: {
              product: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { expiryDate: 'asc' },
          }),
        ]);

        const lowStock: LowStockRow[] = lowStockProducts
          .filter(
            (p: { totalStock: number; warningStock: number }) =>
              p.totalStock <= p.warningStock,
          )
          .map((p: any) => ({
            productId: p.id,
            sku: p.sku,
            name: p.name,
            totalStock: p.totalStock,
            warningStock: p.warningStock,
            unit: p.unit ?? null,
          }));

        const toBatchAlert = (b: any): BatchAlertRow => {
          const exp = b.expiryDate ? new Date(b.expiryDate) : null;
          const daysLeft = exp
            ? Math.floor((exp.getTime() - todayStart.getTime()) / 86400_000)
            : 0;
          return {
            batchId: b.id,
            batchCode: b.batchCode,
            productId: b.product?.id ?? b.productId,
            productSku: b.product?.sku ?? '',
            productName: b.product?.name ?? '',
            expiryDate: exp ? exp.toISOString().slice(0, 10) : null,
            currentQuantity: b.currentQuantity,
            daysLeft,
          };
        };

        const expiringIn90 = expiringBatches.map(toBatchAlert);
        const expired = expiredBatches.map(toBatchAlert);

        return {
          lowStock,
          expiringIn90,
          expired,
          summary: {
            lowStockCount: lowStock.length,
            expiringCount: expiringIn90.length,
            expiredCount: expired.length,
            totalCount: lowStock.length + expiringIn90.length + expired.length,
          },
        };
      } catch (err) {
        logger.error('[inventory] alerts error:', err);
        return reply.status(500).send({ error: 'Không tải được cảnh báo kho' });
      }
    },
  );
}
