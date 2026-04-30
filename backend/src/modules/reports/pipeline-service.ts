/**
 * pipeline-service.ts — pipeline / opportunity-funnel analytics.
 *
 * Reads only — never mutates. The drag-drop endpoint that mutates
 * Contact.stage lives in contact-routes.ts (where it has neighbours
 * doing the same thing) and calls `invalidateCacheByPrefix(orgId)` to
 * keep this layer's cache consistent.
 *
 * Domain rules (confirmed in spec):
 *   - 5 fixed stages: tiep_can | da_bao_gia | dang_thu_hang
 *                     | dai_ly_chinh_thuc | ngung
 *   - "Active deals" = stages other than ngung (used for total
 *     pipeline value).
 *   - "Đứng yên" = days since `stage_updated_at`. Cards with idle > 14
 *     are flagged red.
 *   - Conversion rate is a SNAPSHOT for v1: dai_ly_chinh_thuc / all
 *     contacts with a stage (any of the 5).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { cacheKey, withCache } from './resale-service.js';
import { getOrgGoals } from '../settings/business-goals-service.js';

export const PIPELINE_STAGES = [
  'tiep_can',
  'da_bao_gia',
  'dang_thu_hang',
  'dai_ly_chinh_thuc',
  'ngung',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng',
};

const ACTIVE_STAGES: PipelineStage[] = [
  'tiep_can',
  'da_bao_gia',
  'dang_thu_hang',
];

export interface PipelineFilters {
  saleId?: string | null;
  from?: string;
  to?: string;
}

function buildContactWhere(orgId: string, filters: PipelineFilters) {
  const where: any = { orgId, stage: { in: PIPELINE_STAGES as readonly string[] } };
  if (filters.saleId) where.assignedUserId = filters.saleId;
  if (filters.from || filters.to) {
    where.updatedAt = {};
    if (filters.from) where.updatedAt.gte = new Date(filters.from + 'T00:00:00');
    if (filters.to) where.updatedAt.lte = new Date(filters.to + 'T23:59:59');
  }
  return where;
}

/* ── Funnel deals ──────────────────────────────────────────────────────── */

export interface PipelineDeal {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  phone: string | null;
  customerType: string | null;
  assignedUser: { id: string; fullName: string } | null;
  potentialValue: number;
  stage: PipelineStage;
  stageUpdatedAt: string | null;
  daysIdle: number;
  isStuck: boolean;
}

export interface PipelineColumn {
  stage: PipelineStage;
  label: string;
  count: number;
  totalValue: number;
  deals: PipelineDeal[];
}

export async function getPipeline(
  orgId: string,
  filters: PipelineFilters,
): Promise<PipelineColumn[]> {
  const goals = await getOrgGoals(orgId);
  const idleThreshold = goals.stuckDays;
  const where = buildContactWhere(orgId, filters);

  const contacts = await prisma.contact.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      storeName: true,
      phone: true,
      customerType: true,
      assignedUser: { select: { id: true, fullName: true } },
      potentialValue: true,
      stage: true,
      stageUpdatedAt: true,
      updatedAt: true,
    },
    orderBy: { stageUpdatedAt: 'asc' }, // oldest cards first → easier to spot stuck deals
  });

  const today = new Date();
  const dealsByStage = new Map<PipelineStage, PipelineDeal[]>();
  for (const stage of PIPELINE_STAGES) dealsByStage.set(stage, []);

  for (const c of contacts) {
    const stage = c.stage as PipelineStage;
    if (!PIPELINE_STAGES.includes(stage)) continue;
    const lastChange = c.stageUpdatedAt ?? c.updatedAt;
    const daysIdle = Math.floor(
      (today.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24),
    );
    dealsByStage.get(stage)!.push({
      contactId: c.id,
      fullName: c.fullName,
      storeName: c.storeName,
      phone: c.phone,
      customerType: c.customerType,
      assignedUser: c.assignedUser,
      potentialValue: c.potentialValue ? Number(c.potentialValue) : 0,
      stage,
      stageUpdatedAt: c.stageUpdatedAt?.toISOString() ?? null,
      daysIdle,
      isStuck: daysIdle > idleThreshold && stage !== 'dai_ly_chinh_thuc',
    });
  }

  return PIPELINE_STAGES.map((stage) => {
    const deals = dealsByStage.get(stage)!;
    const totalValue = deals.reduce((s, d) => s + d.potentialValue, 0);
    return {
      stage,
      label: STAGE_LABELS[stage],
      count: deals.length,
      totalValue,
      deals,
    };
  });
}

/* ── Metrics row ──────────────────────────────────────────────────────── */

