/**
 * business-goals-service.ts — read/write the per-org business goals
 * stored in the existing AppSetting table (key prefix `goal_`).
 *
 * These thresholds are read by:
 *   - resale-service.ts  → at-risk + churned day windows
 *   - pipeline-service.ts → idle/stuck threshold
 *   - dashboard/ceo-service.ts → annual revenue target, churn alert
 *
 * Each helper returns numbers (not strings) so callers don't need to
 * parse. Values are cached in-memory for 60s — short enough that an
 * admin saving new thresholds shows up almost immediately, long enough
 * to skip 5 redundant reads per CEO dashboard render.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface BusinessGoals {
  /** Days idle before a deal card flags red on the pipeline. */
  stuckDays: number;
  /** Days since last order before an agent is "sắp churn". */
  atRiskDays: number;
  /** Days since last order before an agent is "đã churn". */
  churnDays: number;
  /** Annual revenue target in VND. 0 = not configured. */
  annualRevenue: number;
}

export const DEFAULT_GOALS: BusinessGoals = {
  stuckDays: 14,
  atRiskDays: 45,
  churnDays: 90,
  annualRevenue: 0,
};

/** Storage key → field map. Centralised so settings page + service agree. */
const GOAL_KEYS = {
  goal_stuck_days: 'stuckDays',
  goal_at_risk_days: 'atRiskDays',
  goal_churn_days: 'churnDays',
  goal_annual_revenue: 'annualRevenue',
} as const satisfies Record<string, keyof BusinessGoals>;

type GoalSettingKey = keyof typeof GOAL_KEYS;

const cache = new Map<string, { goals: BusinessGoals; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getOrgGoals(orgId: string): Promise<BusinessGoals> {
  const hit = cache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.goals;

  const rows = await prisma.appSetting.findMany({
    where: { orgId, settingKey: { startsWith: 'goal_' } },
    select: { settingKey: true, valuePlain: true },
  });

  const goals: BusinessGoals = { ...DEFAULT_GOALS };
  for (const row of rows) {
    const field = GOAL_KEYS[row.settingKey as GoalSettingKey];
    if (!field || !row.valuePlain) continue;
    const parsed = Number(row.valuePlain);
    if (Number.isFinite(parsed) && parsed >= 0) {
      goals[field] = parsed;
    }
  }
  cache.set(orgId, { goals, expiresAt: Date.now() + CACHE_TTL_MS });
  return goals;
}

export function invalidateOrgGoals(orgId: string): void {
  cache.delete(orgId);
}

export async function setOrgGoals(
  orgId: string,
  patch: Partial<BusinessGoals>,
): Promise<BusinessGoals> {
  // Normalize + validate. Reject negatives + non-finite.
  const updates: Array<{ key: GoalSettingKey; value: string }> = [];
  for (const [key, field] of Object.entries(GOAL_KEYS) as Array<
    [GoalSettingKey, keyof BusinessGoals]
  >) {
    const raw = patch[field];
    if (raw === undefined) continue;
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      throw Object.assign(new Error(`Giá trị không hợp lệ cho ${field}`), {
        statusCode: 400,
      });
    }
    updates.push({ key, value: String(num) });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.appSetting.upsert({
        where: { orgId_settingKey: { orgId, settingKey: u.key } },
        update: { valuePlain: u.value },
        create: { orgId, settingKey: u.key, valuePlain: u.value },
      }),
    ),
  );

  invalidateOrgGoals(orgId);
  return getOrgGoals(orgId);
}
