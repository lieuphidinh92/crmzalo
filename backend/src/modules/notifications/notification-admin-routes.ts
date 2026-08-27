/**
 * notification-admin-routes.ts — xem nhật ký gửi + gửi thử.
 *
 * Có 2 endpoint vì không có 2 cái này thì không thể "chứng minh nó chạy"
 * (RULE 4): cron chỉ nổ lúc 10:00/16:00, ngồi chờ để test là vô lý.
 * Chỉ owner/admin — nội dung log có tên khách và số tiền.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { runVatPendingDigest } from '../orders/vat-notify-cron.js';
import { getVatPendingDigest } from '../orders/vat-digest.js';
import { runRetrySweep } from './notification-retry-cron.js';
import { describeChannels } from './notification-config.js';

const adminOnly = { preHandler: requireRole('owner', 'admin') };

export async function notificationAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/notifications/logs — nhật ký gửi ────────────────────────
  app.get('/api/v1/notifications/logs', adminOnly, async (request: FastifyRequest) => {
    const user = request.user!;
    const q = request.query as Partial<{ status: string; event: string; limit: string }>;
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '50') || 50));

    const logs = await prisma.notificationLog.findMany({
      where: {
        orgId: user.orgId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.event ? { event: q.event } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, event: true, audience: true, channel: true, dedupeKey: true,
        title: true, status: true, attempts: true, lastError: true,
        sentAt: true, nextRetryAt: true, createdAt: true,
      },
    });
    return { logs };
  });

  // ── GET /api/v1/notifications/vat-preview — xem trước, KHÔNG gửi gì ───────
  // Trả kèm `channels`: kênh nào SẴN SÀNG, kênh nào bị bỏ qua vì lý do gì.
  // Đây là cách kiểm biến môi trường trên Render ngay sau khi dán, khỏi phải
  // chờ tới 10:00 mới biết gõ sai (im vì lỗi cấu hình trông y hệt im vì không
  // có đơn nào chờ).
  app.get('/api/v1/notifications/vat-preview', adminOnly, async (request: FastifyRequest) => {
    const user = request.user!;
    const [digest, channels] = await Promise.all([
      getVatPendingDigest(user.orgId),
      describeChannels(user.orgId, 'ACCOUNTING'),
    ]);
    return { digest, channels };
  });

  // ── POST /api/v1/notifications/test — gửi thử ngay ─────────────────────
  // Dùng khoá chống trùng riêng ('manual-<timestamp>') nên bấm thử KHÔNG làm
  // mất tin 10:00/16:00 thật.
  app.post('/api/v1/notifications/test', adminOnly, async (request: FastifyRequest) => {
    const user = request.user!;
    logger.info(`[notify] Gửi thử VAT_PENDING do ${user.email ?? user.id} yêu cầu`);
    const results = await runVatPendingDigest('manual');
    return { results };
  });

  // ── POST /api/v1/notifications/retry-now — chạy vòng gửi lại ngay ───────
  app.post('/api/v1/notifications/retry-now', adminOnly, async () => {
    return { retried: await runRetrySweep() };
  });
}
