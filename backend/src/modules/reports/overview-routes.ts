/**
 * overview-routes.ts — HTTP layer for /reports/overview page.
 *
 *   GET /api/v1/reports/overview/kpi
 *   GET /api/v1/reports/overview/top-products
 *   GET /api/v1/reports/overview/top-sales
 *   GET /api/v1/reports/overview/top-customers
 *
 * Auth: every route requires JWT. Members are auto-scoped to their own
 * sale_id (the query-param is overridden); owner/admin may pass any
 * sale_id or omit it for org-wide view.
 *
 * Cache: 5-minute in-memory, keyed on (orgId, route, filters).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import {
  cacheKey,
  withCache,
} from './resale-service.js';
import {
  getKpi,
  getTopCustomers,
  getTopProducts,
  getTopSalesForPeriod,
  type CustomerRankType,
  type OverviewFilters,
} from './overview-service.js';

type Q = Record<string, string>;

const VALID_CUSTOMER_TYPES: ReadonlyArray<CustomerRankType> = [
  'revenue',
  'resale',
  'profit',
  'at_risk',
];

/** Default range = current calendar month [first-of-month, first-of-next). */
function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from, to };
}

function parseFilters(
  q: Q,
  user: { id: string; role: string },
): OverviewFilters {
  const def = defaultRange();
  const fromRaw = q.from;
  const toRaw = q.to;
  const from = fromRaw ? new Date(fromRaw) : def.from;
  // Treat `to` inclusively at the day level — [from, to+1day).
  let to: Date;
  if (toRaw) {
    const parsed = new Date(toRaw);
    to = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate() + 1);
  } else {
    to = def.to;
  }
  // Permission: members are auto-scoped to themselves.
  let saleId: string | null | undefined = q.sale_id || q.saleId || null;
  if (user.role === 'member') saleId = user.id;
  return { from, to, saleId };
}

function filterCacheKey(
  prefix: string,
  orgId: string,
  filters: OverviewFilters,
  extra?: string,
) {
  return cacheKey([
    prefix,
    orgId,
    filters.from.toISOString(),
    filters.to.toISOString(),
    filters.saleId ?? 'all',
    extra ?? '',
  ]);
}

export async function overviewReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/api/v1/reports/overview/kpi',
    async (request: FastifyRequest) => {
      const filters = parseFilters(request.query as Q, request.user!);
      const key = filterCacheKey('overview-kpi', request.user!.orgId, filters);
      return withCache(key, () => getKpi(request.user!.orgId, filters));
    },
  );

  app.get(
    '/api/v1/reports/overview/top-products',
    async (request: FastifyRequest) => {
      const q = request.query as Q;
      const filters = parseFilters(q, request.user!);
      const limit = Math.min(Math.max(parseInt(q.limit || '5', 10), 1), 50);
      const key = filterCacheKey(
        'overview-top-products',
        request.user!.orgId,
        filters,
        String(limit),
      );
      return withCache(key, async () => ({
        products: await getTopProducts(request.user!.orgId, filters, limit),
      }));
    },
  );

  app.get(
    '/api/v1/reports/overview/top-sales',
    async (request: FastifyRequest) => {
      const q = request.query as Q;
      const filters = parseFilters(q, request.user!);
      const limit = Math.min(Math.max(parseInt(q.limit || '5', 10), 1), 20);
      const key = filterCacheKey(
        'overview-top-sales',
        request.user!.orgId,
        filters,
        String(limit),
      );
      return withCache(key, async () => ({
        sales: await getTopSalesForPeriod(
          request.user!.orgId,
          filters,
          limit,
        ),
      }));
    },
  );

  app.get(
    '/api/v1/reports/overview/top-customers',
    async (request: FastifyRequest) => {
      const q = request.query as Q;
      const filters = parseFilters(q, request.user!);
      const requested = (q.type || 'revenue') as CustomerRankType;
      const type: CustomerRankType = VALID_CUSTOMER_TYPES.includes(requested)
        ? requested
        : 'revenue';
      const limit = Math.min(Math.max(parseInt(q.limit || '5', 10), 1), 20);
      const key = filterCacheKey(
        'overview-top-customers',
        request.user!.orgId,
        filters,
        `${type}:${limit}`,
      );
      return withCache(key, async () => ({
        type,
        customers: await getTopCustomers(
          request.user!.orgId,
          filters,
          type,
          limit,
        ),
      }));
    },
  );
}
