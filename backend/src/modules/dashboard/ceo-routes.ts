/**
 * ceo-routes.ts — CEO dashboard endpoints (admin/owner only).
 *
 *   GET  /api/v1/dashboard/ceo/kpi
 *   GET  /api/v1/dashboard/ceo/pareto
 *   GET  /api/v1/dashboard/ceo/cohort-retention
 *   GET  /api/v1/dashboard/ceo/revenue-by-segment
 *   GET  /api/v1/dashboard/ceo/at-risk-vips
 *   GET  /api/v1/dashboard/ceo/sale-performance
 *   POST /api/v1/dashboard/ceo/notify-sale  — "Báo Sale chăm ngay" button
 *
 * All reads cached 15 minutes per org. Caches share the resale-service
 * Map so a contact mutation that calls invalidateCacheByPrefix('ceo|...')
 * can flush all six panels at once.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { cacheKey } from '../reports/resale-service.js';
import {
  getAtRiskVips,
  getCohortRetention,
  getKpi,
  getPareto,
  getRevenueBySegment,
} from './ceo-service.js';

/** 15-minute TTL — heavier than resale's 5min because these queries are slower. */
const CEO_TTL_MS = 15 * 60 * 1000;
const ceoCache = new Map<string, { data: unknown; expiresAt: number }>();

async function ceoCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = ceoCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  const data = await loader();
  ceoCache.set(key, { data, expiresAt: Date.now() + CEO_TTL_MS });
  return data;
}

export async function ceoDashboardRoutes(app: FastifyInstance): Promise<void> {
  // All CEO endpoints require admin or owner.
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireRole('owner', 'admin'));

  app.get('/api/v1/dashboard/ceo/kpi', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    return ceoCached(cacheKey(['ceo-kpi', orgId]), () => getKpi(orgId));
  });

  app.get('/api/v1/dashboard/ceo/pareto', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    return ceoCached(cacheKey(['ceo-pareto', orgId]), () => getPareto(orgId));
  });

  app.get('/api/v1/dashboard/ceo/cohort-retention', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    return ceoCached(cacheKey(['ceo-cohort', orgId]), () =>
      getCohortRetention(orgId),
    );
  });

  app.get('/api/v1/dashboard/ceo/revenue-by-segment', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const data = await ceoCached(cacheKey(['ceo-segment-rev', orgId]), () =>
      getRevenueBySegment(orgId),
    );
    return { months: data };
  });

  app.get('/api/v1/dashboard/ceo/at-risk-vips', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const vips = await ceoCached(cacheKey(['ceo-vips', orgId]), () =>
      getAtRiskVips(orgId),
    );
    return { vips };
  });

  // NOTE: GET /sale-performance now lives in sale-performance-routes.ts
  // (dedicated module with the new evaluation/scoring logic). The old
  // simpler version that lived here has been deleted.

  // ── POST /api/v1/dashboard/ceo/notify-sale
  // Body: { contactId, saleUserId, message? }
  // Logs an ActivityLog entry tagged sale_alert. Frontend toast confirms.
  app.post<{
    Body: { contactId: string; saleUserId: string; message?: string };
  }>('/api/v1/dashboard/ceo/notify-sale', async (request, reply) => {
    const user = request.user!;
    const { contactId, saleUserId, message } = request.body ?? ({} as any);

    if (!contactId || !saleUserId) {
      return reply
        .status(400)
        .send({ error: 'Cần contactId và saleUserId' });
    }

    // Verify both contact and sale belong to this org (no cross-org leaks).
    const [contact, sale] = await Promise.all([
      prisma.contact.findFirst({
        where: { id: contactId, orgId: user.orgId },
        select: { id: true, fullName: true },
      }),
      prisma.user.findFirst({
        where: { id: saleUserId, orgId: user.orgId },
        select: { id: true, fullName: true },
      }),
    ]);
    if (!contact || !sale) {
      return reply
        .status(404)
        .send({ error: 'Contact hoặc sale không tồn tại trong tổ chức' });
    }

    try {
      await prisma.activityLog.create({
        data: {
          orgId: user.orgId,
          userId: saleUserId,
          action: 'sale_alert',
          entityType: 'contact',
          entityId: contactId,
          details: {
            triggeredBy: user.id,
            triggeredByRole: user.role,
            contactName: contact.fullName,
            saleName: sale.fullName,
            message: message ?? 'Đại lý này đang sắp churn — cần liên hệ ngay',
            source: 'ceo_dashboard',
          },
        },
      });
      return { success: true, contactId, saleUserId };
    } catch (err) {
      logger.error('[ceo] notify-sale error:', err);
      return reply.status(500).send({ error: 'Không gửi được cảnh báo' });
    }
  });
}
