/**
 * business-goals-routes.ts — admin/owner-only CRUD for org-level business
 * goals (annual revenue target + churn/at-risk/stuck day thresholds).
 *
 *   GET /api/v1/settings/business-goals  — current values (everyone in org)
 *   PUT /api/v1/settings/business-goals  — update (admin/owner only)
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import {
  DEFAULT_GOALS,
  getOrgGoals,
  setOrgGoals,
  type BusinessGoals,
} from './business-goals-service.js';

export async function businessGoalsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/settings/business-goals', async (request) => {
    const { orgId } = request.user!;
    const goals = await getOrgGoals(orgId);
    return { goals, defaults: DEFAULT_GOALS };
  });

  app.put<{ Body: Partial<BusinessGoals> }>(
    '/api/v1/settings/business-goals',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      try {
        const { orgId } = request.user!;
        const updated = await setOrgGoals(orgId, request.body ?? {});
        return { goals: updated };
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Failed to update goals' });
      }
    },
  );
}
