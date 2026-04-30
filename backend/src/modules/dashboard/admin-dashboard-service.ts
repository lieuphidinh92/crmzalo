/**
 * admin-dashboard-service.ts — query layer for the home page when the
 * caller is owner/admin. Intentionally light — most heavy lifting
 * (cohort, pareto) lives on the dedicated CEO Dashboard. This page is
 * the at-a-glance overview shown right after login.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals } from '../settings/business-goals-service.js';

const OFFICIAL_STAGE = 'dai_ly_chinh_thuc';
const ACTIVE_STAGES = ['tiep_can', 'da_bao_gia', 'dang_thu_hang'];
const ACTIVE_DAYS = 60;
const VIP_LIFETIME_THRESHOLD = 100_000_000; // 100 triệu VND

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date = new Date()): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── 1. Hero KPI (4 cards) ────────────────────────────────────────── */

export interface AdminHeroKpi {
  monthRevenue: {
    value: number;
    previous: number;
    trend: number;
    sparkline: number[]; // last 7 days revenue
  };
  ytdRevenue: {
    value: number;
    goal: number;
    percentOfGoal: number;
    remaining: number;
  };
  agents: { active: number; total: number; ratio: number };
  pipeline: { dealCount: number; totalValue: number };
}

export async function getAdminHeroKpi(orgId: string): Promise<AdminHeroKpi> {
  const goals = await getOrgGoals(orgId);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const yearStart = startOfYear(now);
  const sevenDaysAgo = addDays(now, -7);

  const [monthAgg, lastMonthAgg, ytdAgg, sparkRaw, activeAgents, totalAgents, pipelineAgg] =
    await Promise.all([
      prisma.order.aggregate({
        where: {
          orgId,
          OR: [
            { orderDate: { gte: monthStart } },
            { orderDate: null, createdAt: { gte: monthStart } },
          ],
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: {
          orgId,
          OR: [
            { orderDate: { gte: lastMonthStart, lt: monthStart } },
            {
              orderDate: null,
              createdAt: { gte: lastMonthStart, lt: monthStart },
            },
          ],
        },
        _sum: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: {
          orgId,
          OR: [
            { orderDate: { gte: yearStart } },
            { orderDate: null, createdAt: { gte: yearStart } },
          ],
        },
        _sum: { totalAmount: true },
      }),
      prisma.$queryRaw<Array<{ d: Date; revenue: number | string }>>`
        SELECT
          date_trunc('day', COALESCE(order_date, created_at))::date AS d,
          SUM(total_amount)::float AS revenue
        FROM orders
        WHERE org_id = ${orgId}
          AND COALESCE(order_date, created_at) >= ${sevenDaysAgo}
        GROUP BY d
        ORDER BY d ASC
      `,
      prisma.contact.count({
        where: {
          orgId,
          stage: OFFICIAL_STAGE,
          orders: {
            some: {
              OR: [
                { orderDate: { gte: addDays(now, -ACTIVE_DAYS) } },
                {
                  orderDate: null,
                  createdAt: { gte: addDays(now, -ACTIVE_DAYS) },
                },
              ],
            },
          },
        },
      }),
      prisma.contact.count({ where: { orgId, stage: OFFICIAL_STAGE } }),
      prisma.contact.aggregate({
        where: { orgId, stage: { in: ACTIVE_STAGES } },
        _sum: { potentialValue: true },
        _count: { id: true },
      }),
    ]);

  // Build 7-day sparkline (fill zeros for missing days).
  const sparkMap = new Map(
    sparkRaw.map((r) => [r.d.toISOString().slice(0, 10), Number(r.revenue)]),
  );
  const sparkline: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(now, -i);
    const k = day.toISOString().slice(0, 10);
    sparkline.push(sparkMap.get(k) ?? 0);
  }

  const monthValue = Number(monthAgg._sum.totalAmount ?? 0);
  const lastMonthValue = Number(lastMonthAgg._sum.totalAmount ?? 0);
  const ytdValue = Number(ytdAgg._sum.totalAmount ?? 0);

  return {
    monthRevenue: {
      value: monthValue,
      previous: lastMonthValue,
      trend:
        lastMonthValue === 0
          ? monthValue > 0
            ? 100
            : 0
          : ((monthValue - lastMonthValue) / lastMonthValue) * 100,
      sparkline,
    },
    ytdRevenue: {
      value: ytdValue,
      goal: goals.annualRevenue,
      percentOfGoal:
        goals.annualRevenue > 0 ? (ytdValue / goals.annualRevenue) * 100 : 0,
      remaining: Math.max(0, goals.annualRevenue - ytdValue),
    },
    agents: {
      active: activeAgents,
      total: totalAgents,
      ratio: totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0,
    },
    pipeline: {
      dealCount: pipelineAgg._count.id ?? 0,
      totalValue: Number(pipelineAgg._sum.potentialValue ?? 0),
    },
  };
}

