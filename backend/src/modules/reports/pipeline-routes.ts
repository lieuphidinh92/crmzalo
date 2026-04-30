/**
 * pipeline-routes.ts — read endpoints for the opportunity-pipeline page.
 *
 *   GET /api/v1/pipeline                    — funnel columns + cards
 *   GET /api/v1/pipeline/conversion-stats   — 4-KPI metric row
 *   GET /api/v1/pipeline/stuck-reasons      — top reasons (stage=ngung)
 *
 * The drag-drop endpoint that mutates Contact.stage is in
 * contact-routes.ts (PATCH /api/v1/contacts/:id/stage).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  getMetrics,
  getPipeline,
  getStuckReasons,
  pipelineCacheKey,
  withCache,
  type PipelineFilters,
} from './pipeline-service.js';

type Q = Record<string, string>;

function parseFilters(q: Q): PipelineFilters {
  return {
    saleId: q.sale_id || q.saleId || null,
    from: q.from || undefined,
    to: q.to || undefined,
  };
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/pipeline', async (request: FastifyRequest) => {
    const { orgId, role, id } = request.user!;
    const filters = parseFilters(request.query as Q);

    // Members default to "deals của tôi" if they didn't pass an explicit
    // saleId. Admin/owner sees everyone unless they filter.
    if (role === 'member' && !filters.saleId) {
      filters.saleId = id;
    }

    const key = pipelineCacheKey('pipeline-deals', orgId, filters);
    const columns = await withCache(key, () => getPipeline(orgId, filters));
    return { columns };
  });

  app.get('/api/v1/pipeline/conversion-stats', async (request: FastifyRequest) => {
    const { orgId, role, id } = request.user!;
    const filters = parseFilters(request.query as Q);
    if (role === 'member' && !filters.saleId) filters.saleId = id;

    const key = pipelineCacheKey('pipeline-metrics', orgId, filters);
    return withCache(key, () => getMetrics(orgId, filters));
  });

  app.get('/api/v1/pipeline/stuck-reasons', async (request: FastifyRequest) => {
    const { orgId, role, id } = request.user!;
    const filters = parseFilters(request.query as Q);
    if (role === 'member' && !filters.saleId) filters.saleId = id;

    const key = pipelineCacheKey('pipeline-stuck', orgId, filters);
    const reasons = await withCache(key, () =>
      getStuckReasons(orgId, filters),
    );
    return { reasons };
  });
}
