/**
 * overview-service.ts — query layer for trang "Báo cáo tổng quan"
 *
 * Filter shape: { from, to, saleId? } — saleId scopes by contact.assignedUserId.
 * Member role passes their own user.id as saleId (forced by route layer).
 *
 * 4 endpoints:
 *   getKpi           → 4 KPI cards with current + previous-period trend
 *   getTopProducts   → top SKUs by revenue (line items aggregated)
 *   getTopSales      → delegated to admin-dashboard-service.getTopSales
 *   getTopCustomers  → 4 modes: revenue | resale | profit | at_risk
 *
 * Brand for Top Products is derived from SKU prefix (MH_ Manhae, BIO_
 * Bioisland, NEU_ Neubria, anything else "Khác") — no Product master
 * table yet per Session-1 plan.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export interface OverviewFilters {
  from: Date;
  to: Date;
  saleId?: string | null;
}

const OFFICIAL_STAGE = 'dai_ly_chinh_thuc';
const ACTIVE_LOOKBACK_DAYS = 60;
const AT_RISK_INACTIVE_DAYS = 45;
const AT_RISK_LIFETIME_VND = 100_000_000;

/** Statuses that count as "real revenue". Excludes draft (chưa chốt),
 * cancelled/returned (đã huỷ/hoàn) và opening_balance (công nợ đầu kỳ).
 * NOTE: trạng thái "đang giao" trong DB là `shipping` (KHÔNG phải `shipped`);
 * `shipped`/`paid` chỉ là tên legacy — giữ lại cho chắc. Phải khớp list của
 * sale-app, nếu không đơn shipping/packing bị bỏ → doanh số ra 0. */
export const COUNTABLE_ORDER_STATUSES = ['confirmed', 'packing', 'shipping', 'completed', 'shipped', 'paid'] as const;

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Return the same-length window immediately preceding [from, to). */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const ms = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - ms), to: new Date(from.getTime()) };
}

/** Map SKU prefix → brand. Used only for top-products grouping/labels. */
export function brandFromSku(sku: string): 'Manhae' | 'Bioisland' | 'Neubria' | 'Khác' {
  const s = (sku || '').toUpperCase();
  if (s.startsWith('MH_')) return 'Manhae';
  if (s.startsWith('BIO_')) return 'Bioisland';
  if (s.startsWith('NEU_')) return 'Neubria';
  return 'Khác';
}

/** Order date filter: prefer orderDate, fall back to createdAt. Also
 * gates by status so draft/cancelled never inflate revenue numbers. */
function orderInWindowWhere(from: Date, to: Date) {
  return {
    status: { in: [...COUNTABLE_ORDER_STATUSES] },
    OR: [
      { orderDate: { gte: from, lt: to } },
      { orderDate: null, createdAt: { gte: from, lt: to } },
    ],
  } as const;
}

/** Apply optional saleId scope through `order.assignedSaleId` — i.e. who
 * actually closed the order, not who owns the contact. (Owner of the
 * contact is decoupled because the same contact can be served by
 * multiple sales over time, and MISA-imported contacts default-own to
 * Admin while orders carry the real sale_id.) */
function withSaleScope<T extends Record<string, unknown>>(
  where: T,
  saleId?: string | null,
): T {
  if (!saleId) return where;
  return { ...where, assignedSaleId: saleId } as T;
}

/** Day-resolution diff in the Vietnam timezone, regardless of how the
 * input Date was parsed. Postgres stores `timestamp without time zone`
 * (e.g. `2026-04-08 00:00:00`) as VN local time but Prisma reads them
 * back as UTC Dates — so a raw `(now - last) / 86400000` is 7 hours
 * short and Math.floor turns "30 days exactly" into 29. We solve it
 * by re-anchoring both ends to the start of their VN-local day. */
const VN_TZ_OFFSET_MS = 7 * 3600 * 1000;
function vnLocalDayIndex(d: Date): number {
  return Math.floor((d.getTime() + VN_TZ_OFFSET_MS) / 86400_000);
}
function daysBetweenVN(later: Date, earlier: Date): number {
  return vnLocalDayIndex(later) - vnLocalDayIndex(earlier);
}

/* ── 0. Sparklines (6 monthly buckets ending at `to`) ────────────── */

