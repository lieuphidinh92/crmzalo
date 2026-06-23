/**
 * PR2 — Phân loại Top 1-4 KH theo điểm 100.
 *
 * Công thức anh Philip duyệt (KH-list refactor session):
 *   score          = 0.7 × profit_score + 0.3 × revenue_score
 *   profit_score   = 0.7 × percentile(profit_60d)  + 0.3 × percentile(profit_lifetime)
 *   revenue_score  = 0.7 × percentile(revenue_60d) + 0.3 × percentile(revenue_lifetime)
 *
 *   percentile = (rank của KH trong org) ÷ (tổng KH có data) × 100
 *      KH cao nhất trong org → 100đ, thấp nhất → 0đ (theo PERCENT_RANK PG).
 *
 * Rank cutoffs:
 *   score 80-100 → top_1 (VIP)        — màu vàng
 *   score 50-79  → top_2 (Thân thiết)  — màu xanh lá
 *   score 20-49  → top_3 (Thường)      — màu xanh dương
 *   score 0-19   → top_4 (Ít hoạt động) — xám
 *
 * KH không có đơn `completed` nào → rank = NULL (không phân loại).
 *
 * Doanh số = `Order.totalAmountValue` ưu tiên (đã gồm VAT — feedback memory
 * của anh Philip), fallback `total_amount` (Float legacy MISA imports).
 * Lợi nhuận = SUM(order_items.profit) với profit = line_total - line_cost.
 *
 * Chỉ tính đơn `status IN ('confirmed','shipped','completed')` (mirror với
 * report list endpoint).
 */

import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export const COUNTABLE_STATUSES = ['confirmed', 'shipped', 'completed'] as const;
const DAYS_60 = 60;

const W_PROFIT_VS_REVENUE = { profit: 0.7, revenue: 0.3 };
const W_RECENT_VS_LIFETIME = { recent: 0.7, lifetime: 0.3 };

const RANK_CUTOFFS = [
  { rank: 'top_1', min: 80 },
  { rank: 'top_2', min: 50 },
  { rank: 'top_3', min: 20 },
  { rank: 'top_4', min: 0 },
] as const;

function rankOfScore(score: number): string {
  for (const c of RANK_CUTOFFS) if (score >= c.min) return c.rank;
  return 'top_4';
}

type RawMetricRow = {
  contact_id: string;
  revenue_60d: number;
  profit_60d: number;
  revenue_lifetime: number;
  profit_lifetime: number;
};

/**
 * Tính + ghi customerRank/rankScore cho tất cả KH trong 1 org.
 * Trả về stats để cron/log.
 */
