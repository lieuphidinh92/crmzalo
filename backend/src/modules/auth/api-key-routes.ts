/**
 * Quản lý mã API của nhân viên — dành cho anh Philip (owner/admin) ở tab
 * "Mã API" trong Cài đặt. Route này dùng JWT như mọi trang CRM khác.
 *
 *   GET    /api/v1/api-keys            danh sách mã (KHÔNG bao giờ trả mã gốc)
 *   POST   /api/v1/api-keys            cấp mã mới → trả mã gốc ĐÚNG 1 LẦN
 *   DELETE /api/v1/api-keys/:id        thu hồi mã (không xoá, giữ vết audit)
 *
 * Endpoint mà app của nhân viên gọi nằm ở `modules/external/ext-customer-routes.ts`.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { authMiddleware } from './auth-middleware.js';
import { requireRole } from './role-middleware.js';
import { generateApiKey, API_SCOPE_READ, API_SCOPE_WRITE } from './api-key-middleware.js';

/** Chặn tạo mã tràn lan: tối đa 5 mã còn hiệu lực cho 1 nhân viên. */
const MAX_ACTIVE_KEYS_PER_USER = 5;

const adminOnly = { preHandler: requireRole('owner', 'admin') };

export async function apiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/api-keys ─ danh sách mã của công ty ─────────────────────
  app.get('/api/v1/api-keys', adminOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const keys = await prisma.apiKey.findMany({
        where: { orgId: user.orgId },
        orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scope: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true, role: true } },
        },
      });
      return { apiKeys: keys };
    } catch (err) {
      logger.error('GET /api/v1/api-keys lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách mã API' });
    }
  });

  // ── POST /api/v1/api-keys ─ cấp mã mới ──────────────────────────────────
  app.post('/api/v1/api-keys', adminOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentUser = request.user!;
      const body = (request.body ?? {}) as { userId?: string; name?: string; scope?: string };

      const name = (body.name ?? '').trim();
      if (!name) return reply.status(400).send({ error: 'Thiếu tên mã (ví dụ: App khách hàng của Đức)' });
      if (name.length > 60) return reply.status(400).send({ error: 'Tên mã tối đa 60 ký tự' });
      if (!body.userId) return reply.status(400).send({ error: 'Chưa chọn nhân viên nhận mã' });

      // Đợt 1 chỉ cấp mã ĐỌC. Đợt 2 mở ghi thì bỏ chặn này.
      const scope = body.scope ?? API_SCOPE_READ;
      if (scope !== API_SCOPE_READ) {
        return reply
          .status(400)
          .send({ error: 'Hiện chỉ cấp được mã CHỈ ĐỌC. Quyền ghi sẽ mở ở đợt sau.' });
      }

      // Nhân viên phải thuộc đúng công ty và đang hoạt động.
      const target = await prisma.user.findFirst({
        where: { id: body.userId, orgId: currentUser.orgId },
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      });
      if (!target) return reply.status(404).send({ error: 'Không tìm thấy nhân viên này' });
      if (!target.isActive) return reply.status(400).send({ error: 'Nhân viên này đã nghỉ — không cấp mã' });

      const activeCount = await prisma.apiKey.count({
        where: { orgId: currentUser.orgId, userId: target.id, revokedAt: null },
      });
      if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
        return reply.status(400).send({
          error: `${target.fullName} đã có ${activeCount} mã còn hiệu lực. Thu hồi mã cũ trước khi cấp mã mới.`,
        });
      }

      const { raw, keyPrefix, keyHash } = generateApiKey();
      const created = await prisma.apiKey.create({
        data: {
          orgId: currentUser.orgId,
          userId: target.id,
          name,
          keyPrefix,
          keyHash,
          scope,
          createdByUserId: currentUser.id,
        },
        select: { id: true, name: true, keyPrefix: true, scope: true, createdAt: true },
      });

      // Vết audit: ai cấp mã cho ai (mã API là chìa khoá dữ liệu khách).
      try {
        await prisma.activityLog.create({
          data: {
            orgId: currentUser.orgId,
            userId: currentUser.id,
            action: 'api_key_created',
            entityType: 'api_key',
            entityId: created.id,
            details: {
              name,
              keyPrefix,
              scope,
              targetUserId: target.id,
              targetUserName: target.fullName,
              createdByRole: currentUser.role,
            },
          },
        });
      } catch (logErr) {
        logger.error('Không ghi được activity log khi cấp mã API:', logErr);
      }

      // `key` là mã gốc — trả về ĐÚNG 1 LẦN, không log, không lưu.
      return {
        apiKey: { ...created, user: { id: target.id, fullName: target.fullName, email: target.email, role: target.role } },
        key: raw,
        warning:
          'Mã này chỉ hiện 1 lần. Copy gửi cho nhân viên ngay. Đóng cửa sổ là không xem lại được — mất thì thu hồi và cấp mã mới.',
      };
    } catch (err) {
      logger.error('POST /api/v1/api-keys lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi cấp mã API' });
    }
  });

  // ── DELETE /api/v1/api-keys/:id ─ thu hồi ───────────────────────────────
  app.delete('/api/v1/api-keys/:id', adminOnly, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const currentUser = request.user!;
      const { id } = request.params as { id: string };

      const key = await prisma.apiKey.findFirst({
        where: { id, orgId: currentUser.orgId },
        select: { id: true, name: true, keyPrefix: true, revokedAt: true, userId: true },
      });
      if (!key) return reply.status(404).send({ error: 'Không tìm thấy mã API' });
      if (key.revokedAt) return reply.status(400).send({ error: 'Mã này đã bị thu hồi trước đó' });

      await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });

      try {
        await prisma.activityLog.create({
          data: {
            orgId: currentUser.orgId,
            userId: currentUser.id,
            action: 'api_key_revoked',
            entityType: 'api_key',
            entityId: key.id,
            details: { name: key.name, keyPrefix: key.keyPrefix, targetUserId: key.userId },
          },
        });
      } catch (logErr) {
        logger.error('Không ghi được activity log khi thu hồi mã API:', logErr);
      }

      return { success: true };
    } catch (err) {
      logger.error('DELETE /api/v1/api-keys/:id lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi thu hồi mã API' });
    }
  });
}

// Giữ export để đợt 2 dùng khi mở quyền ghi.
export { API_SCOPE_WRITE };
