/**
 * ceo-service.ts — query layer for the CEO dashboard.
 *
 * Six unrelated reports share one file because they all read from the
 * same {Contact, Order, StageHistory} tables and benefit from being
 * cached behind one `withCache` instance. The HTTP layer (ceo-routes.ts)
 * applies admin/owner gating + 15-minute caching.
 *
 * "Đại lý" / agent in this module = Contact with stage='dai_ly_chinh_thuc'.
 * Thresholds (active/at-risk/churned days, annual revenue target) come
 * from `business-goals-service.getOrgGoals` so a CEO can re-tune the
 * report without code changes.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals, type BusinessGoals } from '../settings/business-goals-service.js';

const OFFICIAL_STAGE = 'dai_ly_chinh_thuc';
const ACTIVE_DAYS = 30; // "active" = had order within last 30 days

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date = new Date()): Date {
  return new Date(date.getFullYear(), 0, 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function ymKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/* ── 1. KPI tháng (6 thẻ) ─────────────────────────────────────────── */

export interface CeoKpi {
  monthRevenue: { value: number; previous: number; trend: number };
  ytdRevenue: { value: number; goal: number; percentOfGoal: number };
  agents: { active: number; total: number; ratio: number };
  newClosed: { count: number; previous: number; trend: number };
  churned: { count: number; ratio: number; alert: boolean };
  pipelineValue: number;
}