/** Build 6 month-aligned [from, to) buckets ending at the period end.
 * `end` is exclusive (route layer adds +1 day to user-supplied `to`).
 * We anchor on the *last actual day* in the window so the rightmost
 * bucket is the month that contains real data, not the month after. */
function sixMonthBuckets(end: Date): Array<{ from: Date; to: Date }> {
  const lastDay = new Date(end.getTime() - 1);
  const anchor = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const windows: Array<{ from: Date; to: Date }> = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const stop = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    windows.push({ from: start, to: stop });
  }
  return windows;
}

export async function getSparklines(
  orgId: string,
  filters: OverviewFilters,
): Promise<{
  buckets: string[]; // ['YYYY-MM', ...] length 6
  totalRevenue: number[];
  resaleRevenue: number[];
  activeAgents: number[]; // active count at month end
  profit: number[];
}> {
  const windows = sixMonthBuckets(filters.to);
  const labels = windows.map(
    (w) =>
      `${w.from.getFullYear()}-${String(w.from.getMonth() + 1).padStart(2, '0')}`,
  );

  const data = await Promise.all(
    windows.map(async (w) => {
      const rev = await periodRevenue(orgId, w.from, w.to, filters.saleId);
      const agents = await activeAgents(orgId, w.to, filters.saleId);
      return {
        total: rev.totalRevenue,
        resale: rev.resaleRevenue,
        active: agents.active,
        profit: rev.profit,
      };
    }),
  );

  return {
    buckets: labels,
    totalRevenue: data.map((d) => d.total),
    resaleRevenue: data.map((d) => d.resale),
    activeAgents: data.map((d) => d.active),
    profit: data.map((d) => d.profit),
  };
}

/* ── 1. KPI cards ─────────────────────────────────────────────────── */

interface PeriodRevenue {
  totalRevenue: number;
  resaleRevenue: number;
  profit: number;
  profitWithCost: number; // revenue base for biên LN, only items with cost
}

async function periodRevenue(
  orgId: string,
  from: Date,
  to: Date,
  saleId?: string | null,
): Promise<PeriodRevenue> {
  // Total revenue: SUM(order.total_amount) in window
  const totalAgg = await prisma.order.aggregate({
    where: withSaleScope({ orgId, ...orderInWindowWhere(from, to) }, saleId),
    _sum: { totalAmount: true },
  });

  // Resale revenue: orders whose contact existed before the window started
  const resaleAgg = await prisma.order.aggregate({
    where: withSaleScope(
      {
        orgId,
        ...orderInWindowWhere(from, to),
        contact: { createdAt: { lt: from } },
      },
      saleId,
    ),
    _sum: { totalAmount: true },
  });

  // Profit: SUM(line_total - line_cost) on items with cost; only orders in window.
  // NOTE: use `lineCost` (total cost for the line = qty × unit_cost), NOT
  // `costValue` (per-unit cost stored as a Float for legacy reasons).
  // Mixing them collapses the margin to ~95% — see commit history.
  const profitItems = await prisma.orderItem.findMany({
    where: {
      lineCost: { not: null },
      order: withSaleScope(
        { orgId, ...orderInWindowWhere(from, to) },
        saleId,
      ),
    },
    select: { lineTotal: true, lineCost: true },
  });
  let profit = 0;
  let profitBase = 0;
  for (const i of profitItems) {
    const lc = i.lineCost == null ? 0 : Number(i.lineCost);
    profit += i.lineTotal - lc;
    profitBase += i.lineTotal;
  }

  return {
    totalRevenue: Number(totalAgg._sum.totalAmount ?? 0),
    resaleRevenue: Number(resaleAgg._sum.totalAmount ?? 0),
    profit,
    profitWithCost: profitBase,
  };
}

