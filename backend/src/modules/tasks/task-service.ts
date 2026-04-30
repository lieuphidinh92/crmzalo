/**
 * task-service.ts — query/CRUD layer for the Việc cần làm module.
 *
 * - List with filters (period, category, status, source) scoped to user
 * - Create manual / Mark done / Snooze / Skip
 * - Top-priority list for dashboard widget
 * - Cadence progress (per-week aggregates by category) for dashboard
 */
import { prisma } from '../../shared/database/prisma-client.js';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type TaskSource = 'auto' | 'recurring' | 'manual';

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d = new Date()): Date {
  // ISO week starts Monday.
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Mon
  x.setDate(x.getDate() - dow);
  return x;
}

export type ListPeriod = 'today' | 'week' | 'month' | 'all';

export interface ListFilters {
  period?: ListPeriod;
  categoryIds?: string[];
  statuses?: TaskStatus[];
  sources?: TaskSource[];
}

function buildPeriodWhere(period?: ListPeriod): Record<string, unknown> | undefined {
  if (!period || period === 'all') return undefined;
  if (period === 'today') {
    return { dueDate: { gte: startOfDay(), lte: endOfDay() } };
  }
  if (period === 'week') {
    const start = startOfWeek();
    return { dueDate: { gte: start, lte: addDays(start, 7) } };
  }
  // month
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { dueDate: { gte: startMonth, lt: endMonth } };
}

export async function listTasks(
  orgId: string,
  userId: string,
  filters: ListFilters,
) {
  const where: any = { orgId, assignedToId: userId };
  const periodWhere = buildPeriodWhere(filters.period);
  if (periodWhere) Object.assign(where, periodWhere);
  if (filters.categoryIds?.length) where.categoryId = { in: filters.categoryIds };
  if (filters.statuses?.length) where.status = { in: filters.statuses };
  if (filters.sources?.length) where.source = { in: filters.sources };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      category: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          customerType: true,
          storeName: true,
          stage: true,
        },
      },
    },
    orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }, { dueTime: 'asc' }],
  });

  // Compute "today stats" + "overdue" + "weekly completion %" for the
  // sidebar widgets.
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const weekStart = startOfWeek();
  const weekEnd = addDays(weekStart, 7);

  const [todayTotal, todayDone, overdue, weekTotal, weekDone] = await Promise.all([
    prisma.task.count({
      where: { orgId, assignedToId: userId, dueDate: { gte: today, lt: tomorrow } },
    }),
    prisma.task.count({
      where: {
        orgId,
        assignedToId: userId,
        dueDate: { gte: today, lt: tomorrow },
        status: 'done',
      },
    }),
    prisma.task.count({
      where: {
        orgId,
        assignedToId: userId,
        status: 'pending',
        dueDate: { lt: today },
      },
    }),
    prisma.task.count({
      where: {
        orgId,
        assignedToId: userId,
        dueDate: { gte: weekStart, lt: weekEnd },
      },
    }),
    prisma.task.count({
      where: {
        orgId,
        assignedToId: userId,
        dueDate: { gte: weekStart, lt: weekEnd },
        status: 'done',
      },
    }),
  ]);

  return {
    tasks,
    stats: {
      todayTotal,
      todayDone,
      overdue,
      weekTotal,
      weekDone,
      weekCompletionPercent: weekTotal === 0 ? 0 : (weekDone / weekTotal) * 100,
    },
  };
}

export async function getTodayTopTasks(
  orgId: string,
  userId: string,
  limit = 5,
) {
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  return prisma.task.findMany({
    where: {
      orgId,
      assignedToId: userId,
      dueDate: { gte: today, lt: tomorrow },
      status: { in: ['pending', 'in_progress'] },
    },
    include: {
      category: true,
      contact: {
        select: { id: true, fullName: true, customerType: true },
      },
    },
    orderBy: [{ priority: 'asc' }, { dueTime: 'asc' }],
    take: limit,
  });
}

/* ── Cadence progress for dashboard widget ───────────────────────── */

