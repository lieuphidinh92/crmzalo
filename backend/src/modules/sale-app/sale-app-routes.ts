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
 *  GET  /api/v1/sale-app/products                → paginated list w/ filters+sort
 *  GET  /api/v1/sale-app/products/:id            → detail incl. tier prices, batches
 *  GET  /api/v1/sale-app/reports/summary         → period KPI + trend vs previous
 *  GET  /api/v1/sale-app/reports/revenue-trend   → time series for chart
 *  GET  /api/v1/sale-app/reports/top-customers   → top N customers by revenue
 *  GET  /api/v1/sale-app/reports/sku-mix         → SKU/brand breakdown by revenue
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

// Map Contact.policyTier → ProductPrice.tierName.
// Nhóm giá theo sản lượng thùng (từ 1/6/2026). Giữ key cũ (ctv/dai_ly_cap_*)
// map sang mức mới để KH cũ chưa migrate không bị vỡ giá.
const TIER_NAME_MAP: Record<string, string> = {
  thung_10: '10 thùng',
  thung_5: '5 thùng',
  thung_1: '1 thùng',
  le: '<1 thùng',
  // legacy
  dai_ly_cap_2: '5 thùng',
  dai_ly_cap_1: '1 thùng',
  ctv: '<1 thùng',
};
const DEFAULT_TIER = 'thung_1';

/**
 * Tìm contactId khớp ô tìm kiếm — TÁCH TỪNG TỪ (không phụ thuộc thứ tự) và
 * CHUẨN HOÁ SĐT (bỏ dấu cách/ký tự) để gõ số liền vẫn ra.
 *   - Mỗi "từ" phải khớp ít nhất 1 trong: tên / cửa hàng / mã KH (MISA) / SĐT.
 *   - Các từ kết hợp AND → gõ "Huế Flora" hay "Flora Huế" đều ra "Flora Thanh Huế".
 *   - Số: so khớp trên SĐT đã bỏ ký tự không phải số → "0966886241" khớp "096 6886241".
 * Tham số dùng positional ($1, $2...) nên KHÔNG có nguy cơ SQL injection.
 * Trả về mảng id (có thể rỗng); null nếu term rỗng (không lọc theo tìm kiếm).
 */
