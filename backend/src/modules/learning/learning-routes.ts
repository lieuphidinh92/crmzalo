/**
 * learning-routes.ts — Học tập & Phát triển REST API.
 *
 * User-facing
 *   GET    /api/v1/learning/modules?type=required|optional|completed
 *   GET    /api/v1/learning/stats
 *   POST   /api/v1/learning/track-progress    body: { moduleId }
 *   POST   /api/v1/learning/complete          body: { moduleId, score? }
 *
 * Admin-facing
 *   GET    /api/v1/learning/admin/modules     full list incl. inactive
 *   POST   /api/v1/learning/admin/modules
 *   PUT    /api/v1/learning/admin/modules/:id
 *   DELETE /api/v1/learning/admin/modules/:id (soft = active=false)
 *   GET    /api/v1/learning/admin/team-progress
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { ensureLearningModulesSeeded } from './learning-seeds.js';
import {
  completeModule,
  createModule,
  deactivateModule,
  getStatsForUser,
  getTeamProgress,
  listModulesForAdmin,
  listModulesForUser,
  trackProgress,
  updateModule,
  type ModuleInput,
  type ModuleType,
} from './learning-service.js';
import { getCadenceTargets } from '../cadence/cadence-targets-service.js';

export async function learningRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Seed sample modules on first request per org. Cheap idempotent check.
  app.addHook('preHandler', async (request) => {
    const orgId = request.user?.orgId;
    if (!orgId) return;
    if (!request.url.startsWith('/api/v1/learning')) return;
    await ensureLearningModulesSeeded(orgId);
  });

  // ── User: list modules ───────────────────────────────────────────────
  app.get<{ Querystring: { type?: string } }>(
    '/api/v1/learning/modules',
    async (request) => {
      const { orgId, id: userId, role } = request.user!;
      const filter = (request.query.type ?? 'required') as
        | ModuleType
        | 'completed';
      const modules = await listModulesForUser(orgId, userId, role, filter);
      return { modules };
    },
  );

  // ── User: stats for header ───────────────────────────────────────────
  app.get('/api/v1/learning/stats', async (request) => {
    const { orgId, id: userId, role } = request.user!;
    const targets = await getCadenceTargets(orgId);
    const weeklyTarget =
      role === 'member'
        ? targets.member.learning
        : targets.admin?.learning ?? targets.member.learning;
    const stats = await getStatsForUser(orgId, userId, role, weeklyTarget);
    return { stats };
  });

  // ── User: track progress (heartbeat) ─────────────────────────────────
  app.post<{ Body: { moduleId?: string } }>(
    '/api/v1/learning/track-progress',
    async (request, reply) => {
      const { id: userId } = request.user!;
      const moduleId = request.body?.moduleId?.trim();
      if (!moduleId) {
        return reply.status(400).send({ error: 'Cần moduleId' });
      }
      await trackProgress(userId, moduleId);
      return { success: true };
    },
  );

  // ── User: mark complete ──────────────────────────────────────────────
  app.post<{ Body: { moduleId?: string; score?: number } }>(
    '/api/v1/learning/complete',
    async (request, reply) => {
      const { orgId, id: userId } = request.user!;
      const moduleId = request.body?.moduleId?.trim();
      if (!moduleId) {
        return reply.status(400).send({ error: 'Cần moduleId' });
      }
      const rawScore = request.body?.score;
      const score =
        typeof rawScore === 'number' && rawScore >= 1 && rawScore <= 5
          ? Math.round(rawScore)
          : null;
      try {
        const progress = await completeModule({ userId, orgId, moduleId, score });
        return { progress };
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Lỗi đánh dấu hoàn thành' });
      }
    },
  );

  // ── Admin: list all modules ──────────────────────────────────────────
  app.get(
    '/api/v1/learning/admin/modules',
    { preHandler: requireRole('owner', 'admin') },
    async (request) => {
      const { orgId } = request.user!;
      const modules = await listModulesForAdmin(orgId);
      return { modules };
    },
  );

  // ── Admin: create module ─────────────────────────────────────────────
  app.post<{ Body: ModuleInput }>(
    '/api/v1/learning/admin/modules',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId } = request.user!;
      try {
        const created = await createModule(orgId, request.body ?? ({} as ModuleInput));
        return reply.status(201).send(created);
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Lỗi tạo module' });
      }
    },
  );

  // ── Admin: update module ─────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: ModuleInput }>(
    '/api/v1/learning/admin/modules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId } = request.user!;
      try {
        const updated = await updateModule(
          orgId,
          request.params.id,
          request.body ?? ({} as ModuleInput),
        );
        return updated;
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Lỗi cập nhật module' });
      }
    },
  );

  // ── Admin: soft delete (active=false) ────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/api/v1/learning/admin/modules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId } = request.user!;
      try {
        const updated = await deactivateModule(orgId, request.params.id);
        return updated;
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Lỗi xoá module' });
      }
    },
  );

  // ── Admin: team progress report ──────────────────────────────────────
  app.get(
    '/api/v1/learning/admin/team-progress',
    { preHandler: requireRole('owner', 'admin') },
    async (request) => {
      const { orgId } = request.user!;
      return getTeamProgress(orgId);
    },
  );
}
