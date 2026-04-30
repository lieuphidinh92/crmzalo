/**
 * task-cron.ts — three scheduled jobs powering Việc cần làm:
 *
 *   1. RECURRING GENERATOR (00:01 daily)
 *      Walk every active RecurringTaskRule, parse its cron expression
 *      and decide if today is a "fire day" (DOW match). If so, create
 *      `defaultQuantity` tasks per eligible user.
 *
 *   2. AUTO TRIGGER (every 15min)
 *      For each active AutoTaskRule, run its trigger query. Examples:
 *        - new_lead: Contact.createdAt within last 15min
 *        - birthday: birthday matches today (month/day)
 *        - inactive_chat: no contact-side message in N days
 *        - inactive_order: agent + last_order_date older than N days
 *        - upsell_eligible: agent active + no upsell task in N days
 *      Idempotent: skips if a task with the same (rule, contact, day)
 *      already exists.
 *
 *   3. NOTIFICATION REMINDER (every 15min)
 *      Currently a no-op stub — frontend polls /api/v1/notifications.
 *      Hooked up so we can wire WebSocket / push later without touching
 *      the cron scaffolding.
 *
 * All jobs run with TZ=Asia/Ho_Chi_Minh so cron expressions match the
 * intuitive Vietnam-local hour, regardless of the server clock.
 */
import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

const TZ = 'Asia/Ho_Chi_Minh';

/** Parse a 5-field cron string into hour/minute/daysOfWeek (or null=daily). */
interface ParsedCron {
  minute: number;
  hour: number;
  daysOfWeek: number[] | null; // 0=Sun..6=Sat ; null = every day
}

function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, , , dowField] = parts;
  const minute = parseInt(m, 10);
  const hour = parseInt(h, 10);
  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null;
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  let daysOfWeek: number[] | null = null;
  if (dowField !== '*') {
    daysOfWeek = dowField
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n))
      .map((n) => n % 7);
  }
  return { minute, hour, daysOfWeek };
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/* ── Cron 1: Recurring task generator ─────────────────────────────── */

async function runRecurringGenerator() {
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun..6=Sat
  const dayStart = startOfDay(today);

  const rules = await prisma.recurringTaskRule.findMany({
    where: { active: true },
    include: { category: true },
  });

  for (const rule of rules) {
    const parsed = parseCron(rule.cronExpression);
    if (!parsed) {
      logger.warn(`[task-cron] Skipping rule with invalid cron: ${rule.name}`);
      continue;
    }
    const fireToday =
      parsed.daysOfWeek === null || parsed.daysOfWeek.includes(todayDow);
    if (!fireToday) continue;

    // Find eligible users for this org + role mapping.
    const roleFilter: any = { orgId: rule.orgId, isActive: true };
    if (rule.appliesToRole !== 'all') {
      // Map domain role to system role. We only have owner/admin/member;
      // anything not 'all' targets sales = members.
      roleFilter.role = 'member';
    }
    const users = await prisma.user.findMany({
      where: roleFilter,
      select: { id: true },
    });
    if (users.length === 0) continue;

    const dueTime = `${String(parsed.hour).padStart(2, '0')}:${String(
      parsed.minute,
    ).padStart(2, '0')}`;

    for (const user of users) {
      // Idempotency: skip if a task from THIS rule already exists for THIS
      // user on THIS day. We use recurringRuleId + assignedToId + dueDate.
      const existing = await prisma.task.count({
        where: {
          orgId: rule.orgId,
          recurringRuleId: rule.id,
          assignedToId: user.id,
          dueDate: dayStart,
        },
      });
      if (existing >= rule.defaultQuantity) continue;
      const toCreate = rule.defaultQuantity - existing;

      for (let i = 0; i < toCreate; i++) {
        const titleSuffix =
          rule.defaultQuantity > 1 ? ` (${existing + i + 1}/${rule.defaultQuantity})` : '';
        await prisma.task.create({
          data: {
            orgId: rule.orgId,
            categoryId: rule.categoryId,
            assignedToId: user.id,
            title: rule.name + titleSuffix,
            description: rule.description,
            dueDate: dayStart,
            dueTime,
            priority: 2,
            source: 'recurring',
            recurringRuleId: rule.id,
          },
        });
      }
    }
  }
  logger.info(`[task-cron] Recurring generator done — ${rules.length} rules scanned.`);
}

/* ── Cron 2: Auto rules trigger ────────────────────────────────────── */