async function activeAgents(
  orgId: string,
  asOf: Date,
  saleId?: string | null,
): Promise<{ active: number; total: number }> {
  const lookbackStart = new Date(asOf.getTime() - ACTIVE_LOOKBACK_DAYS * 86400_000);
  // "Active agent count" is contact-side: how many of MY agents (contact
  // owner) are still ordering. So we keep contact.assignedUserId here —
  // this is *not* the same semantic as revenue (= order.assignedSaleId).
  const baseWhere: Record<string, unknown> = {
    orgId,
    stage: OFFICIAL_STAGE,
    ...(saleId ? { assignedUserId: saleId } : {}),
  };
  const [total, active] = await Promise.all([
    prisma.contact.count({ where: baseWhere }),
    prisma.contact.count({
      where: {
        ...baseWhere,
        orders: {
          some: {
            status: { in: [...COUNTABLE_ORDER_STATUSES] },
            OR: [
              { orderDate: { gte: lookbackStart, lte: asOf } },
              { orderDate: null, createdAt: { gte: lookbackStart, lte: asOf } },
            ],
          },
        },
      },
    }),
  ]);
  return { active, total };
}

export async function getKpi(orgId: string, filters: OverviewFilters) {
  const { from, to, saleId } = filters;
  const prev = previousPeriod(from, to);

  // We need order item coverage% for the "Biên LN" caveat — count line items
  // touched by orders in current window.
  const itemCoverageAgg = await Promise.all([
    prisma.orderItem.count({
      where: {
        order: withSaleScope(
          { orgId, ...orderInWindowWhere(from, to) },
          saleId,
        ),
      },
    }),
    prisma.orderItem.count({
      where: {
        lineCost: { not: null },
        order: withSaleScope(
          { orgId, ...orderInWindowWhere(from, to) },
          saleId,
        ),
      },
    }),
  ]);
  const [itemTotal, itemWithCost] = itemCoverageAgg;
  const costCoverage =
    itemTotal === 0 ? 0 : Math.round((itemWithCost / itemTotal) * 100);

  const [cur, prv, curAgents, prvAgents] = await Promise.all([
    periodRevenue(orgId, from, to, saleId),
    periodRevenue(orgId, prev.from, prev.to, saleId),
    activeAgents(orgId, to, saleId),
    activeAgents(orgId, prev.to, saleId),
  ]);

  const trend = (a: number, b: number): number | null =>
    b === 0 ? (a === 0 ? 0 : null) : ((a - b) / b) * 100;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    cards: {
      totalRevenue: {
        value: cur.totalRevenue,
        previous: prv.totalRevenue,
        trendPercent: trend(cur.totalRevenue, prv.totalRevenue),
      },
      resaleRevenue: {
        value: cur.resaleRevenue,
        previous: prv.resaleRevenue,
        trendPercent: trend(cur.resaleRevenue, prv.resaleRevenue),
        ratioOfTotal:
          cur.totalRevenue === 0
            ? 0
            : Math.round((cur.resaleRevenue / cur.totalRevenue) * 100),
      },
      activeAgents: {
        active: curAgents.active,
        total: curAgents.total,
        rate: curAgents.total === 0 ? 0 : (curAgents.active / curAgents.total) * 100,
        previousActive: prvAgents.active,
        delta: curAgents.active - prvAgents.active,
      },
      profit: {
        value: cur.profit,
        previous: prv.profit,
        trendPercent: trend(cur.profit, prv.profit),
        marginPercent:
          cur.profitWithCost === 0
            ? 0
            : Math.round((cur.profit / cur.profitWithCost) * 100),
        costCoveragePercent: costCoverage,
      },
    },
  };
}

/* ── 2. Top products ──────────────────────────────────────────────── */