export async function getKpi(orgId: string): Promise<CeoKpi> {
  const goals = await getOrgGoals(orgId);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const yearStart = startOfYear(now);

  const [
    monthAgg,
    lastMonthAgg,
    ytdAgg,
    activeAgents,
    totalAgents,
    newClosedThis,
    newClosedPrev,
    churnedThis,
    pipelineValueAgg,
  ] = await Promise.all([
    // Doanh số tháng này
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
    // Doanh số tháng trước
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
    // YTD
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
    // Đại lý active = stage=dai_ly_chinh_thuc AND has order in last 30d
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
    prisma.contact.count({
      where: { orgId, stage: OFFICIAL_STAGE },
    }),
    // Đại lý mới chốt tháng này — qua StageHistory
    prisma.stageHistory.count({
      where: {
        contact: { orgId },
        toStage: OFFICIAL_STAGE,
        changedAt: { gte: monthStart },
      },
    }),
    prisma.stageHistory.count({
      where: {
        contact: { orgId },
        toStage: OFFICIAL_STAGE,
        changedAt: { gte: lastMonthStart, lt: monthStart },
      },
    }),
    // Đại lý churn tháng này — flipped vào "ngung" trong tháng
    // (stageUpdatedAt fallback nếu chưa có StageHistory)
    prisma.contact.count({
      where: {
        orgId,
        stage: 'ngung',
        OR: [
          { stageUpdatedAt: { gte: monthStart } },
          { stageUpdatedAt: null, updatedAt: { gte: monthStart } },
        ],
      },
    }),
    // Pipeline value = SUM(potentialValue) where stage IN active funnel stages
    prisma.contact.aggregate({
      where: {
        orgId,
        stage: { in: ['tiep_can', 'da_bao_gia', 'dang_thu_hang'] },
      },
      _sum: { potentialValue: true },
    }),
  ]);

  const monthValue = Number(monthAgg._sum.totalAmount ?? 0);
  const lastMonthValue = Number(lastMonthAgg._sum.totalAmount ?? 0);
  const ytdValue = Number(ytdAgg._sum.totalAmount ?? 0);

  return {
    monthRevenue: {
      value: monthValue,
      previous: lastMonthValue,
      trend: trendPercent(monthValue, lastMonthValue),
    },
    ytdRevenue: {
      value: ytdValue,
      goal: goals.annualRevenue,
      percentOfGoal:
        goals.annualRevenue > 0 ? (ytdValue / goals.annualRevenue) * 100 : 0,
    },
    agents: {
      active: activeAgents,
      total: totalAgents,
      ratio: totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0,
    },
    newClosed: {
      count: newClosedThis,
      previous: newClosedPrev,
      trend: trendPercent(newClosedThis, newClosedPrev),
    },
    churned: {
      count: churnedThis,
      ratio: totalAgents > 0 ? (churnedThis / totalAgents) * 100 : 0,
      // Alert if monthly churn > 5% of total agents.
      alert: totalAgents > 0 && churnedThis / totalAgents > 0.05,
    },
    pipelineValue: Number(pipelineValueAgg._sum.potentialValue ?? 0),
  };
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/* ── 2. Pareto top 20 ────────────────────────────────────────────── */

export interface ParetoRow {
  rank: number;
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  ytdRevenue: number;
  contributionPercent: number;
  cumulativePercent: number;
  health: 'active' | 'at_risk' | 'churned' | 'unknown';
  daysSinceLastOrder: number | null;
}

export interface ParetoResponse {
  rows: ParetoRow[];
  /** Number of agents that account for 80% of YTD revenue. */
  agentsFor80Percent: number;
  /** Total YTD revenue across ALL agents (not just top 20). */
  totalYtd: number;
}

export async function getPareto(orgId: string): Promise<ParetoResponse> {
  const goals = await getOrgGoals(orgId);
  const yearStart = startOfYear();

  // SUM revenue per contact YTD.
  const groupedAll = await prisma.order.groupBy({
    by: ['contactId'],
    where: {
      orgId,
      OR: [
        { orderDate: { gte: yearStart } },
        { orderDate: null, createdAt: { gte: yearStart } },
      ],
    },
    _sum: { totalAmount: true },
  });
  const totalYtd = groupedAll.reduce(
    (s, g) => s + Number(g._sum.totalAmount ?? 0),
    0,
  );

  // Sort agents by YTD desc, compute cumulative.
  const sorted = [...groupedAll].sort(
    (a, b) =>
      Number(b._sum.totalAmount ?? 0) - Number(a._sum.totalAmount ?? 0),
  );

  // 80% threshold count.
  let cumulative = 0;
  let agentsFor80Percent = 0;
  for (let i = 0; i < sorted.length; i++) {
    cumulative += Number(sorted[i]._sum.totalAmount ?? 0);
    if (cumulative >= totalYtd * 0.8) {
      agentsFor80Percent = i + 1;
      break;
    }
  }
  if (agentsFor80Percent === 0 && sorted.length > 0) {
    agentsFor80Percent = sorted.length;
  }

  // Top 20 with hydration.
  const top = sorted.slice(0, 20);
  if (top.length === 0) {
    return { rows: [], agentsFor80Percent: 0, totalYtd };
  }
  const topIds = top.map((t) => t.contactId);
  const [contacts, lastOrderRows] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: topIds } },
      select: {
        id: true,
        fullName: true,
        storeName: true,
        customerType: true,
        stage: true,
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
  const lastOrderMap = new Map(lastOrderRows.map((r) => [r.contactId, r]));
  const today = new Date();

  let runningCumulative = 0;
  const rows: ParetoRow[] = top.map((row, idx) => {
    const ytdRevenue = Number(row._sum.totalAmount ?? 0);
    runningCumulative += ytdRevenue;
    const contact = contactMap.get(row.contactId);
    const last =
      lastOrderMap.get(row.contactId)?._max.orderDate ??
      lastOrderMap.get(row.contactId)?._max.createdAt ??
      null;
    const daysSince = last
      ? Math.floor(
          (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;
    return {
      rank: idx + 1,
      contactId: row.contactId,
      fullName: contact?.fullName ?? null,
      storeName: contact?.storeName ?? null,
      customerType: contact?.customerType ?? null,
      assignedUser: contact?.assignedUser ?? null,
      ytdRevenue,
      contributionPercent: totalYtd > 0 ? (ytdRevenue / totalYtd) * 100 : 0,
      cumulativePercent:
        totalYtd > 0 ? (runningCumulative / totalYtd) * 100 : 0,
      health: classifyHealth(daysSince, goals),
      daysSinceLastOrder: daysSince,
    };
  });

  return { rows, agentsFor80Percent, totalYtd };
}

function classifyHealth(
  daysSince: number | null,
  goals: BusinessGoals,
): ParetoRow['health'] {
  if (daysSince === null) return 'unknown';
  if (daysSince <= 30) return 'active';
  if (daysSince <= goals.churnDays) return 'at_risk';
  return 'churned';
}

/* ── 3. Cohort retention (12 × 12) ───────────────────────────────── */

export interface CohortCell {
  cohortMonth: string;        // 'YYYY-MM'
  monthOffset: number;        // 0..12
  retainedCount: number;
  cohortSize: number;
  retentionPercent: number;   // 0..100
}

export async function getCohortRetention(
  orgId: string,
): Promise<{ cohorts: CohortCell[][]; cohortLabels: string[] }> {
  const monthsBack = 12;
  const today = new Date();

  // Build the 12 cohort months (oldest to newest).
  const cohortMonths: Date[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    cohortMonths.push(addMonths(startOfMonth(today), -i));
  }

  // For each contact: when did they FIRST reach dai_ly_chinh_thuc?
  // Use StageHistory. Contacts with no history but stage='dai_ly_chinh_thuc'
  // fall back to their first order month (best-effort for pre-history data).
  const closeRows = await prisma.stageHistory.findMany({
    where: { contact: { orgId }, toStage: OFFICIAL_STAGE },
    select: { contactId: true, changedAt: true },
    orderBy: { changedAt: 'asc' },
  });
  const firstClose = new Map<string, Date>();
  for (const r of closeRows) {
    if (!firstClose.has(r.contactId)) firstClose.set(r.contactId, r.changedAt);
  }

  // Fallback for contacts without history: first order month, only if
  // they are currently at OFFICIAL_STAGE (so we don't pick up prospects).
  const orphanContacts = await prisma.contact.findMany({
    where: {
      orgId,
      stage: OFFICIAL_STAGE,
      stageHistory: { none: { toStage: OFFICIAL_STAGE } },
    },
    select: { id: true },
  });
  if (orphanContacts.length > 0) {
    const orphanIds = orphanContacts.map((c) => c.id);
    const firstOrders = await prisma.order.groupBy({
      by: ['contactId'],
      where: { orgId, contactId: { in: orphanIds } },
      _min: { orderDate: true, createdAt: true },
    });
    for (const fo of firstOrders) {
      const date = fo._min.orderDate ?? fo._min.createdAt;
      if (date && !firstClose.has(fo.contactId)) {
        firstClose.set(fo.contactId, date);
      }
    }
  }

  // Build per-cohort member lists.
  const cohortMembers = new Map<string, Set<string>>();
  for (const cm of cohortMonths) cohortMembers.set(ymKey(cm), new Set());
  for (const [contactId, firstDate] of firstClose) {
    const key = ymKey(startOfMonth(firstDate));
    if (cohortMembers.has(key)) cohortMembers.get(key)!.add(contactId);
  }

  // For active-month detection: count orders per (contactId, ym).
  const oldestCohort = cohortMonths[0];
  const orderRows = await prisma.$queryRaw<
    Array<{ contact_id: string; ym: string }>
  >`
    SELECT DISTINCT
      contact_id,
      to_char(date_trunc('month', COALESCE(order_date, created_at)), 'YYYY-MM') AS ym
    FROM orders
    WHERE org_id = ${orgId}
      AND COALESCE(order_date, created_at) >= ${oldestCohort}
  `;
  const orderActivity = new Map<string, Set<string>>(); // contactId → Set<ym>
  for (const r of orderRows) {
    const set = orderActivity.get(r.contact_id) ?? new Set();
    set.add(r.ym);
    if (!orderActivity.has(r.contact_id)) orderActivity.set(r.contact_id, set);
  }

  // Build matrix: rows = cohorts, cols = month offsets 0..12.
  const cohortLabels = cohortMonths.map((m) => ymKey(m));
  const matrix: CohortCell[][] = cohortMonths.map((cohortDate, cohortIdx) => {
    const cohortKey = cohortLabels[cohortIdx];
    const members = cohortMembers.get(cohortKey) ?? new Set();
    const cohortSize = members.size;
    const row: CohortCell[] = [];
    for (let off = 0; off <= monthsBack; off++) {
      const targetMonth = addMonths(cohortDate, off);
      // Skip future cells.
      if (targetMonth > today) {
        row.push({
          cohortMonth: cohortKey,
          monthOffset: off,
          retainedCount: 0,
          cohortSize,
          retentionPercent: -1, // sentinel: not yet observable
        });
        continue;
      }
      const targetKey = ymKey(targetMonth);
      let retained = 0;
      for (const contactId of members) {
        if (orderActivity.get(contactId)?.has(targetKey)) retained++;
      }
      row.push({
        cohortMonth: cohortKey,
        monthOffset: off,
        retainedCount: retained,
        cohortSize,
        retentionPercent: cohortSize > 0 ? (retained / cohortSize) * 100 : 0,
      });
    }
    return row;
  });

  return { cohorts: matrix, cohortLabels };
}

/* ── 4. Revenue by segment (12-month stacked) ────────────────────── */

export interface SegmentMonthRow {
  month: string; // 'YYYY-MM'
  byType: Record<string, number>; // customerType → revenue
}

export async function getRevenueBySegment(
  orgId: string,
): Promise<SegmentMonthRow[]> {
  const since = addMonths(startOfMonth(), -11);
  const rows = await prisma.$queryRaw<
    Array<{ ym: string; customer_type: string | null; revenue: number | string }>
  >`
    SELECT
      to_char(date_trunc('month', COALESCE(o.order_date, o.created_at)), 'YYYY-MM') AS ym,
      c.customer_type,
      SUM(o.total_amount)::float AS revenue
    FROM orders o
    JOIN contacts c ON c.id = o.contact_id
    WHERE o.org_id = ${orgId}
      AND COALESCE(o.order_date, o.created_at) >= ${since}
    GROUP BY ym, c.customer_type
    ORDER BY ym ASC
  `;

  // Build all 12 month buckets so empty months still render.
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    months.push(ymKey(addMonths(since, i)));
  }
  const byMonth = new Map<string, Record<string, number>>(
    months.map((m) => [m, {}]),
  );
  for (const r of rows) {
    const bucket = byMonth.get(r.ym) ?? {};
    const key = r.customer_type ?? 'unknown';
    bucket[key] = (bucket[key] ?? 0) + Number(r.revenue);
    byMonth.set(r.ym, bucket);
  }
  return months.map((m) => ({ month: m, byType: byMonth.get(m) ?? {} }));
}

/* ── 5. At-risk VIPs (top 5 by lifetime DS) ──────────────────────── */

export interface AtRiskVipRow {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  lifetimeRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
}

export async function getAtRiskVips(orgId: string): Promise<AtRiskVipRow[]> {
  const goals = await getOrgGoals(orgId);
  const today = new Date();

  // Collect lifetime revenue per official agent.
  const officialAgents = await prisma.contact.findMany({
    where: { orgId, stage: OFFICIAL_STAGE },
    select: {
      id: true,
      fullName: true,
      storeName: true,
      customerType: true,
      assignedUser: { select: { id: true, fullName: true } },
    },
  });
  const ids = officialAgents.map((a) => a.id);
  if (ids.length === 0) return [];

  const aggs = await prisma.order.groupBy({
    by: ['contactId'],
    where: { orgId, contactId: { in: ids } },
    _sum: { totalAmount: true },
    _max: { orderDate: true, createdAt: true },
  });
  const aggMap = new Map(aggs.map((a) => [a.contactId, a]));

  const enriched = officialAgents.map((agent) => {
    const agg = aggMap.get(agent.id);
    const last = agg?._max.orderDate ?? agg?._max.createdAt ?? null;
    const days = last
      ? Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
      : Number.POSITIVE_INFINITY;
    return {
      contactId: agent.id,
      fullName: agent.fullName,
      storeName: agent.storeName,
      customerType: agent.customerType,
      assignedUser: agent.assignedUser,
      lifetimeRevenue: Number(agg?._sum.totalAmount ?? 0),
      lastOrderDate: last?.toISOString() ?? null,
      daysSinceLastOrder: Number.isFinite(days) ? days : 99999,
    };
  });

  // At-risk = days > atRiskDays AND has at least 1 order. Sort by lifetime
  // revenue desc; take top 5.
  return enriched
    .filter(
      (a) =>
        a.lifetimeRevenue > 0 &&
        a.daysSinceLastOrder > goals.atRiskDays,
    )
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, 5);
}

