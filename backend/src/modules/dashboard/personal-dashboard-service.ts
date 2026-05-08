/**
 * personal-dashboard-service.ts — query layer for the home/dashboard
 * page when the caller is a `member` (sale / CSKH).
 *
 * All helpers take `userId` so they trivially scope to "deals của tôi".
 * Designed as plug-in widgets — each function returns a self-contained
 * shape consumed by one Vue component, so swapping data sources later
 * (e.g. when the Reminder Engine ships) only changes the loader, not
 * the consumer.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getOrgGoals } from '../settings/business-goals-service.js';
import { calculateComplianceScore } from './sale-performance-service.js';

const OFFICIAL_STAGE = 'dai_ly_chinh_thuc';
const ACTIVE_STAGES = ['tiep_can', 'da_bao_gia', 'dang_thu_hang'];

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/* ── 1. Today's tasks ──────────────────────────────────────────────── */

export interface TodayAppointment {
  id: string;
  contactId: string;
  contactName: string | null;
  customerType: string | null;
  appointmentTime: string | null;
  type: string | null;
  notes: string | null;
  status: string;
}

export interface DueReminder {
  contactId: string;
  contactName: string | null;
  customerType: string | null;
  storeName: string | null;
  phone: string | null;
  nextContactDate: string;
  daysOverdue: number; // negative = today, positive = late
  internalNote: string | null;
}

export interface TodayTasksResponse {
  appointments: TodayAppointment[];
  reminders: DueReminder[];
}

export async function getTodayTasks(
  orgId: string,
  userId: string,
): Promise<TodayTasksResponse> {
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  // Today's appointments — assigned to me OR for my contact.
  const apptsRaw = await prisma.appointment.findMany({
    where: {
      orgId,
      appointmentDate: { gte: dayStart, lte: dayEnd },
      OR: [
        { assignedUserId: userId },
        { contact: { assignedUserId: userId } },
      ],
    },
    include: {
      contact: { select: { id: true, fullName: true, customerType: true } },
    },
    orderBy: { appointmentTime: 'asc' },
  });

  const appointments: TodayAppointment[] = apptsRaw.map((a) => ({
    id: a.id,
    contactId: a.contactId,
    contactName: a.contact?.fullName ?? null,
    customerType: a.contact?.customerType ?? null,
    appointmentTime: a.appointmentTime ?? null,
    type: a.type ?? null,
    notes: a.notes,
    status: a.status,
  }));

  // Due-for-follow-up reminders — contacts with next_contact_date <= today
  // assigned to me, sorted by most overdue first.
  const dueRaw = await prisma.contact.findMany({
    where: {
      orgId,
      assignedUserId: userId,
      nextContactDate: { lte: dayEnd },
    },
    select: {
      id: true,
      fullName: true,
      customerType: true,
      storeName: true,
      phone: true,
      nextContactDate: true,
      internalNote: true,
    },
    orderBy: { nextContactDate: 'asc' },
    take: 50,
  });

  const reminders: DueReminder[] = dueRaw
    .filter((c) => c.nextContactDate)
    .map((c) => {
      const target = c.nextContactDate!;
      const days = Math.floor(
        (dayStart.getTime() - startOfDay(target).getTime()) / 86_400_000,
      );
      return {
        contactId: c.id,
        contactName: c.fullName,
        customerType: c.customerType,
        storeName: c.storeName,
        phone: c.phone,
        nextContactDate: target.toISOString(),
        daysOverdue: days,
        internalNote: c.internalNote,
      };
    });

  return { appointments, reminders };
}

/* ── 2. My at-risk agents (top 5 by lifetime DS) ──────────────────── */

export interface MyAtRiskAgent {
  contactId: string;
  fullName: string | null;
  storeName: string | null;
  customerType: string | null;
  phone: string | null;
  lifetimeRevenue: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
}

export async function getMyAtRiskAgents(
  orgId: string,
  userId: string,
): Promise<MyAtRiskAgent[]> {
  const goals = await getOrgGoals(orgId);
  const today = new Date();

  const agents = await prisma.contact.findMany({
    where: { orgId, assignedUserId: userId, stage: OFFICIAL_STAGE },
    select: {
      id: true,
      fullName: true,
      storeName: true,
      customerType: true,
      phone: true,
    },
  });
  const ids = agents.map((a) => a.id);
  if (ids.length === 0) return [];

  const aggs = await prisma.order.groupBy({
    by: ['contactId'],
    where: { orgId, contactId: { in: ids } },
    _sum: { totalAmount: true },
    _max: { orderDate: true, createdAt: true },
  });
  const aggMap = new Map(aggs.map((a) => [a.contactId, a]));

  return agents
    .map((agent) => {
      const agg = aggMap.get(agent.id);
      const last = agg?._max.orderDate ?? agg?._max.createdAt ?? null;
      const daysSince = last
        ? Math.floor((today.getTime() - last.getTime()) / 86_400_000)
        : Number.POSITIVE_INFINITY;
      return {
        contactId: agent.id,
        fullName: agent.fullName,
        storeName: agent.storeName,
        customerType: agent.customerType,
        phone: agent.phone,
        lifetimeRevenue: Number(agg?._sum.totalAmount ?? 0),
        lastOrderDate: last?.toISOString() ?? null,
        daysSinceLastOrder: Number.isFinite(daysSince) ? daysSince : 99999,
      };
    })
    .filter(
      (a) => a.daysSinceLastOrder > goals.atRiskDays && a.lifetimeRevenue > 0,
    )
    .sort((a, b) => b.lifetimeRevenue - a.lifetimeRevenue)
    .slice(0, 5);
}

