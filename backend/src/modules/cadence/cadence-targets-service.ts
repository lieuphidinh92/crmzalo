/**
 * cadence-targets-service.ts — read/write per-role weekly cadence
 * targets, stored as a single JSON row in AppSetting under the key
 * `cadence_targets`.
 *
 * Shape:
 *   { member: { posts: 14, interacts: 45, learning: 1, reports: 5 },
 *     admin:  { posts: 0,  interacts: 0,  learning: 1, reports: 5 } }
 *
 * 60-second in-memory cache mirrors the business-goals service pattern
 * so reads from the dashboard don't hit the DB on every render.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface CadenceTargetSet {
  posts: number;
  interacts: number;
  learning: number;
  reports: number;
}

export interface CadenceTargets {
  member: CadenceTargetSet;
  admin: CadenceTargetSet;
}

export const DEFAULT_TARGETS: CadenceTargets = {
  member: { posts: 14, interacts: 45, learning: 1, reports: 5 },
  admin: { posts: 0, interacts: 0, learning: 1, reports: 5 },
};

const SETTING_KEY = 'cadence_targets';
const cache = new Map<string, { targets: CadenceTargets; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function clean(set: Partial<CadenceTargetSet> | undefined): CadenceTargetSet {
  const out: CadenceTargetSet = { posts: 0, interacts: 0, learning: 0, reports: 0 };
  for (const k of ['posts', 'interacts', 'learning', 'reports'] as const) {
    const v = Number(set?.[k]);
    out[k] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return out;
}

export async function getCadenceTargets(orgId: string): Promise<CadenceTargets> {
  const hit = cache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.targets;

  const row = await prisma.appSetting.findFirst({
    where: { orgId, settingKey: SETTING_KEY },
    select: { valuePlain: true },
  });

  let targets: CadenceTargets = {
    member: { ...DEFAULT_TARGETS.member },
    admin: { ...DEFAULT_TARGETS.admin },
  };
  if (row?.valuePlain) {
    try {
      const parsed = JSON.parse(row.valuePlain) as Partial<CadenceTargets>;
      targets = {
        member: clean({ ...DEFAULT_TARGETS.member, ...parsed.member }),
        admin: clean({ ...DEFAULT_TARGETS.admin, ...parsed.admin }),
      };
    } catch {
      // fall through to defaults on bad JSON
    }
  }
  cache.set(orgId, { targets, expiresAt: Date.now() + CACHE_TTL_MS });
  return targets;
}

export function invalidateCadenceTargets(orgId: string): void {
  cache.delete(orgId);
}

export async function setCadenceTargets(
  orgId: string,
  patch: Partial<CadenceTargets>,
): Promise<CadenceTargets> {
  const current = await getCadenceTargets(orgId);
  const next: CadenceTargets = {
    member: clean({ ...current.member, ...patch.member }),
    admin: clean({ ...current.admin, ...patch.admin }),
  };

  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
    update: { valuePlain: JSON.stringify(next) },
    create: { orgId, settingKey: SETTING_KEY, valuePlain: JSON.stringify(next) },
  });

  invalidateCadenceTargets(orgId);
  return next;
}