async function runAutoTriggers() {
  const rules = await prisma.autoTaskRule.findMany({
    where: { active: true },
    include: { category: true },
  });
  for (const rule of rules) {
    try {
      switch (rule.triggerType) {
        case 'new_lead':
          await triggerNewLead(rule);
          break;
        case 'birthday':
          await triggerBirthday(rule);
          break;
        case 'inactive_chat':
          await triggerInactiveChat(rule);
          break;
        case 'inactive_order':
          await triggerInactiveOrder(rule);
          break;
        case 'upsell_eligible':
          await triggerUpsell(rule);
          break;
      }
    } catch (err) {
      logger.warn(`[task-cron] Auto rule ${rule.id} (${rule.triggerType}) failed:`, err);
    }
  }
}

interface AutoRuleRow {
  id: string;
  orgId: string;
  categoryId: string;
  triggerCondition: unknown;
  dueInHours: number;
  messageTemplate: string;
}

function fillTemplate(template: string, ctx: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx[k] ?? ''));
}

function dueAt(hours: number): Date {
  return new Date(Date.now() + hours * 3600_000);
}

async function ensureUniqueAutoTask(opts: {
  orgId: string;
  ruleCategoryId: string;
  contactId: string;
  withinHours: number;
}) {
  const since = new Date(Date.now() - opts.withinHours * 3600_000);
  return prisma.task.count({
    where: {
      orgId: opts.orgId,
      categoryId: opts.ruleCategoryId,
      contactId: opts.contactId,
      source: 'auto',
      createdAt: { gte: since },
    },
  });
}

async function triggerNewLead(rule: AutoRuleRow) {
  const cond = (rule.triggerCondition as { withinMinutes?: number }) ?? {};
  const minutes = cond.withinMinutes ?? 15;
  const since = new Date(Date.now() - minutes * 60_000);
  const newContacts = await prisma.contact.findMany({
    where: { orgId: rule.orgId, createdAt: { gte: since } },
    select: {
      id: true,
      fullName: true,
      customerType: true,
      assignedUserId: true,
    },
  });
  for (const c of newContacts) {
    if (!c.assignedUserId) continue;
    const dup = await ensureUniqueAutoTask({
      orgId: rule.orgId,
      ruleCategoryId: rule.categoryId,
      contactId: c.id,
      withinHours: 24,
    });
    if (dup > 0) continue;
    await prisma.task.create({
      data: {
        orgId: rule.orgId,
        categoryId: rule.categoryId,
        assignedToId: c.assignedUserId,
        contactId: c.id,
        title: fillTemplate(rule.messageTemplate, {
          contactName: c.fullName ?? '(không tên)',
          customerType: c.customerType ?? '',
        }),
        dueDate: dueAt(rule.dueInHours),
        priority: 1,
        source: 'auto',
      },
    });
  }
}

async function triggerBirthday(rule: AutoRuleRow) {
  // Match today's month + day (year ignored) using raw SQL.
  const matches = await prisma.$queryRaw<
    Array<{ id: string; full_name: string | null; assigned_user_id: string | null }>
  >`
    SELECT id, full_name, assigned_user_id
    FROM contacts
    WHERE org_id = ${rule.orgId}
      AND birthday IS NOT NULL
      AND EXTRACT(MONTH FROM birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM birthday)   = EXTRACT(DAY FROM CURRENT_DATE)
  `;
  for (const c of matches) {
    if (!c.assigned_user_id) continue;
    const dup = await ensureUniqueAutoTask({
      orgId: rule.orgId,
      ruleCategoryId: rule.categoryId,
      contactId: c.id,
      withinHours: 24,
    });
    if (dup > 0) continue;
    await prisma.task.create({
      data: {
        orgId: rule.orgId,
        categoryId: rule.categoryId,
        assignedToId: c.assigned_user_id,
        contactId: c.id,
        title: fillTemplate(rule.messageTemplate, {
          contactName: c.full_name ?? '(không tên)',
        }),
        dueDate: new Date(),
        dueTime: '12:00',
        priority: 1,
        source: 'auto',
      },
    });
  }
}

async function triggerInactiveChat(rule: AutoRuleRow) {
  const cond = (rule.triggerCondition as { daysSinceLastMessage?: number }) ?? {};
  const days = cond.daysSinceLastMessage ?? 7;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // Contacts whose last conversation activity is older than cutoff.
  const candidates = await prisma.contact.findMany({
    where: {
      orgId: rule.orgId,
      assignedUserId: { not: null },
      conversations: {
        some: { lastMessageAt: { lt: cutoff } },
      },
    },
    select: { id: true, fullName: true, assignedUserId: true },
    take: 200,
  });
  for (const c of candidates) {
    if (!c.assignedUserId) continue;
    const dup = await ensureUniqueAutoTask({
      orgId: rule.orgId,
      ruleCategoryId: rule.categoryId,
      contactId: c.id,
      withinHours: days * 24,
    });
    if (dup > 0) continue;
    await prisma.task.create({
      data: {
        orgId: rule.orgId,
        categoryId: rule.categoryId,
        assignedToId: c.assignedUserId,
        contactId: c.id,
        title: fillTemplate(rule.messageTemplate, {
          contactName: c.fullName ?? '(không tên)',
        }),
        dueDate: new Date(),
        priority: 2,
        source: 'auto',
      },
    });
  }
}

