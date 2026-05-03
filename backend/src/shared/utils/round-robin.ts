/**
 * Round-robin selector for assigning inbound leads to active sales.
 * State persisted in AppSetting jsonb (one cursor per org). Race-safe
 * enough for the 1-webhook-at-a-time pancake flow — for higher
 * concurrency, swap to a SELECT FOR UPDATE.
 */
import { prisma } from '../database/prisma-client.js';
import { logger } from './logger.js';

const SETTING_KEY = 'lead_round_robin_index';

/**
 * Pick the next active member for an org and advance the cursor.
 * Returns null if the org has no active members (caller decides what to do).
 */
export async function pickNextSale(orgId: string): Promise<string | null> {
  const sales = await prisma.user.findMany({
    where: { orgId, role: 'member', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (sales.length === 0) {
    logger.warn(`[round-robin] No active members in org ${orgId}`);
    return null;
  }

  const cursorRow = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
  });

  const lastIndex = cursorRow?.valuePlain ? parseInt(cursorRow.valuePlain, 10) : -1;
  const nextIndex = (Number.isFinite(lastIndex) ? lastIndex + 1 : 0) % sales.length;
  const picked = sales[nextIndex];

  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: SETTING_KEY } },
    create: { orgId, settingKey: SETTING_KEY, valuePlain: String(nextIndex) },
    update: { valuePlain: String(nextIndex) },
  });

  return picked.id;
}
