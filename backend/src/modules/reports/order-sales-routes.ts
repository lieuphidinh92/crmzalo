/** Read-only accounting report. Financial totals follow confirmed sales, not cash receipt dates. */
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { canSeeAllOrders, normalizeStatus, orderScopeWhere, reqUser, toNumber } from '../orders/order-service.js';

const COUNTABLE = ['confirmed', 'packing', 'shipping', 'completed', 'shipped', 'paid'];
const STATUS_FILTERS: Record<string, string[]> = {
  countable: COUNTABLE,
  draft: ['draft', 'new'], confirmed: ['confirmed'], packing: ['packing'],
  shipping: ['shipping', 'shipped'], completed: ['completed', 'paid'],
  cancelled: ['cancelled'], returned: ['returned'],
};
type Query = Partial<Record<'from' | 'to' | 'saleId' | 'status' | 'search' | 'reconciled' | 'page' | 'limit', string>>;

export function parseOrderSalesQuery(q: Query) {
  const date = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày phải có dạng YYYY-MM-DD');
    const utc = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== value) throw new Error('Ngày không hợp lệ');
    return new Date(value + 'T00:00:00+07:00');
  };
  const from = date(q.from), endDay = date(q.to);
  if (from > endDay) throw new Error('Từ ngày phải trước hoặc bằng đến ngày');
  const integer = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Phân trang không hợp lệ');
    return Number(value);
  };
  const page = integer(q.page, 1), limit = Math.min(100, integer(q.limit, 50));
  if (!Number.isSafeInteger((page - 1) * limit) || (page - 1) * limit > 2147483647) throw new Error('Trang vượt giới hạn');
  const status = q.status || 'countable';
  if (status !== 'all' && !STATUS_FILTERS[status]) throw new Error('Trạng thái không hợp lệ');
  if (q.reconciled !== undefined && !['', '0', '1'].includes(q.reconciled)) throw new Error('Bộ lọc đối soát không hợp lệ');
  return { from, until: new Date(endDay.getTime() + 86400000), page, limit, status };
}

export async function orderSalesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/api/v1/reports/order-sales', async (request, reply) => {
    const q = request.query as Query;
    let parsed: ReturnType<typeof parseOrderSalesQuery>;
    try { parsed = parseOrderSalesQuery(q); }
    catch (error) { return reply.status(400).send({ error: (error as Error).message }); }
    const { from, until, page, limit, status } = parsed;
    const user = reqUser(request);
    const scope = orderScopeWhere(user);
    const dateRange = { gte: from, lt: until };
    const filters: Prisma.OrderWhereInput[] = [scope, { status: { not: 'opening_balance' } }, {
      OR: [{ orderDate: dateRange }, { orderDate: null, createdAt: dateRange }],
    }];
    if (status !== 'all') filters.push({ status: { in: STATUS_FILTERS[status] } });
    if (q.saleId) filters.push({ assignedSaleId: q.saleId === 'unassigned' ? null : q.saleId });
    if (q.reconciled) filters.push({ reconciledAt: q.reconciled === '1' ? { not: null } : null });
    const search = q.search?.trim();
    if (search) filters.push({ OR: [
      { orderCode: { contains: search, mode: 'insensitive' } },
      { contact: { fullName: { contains: search, mode: 'insensitive' } } },
      { contact: { storeName: { contains: search, mode: 'insensitive' } } },
      { contact: { phone: { contains: search, mode: 'insensitive' } } },
    ] });
    const where: Prisma.OrderWhereInput = { AND: filters };
    const financialWhere: Prisma.OrderWhereInput = { AND: [where, { status: { in: COUNTABLE } }] };
    const result = await prisma.$transaction(async (tx) => {
      const total = await tx.order.count({ where });
      const rows = await tx.order.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, orderCode: true, orderDate: true, createdAt: true, status: true,
          contact: { select: { fullName: true, storeName: true, phone: true } },
          assignedSale: { select: { id: true, fullName: true } },
          totalAmountValue: true, totalAmount: true, paidAmount: true, debtAmountValue: true,
          reconciledAt: true, vatInvoiceStatus: true, vatIssuedAmount: true,
        },
      });
      // Two SQL aggregates preserve COALESCE(new Decimal total, legacy Float total)
      // without loading every order or allowing the current page to affect totals.
      const current = await tx.order.groupBy({
        by: ['assignedSaleId'], where: { AND: [financialWhere, { totalAmountValue: { not: null } }] },
        _count: { _all: true }, _sum: { totalAmountValue: true, paidAmount: true, debtAmountValue: true },
      });
      const legacy = await tx.order.groupBy({
        by: ['assignedSaleId'], where: { AND: [financialWhere, { totalAmountValue: null }] },
        _count: { _all: true }, _sum: { totalAmount: true, paidAmount: true, debtAmountValue: true },
      });
      const saleOptions = await tx.user.findMany({
        where: { orgId: user.orgId, ...(canSeeAllOrders(user) ? {} : {
          OR: [{ id: user.id }, { saleOrders: { some: scope } }],
        }) }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' },
      });
      return { total, rows, current, legacy, saleOptions };
    }, { isolationLevel: 'RepeatableRead' });
    const summary = { orderCount: 0, revenue: 0, paid: 0, debt: 0 };
    const bySale = new Map<string | null, { saleId: string | null; saleName: string; orderCount: number; revenue: number; paid: number; debt: number }>();
    const names = new Map(result.saleOptions.map(s => [s.id, s.fullName]));
    for (const group of [...result.current, ...result.legacy]) {
      const sum = group._sum;
      const totals = {
        orderCount: group._count._all,
        revenue: toNumber('totalAmountValue' in sum ? sum.totalAmountValue : sum.totalAmount),
        paid: toNumber(sum.paidAmount), debt: toNumber(sum.debtAmountValue),
      };
      const row = bySale.get(group.assignedSaleId) ?? {
        saleId: group.assignedSaleId, saleName: group.assignedSaleId ? names.get(group.assignedSaleId) ?? 'Nhân viên' : 'Chưa phân công',
        orderCount: 0, revenue: 0, paid: 0, debt: 0,
      };
      for (const key of ['orderCount', 'revenue', 'paid', 'debt'] as const) { row[key] += totals[key]; summary[key] += totals[key]; }
      bySale.set(group.assignedSaleId, row);
    }
    return {
      from: q.from, to: q.to, page, limit, total: result.total, summary,
      bySale: [...bySale.values()].sort((a, b) => b.revenue - a.revenue || a.saleName.localeCompare(b.saleName, 'vi')),
      saleOptions: result.saleOptions,
      rows: result.rows.map(({ totalAmount, ...row }) => ({
        ...row, status: normalizeStatus(row.status),
        totalAmountValue: toNumber(row.totalAmountValue ?? totalAmount),
        paidAmount: toNumber(row.paidAmount), debtAmountValue: toNumber(row.debtAmountValue),
        vatIssuedAmount: toNumber(row.vatIssuedAmount),
      })),
    };
  });
}
