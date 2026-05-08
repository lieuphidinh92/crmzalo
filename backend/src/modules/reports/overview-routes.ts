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
  getAtRiskCustomers,
  getCriticalAlerts,
  getKpi,
  getRevenueTrend12m,
  getSparklines,
  getTopCustomers,
  getTopProducts,
  getTopSalesForPeriod,
  type CustomerRankType,
  type OverviewFilters,
  type TrendGroupBy,
} from './overview-service.js';

type Q = Record<string, string>;

/** Per CEO decision (Q1 in Session 3.5D): members see revenue but not
 * cost / profit / margin. The cache-key intentionally does NOT include
 * role — the cached payload always carries full data and we strip
 * post-cache before responding. */
function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

function stripKpi<T extends { cards?: any }>(d: T, role: string): T {
  if (canSeeCost(role) || !d?.cards?.profit) return d;
  return {
    ...d,
    cards: {
      ...d.cards,
      profit: {
        value: null,
        previous: null,
        trendPercent: null,
        marginPercent: null,
        costCoveragePercent: null,
      },
    },
  };
}

function stripSparklines<T extends { profit?: number[] }>(d: T, role: string): T {
  if (canSeeCost(role) || !d?.profit) return d;
  return { ...d, profit: d.profit.map(() => 0) };
}

function stripTopProducts<T extends { products?: any[] }>(d: T, role: string): T {
  if (canSeeCost(role) || !d?.products) return d;
  return {
    ...d,
    products: d.products.map((p: any) => ({
      ...p,
      profit: null,
      profitMarginPercent: null,
    })),
  };
}

function stripTopCustomers<T extends { customers?: any[] }>(d: T, role: string): T {
  if (canSeeCost(role) || !d?.customers) return d;
  return {
    ...d,
    customers: d.customers.map((c: any) => {
      if (c.profit === undefined) return c;
      return { ...c, profit: null };
    }),
  };
}

const VALID_CUSTOMER_TYPES: ReadonlyArray<CustomerRankType> = [
  'revenue',
  'resale',
  'profit',
  'at_risk',
];

/**
 * Date filters use **VN-local day boundaries** (Asia/Ho_Chi_Minh,
 * fixed +07:00). The frontend pill bar computes "Hôm nay / Hôm qua /
 * Tháng này" against the user's local Vietnamese calendar; the
 * backend has to interpret the YYYY-MM-DD strings the same way or
 * else a 17-hour window (midnight UTC → next-day-LOCAL midnight UTC)
 * silently truncates the day's data.
 *
 * For YYYY-MM-DD = '2026-05-08':
 *   from = '2026-05-08T00:00:00+07:00'   (= 2026-05-07T17:00:00Z)
 *   to   = '2026-05-09T00:00:00+07:00'   (exclusive next-VN-midnight)
 *
 * This way a full VN day is 24h regardless of where the Node process
 * is running, and orders with `order_date='2026-05-08T00:00:00Z'`
 * (UTC noon-VN time, what ExcelJS produces from MISA exports) fall
 * inside the window, as does anything imported as `2026-05-07T17:00Z`
 * (which IS midnight VN of day 8).
 */
const VN_OFFSET = '+07:00';

/** Default range = current calendar month in VN time [first-of-month,
 * first-of-next-month). Anchored on `now` interpreted in VN local. */
function defaultRange(): { from: Date; to: Date } {
  const now = new Date();
  // Convert "now" to VN time to extract the calendar fields, then build
  // the boundary dates with explicit +07:00 offset.
  const vnNow = new Date(now.getTime() + 7 * 3600_000);
  const y = vnNow.getUTCFullYear();
  const m = vnNow.getUTCMonth();
  const from = new Date(`${y}-${String(m + 1).padStart(2, '0')}-01T00:00:00${VN_OFFSET}`);
  const to = new Date(
    new Date(`${y}-${String(m + 2).padStart(2, '0')}-01T00:00:00${VN_OFFSET}`).getTime(),
  );
  // Handle Dec rollover (m+2 = 13 → invalid); fall back to next-year Jan
  if (Number.isNaN(to.getTime())) {
    return {
      from,
      to: new Date(`${y + 1}-01-01T00:00:00${VN_OFFSET}`),
    };
  }
  return { from, to };
}

