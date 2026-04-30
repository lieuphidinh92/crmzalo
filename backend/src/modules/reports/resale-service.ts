/**
 * resale-service.ts — pure query/business logic for the resale-report
 * module. The HTTP layer (resale-routes.ts) wraps these helpers and adds
 * caching + auth.
 *
 * Domain rules (confirmed in spec):
 *   - "Đại lý" / "agent" = Contact with stage = 'dai_ly_chinh_thuc'.
 *   - All time-based metrics use orders.order_date (falling back to
 *     orders.created_at when null) so backfilled historical orders
 *     work the same as fresh ones.
 *   - "Potential value" of a churn-risk segment = sum of each agent's
 *     lifetime AOV. (One-shot revenue we'd recover if they all came back.)
 *   - All queries are scoped to the caller's orgId.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals } from '../settings/business-goals-service.js';

export const OFFICIAL_AGENT_STAGE = 'dai_ly_chinh_thuc';

/** Returns "now" as a Date — extracted so tests can mock if needed. */
function now(): Date {
  return new Date();
}

function daysAgo(n: number): Date {
  const d = now();
  d.setDate(d.getDate() - n);
  return d;
}

function startOfMonth(date = now()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/* ── Cache (per-process, 5-minute TTL) ──────────────────────────────────── */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const TTL_MS = 5 * 60 * 1000;

export function cacheKey(parts: Array<string | undefined | null>): string {
  return parts.map((p) => p ?? '').join('|');
}

export async function withCache<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.data as T;
  }
  const data = await loader();
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
  return data;
}

/** Bust cache entries that start with a prefix (orgId, usually). */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/* ── Filters ────────────────────────────────────────────────────────────── */

export interface ResaleFilters {
  from?: string; // ISO date 'YYYY-MM-DD'
  to?: string;
  saleId?: string; // assignedUserId
  type?: string; // customerType
}

export function resolveDateRange(
  filters: ResaleFilters,
): { from: Date; to: Date } {
  const to = filters.to ? new Date(filters.to + 'T23:59:59') : now();
  const from = filters.from
    ? new Date(filters.from + 'T00:00:00')
    : daysAgo(30);
  return { from, to };
}

/** Build a Prisma `where` clause for the agent set restricted by filters. */
function agentFilterWhere(orgId: string, filters: ResaleFilters) {
  const where: any = { orgId, stage: OFFICIAL_AGENT_STAGE };
  if (filters.saleId) where.assignedUserId = filters.saleId;
  if (filters.type) where.customerType = filters.type;
  return where;
}

/* ── Segments — days-since-last-order buckets ───────────────────────────── */

export interface SegmentDef {
  key: string;
  label: string;
  /** Inclusive lower bound on `days_since_last_order` (>= min). */
  min: number;
  /** Inclusive upper bound (<= max). null means open-ended. */
  max: number | null;
}

export const RESALE_SEGMENTS: SegmentDef[] = [
  { key: 'just_ordered', label: 'Vừa đặt', min: 0, max: 15 },
  { key: 'remind', label: 'Cần nhắc', min: 16, max: 30 },
  { key: 'warning', label: 'Cảnh báo', min: 31, max: 45 },
  { key: 'pre_churn', label: 'Sắp churn', min: 46, max: 60 },
  { key: 'pre_churn_heavy', label: 'Sắp churn nặng', min: 61, max: 90 },
  { key: 'churned', label: 'Đã churn', min: 91, max: null },
];

export function classifySegment(daysSinceLastOrder: number): SegmentDef {
  for (const seg of RESALE_SEGMENTS) {
    if (
      daysSinceLastOrder >= seg.min &&
      (seg.max === null || daysSinceLastOrder <= seg.max)
    ) {
      return seg;
    }
  }
  // Fallback: shouldn't be reachable but stay safe.
  return RESALE_SEGMENTS[RESALE_SEGMENTS.length - 1];
}

/* ── Per-agent stats helper ─────────────────────────────────────────────── */

export interface AgentStat {
  contactId: string;
  fullName: string | null;
  phone: string | null;
  customerType: string | null;
  storeName: string | null;
  province: string | null;
  assignedUser: { id: string; fullName: string } | null;
  orderCount: number;
  totalRevenue: number;
  avgOrderValue: number;
  lastOrderDate: Date | null;
  daysSinceLastOrder: number; // Number.POSITIVE_INFINITY if never ordered
}

/**
 * Aggregate per-agent order stats. Returns one row per official agent
 * matching `filters` (date range NOT applied to the order-level groupBy
 * here — we want lifetime stats so the AOV is stable across periods).
 *
 * Order-date filtering is layered on top by callers that want
 * "active in period" — see `loadAgentStatsActiveIn`.
 */
