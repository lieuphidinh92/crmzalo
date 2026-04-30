/**
 * Daily message stats aggregation — runs at 02:00 UTC (09:00 VN).
 * Aggregates sent/received counts per zalo account per org into DailyMessageStat.
 * Uses raw SQL upsert to avoid FK constraint on userId (uses 'system' sentinel).
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export function startDailyStatsAggregation(): void {
  cron.schedule('0 2 * * *', async () => {
    logger.info('[stats] Running daily stats aggregation...');
    try {
      await aggregateYesterday();
      logger.info('[stats] Daily stats aggregation complete');
    } catch (err) {
      logger.error('[stats] Aggregation error:', err);
    }
  });

  logger.info('[stats] Daily stats cron started (02:00 UTC)');
}

async function aggregateYesterday(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const today = new Date(yesterday);
  today.setDate(today.getDate() + 1);

  const orgs = await prisma.organization.findMany({ select: { id: true } });

  for (const org of orgs) {
    await aggregateOrgStats(org.id, yesterday, today);
  }
}

async function aggregateOrgStats(orgId: string, from: Date, to: Date): Promise<void> {
  const stats = await prisma.$queryRaw<Array<{
    zalo_account_id: string;
    sent: bigint;
    received: bigint;
  }>>`
    SELECT
      c.zalo_account_id,
      COUNT(*) FILTER (WHERE m.sender_type = 'self')    AS sent,
      COUNT(*) FILTER (WHERE m.sender_type = 'contact') AS received
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.org_id    = ${orgId}
      AND m.sent_at  >= ${from}
      AND m.sent_at   < ${to}
    GROUP BY c.zalo_account_id
  `;

  for (const s of stats) {
    // Use raw INSERT ON CONFLICT to bypass FK constraint on user_id
    await prisma.$executeRaw`
      INSERT INTO daily_message_stats
        (id, org_id, user_id, zalo_account_id, stat_date, messages_sent, messages_received)
      VALUES
        (gen_random_uuid(), ${orgId}, 'system', ${s.zalo_account_id}, ${from}, ${Number(s.sent)}, ${Number(s.received)})
      ON CONFLICT (user_id, zalo_account_id, stat_date)
      DO UPDATE SET
        messages_sent     = EXCLUDED.messages_sent,
        messages_received = EXCLUDED.messages_received
    `;
  }
}
