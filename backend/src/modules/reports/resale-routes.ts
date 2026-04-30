/**
 * resale-routes.ts — HTTP layer for the resale-effectiveness report.
 *
 *   GET /api/v1/reports/resale/overview        — KPI cards + charts
 *   GET /api/v1/reports/resale/segments        — 6-row buckets table
 *   GET /api/v1/reports/resale/top-agents      — top 10 by revenue in window
 *   GET /api/v1/reports/resale/at-risk-agents  — drill-in list (segment opt.)
 *
 * All endpoints scope to the caller's orgId, accept the same filter set
 * (from, to, sale_id, type), and respect a 5-minute in-memory cache.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  cacheKey,
  getAtRiskAgents,
  getOverview,
  getSegments,
  getTopAgents,
  withCache,
  type ResaleFilters,
} from './resale-service.js';

type Q = Record<string, string>;

function parseFilters(q: Q): ResaleFilters {
  return {
    from: q.from || undefined,
    to: q.to || undefined,
    saleId: q.sale_id || q.saleId || undefined,
    type: q.type || undefined,
  };
}

export async function resaleReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/reports/resale/overview', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const filters = parseFilters(request.query as Q);
    const key = cacheKey([
      'resale-overview',
      orgId,
      filters.from,
      filters.to,
      filters.saleId,
      filters.type,
    ]);
    return withCache(key, () => getOverview(orgId, filters));
  });

  app.get('/api/v1/reports/resale/segments', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const filters = parseFilters(request.query as Q);
    const key = cacheKey([
      'resale-segments',
      orgId,
      filters.from,
      filters.to,
      filters.saleId,
      filters.type,
    ]);
    const segments = await withCache(key, () => getSegments(orgId, filters));
    return { segments };
  });

  app.get('/api/v1/reports/resale/top-agents', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const q = request.query as Q;
    const filters = parseFilters(q);
    const limit = Math.min(parseInt(q.limit ?? '10') || 10, 50);
    const key = cacheKey([
      'resale-top',
      orgId,
      String(limit),
      filters.from,
      filters.to,
      filters.saleId,
      filters.type,
    ]);
    const topAgents = await withCache(key, () =>
      getTopAgents(orgId, filters, limit),
    );
    return { topAgents };
  });

  app.get('/api/v1/reports/resale/at-risk-agents', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const q = request.query as Q;
    const filters = parseFilters(q);
    const segmentKey = q.segment || q.level || undefined;
    const key = cacheKey([
      'resale-at-risk',
      orgId,
      segmentKey,
      filters.from,
      filters.to,
      filters.saleId,
      filters.type,
    ]);
    const agents = await withCache(key, () =>
      getAtRiskAgents(orgId, filters, segmentKey),
    );
    return { agents };
  });
}
