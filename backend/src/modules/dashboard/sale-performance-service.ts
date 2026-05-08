/**
 * sale-performance-service.ts — query layer for the Sale evaluation
 * module on the CEO dashboard.
 *
 * Six raw metrics + one composite score per (sale, calendar month):
 *   1. resaleRevenue   — SUM(orders) for "old" agents only
 *   2. activeRate      — % of agents with order in last 60d
 *   3. newAgents       — # contacts that hit dai_ly_chinh_thuc this month
 *   4. conversionRate  — % of leads (created in window) → đại lý
 *   5. retention90d    — % of agents who closed 90d ago, still active
 *   6. complianceScore — 0-100 composite of 4 sub-metrics
 *
 * Score = Σ (metric normalized 0-100 against month's best performer)
 *         × weight from sale-score-config.
 *
 * Alerts: 5 categories matched against thresholds confirmed in spec.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals } from '../settings/business-goals-service.js';
import {
  getOrgWeights,
  type MetricKey,
} from '../settings/sale-score-config-service.js';

const OFFICIAL_STAGE = 'dai_ly_chinh_thuc';
const ACTIVE_LOOKBACK_DAYS = 60;

/** Statuses that count as booked revenue. Excludes draft (not yet
 * confirmed) and cancelled. Mirrors COUNTABLE_ORDER_STATUSES in
 * overview-service — kept as a local copy so this module has no
 * cross-dependency on the reports layer. */
const COUNTABLE_STATUSES = ['confirmed', 'shipped', 'completed'] as const;

/* ── Helpers ────────────────────────────────────────────────────────── */

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseMonth(month: string | undefined): Date {
  // Accept 'YYYY-MM' or default to current month start.
  if (!month) return startOfMonth();
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return startOfMonth();
  return new Date(y, m - 1, 1);
}

/* ── 1. resaleRevenue ──────────────────────────────────────────────── */

export async function calculateResaleRevenue(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  // "Đại lý cũ" = contact created BEFORE `from`. Sale attribution is on
  // `order.assignedSaleId` (who closed the order), not `contact
  // .assignedUserId` — those diverge for MISA-imported contacts where
  // the import script defaults contact-owner to Admin while orders
  // carry the real sale_id.
  const result = await prisma.order.aggregate({
    where: {
      orgId,
      assignedSaleId: saleId,
      status: { in: [...COUNTABLE_STATUSES] },
      contact: { createdAt: { lt: from } },
      OR: [
        { orderDate: { gte: from, lt: to } },
        { orderDate: null, createdAt: { gte: from, lt: to } },
      ],
    },
    _sum: { totalAmount: true },
  });
  return Number(result._sum.totalAmount ?? 0);
}

/** Counterpart to calculateResaleRevenue: revenue from contacts that
 * are NOT old (i.e. created on or after `from`) — i.e. agents who
 * became customers within or after the start of the period. Used for
 * the "Top 5 Sale" panel total = resaleRevenue + newAgentRevenue.
 *
 * IMPORTANT: contact.createdAt is bounded only by `gte: from`, NOT
 * `< to`. The previous tighter range opened a "gap" for orders whose
 * contact was created LATER than the order itself (e.g. MISA imports
 * the order header before the customer record is finalised). With
 * the gap, those orders fell out of BOTH resale (createdAt >= from)
 * AND newAgent (createdAt >= to) buckets — Top Sale silently lost
 * them while KPI total still counted them. (Bug fixed 2026-05-08.)
 */
export async function calculateNewAgentRevenue(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const result = await prisma.order.aggregate({
    where: {
      orgId,
      assignedSaleId: saleId,
      status: { in: [...COUNTABLE_STATUSES] },
      contact: { createdAt: { gte: from } }, // exhaustive partner of resale
      OR: [
        { orderDate: { gte: from, lt: to } },
        { orderDate: null, createdAt: { gte: from, lt: to } },
      ],
    },
    _sum: { totalAmount: true },
  });
  return Number(result._sum.totalAmount ?? 0);
}

