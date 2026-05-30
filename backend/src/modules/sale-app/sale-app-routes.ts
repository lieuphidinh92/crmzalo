/**
 * Sale Lite app — dedicated POS endpoints separate from the main CRM API.
 *
 * Mounted under /api/v1/sale-app/* so it stays decoupled from /orders,
 * /contacts, /products which are tuned for the desktop CRM. Auth + JWT
 * are shared with the CRM (same token).
 *
 *  GET  /api/v1/sale-app/home-stats              → today/week/month + 5 recent
 *  GET  /api/v1/sale-app/top-products            → top selling SKUs this month
 *  GET  /api/v1/sale-app/low-stock               → products near/at warning threshold
 *  GET  /api/v1/sale-app/debt-summary            → outstanding debt + overdue count
 *  GET  /api/v1/sale-app/pricing-config (admin)  → tier pricing rule
 *  PUT  /api/v1/sale-app/pricing-config (admin)  → update tier pricing rule
 *  POST /api/v1/sale-app/_backfill-tier-prices   → seed missing ProductPrice tiers
 *  GET  /api/v1/sale-app/customers/search?q=     → contact search (member-scoped)
 *  POST /api/v1/sale-app/customers               → quick-create a new contact
 *  GET  /api/v1/sale-app/products/search?q=&tier= → product catalog with tier price
 *  POST /api/v1/sale-app/orders                  → create order + items in one txn
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  generateOrderCode,
  recomputeOrderTotals,
  toNumber,
  reqUser,
} from '../orders/order-service.js';

const COUNTABLE_STATUSES = ['confirmed', 'packing', 'shipping', 'completed', 'shipped', 'paid'];

// Map Contact.policyTier → ProductPrice.tierName (matches seeded data).
const TIER_NAME_MAP: Record<string, string> = {
  ctv: 'CTV',
  dai_ly_cap_1: 'Đại lý cấp 1',
  dai_ly_cap_2: 'Đại lý cấp 2 (VIP)',
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  // Treat Monday as start of week (Vietnamese convention).
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

// "My orders" — sale sees orders they created OR are assigned to.
// Mirrors orderScopeWhere() in order-service for the member role.
function mineScope(user: { id: string; orgId: string }) {
  return {
    orgId: user.orgId,
    OR: [{ assignedSaleId: user.id }, { createdByUserId: user.id }],
  };
}

export async function saleAppRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/sale-app/home-stats ───────────────────────────────────
  app.get('/api/v1/sale-app/home-stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const now = new Date();
      const todayStart = startOfDay(now);
      const weekStart = startOfWeek(now);
      const monthStart = startOfMonth(now);

      const baseWhere = {
        ...mineScope(user),
        status: { in: COUNTABLE_STATUSES },
      };

      const [todayAgg, weekAgg, monthAgg, recent] = await Promise.all([
        prisma.order.aggregate({
          where: { ...baseWhere, orderDate: { gte: todayStart } },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: { ...baseWhere, orderDate: { gte: weekStart } },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: { ...baseWhere, orderDate: { gte: monthStart } },
          _sum: { totalAmount: true },
          _count: { id: true },
        }),
        prisma.order.findMany({
          where: mineScope(user),
          select: {
            id: true,
            orderCode: true,
            status: true,
            totalAmount: true,
            totalAmountValue: true,
            orderDate: true,
            createdAt: true,
            contact: { select: { id: true, fullName: true, storeName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      return {
        today: {
          revenue: Math.round(todayAgg._sum.totalAmount ?? 0),
          order_count: todayAgg._count.id,
        },
        this_week: {
          revenue: Math.round(weekAgg._sum.totalAmount ?? 0),
          order_count: weekAgg._count.id,
        },
        this_month: {
          revenue: Math.round(monthAgg._sum.totalAmount ?? 0),
          order_count: monthAgg._count.id,
        },
        recent_orders: recent.map((o: any) => ({
          id: o.id,
          order_code: o.orderCode,
          status: o.status,
          total_amount: toNumber(o.totalAmountValue ?? o.totalAmount),
          order_date: o.orderDate,
          created_at: o.createdAt,
          contact_id: o.contact?.id ?? null,
          contact_name: o.contact?.fullName ?? '—',
          store_name: o.contact?.storeName ?? null,
        })),
      };
    } catch (err) {
      logger.error('[sale-app] home-stats error:', err);
      return reply.status(500).send({ error: 'Lỗi tải thống kê' });
    }
  });

  // ── GET /api/v1/sale-app/top-products ─ best-selling SKUs this month ──
  // Member sees own assigned orders only; admin/owner sees the whole org.
  // Returns wholesale price (tier-aware) + retail suggested + estimated
  // profit per unit. Cost fields NEVER leak (no cost_price in payload).
  app.get('/api/v1/sale-app/top-products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { limit = '5', tier = 'dai_ly_cap_1' } = request.query as {
        limit?: string;
        tier?: string;
      };
      const tierName = TIER_NAME_MAP[tier] ?? null;
      const take = Math.min(20, Math.max(1, parseInt(limit) || 5));
      const monthStart = startOfMonth(new Date());

      const orderWhere: any = {
        orgId: user.orgId,
        status: { in: COUNTABLE_STATUSES },
        orderDate: { gte: monthStart },
      };
      if (user.role === 'member') {
        orderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
      }

      // Aggregate quantity per productId within scope.
      const grouped: any[] = await prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: orderWhere, productId: { not: null } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take,
      });

      const productIds = grouped.map((g: any) => g.productId).filter(Boolean);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          mainImageUrl: true,
          totalStock: true,
          brand: { select: { id: true, name: true } },
          prices: {
            where: { active: true },
            select: { id: true, tierName: true, price: true, isDefault: true },
          },
        },
      });
      const pmap = new Map<string, any>(products.map((p: any) => [p.id, p]));

      const items = grouped.map((g: any) => {
        const p = pmap.get(g.productId);
        if (!p) return null;
        // Wholesale = tier price (fallback default → first).
        const wholesalePick =
          (tierName && p.prices.find((pr: any) => pr.tierName === tierName)) ||
          p.prices.find((pr: any) => pr.isDefault) ||
          p.prices[0] ||
          null;
        // Retail suggested = any tier matching "Lẻ"/"Giá lẻ" (case-insensitive).
        const retailPick = p.prices.find((pr: any) => /lẻ|le|retail/i.test(pr.tierName ?? ''));
        const wholesale = wholesalePick ? toNumber(wholesalePick.price) : 0;
        const retail = retailPick ? toNumber(retailPick.price) : 0;
        const profit = retail > wholesale ? retail - wholesale : 0;
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          mainImageUrl: p.mainImageUrl,
          brand: p.brand,
          stock: p.totalStock,
          quantitySold: g._sum.quantity ?? 0,
          wholesale_price: wholesale,
          wholesale_tier: wholesalePick?.tierName ?? null,
          retail_price: retail,
          estimated_profit: profit,
        };
      }).filter(Boolean);

      return { products: items };
    } catch (err) {
      logger.error('[sale-app] top-products error:', err);
      return reply.status(500).send({ error: 'Lỗi tải top sản phẩm' });
    }
  });

  // ── GET /api/v1/sale-app/debt-summary ─ outstanding receivables ───────
  // Member sees debt on their own contacts; admin/owner sees the whole org.
  // `total` = SUM(debt_amount_value) across orders with debt > 0 and not
  // cancelled. `overdueTotal` further filters by past debt_due_date.
  app.get('/api/v1/sale-app/debt-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const baseWhere: any = {
        orgId: user.orgId,
        debtAmountValue: { gt: 0 },
        status: { notIn: ['cancelled'] },
      };
      if (user.role === 'member') {
        baseWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
      }
      const now = new Date();

      const [openAgg, overdueAgg, contactCount] = await Promise.all([
        prisma.order.aggregate({
          where: baseWhere,
          _sum: { debtAmountValue: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: { ...baseWhere, debtDueDate: { lt: now } },
          _sum: { debtAmountValue: true },
          _count: { id: true },
        }),
        prisma.order.findMany({
          where: baseWhere,
          select: { contactId: true },
          distinct: ['contactId'],
        }),
      ]);

      return {
        total: toNumber(openAgg._sum.debtAmountValue),
        order_count: openAgg._count.id,
        overdue_total: toNumber(overdueAgg._sum.debtAmountValue),
        overdue_order_count: overdueAgg._count.id,
        contact_count: contactCount.length,
      };
    } catch (err) {
      logger.error('[sale-app] debt-summary error:', err);
      return reply.status(500).send({ error: 'Lỗi tải tổng công nợ' });
    }
  });

  // ── GET /api/v1/sale-app/pricing-config (admin) ───────────────────────
  // Seeds defaults on first GET so the settings page always has a row to
  // bind against. Matches the pattern used by business-goals + sale-score.
  app.get(
    '/api/v1/sale-app/pricing-config',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        let cfg = await prisma.saleAppPricingConfig.findUnique({
          where: { orgId: user.orgId },
        });
        if (!cfg) {
          cfg = await prisma.saleAppPricingConfig.create({
            data: { orgId: user.orgId, costMarkupPct: 25, tierDelta: 5000, enableBackfill: false },
          });
        }
        return {
          cost_markup_pct: toNumber(cfg.costMarkupPct),
          tier_delta: toNumber(cfg.tierDelta),
          enable_backfill: cfg.enableBackfill,
          last_backfill_at: cfg.lastBackfillAt,
          updated_at: cfg.updatedAt,
        };
      } catch (err) {
        logger.error('[sale-app] pricing-config GET error:', err);
        return reply.status(500).send({ error: 'Lỗi tải cấu hình giá' });
      }
    },
  );

  // ── PUT /api/v1/sale-app/pricing-config (admin) ───────────────────────
  app.put(
    '/api/v1/sale-app/pricing-config',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const body = request.body as {
          cost_markup_pct?: number;
          tier_delta?: number;
          enable_backfill?: boolean;
        };
        const data: any = { updatedBy: user.id };
        if (body.cost_markup_pct !== undefined) {
          const v = Number(body.cost_markup_pct);
          if (!Number.isFinite(v) || v < 0 || v > 500) {
            return reply.status(400).send({ error: 'Markup phải trong 0–500%' });
          }
          data.costMarkupPct = v;
        }
        if (body.tier_delta !== undefined) {
          const v = Number(body.tier_delta);
          if (!Number.isFinite(v) || v < 0 || v > 10_000_000) {
            return reply.status(400).send({ error: 'Tier delta phải trong 0–10.000.000đ' });
          }
          data.tierDelta = v;
        }
        if (body.enable_backfill !== undefined) {
          data.enableBackfill = !!body.enable_backfill;
        }

        const cfg = await prisma.saleAppPricingConfig.upsert({
          where: { orgId: user.orgId },
          update: data,
          create: { orgId: user.orgId, costMarkupPct: 25, tierDelta: 5000, ...data },
        });
        return {
          cost_markup_pct: toNumber(cfg.costMarkupPct),
          tier_delta: toNumber(cfg.tierDelta),
          enable_backfill: cfg.enableBackfill,
          last_backfill_at: cfg.lastBackfillAt,
          updated_at: cfg.updatedAt,
        };
      } catch (err) {
        logger.error('[sale-app] pricing-config PUT error:', err);
        return reply.status(500).send({ error: 'Lỗi lưu cấu hình giá' });
      }
    },
  );

  // ── POST /api/v1/sale-app/_backfill-tier-prices (admin) ───────────────
  // Idempotent — only inserts ProductPrice rows for tiers that DO NOT yet
  // exist on each active product. Existing prices are NEVER overwritten.
  // Refuses to run unless `enable_backfill === true` in pricing-config.
  app.post(
    '/api/v1/sale-app/_backfill-tier-prices',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const cfg = await prisma.saleAppPricingConfig.findUnique({ where: { orgId: user.orgId } });
        if (!cfg) {
          return reply.status(400).send({ error: 'Chưa cấu hình giá. Mở trang Cài đặt trước.' });
        }
        if (!cfg.enableBackfill) {
          return reply.status(400).send({
            error: 'Vui lòng bật "Cho phép backfill" trong cài đặt trước khi chạy.',
          });
        }

        const markup = toNumber(cfg.costMarkupPct);
        const delta = toNumber(cfg.tierDelta);

        // Pull every active product with its existing prices in one shot.
        const products = await prisma.product.findMany({
          where: { orgId: user.orgId, status: 'active' },
          select: {
            id: true,
            sku: true,
            costPrice: true,
            prices: { where: { active: true }, select: { tierName: true } },
          },
        });

        const TIERS = [
          { name: 'Đại lý cấp 2 (VIP)', deltaMul: 0, displayOrder: 1, isDefault: false },
          { name: 'Đại lý cấp 1',       deltaMul: 1, displayOrder: 2, isDefault: false },
          { name: 'CTV',                deltaMul: 2, displayOrder: 3, isDefault: true  },
        ];

        let createdRows = 0;
        let skippedNoCost = 0;
        let skippedAlreadyHasTier = 0;
        const touchedSkus: string[] = [];

        for (const p of products) {
          if (p.costPrice == null) {
            skippedNoCost += 1;
            continue;
          }
          const base = Math.round(toNumber(p.costPrice) * (1 + markup / 100));
          const existing = new Set(p.prices.map((pr: any) => pr.tierName));
          let touched = false;
          for (const t of TIERS) {
            if (existing.has(t.name)) {
              skippedAlreadyHasTier += 1;
              continue;
            }
            const price = base + delta * t.deltaMul;
            await prisma.productPrice.create({
              data: {
                productId: p.id,
                tierName: t.name,
                price,
                displayOrder: t.displayOrder,
                isDefault: t.isDefault,
                active: true,
              },
            });
            createdRows += 1;
            touched = true;
          }
          if (touched) touchedSkus.push(p.sku);
        }

        await prisma.saleAppPricingConfig.update({
          where: { orgId: user.orgId },
          data: { lastBackfillAt: new Date(), updatedBy: user.id },
        });

        return {
          ok: true,
          created_rows: createdRows,
          touched_products: touchedSkus.length,
          skipped_no_cost: skippedNoCost,
          skipped_already_has_tier: skippedAlreadyHasTier,
          sample_touched_skus: touchedSkus.slice(0, 10),
          markup_pct: markup,
          tier_delta: delta,
        };
      } catch (err) {
        logger.error('[sale-app] backfill error:', err);
        return reply.status(500).send({ error: 'Lỗi chạy backfill' });
      }
    },
  );

  // ── GET /api/v1/sale-app/low-stock ─ products near warning threshold ──
  app.get('/api/v1/sale-app/low-stock', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { limit = '5' } = request.query as { limit?: string };
      const take = Math.min(20, Math.max(1, parseInt(limit) || 5));

      // Postgres can't compare two columns inside a Prisma where, so we
      // fetch a wider window and filter in code. With ~1k products this
      // is fine; revisit if catalog grows past 10k.
      const rows = await prisma.product.findMany({
        where: { orgId: user.orgId, status: 'active' },
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          mainImageUrl: true,
          totalStock: true,
          warningStock: true,
          brand: { select: { id: true, name: true } },
        },
        orderBy: { totalStock: 'asc' },
        take: 200,
      });

      const items = rows
        .filter((p: any) => (p.totalStock ?? 0) <= (p.warningStock ?? 0))
        .slice(0, take)
        .map((p: any) => {
          const stock = p.totalStock ?? 0;
          const warning = p.warningStock ?? 0;
          let level: 'out' | 'critical' | 'low' = 'low';
          if (stock <= 0) level = 'out';
          else if (warning > 0 && stock <= warning * 0.3) level = 'critical';
          return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            unit: p.unit,
            mainImageUrl: p.mainImageUrl,
            brand: p.brand,
            stock,
            warning_stock: warning,
            level,
          };
        });

      return { products: items };
    } catch (err) {
      logger.error('[sale-app] low-stock error:', err);
      return reply.status(500).send({ error: 'Lỗi tải cảnh báo tồn kho' });
    }
  });

  // ── GET /api/v1/sale-app/customers/search ─────────────────────────────
  app.get('/api/v1/sale-app/customers/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { q = '' } = request.query as { q?: string };
      const term = q.trim();

      const where: any = { orgId: user.orgId };
      // Member sees only their own contacts; admin/owner sees all.
      if (user.role === 'member') where.assignedUserId = user.id;
      if (term) {
        where.OR = [
          { fullName: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term } },
          { storeName: { contains: term, mode: 'insensitive' } },
          { misaCustomerCode: { contains: term, mode: 'insensitive' } },
        ];
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phone: true,
          storeName: true,
          misaCustomerCode: true,
          province: true,
          policyTier: true,
          address: true,
          customerType: true,
          lastOrderDate: true,
          stage: true,
        },
        orderBy: [{ lastOrderDate: { sort: 'desc', nulls: 'last' } }, { fullName: 'asc' }],
        take: 20,
      });

      return { customers: contacts };
    } catch (err) {
      logger.error('[sale-app] customers/search error:', err);
      return reply.status(500).send({ error: 'Lỗi tìm khách hàng' });
    }
  });

  // ── POST /api/v1/sale-app/customers ─ quick create new contact ────────
  app.post('/api/v1/sale-app/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const body = request.body as {
        fullName?: string;
        phone?: string;
        storeName?: string;
        province?: string;
        address?: string;
        policyTier?: string;
      };

      if (!body.fullName?.trim()) {
        return reply.status(400).send({ error: 'Tên khách hàng là bắt buộc' });
      }
      if (!body.phone?.trim()) {
        return reply.status(400).send({ error: 'Số điện thoại là bắt buộc' });
      }

      const contact = await prisma.contact.create({
        data: {
          orgId: user.orgId,
          fullName: body.fullName.trim(),
          phone: body.phone.trim(),
          storeName: body.storeName?.trim() || null,
          province: body.province?.trim() || null,
          address: body.address?.trim() || null,
          policyTier: body.policyTier?.trim() || null,
          assignedUserId: user.id,
          source: 'sale_app',
          stage: 'tiep_can',
          stageUpdatedAt: new Date(),
          firstContactDate: new Date(),
        },
      });

      return reply.status(201).send({ customer: contact });
    } catch (err) {
      logger.error('[sale-app] customers create error:', err);
      return reply.status(500).send({ error: 'Lỗi tạo khách hàng' });
    }
  });

  // ── GET /api/v1/sale-app/products/search ──────────────────────────────
  app.get('/api/v1/sale-app/products/search', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { q = '', brand = '', tier = '' } = request.query as {
        q?: string;
        brand?: string;
        tier?: string;
      };
      const term = q.trim();
      const tierName = TIER_NAME_MAP[tier] ?? null;

      const where: any = { orgId: user.orgId, status: 'active' };
      if (brand) where.brandId = brand;
      if (term) {
        where.OR = [
          { sku: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ];
      }

      const products = await prisma.product.findMany({
        where,
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          packageSize: true,
          mainImageUrl: true,
          totalStock: true,
          brand: { select: { id: true, name: true } },
          prices: {
            where: { active: true },
            select: { id: true, tierName: true, price: true, isDefault: true, displayOrder: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
        take: 60,
      });

      // Pick a single price for the requested tier:
      //   1) exact match on tierName (e.g. "Đại lý cấp 1")
      //   2) is_default = true
      //   3) first active price
      const items = products.map((p: any) => {
        let pick = tierName ? p.prices.find((pr: any) => pr.tierName === tierName) : null;
        if (!pick) pick = p.prices.find((pr: any) => pr.isDefault) ?? p.prices[0] ?? null;
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          packageSize: p.packageSize,
          mainImageUrl: p.mainImageUrl,
          stock: p.totalStock,
          brand: p.brand,
          price: pick ? toNumber(pick.price) : 0,
          priceTierId: pick?.id ?? null,
          priceTierName: pick?.tierName ?? null,
          tiers: p.prices.map((pr: any) => ({
            id: pr.id,
            name: pr.tierName,
            price: toNumber(pr.price),
            isDefault: pr.isDefault,
          })),
        };
      });

      return { products: items };
    } catch (err) {
      logger.error('[sale-app] products/search error:', err);
      return reply.status(500).send({ error: 'Lỗi tìm sản phẩm' });
    }
  });

  // ── POST /api/v1/sale-app/orders ─ create order + items in one txn ────
  app.post('/api/v1/sale-app/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const body = request.body as {
        contactId?: string;
        items?: Array<{
          productId: string;
          quantity: number;
          unitPrice: number;
          priceTierId?: string | null;
          discountValue?: number;
        }>;
        shippingMethod?: string;
        paymentMethod?: string;
        note?: string;
        source?: string;
        orderDate?: string;
      };

      if (!body.contactId) return reply.status(400).send({ error: 'Vui lòng chọn khách hàng' });
      if (!body.items?.length) return reply.status(400).send({ error: 'Vui lòng chọn ít nhất 1 sản phẩm' });

      // Verify contact + products belong to this org
      const contact = await prisma.contact.findFirst({
        where: { id: body.contactId, orgId: user.orgId },
        select: { id: true, assignedUserId: true, address: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

      const productIds = body.items.map((it) => it.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, orgId: user.orgId },
        select: { id: true, sku: true, name: true, unit: true, costPrice: true },
      });
      const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));
      for (const it of body.items) {
        if (!productMap.has(it.productId)) {
          return reply.status(400).send({ error: `Sản phẩm không hợp lệ: ${it.productId}` });
        }
        if (!it.quantity || it.quantity <= 0) {
          return reply.status(400).send({ error: 'Số lượng phải > 0' });
        }
        if (it.unitPrice === undefined || it.unitPrice < 0) {
          return reply.status(400).send({ error: 'Đơn giá phải ≥ 0' });
        }
      }

      const orderCode = await generateOrderCode(user.orgId);
      const now = new Date();
      const orderDate = body.orderDate ? new Date(body.orderDate) : now;

      // Single transaction: create order shell + all items, then recompute totals.
      const created = await prisma.$transaction(async (tx: any) => {
        const order = await tx.order.create({
          data: {
            orgId: user.orgId,
            contactId: contact.id,
            createdByUserId: user.id,
            orderCode,
            status: 'confirmed',
            orderDate,
            confirmedAt: now,
            assignedSaleId: contact.assignedUserId ?? user.id,
            source: body.source ?? 'sale_app',
            shippingMethod: body.shippingMethod ?? null,
            paymentMethod: body.paymentMethod ?? null,
            deliveryAddress: contact.address ?? null,
            internalNote: body.note ?? null,
            totalAmount: 0,
            subtotalAmount: 0,
            totalAmountValue: 0,
            discountAmount: 0,
            paidAmount: 0,
          },
        });

        for (const it of body.items!) {
          const product = productMap.get(it.productId)!;
          const qty = it.quantity;
          const unitPrice = it.unitPrice;
          const discount = it.discountValue ?? 0;
          const lineTotal = qty * unitPrice - discount;
          const unitCost = product.costPrice == null ? null : toNumber(product.costPrice);
          const lineCost = unitCost == null ? null : Math.round(qty * unitCost);
          const profit = lineCost == null ? null : lineTotal - lineCost;

          await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              priceTierId: it.priceTierId ?? null,
              sku: product.sku,
              productName: product.name,
              unit: product.unit,
              quantity: qty,
              unitPrice,
              discountValue: discount,
              lineTotal,
              unitCost,
              lineCost,
              profit,
              costValue: unitCost,
            },
          });
        }

        await recomputeOrderTotals(order.id, tx);
        return order;
      });

      const full = await prisma.order.findUnique({
        where: { id: created.id },
        select: {
          id: true,
          orderCode: true,
          status: true,
          totalAmount: true,
          totalAmountValue: true,
          orderDate: true,
          createdAt: true,
          contact: { select: { id: true, fullName: true, storeName: true } },
        },
      });

      return reply.status(201).send({
        order: {
          id: full!.id,
          order_code: full!.orderCode,
          status: full!.status,
          total_amount: toNumber(full!.totalAmountValue ?? full!.totalAmount),
          order_date: full!.orderDate,
          created_at: full!.createdAt,
          contact_id: full!.contact?.id ?? null,
          contact_name: full!.contact?.fullName ?? '—',
        },
      });
    } catch (err) {
      logger.error('[sale-app] orders create error:', err);
      return reply.status(500).send({ error: 'Lỗi tạo đơn hàng' });
    }
  });
}