export async function getTopProducts(
  orgId: string,
  filters: OverviewFilters,
  limit = 5,
) {
  const { from, to, saleId } = filters;
  // Pull all line items in window then aggregate in app code — avoids the
  // raw-SQL Prisma cost (and order_items has a small enough cardinality
  // for our scale to do it in JS).
  const items = await prisma.orderItem.findMany({
    where: {
      order: withSaleScope(
        { orgId, ...orderInWindowWhere(from, to) },
        saleId,
      ),
    },
    select: {
      sku: true,
      productName: true,
      unit: true,
      quantity: true,
      lineTotal: true,
      lineCost: true,
    },
  });

  type Bucket = {
    sku: string;
    productName: string;
    unit: string | null;
    brand: string;
    qty: number;
    revenue: number;
    profit: number;
    profitBase: number;
    coverageHits: number;
    rows: number;
  };
  const buckets = new Map<string, Bucket>();
  for (const it of items) {
    const k = it.sku;
    let b = buckets.get(k);
    if (!b) {
      b = {
        sku: it.sku,
        productName: it.productName,
        unit: it.unit ?? null,
        brand: brandFromSku(it.sku),
        qty: 0,
        revenue: 0,
        profit: 0,
        profitBase: 0,
        coverageHits: 0,
        rows: 0,
      };
      buckets.set(k, b);
    }
    b.qty += it.quantity;
    b.revenue += it.lineTotal;
    b.rows += 1;
    if (it.lineCost !== null) {
      b.profit += it.lineTotal - Number(it.lineCost);
      b.profitBase += it.lineTotal;
      b.coverageHits += 1;
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.revenue - a.revenue);
  return sorted.slice(0, limit).map((b, i) => ({
    rank: i + 1,
    sku: b.sku,
    productName: b.productName,
    unit: b.unit,
    brand: b.brand,
    quantity: b.qty,
    revenue: b.revenue,
    profit: b.profit,
    profitMarginPercent: b.profitBase === 0 ? null : (b.profit / b.profitBase) * 100,
    costCoveragePercent: b.rows === 0 ? 0 : Math.round((b.coverageHits / b.rows) * 100),
  }));
}

/* ── 3. Top sales — ranked by revenue in [from, to) ──────────────── */

export async function getTopSalesForPeriod(
  orgId: string,
  filters: OverviewFilters,
  limit = 5,
) {
  // The CEO Sale-Performance score is a weighted multi-metric model
  // tied to a calendar month (active_rate / retention_90d / etc. only
  // make sense at month granularity). For the overview page we want a
  // value that *does* respect the date filter, so we rank by raw
  // revenue in the window: resale (orders for agents created before
  // `from`) + new-agent (orders for agents created within the window).
  // `score` here is a relative 0-100 vs. the leader so the colored
  // chip in the UI still conveys ranking visually.
  const { calculateResaleRevenue, calculateNewAgentRevenue } = await import(
    '../dashboard/sale-performance-service.js'
  );

  const sales = await prisma.user.findMany({
    where: {
      orgId,
      isActive: true,
      ...(filters.saleId ? { id: filters.saleId } : {}),
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });
  if (sales.length === 0) return [];

  interface SaleRow {
    saleId: string;
    saleName: string;
    resaleRevenue: number;
    newAgentRevenue: number;
    totalRevenue: number;
  }

  const rows: SaleRow[] = await Promise.all(
    sales.map(async (s: { id: string; fullName: string }): Promise<SaleRow> => {
      const [resale, newAgent] = await Promise.all([
        calculateResaleRevenue(orgId, s.id, filters.from, filters.to),
        calculateNewAgentRevenue(orgId, s.id, filters.from, filters.to),
      ]);
      return {
        saleId: s.id,
        saleName: s.fullName,
        resaleRevenue: resale,
        newAgentRevenue: newAgent,
        totalRevenue: resale + newAgent,
      };
    }),
  );

  rows.sort((a: SaleRow, b: SaleRow) => b.totalRevenue - a.totalRevenue);
  const top = rows.slice(0, limit);
  const topRevenue = top[0]?.totalRevenue ?? 0;

  return top.map((r: SaleRow, i: number) => ({
    rank: i + 1,
    saleId: r.saleId,
    saleName: r.saleName,
    score: topRevenue > 0 ? Math.round((r.totalRevenue / topRevenue) * 100) : 0,
    monthRevenue: r.resaleRevenue,
    resaleRevenue: r.resaleRevenue,
    newAgentRevenue: r.newAgentRevenue,
    totalRevenue: r.totalRevenue,
  }));
}

/* ── 4a. Revenue trend 12 months (total / by customer_type / by brand) ─── */

export type TrendGroupBy = 'total' | 'customer_type' | 'brand';

export interface RevenueTrendResponse {
  buckets: string[]; // ['YYYY-MM', ...] length 12
  series: Array<{ key: string; label: string; values: number[] }>;
  /** Optional dashed target line per month (current YTD / 12). */
  target: number | null;
}

/** Group SKU into the 4 brand buckets used elsewhere in the app. */
function groupSkuByBrand(sku: string): string {
  return brandFromSku(sku);
}

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Cửa hàng mẹ bé',
  unknown: 'Chưa phân loại',
};

export async function getRevenueTrend12m(
  orgId: string,
  filters: OverviewFilters,
  groupBy: TrendGroupBy,
): Promise<RevenueTrendResponse> {
  // Build 12 monthly buckets ALWAYS ending at the CURRENT month — the
  // chart is supposed to give a stable long-term view that doesn't
  // shift when the user changes the date filter pill (per spec). The
  // page-level filter still scopes the OTHER widgets (KPI, top SKU,
  // top sale, top customer). Sale scoping is preserved so a member
  // still only sees their own series.
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth(), 1);
  const windows: Array<{ from: Date; to: Date; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const stop = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    windows.push({
      from: start,
      to: stop,
      label: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  const buckets = windows.map((w) => w.label);

  // ── total only — single series ─────────────────────────────
  if (groupBy === 'total') {
    const values = await Promise.all(
      windows.map(async (w) => {
        const agg = await prisma.order.aggregate({
          where: withSaleScope(
            { orgId, ...orderInWindowWhere(w.from, w.to) },
            filters.saleId,
          ),
          _sum: { totalAmount: true },
        });
        return Number(agg._sum.totalAmount ?? 0);
      }),
    );
    const ytdTotal = values.reduce((s, v) => s + v, 0);
    return {
      buckets,
      series: [{ key: 'total', label: 'Tổng doanh số', values }],
      target: ytdTotal > 0 ? Math.round(ytdTotal / 12) : null,
    };
  }

  // ── customer_type — multi-series ────────────────────────────
  if (groupBy === 'customer_type') {
    const seen = new Set<string>();
    const buf: Record<string, number[]> = {};
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const orders = await prisma.order.findMany({
        where: withSaleScope(
          { orgId, ...orderInWindowWhere(w.from, w.to) },
          filters.saleId,
        ),
        select: { totalAmount: true, contact: { select: { customerType: true } } },
      });
      for (const o of orders) {
        const ct = o.contact?.customerType ?? 'unknown';
        seen.add(ct);
        if (!buf[ct]) buf[ct] = new Array(windows.length).fill(0);
        buf[ct][i] += o.totalAmount;
      }
    }
    const series = [...seen]
      .sort((a, b) =>
        buf[b].reduce((s, v) => s + v, 0) - buf[a].reduce((s, v) => s + v, 0),
      )
      .map((k) => ({
        key: k,
        label: CUSTOMER_TYPE_LABELS[k] ?? k,
        values: buf[k] ?? new Array(windows.length).fill(0),
      }));
    return { buckets, series, target: null };
  }

  // ── brand (parsed from SKU) — multi-series ─────────────────
  const buf: Record<string, number[]> = {};
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const items = await prisma.orderItem.findMany({
      where: {
        order: withSaleScope(
          { orgId, ...orderInWindowWhere(w.from, w.to) },
          filters.saleId,
        ),
      },
      select: { sku: true, lineTotal: true },
    });
    for (const it of items) {
      const b = groupSkuByBrand(it.sku);
      if (!buf[b]) buf[b] = new Array(windows.length).fill(0);
      buf[b][i] += it.lineTotal;
    }
  }
  const series = Object.keys(buf)
    .sort((a, b) => buf[b].reduce((s, v) => s + v, 0) - buf[a].reduce((s, v) => s + v, 0))
    .map((k) => ({ key: k, label: k, values: buf[k] }));
  return { buckets, series, target: null };
}

/* ── 4b. Critical alerts (VIP churn + underperforming sales) ─────── */

interface CriticalAlertsResponse {
  vipAtRisk: Array<{
    contactId: string;
    fullName: string;
    province: string | null;
    phone: string | null;
    zaloUid: string | null;
    lifetimeRevenue: number;
    daysInactive: number;
  }>;
  underperformingSales: Array<{
    saleId: string;
    saleName: string;
    score: number;
    monthRevenue: number;
  }>;
}

const UNDERPERFORM_SCORE_THRESHOLD = 50;

export async function getCriticalAlerts(
  orgId: string,
  filters: OverviewFilters,
): Promise<CriticalAlertsResponse> {
  // VIPs about to churn — reuse top-customers at_risk logic, top 5
  const at = await getTopCustomers(orgId, filters, 'at_risk', 5);
  const vipAtRisk = at
    .filter((r) => r.atRisk)
    .map((r) => ({
      contactId: r.contactId,
      fullName: r.fullName,
      province: r.province,
      phone: r.phone,
      zaloUid: (r as { zaloUid?: string | null }).zaloUid ?? null,
      lifetimeRevenue: (r as { lifetimeRevenue?: number }).lifetimeRevenue ?? 0,
      daysInactive: (r as { daysInactive?: number }).daysInactive ?? 0,
    }));

  // Underperforming sales — score < threshold for current calendar month.
  // Existing getTopSales already returns sorted desc; we tail-filter.
  const { getTopSales } = await import(
    '../dashboard/admin-dashboard-service.js'
  );
  const allSales = await getTopSales(orgId, 50);
  const underperformingSales = allSales
    .filter(
      (s: { score: number; monthRevenue: number }) =>
        s.score < UNDERPERFORM_SCORE_THRESHOLD && s.monthRevenue >= 0,
    )
    .slice(0, 5)
    .map((s: { saleId: string; saleName: string; score: number; monthRevenue: number }) => ({
      saleId: s.saleId,
      saleName: s.saleName,
      score: s.score,
      monthRevenue: s.monthRevenue,
    }));

  return { vipAtRisk, underperformingSales };
}

/* ── 4. Top customers ─────────────────────────────────────────────── */

export type CustomerRankType = 'revenue' | 'resale' | 'profit' | 'at_risk';

export async function getTopCustomers(
  orgId: string,
  filters: OverviewFilters,
  type: CustomerRankType,
  limit = 5,
) {
  const { from, to, saleId } = filters;

  if (type === 'at_risk') {
    // VIPs: lifetime revenue ≥ AT_RISK_LIFETIME_VND, last_order > 45d ago.
    // We compute lifetime totals via groupBy on orders, then filter inactive.
    // Cutoff anchors on `today` (not filters.to) — "at risk" is a real-time
    // health check on the customer base, decoupled from the date filter
    // pill. (See getAtRiskCustomers for the same convention.)
    const groups = (await prisma.order.groupBy({
      by: ['contactId'],
      where: {
        orgId,
        status: { in: [...COUNTABLE_ORDER_STATUSES] },
        ...(saleId ? { assignedSaleId: saleId } : {}),
      },
      _sum: { totalAmount: true },
      _max: { orderDate: true, createdAt: true },
      having: { totalAmount: { _sum: { gte: AT_RISK_LIFETIME_VND } } },
    })) as Array<{
      contactId: string;
      _sum: { totalAmount: number | null };
      _max: { orderDate: Date | null; createdAt: Date | null };
    }>;
    interface AtRiskCandidate {
      contactId: string;
      lifetimeRevenue: number;
      lastOrderAt: Date | null;
      daysInactive: number | null;
    }
    const todayDayIdx = vnLocalDayIndex(new Date());
    const candidates: AtRiskCandidate[] = groups
      .map((g): AtRiskCandidate => {
        const last = g._max.orderDate ?? g._max.createdAt;
        return {
          contactId: g.contactId,
          lifetimeRevenue: Number(g._sum.totalAmount ?? 0),
          lastOrderAt: last,
          daysInactive: last ? todayDayIdx - vnLocalDayIndex(last) : null,
        };
      })
      .filter(
        (c: AtRiskCandidate) =>
          c.daysInactive !== null && c.daysInactive > AT_RISK_INACTIVE_DAYS,
      )
      .sort(
        (a: AtRiskCandidate, b: AtRiskCandidate) =>
          (b.daysInactive ?? 0) - (a.daysInactive ?? 0),
      )
      .slice(0, limit);
    if (candidates.length === 0) return [];

    const contacts = (await prisma.contact.findMany({
      where: { id: { in: candidates.map((c: AtRiskCandidate) => c.contactId) } },
      select: { id: true, fullName: true, phone: true, province: true, zaloUid: true },
    })) as Array<{
      id: string;
      fullName: string | null;
      phone: string | null;
      province: string | null;
      zaloUid: string | null;
    }>;
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return candidates.map((c: AtRiskCandidate, i: number) => {
      const ct = byId.get(c.contactId);
      return {
        rank: i + 1,
        contactId: c.contactId,
        fullName: ct?.fullName ?? '(không tên)',
        province: ct?.province ?? null,
        phone: ct?.phone ?? null,
        zaloUid: ct?.zaloUid ?? null,
        lifetimeRevenue: c.lifetimeRevenue,
        daysInactive: c.daysInactive,
        atRisk: true,
      };
    });
  }

  // revenue | resale | profit — all rank by orders inside [from, to).
  const orders = await prisma.order.findMany({
    where: withSaleScope({ orgId, ...orderInWindowWhere(from, to) }, saleId),
    select: {
      contactId: true,
      totalAmount: true,
      contact: {
        select: { fullName: true, phone: true, province: true, createdAt: true },
      },
      items:
        type === 'profit'
          ? { select: { lineTotal: true, lineCost: true } }
          : false,
    },
  });

  type Row = {
    contactId: string;
    fullName: string;
    province: string | null;
    phone: string | null;
    contactCreatedAt: Date;
    revenue: number;
    profit: number;
    orderCount: number;
  };
  const buckets = new Map<string, Row>();
  for (const o of orders) {
    let b = buckets.get(o.contactId);
    if (!b) {
      b = {
        contactId: o.contactId,
        fullName: o.contact?.fullName ?? '(không tên)',
        province: o.contact?.province ?? null,
        phone: o.contact?.phone ?? null,
        contactCreatedAt: o.contact?.createdAt ?? from,
        revenue: 0,
        profit: 0,
        orderCount: 0,
      };
      buckets.set(o.contactId, b);
    }
    b.revenue += o.totalAmount;
    b.orderCount += 1;
    if (type === 'profit' && Array.isArray(o.items)) {
      for (const i of o.items) {
        if (i.lineCost !== null) b.profit += i.lineTotal - Number(i.lineCost);
      }
    }
  }

  let rows = [...buckets.values()];
  if (type === 'resale') {
    // "đại lý cũ" = contact created before window start
    rows = rows.filter((r) => r.contactCreatedAt < from);
  }

  rows.sort((a, b) => {
    if (type === 'profit') return b.profit - a.profit;
    return b.revenue - a.revenue;
  });

  return rows.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    contactId: r.contactId,
    fullName: r.fullName,
    province: r.province,
    phone: r.phone,
    revenue: r.revenue,
    profit: r.profit,
    orderCount: r.orderCount,
    atRisk: false,
  }));
}