async function triggerInactiveOrder(rule: AutoRuleRow) {
  const cond = (rule.triggerCondition as { daysSinceLastOrder?: number }) ?? {};
  const days = cond.daysSinceLastOrder ?? 45;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const candidates = await prisma.contact.findMany({
    where: {
      orgId: rule.orgId,
      stage: 'dai_ly_chinh_thuc',
      assignedUserId: { not: null },
      lastOrderDate: { lt: cutoff },
    },
    select: { id: true, fullName: true, assignedUserId: true, lastOrderDate: true },
    take: 200,
  });
  const today = new Date();
  for (const c of candidates) {
    if (!c.assignedUserId) continue;
    const dup = await ensureUniqueAutoTask({
      orgId: rule.orgId,
      ruleCategoryId: rule.categoryId,
      contactId: c.id,
      withinHours: 48,
    });
    if (dup > 0) continue;
    const daysSince = c.lastOrderDate
      ? Math.floor((today.getTime() - c.lastOrderDate.getTime()) / 86_400_000)
      : '?';
    await prisma.task.create({
      data: {
        orgId: rule.orgId,
        categoryId: rule.categoryId,
        assignedToId: c.assignedUserId,
        contactId: c.id,
        title: fillTemplate(rule.messageTemplate, {
          contactName: c.fullName ?? '(không tên)',
          daysSinceLastOrder: String(daysSince),
        }),
        dueDate: new Date(),
        priority: 1,
        source: 'auto',
      },
    });
  }
}

async function triggerUpsell(rule: AutoRuleRow) {
  const cond =
    (rule.triggerCondition as { activeAndDaysSinceLastUpsell?: number }) ?? {};
  const days = cond.activeAndDaysSinceLastUpsell ?? 60;
  const upsellSince = new Date(Date.now() - days * 86_400_000);
  const candidates = await prisma.contact.findMany({
    where: {
      orgId: rule.orgId,
      stage: 'dai_ly_chinh_thuc',
      assignedUserId: { not: null },
      lastOrderDate: { gte: upsellSince },
    },
    select: { id: true, fullName: true, assignedUserId: true },
    take: 200,
  });
  for (const c of candidates) {
    if (!c.assignedUserId) continue;
    const dup = await ensureUniqueAutoTask({
      orgId: rule.orgId,
      ruleCategoryId: rule.categoryId,
      contactId: c.id,
      withinHours: days * 24,
    });
    if (dup > 0) continue;
    await prisma.task.create({
      data: {
        orgId: rule.orgId,
        categoryId: rule.categoryId,
        assignedToId: c.assignedUserId,
        contactId: c.id,
        title: fillTemplate(rule.messageTemplate, {
          contactName: c.fullName ?? '(không tên)',
        }),
        dueDate: new Date(),
        priority: 3,
        source: 'auto',
      },
    });
  }
}

/* ── Cron 3: Notification reminder (stub) ─────────────────────────── */

async function runNotificationReminder() {
  // Frontend currently polls `/api/v1/notifications` (computed on-the-fly).
  // This stub keeps the cron slot reserved so we can later push WebSocket
  // events without restructuring the scheduler.
}

/* ── Public bootstrap ────────────────────────────────────────────── */

export function startTaskCronJobs(): void {
  // 1) Daily 00:01 — recurring task generator
  cron.schedule(
    '1 0 * * *',
    () => {
      runRecurringGenerator().catch((err) =>
        logger.error('[task-cron] recurring gen error:', err),
      );
    },
    { timezone: TZ },
  );

  // 2) Every 15 minutes — auto rule triggers
  cron.schedule(
    '*/15 * * * *',
    () => {
      runAutoTriggers().catch((err) =>
        logger.error('[task-cron] auto trigger error:', err),
      );
    },
    { timezone: TZ },
  );

  // 3) Every 15 minutes — reminder push (stub)
  cron.schedule(
    '*/15 * * * *',
    () => {
      runNotificationReminder().catch((err) =>
        logger.error('[task-cron] notification error:', err),
      );
    },
    { timezone: TZ },
  );

  logger.info('[task-cron] All 3 cron jobs scheduled (TZ=' + TZ + ')');
}

/** Exported for manual / endpoint-triggered runs (admin debug). */
export const taskCronInternals = {
  runRecurringGenerator,
  runAutoTriggers,
  runNotificationReminder,
};
