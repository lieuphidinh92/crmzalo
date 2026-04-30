/**
 * sale-score-config-service.ts — read/write the 6 tunable weights for
 * the sale-score formula. Auto-seeds spec defaults on first read so
 * a fresh org never sees an empty list.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export const METRIC_KEYS = [
  'resale_revenue',
  'active_rate',
  'new_agents',
  'conversion_rate',
  'retention_90d',
  'compliance_score',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/** Spec defaults — sum to 100. Used when org has no row + when user clicks Reset. */
export const DEFAULT_WEIGHTS: Record<MetricKey, number> = {
  resale_revenue: 25,
  active_rate: 20,
  new_agents: 15,
  conversion_rate: 15,
  retention_90d: 15,
  compliance_score: 10,
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  resale_revenue: 'Doanh số Resale',
  active_rate: 'Tỉ lệ active',
  new_agents: 'Đại lý mới',
  conversion_rate: 'Tỉ lệ chốt',
  retention_90d: 'Retention 90 ngày',
  compliance_score: 'Tuân thủ quy trình',
};

export interface ScoreWeight {
  metricKey: MetricKey;
  label: string;
  weight: number;
  isDefault: boolean;
}

const cache = new Map<string, { rows: ScoreWeight[]; expiresAt: number }>();
const TTL_MS = 60_000;

export async function getOrgWeights(orgId: string): Promise<ScoreWeight[]> {
  const hit = cache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.rows;

  const stored = await prisma.saleScoreConfig.findMany({ where: { orgId } });
  const map = new Map(stored.map((r) => [r.metricKey as MetricKey, Number(r.weight)]));

  const rows: ScoreWeight[] = METRIC_KEYS.map((key) => ({
    metricKey: key,
    label: METRIC_LABELS[key],
    weight: map.has(key) ? map.get(key)! : DEFAULT_WEIGHTS[key],
    isDefault: !map.has(key),
  }));

  cache.set(orgId, { rows, expiresAt: Date.now() + TTL_MS });
  return rows;
}

export async function setOrgWeights(
  orgId: string,
  updates: Array<{ metricKey: MetricKey; weight: number }>,
  updatedBy: string,
): Promise<ScoreWeight[]> {
  // Validate: each weight in [0, 100], sum exactly 100.
  for (const u of updates) {
    if (!METRIC_KEYS.includes(u.metricKey)) {
      throw Object.assign(new Error(`Metric không hợp lệ: ${u.metricKey}`), {
        statusCode: 400,
      });
    }
    if (!Number.isFinite(u.weight) || u.weight < 0 || u.weight > 100) {
      throw Object.assign(
        new Error(`Trọng số ${u.metricKey} phải trong khoảng 0-100`),
        { statusCode: 400 },
      );
    }
  }
  const total = updates.reduce((s, u) => s + Number(u.weight), 0);
  // Allow tiny rounding tolerance.
  if (Math.abs(total - 100) > 0.5) {
    throw Object.assign(
      new Error(`Tổng trọng số phải = 100% (hiện ${total.toFixed(2)}%)`),
      { statusCode: 400 },
    );
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.saleScoreConfig.upsert({
        where: { orgId_metricKey: { orgId, metricKey: u.metricKey } },
        update: { weight: u.weight, updatedBy },
        create: {
          orgId,
          metricKey: u.metricKey,
          weight: u.weight,
          updatedBy,
        },
      }),
    ),
  );
  cache.delete(orgId);
  return getOrgWeights(orgId);
}

export async function resetOrgWeights(orgId: string): Promise<ScoreWeight[]> {
  await prisma.saleScoreConfig.deleteMany({ where: { orgId } });
  cache.delete(orgId);
  return getOrgWeights(orgId);
}

export function invalidateScoreConfigCache(orgId: string): void {
  cache.delete(orgId);
}