/* ── 5. At-risk customers — split into 2 groups ─────────────────────
 *
 * Refactor of the old "VIP sắp churn" → 2 groups so sales know which
 * customers are still rescuable vs which are long-dormant background
 * tasks for admin to plan around.
 *
 * Group A — needCareNow:    last_order in [60d, 30d) ago, top 10 by
 *                            lifetime revenue (largest agents first).
 *                            These are the "wake them up THIS week"
 *                            list — surfaced by default to sale.
 * Group B — longDormant:    last_order > 60d ago, up to 50 records.
 *                            Hidden by default; admin can expand for
 *                            long-term re-activation planning.
 *
 * Per session decision (2026-05-07): we DO NOT filter by stage at all
 * (B option chosen by user) — using only lifetime + days_inactive
 * because most contacts imported from MISA have stage=NULL and a strict
 * stage filter would empty the lists.
 *
 * Sale scoping: `order.assignedSaleId = filters.saleId` (member auto
 * passes their own id; admin sees all).
 *
 * Cutoffs anchor on `today`, NOT on `filters.to` — "at risk" is a
 * real-time health check on the customer base, decoupled from the date
 * filter pill. Otherwise picking "Tháng này" (to=end of month, often in
 * the future relative to today) shifts cutoffs forward and pulls in
 * customers that are only 8-29 days inactive — which contradicts the
 * "30-60 days" label shown to the sale.
 */
