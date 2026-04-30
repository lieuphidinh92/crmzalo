/**
 * admin-dashboard-routes.ts — owner/admin home page endpoints.
 * Uses requireRole middleware so members get a clean 403 if they hit
 * these directly (frontend already gates the menu but defense-in-depth).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import {
  getAdminHeroKpi,
  getCriticalAlerts,
  getRecentNewAgents,
  getRevenueTrend,
  getTopSales,
  type RevenueTrendGroupBy,
} from './admin-dashboard-service.js';

export async function adminDashboardRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireRole('owner', 'admin'));

  app.get('/api/v1/dashboard/admin/hero-kpi', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    return getAdminHeroKpi(orgId);
  });

  app.get('/api/v1/dashboard/admin/critical-alerts', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    return getCriticalAlerts(orgId);
  });

  app.get('/api/v1/dashboard/admin/revenue-trend', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const { groupBy } = request.query as { groupBy?: string };
    const validGroups: RevenueTrendGroupBy[] = ['total', 'type', 'source'];
    const safe = validGroups.includes(groupBy as RevenueTrendGroupBy)
      ? (groupBy as RevenueTrendGroupBy)
      : 'total';
    return getRevenueTrend(orgId, safe);
  });

  app.get('/api/v1/dashboard/admin/recent-new-agents', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const agents = await getRecentNewAgents(orgId);
    return { agents };
  });

  app.get('/api/v1/dashboard/admin/top-sales', async (request: FastifyRequest) => {
    const { orgId } = request.user!;
    const sales = await getTopSales(orgId);
    return { sales };
  });
}