/* ── 6. Sale performance ─────────────────────────────────────────── */

export interface SalePerformanceRow {
  saleId: string;
  saleName: string;
  agentsCount: number;
  activeAgentsCount: number;
  monthRevenue: number;
  newlyClosedThisMonth: number;
  stuckDealsCount: number;
}

export async function getSalePerformance(
  orgId: string,
): Promise<SalePerformanceRow[]> {
  const goals = await getOrgGoals(orgId);
  const monthStart = startOfMonth();
  const stuckCutoff = addDays(new Date(), -goals.stuckDays);
  const activeCutoff = addDays(new Date(), -ACTIVE_DAYS);

  // List sales (= users in this org).
  const sales = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  if (sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);

  const [agentsCounts, activeCounts, revenueAggs, newlyClosed, stuckCounts] =
    await Promise.all([
      // Agents (any stage) per sale
      prisma.contact.groupBy({
        by: ['assignedUserId'],
        where: { orgId, assignedUserId: { in: saleIds } },
        _count: { id: true },
      }),
      // Active agents (stage=official + recent order)
      prisma.contact.groupBy({
        by: ['assignedUserId'],
        where: {
          orgId,
          assignedUserId: { in: saleIds },
          stage: OFFICIAL_STAGE,
          orders: {
            some: {
              OR: [
                { orderDate: { gte: activeCutoff } },
                { orderDate: null, createdAt: { gte: activeCutoff } },
              ],
            },
          },
        },
        _count: { id: true },
      }),
      // Month revenue per sale (sum from contacts assigned to them)
      prisma.$queryRaw<Array<{ assigned_user_id: string; revenue: number | string }>>`
        SELECT c.assigned_user_id, SUM(o.total_amount)::float AS revenue
        FROM orders o
        JOIN contacts c ON c.id = o.contact_id
        WHERE o.org_id = ${orgId}
          AND c.assigned_user_id = ANY(${saleIds}::text[])
          AND COALESCE(o.order_date, o.created_at) >= ${monthStart}
        GROUP BY c.assigned_user_id
      `,
      // Newly closed this month per sale
      prisma.$queryRaw<Array<{ assigned_user_id: string; cnt: bigint }>>`
        SELECT c.assigned_user_id, COUNT(DISTINCT c.id) AS cnt
        FROM stage_history sh
        JOIN contacts c ON c.id = sh.contact_id
        WHERE c.org_id = ${orgId}
          AND c.assigned_user_id = ANY(${saleIds}::text[])
          AND sh.to_stage = ${OFFICIAL_STAGE}
          AND sh.changed_at >= ${monthStart}
        GROUP BY c.assigned_user_id
      `,
      // Stuck deals per sale
      prisma.contact.groupBy({
        by: ['assignedUserId'],
        where: {
          orgId,
          assignedUserId: { in: saleIds },
          stage: { in: ['tiep_can', 'da_bao_gia', 'dang_thu_hang'] },
          OR: [
            { stageUpdatedAt: { lt: stuckCutoff } },
            { stageUpdatedAt: null, updatedAt: { lt: stuckCutoff } },
          ],
        },
        _count: { id: true },
      }),
    ]);

  const agentsMap = new Map(
    agentsCounts.map((g) => [g.assignedUserId ?? '', g._count.id]),
  );
  const activeMap = new Map(
    activeCounts.map((g) => [g.assignedUserId ?? '', g._count.id]),
  );
  const revenueMap = new Map(
    revenueAggs.map((r) => [r.assigned_user_id, Number(r.revenue ?? 0)]),
  );
  const closedMap = new Map(
    newlyClosed.map((r) => [r.assigned_user_id, Number(r.cnt)]),
  );
  const stuckMap = new Map(
    stuckCounts.map((g) => [g.assignedUserId ?? '', g._count.id]),
  );

  return sales.map((s) => ({
    saleId: s.id,
    saleName: s.fullName,
    agentsCount: agentsMap.get(s.id) ?? 0,
    activeAgentsCount: activeMap.get(s.id) ?? 0,
    monthRevenue: revenueMap.get(s.id) ?? 0,
    newlyClosedThisMonth: closedMap.get(s.id) ?? 0,
    stuckDealsCount: stuckMap.get(s.id) ?? 0,
  }));
}