async function searchContactIdsByTerm(
  orgId: string,
  assignedUserId: string | null,
  term: string,
): Promise<string[] | null> {
  const tokens = (term || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!tokens.length) return null;

  const params: any[] = [orgId];
  let sql = `SELECT id FROM contacts WHERE org_id = $1`;
  if (assignedUserId) {
    params.push(assignedUserId);
    sql += ` AND assigned_user_id = $${params.length}`;
  }
  for (const tok of tokens) {
    params.push(`%${tok}%`);
    const pLike = params.length;
    let cond = `(full_name ILIKE $${pLike} OR store_name ILIKE $${pLike} OR misa_customer_code ILIKE $${pLike}`;
    const digits = tok.replace(/\D/g, '');
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      cond += ` OR regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') ILIKE $${params.length}`;
    }
    cond += `)`;
    sql += ` AND ${cond}`;
  }
  sql += ` LIMIT 500`;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(sql, ...params);
  return rows.map((r: { id: string }) => r.id);
}

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
      const { limit = '5', tier = DEFAULT_TIER } = request.query as {
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

  // ── GET /api/v1/sale-app/payment-info (any logged-in user) ────────────
  // Company bank transfer info shown when sending an order over Zalo.
  // Stored as JSON in AppSetting.valuePlain (settingKey 'company_payment_info').
  // Missing fields / missing row → empty strings.
  app.get(
    '/api/v1/sale-app/payment-info',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const row = await prisma.appSetting.findUnique({
          where: { orgId_settingKey: { orgId: user.orgId, settingKey: 'company_payment_info' } },
        });
        let parsed: Record<string, unknown> = {};
        if (row?.valuePlain) {
          try {
            parsed = JSON.parse(row.valuePlain);
          } catch {
            parsed = {};
          }
        }
        return {
          bankName: typeof parsed.bankName === 'string' ? parsed.bankName : '',
          accountNumber: typeof parsed.accountNumber === 'string' ? parsed.accountNumber : '',
          accountHolder: typeof parsed.accountHolder === 'string' ? parsed.accountHolder : '',
          note: typeof parsed.note === 'string' ? parsed.note : '',
        };
      } catch (err) {
        logger.error('[sale-app] payment-info GET error:', err);
        return reply.status(500).send({ error: 'Lỗi tải thông tin chuyển khoản' });
      }
    },
  );

  // ── PUT /api/v1/sale-app/payment-info (admin) ─────────────────────────
  app.put(
    '/api/v1/sale-app/payment-info',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const body = (request.body ?? {}) as {
          bankName?: string;
          accountNumber?: string;
          accountHolder?: string;
          note?: string;
        };
        const info = {
          bankName: typeof body.bankName === 'string' ? body.bankName.trim() : '',
          accountNumber: typeof body.accountNumber === 'string' ? body.accountNumber.trim() : '',
          accountHolder: typeof body.accountHolder === 'string' ? body.accountHolder.trim() : '',
          note: typeof body.note === 'string' ? body.note.trim() : '',
        };
        const valuePlain = JSON.stringify(info);
        await prisma.appSetting.upsert({
          where: { orgId_settingKey: { orgId: user.orgId, settingKey: 'company_payment_info' } },
          update: { valuePlain },
          create: { orgId: user.orgId, settingKey: 'company_payment_info', valuePlain },
        });
        return info;
      } catch (err) {
        logger.error('[sale-app] payment-info PUT error:', err);
        return reply.status(500).send({ error: 'Lỗi lưu thông tin chuyển khoản' });
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
          { name: '10 thùng', deltaMul: 0, displayOrder: 1, isDefault: false },
          { name: '5 thùng',  deltaMul: 1, displayOrder: 2, isDefault: false },
          { name: '1 thùng',  deltaMul: 2, displayOrder: 3, isDefault: true  },
          { name: '<1 thùng', deltaMul: 3, displayOrder: 4, isDefault: false },
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
        // Tách từ + chuẩn hoá SĐT → gõ đảo thứ tự / số liền vẫn ra.
        const ids = await searchContactIdsByTerm(
          user.orgId,
          user.role === 'member' ? user.id : null,
          term,
        );
        where.id = { in: ids ?? [] };
      }

      const contacts = await prisma.contact.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phone: true,
          storeName: true,
          misaCustomerCode: true,
          customerCode: true,    // PR4
          customerRank: true,    // PR4
          rankScore: true,       // PR4
          province: true,
          policyTier: true,
          address: true,
          customerType: true,
          lastOrderDate: true,
          stage: true,
          // NV phụ trách cũ → frontend tự điền "Nhân viên sale" theo lịch sử.
          assignedUserId: true,
          assignedUser: { select: { id: true, fullName: true } },
          rewardPoints: true,
          creditLimit: true,
          // Hồ sơ xuất HĐ mặc định → frontend tự điền sẵn khi chọn KH.
          invoiceBuyerType: true,
          invoiceBuyerName: true,
          invoiceTaxCode: true,
          invoiceAddress: true,
          invoiceEmail: true,
        },
        orderBy: [{ lastOrderDate: { sort: 'desc', nulls: 'last' } }, { fullName: 'asc' }],
        take: 20,
      });

      // PR4 — flatten Decimal/Date như list endpoint để frontend dùng nhất quán.
      const customers = contacts.map((c: any) => ({
        ...c,
        customer_code: c.customerCode,
        customer_rank: c.customerRank,
        rank_score: c.rankScore == null ? null : toNumber(c.rankScore),
      }));

      return { customers };
    } catch (err) {
      logger.error('[sale-app] customers/search error:', err);
      return reply.status(500).send({ error: 'Lỗi tìm khách hàng' });
    }
  });

  // ── GET /api/v1/sale-app/staff ─ danh sách nhân viên để chọn NV sale ──
  // Mọi role xem được toàn đội (để gán đơn cho đúng người phụ trách).
  app.get('/api/v1/sale-app/staff', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const staff = await prisma.user.findMany({
        where: { orgId: user.orgId, isActive: true },
        select: { id: true, fullName: true },
        orderBy: { fullName: 'asc' },
      });
      return { staff };
    } catch (err) {
      logger.error('[sale-app] staff list error:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách nhân viên' });
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
        creditLimit?: number | string | null;
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
          creditLimit:
            body.creditLimit == null || body.creditLimit === ''
              ? null
              : Math.max(0, Math.round(Number(body.creditLimit))),
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

  // ── GET /api/v1/sale-app/customers ─ paginated list w/ filters+sort ───
  // Member sees only their own contacts; admin/owner sees the whole org.
  // Debt + revenue are computed from orders (not the stale Contact.debtAmount
  // column) so the figures match /debt-summary. Filters: `has_debt`,
  // `tier`, `province`, `customerType`. Sort: recent (lastOrderDate) | name | debt.
  app.get('/api/v1/sale-app/customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const {
        q = '',
        tier = '',
        province = '',
        customerType = '',
        filter = '',
        sort = 'recent',
        page = '1',
        limit = '20',
        rank = '', // PR4 — top_1 | top_2 | top_3 | top_4 | no_data
      } = request.query as Record<string, string>;

      const take = Math.min(50, Math.max(1, parseInt(limit) || 20));
      const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;

      const where: any = { orgId: user.orgId };
      if (user.role === 'member') where.assignedUserId = user.id;
      if (tier) where.policyTier = tier;
      if (province) where.province = { contains: province, mode: 'insensitive' };
      if (customerType) where.customerType = customerType;
      // PR4 — filter hạng KH
      if (rank === 'no_data') where.customerRank = null;
      else if (rank) where.customerRank = rank;
      // Tách từ + chuẩn hoá SĐT → gõ đảo thứ tự / số liền vẫn ra.
      let searchIds: string[] | null = null;
      if (q.trim()) {
        searchIds = await searchContactIdsByTerm(
          user.orgId,
          user.role === 'member' ? user.id : null,
          q,
        );
        where.id = { in: searchIds ?? [] };
      }

      // has_debt + sort=debt depend on order aggregates, so pre-resolve the
      // set of contactIds carrying outstanding debt within this org/scope.
      let debtByContact: Map<string, { debt: number; revenue: number; orders: number }> | null = null;
      const needsDebtFilter = filter === 'has_debt';
      const needsDebtSort = sort === 'debt';
      if (needsDebtFilter || needsDebtSort) {
        const orderWhere: any = {
          orgId: user.orgId,
          debtAmountValue: { gt: 0 },
          status: { notIn: ['cancelled'] },
        };
        if (user.role === 'member') {
          orderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
        }
        const grouped: any[] = await prisma.order.groupBy({
          by: ['contactId'],
          where: orderWhere,
          _sum: { debtAmountValue: true },
        });
        debtByContact = new Map(
          grouped
            .filter((g: any) => g.contactId)
            .map((g: any) => [g.contactId, { debt: toNumber(g._sum.debtAmountValue), revenue: 0, orders: 0 }]),
        );
        if (needsDebtFilter) {
          const debtIds = Array.from(debtByContact.keys());
          // Nếu đang tìm kiếm → giao 2 tập (vừa khớp tìm kiếm vừa còn công nợ).
          const finalIds = searchIds ? debtIds.filter((id) => searchIds!.includes(id)) : debtIds;
          where.id = { in: finalIds };
          if (finalIds.length === 0) {
            return { customers: [], total: 0, page: parseInt(page) || 1, limit: take };
          }
        }
      }

      let orderBy: any = [{ lastOrderDate: { sort: 'desc', nulls: 'last' } }, { fullName: 'asc' }];
      if (sort === 'name') orderBy = { fullName: 'asc' };
      else if (sort === 'newest') orderBy = { createdAt: 'desc' };
      else if (sort === 'rank') orderBy = [{ rankScore: { sort: 'desc', nulls: 'last' } }, { fullName: 'asc' }]; // PR4
      else if (sort === 'code') orderBy = { customerCode: { sort: 'asc', nulls: 'last' } }; // PR4
      // sort=debt + sort=revenue handled post-fetch below.

      // For debt-sort + revenue-sort we can't page in SQL (metric lives in
      // orders), so pull a wider window and slice in code. Otherwise page
      // normally in SQL.
      const needsRevenueSort = sort === 'revenue';
      const sqlSkip = needsDebtSort || needsRevenueSort ? 0 : skip;
      const sqlTake = needsDebtSort || needsRevenueSort ? 200 : take;

      const [rows, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          select: {
            id: true,
            fullName: true,
            phone: true,
            storeName: true,
            province: true,
            address: true,
            misaCustomerCode: true,
            customerCode: true,     // PR4
            customerRank: true,     // PR4
            rankScore: true,        // PR4
            birthday: true,         // PR4
            customerType: true,
            policyTier: true,
            stage: true,
            lastOrderDate: true,
            createdAt: true,
          },
          orderBy,
          skip: sqlSkip,
          take: sqlTake,
        }),
        prisma.contact.count({ where }),
      ]);

      // Aggregate revenue + debt for the contacts on this page.
      const pageIds = rows.map((c: any) => c.id);
      const revByContact = new Map<string, { revenue: number; orders: number; revenue60d: number }>();
      if (pageIds.length) {
        const revWhere: any = {
          orgId: user.orgId,
          contactId: { in: pageIds },
          status: { in: COUNTABLE_STATUSES },
        };
        const grouped: any[] = await prisma.order.groupBy({
          by: ['contactId'],
          where: revWhere,
          _sum: { totalAmountValue: true },
          _count: { id: true },
        });
        for (const g of grouped) {
          if (g.contactId) {
            revByContact.set(g.contactId, {
              revenue: toNumber(g._sum.totalAmountValue),
              orders: g._count.id,
              revenue60d: 0,
            });
          }
        }
        // PR4 — revenue 60 ngày (cùng status + cutoff order_date)
        const cutoff60d = new Date(Date.now() - 60 * 86400_000);
        const grouped60d: any[] = await prisma.order.groupBy({
          by: ['contactId'],
          where: { ...revWhere, orderDate: { gte: cutoff60d } },
          _sum: { totalAmountValue: true },
        });
        for (const g of grouped60d) {
          if (g.contactId) {
            const existing = revByContact.get(g.contactId) ?? { revenue: 0, orders: 0, revenue60d: 0 };
            existing.revenue60d = toNumber(g._sum.totalAmountValue);
            revByContact.set(g.contactId, existing);
          }
        }
        // Backfill debt for the page if we didn't already compute it globally.
        if (!debtByContact) {
          const debtWhere: any = {
            orgId: user.orgId,
            contactId: { in: pageIds },
            debtAmountValue: { gt: 0 },
            status: { notIn: ['cancelled'] },
          };
          const debtGrouped: any[] = await prisma.order.groupBy({
            by: ['contactId'],
            where: debtWhere,
            _sum: { debtAmountValue: true },
          });
          debtByContact = new Map(
            debtGrouped
              .filter((g: any) => g.contactId)
              .map((g: any) => [g.contactId, { debt: toNumber(g._sum.debtAmountValue), revenue: 0, orders: 0 }]),
          );
        }
      }

      let items = rows.map((c: any) => ({
        id: c.id,
        full_name: c.fullName,
        phone: c.phone,
        store_name: c.storeName,
        province: c.province,
        address: c.address,
        misa_customer_code: c.misaCustomerCode,
        customer_code: c.customerCode,           // PR4
        customer_rank: c.customerRank,           // PR4
        rank_score: c.rankScore == null ? null : toNumber(c.rankScore), // PR4
        birthday: c.birthday,                    // PR4
        customer_type: c.customerType,
        policy_tier: c.policyTier,
        stage: c.stage,
        last_order_date: c.lastOrderDate,
        total_revenue: revByContact.get(c.id)?.revenue ?? 0,
        revenue_60d: revByContact.get(c.id)?.revenue60d ?? 0, // PR4
        order_count: revByContact.get(c.id)?.orders ?? 0,
        debt: debtByContact?.get(c.id)?.debt ?? 0,
      }));

      let totalReturn = total;
      if (needsDebtSort) {
        items.sort((a: { debt: number }, b: { debt: number }) => b.debt - a.debt);
        totalReturn = items.length;
        items = items.slice(skip, skip + take);
      } else if (needsRevenueSort) {
        // PR4 — sort doanh số lifetime DESC, KH no-data xuống cuối (giống PR3.3)
        items.sort((a: { total_revenue: number }, b: { total_revenue: number }) => {
          const aHas = a.total_revenue > 0;
          const bHas = b.total_revenue > 0;
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
          return b.total_revenue - a.total_revenue;
        });
        totalReturn = items.length;
        items = items.slice(skip, skip + take);
      }

      return {
        customers: items,
        total: totalReturn,
        page: parseInt(page) || 1,
        limit: take,
      };
    } catch (err) {
      logger.error('[sale-app] customers list error:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách khách hàng' });
    }
  });

  // ── GET /api/v1/sale-app/customers/:id ─ detail + order history + stats ─
  // Member can only open contacts they're assigned to.
  app.get('/api/v1/sale-app/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };

      const where: any = { id, orgId: user.orgId };
      if (user.role === 'member') where.assignedUserId = user.id;

      const c: any = await prisma.contact.findFirst({
        where,
        select: {
          id: true,
          fullName: true,
          phone: true,
          storeName: true,
          province: true,
          address: true,
          misaCustomerCode: true,
          customerCode: true,    // PR4
          customerRank: true,    // PR4
          rankScore: true,       // PR4
          rankUpdatedAt: true,   // PR4
          birthday: true,        // PR4
          specialDates: true,    // PR4
          customerType: true,
          scale: true,
          policyTier: true,
          stage: true,
          source: true,
          notes: true,
          internalNote: true,
          rewardPoints: true,
          creditLimit: true,
          lastOrderDate: true,
          nextContactDate: true,
          createdAt: true,
          assignedUser: { select: { id: true, fullName: true } },
        },
      });
      if (!c) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

      // Order history (most recent 30) — scope already enforced via contactId.
      const orders: any[] = await prisma.order.findMany({
        where: { orgId: user.orgId, contactId: id },
        select: {
          id: true,
          orderCode: true,
          status: true,
          totalAmount: true,
          totalAmountValue: true,
          debtAmountValue: true,
          orderDate: true,
          createdAt: true,
        },
        orderBy: { orderDate: 'desc' },
        take: 30,
      });

      // Stats: revenue (countable only), order count, current debt, revenue 60d (PR4).
      const cutoff60d = new Date(Date.now() - 60 * 86400_000);
      const [revAgg, debtAgg, rev60dAgg] = await Promise.all([
        prisma.order.aggregate({
          where: { orgId: user.orgId, contactId: id, status: { in: COUNTABLE_STATUSES } },
          _sum: { totalAmountValue: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: {
            orgId: user.orgId,
            contactId: id,
            debtAmountValue: { gt: 0 },
            status: { notIn: ['cancelled'] },
          },
          _sum: { debtAmountValue: true },
          _count: { id: true },
        }),
        prisma.order.aggregate({
          where: {
            orgId: user.orgId,
            contactId: id,
            status: { in: COUNTABLE_STATUSES },
            orderDate: { gte: cutoff60d },
          },
          _sum: { totalAmountValue: true },
        }),
      ]);

      const revenue = toNumber(revAgg._sum.totalAmountValue);
      const orderCount = revAgg._count.id;

      return {
        customer: {
          id: c.id,
          full_name: c.fullName,
          phone: c.phone,
          store_name: c.storeName,
          province: c.province,
          address: c.address,
          misa_customer_code: c.misaCustomerCode,
          customer_type: c.customerType,
          scale: c.scale,
          policy_tier: c.policyTier,
          stage: c.stage,
          source: c.source,
          notes: c.notes,
          internal_note: c.internalNote,
          reward_points: c.rewardPoints,
          last_order_date: c.lastOrderDate,
          next_contact_date: c.nextContactDate,
          created_at: c.createdAt,
          credit_limit: c.creditLimit == null ? null : toNumber(c.creditLimit),
          assigned_user: c.assignedUser
            ? { id: c.assignedUser.id, name: c.assignedUser.fullName }
            : null,
          stats: {
            total_revenue: revenue,
            revenue_60d: toNumber(rev60dAgg._sum.totalAmountValue), // PR4
            order_count: orderCount,
            avg_order_value: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
            current_debt: toNumber(debtAgg._sum.debtAmountValue),
            debt_order_count: debtAgg._count.id,
          },
          orders: orders.map((o: any) => ({
            id: o.id,
            order_code: o.orderCode,
            status: o.status,
            total_amount: toNumber(o.totalAmountValue ?? o.totalAmount),
            debt_amount: toNumber(o.debtAmountValue),
            order_date: o.orderDate,
            created_at: o.createdAt,
          })),
        },
      };
    } catch (err) {
      logger.error('[sale-app] customers detail error:', err);
      return reply.status(500).send({ error: 'Lỗi tải chi tiết khách hàng' });
    }
  });

  // ── PUT /api/v1/sale-app/customers/:id ─ edit contact info ────────────
  // Member can only edit contacts they're assigned to. Only the B2B sales
  // fields exposed in the sale-app UI are editable here; nothing touches
  // pipeline stage, debt, or assignment.
  app.put('/api/v1/sale-app/customers/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        fullName?: string;
        phone?: string;
        storeName?: string;
        province?: string;
        address?: string;
        customerType?: string;
        policyTier?: string;
        notes?: string;
        internalNote?: string;
        creditLimit?: number | string | null;
      };

      const where: any = { id, orgId: user.orgId };
      if (user.role === 'member') where.assignedUserId = user.id;
      const existing = await prisma.contact.findFirst({ where, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

      const data: any = {};
      if (body.fullName !== undefined) {
        if (!body.fullName.trim()) return reply.status(400).send({ error: 'Tên khách hàng là bắt buộc' });
        data.fullName = body.fullName.trim();
      }
      if (body.phone !== undefined) {
        if (!body.phone.trim()) return reply.status(400).send({ error: 'Số điện thoại là bắt buộc' });
        data.phone = body.phone.trim();
      }
      if (body.storeName !== undefined) data.storeName = body.storeName?.trim() || null;
      if (body.province !== undefined) data.province = body.province?.trim() || null;
      if (body.address !== undefined) data.address = body.address?.trim() || null;
      if (body.customerType !== undefined) data.customerType = body.customerType?.trim() || null;
      if (body.policyTier !== undefined) data.policyTier = body.policyTier?.trim() || null;
      if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
      if (body.internalNote !== undefined) data.internalNote = body.internalNote?.trim() || null;
      if (body.creditLimit !== undefined) {
        data.creditLimit =
          body.creditLimit == null || body.creditLimit === ''
            ? null
            : Math.max(0, Math.round(Number(body.creditLimit)));
      }

      const updated = await prisma.contact.update({
        where: { id },
        data,
        select: {
          id: true,
          fullName: true,
          phone: true,
          storeName: true,
          province: true,
          address: true,
          customerType: true,
          policyTier: true,
          notes: true,
          internalNote: true,
          creditLimit: true,
        },
      });

      return {
        customer: {
          id: updated.id,
          full_name: updated.fullName,
          phone: updated.phone,
          store_name: updated.storeName,
          province: updated.province,
          address: updated.address,
          customer_type: updated.customerType,
          policy_tier: updated.policyTier,
          notes: updated.notes,
          internal_note: updated.internalNote,
          credit_limit: updated.creditLimit == null ? null : toNumber(updated.creditLimit),
        },
      };
    } catch (err) {
      logger.error('[sale-app] customers update error:', err);
      return reply.status(500).send({ error: 'Lỗi cập nhật khách hàng' });
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

  // ── GET /api/v1/sale-app/products ─ paginated catalog w/ filters+sort ─
  // Mặc định tier = "Đại lý cấp 2 (VIP)" (rẻ nhất). Trả wholesale +
  // retail + estimated_profit. KHÔNG trả cost_price (sensitive).
  // Filters: `low-stock` (stock <= warning), `near-expiry` (batch <90d),
  // `bestseller` (top sold tháng), `promotion` (stub — chưa engine).
  app.get('/api/v1/sale-app/products', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const {
        q = '',
        brand = '',
        filter = '',
        sort = 'name',
        page = '1',
        limit = '20',
        tier = DEFAULT_TIER,
      } = request.query as Record<string, string>;

      const tierName = TIER_NAME_MAP[tier] ?? TIER_NAME_MAP[DEFAULT_TIER];
      const take = Math.min(50, Math.max(1, parseInt(limit) || 20));
      const skip = (Math.max(1, parseInt(page) || 1) - 1) * take;

      const where: any = { orgId: user.orgId, status: 'active' };
      if (brand) where.brandId = brand;
      if (q.trim()) {
        const term = q.trim();
        where.OR = [
          { sku: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ];
      }

      // Filter chips
      if (filter === 'low-stock') {
        // Postgres has no two-column comparison in Prisma where; fetch
        // broader window and filter in code (acceptable at ~1k products).
        // For larger catalog → switch to $queryRaw with WHERE total_stock <= warning_stock.
      } else if (filter === 'near-expiry') {
        const cutoff = new Date(Date.now() + 90 * 86400_000);
        where.batches = {
          some: { status: 'active', currentQuantity: { gt: 0 }, expiryDate: { lt: cutoff } },
        };
      } else if (filter === 'bestseller') {
        // Resolved via a separate aggregation below — flag here so we
        // know to re-sort.
      } else if (filter === 'promotion') {
        // Stub for Phase 3.4 — return empty to avoid lying to UI.
        return { products: [], total: 0, page: parseInt(page) || 1, limit: take };
      }

      // Bestseller mode: pull top SKUs by month order qty first, then load.
      let bestsellerOrder: string[] | null = null;
      if (filter === 'bestseller') {
        const monthStart = startOfMonth(new Date());
        const orderWhere: any = {
          orgId: user.orgId,
          status: { in: COUNTABLE_STATUSES },
          orderDate: { gte: monthStart },
        };
        if (user.role === 'member') {
          orderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
        }
        const grouped: any[] = await prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: orderWhere, productId: { not: null } },
          _sum: { quantity: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: take * 3, // pre-fetch larger window since we still need to apply filters
        });
        bestsellerOrder = grouped.map((g: any) => g.productId).filter(Boolean);
        if (bestsellerOrder.length === 0) {
          return { products: [], total: 0, page: parseInt(page) || 1, limit: take };
        }
        where.id = { in: bestsellerOrder };
      }

      // Default sort
      let orderBy: any = { name: 'asc' };
      if (sort === 'newest') orderBy = { createdAt: 'desc' };
      else if (sort === 'stock') orderBy = { totalStock: 'desc' };
      // sort=price handled post-fetch (depends on tier-resolved price)

      const [rowsRaw, totalCount] = await Promise.all([
        prisma.product.findMany({
          where,
          select: {
            id: true, sku: true, name: true, unit: true, packageSize: true,
            mainImageUrl: true, totalStock: true, warningStock: true,
            createdAt: true,
            brand: { select: { id: true, name: true } },
            prices: {
              where: { active: true },
              select: { id: true, tierName: true, price: true, isDefault: true, displayOrder: true },
              orderBy: { displayOrder: 'asc' },
            },
            batches: {
              where: { status: 'active', currentQuantity: { gt: 0 } },
              select: { expiryDate: true },
              orderBy: { expiryDate: 'asc' },
              take: 1,
            },
          },
          orderBy,
          skip: filter === 'low-stock' || filter === 'bestseller' ? 0 : skip,
          take: filter === 'low-stock' || filter === 'bestseller' ? 200 : take,
        }),
        filter === 'low-stock' || filter === 'bestseller'
          ? Promise.resolve(0)
          : prisma.product.count({ where }),
      ]);

      let rows: any[] = rowsRaw;

      // Filter low-stock in code
      if (filter === 'low-stock') {
        rows = rows.filter((r: any) => (r.totalStock ?? 0) <= (r.warningStock ?? 0));
      }

      // Bestseller: preserve API ranking
      if (filter === 'bestseller' && bestsellerOrder) {
        const order = new Map<string, number>(bestsellerOrder.map((id, idx) => [id, idx]));
        rows.sort((a: any, b: any) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
      }

      // "Đại lý cấp 1" reference price — independent of the selected tier.
      const normalTierName = TIER_NAME_MAP[DEFAULT_TIER];

      const items = rows.map((p: any) => {
        const wholesalePick =
          p.prices.find((pr: any) => pr.tierName === tierName) ||
          p.prices.find((pr: any) => pr.isDefault) ||
          p.prices[0] ||
          null;
        const retailPick = p.prices.find((pr: any) => /lẻ|le|retail/i.test(pr.tierName ?? ''));
        const normalPick = p.prices.find((pr: any) => pr.tierName === normalTierName);
        const wholesale = wholesalePick ? toNumber(wholesalePick.price) : 0;
        const retail = retailPick ? toNumber(retailPick.price) : 0;
        const profit = retail > wholesale ? retail - wholesale : 0;
        const nearestExpiry = p.batches[0]?.expiryDate ?? null;
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          package_size: p.packageSize,
          mainImageUrl: p.mainImageUrl,
          brand: p.brand,
          stock: p.totalStock,
          warning_stock: p.warningStock,
          wholesale_price: wholesale,
          wholesale_tier: wholesalePick?.tierName ?? null,
          wholesale_price_tier_id: wholesalePick?.id ?? null,
          wholesale_normal_price: normalPick ? Math.round(toNumber(normalPick.price)) : 0,
          retail_price: retail,
          estimated_profit: profit,
          nearest_expiry: nearestExpiry,
          created_at: p.createdAt,
          revenue_30d: 0,
          quantity_30d: 0,
        };
      });

      // Sort by tier-resolved price if requested
      let sorted = items;
      if (sort === 'price') {
        sorted = [...items].sort((a, b) => a.wholesale_price - b.wholesale_price);
      }

      // Manual pagination for low-stock + bestseller modes
      let pageItems = sorted;
      let totalReturn = totalCount;
      if (filter === 'low-stock' || filter === 'bestseller') {
        totalReturn = sorted.length;
        pageItems = sorted.slice(skip, skip + take);
      }

      // ── 30-day sales (revenue + quantity), scope-aware, single groupBy ──
      // Only for the products actually on this page (after pagination), so
      // there's no N+1 and we don't aggregate rows we won't return.
      const pageProductIds = pageItems.map((it) => it.id);
      if (pageProductIds.length) {
        const since = new Date(Date.now() - 30 * 86400_000);
        const salesOrderWhere: any = {
          orgId: user.orgId,
          status: { in: COUNTABLE_STATUSES },
          orderDate: { gte: since },
        };
        if (user.role === 'member') {
          salesOrderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
        }
        const salesGrouped: any[] = await prisma.orderItem.groupBy({
          by: ['productId'],
          where: { order: salesOrderWhere, productId: { in: pageProductIds } },
          _sum: { lineTotal: true, quantity: true },
        });
        const salesMap = new Map<string, { revenue: number; quantity: number }>();
        for (const g of salesGrouped) {
          if (g.productId) {
            salesMap.set(g.productId, {
              revenue: Math.round(toNumber(g._sum.lineTotal)),
              quantity: g._sum.quantity ?? 0,
            });
          }
        }
        for (const it of pageItems) {
          const agg = salesMap.get(it.id);
          if (agg) {
            it.revenue_30d = agg.revenue;
            it.quantity_30d = agg.quantity;
          }
        }
      }

      return {
        products: pageItems,
        total: totalReturn,
        page: parseInt(page) || 1,
        limit: take,
        tier_name: tierName,
      };
    } catch (err) {
      logger.error('[sale-app] products list error:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh mục sản phẩm' });
    }
  });

  // ── GET /api/v1/sale-app/products/:id ─ detail ────────────────────────
  app.get('/api/v1/sale-app/products/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const { tier = DEFAULT_TIER } = request.query as { tier?: string };
      const tierName = TIER_NAME_MAP[tier] ?? TIER_NAME_MAP[DEFAULT_TIER];

      const p: any = await prisma.product.findFirst({
        where: { id, orgId: user.orgId },
        select: {
          id: true, sku: true, name: true, unit: true, packageSize: true,
          mainImageUrl: true, galleryUrls: true, marketingDocs: true, status: true,
          mainUse: true, targetAudience: true, usageMethod: true,
          shelfLifeMonths: true, registrationNumber: true,
          description: true, allowOversell: true,
          totalStock: true, warningStock: true, createdAt: true,
          brand: { select: { id: true, name: true } },
          prices: {
            where: { active: true },
            select: { id: true, tierName: true, price: true, isDefault: true, displayOrder: true },
            orderBy: { displayOrder: 'asc' },
          },
          batches: {
            where: { status: 'active' },
            select: {
              id: true, batchCode: true, currentQuantity: true,
              importQuantity: true, expiryDate: true, manufactureDate: true,
            },
            orderBy: { expiryDate: 'asc' },
          },
        },
      });
      if (!p) return reply.status(404).send({ error: 'Sản phẩm không tồn tại' });

      const wholesalePick =
        p.prices.find((pr: any) => pr.tierName === tierName) ||
        p.prices.find((pr: any) => pr.isDefault) ||
        p.prices[0] ||
        null;
      const retailPick = p.prices.find((pr: any) => /lẻ|le|retail/i.test(pr.tierName ?? ''));
      const wholesale = wholesalePick ? toNumber(wholesalePick.price) : 0;
      const retail = retailPick ? toNumber(retailPick.price) : 0;

      // Count orders last 30 days containing this SP (scope-aware).
      const since = new Date(Date.now() - 30 * 86400_000);
      const orderWhere: any = {
        orgId: user.orgId,
        status: { in: COUNTABLE_STATUSES },
        orderDate: { gte: since },
      };
      if (user.role === 'member') {
        orderWhere.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
      }
      const recent30d: any = await prisma.orderItem.aggregate({
        where: { order: orderWhere, productId: p.id },
        _sum: { quantity: true, lineTotal: true },
        _count: { id: true },
      });
      const revenue30d = Math.round(toNumber(recent30d._sum.lineTotal));

      // Marketing docs — backfill `category: null` for legacy docs.
      const marketingDocs = (Array.isArray(p.marketingDocs) ? p.marketingDocs : []).map((d: any) => ({
        id: d?.id ?? null,
        type: d?.type ?? null,
        category: d?.category ?? null,
        name: d?.name ?? null,
        driveUrl: d?.driveUrl ?? null,
        createdAt: d?.createdAt ?? null,
      }));

      return {
        product: {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          package_size: p.packageSize,
          mainImageUrl: p.mainImageUrl,
          galleryUrls: p.galleryUrls,
          marketingDocs,
          description: p.description,
          allow_oversell: p.allowOversell,
          revenue_30d: revenue30d,
          brand: p.brand,
          stock: p.totalStock,
          warning_stock: p.warningStock,
          shelf_life_months: p.shelfLifeMonths,
          registration_number: p.registrationNumber,
          main_use: p.mainUse,
          target_audience: p.targetAudience,
          usage_method: p.usageMethod,
          wholesale_price: wholesale,
          wholesale_tier: wholesalePick?.tierName ?? null,
          wholesale_price_tier_id: wholesalePick?.id ?? null,
          retail_price: retail,
          estimated_profit: retail > wholesale ? retail - wholesale : 0,
          tiers: p.prices.map((pr: any) => ({
            id: pr.id,
            name: pr.tierName,
            price: toNumber(pr.price),
            isDefault: pr.isDefault,
          })),
          batches: p.batches.map((b: any) => ({
            id: b.id,
            batch_code: b.batchCode,
            current_quantity: b.currentQuantity,
            import_quantity: b.importQuantity,
            expiry_date: b.expiryDate,
            manufacture_date: b.manufactureDate,
            days_until_expiry: b.expiryDate
              ? Math.floor((new Date(b.expiryDate).getTime() - Date.now()) / 86400_000)
              : null,
          })),
          stats: {
            quantity_sold_30d: recent30d._sum.quantity ?? 0,
            order_count_30d: recent30d._count.id,
          },
        },
      };
    } catch (err) {
      logger.error('[sale-app] products detail error:', err);
      return reply.status(500).send({ error: 'Lỗi tải chi tiết sản phẩm' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // REPORTS — sale-personal performance views.
  // Scope: member = own orders only (assignedSaleId OR createdByUserId).
  //         owner/admin = whole org. Cost fields never leak.
  // Period chip → [from, to) date range. "Trend" compares to immediately
  // preceding window of the same length.
  // ─────────────────────────────────────────────────────────────────────

  function periodRange(period: string): { from: Date; to: Date; prevFrom: Date; prevTo: Date; label: string } {
    const now = new Date();
    const today = startOfDay(now);
    let from: Date, to: Date, label: string;
    if (period === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      from = start;
      to = end;
      label = 'Tháng trước';
    } else if (period === '90d') {
      from = new Date(today.getTime() - 90 * 86400_000);
      to = new Date(today.getTime() + 86400_000);
      label = '90 ngày';
    } else if (period === 'ytd') {
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today.getTime() + 86400_000);
      label = 'YTD';
    } else {
      // default: this_month
      from = startOfMonth(today);
      to = new Date(today.getTime() + 86400_000);
      label = 'Tháng này';
    }
    const span = to.getTime() - from.getTime();
    const prevTo = new Date(from);
    const prevFrom = new Date(from.getTime() - span);
    return { from, to, prevFrom, prevTo, label };
  }

  function scopedOrderWhere(user: { id: string; orgId: string; role: string }) {
    const base: any = { orgId: user.orgId, status: { in: COUNTABLE_STATUSES } };
    if (user.role === 'member') {
      base.OR = [{ assignedSaleId: user.id }, { createdByUserId: user.id }];
    }
    return base;
  }

  // ── GET /api/v1/sale-app/reports/summary ──────────────────────────────
  app.get('/api/v1/sale-app/reports/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { period = 'this_month' } = request.query as { period?: string };
      const { from, to, prevFrom, prevTo, label } = periodRange(period);

      const baseWhere = scopedOrderWhere(user);
      const curWhere = { ...baseWhere, orderDate: { gte: from, lt: to } };
      const prevWhere = { ...baseWhere, orderDate: { gte: prevFrom, lt: prevTo } };

      const [cur, prev, curCustomers, prevCustomers] = await Promise.all([
        prisma.order.aggregate({ where: curWhere, _sum: { totalAmount: true }, _count: { id: true } }),
        prisma.order.aggregate({ where: prevWhere, _sum: { totalAmount: true }, _count: { id: true } }),
        prisma.order.findMany({ where: curWhere, select: { contactId: true }, distinct: ['contactId'] }),
        prisma.order.findMany({ where: prevWhere, select: { contactId: true }, distinct: ['contactId'] }),
      ]);

      const revenue = Math.round(cur._sum.totalAmount ?? 0);
      const orderCount = cur._count.id;
      const avgOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;
      const customerCount = curCustomers.length;

      const prevRevenue = Math.round(prev._sum.totalAmount ?? 0);
      const prevOrderCount = prev._count.id;
      const prevAvg = prevOrderCount > 0 ? Math.round(prevRevenue / prevOrderCount) : 0;
      const prevCustomerCount = prevCustomers.length;

      const pct = (cur: number, prev: number): number | null => {
        if (prev === 0) return cur === 0 ? 0 : null; // null = "N/A" (chia 0)
        return Math.round(((cur - prev) / prev) * 1000) / 10;
      };

      return {
        period: { key: period, label, from, to },
        kpi: {
          revenue: { value: revenue, prev: prevRevenue, trend_pct: pct(revenue, prevRevenue) },
          order_count: { value: orderCount, prev: prevOrderCount, trend_pct: pct(orderCount, prevOrderCount) },
          avg_order_value: { value: avgOrderValue, prev: prevAvg, trend_pct: pct(avgOrderValue, prevAvg) },
          active_customers: { value: customerCount, prev: prevCustomerCount, trend_pct: pct(customerCount, prevCustomerCount) },
        },
      };
    } catch (err) {
      logger.error('[sale-app] reports/summary error:', err);
      return reply.status(500).send({ error: 'Lỗi tải báo cáo tổng quan' });
    }
  });

  // ── GET /api/v1/sale-app/reports/revenue-trend ────────────────────────
  // Aggregates orders into day/week/month buckets. Returns dense series
  // (zero-filled) so the chart has consistent X-axis.
  app.get('/api/v1/sale-app/reports/revenue-trend', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { period = 'this_month', groupBy = 'day' } = request.query as { period?: string; groupBy?: string };
      const { from, to } = periodRange(period);

      const baseWhere = scopedOrderWhere(user);
      const rows: any[] = await prisma.order.findMany({
        where: { ...baseWhere, orderDate: { gte: from, lt: to } },
        select: { orderDate: true, totalAmount: true },
      });

      // Bucket-by helper.
      const bucketKey = (d: Date): string => {
        if (groupBy === 'month') {
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        if (groupBy === 'week') {
          const monday = startOfWeek(d);
          return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };

      const buckets = new Map<string, { revenue: number; order_count: number }>();
      for (const r of rows) {
        if (!r.orderDate) continue;
        const k = bucketKey(r.orderDate);
        const b = buckets.get(k) ?? { revenue: 0, order_count: 0 };
        b.revenue += Math.round(r.totalAmount ?? 0);
        b.order_count += 1;
        buckets.set(k, b);
      }

      // Build zero-filled series across the period for consistent X-axis.
      const series: Array<{ bucket: string; revenue: number; order_count: number }> = [];
      const cursor = new Date(from);
      while (cursor < to) {
        const k = bucketKey(cursor);
        const b = buckets.get(k) ?? { revenue: 0, order_count: 0 };
        series.push({ bucket: k, ...b });
        if (groupBy === 'month') {
          cursor.setMonth(cursor.getMonth() + 1);
        } else if (groupBy === 'week') {
          cursor.setDate(cursor.getDate() + 7);
        } else {
          cursor.setDate(cursor.getDate() + 1);
        }
        // Dedup: skip if same bucket key emitted twice (week boundary)
        if (series.length > 1 && series[series.length - 1].bucket === series[series.length - 2].bucket) {
          series.pop();
        }
        if (series.length > 400) break; // safety cap
      }

      return { series, group_by: groupBy };
    } catch (err) {
      logger.error('[sale-app] reports/revenue-trend error:', err);
      return reply.status(500).send({ error: 'Lỗi tải biểu đồ doanh thu' });
    }
  });

  // ── GET /api/v1/sale-app/reports/top-customers ────────────────────────
  app.get('/api/v1/sale-app/reports/top-customers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { period = 'this_month', limit = '10' } = request.query as { period?: string; limit?: string };
      const take = Math.min(50, Math.max(1, parseInt(limit) || 10));
      const { from, to } = periodRange(period);

      const baseWhere = scopedOrderWhere(user);
      const grouped: any[] = await prisma.order.groupBy({
        by: ['contactId'],
        where: { ...baseWhere, orderDate: { gte: from, lt: to } },
        _sum: { totalAmount: true },
        _count: { id: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take,
      });

      if (grouped.length === 0) return { customers: [] };

      const ids = grouped.map((g: any) => g.contactId);
      const contacts = await prisma.contact.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          fullName: true,
          storeName: true,
          phone: true,
          province: true,
          customerType: true,
          policyTier: true,
          lastOrderDate: true,
        },
      });
      const cmap = new Map<string, any>(contacts.map((c: any) => [c.id, c]));

      const customers = grouped.map((g: any) => {
        const c = cmap.get(g.contactId);
        return {
          id: g.contactId,
          full_name: c?.fullName ?? '—',
          store_name: c?.storeName ?? null,
          phone: c?.phone ?? null,
          province: c?.province ?? null,
          customer_type: c?.customerType ?? null,
          policy_tier: c?.policyTier ?? null,
          last_order_date: c?.lastOrderDate ?? null,
          revenue: Math.round(g._sum.totalAmount ?? 0),
          order_count: g._count.id,
        };
      });

      return { customers };
    } catch (err) {
      logger.error('[sale-app] reports/top-customers error:', err);
      return reply.status(500).send({ error: 'Lỗi tải top khách hàng' });
    }
  });

  // ── GET /api/v1/sale-app/reports/sku-mix ──────────────────────────────
  // Aggregate line_total by brand (default) or product. Used for "Cơ cấu
  // doanh số theo brand/SP" horizontal bar widget.
  app.get('/api/v1/sale-app/reports/sku-mix', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { period = 'this_month', groupBy = 'brand', limit = '10' } = request.query as {
        period?: string;
        groupBy?: string;
        limit?: string;
      };
      const take = Math.min(30, Math.max(1, parseInt(limit) || 10));
      const { from, to } = periodRange(period);

      const orderWhere = scopedOrderWhere(user);
      // Build items query — only line_total + productId join for brand.
      const items: any[] = await prisma.orderItem.findMany({
        where: {
          productId: { not: null },
          order: { ...orderWhere, orderDate: { gte: from, lt: to } },
        },
        select: {
          quantity: true,
          lineTotal: true,
          product: { select: { id: true, sku: true, name: true, brand: { select: { id: true, name: true } } } },
        },
      });

      // Group in code (Prisma groupBy can't join + sum together cleanly).
      const grouped = new Map<string, { key: string; label: string; revenue: number; quantity: number }>();
      for (const it of items) {
        let key: string, label: string;
        if (groupBy === 'product') {
          key = it.product?.id ?? 'unknown';
          label = it.product?.name ?? '—';
        } else {
          key = it.product?.brand?.id ?? 'no_brand';
          label = it.product?.brand?.name ?? 'Chưa gắn brand';
        }
        const g = grouped.get(key) ?? { key, label, revenue: 0, quantity: 0 };
        g.revenue += Math.round(it.lineTotal ?? 0);
        g.quantity += Number(it.quantity ?? 0);
        grouped.set(key, g);
      }

      const arr = Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
      const total = arr.reduce((s, g) => s + g.revenue, 0);
      const topItems = arr.slice(0, take).map((g) => ({
        ...g,
        share_pct: total > 0 ? Math.round((g.revenue / total) * 1000) / 10 : 0,
      }));

      return { items: topItems, total_revenue: total, group_by: groupBy };
    } catch (err) {
      logger.error('[sale-app] reports/sku-mix error:', err);
      return reply.status(500).send({ error: 'Lỗi tải cơ cấu doanh số' });
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
        shippingFee?: number;
        paidAmount?: number;
        debtTermDays?: number;
        note?: string;
        source?: string;
        orderDate?: string;
        status?: string;
        recipientName?: string;
        recipientPhone?: string;
        deliveryAddress?: string;
        needsVatInvoice?: boolean;
        invoiceBuyerType?: string;
        invoiceBuyerName?: string;
        invoiceTaxCode?: string;
        invoiceAddress?: string;
        invoiceEmail?: string;
        saveInvoiceToCustomer?: boolean;
        assignedSaleId?: string;
        referrerName?: string;
      };

      if (!body.contactId) return reply.status(400).send({ error: 'Vui lòng chọn khách hàng' });
      if (!body.items?.length) return reply.status(400).send({ error: 'Vui lòng chọn ít nhất 1 sản phẩm' });

      // Phí ship / trả trước: số tiền VND, không âm. Mặc định 0.
      const shippingFee = Math.max(0, Math.round(toNumber(body.shippingFee ?? 0)));
      const paidAmount = Math.max(0, Math.round(toNumber(body.paidAmount ?? 0)));
      if (!Number.isFinite(shippingFee)) return reply.status(400).send({ error: 'Phí ship không hợp lệ' });
      if (!Number.isFinite(paidAmount)) return reply.status(400).send({ error: 'Số tiền trả trước không hợp lệ' });

      // Công nợ: bắt buộc có hạn nợ (số ngày) khi chọn thanh toán "credit".
      // Lưu tạm = đơn nháp (chưa tính doanh thu); Xác nhận = chốt.
      const orderStatus = body.status === 'draft' ? 'draft' : 'confirmed';
      const isCredit = body.paymentMethod === 'credit';
      const debtTermDays = Math.max(0, Math.floor(toNumber(body.debtTermDays ?? 0)));
      // Đơn nháp cho phép thiếu hạn nợ (điền sau khi chốt).
      if (orderStatus !== 'draft' && isCredit && debtTermDays <= 0) {
        return reply.status(400).send({ error: 'Đơn công nợ cần nhập số ngày cho nợ' });
      }

      // Hóa đơn VAT: giá đã gồm VAT nên KHÔNG tính thêm tiền — chỉ lưu thông tin
      // người mua để phát hành HĐ. Doanh nghiệp (HKD/Công ty) bắt buộc có MST.
      const needsVatInvoice = body.needsVatInvoice === true;
      const str = (v?: string) => (v && v.trim() ? v.trim() : null);
      const invoice = needsVatInvoice
        ? {
            invoiceBuyerType: str(body.invoiceBuyerType),
            invoiceBuyerName: str(body.invoiceBuyerName),
            invoiceTaxCode: str(body.invoiceTaxCode),
            invoiceAddress: str(body.invoiceAddress),
            invoiceEmail: str(body.invoiceEmail),
          }
        : { invoiceBuyerType: null, invoiceBuyerName: null, invoiceTaxCode: null, invoiceAddress: null, invoiceEmail: null };
      if (
        needsVatInvoice &&
        (invoice.invoiceBuyerType === 'cong_ty' || invoice.invoiceBuyerType === 'ho_kinh_doanh') &&
        !invoice.invoiceTaxCode
      ) {
        return reply.status(400).send({ error: 'Hộ kinh doanh / Công ty cần nhập Mã số thuế để xuất hóa đơn' });
      }

      // Verify contact + products belong to this org
      const contact = await prisma.contact.findFirst({
        where: { id: body.contactId, orgId: user.orgId },
        select: { id: true, assignedUserId: true, address: true },
      });
      if (!contact) return reply.status(404).send({ error: 'Khách hàng không tồn tại' });

      // Nhân viên sale: ưu tiên lựa chọn từ form (nếu hợp lệ trong org) → NV phụ
      // trách cũ của KH (lịch sử) → NV đang đăng nhập (khách mới chưa có NV).
      let assignedSaleId = contact.assignedUserId ?? user.id;
      if (body.assignedSaleId) {
        const staff = await prisma.user.findFirst({
          where: { id: body.assignedSaleId, orgId: user.orgId, isActive: true },
          select: { id: true },
        });
        if (!staff) return reply.status(400).send({ error: 'Nhân viên sale không hợp lệ' });
        assignedSaleId = staff.id;
      }
      const referrerName = str(body.referrerName);

      const productIds = body.items.map((it) => it.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, orgId: user.orgId },
        select: { id: true, sku: true, name: true, unit: true, costPrice: true, totalStock: true, allowOversell: true },
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
        // Bán sỉ cho phép bán trước/đặt hàng: mọi vai trò (kể cả sale) đều chốt
        // được đơn vượt tồn. Giỏ hàng đã cảnh báo "Hết hàng/Vượt tồn" cho sale.
      }

      const orderCode = await generateOrderCode(user.orgId);
      const now = new Date();
      const orderDate = body.orderDate ? new Date(body.orderDate) : now;
      // Hạn trả nợ = ngày đơn + số ngày cho nợ (chỉ áp dụng đơn công nợ).
      const debtDueDate = isCredit
        ? new Date(orderDate.getTime() + debtTermDays * 86400000)
        : null;

      // Single transaction: create order shell + all items, then recompute totals.
      const created = await prisma.$transaction(async (tx: any) => {
        const order = await tx.order.create({
          data: {
            orgId: user.orgId,
            contactId: contact.id,
            createdByUserId: user.id,
            orderCode,
            status: orderStatus,
            orderDate,
            confirmedAt: orderStatus === 'confirmed' ? now : null,
            assignedSaleId,
            referrerName,
            source: body.source ?? 'sale_app',
            shippingMethod: body.shippingMethod ?? null,
            paymentMethod: body.paymentMethod ?? null,
            shippingFee,
            debtDueDate,
            deliveryAddress: body.deliveryAddress ?? contact.address ?? null,
            recipientName: body.recipientName ?? null,
            recipientPhone: body.recipientPhone ?? null,
            needsVatInvoice,
            ...invoice,
            internalNote: body.note ?? null,
            totalAmount: 0,
            subtotalAmount: 0,
            totalAmountValue: 0,
            discountAmount: 0,
            paidAmount,
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

      // Lưu hồ sơ HĐ làm mặc định cho KH (đơn sau tự điền sẵn) khi sale chọn.
      if (needsVatInvoice && body.saveInvoiceToCustomer === true) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { ...invoice },
        });
      }

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

  // ── GET /api/v1/sale-app/leaderboard ──────────────────────────────────
  // Gamification: bảng xếp hạng sale theo doanh số + số đơn trong kỳ.
  // Mọi user đã đăng nhập đều xem được toàn đội (KHÔNG gate role).
  // period=week → từ đầu tuần đến nay; month (mặc định) → từ đầu tháng đến nay.
  // Doanh số dùng totalAmountValue (số CÓ VAT) — fallback totalAmount nếu null.
  app.get('/api/v1/sale-app/leaderboard', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { period = 'month' } = request.query as { period?: string };
      const now = new Date();
      const isWeek = period === 'week';
      const from = isWeek ? startOfWeek(now) : startOfMonth(now);
      const periodKey = isWeek ? 'week' : 'month';
      const periodLabel = isWeek ? 'Tuần này' : 'Tháng này';

      // Toàn đội: mọi user active trong org (member/admin/owner).
      const users = await prisma.user.findMany({
        where: { orgId: user.orgId, isActive: true },
        select: { id: true, fullName: true },
      });

      // Đơn trong kỳ, scope toàn org, chỉ status tính doanh số.
      const orders: Array<{ assignedSaleId: string | null; totalAmount: number; totalAmountValue: unknown }> =
        await prisma.order.findMany({
          where: {
            orgId: user.orgId,
            status: { in: COUNTABLE_STATUSES },
            orderDate: { gte: from, lte: now },
          },
          select: { assignedSaleId: true, totalAmount: true, totalAmountValue: true },
        });

      // Gom doanh số + số đơn theo assignedSaleId.
      const agg = new Map<string, { revenue: number; order_count: number }>();
      for (const o of orders) {
        if (!o.assignedSaleId) continue;
        const a = agg.get(o.assignedSaleId) ?? { revenue: 0, order_count: 0 };
        a.revenue += toNumber(o.totalAmountValue ?? o.totalAmount);
        a.order_count += 1;
        agg.set(o.assignedSaleId, a);
      }

      // Map về từng user (không có đơn → revenue 0, order_count 0).
      type LbRow = { sale_id: string; name: string; revenue: number; order_count: number };
      const rowsRaw: LbRow[] = users.map((u: { id: string; fullName: string | null }) => {
        const a = agg.get(u.id) ?? { revenue: 0, order_count: 0 };
        return {
          sale_id: u.id,
          name: u.fullName ?? '—',
          revenue: Math.round(a.revenue),
          order_count: a.order_count,
        };
      });

      // Xếp hạng: revenue desc → order_count desc → tên A→Z.
      rowsRaw.sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        if (b.order_count !== a.order_count) return b.order_count - a.order_count;
        return a.name.localeCompare(b.name, 'vi');
      });

      let meRank: number | null = null;
      const rows = rowsRaw.map((r: LbRow, i: number) => {
        const rank = i + 1;
        const is_me = r.sale_id === user.id;
        if (is_me) meRank = rank;
        return { rank, ...r, is_me };
      });

      return { period: periodKey, period_label: periodLabel, rows, me_rank: meRank };
    } catch (err) {
      logger.error('[sale-app] leaderboard error:', err);
      return reply.status(500).send({ error: 'Lỗi tải bảng xếp hạng' });
    }
  });
}