async function loadAgentStatsLifetime(
  orgId: string,
  filters: ResaleFilters,
): Promise<AgentStat[]> {
  const agents = await prisma.contact.findMany({
    where: agentFilterWhere(orgId, filters),
    select: {
      id: true,
      fullName: true,
      phone: true,
      customerType: true,
      storeName: true,
      province: true,
      assignedUser: { select: { id: true, fullName: true } },
    },
  });
  if (agents.length === 0) return [];

  const ids = agents.map((a) => a.id);
  // groupBy aggregate — one query for all agents.
  const aggregates = await prisma.order.groupBy({
    by: ['contactId'],
    where: { orgId, contactId: { in: ids } },
    _sum: { totalAmount: true },
    _count: { id: true },
    _max: { orderDate: true, createdAt: true },
  });
  const aggMap = new Map(aggregates.map((a) => [a.contactId, a]));

  const today = now();
  return agents.map((agent) => {
    const agg = aggMap.get(agent.id);
    const orderCount = agg?._count.id ?? 0;
    const totalRevenue = agg?._sum.totalAmount ?? 0;
    const lastOrderDate =
      agg?._max.orderDate ?? agg?._max.createdAt ?? null;
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor(
          (today.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24),
        )
      : Number.POSITIVE_INFINITY;
    return {
      contactId: agent.id,
      fullName: agent.fullName,
      phone: agent.phone,
      customerType: agent.customerType,
      storeName: agent.storeName,
      province: agent.province,
      assignedUser: agent.assignedUser ?? null,
      orderCount,
      totalRevenue,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      lastOrderDate,
      daysSinceLastOrder,
    };
  });
}

/* ── Public service entrypoints ─────────────────────────────────────────── */

export interface OverviewMetric {
  count: number;
  total: number;
  percent: number; // 0..100
  trend: number;   // % change vs prior period; positive = improvement
}

export interface OverviewResponse {
  activeAgents: OverviewMetric;
  atRiskAgents: { count: number };
  churnedAgents: { count: number };
  monthRevenue: { value: number; orderCount: number };
  avgOrderInterval: { days: number };
  avgOrderValue: { value: number };
  weeklyRevenue: Array<{ weekStart: string; revenue: number }>;
  typeShare: Array<{ customerType: string | null; revenue: number }>;
}