/* ── 2. activeRate ─────────────────────────────────────────────────── */

export async function calculateActiveRate(
  orgId: string,
  saleId: string,
  asOf: Date,
): Promise<{ active: number; total: number; rate: number }> {
  const [total, active] = await Promise.all([
    prisma.contact.count({
      where: { orgId, assignedUserId: saleId, stage: OFFICIAL_STAGE },
    }),
    prisma.contact.count({
      where: {
        orgId,
        assignedUserId: saleId,
        stage: OFFICIAL_STAGE,
        orders: {
          some: {
            status: { in: [...COUNTABLE_STATUSES] },
            OR: [
              { orderDate: { gte: addDays(asOf, -ACTIVE_LOOKBACK_DAYS) } },
              {
                orderDate: null,
                createdAt: { gte: addDays(asOf, -ACTIVE_LOOKBACK_DAYS) },
              },
            ],
          },
        },
      },
    }),
  ]);
  return { active, total, rate: total > 0 ? (active / total) * 100 : 0 };
}

/* ── 3. newAgents ──────────────────────────────────────────────────── */

export async function calculateNewAgents(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  // StageHistory rows where toStage='dai_ly_chinh_thuc' in window AND the
  // contact is currently assigned to this sale. Note: assignedUserId might
  // change over time; we simplify and use *current* assignment.
  return prisma.stageHistory.count({
    where: {
      contact: { orgId, assignedUserId: saleId },
      toStage: OFFICIAL_STAGE,
      changedAt: { gte: from, lt: to },
    },
  });
}

/* ── 4. conversionRate ─────────────────────────────────────────────── */