/* ── 2. Critical alerts (3 cards) ─────────────────────────────────── */

export interface CriticalAlerts {
  vipsAtRisk: {
    count: number;
    top: Array<{
      contactId: string;
      fullName: string | null;
      storeName: string | null;
      lifetimeRevenue: number;
      daysSinceLastOrder: number;
      assignedUser: { id: string; fullName: string } | null;
    }>;
  };
  stuckDeals: {
    count: number;
    top: Array<{
      contactId: string;
      fullName: string | null;
      stage: string;
      daysIdle: number;
      potentialValue: number;
      assignedUser: { id: string; fullName: string } | null;
    }>;
  };
  underperformingSales: {
    count: number;
    items: Array<{ saleId: string; saleName: string; score: number }>;
  };
}

export async function getCriticalAlerts(orgId: string): Promise<CriticalAlerts> {
  const goals = await getOrgGoals(orgId);
  const today = new Date();
  const stuckCutoff = addDays(today, -goals.stuckDays);

  // VIPs at risk
  const allOfficial = await prisma.contact.findMany({
    where: { orgId, stage: OFFICIAL_STAGE },
    select: {
      id: true,
      fullName: true,
      storeName: true,
      assignedUser: { select: { id: true, fullName: true } },
    },
  });
  const officialIds = allOfficial.map((c) => c.id);
  let vipTop: CriticalAlerts['vipsAtRisk']['top'] = [];
  let vipCount = 0;
  if (officialIds.length > 0) {
    const aggs = await prisma.order.groupBy({
      by: ['contactId'],
      where: { orgId, contactId: { in: officialIds } },
      _sum: { totalAmount: true },
      _max: { orderDate: true, createdAt: true },
    });
    const aggMap = new Map(aggs.map((a) => [a.contactId, a]));
    const candidates = allOfficial.map((agent) => {
      const agg = aggMap.get(agent.id);
      const last = agg?._max.orderDate ?? agg?._max.createdAt ?? null;
      const days = last
        ? Math.floor((today.getTime() - last.getTime()) / 86_400_000)
        : Number.POSITIVE_INFINITY;
      return {
        contactId: agent.id,
        fullName: agent.fullName,
        storeName: agent.storeName,
        lifetimeRevenue: Number(agg?._sum.totalAmount ?? 0),
        daysSinceLastOrder: Number.isFinite(days) ? days : 99999,
        assignedUser: agent.assignedUser ?? null,
      };
    });
    const filtered = candidates.filter(
      (c) =>
        c.lifetimeRevenue >= VIP_LIFETIME_THRESHOLD &&
        c.daysSinceLastOrder > goals.atRiskDays,
    );
    vipCount = filtered.length;
    vipTop = filtered
      .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
      .slice(0, 3);
  }

  // Stuck deals (top 3 by potential value)
  const stuckContacts = await prisma.contact.findMany({
    where: {
      orgId,
      stage: { in: ACTIVE_STAGES },
      OR: [
        { stageUpdatedAt: { lt: stuckCutoff } },
        { stageUpdatedAt: null, updatedAt: { lt: stuckCutoff } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      stage: true,
      potentialValue: true,
      stageUpdatedAt: true,
      updatedAt: true,
      assignedUser: { select: { id: true, fullName: true } },
    },
    orderBy: { potentialValue: 'desc' },
    take: 100,
  });
  const stuckCount = stuckContacts.length;
  const nowMs = Date.now();
  const stuckTop = stuckContacts.slice(0, 3).map((d) => {
    const last = d.stageUpdatedAt ?? d.updatedAt;
    return {
      contactId: d.id,
      fullName: d.fullName,
      stage: d.stage ?? 'unknown',
      daysIdle: Math.floor((nowMs - last.getTime()) / 86_400_000),
      potentialValue: Number(d.potentialValue ?? 0),
      assignedUser: d.assignedUser ?? null,
    };
  });

  // Underperforming sales — pull from sale-performance overview for current
  // month. We call it lazily here to avoid double-computing — but
  // technically reuses the same calculation chain. For v1 we re-import.
  // (Alternative: cache. Keep simple.)
  const { getSalePerformanceOverview } = await import('./sale-performance-service.js');
  const perf = await getSalePerformanceOverview(orgId);
  const underperformers = perf.rows
    .filter((r) => r.overallScore < 60 && r.metrics.totalAgents > 0)
    .map((r) => ({
      saleId: r.saleId,
      saleName: r.saleName,
      score: r.overallScore,
    }));

  return {
    vipsAtRisk: { count: vipCount, top: vipTop },
    stuckDeals: { count: stuckCount, top: stuckTop },
    underperformingSales: { count: underperformers.length, items: underperformers },
  };
}

/* ── 3. Revenue trend (12 months, with grouping) ──────────────────── */

export type RevenueTrendGroupBy = 'total' | 'type' | 'source';

export interface RevenueTrendRow {
  month: string; // 'YYYY-MM'
  series: Record<string, number>;
}

export async function getRevenueTrend(
  orgId: string,
  groupBy: RevenueTrendGroupBy = 'total',
): Promise<{ months: string[]; series: string[]; rows: RevenueTrendRow[] }> {
  const since = addMonths(startOfMonth(), -11);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) months.push(ymKey(addMonths(since, i)));

  let raw: Array<{ ym: string; bucket: string | null; revenue: number | string }>;
  if (groupBy === 'total') {
    raw = (await prisma.$queryRaw<Array<{ ym: string; revenue: number | string }>>`
      SELECT
        to_char(date_trunc('month', COALESCE(order_date, created_at)), 'YYYY-MM') AS ym,
        SUM(total_amount)::float AS revenue
      FROM orders
      WHERE org_id = ${orgId}
        AND COALESCE(order_date, created_at) >= ${since}
      GROUP BY ym
      ORDER BY ym ASC
    `).map((r) => ({ ym: r.ym, bucket: 'total', revenue: r.revenue }));
  } else if (groupBy === 'type') {
    raw = await prisma.$queryRaw<
      Array<{ ym: string; bucket: string | null; revenue: number | string }>
    >`
      SELECT
        to_char(date_trunc('month', COALESCE(o.order_date, o.created_at)), 'YYYY-MM') AS ym,
        c.customer_type AS bucket,
        SUM(o.total_amount)::float AS revenue
      FROM orders o
      JOIN contacts c ON c.id = o.contact_id
      WHERE o.org_id = ${orgId}
        AND COALESCE(o.order_date, o.created_at) >= ${since}
      GROUP BY ym, c.customer_type
      ORDER BY ym ASC
    `;
  } else {
    // source
    raw = await prisma.$queryRaw<
      Array<{ ym: string; bucket: string | null; revenue: number | string }>
    >`
      SELECT
        to_char(date_trunc('month', COALESCE(o.order_date, o.created_at)), 'YYYY-MM') AS ym,
        c.source AS bucket,
        SUM(o.total_amount)::float AS revenue
      FROM orders o
      JOIN contacts c ON c.id = o.contact_id
      WHERE o.org_id = ${orgId}
        AND COALESCE(o.order_date, o.created_at) >= ${since}
      GROUP BY ym, c.source
      ORDER BY ym ASC
    `;
  }

  // Pivot.
  const seriesSet = new Set<string>();
  const matrix = new Map<string, Map<string, number>>();
  for (const m of months) matrix.set(m, new Map());
  for (const r of raw) {
    const bucket = r.bucket ?? 'unknown';
    seriesSet.add(bucket);
    const monthMap = matrix.get(r.ym);
    if (monthMap) monthMap.set(bucket, Number(r.revenue));
  }
  const series = [...seriesSet];
  const rows: RevenueTrendRow[] = months.map((m) => {
    const monthMap = matrix.get(m) ?? new Map();
    const out: Record<string, number> = {};
    for (const s of series) out[s] = monthMap.get(s) ?? 0;
    return { month: m, series: out };
  });

  return { months, series, rows };
}

/* ── 4. Recent new agents (top 5) ─────────────────────────────────── */

export interface RecentNewAgent {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  closedAt: string;
}

export async function getRecentNewAgents(
  orgId: string,
  limit = 5,
): Promise<RecentNewAgent[]> {
  const rows = await prisma.stageHistory.findMany({
    where: {
      contact: { orgId },
      toStage: OFFICIAL_STAGE,
    },
    select: {
      changedAt: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          storeName: true,
          customerType: true,
          assignedUser: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { changedAt: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    contactId: r.contact.id,
    fullName: r.contact.fullName,
    storeName: r.contact.storeName,
    customerType: r.contact.customerType,
    assignedUser: r.contact.assignedUser,
    closedAt: r.changedAt.toISOString(),
  }));
}

/* ── 5. Top 5 sales (by score this month) ────────────────────────── */

export async function getTopSales(orgId: string, limit = 5) {
  const { getSalePerformanceOverview } = await import('./sale-performance-service.js');
  const perf = await getSalePerformanceOverview(orgId);
  return perf.rows.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    saleId: r.saleId,
    saleName: r.saleName,
    score: r.overallScore,
    monthRevenue: r.metrics.resaleRevenue,
  }));
}
