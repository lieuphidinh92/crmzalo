/**
 * learning-service.ts — query/mutation layer for the Learning module.
 *
 * - Module CRUD (admin)
 * - Per-user progress tracking (start/heartbeat/complete)
 * - Team progress aggregate (admin reports)
 * - On complete: side-effect that marks the closest pending LEARNING
 *   task in the current week as done (1 task only, no sweep).
 */
import { prisma } from '../../shared/database/prisma-client.js';

export type ModuleType = 'required' | 'optional';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface ModuleWithProgress {
  id: string;
  name: string;
  description: string | null;
  type: ModuleType;
  contentUrl: string | null;
  durationMinutes: number;
  forRoles: string[];
  sortOrder: number;
  active: boolean;
  // Joined per-user progress
  progressStatus: ProgressStatus;
  progressScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  // Aggregate
  learnerCount: number;
}

function toRolesArray(forRoles: unknown): string[] {
  if (Array.isArray(forRoles)) {
    return forRoles.filter((r): r is string => typeof r === 'string');
  }
  return [];
}

export async function listModulesForUser(
  orgId: string,
  userId: string,
  userRole: string,
  filterType?: ModuleType | 'completed',
): Promise<ModuleWithProgress[]> {
  const modules = await prisma.learningModule.findMany({
    where: { orgId, active: true },
    orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
  });

  const moduleIds = modules.map((m) => m.id);
  const [progressRows, learnerCounts] = await Promise.all([
    prisma.learningProgress.findMany({
      where: { userId, moduleId: { in: moduleIds } },
    }),
    prisma.learningProgress.groupBy({
      by: ['moduleId'],
      where: { moduleId: { in: moduleIds }, status: 'completed' },
      _count: { _all: true },
    }),
  ]);

  const progressByModule = new Map(progressRows.map((p) => [p.moduleId, p]));
  const learnersByModule = new Map(
    learnerCounts.map((c) => [c.moduleId, c._count._all]),
  );

  const result: ModuleWithProgress[] = [];
  for (const m of modules) {
    const roles = toRolesArray(m.forRoles);
    if (roles.length > 0 && !roles.includes(userRole)) continue;
    const p = progressByModule.get(m.id);
    const status = (p?.status ?? 'not_started') as ProgressStatus;

    if (filterType === 'completed' && status !== 'completed') continue;
    if (filterType === 'required' && m.type !== 'required') continue;
    if (filterType === 'optional' && m.type !== 'optional') continue;

    result.push({
      id: m.id,
      name: m.name,
      description: m.description,
      type: m.type as ModuleType,
      contentUrl: m.contentUrl,
      durationMinutes: m.durationMinutes,
      forRoles: roles,
      sortOrder: m.sortOrder,
      active: m.active,
      progressStatus: status,
      progressScore: p?.score ?? null,
      startedAt: p?.startedAt ? p.startedAt.toISOString() : null,
      completedAt: p?.completedAt ? p.completedAt.toISOString() : null,
      learnerCount: learnersByModule.get(m.id) ?? 0,
    });
  }
  return result;
}

export interface UserStats {
  requiredTotal: number;
  requiredCompleted: number;
  monthlyCompleted: number;
  monthlyTarget: number;
  monthlyPercent: number;
}

export async function getStatsForUser(
  orgId: string,
  userId: string,
  userRole: string,
  weeklyTarget: number,
): Promise<UserStats> {
  const modules = await prisma.learningModule.findMany({
    where: { orgId, active: true, type: 'required' },
  });
  const required = modules.filter((m) => {
    const roles = toRolesArray(m.forRoles);
    return roles.length === 0 || roles.includes(userRole);
  });

  const requiredIds = required.map((m) => m.id);
  const completedRequired = await prisma.learningProgress.count({
    where: { userId, moduleId: { in: requiredIds }, status: 'completed' },
  });

  const monthStart = startOfMonth();
  const monthlyCompleted = await prisma.learningProgress.count({
    where: { userId, status: 'completed', completedAt: { gte: monthStart } },
  });

  const now = new Date();
  // Number of weeks elapsed in this month (1-based: even partial week 1 counts)
  const weeksElapsed = Math.max(
    1,
    Math.ceil((now.getDate() + (monthStart.getDay() + 6) % 7) / 7),
  );
  const target = Math.max(1, weeklyTarget) * weeksElapsed;
  const percent = Math.min(100, Math.round((monthlyCompleted / target) * 100));

  return {
    requiredTotal: required.length,
    requiredCompleted: completedRequired,
    monthlyCompleted,
    monthlyTarget: target,
    monthlyPercent: percent,
  };
}

export async function trackProgress(
  userId: string,
  moduleId: string,
): Promise<void> {
  await prisma.learningProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: {
      userId,
      moduleId,
      status: 'in_progress',
      startedAt: new Date(),
    },
    update: {
      status: 'in_progress',
      startedAt: { set: new Date() },
    },
  });
}

export interface CompletePayload {
  userId: string;
  orgId: string;
  moduleId: string;
  score: number | null;
}

/**
 * Mark module completed AND auto-mark the closest pending LEARNING task
 * for this user in the current week.
 */