export async function getOverview(
  orgId: string,
  filters: ResaleFilters,
): Promise<OverviewResponse> {
  const [allAgents, goals] = await Promise.all([
    loadAgentStatsLifetime(orgId, filters),
    getOrgGoals(orgId),
  ]);
  const total = allAgents.length;

  // KPI 1: active agents = ordered in last 30 days.
  const activeNow = allAgents.filter((a) => a.daysSinceLastOrder <= 30).length;
  // Trend: prior 30-day window (31..60 days ago).
  const activePrior = allAgents.filter(
    (a) => a.daysSinceLastOrder > 30 && a.daysSinceLastOrder <= 60,
  ).length;
  const trend =
    activePrior === 0
      ? activeNow > 0
        ? 100
        : 0
      : ((activeNow - activePrior) / activePrior) * 100;

  // KPI 2 + 3: at-risk (atRiskDays..churnDays) and churned (>churnDays).
  const atRiskCount = allAgents.filter(
    (a) =>
      a.daysSinceLastOrder > goals.atRiskDays &&
      a.daysSinceLastOrder <= goals.churnDays,
  ).length;
  const churnedCount = allAgents.filter(
    (a) => a.daysSinceLastOrder > goals.churnDays && a.orderCount > 0,
  ).length;

  // KPI 4: month revenue (current calendar month — independent of from/to
  // because the spec says "Doanh số resale tháng" — explicitly month).
  const monthStart = startOfMonth();
  const agentIds = allAgents.map((a) => a.contactId);
  const monthAgg =
    agentIds.length === 0
      ? null
      : await prisma.order.aggregate({
          where: {
            orgId,
            contactId: { in: agentIds },
            OR: [
              { orderDate: { gte: monthStart } },
              { orderDate: null, createdAt: { gte: monthStart } },
            ],
          },
          _sum: { totalAmount: true },
          _count: { id: true },
        });

  // KPI 5: avg interval days. For each agent with >=2 orders, span =
  // (lastOrderDate - firstOrderDate) / (orderCount - 1).
  const intervalsAgg =
    agentIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ['contactId'],
          where: { orgId, contactId: { in: agentIds } },
          _min: { orderDate: true, createdAt: true },
          _max: { orderDate: true, createdAt: true },
          _count: { id: true },
        });
  const intervalDays: number[] = [];
  for (const a of intervalsAgg) {
    const count = a._count.id;
    if (count < 2) continue;
    const first = a._min.orderDate ?? a._min.createdAt;
    const last = a._max.orderDate ?? a._max.createdAt;
    if (!first || !last) continue;
    const span = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
    intervalDays.push(span / (count - 1));
  }
  const avgInterval =
    intervalDays.length === 0
      ? 0
      : intervalDays.reduce((s, x) => s + x, 0) / intervalDays.length;

  // KPI 6: average order value across all agent orders.
  const aovAgg =
    agentIds.length === 0
      ? null
      : await prisma.order.aggregate({
          where: { orgId, contactId: { in: agentIds } },
          _avg: { totalAmount: true },
        });

  // Weekly revenue — last 12 weeks ending this Monday.
  const weeklyRevenue = await loadWeeklyRevenue(orgId, agentIds, 12);

  // Type share (lifetime) — split by customerType.
  const typeShareMap = new Map<string | null, number>();
  for (const a of allAgents) {
    typeShareMap.set(
      a.customerType,
      (typeShareMap.get(a.customerType) ?? 0) + a.totalRevenue,
    );
  }
  const typeShare = Array.from(typeShareMap.entries())
    .map(([customerType, revenue]) => ({ customerType, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    activeAgents: {
      count: activeNow,
      total,
      percent: total === 0 ? 0 : (activeNow / total) * 100,
      trend,
    },
    atRiskAgents: { count: atRiskCount },
    churnedAgents: { count: churnedCount },
    monthRevenue: {
      value: monthAgg?._sum.totalAmount ?? 0,
      orderCount: monthAgg?._count.id ?? 0,
    },
    avgOrderInterval: { days: avgInterval },
    avgOrderValue: { value: aovAgg?._avg.totalAmount ?? 0 },
    weeklyRevenue,
    typeShare,
  };
}

async function loadWeeklyRevenue(
  orgId: string,
  agentIds: string[],
  weeks: number,
): Promise<Array<{ weekStart: string; revenue: number }>> {
  if (agentIds.length === 0) return [];

  // Use Postgres date_trunc for week buckets — matches Postgres ISO week
  // (Monday). NOTE: rely on raw query for performance.
  const since = daysAgo(weeks * 7);
  const rows = await prisma.$queryRaw<
    Array<{ week_start: Date; revenue: number | string }>
  >`
    SELECT
      date_trunc('week', COALESCE(order_date, created_at))::date AS week_start,
      SUM(total_amount)::float AS revenue
    FROM orders
    WHERE org_id = ${orgId}
      AND contact_id = ANY(${agentIds}::text[])
      AND COALESCE(order_date, created_at) >= ${since}
    GROUP BY week_start
    ORDER BY week_start ASC
  `;

  // Fill in zero buckets for weeks with no orders so the chart line stays
  // continuous.
  const startMon = new Date(since);
  startMon.setHours(0, 0, 0, 0);
  // Snap to Monday.
  const dow = (startMon.getDay() + 6) % 7; // 0 = Monday
  startMon.setDate(startMon.getDate() - dow);

  const filled: Array<{ weekStart: string; revenue: number }> = [];
  const map = new Map(
    rows.map((r) => [r.week_start.toISOString().slice(0, 10), Number(r.revenue)]),
  );
  for (let i = 0; i < weeks; i++) {
    const d = new Date(startMon);
    d.setDate(d.getDate() + i * 7);
    const k = d.toISOString().slice(0, 10);
    filled.push({ weekStart: k, revenue: map.get(k) ?? 0 });
  }
  return filled;
}

export interface SegmentRow {
  key: string;
  label: string;
  min: number;
  max: number | null;
  count: number;
  potentialValue: number; // sum of AOV across agents in segment
}

export async function getSegments(
  orgId: string,
  filters: ResaleFilters,
): Promise<SegmentRow[]> {
  const allAgents = await loadAgentStatsLifetime(orgId, filters);
  const buckets = new Map<string, { count: number; potentialValue: number }>();
  for (const seg of RESALE_SEGMENTS) {
    buckets.set(seg.key, { count: 0, potentialValue: 0 });
  }
  for (const agent of allAgents) {
    if (agent.orderCount === 0) {
      // Never ordered → skip from segments (they're not "due for resale").
      continue;
    }
    const seg = classifySegment(agent.daysSinceLastOrder);
    const bucket = buckets.get(seg.key)!;
    bucket.count += 1;
    bucket.potentialValue += agent.avgOrderValue;
  }
  return RESALE_SEGMENTS.map((seg) => ({
    ...seg,
    ...buckets.get(seg.key)!,
  }));
}

export interface TopAgentRow {
  contactId: string;
  fullName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  orderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
}

export async function getTopAgents(
  orgId: string,
  filters: ResaleFilters,
  limit = 10,
): Promise<TopAgentRow[]> {
  const { from, to } = resolveDateRange(filters);
  const agents = await prisma.contact.findMany({
    where: agentFilterWhere(orgId, filters),
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);
  if (agentIds.length === 0) return [];

  // Revenue in [from, to] window.
  const periodAgg = await prisma.order.groupBy({
    by: ['contactId'],
    where: {
      orgId,
      contactId: { in: agentIds },
      OR: [
        { orderDate: { gte: from, lte: to } },
        { orderDate: null, createdAt: { gte: from, lte: to } },
      ],
    },
    _sum: { totalAmount: true },
    _count: { id: true },
  });

  // Hydrate names + last-order-date (lifetime) for the top N.
  periodAgg.sort(
    (a, b) => (b._sum.totalAmount ?? 0) - (a._sum.totalAmount ?? 0),
  );
  const top = periodAgg.slice(0, limit);
  if (top.length === 0) return [];

  const topIds = top.map((a) => a.contactId);
  const [contacts, lifetimeMax] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: topIds } },
      select: {
        id: true,
        fullName: true,
        customerType: true,
        assignedUser: { select: { id: true, fullName: true } },
      },
    }),
    prisma.order.groupBy({
      by: ['contactId'],
      where: { orgId, contactId: { in: topIds } },
      _max: { orderDate: true, createdAt: true },
    }),
  ]);
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const lifetimeMap = new Map(lifetimeMax.map((m) => [m.contactId, m]));
  const today = now();

  return top.map((row) => {
    const contact = contactMap.get(row.contactId);
    const last =
      lifetimeMap.get(row.contactId)?._max.orderDate ??
      lifetimeMap.get(row.contactId)?._max.createdAt ??
      null;
    return {
      contactId: row.contactId,
      fullName: contact?.fullName ?? null,
      customerType: contact?.customerType ?? null,
      assignedUser: contact?.assignedUser ?? null,
      orderCount: row._count.id,
      totalRevenue: row._sum.totalAmount ?? 0,
      lastOrderDate: last ? last.toISOString() : null,
      daysSinceLastOrder: last
        ? Math.floor(
            (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
          )
        : null,
    };
  });
}