export interface PipelineMetrics {
  /** SUM(potentialValue) where stage in active stages. */
  totalPipelineValue: number;
  /** Snapshot conversion: dai_ly_chinh_thuc / total with any stage. */
  conversionRate: { rate: number; converted: number; total: number };
  /** Mean days from first stage_history entry to a dai_ly_chinh_thuc entry. */
  avgClosingDays: { days: number; sample: number };
  /** Cards with daysIdle > 14 (excluding the closed/lost states). */
  stuckCount: number;
}

export async function getMetrics(
  orgId: string,
  filters: PipelineFilters,
): Promise<PipelineMetrics> {
  const where = buildContactWhere(orgId, filters);

  // 1. Total pipeline value — only active stages.
  const totalValueAgg = await prisma.contact.aggregate({
    where: { ...where, stage: { in: ACTIVE_STAGES as readonly string[] } },
    _sum: { potentialValue: true },
  });

  // 2. Conversion rate — snapshot.
  const [convertedCount, totalCount] = await Promise.all([
    prisma.contact.count({
      where: { ...where, stage: 'dai_ly_chinh_thuc' },
    }),
    prisma.contact.count({ where }),
  ]);

  // 3. Average closing days. Pull stage histories for any contact in this
  //    org that ever reached `dai_ly_chinh_thuc`. Compute (firstEntry → close)
  //    per contact, then mean.
  const closes = await prisma.stageHistory.findMany({
    where: {
      contact: { orgId },
      toStage: 'dai_ly_chinh_thuc',
    },
    select: { contactId: true, changedAt: true },
  });
  const closeMap = new Map<string, Date>();
  for (const c of closes) {
    // Multiple "promote to dai_ly" rows per contact possible; keep the
    // earliest so we measure the *first* time they hit it.
    const existing = closeMap.get(c.contactId);
    if (!existing || c.changedAt < existing) closeMap.set(c.contactId, c.changedAt);
  }
  const closedIds = [...closeMap.keys()];
  let avgClosingDays = { days: 0, sample: 0 };
  if (closedIds.length > 0) {
    const firstEntries = await prisma.stageHistory.groupBy({
      by: ['contactId'],
      where: { contactId: { in: closedIds } },
      _min: { changedAt: true },
    });
    const durations: number[] = [];
    for (const fe of firstEntries) {
      const close = closeMap.get(fe.contactId);
      const start = fe._min.changedAt;
      if (!start || !close) continue;
      const diffDays = (close.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0) durations.push(diffDays);
    }
    if (durations.length > 0) {
      avgClosingDays = {
        days: durations.reduce((s, x) => s + x, 0) / durations.length,
        sample: durations.length,
      };
    }
  }

  // 4. Stuck count — daysIdle > goals.stuckDays, excluding closed/lost states.
  const goals = await getOrgGoals(orgId);
  const stuckCutoff = new Date();
  stuckCutoff.setDate(stuckCutoff.getDate() - goals.stuckDays);
  const stuckCount = await prisma.contact.count({
    where: {
      ...where,
      stage: { in: ACTIVE_STAGES as readonly string[] },
      OR: [
        { stageUpdatedAt: { lt: stuckCutoff } },
        // Fallback: contact never had stageUpdatedAt set and updatedAt is old.
        { stageUpdatedAt: null, updatedAt: { lt: stuckCutoff } },
      ],
    },
  });

  return {
    totalPipelineValue: Number(totalValueAgg._sum.potentialValue ?? 0),
    conversionRate: {
      converted: convertedCount,
      total: totalCount,
      rate: totalCount === 0 ? 0 : (convertedCount / totalCount) * 100,
    },
    avgClosingDays,
    stuckCount,
  };
}

/* ── Top stuck reasons ────────────────────────────────────────────────── */

export interface StuckReasonRow {
  reason: string;
  count: number;
}

export async function getStuckReasons(
  orgId: string,
  filters: PipelineFilters,
  limit = 5,
): Promise<StuckReasonRow[]> {
  const where = buildContactWhere(orgId, filters);
  const grouped = await prisma.contact.groupBy({
    by: ['stuckReason'],
    where: { ...where, stage: 'ngung', stuckReason: { not: null } },
    _count: { id: true },
  });
  return grouped
    .map((g) => ({ reason: g.stuckReason ?? '(không rõ)', count: g._count.id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* ── Cache key helpers (re-export resale's withCache to share the Map) ── */

export function pipelineCacheKey(
  endpoint: string,
  orgId: string,
  filters: PipelineFilters,
): string {
  return cacheKey([
    endpoint,
    orgId,
    filters.saleId,
    filters.from,
    filters.to,
  ]);
}

export { withCache };
