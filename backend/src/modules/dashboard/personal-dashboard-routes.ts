/**
 * personal-dashboard-routes.ts — sale-facing home page endpoints.
 * Member-only by design but admin/owner can also call them via the
 * "Xem theo góc nhìn Sale" toggle on the frontend (we don't gate by
 * role here; the backend just operates on `request.user.id`).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  getMyAtRiskAgents,
  getMyMiniPipeline,
  getPersonalKpi,
  getQuickActionBadges,
  getTodayTasks,
} from './personal-dashboard-service.js';

export async function personalDashboardRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/dashboard/personal/today-tasks', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    return getTodayTasks(orgId, id);
  });

  app.get('/api/v1/dashboard/personal/at-risk-agents', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    const agents = await getMyAtRiskAgents(orgId, id);
    return { agents };
  });

  app.get('/api/v1/dashboard/personal/kpi', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    return getPersonalKpi(orgId, id);
  });

  app.get('/api/v1/dashboard/personal/mini-pipeline', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    const columns = await getMyMiniPipeline(orgId, id);
    return { columns };
  });

  app.get('/api/v1/dashboard/personal/quick-action-badges', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    return getQuickActionBadges(orgId, id);
  });
}