/** Parse YYYY-MM-DD as midnight VN local. */
function vnDayStart(yyyymmdd: string, addDays = 0): Date {
  // Validate basic format. If invalid, fall back to UTC parse so callers
  // get NaN and we don't silently substitute wrong dates.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd)) return new Date(yyyymmdd);
  const base = new Date(`${yyyymmdd}T00:00:00${VN_OFFSET}`);
  if (addDays !== 0) base.setUTCDate(base.getUTCDate() + addDays);
  return base;
}

function parseFilters(
  q: Q,
  user: { id: string; role: string },
): OverviewFilters {
  const def = defaultRange();
  const fromRaw = q.from;
  const toRaw = q.to;
  const from = fromRaw ? vnDayStart(fromRaw) : def.from;
  // Treat `to` inclusively at the day level — [from, to+1day in VN).
  const to = toRaw ? vnDayStart(toRaw, 1) : def.to;
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
      const data = await withCache(key, () => getKpi(request.user!.orgId, filters));
      return stripKpi(data, request.user!.role);
    },
  );

  app.get(
    '/api/v1/reports/overview/sparklines',
    async (request: FastifyRequest) => {
      const filters = parseFilters(request.query as Q, request.user!);
      const key = filterCacheKey(
        'overview-sparklines',
        request.user!.orgId,
        filters,
      );
      const data = await withCache(key, () =>
        getSparklines(request.user!.orgId, filters),
      );
      return stripSparklines(data, request.user!.role);
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
      const data = await withCache(key, async () => ({
        products: await getTopProducts(request.user!.orgId, filters, limit),
      }));
      return stripTopProducts(data, request.user!.role);
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
    '/api/v1/reports/overview/revenue-trend',
    async (request: FastifyRequest) => {
      const q = request.query as Q;
      const filters = parseFilters(q, request.user!);
      const requested = (q.group_by || q.groupBy || 'total') as TrendGroupBy;
      const groupBy: TrendGroupBy =
        ['total', 'customer_type', 'brand'].includes(requested)
          ? requested
          : 'total';
      const key = filterCacheKey(
        'overview-revenue-trend',
        request.user!.orgId,
        filters,
        groupBy,
      );
      return withCache(key, () =>
        getRevenueTrend12m(request.user!.orgId, filters, groupBy),
      );
    },
  );

  app.get(
    '/api/v1/reports/overview/critical-alerts',
    async (request: FastifyRequest) => {
      const filters = parseFilters(request.query as Q, request.user!);
      const key = filterCacheKey(
        'overview-critical-alerts',
        request.user!.orgId,
        filters,
      );
      return withCache(key, () =>
        getCriticalAlerts(request.user!.orgId, filters),
      );
    },
  );

  // 2-bucket at-risk view (needCareNow 30-60d, longDormant >60d).
  // Replaces the legacy single-list "VIP sắp churn" — see service for
  // logic. Legacy /critical-alerts kept untouched for the
  // sale-underperforming card.
  app.get(
    '/api/v1/reports/overview/at-risk-customers',
    async (request: FastifyRequest) => {
      const filters = parseFilters(request.query as Q, request.user!);
      const key = filterCacheKey(
        'overview-at-risk-customers',
        request.user!.orgId,
        filters,
      );
      return withCache(key, () =>
        getAtRiskCustomers(request.user!.orgId, filters),
      );
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
      const data = await withCache(key, async () => ({
        type,
        customers: await getTopCustomers(
          request.user!.orgId,
          filters,
          type,
          limit,
        ),
      }));
      return stripTopCustomers(data, request.user!.role);
    },
  );
}