export async function calculateConversionRate(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<{ leads: number; converted: number; rate: number }> {
  const leads = await prisma.contact.count({
    where: {
      orgId,
      assignedUserId: saleId,
      createdAt: { gte: from, lt: to },
    },
  });
  if (leads === 0) return { leads: 0, converted: 0, rate: 0 };

  const leadIds = (
    await prisma.contact.findMany({
      where: {
        orgId,
        assignedUserId: saleId,
        createdAt: { gte: from, lt: to },
      },
      select: { id: true },
    })
  ).map((c) => c.id);

  const converted = await prisma.contact.count({
    where: { id: { in: leadIds }, stage: OFFICIAL_STAGE },
  });
  return { leads, converted, rate: (converted / leads) * 100 };
}

/* ── 5. retention90d ───────────────────────────────────────────────── */

export async function calculateRetention90d(
  orgId: string,
  saleId: string,
  asOf: Date,
): Promise<{ cohort: number; stillActive: number; rate: number }> {
  // Agents who first closed ~90 days ago (between 75 and 105 days = ±15 day
  // window so a single bad day doesn't make the cohort empty).
  const cohortFloor = addDays(asOf, -105);
  const cohortCeiling = addDays(asOf, -75);

  const cohortRows = await prisma.stageHistory.findMany({
    where: {
      contact: { orgId, assignedUserId: saleId },
      toStage: OFFICIAL_STAGE,
      changedAt: { gte: cohortFloor, lt: cohortCeiling },
    },
    select: { contactId: true },
    distinct: ['contactId'],
  });
  const cohortIds = cohortRows.map((r) => r.contactId);
  if (cohortIds.length === 0) return { cohort: 0, stillActive: 0, rate: 0 };

  const stillActive = await prisma.contact.count({
    where: {
      id: { in: cohortIds },
      orders: {
        some: {
          status: { in: [...COUNTABLE_STATUSES] },
          OR: [
            { orderDate: { gte: addDays(asOf, -ACTIVE_LOOKBACK_DAYS) } },
            {
              orderDate: null,
              createdAt: { gte: addDays(asOf, -ACTIVE_LOOKBACK_DAYS) },
            },
          ],
        },
      },
    },
  });
  return {
    cohort: cohortIds.length,
    stillActive,
    rate: (stillActive / cohortIds.length) * 100,
  };
}

/* ── 6. complianceScore ────────────────────────────────────────────── */

export interface ComplianceBreakdown {
  noteFreshness: number;       // 0-30
  stageHygiene: number;        // 0-30
  zaloResponseTime: number;    // 0-25
  aiInsightUsage: number;      // 0-15
  total: number;               // 0-100
}

export async function calculateComplianceScore(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<ComplianceBreakdown> {
  const goals = await getOrgGoals(orgId);

  // Sub-metric 1 (30đ): % of assigned contacts with note refreshed
  // within the window. Proxy: SaleComplianceLog action_type=note_updated
  // OR contact.updated_at in window (covers data before logging existed).
  const totalContacts = await prisma.contact.count({
    where: { orgId, assignedUserId: saleId },
  });
  let noteFreshness = 0;
  if (totalContacts > 0) {
    const refreshedCount = await prisma.contact.count({
      where: {
        orgId,
        assignedUserId: saleId,
        updatedAt: { gte: from, lt: to },
      },
    });
    noteFreshness = (refreshedCount / totalContacts) * 30;
  }

  // Sub-metric 2 (30đ): % of active deals NOT stuck.
  const activeDeals = await prisma.contact.findMany({
    where: {
      orgId,
      assignedUserId: saleId,
      stage: { in: ['tiep_can', 'da_bao_gia', 'dang_thu_hang'] },
    },
    select: { stageUpdatedAt: true, updatedAt: true },
  });
  let stageHygiene = 0;
  if (activeDeals.length > 0) {
    const stuckCutoff = addDays(to, -goals.stuckDays);
    const healthy = activeDeals.filter((d) => {
      const last = d.stageUpdatedAt ?? d.updatedAt;
      return last >= stuckCutoff;
    }).length;
    stageHygiene = (healthy / activeDeals.length) * 30;
  }

  // Sub-metric 3 (25đ): % of contact-side messages received in business
  // hours (8h-18h, Mon-Sat) that got a self-reply within 2h. Computed on
  // a sample of recent messages.
  const zaloResponseTime = await calculateZaloResponseScore(orgId, saleId, from, to);

  // Sub-metric 4 (15đ): % of "important" stage transitions
  // (toStage IN dai_ly_chinh_thuc | ngung) that had AI insight refreshed
  // in last 7 days before transition.
  const aiInsightUsage = await calculateAiInsightUsageScore(orgId, saleId, from, to);

  const total = noteFreshness + stageHygiene + zaloResponseTime + aiInsightUsage;
  return {
    noteFreshness: round2(noteFreshness),
    stageHygiene: round2(stageHygiene),
    zaloResponseTime: round2(zaloResponseTime),
    aiInsightUsage: round2(aiInsightUsage),
    total: round2(total),
  };
}

async function calculateZaloResponseScore(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  // Pull recent contact-side messages in the window for THIS sale's contacts.
  const inboundMessages = await prisma.message.findMany({
    where: {
      conversation: {
        orgId,
        contact: { assignedUserId: saleId },
      },
      senderType: 'contact',
      sentAt: { gte: from, lt: to },
    },
    select: {
      id: true,
      conversationId: true,
      sentAt: true,
    },
    orderBy: { sentAt: 'asc' },
    take: 500, // cap to keep query bounded
  });
  if (inboundMessages.length === 0) return 0;

  // Filter to "business hours" — Mon-Sat 8:00-18:00.
  const businessOnly = inboundMessages.filter((m) => isBusinessHours(m.sentAt));
  if (businessOnly.length === 0) return 0;

  // For each inbound, find earliest self message in same conversation after it.
  const conversationIds = [...new Set(businessOnly.map((m) => m.conversationId))];
  const followups = await prisma.message.findMany({
    where: {
      conversationId: { in: conversationIds },
      senderType: 'self',
      repliedByUserId: saleId,
      sentAt: { gte: from },
    },
    select: { conversationId: true, sentAt: true },
    orderBy: { sentAt: 'asc' },
  });

  const followupsByConv = new Map<string, Date[]>();
  for (const f of followups) {
    const arr = followupsByConv.get(f.conversationId) ?? [];
    arr.push(f.sentAt);
    if (!followupsByConv.has(f.conversationId))
      followupsByConv.set(f.conversationId, arr);
  }

  let withinTwoHours = 0;
  for (const inbound of businessOnly) {
    const arr = followupsByConv.get(inbound.conversationId) ?? [];
    const reply = arr.find((d) => d.getTime() > inbound.sentAt.getTime());
    if (reply) {
      const diffMs = reply.getTime() - inbound.sentAt.getTime();
      if (diffMs <= 2 * 60 * 60 * 1000) withinTwoHours++;
    }
  }
  return (withinTwoHours / businessOnly.length) * 25;
}

function isBusinessHours(date: Date): boolean {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  const hour = date.getHours();
  return dow !== 0 && hour >= 8 && hour < 18;
}

async function calculateAiInsightUsageScore(
  orgId: string,
  saleId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const importantTransitions = await prisma.stageHistory.findMany({
    where: {
      contact: { orgId, assignedUserId: saleId },
      toStage: { in: [OFFICIAL_STAGE, 'ngung'] },
      changedAt: { gte: from, lt: to },
    },
    select: {
      contactId: true,
      changedAt: true,
      contact: { select: { aiInsightUpdatedAt: true } },
    },
  });
  if (importantTransitions.length === 0) return 0;

  let withInsight = 0;
  for (const t of importantTransitions) {
    const insight = t.contact.aiInsightUpdatedAt;
    if (!insight) continue;
    // Insight refreshed within 7 days before transition counts.
    const sevenDaysBefore = addDays(t.changedAt, -7);
    if (insight >= sevenDaysBefore && insight <= t.changedAt) {
      withInsight++;
    }
  }
  return (withInsight / importantTransitions.length) * 15;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── 7. Overall score + per-sale row builder ──────────────────────── */

export interface SaleMetrics {
  saleId: string;
  saleName: string;
  metrics: {
    resaleRevenue: number;
    activeRate: number;
    activeAgents: number;
    totalAgents: number;
    newAgents: number;
    conversionRate: number;
    leadsCount: number;
    convertedCount: number;
    retention90d: number;
    cohort90d: number;
    stillActive90d: number;
    complianceScore: number;
    complianceBreakdown: ComplianceBreakdown;
  };
  /** Per-metric normalized 0-100 score (vs. month's best). */
  normalized: Record<MetricKey, number>;
  /** Σ (normalized × weight%) — final 0-100 score. */
  overallScore: number;
}

async function loadSaleMetrics(
  orgId: string,
  saleId: string,
  saleName: string,
  monthStart: Date,
): Promise<Omit<SaleMetrics, 'normalized' | 'overallScore'>> {
  const monthEnd = addMonths(monthStart, 1);
  const asOf = new Date(monthEnd.getTime() - 1); // last instant of month

  const [revenue, active, newClosed, conv, retention, compliance] =
    await Promise.all([
      calculateResaleRevenue(orgId, saleId, monthStart, monthEnd),
      calculateActiveRate(orgId, saleId, asOf),
      calculateNewAgents(orgId, saleId, monthStart, monthEnd),
      calculateConversionRate(orgId, saleId, monthStart, monthEnd),
      calculateRetention90d(orgId, saleId, asOf),
      calculateComplianceScore(orgId, saleId, monthStart, monthEnd),
    ]);

  return {
    saleId,
    saleName,
    metrics: {
      resaleRevenue: revenue,
      activeRate: active.rate,
      activeAgents: active.active,
      totalAgents: active.total,
      newAgents: newClosed,
      conversionRate: conv.rate,
      leadsCount: conv.leads,
      convertedCount: conv.converted,
      retention90d: retention.rate,
      cohort90d: retention.cohort,
      stillActive90d: retention.stillActive,
      complianceScore: compliance.total,
      complianceBreakdown: compliance,
    },
  };
}

function normalizeAndScore(
  rows: Array<Omit<SaleMetrics, 'normalized' | 'overallScore'>>,
  weights: Record<MetricKey, number>,
): SaleMetrics[] {
  // Find max per metric across cohort.
  const maxes: Record<MetricKey, number> = {
    resale_revenue: Math.max(0, ...rows.map((r) => r.metrics.resaleRevenue)),
    active_rate: Math.max(0, ...rows.map((r) => r.metrics.activeRate)),
    new_agents: Math.max(0, ...rows.map((r) => r.metrics.newAgents)),
    conversion_rate: Math.max(0, ...rows.map((r) => r.metrics.conversionRate)),
    retention_90d: Math.max(0, ...rows.map((r) => r.metrics.retention90d)),
    compliance_score: Math.max(0, ...rows.map((r) => r.metrics.complianceScore)),
  };

  return rows.map((row) => {
    const get = (k: MetricKey, val: number) =>
      maxes[k] === 0 ? 0 : (val / maxes[k]) * 100;
    const normalized: Record<MetricKey, number> = {
      resale_revenue: get('resale_revenue', row.metrics.resaleRevenue),
      active_rate: get('active_rate', row.metrics.activeRate),
      new_agents: get('new_agents', row.metrics.newAgents),
      conversion_rate: get('conversion_rate', row.metrics.conversionRate),
      retention_90d: get('retention_90d', row.metrics.retention90d),
      compliance_score: get('compliance_score', row.metrics.complianceScore),
    };
    let overallScore = 0;
    for (const key of Object.keys(weights) as MetricKey[]) {
      overallScore += (normalized[key] * weights[key]) / 100;
    }
    return {
      ...row,
      normalized,
      overallScore: round2(overallScore),
    };
  });
}

/* ── Public entrypoints ────────────────────────────────────────────── */

export async function getSalePerformanceOverview(
  orgId: string,
  monthStr?: string,
): Promise<{
  month: string;
  rows: SaleMetrics[];
  hasEnoughData: boolean;
  weights: Record<MetricKey, number>;
}> {
  const monthStart = parseMonth(monthStr);
  const sales = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  if (sales.length === 0) {
    return {
      month: ymKey(monthStart),
      rows: [],
      hasEnoughData: false,
      weights: weightsToMap(await getOrgWeights(orgId)),
    };
  }

  const weightRows = await getOrgWeights(orgId);
  const weights = weightsToMap(weightRows);

  const rawRows = await Promise.all(
    sales.map((s) => loadSaleMetrics(orgId, s.id, s.fullName, monthStart)),
  );
  const rows = normalizeAndScore(rawRows, weights);

  // "Enough data" heuristic: org has been collecting for at least 30 days.
  const oldest = await prisma.contact.aggregate({
    where: { orgId },
    _min: { createdAt: true },
  });
  const hasEnoughData =
    !!oldest._min.createdAt &&
    Date.now() - oldest._min.createdAt.getTime() >= 30 * 86400_000;

  // Sort by overall score desc.
  rows.sort((a, b) => b.overallScore - a.overallScore);

  return {
    month: ymKey(monthStart),
    rows,
    hasEnoughData,
    weights,
  };
}

function weightsToMap(
  rows: Array<{ metricKey: MetricKey; weight: number }>,
): Record<MetricKey, number> {
  const out = {} as Record<MetricKey, number>;
  for (const r of rows) out[r.metricKey] = r.weight;
  return out;
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── Detail panel ──────────────────────────────────────────────────── */

export interface SaleDetailResponse {
  current: SaleMetrics | null;
  history: Array<{ month: string; score: number }>;
  topAgents: Array<{
    contactId: string;
    fullName: string | null;
    storeName: string | null;
    lifetimeRevenue: number;
    daysSinceLastOrder: number | null;
  }>;
  stuckDeals: Array<{
    contactId: string;
    fullName: string | null;
    stage: string;
    daysIdle: number;
  }>;
}

export async function getSaleDetail(
  orgId: string,
  saleId: string,
  monthStr?: string,
): Promise<SaleDetailResponse> {
  const monthStart = parseMonth(monthStr);
  const sale = await prisma.user.findFirst({
    where: { id: saleId, orgId },
    select: { id: true, fullName: true },
  });
  if (!sale) throw Object.assign(new Error('Sale not found'), { statusCode: 404 });

  // Current month — fetch alone (not normalized vs others) to render radar.
  const weights = weightsToMap(await getOrgWeights(orgId));
  const raw = await loadSaleMetrics(orgId, sale.id, sale.fullName, monthStart);
  const [current] = normalizeAndScore([raw], weights);

  // 6-month history: compute overall score for past 5 months + this one.
  // Cheap-ish since we only run for this one sale, not all sales.
  const historyMonths: Date[] = [];
  for (let i = 5; i >= 0; i--) historyMonths.push(addMonths(monthStart, -i));
  const history: Array<{ month: string; score: number }> = [];
  for (const m of historyMonths) {
    const row = await loadSaleMetrics(orgId, sale.id, sale.fullName, m);
    // History is single-sale snapshot — normalize vs. self with self-as-max
    // → all metrics = 100 if non-zero. Better: skip normalization, use
    // weighted absolute proxy. Simplest: weighted mean of metrics already
    // on 0-100 scales (active_rate, conversion_rate, retention_90d,
    // compliance_score) plus log-scale revenue. We keep it simple:
    //   - compliance_score (0..100) directly
    //   - active_rate, conversion_rate, retention_90d: as %
    //   - resale_revenue: capped at 100M VND per metric → 100 points
    //   - new_agents: capped at 10 per metric → 100 points
    const REV_CAP = 100_000_000;
    const NEW_CAP = 10;
    const norm = {
      resale_revenue: Math.min(100, (row.metrics.resaleRevenue / REV_CAP) * 100),
      active_rate: row.metrics.activeRate,
      new_agents: Math.min(100, (row.metrics.newAgents / NEW_CAP) * 100),
      conversion_rate: row.metrics.conversionRate,
      retention_90d: row.metrics.retention90d,
      compliance_score: row.metrics.complianceScore,
    };
    let score = 0;
    for (const k of Object.keys(weights) as MetricKey[]) {
      score += (norm[k] * weights[k]) / 100;
    }
    history.push({ month: ymKey(m), score: round2(score) });
  }

  // Top 5 agents by lifetime revenue.
  const agents = await prisma.contact.findMany({
    where: { orgId, assignedUserId: sale.id, stage: OFFICIAL_STAGE },
    select: { id: true, fullName: true, storeName: true },
  });
  const agentIds = agents.map((a) => a.id);
  const agentAggs =
    agentIds.length === 0
      ? []
      : await prisma.order.groupBy({
          by: ['contactId'],
          where: { orgId, contactId: { in: agentIds } },
          _sum: { totalAmount: true },
          _max: { orderDate: true, createdAt: true },
        });
  const aggMap = new Map(agentAggs.map((a) => [a.contactId, a]));
  const today = new Date();
  const topAgents = agents
    .map((a) => {
      const agg = aggMap.get(a.id);
      const last = agg?._max.orderDate ?? agg?._max.createdAt ?? null;
      return {
        contactId: a.id,
        fullName: a.fullName,
        storeName: a.storeName,
        lifetimeRevenue: Number(agg?._sum.totalAmount ?? 0),
        daysSinceLastOrder: last
          ? Math.floor(
              (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
            )
          : null,
      };
    })
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, 5);

  // Stuck deals (top 3).
  const goals = await getOrgGoals(orgId);
  const stuckCutoff = addDays(new Date(), -goals.stuckDays);
  const stuckRaw = await prisma.contact.findMany({
    where: {
      orgId,
      assignedUserId: sale.id,
      stage: { in: ['tiep_can', 'da_bao_gia', 'dang_thu_hang'] },
      OR: [
        { stageUpdatedAt: { lt: stuckCutoff } },
        { stageUpdatedAt: null, updatedAt: { lt: stuckCutoff } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      stage: true,
      stageUpdatedAt: true,
      updatedAt: true,
    },
    orderBy: { stageUpdatedAt: 'asc' },
    take: 3,
  });
  const nowMs = Date.now();
  const stuckDeals = stuckRaw.map((d) => {
    const last = d.stageUpdatedAt ?? d.updatedAt;
    return {
      contactId: d.id,
      fullName: d.fullName,
      stage: d.stage ?? 'unknown',
      daysIdle: Math.floor((nowMs - last.getTime()) / (1000 * 60 * 60 * 24)),
    };
  });

  return { current, history, topAgents, stuckDeals };
}

/* ── Alerts ────────────────────────────────────────────────────────── */

export interface SaleAlert {
  saleId: string;
  saleName: string;
  reason: string;
  metric: string;
  value: number | string;
}

export interface SaleAlerts {
  needsIntervention: SaleAlert[];
  potential: SaleAlert[];
}

export async function getSaleAlerts(
  orgId: string,
  monthStr?: string,
): Promise<SaleAlerts> {
  const overview = await getSalePerformanceOverview(orgId, monthStr);
  const rows = overview.rows;
  if (rows.length === 0) return { needsIntervention: [], potential: [] };

  const sortedByRevenue = [...rows].sort(
    (a, b) => b.metrics.resaleRevenue - a.metrics.resaleRevenue,
  );
  const top30Cutoff = sortedByRevenue[Math.floor(rows.length * 0.3)] ?? sortedByRevenue[0];
  const bottom50Cutoff = sortedByRevenue[Math.floor(rows.length * 0.5)] ?? sortedByRevenue[sortedByRevenue.length - 1];

  const needsIntervention: SaleAlert[] = [];
  const potential: SaleAlert[] = [];

  for (const r of rows) {
    // 🚨 Top 30% DS but retention < 50% → "ép hàng"
    if (
      r.metrics.resaleRevenue >= top30Cutoff.metrics.resaleRevenue &&
      r.metrics.retention90d < 50 &&
      r.metrics.cohort90d > 0
    ) {
      needsIntervention.push({
        saleId: r.saleId,
        saleName: r.saleName,
        reason: 'DS cao nhưng retention 90 ngày <50% — có dấu hiệu ép hàng',
        metric: 'retention_90d',
        value: r.metrics.retention90d.toFixed(0) + '%',
      });
    }
    // 🚨 Active rate < 40% → bỏ bê tệp
    if (r.metrics.totalAgents > 0 && r.metrics.activeRate < 40) {
      needsIntervention.push({
        saleId: r.saleId,
        saleName: r.saleName,
        reason: 'Tỉ lệ đại lý active <40% — có thể đang bỏ bê tệp KH',
        metric: 'active_rate',
        value: r.metrics.activeRate.toFixed(0) + '%',
      });
    }
    // 🚨 Compliance < 60 → rủi ro nghỉ việc
    if (r.metrics.complianceScore < 60) {
      needsIntervention.push({
        saleId: r.saleId,
        saleName: r.saleName,
        reason: 'Tuân thủ quy trình <60 — có thể đang chểnh mảng',
        metric: 'compliance_score',
        value: r.metrics.complianceScore.toFixed(0),
      });
    }
    // 💎 Bottom 50% DS + retention > 85% + conv > 20% → tiềm năng
    if (
      r.metrics.resaleRevenue <= bottom50Cutoff.metrics.resaleRevenue &&
      r.metrics.retention90d > 85 &&
      r.metrics.conversionRate > 20 &&
      r.metrics.cohort90d > 0
    ) {
      potential.push({
        saleId: r.saleId,
        saleName: r.saleName,
        reason: 'DS chưa cao nhưng retention >85% + conv >20% — đáng đầu tư đào tạo',
        metric: 'retention_90d',
        value: r.metrics.retention90d.toFixed(0) + '%',
      });
    }
  }

  return { needsIntervention, potential };
}
