/**
 * task-seeds.ts — idempotent seeders.
 *
 *   - 10 canonical TaskCategory rows (global, shared across orgs)
 *   - 7 default RecurringTaskRule rows per org (admin can disable later)
 *   - 5 default AutoTaskRule rows per org
 *
 * Called lazily on the first GET /api/v1/tasks for an org so we never
 * have to run a separate seed script.
 */
import { prisma } from '../../shared/database/prisma-client.js';

export const TASK_CATEGORY_SEEDS = [
  {
    key: 'NEW_LEAD',
    name: 'Chào hàng data mới',
    icon: '🔥',
    color: 'red',
    description: 'Lead mới về — cần liên hệ nhanh chóng',
    sortOrder: 1,
  },
  {
    key: 'DAILY_POST',
    name: 'Đăng bài FB/Zalo',
    icon: '📱',
    color: 'blue',
    description: 'Bài đăng định kỳ trên kênh xã hội',
    sortOrder: 2,
  },
  {
    key: 'BIRTHDAY',
    name: 'Tặng quà sinh nhật KH',
    icon: '🎂',
    color: 'pink',
    description: 'Sinh nhật khách hàng — chăm sóc cá nhân',
    sortOrder: 3,
  },
  {
    key: 'WEEKLY_INTERACT',
    name: 'Tương tác KH định kỳ',
    icon: '💬',
    color: 'green',
    description: 'Chào hàng / tài liệu / thông tin hữu ích cho đại lý',
    sortOrder: 4,
  },
  {
    key: 'LEARNING',
    name: 'Học tập module',
    icon: '📚',
    color: 'purple',
    description: 'Hoàn thành module học tập nội bộ',
    sortOrder: 5,
  },
  {
    key: 'UPDATE_NOTE',
    name: 'Cập nhật ghi chú KH',
    icon: '📝',
    color: 'yellow',
    description: 'Cập nhật ghi chú vào hồ sơ khách hàng',
    sortOrder: 6,
  },
  {
    key: 'DAILY_REPORT',
    name: 'Báo cáo cuối ngày',
    icon: '📊',
    color: 'indigo',
    description: 'Tổng kết hoạt động trong ngày',
    sortOrder: 7,
  },
  {
    key: 'MARKET_RESEARCH',
    name: 'Nghiên cứu đối thủ',
    icon: '🔍',
    color: 'orange',
    description: 'Theo dõi giá, sản phẩm, chương trình của đối thủ',
    sortOrder: 8,
  },
  {
    key: 'REACTIVATION',
    name: 'Cứu đại lý sắp churn',
    icon: '🚨',
    color: 'red-darken-1',
    description: 'Đại lý không đặt hàng quá lâu — cần can thiệp',
    sortOrder: 9,
  },
  {
    key: 'UPSELL',
    name: 'Up-sell SKU mới',
    icon: '📈',
    color: 'teal',
    description: 'Giới thiệu sản phẩm mới cho đại lý hiện hữu',
    sortOrder: 10,
  },
] as const;

export type TaskCategoryKey = (typeof TASK_CATEGORY_SEEDS)[number]['key'];

interface RecurringSeed {
  categoryKey: TaskCategoryKey;
  name: string;
  description: string;
  cronExpression: string;
  appliesToRole: 'sale' | 'csk' | 'leader' | 'all';
  defaultQuantity: number;
}

const RECURRING_SEEDS: RecurringSeed[] = [
  {
    categoryKey: 'DAILY_POST',
    name: 'Đăng FB sáng',
    description: 'Bài đăng buổi sáng (đề tài: lợi ích sản phẩm, FAQ).',
    cronExpression: '0 8 * * *',
    appliesToRole: 'sale',
    defaultQuantity: 1,
  },
  {
    categoryKey: 'DAILY_POST',
    name: 'Đăng FB chiều',
    description: 'Bài đăng buổi chiều (đề tài: case study, testimonial).',
    cronExpression: '0 15 * * *',
    appliesToRole: 'sale',
    defaultQuantity: 1,
  },
  {
    categoryKey: 'WEEKLY_INTERACT',
    name: 'Tương tác — Chào hàng',
    description: 'Liên hệ chào hàng đầu tuần với tệp đại lý',
    cronExpression: '0 9 * * 1',
    appliesToRole: 'sale',
    defaultQuantity: 5,
  },
  {
    categoryKey: 'WEEKLY_INTERACT',
    name: 'Tương tác — Cung cấp tài liệu MKT',
    description: 'Gửi tài liệu marketing mới cho đại lý',
    cronExpression: '0 9 * * 3',
    appliesToRole: 'sale',
    defaultQuantity: 5,
  },
  {
    categoryKey: 'WEEKLY_INTERACT',
    name: 'Tương tác — Thông tin hữu ích',
    description: 'Chia sẻ thông tin ngành / kiến thức hữu ích cho đại lý',
    cronExpression: '0 9 * * 5',
    appliesToRole: 'sale',
    defaultQuantity: 5,
  },
  {
    categoryKey: 'DAILY_REPORT',
    name: 'Báo cáo cuối ngày',
    description: 'Tổng kết hoạt động và cập nhật pipeline',
    cronExpression: '30 17 * * *',
    appliesToRole: 'all',
    defaultQuantity: 1,
  },
  {
    categoryKey: 'MARKET_RESEARCH',
    name: 'Nghiên cứu đối thủ tuần',
    description: 'Khảo sát giá / chương trình của đối thủ ngành',
    cronExpression: '0 10 * * 5',
    appliesToRole: 'sale',
    defaultQuantity: 1,
  },
  {
    categoryKey: 'LEARNING',
    name: 'Học 1 module',
    description: 'Hoàn thành ít nhất 1 module học tập trong tuần',
    cronExpression: '0 10 * * 0',
    appliesToRole: 'all',
    defaultQuantity: 1,
  },
];

