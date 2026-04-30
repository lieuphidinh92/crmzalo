/**
 * task-routes.ts — Việc cần làm REST API.
 *
 * Endpoints
 *   GET    /api/v1/task-categories
 *   GET    /api/v1/tasks                  list with filters
 *   GET    /api/v1/tasks/today            top-priority for dashboard
 *   GET    /api/v1/tasks/cadence-progress weekly cadence by category
 *   GET    /api/v1/tasks/:id              detail (with contact snapshot)
 *   POST   /api/v1/tasks                  manual create
 *   PUT    /api/v1/tasks/:id/done         mark done + completion note
 *   PUT    /api/v1/tasks/:id/snooze       reschedule
 *   PUT    /api/v1/tasks/:id/skip         skip with reason
 *
 *   GET    /api/v1/recurring-task-rules   admin list
 *   PUT    /api/v1/recurring-task-rules/:id (admin)
 *   GET    /api/v1/auto-task-rules        admin list
 *   PUT    /api/v1/auto-task-rules/:id    (admin)
 *   POST   /api/v1/tasks/_run-generator   debug (admin) — runs cron 1 now
 *   POST   /api/v1/tasks/_run-auto        debug (admin) — runs cron 2 now
 *
 * Caller scoping: every list/detail endpoint scopes by orgId AND
 * assignedToId = caller. Mutations also require the task to belong to
 * the caller (admins/owners can mutate anyone's tasks).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { ensureCategoriesSeeded, ensureRulesSeededForOrg } from './task-seeds.js';
import {
  createTask,
  getCadenceProgress,
  getTaskDetail,
  getTodayTopTasks,
  listTasks,
  markDone,
  skipTask,
  snoozeTask,
  type ListPeriod,
  type TaskSource,
  type TaskStatus,
} from './task-service.js';
import { taskCronInternals } from './task-cron.js';

type Q = Record<string, string>;

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Seed-on-first-use: cheap idempotent check on every request — this is
  // a 1-row count under the hood after first run.
  app.addHook('preHandler', async (request) => {
    const orgId = request.user?.orgId;
    if (!orgId) return;
    // Run only on tasks-related routes to avoid touching DB on every request.
    if (!request.url.startsWith('/api/v1/tasks') &&
        !request.url.startsWith('/api/v1/task-categories') &&
        !request.url.startsWith('/api/v1/recurring-task-rules') &&
        !request.url.startsWith('/api/v1/auto-task-rules')) return;
    await ensureRulesSeededForOrg(orgId);
  });

  // ── Categories ────────────────────────────────────────────────────
  app.get('/api/v1/task-categories', async () => {
    await ensureCategoriesSeeded();
    const cats = await prisma.taskCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return { categories: cats };
  });

  // ── List ─────────────────────────────────────────────────────────
  app.get('/api/v1/tasks', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    const q = request.query as Q;
    const period = (q.period ?? 'today') as ListPeriod;
    const result = await listTasks(orgId, id, {
      period,
      categoryIds: parseCsv(q.category),
      statuses: parseCsv(q.status) as TaskStatus[] | undefined,
      sources: parseCsv(q.source) as TaskSource[] | undefined,
    });
    return result;
  });

  // ── Today top 5 (dashboard) ──────────────────────────────────────
  app.get('/api/v1/tasks/today', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    const tasks = await getTodayTopTasks(orgId, id, 5);
    return { tasks };
  });

  // ── Cadence (dashboard) ──────────────────────────────────────────
  app.get('/api/v1/tasks/cadence-progress', async (request: FastifyRequest) => {
    const { orgId, id } = request.user!;
    const rows = await getCadenceProgress(orgId, id);
    return { rows };
  });

  // ── Detail ───────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/api/v1/tasks/:id',
    async (request, reply) => {
      const { orgId, id: userId, role } = request.user!;
      const task = await getTaskDetail(orgId, request.params.id);
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      if (role === 'member' && task.assignedToId !== userId) {
        return reply.status(403).send({ error: 'Bạn chỉ xem được task của mình' });
      }
      return task;
    },
  );

  // ── Create manual ────────────────────────────────────────────────
  app.post<{
    Body: {
      categoryId: string;
      contactId?: string;
      title: string;
      description?: string;
      dueDate: string; // 'YYYY-MM-DD'
      dueTime?: string;
      priority?: number;
      assignedToId?: string; // admin can assign to others
    };
  }>('/api/v1/tasks', async (request, reply) => {
    const { orgId, id: userId, role } = request.user!;
    const body = request.body;
    if (!body.categoryId || !body.title || !body.dueDate) {
      return reply.status(400).send({
        error: 'Cần categoryId, title và dueDate',
      });
    }
    const assignTo =
      body.assignedToId && role !== 'member' ? body.assignedToId : userId;
    try {
      const task = await createTask({
        orgId,
        assignedToId: assignTo,
        categoryId: body.categoryId,
        contactId: body.contactId ?? null,
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
        dueDate: new Date(body.dueDate + 'T00:00:00'),
        dueTime: body.dueTime ?? null,
        priority: body.priority ?? 2,
      });
      return reply.status(201).send(task);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message ?? 'Create failed' });
    }
  });

  // ── Mark done ────────────────────────────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { completionNote?: string; metadataPatch?: Record<string, unknown> };
  }>('/api/v1/tasks/:id/done', async (request, reply) => {
    const { orgId, id: userId } = request.user!;
    try {
      const updated = await markDone(
        orgId,
        request.params.id,
        userId,
        request.body?.completionNote ?? null,
        request.body?.metadataPatch,
      );
      return updated;
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── Snooze ───────────────────────────────────────────────────────
  app.put<{
    Params: { id: string };
    Body: { newDue: string; newTime?: string | null };
  }>('/api/v1/tasks/:id/snooze', async (request, reply) => {
    const { orgId } = request.user!;
    const body = request.body ?? ({} as { newDue?: string });
    if (!body.newDue) {
      return reply.status(400).send({ error: 'Cần newDue (YYYY-MM-DD)' });
    }
    try {
      const updated = await snoozeTask(
        orgId,
        request.params.id,
        new Date(body.newDue + 'T00:00:00'),
        body.newTime ?? null,
      );
      return updated;
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── Skip ─────────────────────────────────────────────────────────
  app.put<{ Params: { id: string }; Body: { reason: string } }>(
    '/api/v1/tasks/:id/skip',
    async (request, reply) => {
      const { orgId } = request.user!;
      const reason = request.body?.reason?.trim();
      if (!reason) {
        return reply.status(400).send({ error: 'Cần lý do bỏ qua' });
      }
      try {
        const updated = await skipTask(orgId, request.params.id, reason);
        return updated;
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({ error: err.message });
      }
    },
  );

  // ── Recurring rules CRUD ─────────────────────────────────────────
  app.get('/api/v1/recurring-task-rules', async (request) => {
    const { orgId } = request.user!;
    const rules = await prisma.recurringTaskRule.findMany({
      where: { orgId },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return { rules };
  });

  app.put<{
    Params: { id: string };
    Body: Partial<{
      name: string;
      description: string;
      cronExpression: string;
      appliesToRole: string;
      defaultQuantity: number;
      active: boolean;
    }>;
  }>(
    '/api/v1/recurring-task-rules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId, id: userId } = request.user!;
      const existing = await prisma.recurringTaskRule.findFirst({
        where: { id: request.params.id, orgId },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Rule not found' });
      const updated = await prisma.recurringTaskRule.update({
        where: { id: request.params.id },
        data: { ...request.body, createdBy: userId },
        include: { category: true },
      });
      return updated;
    },
  );

  // ── Auto rules CRUD ──────────────────────────────────────────────
  app.get('/api/v1/auto-task-rules', async (request) => {
    const { orgId } = request.user!;
    const rules = await prisma.autoTaskRule.findMany({
      where: { orgId },
      include: { category: true },
      orderBy: { triggerType: 'asc' },
    });
    return { rules };
  });

  app.put<{
    Params: { id: string };
    Body: Partial<{
      triggerCondition: Record<string, unknown>;
      dueInHours: number;
      messageTemplate: string;
      active: boolean;
    }>;
  }>(
    '/api/v1/auto-task-rules/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { orgId } = request.user!;
      const existing = await prisma.autoTaskRule.findFirst({
        where: { id: request.params.id, orgId },
        select: { id: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Rule not found' });
      const data: any = { ...request.body };
      const updated = await prisma.autoTaskRule.update({
        where: { id: request.params.id },
        data,
        include: { category: true },
      });
      return updated;
    },
  );

  // ── Manual cron triggers (admin debug) ───────────────────────────
  app.post(
    '/api/v1/tasks/_run-generator',
    { preHandler: requireRole('owner', 'admin') },
    async () => {
      await taskCronInternals.runRecurringGenerator();
      return { success: true };
    },
  );
  app.post(
    '/api/v1/tasks/_run-auto',
    { preHandler: requireRole('owner', 'admin') },
    async () => {
      await taskCronInternals.runAutoTriggers();
      return { success: true };
    },
  );
}