export async function completeModule(payload: CompletePayload) {
  const { userId, orgId, moduleId, score } = payload;
  const moduleRow = await prisma.learningModule.findFirst({
    where: { id: moduleId, orgId },
    select: { id: true, name: true },
  });
  if (!moduleRow) {
    throw Object.assign(new Error('Module không tồn tại'), { statusCode: 404 });
  }

  const now = new Date();
  const progress = await prisma.learningProgress.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: {
      userId,
      moduleId,
      status: 'completed',
      startedAt: now,
      completedAt: now,
      score,
    },
    update: {
      status: 'completed',
      completedAt: now,
      score,
    },
  });

  // Side-effect: mark closest pending LEARNING task in this week as done
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const learningCategory = await prisma.taskCategory.findUnique({
    where: { key: 'LEARNING' },
    select: { id: true },
  });
  if (learningCategory) {
    const pendingTask = await prisma.task.findFirst({
      where: {
        orgId,
        assignedToId: userId,
        categoryId: learningCategory.id,
        status: 'pending',
        dueDate: { gte: weekStart, lt: weekEnd },
      },
      orderBy: { dueDate: 'asc' },
      select: { id: true },
    });
    if (pendingTask) {
      await prisma.task.update({
        where: { id: pendingTask.id },
        data: {
          status: 'done',
          completedAt: now,
          completionNote: `Hoàn thành module: ${moduleRow.name}`,
        },
      });
    }
  }

  return progress;
}

export interface ModuleInput {
  name: string;
  description?: string | null;
  type?: ModuleType;
  contentUrl?: string | null;
  durationMinutes?: number;
  forRoles?: string[];
  sortOrder?: number;
  active?: boolean;
}

export async function createModule(orgId: string, input: ModuleInput) {
  if (!input.name?.trim()) {
    throw Object.assign(new Error('Cần nhập tên module'), { statusCode: 400 });
  }
  return prisma.learningModule.create({
    data: {
      orgId,
      name: input.name.trim(),
      description: input.description ?? null,
      type: input.type ?? 'optional',
      contentUrl: input.contentUrl ?? null,
      durationMinutes: input.durationMinutes ?? 0,
      forRoles: (input.forRoles ?? []) as object,
      sortOrder: input.sortOrder ?? 0,
      active: input.active ?? true,
    },
  });
}

export async function updateModule(
  orgId: string,
  id: string,
  input: ModuleInput,
) {
  const existing = await prisma.learningModule.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Module không tồn tại'), { statusCode: 404 });
  }
  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.type = input.type;
  if (input.contentUrl !== undefined) data.contentUrl = input.contentUrl;
  if (input.durationMinutes !== undefined) {
    data.durationMinutes = input.durationMinutes;
  }
  if (input.forRoles !== undefined) data.forRoles = input.forRoles as object;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.active !== undefined) data.active = input.active;
  return prisma.learningModule.update({ where: { id }, data });
}

/** Soft delete = set active=false. Schema has the field, no migration needed. */
export async function deactivateModule(orgId: string, id: string) {
  const existing = await prisma.learningModule.findFirst({
    where: { id, orgId },
    select: { id: true },
  });
  if (!existing) {
    throw Object.assign(new Error('Module không tồn tại'), { statusCode: 404 });
  }
  return prisma.learningModule.update({
    where: { id },
    data: { active: false },
  });
}

export async function listModulesForAdmin(orgId: string) {
  const modules = await prisma.learningModule.findMany({
    where: { orgId },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }],
  });
  const counts = await prisma.learningProgress.groupBy({
    by: ['moduleId', 'status'],
    where: { moduleId: { in: modules.map((m) => m.id) } },
    _count: { _all: true },
  });
  const stats = new Map<string, { completed: number; inProgress: number }>();
  for (const c of counts) {
    const cur = stats.get(c.moduleId) ?? { completed: 0, inProgress: 0 };
    if (c.status === 'completed') cur.completed = c._count._all;
    if (c.status === 'in_progress') cur.inProgress = c._count._all;
    stats.set(c.moduleId, cur);
  }
  return modules.map((m) => ({
    ...m,
    forRoles: toRolesArray(m.forRoles),
    completedCount: stats.get(m.id)?.completed ?? 0,
    inProgressCount: stats.get(m.id)?.inProgress ?? 0,
  }));
}

export async function getTeamProgress(orgId: string) {
  const [users, modules, progress] = await Promise.all([
    prisma.user.findMany({
      where: { orgId, isActive: true },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: 'asc' },
    }),
    prisma.learningModule.findMany({
      where: { orgId, active: true, type: 'required' },
    }),
    prisma.learningProgress.findMany({
      where: { module: { orgId, active: true, type: 'required' } },
    }),
  ]);

  const progressByUser = new Map<string, Map<string, ProgressStatus>>();
  for (const p of progress) {
    let m = progressByUser.get(p.userId);
    if (!m) {
      m = new Map();
      progressByUser.set(p.userId, m);
    }
    m.set(p.moduleId, p.status as ProgressStatus);
  }

  const rows = users.map((user) => {
    const required = modules.filter((m) => {
      const roles = toRolesArray(m.forRoles);
      return roles.length === 0 || roles.includes(user.role);
    });
    let completed = 0;
    let inProgress = 0;
    for (const m of required) {
      const status = progressByUser.get(user.id)?.get(m.id) ?? 'not_started';
      if (status === 'completed') completed++;
      if (status === 'in_progress') inProgress++;
    }
    const total = required.length;
    return {
      userId: user.id,
      fullName: user.fullName,
      role: user.role,
      requiredTotal: total,
      completed,
      inProgress,
      notStarted: total - completed - inProgress,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  });

  return { rows };
}
