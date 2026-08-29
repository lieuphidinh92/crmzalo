import { prisma } from '../../shared/database/prisma-client.js';

const DASHBOARD_SOURCE = 'sale_dashboard_v2';
const ALLOWED_ACTION_TYPES = new Set(['risk', 'reorder', 'deal', 'opportunity']);

export interface SaleDashboardTarget {
  revenue: number | null;
  activeCustomers: number | null;
  orderFrequency: number | null;
  averageOrderValue: number | null;
}

export type SaleDashboardTargetMap = Record<string, SaleDashboardTarget>;

function startOfDay(date = new Date()): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function dashboardMonthKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function settingKey(month: string): string {
  return `sale_dashboard_targets:${month}`;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw Object.assign(new Error(`${field} phải là số không âm`), { statusCode: 400 });
  }
  return number === 0 ? null : number;
}

function normalizeTarget(input: Partial<SaleDashboardTarget>): SaleDashboardTarget {
  return {
    revenue: nullableNumber(input.revenue, 'Mục tiêu doanh thu'),
    activeCustomers: nullableNumber(input.activeCustomers, 'Mục tiêu khách active'),
    orderFrequency: nullableNumber(input.orderFrequency, 'Mục tiêu tần suất mua'),
    averageOrderValue: nullableNumber(input.averageOrderValue, 'Mục tiêu giá trị đơn'),
  };
}

export async function getSaleDashboardTargets(
  orgId: string,
  month = dashboardMonthKey(),
): Promise<SaleDashboardTargetMap> {
  const row = await prisma.appSetting.findUnique({
    where: { orgId_settingKey: { orgId, settingKey: settingKey(month) } },
    select: { valuePlain: true },
  });
  if (!row?.valuePlain) return {};
  try {
    const parsed = JSON.parse(row.valuePlain) as Record<string, Partial<SaleDashboardTarget>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([saleId, target]) => [saleId, normalizeTarget(target)]),
    );
  } catch {
    return {};
  }
}

export async function setSaleDashboardTarget(
  orgId: string,
  saleId: string,
  input: Partial<SaleDashboardTarget>,
  month = dashboardMonthKey(),
): Promise<SaleDashboardTarget> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw Object.assign(new Error('Tháng phải có định dạng YYYY-MM'), { statusCode: 400 });
  }
  const sale = await prisma.user.findFirst({
    where: { id: saleId, orgId, isActive: true },
    select: { id: true },
  });
  if (!sale) throw Object.assign(new Error('Không tìm thấy nhân viên'), { statusCode: 404 });

  const normalized = normalizeTarget(input);
  await prisma.$transaction(async (tx: any) => {
    const key = settingKey(month);
    const current = await tx.appSetting.findUnique({
      where: { orgId_settingKey: { orgId, settingKey: key } },
      select: { valuePlain: true },
    });
    let targets: SaleDashboardTargetMap = {};
    try {
      targets = current?.valuePlain ? JSON.parse(current.valuePlain) : {};
    } catch {
      targets = {};
    }
    const hasTarget = Object.values(normalized).some((value) => value !== null);
    if (hasTarget) targets[saleId] = normalized;
    else delete targets[saleId];
    await tx.appSetting.upsert({
      where: { orgId_settingKey: { orgId, settingKey: key } },
      update: { valuePlain: JSON.stringify(targets) },
      create: { orgId, settingKey: key, valuePlain: JSON.stringify(targets) },
    });
  });
  return normalized;
}

export interface DashboardActionState {
  taskId: string;
  state: 'active' | 'done_today' | 'snoozed';
  snoozedUntil?: string;
}

