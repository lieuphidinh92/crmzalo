/**
 * sale-score-config-routes.ts
 *
 *   GET /api/v1/sale-score-config  — current weights (everyone in org)
 *   PUT /api/v1/sale-score-config  — update (admin/owner only)
 *   POST /api/v1/sale-score-config/reset — reset to defaults (admin/owner)
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import {
  DEFAULT_WEIGHTS,
  METRIC_KEYS,
  METRIC_LABELS,
  getOrgWeights,
  resetOrgWeights,
  setOrgWeights,
  type MetricKey,
} from './sale-score-config-service.js';

export async function saleScoreConfigRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/sale-score-config', async (request) => {
    const { orgId } = request.user!;
    const weights = await getOrgWeights(orgId);
    return {
      weights,
      defaults: DEFAULT_WEIGHTS,
      labels: METRIC_LABELS,
      metricKeys: METRIC_KEYS,
    };
  });

  app.put<{
    Body: { weights: Array<{ metricKey: MetricKey; weight: number }> };
  }>(
    '/api/v1/sale-score-config',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const { orgId, id: userId } = request.user!;
        const updates = request.body?.weights ?? [];
        if (updates.length === 0) {
          return reply.status(400).send({ error: 'Cần ít nhất 1 trọng số' });
        }
        const weights = await setOrgWeights(orgId, updates, userId);
        return { weights };
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Cập nhật thất bại' });
      }
    },
  );

  app.post(
    '/api/v1/sale-score-config/reset',
    { preHandler: requireRole('owner', 'admin') },
    async (request) => {
      const { orgId } = request.user!;
      const weights = await resetOrgWeights(orgId);
      return { weights };
    },
  );
}
