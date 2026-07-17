/**
 * PR2 — Care log + stats cho từng KH.
 *
 * GET    /api/v1/contacts/:id/care-logs              list (desc by careAt)
 * POST   /api/v1/contacts/:id/care-logs              create
 * PUT    /api/v1/contacts/:id/care-logs/:logId       edit (note + careAt + type)
 * DELETE /api/v1/contacts/:id/care-logs/:logId       remove
 * GET    /api/v1/contacts/:id/stats                  doanh số + lợi nhuận (lifetime + 60d)
 *
 * Member chỉ thấy/sửa care log của KH được gán cho mình. Owner/admin
 * thấy tất. Profit ẩn cho member (mirror với contact list endpoint).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

const VALID_TYPES = ['call', 'zalo', 'visit', 'sms', 'other'] as const;
type CareType = (typeof VALID_TYPES)[number];

function isValidType(v: unknown): v is CareType {
  return typeof v === 'string' && (VALID_TYPES as readonly string[]).includes(v);
}

async function loadContactScoped(
  orgId: string,
  contactId: string,
  user: { id: string; role: string },
): Promise<{ ok: true; assignedUserId: string | null } | { ok: false; status: number; error: string }> {
  const c = await prisma.contact.findFirst({
    where: { id: contactId, orgId },
    select: { id: true, assignedUserId: true },
  });
  if (!c) return { ok: false, status: 404, error: 'Contact not found' };
  if (user.role === 'member' && c.assignedUserId && c.assignedUserId !== user.id) {
    return { ok: false, status: 403, error: 'Bạn chỉ được thao tác trên KH được phân công' };
  }
  return { ok: true, assignedUserId: c.assignedUserId };
}

export async function contactCareRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── List care logs ────────────────────────────────────────────────────────
  app.get('/api/v1/contacts/:id/care-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const scope = await loadContactScoped(user.orgId, id, user);
      if (!scope.ok) return reply.status(scope.status).send({ error: scope.error });

      const logs = await prisma.contactCareLog.findMany({
        where: { contactId: id, orgId: user.orgId },
        include: { createdBy: { select: { id: true, fullName: true } } },
        orderBy: { careAt: 'desc' },
      });
      return { careLogs: logs };
    } catch (err) {
      logger.error('[care-logs] list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch care logs' });
    }
  });

  // ── Create ────────────────────────────────────────────────────────────────
  app.post('/api/v1/contacts/:id/care-logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { type?: string; note?: string; careAt?: string };

      const scope = await loadContactScoped(user.orgId, id, user);
      if (!scope.ok) return reply.status(scope.status).send({ error: scope.error });

      if (!isValidType(body.type)) {
        return reply.status(400).send({
          error: `type phải là 1 trong: ${VALID_TYPES.join(', ')}`,
        });
      }
      const careAt = body.careAt ? new Date(body.careAt) : new Date();
      if (Number.isNaN(careAt.getTime())) {
        return reply.status(400).send({ error: 'careAt không hợp lệ' });
      }

      const log = await prisma.contactCareLog.create({
        data: {
          orgId: user.orgId,
          contactId: id,
          type: body.type,
          note: body.note?.trim() || null,
          careAt,
          createdByUserId: user.id,
        },
        include: { createdBy: { select: { id: true, fullName: true } } },
      });
      return reply.status(201).send(log);
    } catch (err) {
      logger.error('[care-logs] create error:', err);
      return reply.status(500).send({ error: 'Failed to create care log' });
    }
  });

  // ── Update ────────────────────────────────────────────────────────────────
  app.put('/api/v1/contacts/:id/care-logs/:logId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id, logId } = request.params as { id: string; logId: string };
      const body = request.body as { type?: string; note?: string; careAt?: string };

      const scope = await loadContactScoped(user.orgId, id, user);
      if (!scope.ok) return reply.status(scope.status).send({ error: scope.error });

      const existing = await prisma.contactCareLog.findFirst({
        where: { id: logId, contactId: id, orgId: user.orgId },
        select: { id: true, createdByUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Care log not found' });

      // Member chỉ được sửa log do chính mình tạo. Owner/admin sửa được tất.
      if (user.role === 'member' && existing.createdByUserId !== user.id) {
        return reply.status(403).send({ error: 'Bạn chỉ được sửa log do mình tạo' });
      }

      const data: any = {};
      if (body.type !== undefined) {
        if (!isValidType(body.type)) {
          return reply.status(400).send({ error: `type phải là 1 trong: ${VALID_TYPES.join(', ')}` });
        }
        data.type = body.type;
      }
      if (body.note !== undefined) data.note = body.note?.trim() || null;
      if (body.careAt !== undefined) {
        const d = new Date(body.careAt);
        if (Number.isNaN(d.getTime())) {
          return reply.status(400).send({ error: 'careAt không hợp lệ' });
        }
        data.careAt = d;
      }

      const updated = await prisma.contactCareLog.update({
        where: { id: logId },
        data,
        include: { createdBy: { select: { id: true, fullName: true } } },
      });
      return updated;
    } catch (err) {
      logger.error('[care-logs] update error:', err);
      return reply.status(500).send({ error: 'Failed to update care log' });
    }
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  app.delete('/api/v1/contacts/:id/care-logs/:logId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id, logId } = request.params as { id: string; logId: string };

      const scope = await loadContactScoped(user.orgId, id, user);
      if (!scope.ok) return reply.status(scope.status).send({ error: scope.error });

      const existing = await prisma.contactCareLog.findFirst({
        where: { id: logId, contactId: id, orgId: user.orgId },
        select: { id: true, createdByUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Care log not found' });
      if (user.role === 'member' && existing.createdByUserId !== user.id) {
        return reply.status(403).send({ error: 'Bạn chỉ được xoá log do mình tạo' });
      }

      await prisma.contactCareLog.delete({ where: { id: logId } });
      return { success: true };
    } catch (err) {
      logger.error('[care-logs] delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete care log' });
    }
  });

  // ── Per-contact stats: doanh số / lợi nhuận lifetime + 60d ────────────────
  app.get('/api/v1/contacts/:id/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const scope = await loadContactScoped(user.orgId, id, user);
      if (!scope.ok) return reply.status(scope.status).send({ error: scope.error });

      // 1 raw query — mirror với customer-rank-service để KH thấy số khớp.
      const rows = await prisma.$queryRaw<Array<{
        revenue_60d: number;
        profit_60d: number;
        revenue_lifetime: number;
        profit_lifetime: number;
        order_count_lifetime: number;
        last_order_at: Date | null;
      }>>(Prisma.sql`
        SELECT
          COALESCE(SUM(COALESCE(o.total_amount_value::float, o.total_amount)) FILTER (
            WHERE o.order_date >= NOW() - INTERVAL '60 days'
              AND o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
          ), 0)::float AS revenue_60d,
          COALESCE(SUM(oi.profit::float) FILTER (
            WHERE o.order_date >= NOW() - INTERVAL '60 days'
              AND o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
              AND oi.profit IS NOT NULL
          ), 0)::float AS profit_60d,
          COALESCE(SUM(COALESCE(o.total_amount_value::float, o.total_amount)) FILTER (
            WHERE o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
          ), 0)::float AS revenue_lifetime,
          COALESCE(SUM(oi.profit::float) FILTER (
            WHERE o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
              AND oi.profit IS NOT NULL
          ), 0)::float AS profit_lifetime,
          COUNT(DISTINCT o.id) FILTER (
            WHERE o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
          )::int AS order_count_lifetime,
          MAX(o.order_date) FILTER (
            WHERE o.status IN ('confirmed','packing','shipping','completed','shipped','paid')
          ) AS last_order_at
        FROM contacts c
        LEFT JOIN orders o ON o.contact_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE c.id = ${id}
      `);
      const r = rows[0] ?? {
        revenue_60d: 0,
        profit_60d: 0,
        revenue_lifetime: 0,
        profit_lifetime: 0,
        order_count_lifetime: 0,
        last_order_at: null,
      };

      const canSeeProfit = user.role === 'owner' || user.role === 'admin';
      return {
        revenueLifetime: r.revenue_lifetime,
        revenue60d: r.revenue_60d,
        profitLifetime: canSeeProfit ? r.profit_lifetime : null,
        profit60d: canSeeProfit ? r.profit_60d : null,
        orderCountLifetime: r.order_count_lifetime,
        lastOrderAt: r.last_order_at,
      };
    } catch (err) {
      logger.error('[contact-stats] error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact stats' });
    }
  });
}