export interface AtRiskAgentRow {
  contactId: string;
  fullName: string | null;
  phone: string | null;
  customerType: string | null;
  storeName: string | null;
  assignedUser: { id: string; fullName: string } | null;
  orderCount: number;
  totalRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
  segmentKey: string;
  segmentLabel: string;
}

export async function getAtRiskAgents(
  orgId: string,
  filters: ResaleFilters,
  segmentKey?: string,
): Promise<AtRiskAgentRow[]> {
  const allAgents = await loadAgentStatsLifetime(orgId, filters);
  // Drop never-ordered agents — they're not "at risk", they're prospects.
  const withOrders = allAgents.filter((a) => a.orderCount > 0);
  const filtered = withOrders.filter((a) => {
    const seg = classifySegment(a.daysSinceLastOrder);
    if (segmentKey && seg.key !== segmentKey) return false;
    // When no segment is requested, default to "at risk" = warning + worse.
    if (!segmentKey) {
      return ['warning', 'pre_churn', 'pre_churn_heavy', 'churned'].includes(
        seg.key,
      );
    }
    return true;
  });
  // Sort by lifetime revenue desc — biggest at-risk customers first.
  filtered.sort((a, b) => b.totalRevenue - a.totalRevenue);
  return filtered.map((a) => {
    const seg = classifySegment(a.daysSinceLastOrder);
    return {
      contactId: a.contactId,
      fullName: a.fullName,
      phone: a.phone,
      customerType: a.customerType,
      storeName: a.storeName,
      assignedUser: a.assignedUser,
      orderCount: a.orderCount,
      totalRevenue: a.totalRevenue,
      lastOrderDate: a.lastOrderDate?.toISOString() ?? null,
      daysSinceLastOrder: Number.isFinite(a.daysSinceLastOrder)
        ? a.daysSinceLastOrder
        : 99999,
      segmentKey: seg.key,
      segmentLabel: seg.label,
    };
  });
}