interface AutoSeed {
  categoryKey: TaskCategoryKey;
  triggerType: 'new_lead' | 'birthday' | 'inactive_chat' | 'inactive_order' | 'upsell_eligible';
  triggerCondition: Record<string, unknown>;
  dueInHours: number;
  messageTemplate: string;
}

const AUTO_SEEDS: AutoSeed[] = [
  {
    categoryKey: 'NEW_LEAD',
    triggerType: 'new_lead',
    triggerCondition: { withinMinutes: 15 },
    dueInHours: 1,
    messageTemplate: 'Chào hàng {{contactName}} ({{customerType}})',
  },
  {
    categoryKey: 'BIRTHDAY',
    triggerType: 'birthday',
    triggerCondition: { matchMonthDay: true },
    dueInHours: 12,
    messageTemplate: 'Tặng quà sinh nhật {{contactName}}',
  },
  {
    categoryKey: 'WEEKLY_INTERACT',
    triggerType: 'inactive_chat',
    triggerCondition: { daysSinceLastMessage: 7 },
    dueInHours: 24,
    messageTemplate: 'Tương tác lại với {{contactName}} (7d không chat)',
  },
  {
    categoryKey: 'REACTIVATION',
    triggerType: 'inactive_order',
    triggerCondition: { daysSinceLastOrder: 45 },
    dueInHours: 24,
    messageTemplate: 'Cứu {{contactName}} — sắp churn ({{daysSinceLastOrder}}d không đặt)',
  },
  {
    categoryKey: 'UPSELL',
    triggerType: 'upsell_eligible',
    triggerCondition: { activeAndDaysSinceLastUpsell: 60 },
    dueInHours: 48,
    messageTemplate: 'Giới thiệu SKU mới cho {{contactName}}',
  },
];

/** Idempotently ensure the 10 global TaskCategory rows exist. */
export async function ensureCategoriesSeeded(): Promise<
  Record<TaskCategoryKey, string>
> {
  const existing = await prisma.taskCategory.findMany();
  const map = new Map<string, string>(existing.map((c) => [c.key, c.id]));

  for (const cat of TASK_CATEGORY_SEEDS) {
    if (!map.has(cat.key)) {
      const created = await prisma.taskCategory.create({ data: cat });
      map.set(cat.key, created.id);
    }
  }
  return Object.fromEntries(map) as Record<TaskCategoryKey, string>;
}

/** Idempotently ensure default rules exist for an org. */
export async function ensureRulesSeededForOrg(orgId: string): Promise<void> {
  const categoryMap = await ensureCategoriesSeeded();

  // Recurring rules — keyed by (orgId, name) to dedupe.
  const existingRecurring = await prisma.recurringTaskRule.findMany({
    where: { orgId },
    select: { name: true },
  });
  const existingNames = new Set(existingRecurring.map((r) => r.name));
  for (const seed of RECURRING_SEEDS) {
    if (existingNames.has(seed.name)) continue;
    await prisma.recurringTaskRule.create({
      data: {
        orgId,
        categoryId: categoryMap[seed.categoryKey],
        name: seed.name,
        description: seed.description,
        cronExpression: seed.cronExpression,
        appliesToRole: seed.appliesToRole,
        defaultQuantity: seed.defaultQuantity,
        active: true,
      },
    });
  }

  // Auto rules — keyed by (orgId, triggerType + categoryKey).
  const existingAuto = await prisma.autoTaskRule.findMany({
    where: { orgId },
    select: { triggerType: true, categoryId: true },
  });
  const existingAutoSet = new Set(
    existingAuto.map((a) => `${a.triggerType}|${a.categoryId}`),
  );
  for (const seed of AUTO_SEEDS) {
    const catId = categoryMap[seed.categoryKey];
    const key = `${seed.triggerType}|${catId}`;
    if (existingAutoSet.has(key)) continue;
    await prisma.autoTaskRule.create({
      data: {
        orgId,
        categoryId: catId,
        triggerType: seed.triggerType,
        triggerCondition: seed.triggerCondition as object,
        dueInHours: seed.dueInHours,
        messageTemplate: seed.messageTemplate,
        active: true,
      },
    });
  }
}
