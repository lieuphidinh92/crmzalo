/**
 * Sale Lite app — dedicated POS endpoints separate from the main CRM API.
 *
 * Mounted under /api/v1/sale-app/* so it stays decoupled from /orders,
 * /contacts, /products which are tuned for the desktop CRM. Auth + JWT
 * are shared with the CRM (same token).
 *
 *  GET  /api/v1/sale-app/home-stats              → today/week/month + 5 recent
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