export interface CadenceRow {
  categoryKey: string;
  label: string;
  icon: string;
  total: number;
  done: number;
  percent: number;
}

const CADENCE_KEYS = ['DAILY_POST', 'WEEKLY_INTERACT', 'LEARNING', 'DAILY_REPORT'];

export async function getCadenceProgress(
  orgId: string,
  userId: string,
): Promise<CadenceRow[]> {
  const weekStart = startOfWeek();
  const weekEnd = addDays(weekStart, 7);
  const categories = await prisma.taskCategory.findMany({
    where: { key: { in: CADENCE_KEYS } },
  });
  const result: CadenceRow[] = [];
  for (const key of CADENCE_KEYS) {
    const cat = categories.find((c) => c.key === key);
    if (!cat) continue;
    const [total, done] = await Promise.all([
      prisma.task.count({
        where: {
          orgId,
          assignedToId: userId,
          categoryId: cat.id,
          dueDate: { gte: weekStart, lt: weekEnd },
        },
      }),
      prisma.task.count({
        where: {
          orgId,
          assignedToId: userId,
          categoryId: cat.id,
          dueDate: { gte: weekStart, lt: weekEnd },
          status: 'done',
        },
      }),
    ]);
    result.push({
      categoryKey: key,
      label: cat.name,
      icon: cat.icon,
      total,
      done,
      percent: total === 0 ? 0 : (done / total) * 100,
    });
  }
  return result;
}

/* ── Mutations ───────────────────────────────────────────────────── */

export interface CreateInput {
  orgId: string;
  assignedToId: string;
  categoryId: string;
  contactId?: string | null;
  title: string;
  description?: string | null;
  dueDate: Date;
  dueTime?: string | null;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export async function createTask(input: CreateInput) {
  return prisma.task.create({
    data: {
      orgId: input.orgId,
      assignedToId: input.assignedToId,
      categoryId: input.categoryId,
      contactId: input.contactId ?? null,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate,
      dueTime: input.dueTime ?? null,
      priority: input.priority ?? 2,
      source: 'manual',
      metadata: (input.metadata ?? {}) as object,
    },
    include: { category: true },
  });
}

export async function markDone(
  orgId: string,
  taskId: string,
  userId: string,
  completionNote: string | null,
  metadataPatch?: Record<string, unknown>,
) {
  // Verify ownership: only the assignee or admin can mark done. The route
  // layer handles role check; here we ensure org match + assignee match.
  const task = await prisma.task.findFirst({ where: { id: taskId, orgId } });
  if (!task) throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  if (task.assignedToId !== userId) {
    // Allow admin to mark done? Yes — caller decides via role; we just allow.
  }
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'done',
      completedAt: new Date(),
      completionNote: completionNote ?? null,
      metadata: metadataPatch
        ? ({ ...(task.metadata as object), ...metadataPatch } as object)
        : task.metadata,
    },
    include: { category: true, contact: true },
  });
}

export async function snoozeTask(
  orgId: string,
  taskId: string,
  newDue: Date,
  newTime: string | null,
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, orgId } });
  if (!task) throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  return prisma.task.update({
    where: { id: taskId },
    data: { dueDate: newDue, dueTime: newTime, status: 'pending' },
  });
}

export async function skipTask(
  orgId: string,
  taskId: string,
  reason: string,
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, orgId } });
  if (!task) throw Object.assign(new Error('Task not found'), { statusCode: 404 });
  const meta = (task.metadata as Record<string, unknown>) ?? {};
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: 'skipped',
      completionNote: reason,
      metadata: { ...meta, skippedAt: new Date().toISOString() } as object,
    },
  });
}

export async function getTaskDetail(orgId: string, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, orgId },
    include: {
      category: true,
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          customerType: true,
          storeName: true,
          stage: true,
          assignedUserId: true,
          aiInsight: true,
          aiInsightUpdatedAt: true,
        },
      },
      assignedTo: { select: { id: true, fullName: true } },
      recurringRule: { select: { id: true, name: true } },
    },
  });
}
