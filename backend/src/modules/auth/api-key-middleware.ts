/**
 * Mã API cấp cho từng nhân viên — xác thực qua header `X-Api-Key`.
 *
 * KHÔNG thay thế và KHÔNG sửa `authMiddleware` (JWT): web CRM + sale-app vẫn
 * đăng nhập như cũ. Middleware này chỉ dùng cho namespace riêng `/api/ext/v1/*`
 * dành cho app do nhân viên tự viết (anh Philip chốt 21/8/2026 — Đức tự làm
 * app quản lý khách của Đức).
 *
 * Nguyên tắc bảo mật:
 *   - Mã gốc KHÔNG lưu trong DB, chỉ lưu SHA-256. Mất mã → cấp lại, không tra được.
 *   - Phạm vi dữ liệu khoá theo `userId` của mã, KHÔNG theo role. Đức là admin
 *     nhưng mã của Đức vẫn chỉ thấy khách được gán cho Đức.
 *   - Mã sai và mã đã thu hồi trả CÙNG 1 thông báo — không tiết lộ mã có tồn tại.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

/** Tiền tố để nhìn bằng mắt là biết mã của hệ thống này. */
export const API_KEY_PREFIX = 'halo_';

/**
 * Phạm vi mã. Đợt 1 chỉ có quyền ĐỌC khách của chính mình.
 * Đợt 2 sẽ thêm `own_customers_write` (tạo/sửa khách, ghi nhật ký chăm sóc).
 */
export const API_SCOPE_READ = 'own_customers_read';
export const API_SCOPE_WRITE = 'own_customers_write';

export interface ApiKeyContext {
  keyId: string;
  orgId: string;
  /** Nhân viên sở hữu mã — mọi truy vấn phải lọc theo đúng id này. */
  userId: string;
  userFullName: string;
  scope: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    apiKeyCtx?: ApiKeyContext;
  }
}

export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Sinh mã mới. Trả về mã gốc (chỉ hiện 1 lần cho anh copy) + 8 ký tự đầu
 * để nhận diện trên UI + hash để lưu DB.
 */
export function generateApiKey(): { raw: string; keyPrefix: string; keyHash: string } {
  // 24 byte ngẫu nhiên → 32 ký tự base64url (an toàn khi dán vào header/URL).
  const secret = randomBytes(24).toString('base64url');
  const raw = `${API_KEY_PREFIX}${secret}`;
  return { raw, keyPrefix: secret.slice(0, 8), keyHash: hashApiKey(raw) };
}

// App của nhân viên có thể gọi liên tục — không ghi DB mỗi request, chỉ cập
// nhật "lần dùng cuối" khi mốc cũ đã hơn 1 phút.
const LAST_USED_THROTTLE_MS = 60_000;

export async function apiKeyMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers['x-api-key'];
  const raw = (Array.isArray(header) ? header[0] : header)?.trim() ?? '';
  if (!raw) {
    return reply.status(401).send({ error: 'Thiếu mã API — gửi kèm header X-Api-Key' });
  }

  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    select: {
      id: true,
      orgId: true,
      userId: true,
      scope: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { fullName: true, isActive: true } },
    },
  });

  if (!key || key.revokedAt) {
    return reply.status(401).send({ error: 'Mã API không hợp lệ hoặc đã bị thu hồi' });
  }
  if (!key.user?.isActive) {
    return reply.status(403).send({ error: 'Nhân viên sở hữu mã này đã bị vô hiệu hoá' });
  }

  request.apiKeyCtx = {
    keyId: key.id,
    orgId: key.orgId,
    userId: key.userId,
    userFullName: key.user.fullName,
    scope: key.scope,
  };

  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    // Fire-and-forget: lỗi ghi mốc thời gian không được làm fail request của app.
    prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((err: unknown) => logger.error('Không ghi được lastUsedAt cho mã API:', err));
  }
}

/**
 * Chặn khi mã không đủ phạm vi. Đợt 1 mọi endpoint đều là đọc nên chỉ cần
 * `API_SCOPE_READ`; đợt 2 endpoint ghi sẽ gọi `requireApiScope(API_SCOPE_WRITE)`.
 */
export function requireApiScope(...allowed: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = request.apiKeyCtx;
    if (!ctx) {
      return reply.status(401).send({ error: 'Thiếu mã API' });
    }
    // Mã có quyền ghi thì đương nhiên đọc được.
    const effective =
      ctx.scope === API_SCOPE_WRITE ? [API_SCOPE_WRITE, API_SCOPE_READ] : [ctx.scope];
    if (!allowed.some((s) => effective.includes(s))) {
      return reply.status(403).send({ error: 'Mã API không có quyền cho thao tác này' });
    }
  };
}
