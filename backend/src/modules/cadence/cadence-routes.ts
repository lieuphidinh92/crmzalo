/**
 * cadence-routes.ts — Cadence settings extras NOT covered by the
 * existing /api/v1/recurring-task-rules + /api/v1/auto-task-rules
 * endpoints (which already live in the tasks module).
 *
 *   GET  /api/v1/cadence/targets                  (authed)
 *   PUT  /api/v1/cadence/targets                  (admin)
 *   POST /api/v1/cadence/recurring-rules/:id/test (admin) — preview
 *   POST /api/v1/cadence/validate-cron            (admin) — quick check
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { createTask } from '../tasks/task-service.js';
import {
  DEFAULT_TARGETS,
  getCadenceTargets,
  setCadenceTargets,
  type CadenceTargets,
} from './cadence-targets-service.js';
import { validateCron } from './cron-validate.js';

export async function cadenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Targets ──────────────────────────────────────────────────────────
  app.get('/api/v1/cadence/targets', async (request) => {
    const { orgId } = request.user!;
    const targets = await getCadenceTargets(orgId);
    return { targets, defaults: DEFAULT_TARGETS };
  });

  app.put<{ Body: Partial<CadenceTargets> }>(
    '/api/v1/cadence/targets',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId } = request.user!;
      try {
        const updated = await setCadenceTargets(orgId, request.body ?? {});
        return { targets: updated };
      } catch (err: any) {
        return reply
          .status(err.statusCode ?? 500)
          .send({ error: err.message ?? 'Lỗi cập nhật target' });
      }
    },
  );

  // ── Cron validate ────────────────────────────────────────────────────
  app.post<{ Body: { expression?: string } }>(
    '/api/v1/cadence/validate-cron',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const expr = request.body?.expression?.trim();
      if (!expr) {
        return reply.status(400).send({ error: 'Cần expression' });
      }
      const result = validateCron(expr);
      if (!result.valid) {
        return reply.status(400).send({ error: result.error });
      }
      return { valid: true, nextRuns: result.nextRuns };
    },
  );

  // ── Test rule (preview) ──────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/v1/cadence/recurring-rules/:id/test',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId, id: userId } = request.user!;
      const rule = await prisma.recurringTaskRule.findFirst({
        where: { id: request.params.id, orgId },
        include: { category: true },
      });
      if (!rule) {
        return reply.status(404).send({ error: 'Rule không tồn tại' });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const task = await createTask({
        orgId,
        assignedToId: userId,
        categoryId: rule.categoryId,
        title: `[TEST] ${rule.name}`,
        description: rule.description ?? null,
        dueDate: today,
        priority: 2,
        metadata: { test: true, ruleId: rule.id },
      });
      return { task };
    },
  );
}