/* ── 3. Personal KPI (4 cards) ────────────────────────────────────── */

export interface PersonalKpi {
  resaleRevenue: {
    value: number;
    previous: number;
    trend: number;
    monthlyTarget: number;
    percentOfTarget: number;
  };
  newClosed: { count: number };
  pipeline: { dealCount: number; totalValue: number };
  complianceScore: { value: number; breakdown: Record<string, number> };
}

export async function getPersonalKpi(
  orgId: string,
  userId: string,
): Promise<PersonalKpi> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const lastMonthStart = addMonths(monthStart, -1);
  const goals = await getOrgGoals(orgId);
  const monthlyTarget = goals.annualRevenue > 0 ? goals.annualRevenue / 12 : 0;

  const [thisMonth, lastMonth, newClosed, pipelineAgg, compliance] =
    await Promise.all([
      // DS resale tháng này — mọi order from "đại lý cũ" (created before
      // monthStart) assigned to me. Sale attribution: order.assignedSaleId
      // (ưu tiên), fallback về contact.assignedUserId cho MISA-import cũ.
      prisma.order.aggregate({
        where: {
          orgId,
          status: { not: 'cancelled' },
          contact: { createdAt: { lt: monthStart } },
          AND: [
            {
              OR: [
                { assignedSaleId: userId },
                { assignedSaleId: null, contact: { assignedUserId: userId } },
              ],
            },
            {
              OR: [
                { orderDate: { gte: monthStart } },
                { orderDate: null, createdAt: { gte: monthStart } },
              ],
            },
          ],
        },
        _sum: { totalAmount: true },
      }),
      // Tháng trước — cùng logic sale attribution
      prisma.order.aggregate({
        where: {
          orgId,
          status: { not: 'cancelled' },
          contact: { createdAt: { lt: lastMonthStart } },
          AND: [
            {
              OR: [
                { assignedSaleId: userId },
                { assignedSaleId: null, contact: { assignedUserId: userId } },
              ],
            },
            {
              OR: [
                { orderDate: { gte: lastMonthStart, lt: monthStart } },
                {
                  orderDate: null,
                  createdAt: { gte: lastMonthStart, lt: monthStart },
                },
              ],
            },
          ],
        },
        _sum: { totalAmount: true },
      }),
      // Đại lý mới chốt tháng này
      prisma.stageHistory.count({
        where: {
          contact: { orgId, assignedUserId: userId },
          toStage: OFFICIAL_STAGE,
          changedAt: { gte: monthStart },
        },
      }),
      // Pipeline đang xử lý
      prisma.contact.aggregate({
        where: {
          orgId,
          assignedUserId: userId,
          stage: { in: ACTIVE_STAGES },
        },
        _sum: { potentialValue: true },
        _count: { id: true },
      }),
      // Compliance score
      calculateComplianceScore(orgId, userId, monthStart, addMonths(monthStart, 1)),
    ]);

  const value = Number(thisMonth._sum.totalAmount ?? 0);
  const previous = Number(lastMonth._sum.totalAmount ?? 0);

  return {
    resaleRevenue: {
      value,
      previous,
      trend:
        previous === 0
          ? value > 0
            ? 100
            : 0
          : ((value - previous) / previous) * 100,
      monthlyTarget,
      percentOfTarget: monthlyTarget > 0 ? (value / monthlyTarget) * 100 : 0,
    },
    newClosed: { count: newClosed },
    pipeline: {
      dealCount: pipelineAgg._count.id ?? 0,
      totalValue: Number(pipelineAgg._sum.potentialValue ?? 0),
    },
    complianceScore: {
      value: compliance.total,
      breakdown: {
        noteFreshness: compliance.noteFreshness,
        stageHygiene: compliance.stageHygiene,
        zaloResponseTime: compliance.zaloResponseTime,
        aiInsightUsage: compliance.aiInsightUsage,
      },
    },
  };
}

/* ── 4. Mini pipeline funnel ──────────────────────────────────────── */

export interface MiniPipelineColumn {
  stage: string;
  label: string;
  count: number;
  totalValue: number;
}

const STAGE_LABELS_VI: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng',
};

export async function getMyMiniPipeline(
  orgId: string,
  userId: string,
): Promise<MiniPipelineColumn[]> {
  const stages = Object.keys(STAGE_LABELS_VI);

  const counts = await prisma.contact.groupBy({
    by: ['stage'],
    where: { orgId, assignedUserId: userId, stage: { in: stages } },
    _count: { id: true },
    _sum: { potentialValue: true },
  });
  const map = new Map(counts.map((c) => [c.stage, c]));

  return stages.map((stage) => {
    const row = map.get(stage);
    return {
      stage,
      label: STAGE_LABELS_VI[stage],
      count: row?._count.id ?? 0,
      totalValue: Number(row?._sum.potentialValue ?? 0),
    };
  });
}

/* ── 5. Quick-action badges ───────────────────────────────────────── */

export interface QuickActionBadges {
  unreadConversations: number;
}

export async function getQuickActionBadges(
  orgId: string,
  userId: string,
): Promise<QuickActionBadges> {
  // Sum unreadCount across conversations whose contact is assigned to me.
  const rows = await prisma.conversation.findMany({
    where: {
      orgId,
      contact: { assignedUserId: userId },
      unreadCount: { gt: 0 },
    },
    select: { unreadCount: true },
  });
  const unreadConversations = rows.reduce((s, r) => s + r.unreadCount, 0);
  return { unreadConversations };
}
