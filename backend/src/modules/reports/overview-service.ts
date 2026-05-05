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

/** Order date filter: prefer orderDate, fall back to createdAt. */
function orderInWindowWhere(from: Date, to: Date) {
  return {
    OR: [
      { orderDate: { gte: from, lt: to } },
      { orderDate: null, createdAt: { gte: from, lt: to } },
    ],
  } as const;
}

/** Apply optional saleId scope through contact.assignedUserId. */
function withSaleScope<T extends Record<string, unknown>>(
  where: T,
  saleId?: string | null,
): T {
  if (!saleId) return where;
  return {
    ...where,
    contact: { ...((where.contact as object) ?? {}), assignedUserId: saleId },
  } as T;
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

  // Profit: SUM(line_total - line_cost) on items with cost; only orders in window
  const profitItems = await prisma.orderItem.findMany({
    where: {
      costValue: { not: null },
      order: withSaleScope(
        { orgId, ...orderInWindowWhere(from, to) },
        saleId,
      ),
    },
    select: { lineTotal: true, costValue: true },
  });
  let profit = 0;
  let profitBase = 0;
  for (const i of profitItems) {
    profit += i.lineTotal - (i.costValue ?? 0);
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
        costValue: { not: null },
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
      costValue: true,
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
    if (it.costValue !== null) {
      b.profit += it.lineTotal - it.costValue;
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

/* ── 3. Top sales — delegate to existing service ──────────────────── */

export async function getTopSalesForPeriod(
  orgId: string,
  filters: OverviewFilters,
  limit = 5,
) {
  // Existing helper computes for the *current* calendar month only.
  // For now we surface the same data on the overview page; if the user
  // picks a custom range, top-sales still shows current-month numbers
  // and the UI labels it accordingly. Refactoring sale-performance to
  // accept arbitrary windows is a Session-2+ task.
  const { getTopSales } = await import(
    '../dashboard/admin-dashboard-service.js'
  );
  void filters; // intentional — see comment above
  return getTopSales(orgId, limit);
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
    const cutoff = new Date(to.getTime() - AT_RISK_INACTIVE_DAYS * 86400_000);
    const groups = (await prisma.order.groupBy({
      by: ['contactId'],
      where: {
        orgId,
        ...(saleId ? { contact: { assignedUserId: saleId } } : {}),
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
    const candidates: AtRiskCandidate[] = groups
      .map((g): AtRiskCandidate => {
        const last = g._max.orderDate ?? g._max.createdAt;
        return {
          contactId: g.contactId,
          lifetimeRevenue: Number(g._sum.totalAmount ?? 0),
          lastOrderAt: last,
          daysInactive: last
            ? Math.floor((to.getTime() - last.getTime()) / 86400_000)
            : null,
        };
      })
      .filter((c: AtRiskCandidate) => !!c.lastOrderAt && c.lastOrderAt < cutoff)
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
          ? { select: { lineTotal: true, costValue: true } }
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
        if (i.costValue !== null) b.profit += i.lineTotal - i.costValue;
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
