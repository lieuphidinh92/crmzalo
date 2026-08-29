import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals } from '../settings/business-goals-service.js';
import { toNumber } from '../orders/order-service.js';
import {
  getDashboardActionStates,
  getSaleDashboardTargets,
} from './dashboard-v2-workflow-service.js';

const COUNTABLE_STATUSES = ['confirmed', 'packing', 'shipping', 'completed', 'shipped', 'paid'];
const OPEN_DEAL_STAGES = ['tiep_can', 'da_bao_gia', 'dang_thu_hang'];
const DAY_MS = 86_400_000;

type DashboardUser = { id: string; orgId: string; role: string };

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS));
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function roundMoney(value: number): number {
  return Math.max(0, Math.round(value));
}

function personalOrderScope(user: DashboardUser) {
  return {
    orgId: user.orgId,
    OR: [
      { assignedSaleId: user.id },
      { assignedSaleId: null, contact: { assignedUserId: user.id } },
    ],
  };
}

function labelStage(stage: string | null): string {
  const labels: Record<string, string> = {
    tiep_can: 'Đang follow',
    da_bao_gia: 'Báo giá mới',
    dang_thu_hang: 'Chờ khách xác nhận',
  };
  return labels[stage ?? ''] ?? 'Cơ hội';
}

export async function getSaleDashboardV2(user: DashboardUser) {
  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const nextMonth = addMonths(monthStart, 1);
  const previousMonth = addMonths(monthStart, -1);
  const associationStart = new Date(now);
  associationStart.setFullYear(associationStart.getFullYear() - 1);
  const orderScope = personalOrderScope(user);

  const [goals, targetMap, contacts, scopedOrders, openDeals, teamUsers, teamMonthOrders, lowStock, orgOrderBaskets] =
    await Promise.all([
      getOrgGoals(user.orgId),
      getSaleDashboardTargets(user.orgId),
      prisma.contact.findMany({
        where: { orgId: user.orgId, assignedUserId: user.id },
        select: {
          id: true,
          fullName: true,
          storeName: true,
          phone: true,
          customerType: true,
          stage: true,
          potentialValue: true,
          nextContactDate: true,
          stageUpdatedAt: true,
        },
      }),
      prisma.order.findMany({
        where: { ...orderScope, status: { in: COUNTABLE_STATUSES } },
        select: {
          id: true,
          contactId: true,
          orderCode: true,
          orderDate: true,
          createdAt: true,
          totalAmount: true,
          totalAmountValue: true,
          items: {
            select: {
              productId: true,
              productName: true,
              sku: true,
              quantity: true,
            },
          },
        },
        orderBy: [{ orderDate: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.contact.findMany({
        where: {
          orgId: user.orgId,
          assignedUserId: user.id,
          stage: { in: OPEN_DEAL_STAGES },
        },
        select: {
          id: true,
          fullName: true,
          storeName: true,
          phone: true,
          stage: true,
          potentialValue: true,
          nextContactDate: true,
          stageUpdatedAt: true,
        },
        orderBy: [{ nextContactDate: 'asc' }, { stageUpdatedAt: 'asc' }],
        take: 30,
      }),
      prisma.user.findMany({
        where: { orgId: user.orgId, isActive: true },
        select: { id: true, fullName: true },
      }),
      prisma.order.findMany({
        where: {
          orgId: user.orgId,
          status: { in: COUNTABLE_STATUSES },
          orderDate: { gte: monthStart, lt: nextMonth },
        },
        select: { assignedSaleId: true, totalAmount: true, totalAmountValue: true },
      }),
      prisma.product.findMany({
        where: {
          orgId: user.orgId,
          status: 'active',
          sellable: true,
          hasSales: true,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          mainImageUrl: true,
          totalStock: true,
          warningStock: true,
          prices: {
            where: { active: true },
            select: { price: true, isDefault: true, displayOrder: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
        orderBy: { totalStock: 'asc' },
        take: 200,
      }),
      prisma.order.findMany({
        where: {
          orgId: user.orgId,
          status: { in: COUNTABLE_STATUSES },
          orderDate: { gte: associationStart },
        },
        select: {
          contactId: true,
          items: {
            where: { productId: { not: null } },
            select: { productId: true, productName: true },
          },
        },
      }),
    ]);

  const ordersByContact = new Map<string, any[]>();
  for (const order of scopedOrders as any[]) {
    if (!ordersByContact.has(order.contactId)) ordersByContact.set(order.contactId, []);
    ordersByContact.get(order.contactId)!.push(order);
  }

  const cycleSamples: number[] = [];
  const rawStats: any[] = [];
  for (const contact of contacts as any[]) {
    const orders = ordersByContact.get(contact.id) ?? [];
    if (!orders.length) continue;
    const recent = orders.slice(-5);
    const gaps: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const current = recent[i].orderDate ?? recent[i].createdAt;
      const previous = recent[i - 1].orderDate ?? recent[i - 1].createdAt;
      gaps.push(Math.max(1, daysBetween(current, previous)));
    }
    const ownCycle = gaps.length ? median(gaps) : 0;
    if (ownCycle > 0) cycleSamples.push(ownCycle);
    rawStats.push({ contact, orders, ownCycle });
  }
  const fallbackCycle = Math.max(1, Math.round(median(cycleSamples) || 30));

  const customerStats = rawStats.map(({ contact, orders, ownCycle }) => {
    const cycle = Math.max(1, Math.round(ownCycle || fallbackCycle));
    const lastOrder = orders[orders.length - 1];
    const lastOrderAt = lastOrder.orderDate ?? lastOrder.createdAt;
    const daysSince = daysBetween(today, lastOrderAt);
    const riskStart = Math.max(Math.round(cycle * 1.5), goals.atRiskDays);
    const lostStart = Math.max(cycle * 2, goals.churnDays);
    const values = orders.slice(-3).map((o: any) => toNumber(o.totalAmountValue ?? o.totalAmount));
    const potential = roundMoney(median(values));
    let health = 'active';
    if (daysSince > lostStart) health = 'lost';
    else if (daysSince > riskStart) health = 'at_risk';
    else if (daysSince > cycle) health = 'attention';
    return {
      contact,
      orders,
      cycle,
      lastOrder,
      lastOrderAt,
      daysSince,
      riskStart,
      lostStart,
      potential,
      health,
    };
  });

  const monthlyOrders = (scopedOrders as any[]).filter((o: any) => {
    const date = o.orderDate ?? o.createdAt;
    return date >= monthStart && date < nextMonth;
  });
  const previousOrders = (scopedOrders as any[]).filter((o: any) => {
    const date = o.orderDate ?? o.createdAt;
    return date >= previousMonth && date < monthStart;
  });
  const monthlyRevenue = roundMoney(
    monthlyOrders.reduce((sum: number, o: any) => sum + toNumber(o.totalAmountValue ?? o.totalAmount), 0),
  );
  const activeIds = new Set(monthlyOrders.map((o: any) => o.contactId));
  const returningIds = new Set(
    [...activeIds].filter((id) =>
      (ordersByContact.get(id) ?? []).some((o: any) => (o.orderDate ?? o.createdAt) < monthStart),
    ),
  );
  const newIds = new Set(
    [...activeIds].filter((id) => {
      const history = ordersByContact.get(id) ?? [];
      const first = history[0]?.orderDate ?? history[0]?.createdAt;
      return first && first >= monthStart;
    }),
  );
  const previousActiveIds = new Set(previousOrders.map((o: any) => o.contactId));
  const previousReturningIds = new Set(
    [...previousActiveIds].filter((id) =>
      (ordersByContact.get(id) ?? []).some((o: any) => (o.orderDate ?? o.createdAt) < previousMonth),
    ),
  );
  const repeatRate = activeIds.size ? (returningIds.size / activeIds.size) * 100 : 0;
  const previousRepeatRate = previousActiveIds.size
    ? (previousReturningIds.size / previousActiveIds.size) * 100
    : 0;
  const elapsedDays = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const paceForecast = roundMoney((monthlyRevenue / elapsedDays) * daysInMonth);

  const healthCounts = { active: 0, attention: 0, at_risk: 0, lost: 0, reactivated: 0 };
  const reactivatedIds = new Set<string>();
  for (const stat of customerStats) {
    healthCounts[stat.health as keyof typeof healthCounts]++;
    const history = stat.orders;
    const currentMonthOrders = history.filter((o: any) => {
      const date = o.orderDate ?? o.createdAt;
      return date >= monthStart && date < nextMonth;
    });
    if (currentMonthOrders.length) {
      const firstThisMonth = currentMonthOrders[0];
      const firstIndex = history.findIndex((o: any) => o.id === firstThisMonth.id);
      if (firstIndex > 0) {
        const previous = history[firstIndex - 1];
        const gap = daysBetween(
          firstThisMonth.orderDate ?? firstThisMonth.createdAt,
          previous.orderDate ?? previous.createdAt,
        );
        if (gap > stat.lostStart) {
          healthCounts.reactivated++;
          reactivatedIds.add(stat.contact.id);
        }
      }
    }
  }

  let actions: any[] = [];
  for (const stat of customerStats) {
    const c = stat.contact;
    const lastProduct = stat.lastOrder.items?.[0]?.productName ?? null;
    if (stat.health === 'at_risk' || stat.health === 'lost') {
      actions.push({
        id: `risk:${c.id}`,
        type: 'risk',
        priority: 1,
        contactId: c.id,
        name: c.storeName || c.fullName || 'Khách hàng',
        phone: c.phone,
        monthlyValue: roundMoney(stat.potential * (30 / stat.cycle)),
        potentialRevenue: stat.potential,
        reason: `Đã ${stat.daysSince} ngày chưa nhập hàng`,
        reasonDetail: `Chu kỳ trung bình ${stat.cycle} ngày`,
        lastProduct,
        lastOrderId: stat.lastOrder.id,
        lastOrderCode: stat.lastOrder.orderCode,
        status: 'Chưa xử lý',
      });
    } else if (stat.health === 'attention') {
      actions.push({
        id: `reorder:${c.id}`,
        type: 'reorder',
        priority: 2,
        contactId: c.id,
        name: c.storeName || c.fullName || 'Khách hàng',
        phone: c.phone,
        monthlyValue: roundMoney(stat.potential * (30 / stat.cycle)),
        potentialRevenue: stat.potential,
        reason: `Quá chu kỳ nhập ${stat.daysSince - stat.cycle} ngày`,
        reasonDetail: `Chu kỳ trung bình ${stat.cycle} ngày`,
        lastProduct,
        lastOrderId: stat.lastOrder.id,
        lastOrderCode: stat.lastOrder.orderCode,
        status: 'Chưa xử lý',
      });
    }
  }

  for (const deal of openDeals as any[]) {
    const potential = roundMoney(toNumber(deal.potentialValue));
    if (!potential && !deal.nextContactDate) continue;
    const overdue = deal.nextContactDate ? daysBetween(today, deal.nextContactDate) : 0;
    actions.push({
      id: `deal:${deal.id}`,
      type: 'deal',
      priority: 3,
      contactId: deal.id,
      name: deal.storeName || deal.fullName || 'Khách hàng',
      phone: deal.phone,
      monthlyValue: potential,
      potentialRevenue: potential,
      reason: overdue > 0 ? `Quá lịch follow ${overdue} ngày` : labelStage(deal.stage),
      reasonDetail: deal.nextContactDate ? 'Đã có lịch follow tiếp theo' : 'Cần cập nhật lịch follow',
      lastProduct: null,
      lastOrderId: null,
      lastOrderCode: null,
      status: 'Chưa xử lý',
    });
  }
  const productMap = new Map((lowStock as any[]).map((p: any) => [p.id, p]));
  const basketsByContact = new Map<string, Map<string, string>>();
  for (const order of orgOrderBaskets as any[]) {
    if (!basketsByContact.has(order.contactId)) basketsByContact.set(order.contactId, new Map());
    const basket = basketsByContact.get(order.contactId)!;
    for (const item of order.items ?? []) {
      if (item.productId) basket.set(item.productId, item.productName || 'Sản phẩm');
    }
  }
  const productBuyers = new Map<string, Set<string>>();
  const pairsBySource = new Map<string, any[]>();
  const pairCounts = new Map<string, { sourceId: string; targetId: string; count: number }>();
  for (const [contactId, basket] of basketsByContact) {
    const productIds = [...basket.keys()];
    for (const productId of productIds) {
      if (!productBuyers.has(productId)) productBuyers.set(productId, new Set());
      productBuyers.get(productId)!.add(contactId);
    }
    for (const sourceId of productIds) {
      for (const targetId of productIds) {
        if (sourceId === targetId) continue;
        const key = `${sourceId}:${targetId}`;
        const pair = pairCounts.get(key) ?? { sourceId, targetId, count: 0 };
        pair.count++;
        pairCounts.set(key, pair);
      }
    }
  }
  const associationCustomerCount = Math.max(1, basketsByContact.size);
  for (const pair of pairCounts.values()) {
    const sourceBuyers = productBuyers.get(pair.sourceId)?.size ?? 0;
    const targetBuyers = productBuyers.get(pair.targetId)?.size ?? 0;
    if (pair.count < 2 || sourceBuyers === 0 || targetBuyers === 0) continue;
    const confidence = pair.count / sourceBuyers;
    const lift = confidence / (targetBuyers / associationCustomerCount);
    if (confidence < 0.15 || lift < 1) continue;
    const row = { ...pair, confidence, lift, score: pair.count * confidence * lift };
    if (!pairsBySource.has(pair.sourceId)) pairsBySource.set(pair.sourceId, []);
    pairsBySource.get(pair.sourceId)!.push(row);
  }

  const personalPurchased = new Map<string, Set<string>>();
  for (const stat of customerStats) {
    const purchased = new Set<string>();
    for (const order of stat.orders) {
      for (const item of order.items ?? []) if (item.productId) purchased.add(item.productId);
    }
    personalPurchased.set(stat.contact.id, purchased);
  }

  const opportunityAggregates = new Map<string, any>();
  for (const stat of customerStats.filter((row) => activeIds.has(row.contact.id))) {
    const purchased = personalPurchased.get(stat.contact.id) ?? new Set<string>();
    const bestByTarget = new Map<string, any>();
    for (const sourceId of purchased) {
      const sourceName = basketsByContact.get(stat.contact.id)?.get(sourceId)
        ?? (stat.orders.flatMap((order: any) => order.items ?? []).find((item: any) => item.productId === sourceId)?.productName)
        ?? 'sản phẩm liên quan';
      for (const pair of pairsBySource.get(sourceId) ?? []) {
        if (purchased.has(pair.targetId)) continue;
        const product: any = productMap.get(pair.targetId);
        if (!product || product.totalStock <= 0) continue;
        const previous = bestByTarget.get(pair.targetId);
        const candidate = { ...pair, sourceName, product };
        if (!previous || candidate.score > previous.score) bestByTarget.set(pair.targetId, candidate);
      }
    }
    const candidates = [...bestByTarget.values()].sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      const product = candidate.product;
      const price = product.prices.find((row: any) => row.isDefault)?.price
        ?? product.prices[0]?.price
        ?? 0;
      const customer = {
        contactId: stat.contact.id,
        name: stat.contact.storeName || stat.contact.fullName || 'Khách hàng',
        phone: stat.contact.phone,
        sourceProduct: candidate.sourceName,
        confidencePercent: Math.round(candidate.confidence * 100),
        potentialRevenue: roundMoney(toNumber(price)),
      };
      const aggregate = opportunityAggregates.get(product.id) ?? {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        imageUrl: product.mainImageUrl,
        stock: product.totalStock,
        customers: [],
        confidenceTotal: 0,
        supportMax: 0,
      };
      aggregate.customers.push(customer);
      aggregate.confidenceTotal += candidate.confidence;
      aggregate.supportMax = Math.max(aggregate.supportMax, candidate.count);
      opportunityAggregates.set(product.id, aggregate);
    }

    const best = candidates[0];
    if (best && !actions.some((action) => action.contactId === stat.contact.id)) {
      const price = best.product.prices.find((row: any) => row.isDefault)?.price
        ?? best.product.prices[0]?.price
        ?? 0;
      actions.push({
        id: `opportunity:${stat.contact.id}`,
        type: 'opportunity',
        priority: 4,
        contactId: stat.contact.id,
        name: stat.contact.storeName || stat.contact.fullName || 'Khách hàng',
        phone: stat.contact.phone,
        monthlyValue: stat.potential,
        potentialRevenue: roundMoney(toNumber(price)),
        reason: `Đang mua ${best.sourceName}, chưa mua ${best.product.name}`,
        reasonDetail: `${Math.round(best.confidence * 100)}% khách mua sản phẩm nguồn cũng mua sản phẩm gợi ý`,
        lastProduct: best.sourceName,
        lastOrderId: stat.lastOrder.id,
        lastOrderCode: stat.lastOrder.orderCode,
        recommendedProductId: best.product.id,
        recommendedProductName: best.product.name,
        status: 'Chưa xử lý',
      });
    }
  }

  const productOpportunities = [...opportunityAggregates.values()]
    .map((row: any) => ({
      productId: row.productId,
      sku: row.sku,
      name: row.name,
      imageUrl: row.imageUrl,
      stock: row.stock,
      customerCount: row.customers.length,
      potentialRevenue: roundMoney(
        row.customers.reduce((sum: number, customer: any) => sum + customer.potentialRevenue, 0),
      ),
      confidencePercent: Math.round((row.confidenceTotal / row.customers.length) * 100),
      supportCustomers: row.supportMax,
      reason: `${row.customers.length} khách active có hành vi mua liên quan nhưng chưa mua sản phẩm này`,
      customers: row.customers.sort((a: any, b: any) => b.potentialRevenue - a.potentialRevenue),
    }))
    .sort((a: any, b: any) => b.customerCount - a.customerCount || b.confidencePercent - a.confidencePercent)
    .slice(0, 3);

  const actionStates = await getDashboardActionStates(
    user.orgId,
    user.id,
    actions.map((action) => action.id),
  );
  actions = actions
    .filter((action) => {
      const state = actionStates.get(action.id)?.state;
      return state !== 'done_today' && state !== 'snoozed';
    })
    .map((action) => ({ ...action, taskId: actionStates.get(action.id)?.taskId ?? null }));
  actions.sort((a, b) => a.priority - b.priority || b.potentialRevenue - a.potentialRevenue);

  const actionGroups = [
    { key: 'risk', label: 'Khách có nguy cơ mất', tone: 'red' },
    { key: 'reorder', label: 'Khách đến chu kỳ nhập lại', tone: 'orange' },
    { key: 'deal', label: 'Báo giá / deal chưa chốt', tone: 'amber' },
    { key: 'opportunity', label: 'Cross-sell / Upsell', tone: 'green' },
  ].map((group) => {
    const rows = actions.filter((action) => action.type === group.key);
    return {
      ...group,
      count: rows.length,
      potentialRevenue: roundMoney(rows.reduce((sum, row) => sum + row.potentialRevenue, 0)),
    };
  });

  const teamAgg = new Map<string, { revenue: number; orders: number }>();
  for (const order of teamMonthOrders as any[]) {
    if (!order.assignedSaleId) continue;
    const row = teamAgg.get(order.assignedSaleId) ?? { revenue: 0, orders: 0 };
    row.revenue += toNumber(order.totalAmountValue ?? order.totalAmount);
    row.orders++;
    teamAgg.set(order.assignedSaleId, row);
  }
  const leaderboard = (teamUsers as any[])
    .map((sale: any) => {
      const revenue = roundMoney(teamAgg.get(sale.id)?.revenue ?? 0);
      const target = targetMap[sale.id]?.revenue ?? null;
      return {
        saleId: sale.id,
        name: sale.fullName,
        revenue,
        orders: teamAgg.get(sale.id)?.orders ?? 0,
        isMe: sale.id === user.id,
        target,
        targetPercent: target ? Math.round((revenue / target) * 1000) / 10 : null,
        dashboardTarget: targetMap[sale.id] ?? null,
      };
    })
    .filter((sale: any) => sale.orders > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((sale: any, index: number) => ({ ...sale, rank: index + 1 }));

  const processingWhere = {
    ...orderScope,
    status: { in: ['draft', 'confirmed', 'packing', 'shipping'] },
  };
  const [processingOrders, processingStatusRows] = await Promise.all([
    prisma.order.findMany({
      where: processingWhere,
      select: {
        id: true,
        orderCode: true,
        status: true,
        totalAmount: true,
        totalAmountValue: true,
        orderDate: true,
        contact: { select: { fullName: true, storeName: true } },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
      take: 5,
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: processingWhere,
      _count: { _all: true },
    }),
  ]);
  const processingCountByStatus = new Map(
    processingStatusRows.map((row: any) => [row.status, row._count._all]),
  );

  const lowStockRows = (lowStock as any[])
    .filter((p: any) => p.totalStock <= p.warningStock)
    .slice(0, 4)
    .map((p: any) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      imageUrl: p.mainImageUrl,
      stock: p.totalStock,
      warningStock: p.warningStock,
    }));

  const orderFrequency = activeIds.size ? monthlyOrders.length / activeIds.size : 0;
  const aov = monthlyOrders.length ? monthlyRevenue / monthlyOrders.length : 0;
  const totalPotential = roundMoney(actionGroups.reduce((sum, group) => sum + group.potentialRevenue, 0));
  const myTarget = targetMap[user.id] ?? {
    revenue: null,
    activeCustomers: null,
    orderFrequency: null,
    averageOrderValue: null,
  };
  const targetGaps = [
    myTarget.activeCustomers
      ? {
          key: 'activeCustomers',
          ratio: Math.max(0, (myTarget.activeCustomers - activeIds.size) / myTarget.activeCustomers),
          message: `Số khách Active đang thấp hơn target ${Math.max(0, myTarget.activeCustomers - activeIds.size)} khách`,
        }
      : null,
    myTarget.orderFrequency
      ? {
          key: 'orderFrequency',
          ratio: Math.max(0, (myTarget.orderFrequency - orderFrequency) / myTarget.orderFrequency),
          message: `Tần suất mua đang thấp hơn target ${(Math.max(0, myTarget.orderFrequency - orderFrequency)).toFixed(2)} lần/tháng`,
        }
      : null,
    myTarget.averageOrderValue
      ? {
          key: 'averageOrderValue',
          ratio: Math.max(0, (myTarget.averageOrderValue - aov) / myTarget.averageOrderValue),
          message: `Giá trị đơn trung bình đang thấp hơn target ${roundMoney(Math.max(0, myTarget.averageOrderValue - aov)).toLocaleString('vi-VN')}đ`,
        }
      : null,
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => b.ratio - a.ratio);
  const largestGap: any = targetGaps.find((gap: any) => gap.ratio > 0) ?? null;

  return {
    generatedAt: now.toISOString(),
    dataQuality: {
      targetConfigured: Object.values(myTarget).some((value) => value !== null),
      dealValuesConfigured: (openDeals as any[]).some((d: any) => toNumber(d.potentialValue) > 0),
      promotionConfigured: false,
    },
    monthlyKpi: {
      revenue: monthlyRevenue,
      target: myTarget.revenue,
      targetPercent: myTarget.revenue
        ? Math.round((monthlyRevenue / myTarget.revenue) * 1000) / 10
        : null,
      forecast: paceForecast,
      forecastGap: myTarget.revenue ? roundMoney(Math.max(0, myTarget.revenue - paceForecast)) : null,
      activeCustomers: activeIds.size,
      activeTarget: myTarget.activeCustomers,
      repeatRate: Math.round(repeatRate * 10) / 10,
      repeatRateDelta: Math.round((repeatRate - previousRepeatRate) * 10) / 10,
      newCustomers: newIds.size,
      atRiskCustomers: healthCounts.at_risk + healthCounts.lost,
    },
    kpiTree: {
      revenue: monthlyRevenue,
      revenueTarget: myTarget.revenue,
      activeCustomers: activeIds.size,
      activeTarget: myTarget.activeCustomers,
      orderFrequency: Math.round(orderFrequency * 100) / 100,
      orderFrequencyTarget: myTarget.orderFrequency,
      averageOrderValue: roundMoney(aov),
      averageOrderValueTarget: myTarget.averageOrderValue,
      largestGap: largestGap?.key ?? null,
      issue: largestGap?.message
        ?? (Object.values(myTarget).some((value) => value !== null)
          ? 'Các KPI đang đạt hoặc vượt mục tiêu đã cấu hình'
          : 'Chưa cấu hình mục tiêu KPI riêng cho sale'),
    },
    todayAction: {
      count: actions.length,
      totalPotentialRevenue: totalPotential,
      groups: actionGroups,
      actions: actions.slice(0, 12),
    },
    customerHealth: {
      ...healthCounts,
      details: customerStats.map((stat) => ({
        contactId: stat.contact.id,
        name: stat.contact.storeName || stat.contact.fullName || 'Khách hàng',
        phone: stat.contact.phone,
        health: stat.health,
        reactivated: reactivatedIds.has(stat.contact.id),
        lastOrderAt: stat.lastOrderAt,
        daysSinceLastOrder: stat.daysSince,
        reorderCycleDays: stat.cycle,
        potentialRevenue: stat.potential,
      })),
    },
    pipeline: {
      dealStages: ['da_bao_gia', 'tiep_can', 'dang_thu_hang'].map((stage) => {
        const rows = (openDeals as any[]).filter((deal: any) => deal.stage === stage);
        return {
          key: stage,
          label: labelStage(stage),
          count: rows.length,
          value: roundMoney(rows.reduce((sum: number, row: any) => sum + toNumber(row.potentialValue), 0)),
        };
      }),
      orderStages: [
        { key: 'draft', label: 'Chờ xác nhận' },
        { key: 'confirmed', label: 'Đơn pending' },
        { key: 'shipping', label: 'Đang giao' },
      ].map((stage) => ({
        ...stage,
        count: processingCountByStatus.get(stage.key) ?? 0,
      })),
      rows: (openDeals as any[]).slice(0, 5).map((deal: any) => ({
        id: deal.id,
        name: deal.storeName || deal.fullName || 'Khách hàng',
        stage: deal.stage,
        stageLabel: labelStage(deal.stage),
        value: roundMoney(toNumber(deal.potentialValue)),
        nextFollowAt: deal.nextContactDate,
        overdue: Boolean(deal.nextContactDate && deal.nextContactDate < today),
      })),
      dataComplete: (openDeals as any[]).some(
        (deal: any) => toNumber(deal.potentialValue) > 0 || deal.nextContactDate,
      ),
    },
    productOpportunities,
    leaderboard,
    utilities: {
      lowStock: lowStockRows,
      processingOrders: processingOrders.map((order: any) => ({
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        totalAmount: roundMoney(toNumber(order.totalAmountValue ?? order.totalAmount)),
        orderDate: order.orderDate,
        customerName: order.contact?.storeName || order.contact?.fullName || 'Khách hàng',
      })),
    },
  };
}

export async function getSaleMonthlyOrders(
  user: DashboardUser,
  saleId: string,
  anchor = new Date(),
) {
  const monthStart = startOfMonth(anchor);
  const nextMonth = addMonths(monthStart, 1);
  const sale = await prisma.user.findFirst({
    where: { id: saleId, orgId: user.orgId, isActive: true },
    select: { id: true, fullName: true },
  });
  if (!sale) return null;

  const orders = await prisma.order.findMany({
    where: {
      orgId: user.orgId,
      status: { in: COUNTABLE_STATUSES },
      orderDate: { gte: monthStart, lt: nextMonth },
      OR: [
        { assignedSaleId: saleId },
        { assignedSaleId: null, contact: { assignedUserId: saleId } },
      ],
    },
    select: {
      id: true,
      orderCode: true,
      orderDate: true,
      status: true,
      totalAmount: true,
      totalAmountValue: true,
      contact: { select: { fullName: true, storeName: true } },
    },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
  });

  const rows = orders.map((order: any) => ({
    id: order.id,
    orderCode: order.orderCode,
    orderDate: order.orderDate,
    status: order.status,
    customerName: order.contact?.storeName || order.contact?.fullName || 'Khách hàng',
    totalAmount: roundMoney(toNumber(order.totalAmountValue ?? order.totalAmount)),
  }));

  return {
    sale,
    month: monthStart.toISOString().slice(0, 7),
    count: rows.length,
    revenue: roundMoney(rows.reduce((sum: number, row: { totalAmount: number }) => sum + row.totalAmount, 0)),
    orders: rows,
  };
}
