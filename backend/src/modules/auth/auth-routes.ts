/**
 * Auth routes — setup, login, and profile endpoints.
 * Registered as a Fastify plugin via app.register(authRoutes).
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from './auth-middleware.js';
import {
  checkSetupStatus,
  setup,
  login,
  getProfile,
} from './auth-service.js';
import { uploadToStorage } from '../../shared/storage/supabase-storage.js';
import { logger } from '../../shared/utils/logger.js';

const PROFILE_IMAGE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/setup/status — check if first-run setup is needed
  app.get('/api/v1/setup/status', async () => {
    return checkSetupStatus();
  });

  // POST /api/v1/setup — create org + owner user, return JWT
  app.post<{
    Body: { orgName: string; fullName: string; email: string; password: string };
  }>('/api/v1/setup', async (request, reply) => {
    const { orgName, fullName, email, password } = request.body;
    if (!orgName || !fullName || !email || !password) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }
    const payload = await setup(orgName, fullName, email, password);
    const token = app.jwt.sign(payload, { expiresIn: '7d' });
    return { token, user: payload };
  });

  // POST /api/v1/auth/login — verify credentials, return JWT
  app.post<{
    Body: { email: string; password: string; rememberMe?: boolean };
  }>('/api/v1/auth/login', async (request, reply) => {
    const { email, password, rememberMe = false } = request.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'Missing email or password' });
    }
    const payload = await login(email, password);
    // Phiên thường chỉ dùng trong phiên trình duyệt; "ghi nhớ" được giữ tối đa 30 ngày.
    // Client quyết định localStorage/sessionStorage, server vẫn phải giới hạn tuổi JWT.
    const token = app.jwt.sign(payload, { expiresIn: rememberMe ? '30d' : '12h' });
    return { token, user: payload };
  });

  // GET /api/v1/profile — return current user (requires auth)
  app.get('/api/v1/profile', { preHandler: authMiddleware }, async (request) => {
    const user = request.user as { id: string; email: string; role: string; orgId: string };
    return getProfile(user.id);
  });

  // POST /api/v1/profile/avatar — upload ảnh đại diện của chính user đang đăng nhập.
  app.post('/api/v1/profile/avatar', { preHandler: authMiddleware }, async (request, reply) => {
    try {
      const user = request.user as { id: string };
      const file = await (request as any).file({
        limits: { files: 1, fileSize: MAX_PROFILE_IMAGE_BYTES },
      });

      if (!file) {
        return reply.status(400).send({ error: 'Vui lòng chọn ảnh đại diện' });
      }

      const mime = String(file.mimetype || '').toLowerCase();
      if (!PROFILE_IMAGE_MIMES.has(mime)) {
        return reply.status(400).send({ error: 'Ảnh đại diện chỉ hỗ trợ JPG, PNG hoặc WEBP' });
      }

      const buffer = await file.toBuffer();
      if (!buffer.length) {
        return reply.status(400).send({ error: 'File ảnh trống' });
      }
      if (buffer.length > MAX_PROFILE_IMAGE_BYTES) {
        return reply.status(413).send({ error: 'Ảnh đại diện không được vượt quá 5MB' });
      }

      const url = await uploadToStorage(buffer, mime, 'avatars', user.id);
      return reply.status(201).send({ url });
    } catch (error: any) {
      const statusCode = Number(error?.statusCode) || 500;
      logger.error(`[profile-avatar] upload failed: ${error?.message || error}`);
      return reply.status(statusCode).send({
        error: statusCode === 500 ? 'Không thể tải ảnh đại diện' : error.message,
      });
    }
  });
}
