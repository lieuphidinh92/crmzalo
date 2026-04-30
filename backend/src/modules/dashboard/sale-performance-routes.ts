/**
 * sale-performance-routes.ts — endpoints feeding the Sale Evaluation
 * module on the CEO dashboard.
 *
 *   GET /api/v1/dashboard/ceo/sale-performance?month=YYYY-MM
 *   GET /api/v1/dashboard/ceo/sale-performance/:saleId/detail?month=YYYY-MM
 *   GET /api/v1/dashboard/ceo/sale-performance/alerts?month=YYYY-MM
 *   POST /api/v1/dashboard/ceo/sale-performance/:saleId/feedback
 *
 * Permission rules confirmed in spec (Q1=C):
 *   - owner / admin → all sales
 *   - member        → only their own row (other rows + alerts hidden)
 *
 * NOTE: this overwrites the path the simpler legacy `getSalePerformance`
 * helper used to serve. The old route is removed in ceo-routes.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  getSaleAlerts,
  getSaleDetail,
  getSalePerformanceOverview,
} from './sale-performance-service.js';

type Q = Record<string, string>;

export async function salePerformanceRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/api/v1/dashboard/ceo/sale-performance',
    async (request: FastifyRequest) => {
      const { orgId, role, id } = request.user!;
      const { month } = request.query as Q;
      const overview = await getSalePerformanceOverview(orgId, month);

      // Member sees only their own row (zero out comparison data).
      if (role === 'member') {
        const own = overview.rows.find((r) => r.saleId === id);
        return {
          ...overview,
          rows: own ? [own] : [],
          memberView: true,
        };
      }
      return overview;
    },
  );

  app.get<{ Params: { saleId: string } }>(
    '/api/v1/dashboard/ceo/sale-performance/:saleId/detail',
    async (request, reply) => {
      const { orgId, role, id } = request.user!;
      const { saleId } = request.params;
      const { month } = request.query as Q;

      // Member can only view their own detail.
      if (role === 'member' && saleId !== id) {
        return reply
          .status(403)
          .send({ error: 'Bạn chỉ xem được chi tiết của bản thân' });
      }

      try {
        const detail = await getSaleDetail(orgId, saleId, month);
        return detail;
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Failed to load detail' });
      }
    },
  );

  app.get(
    '/api/v1/dashboard/ceo/sale-performance/alerts',
    async (request: FastifyRequest, reply) => {
      const { orgId, role } = request.user!;
      // Alerts are leadership-level info; hide from members.
      if (role === 'member') {
        return reply
          .status(403)
          .send({ error: 'Chỉ owner/admin xem được cảnh báo' });
      }
      const { month } = request.query as Q;
      return getSaleAlerts(orgId, month);
    },
  );

  // POST feedback — for "Gửi feedback cho sale này" button. Logs an
  // ActivityLog entry (consistent with notify-sale).
  app.post<{
    Params: { saleId: string };
    Body: { message: string };
  }>(
    '/api/v1/dashboard/ceo/sale-performance/:saleId/feedback',
    async (request, reply) => {
      const user = request.user!;
      if (user.role === 'member') {
        return reply.status(403).send({ error: 'Chỉ owner/admin gửi feedback' });
      }
      const { saleId } = request.params;
      const { message } = request.body ?? ({} as { message?: string });
      if (!message?.trim()) {
        return reply.status(400).send({ error: 'Cần nội dung feedback' });
      }
      const sale = await prisma.user.findFirst({
        where: { id: saleId, orgId: user.orgId },
        select: { id: true, fullName: true },
      });
      if (!sale) return reply.status(404).send({ error: 'Sale not found' });

      try {
        await prisma.activityLog.create({
          data: {
            orgId: user.orgId,
            userId: saleId,
            action: 'sale_feedback',
            entityType: 'user',
            entityId: saleId,
            details: {
              triggeredBy: user.id,
              triggeredByRole: user.role,
              saleName: sale.fullName,
              message: message.trim(),
              source: 'ceo_dashboard',
            },
          },
        });
        return { success: true };
      } catch (err) {
        logger.error('[sale-perf] feedback error:', err);
        return reply.status(500).send({ error: 'Không gửi được feedback' });
      }
    },
  );
}