export async function getDashboardActionStates(
  orgId: string,
  userId: string,
  actionKeys: string[],
): Promise<Map<string, DashboardActionState>> {
  if (!actionKeys.length) return new Map();
  const today = startOfDay();
  const tasks = await prisma.task.findMany({
    where: {
      orgId,
      assignedToId: userId,
      metadata: { path: ['dashboardSource'], equals: DASHBOARD_SOURCE },
      OR: [{ status: 'pending' }, { completedAt: { gte: today } }],
    },
    select: { id: true, status: true, dueDate: true, completedAt: true, metadata: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const requested = new Set(actionKeys);
  const result = new Map<string, DashboardActionState>();
  for (const task of tasks as any[]) {
    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    const actionKey = String(metadata.dashboardActionKey ?? '');
    if (!requested.has(actionKey) || result.has(actionKey)) continue;
    if (task.status === 'done' && task.completedAt >= today) {
      result.set(actionKey, { taskId: task.id, state: 'done_today' });
    } else if (task.status === 'pending' && task.dueDate > today) {
      result.set(actionKey, {
        taskId: task.id,
        state: 'snoozed',
        snoozedUntil: task.dueDate.toISOString().slice(0, 10),
      });
    } else if (task.status === 'pending') {
      result.set(actionKey, { taskId: task.id, state: 'active' });
    }
  }
  return result;
}

interface ActionMutationInput {
  actionKey: string;
  actionType: string;
  contactId: string;
}

function validateActionInput(input: ActionMutationInput): void {
  if (!ALLOWED_ACTION_TYPES.has(input.actionType)) {
    throw Object.assign(new Error('Loại hành động không hợp lệ'), { statusCode: 400 });
  }
  if (input.actionKey !== `${input.actionType}:${input.contactId}`) {
    throw Object.assign(new Error('Mã hành động không hợp lệ'), { statusCode: 400 });
  }
}

async function actionContext(orgId: string, userId: string, input: ActionMutationInput) {
  validateActionInput(input);
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, orgId, assignedUserId: userId },
    select: { id: true, fullName: true, storeName: true },
  });
  if (!contact) {
    throw Object.assign(new Error('Khách hàng không thuộc phạm vi của bạn'), { statusCode: 403 });
  }
  const categoryKey = input.actionType === 'opportunity'
    ? 'UPSELL'
    : input.actionType === 'deal'
      ? 'UPDATE_NOTE'
      : 'REACTIVATION';
  const category = await prisma.taskCategory.findUnique({
    where: { key: categoryKey },
    select: { id: true },
  });
  if (!category) throw Object.assign(new Error('Thiếu danh mục task hệ thống'), { statusCode: 500 });
  const existing = await prisma.task.findFirst({
    where: {
      orgId,
      assignedToId: userId,
      status: 'pending',
      AND: [
        { metadata: { path: ['dashboardSource'], equals: DASHBOARD_SOURCE } },
        { metadata: { path: ['dashboardActionKey'], equals: input.actionKey } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
  return { contact, category, existing };
}

function actionTitle(type: string, contactName: string): string {
  const labels: Record<string, string> = {
    risk: 'Chăm sóc khách có nguy cơ rời bỏ',
    reorder: 'Liên hệ khách đến chu kỳ nhập lại',
    deal: 'Follow cơ hội chưa chốt',
    opportunity: 'Tư vấn cross-sell / upsell',
  };
  return `${labels[type]}: ${contactName}`;
}

export async function completeDashboardAction(
  orgId: string,
  userId: string,
  input: ActionMutationInput,
) {
  const { contact, category, existing } = await actionContext(orgId, userId, input);
  const now = new Date();
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: { status: 'done', completedAt: now, completionNote: 'Đã xử lý từ Sale Dashboard' },
    });
  }
  const name = contact.storeName || contact.fullName || 'Khách hàng';
  return prisma.task.create({
    data: {
      orgId,
      assignedToId: userId,
      categoryId: category.id,
      contactId: contact.id,
      title: actionTitle(input.actionType, name),
      dueDate: startOfDay(now),
      priority: input.actionType === 'risk' ? 1 : 2,
      status: 'done',
      source: 'auto',
      completedAt: now,
      completionNote: 'Đã xử lý từ Sale Dashboard',
      metadata: {
        dashboardSource: DASHBOARD_SOURCE,
        dashboardActionKey: input.actionKey,
        dashboardActionType: input.actionType,
      },
    },
  });
}

export async function snoozeDashboardAction(
  orgId: string,
  userId: string,
  input: ActionMutationInput,
  days = 3,
) {
  const { contact, category, existing } = await actionContext(orgId, userId, input);
  const newDue = addDays(startOfDay(), Math.min(30, Math.max(1, days)));
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: { dueDate: newDue, status: 'pending' },
    });
  }
  const name = contact.storeName || contact.fullName || 'Khách hàng';
  return prisma.task.create({
    data: {
      orgId,
      assignedToId: userId,
      categoryId: category.id,
      contactId: contact.id,
      title: actionTitle(input.actionType, name),
      dueDate: newDue,
      priority: input.actionType === 'risk' ? 1 : 2,
      status: 'pending',
      source: 'auto',
      metadata: {
        dashboardSource: DASHBOARD_SOURCE,
        dashboardActionKey: input.actionKey,
        dashboardActionType: input.actionType,
      },
    },
  });
}
