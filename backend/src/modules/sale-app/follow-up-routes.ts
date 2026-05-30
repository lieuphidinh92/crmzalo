/**
 * Sale Lite app — "Khách cần chăm sóc" (follow-up) module.
 *
 * Mounted under /api/v1/sale-app/follow-up/* alongside the other sale-app
 * endpoints. Shares the same JWT auth.
 *
 *  GET /api/v1/sale-app/follow-up/customers
 *      → đại lý có lastOrderDate cách hôm nay > 30 ngày, nguội nhất xếp đầu.
 *
 * Quy tắc:
 *   - Ngưỡng CỨNG 30 ngày (khác module Resale dùng goals cấu hình được).
 *   - Chỉ tính KH ĐÃ TỪNG mua (lastOrderDate != null). KH chưa từng mua
 *     không phải "cần chăm sóc lại" nên bỏ qua (CEO ưu tiên nhóm đã nguội).
 *   - daysSinceLastOrder tính theo timezone Asia/Ho_Chi_Minh (so theo
 *     mốc đầu ngày VN để số ngày ổn định, không nhảy theo giờ chạy).
 *   - Member chỉ thấy KH của mình (Contact.assignedUserId = user.id);
 *     admin/owner thấy toàn org.
 *   - Money integer. Response trả thẳng object, không envelope.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { toNumber, reqUser } from '../orders/order-service.js';

const COUNTABLE_STATUSES = ['confirmed', 'packing', 'shipping', 'completed', 'shipped', 'paid'];

const FOLLOW_UP_DAYS = 30;

// Số ms trong 1 ngày.
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Đầu ngày hôm nay" theo giờ Việt Nam (UTC+7), trả về dưới dạng Date (UTC).
 * Dùng làm mốc chuẩn để tính daysSinceLastOrder ổn định bất kể giờ chạy.
 */
function startOfTodayVN(): Date {
  const now = new Date();
  // Dời sang giờ VN, lấy mốc nửa đêm, rồi dời ngược về UTC.
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnMidnightUtcMs = Date.UTC(
    vnNow.getUTCFullYear(),
    vnNow.getUTCMonth(),
    vnNow.getUTCDate(),
  );
  return new Date(vnMidnightUtcMs - 7 * 60 * 60 * 1000);
}

/** Số ngày trọn vẹn kể từ lastOrderDate đến đầu ngày hôm nay (giờ VN). */
function daysSince(lastOrderDate: Date, todayStartVN: Date): number {
  const diff = todayStartVN.getTime() - lastOrderDate.getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

export async function followUpRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/sale-app/follow-up/customers ──────────────────────────
  app.get(
    '/api/v1/sale-app/follow-up/customers',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = reqUser(request);
        const { limit = '100' } = request.query as { limit?: string };
        const take = Math.min(300, Math.max(1, parseInt(limit) || 100));

        const todayStartVN = startOfTodayVN();
        // Mốc cắt: lastOrderDate trước thời điểm này = đã nguội > 30 ngày.
        const cutoff = new Date(todayStartVN.getTime() - FOLLOW_UP_DAYS * DAY_MS);

        const where: any = {
          orgId: user.orgId,
          lastOrderDate: { not: null, lt: cutoff },
        };
        // Member chỉ thấy KH được giao cho mình; admin/owner thấy toàn org.
        if (user.role === 'member') where.assignedUserId = user.id;

        const contacts = await prisma.contact.findMany({
          where,
          select: {
            id: true,
            fullName: true,
            phone: true,
            zaloUid: true,
            storeName: true,
            province: true,
            customerType: true,
            policyTier: true,
            lastOrderDate: true,
          },
          // Nguội nhất (lastOrderDate nhỏ nhất) lên đầu.
          orderBy: { lastOrderDate: 'asc' },
          take,
        });

        if (contacts.length === 0) {
          return { customers: [], total: 0 };
        }

        // Tổng đã mua (doanh thu lifetime, chỉ đơn countable) cho các KH này.
        const ids = contacts.map((c: any) => c.id);
        const grouped: any[] = await prisma.order.groupBy({
          by: ['contactId'],
          where: {
            orgId: user.orgId,
            contactId: { in: ids },
            status: { in: COUNTABLE_STATUSES },
          },
          _sum: { totalAmountValue: true },
          _count: { id: true },
        });
        const revByContact = new Map<string, { revenue: number; orders: number }>();
        for (const g of grouped) {
          if (g.contactId) {
            revByContact.set(g.contactId, {
              revenue: toNumber(g._sum.totalAmountValue),
              orders: g._count.id,
            });
          }
        }

        const customers = contacts.map((c: any) => ({
          id: c.id,
          full_name: c.fullName,
          phone: c.phone,
          zalo_uid: c.zaloUid,
          store_name: c.storeName,
          province: c.province,
          customer_type: c.customerType,
          policy_tier: c.policyTier,
          last_order_date: c.lastOrderDate,
          days_since_last_order: daysSince(c.lastOrderDate, todayStartVN),
          total_revenue: revByContact.get(c.id)?.revenue ?? 0,
          order_count: revByContact.get(c.id)?.orders ?? 0,
        }));

        return { customers, total: customers.length, threshold_days: FOLLOW_UP_DAYS };
      } catch (err) {
        logger.error('[sale-app] follow-up/customers error:', err);
        return reply.status(500).send({ error: 'Lỗi tải khách cần chăm sóc' });
      }
    },
  );
}