export async function recomputeRanksForOrg(orgId: string): Promise<{
  orgId: string;
  totalContacts: number;
  withData: number;
  byRank: Record<string, number>;
  durationMs: number;
}> {
  const t0 = Date.now();

  // 1 query duy nhất aggregate revenue/profit per contact, 60d + lifetime.
  // Coalesce `total_amount_value` (Decimal, ưu tiên — gồm VAT) → fallback
  // `total_amount` (Float legacy). Profit lấy từ order_items.profit (FIFO
  // đã set sẵn khi packing). Loại đơn draft/cancelled.
  const rows = await prisma.$queryRaw<RawMetricRow[]>(Prisma.sql`
    SELECT
      c.id AS contact_id,
      COALESCE(SUM(COALESCE(o.total_amount_value::float, o.total_amount)) FILTER (
        WHERE o.order_date >= NOW() - INTERVAL '${Prisma.raw(String(DAYS_60))} days'
          AND o.status IN ('confirmed','shipped','completed')
      ), 0)::float AS revenue_60d,
      COALESCE(SUM(oi.profit::float) FILTER (
        WHERE o.order_date >= NOW() - INTERVAL '${Prisma.raw(String(DAYS_60))} days'
          AND o.status IN ('confirmed','shipped','completed')
          AND oi.profit IS NOT NULL
      ), 0)::float AS profit_60d,
      COALESCE(SUM(COALESCE(o.total_amount_value::float, o.total_amount)) FILTER (
        WHERE o.status IN ('confirmed','shipped','completed')
      ), 0)::float AS revenue_lifetime,
      COALESCE(SUM(oi.profit::float) FILTER (
        WHERE o.status IN ('confirmed','shipped','completed')
          AND oi.profit IS NOT NULL
      ), 0)::float AS profit_lifetime
    FROM contacts c
    LEFT JOIN orders o ON o.contact_id = c.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE c.org_id = ${orgId}
    GROUP BY c.id
  `);

  const totalContacts = rows.length;
  // KH có ít nhất 1 đơn tính (revenue hoặc profit > 0 ở bất kỳ window nào)
  const withData: RawMetricRow[] = rows.filter(
    (r: RawMetricRow) =>
      r.revenue_lifetime > 0 || r.profit_lifetime > 0 || r.revenue_60d > 0 || r.profit_60d > 0,
  );
  const noData: RawMetricRow[] = rows.filter((r: RawMetricRow) => !withData.includes(r));

  // Percentile rank trong từng metric: KH có giá trị cao nhất = 100, thấp
  // nhất (vẫn > 0) = 100/N. KH = 0 → percentile = 0.
  // Dùng dense rank để KH cùng giá trị có cùng điểm.
  function percentilesOf(values: number[]): Map<number, number> {
    // Trả map: value → percentile 0-100
    const sorted = [...new Set(values.filter(v => v > 0))].sort((a, b) => a - b);
    const n = sorted.length;
    const map = new Map<number, number>();
    map.set(0, 0);
    sorted.forEach((v, i) => {
      // i+1 / n × 100. i=0 → thấp nhất → 100/n; i=n-1 → cao nhất → 100.
      map.set(v, ((i + 1) / n) * 100);
    });
    return map;
  }

  const pRev60 = percentilesOf(withData.map((r: RawMetricRow) => r.revenue_60d));
  const pRevLT = percentilesOf(withData.map((r: RawMetricRow) => r.revenue_lifetime));
  const pPro60 = percentilesOf(withData.map((r: RawMetricRow) => r.profit_60d));
  const pProLT = percentilesOf(withData.map((r: RawMetricRow) => r.profit_lifetime));

  type Scored = { contactId: string; score: number; rank: string };
  const scored: Scored[] = withData.map((r: RawMetricRow) => {
    const rev60 = pRev60.get(r.revenue_60d) ?? 0;
    const revLT = pRevLT.get(r.revenue_lifetime) ?? 0;
    const pro60 = pPro60.get(r.profit_60d) ?? 0;
    const proLT = pProLT.get(r.profit_lifetime) ?? 0;

    const revenueScore =
      W_RECENT_VS_LIFETIME.recent * rev60 + W_RECENT_VS_LIFETIME.lifetime * revLT;
    const profitScore =
      W_RECENT_VS_LIFETIME.recent * pro60 + W_RECENT_VS_LIFETIME.lifetime * proLT;

    const score =
      W_PROFIT_VS_REVENUE.profit * profitScore + W_PROFIT_VS_REVENUE.revenue * revenueScore;

    return { contactId: r.contact_id, score, rank: rankOfScore(score) };
  });

  const byRank: Record<string, number> = { top_1: 0, top_2: 0, top_3: 0, top_4: 0, no_data: noData.length };

  // Batch update bằng transaction để atomic. PG row-level lock đủ — không
  // serializable vì các row độc lập.
  // Timeout 60s vì Supabase prod latency ~50ms/query × 250 contacts = ~12s
  // — default 5s sẽ time-out.
  const now = new Date();
  await prisma.$transaction(
    async (tx: any) => {
      for (const s of scored) {
        byRank[s.rank]++;
        await tx.contact.update({
          where: { id: s.contactId },
          data: {
            customerRank: s.rank,
            rankScore: Math.round(s.score * 100) / 100, // 2 decimal
            rankUpdatedAt: now,
          },
        });
      }
      // KH không có data → clear rank (idempotent: đặt null nếu trước đó có rank).
      for (const r of noData) {
        await tx.contact.update({
          where: { id: r.contact_id },
          data: { customerRank: null, rankScore: null, rankUpdatedAt: now },
        });
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  const durationMs = Date.now() - t0;
  logger.info(
    `[customer-rank] org=${orgId} contacts=${totalContacts} withData=${withData.length} ` +
      `top1=${byRank.top_1} top2=${byRank.top_2} top3=${byRank.top_3} top4=${byRank.top_4} ` +
      `(${durationMs}ms)`,
  );

  return { orgId, totalContacts, withData: withData.length, byRank, durationMs };
}

/** Recompute cho tất cả org (cron + manual seed). */
export async function recomputeRanksAllOrgs(): Promise<void> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const o of orgs) {
    try {
      await recomputeRanksForOrg(o.id);
    } catch (err) {
      logger.error(`[customer-rank] FAIL org=${o.id}`, err);
    }
  }
}