export interface AtRiskCustomer {
  contactId: string;
  fullName: string;
  province: string | null;
  phone: string | null;
  zaloUid: string | null;
  assignedSaleId: string | null;
  assignedSaleName: string | null;
  lifetimeRevenue: number;
  lastOrderDate: string | null;
  daysInactive: number;
}

export interface AtRiskResponse {
  needCareNow: AtRiskCustomer[];
  longDormant: AtRiskCustomer[];
}

const NEED_CARE_NOW_LIMIT = 10;
const LONG_DORMANT_LIMIT = 50;
const NEED_CARE_MIN_DAYS = 30;
const NEED_CARE_MAX_DAYS = 60;

export async function getAtRiskCustomers(
  orgId: string,
  filters: OverviewFilters,
): Promise<AtRiskResponse> {
  const { saleId } = filters;
  // Cutoffs anchor on TODAY (see header comment). `filters.to` is
  // intentionally ignored for this endpoint so the "Cần chăm 30-60d" /
  // "Ngủ dài >60d" buckets always reflect real-time customer health.
  // We compute day-difference in VN local time so an order placed
  // "exactly 30 days ago" lands at 30 (not 29 due to UTC-vs-local).
  const todayDayIdx = vnLocalDayIndex(new Date());

  // Aggregate lifetime revenue + last order per contact, scoped to org
  // (and to assigned sale for non-admin callers).
  const groups = (await prisma.order.groupBy({
    by: ['contactId'],
    where: {
      orgId,
      status: { in: [...COUNTABLE_ORDER_STATUSES] },
      ...(saleId ? { assignedSaleId: saleId } : {}),
    },
    _sum: { totalAmount: true },
    _max: { orderDate: true, createdAt: true },
  })) as Array<{
    contactId: string;
    _sum: { totalAmount: number | null };
    _max: { orderDate: Date | null; createdAt: Date | null };
  }>;

  interface Candidate {
    contactId: string;
    lifetimeRevenue: number;
    lastOrderAt: Date;
    daysInactive: number;
  }

  const allCandidates: Candidate[] = groups
    .map((g): Candidate | null => {
      const last = g._max.orderDate ?? g._max.createdAt;
      if (!last) return null;
      return {
        contactId: g.contactId,
        lifetimeRevenue: Number(g._sum.totalAmount ?? 0),
        lastOrderAt: last,
        daysInactive: todayDayIdx - vnLocalDayIndex(last),
      };
    })
    .filter((c): c is Candidate => c !== null);

  // Group A: needCareNow → NEED_CARE_MIN_DAYS ≤ daysInactive ≤ NEED_CARE_MAX_DAYS.
  // Both bounds inclusive so the boundary cases (exactly 30 or 60 days)
  // land in A. Above MAX falls through to Group B.
  const needCareCandidates = allCandidates
    .filter(
      (c) =>
        c.daysInactive >= NEED_CARE_MIN_DAYS &&
        c.daysInactive <= NEED_CARE_MAX_DAYS,
    )
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, NEED_CARE_NOW_LIMIT);

  // Group B: longDormant → daysInactive > NEED_CARE_MAX_DAYS
  const longDormantCandidates = allCandidates
    .filter((c) => c.daysInactive > NEED_CARE_MAX_DAYS)
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, LONG_DORMANT_LIMIT);

  const allContactIds = [
    ...needCareCandidates.map((c) => c.contactId),
    ...longDormantCandidates.map((c) => c.contactId),
  ];
  if (allContactIds.length === 0) {
    return { needCareNow: [], longDormant: [] };
  }
  const contacts = (await prisma.contact.findMany({
    where: { id: { in: allContactIds } },
    select: {
      id: true,
      fullName: true,
      phone: true,
      province: true,
      zaloUid: true,
      assignedUserId: true,
      assignedUser: { select: { id: true, fullName: true } },
    },
  })) as Array<{
    id: string;
    fullName: string | null;
    phone: string | null;
    province: string | null;
    zaloUid: string | null;
    assignedUserId: string | null;
    assignedUser: { id: string; fullName: string } | null;
  }>;
  const byId = new Map(contacts.map((c) => [c.id, c]));

  function hydrate(c: Candidate): AtRiskCustomer {
    const ct = byId.get(c.contactId);
    return {
      contactId: c.contactId,
      fullName: ct?.fullName ?? '(không tên)',
      province: ct?.province ?? null,
      phone: ct?.phone ?? null,
      zaloUid: ct?.zaloUid ?? null,
      assignedSaleId: ct?.assignedUserId ?? null,
      assignedSaleName: ct?.assignedUser?.fullName ?? null,
      lifetimeRevenue: c.lifetimeRevenue,
      lastOrderDate: c.lastOrderAt.toISOString(),
      daysInactive: c.daysInactive,
    };
  }

  return {
    needCareNow: needCareCandidates.map(hydrate),
    longDormant: longDormantCandidates.map(hydrate),
  };
}
