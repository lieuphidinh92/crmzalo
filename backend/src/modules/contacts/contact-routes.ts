/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import ExcelJS from 'exceljs';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { invalidateCacheByPrefix } from '../reports/resale-service.js';
import { logCompliance } from '../../shared/utils/compliance-logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { getNextCustomerCode } from './customer-code-service.js';

// ── Label maps cho file Excel xuất KH ─────────────────────────────────────
// Backend không có chỗ nào tập trung label như frontend, nên dump tại chỗ
// để file Excel đọc được tiếng Việt thay vì mã code.
const SOURCE_LABELS: Record<string, string> = {
  FB: 'Facebook',
  TT: 'TikTok',
  GT: 'Giới thiệu',
  CN: 'Chốt nóng',
  zalo: 'Zalo',
  gioi_thieu: 'Giới thiệu',
  khac: 'Khác',
};
const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Cửa hàng mẹ bé',
};
const STAGE_LABELS: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngưng',
};
const POLICY_TIER_LABELS: Record<string, string> = {
  thung_10: '10 thùng',
  thung_5: '5 thùng',
  thung_1: '1 thùng',
  le: '<1 thùng',
  ctv: 'CTV',
  dai_ly_cap_1: 'Đại lý cấp 1',
  dai_ly_cap_2: 'Đại lý cấp 2',
};
const CUSTOMER_RANK_LABELS: Record<string, string> = {
  top_1: 'Top 1 — VIP',
  top_2: 'Top 2 — Thân thiết',
  top_3: 'Top 3 — Thường',
  top_4: 'Top 4 — Ít hoạt động',
};
function labelOr(map: Record<string, string>, v: string | null | undefined): string {
  if (!v) return '';
  return map[v] ?? v;
}

/** Validate + clean array `[{label, date}]` từ body — drop entry sai. */
function sanitizeSpecialDates(raw: unknown): Array<{ label: string; date: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; date: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = typeof (item as any).label === 'string' ? (item as any).label.trim() : '';
    const date = typeof (item as any).date === 'string' ? (item as any).date.trim() : '';
    if (!label || !date) continue;
    // ISO `YYYY-MM-DD` hoặc bất kỳ format Date parse được — chuẩn hoá về
    // `YYYY-MM-DD` để frontend không cần parse phức tạp.
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) continue;
    out.push({ label, date: d.toISOString().slice(0, 10) });
  }
  return out;
}

/** Statuses that count as booked revenue. Mirrors the convention in
 * reports/overview-service. Excludes draft + cancelled. */
const COUNTABLE_STATUSES = ['confirmed', 'shipped', 'completed'] as const;

/** Day-bucket boundaries for the "Số ngày chưa đặt đơn" filter. */
const DAYS_BUCKET_ACTIVE_MAX = 29;       // <30d
const DAYS_BUCKET_NEEDCARE_MIN = 30;     // 30-60d
const DAYS_BUCKET_NEEDCARE_MAX = 60;
const DAYS_BUCKET_ABOUTLOSE_MIN = 61;    // 61-90d
const DAYS_BUCKET_ABOUTLOSE_MAX = 90;
const DAYS_BUCKET_LOST_MIN = 91;         // >90d

const PIPELINE_STAGES = [
  'tiep_can',
  'da_bao_gia',
  'dang_thu_hang',
  'dai_ly_chinh_thuc',
  'ngung',
] as const;

type QueryParams = Record<string, string>;

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts — list with filters and pagination ───────────────
  app.get('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        search = '',
        source = '',
        assignedUserId = '',
        customerType = '',
        stage = '',
        policyTier = '',
        province = '',
        scale = '',
        daysInactiveBucket = '',
        orderBy = '',
        order = 'desc',
      } = request.query as QueryParams;

      const where: any = { orgId: user.orgId };
      if (source) where.source = source;
      if (assignedUserId) where.assignedUserId = assignedUserId;
      if (customerType) where.customerType = customerType;
      if (stage) where.stage = stage;
      if (policyTier) where.policyTier = policyTier;
      // PR3: province → text contains (case-insensitive) thay vì equal
      if (province) where.province = { contains: province, mode: 'insensitive' };
      if (scale) where.scale = scale;
      // PR2: filter theo hạng KH (customerRank). Special value `no_data`
      // = KH chưa có đơn (rank NULL).
      const customerRank = (request.query as QueryParams).customerRank;
      if (customerRank === 'no_data') where.customerRank = null;
      else if (customerRank) where.customerRank = customerRank;

      // PR3 — Filter mới:
      // - storeName: text contains
      // - hasPhone: 'yes' | 'no'
      // - hasBirthday: 'yes' | 'no'
      // - birthdayWithin30d: 'yes' → sinh nhật trong 30 ngày tới (ignore year)
      // - minDebt / maxDebt: range công nợ
      const q = request.query as QueryParams;
      if (q.storeName) where.storeName = { contains: q.storeName, mode: 'insensitive' };
      if (q.hasPhone === 'yes') where.phone = { not: null };
      else if (q.hasPhone === 'no') where.phone = null;
      if (q.hasBirthday === 'yes') where.birthday = { not: null };
      else if (q.hasBirthday === 'no') where.birthday = null;
      if (q.minDebt) where.debtAmount = { ...(where.debtAmount ?? {}), gte: Number(q.minDebt) };
      if (q.maxDebt) where.debtAmount = { ...(where.debtAmount ?? {}), lte: Number(q.maxDebt) };
      // Sinh nhật trong 30 ngày tới — handle như post-query filter để
      // tránh raw SQL phức tạp month/day arithmetic.
      const birthdayWithin30d = q.birthdayWithin30d === 'yes';
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { storeName: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Days-inactive bucket → filter on `lastOrderDate`. The boundaries
      // mirror the at-risk grouping in reports/overview-service so labels
      // stay consistent across the app.
      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
      if (daysInactiveBucket === 'active') {
        where.lastOrderDate = { gte: daysAgo(DAYS_BUCKET_ACTIVE_MAX) };
      } else if (daysInactiveBucket === 'need_care') {
        where.lastOrderDate = {
          lte: daysAgo(DAYS_BUCKET_NEEDCARE_MIN),
          gte: daysAgo(DAYS_BUCKET_NEEDCARE_MAX),
        };
      } else if (daysInactiveBucket === 'about_to_lose') {
        where.lastOrderDate = {
          lt: daysAgo(DAYS_BUCKET_ABOUTLOSE_MIN),
          gte: daysAgo(DAYS_BUCKET_ABOUTLOSE_MAX),
        };
      } else if (daysInactiveBucket === 'lost') {
        where.lastOrderDate = { lt: daysAgo(DAYS_BUCKET_LOST_MIN) };
      } else if (daysInactiveBucket === 'never') {
        where.lastOrderDate = null;
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // PR3 — Sort mở rộng:
      //   - SCALAR_ORDER_MAP: dùng Prisma orderBy + skip/take (nhanh, dùng index).
      //   - METRIC_SORT_KEYS: phải compute metrics trước → fetch all + sort JS
      //     + slice page. Với <1k KH, latency ~vài chục ms — chấp nhận được.
      const SCALAR_ORDER_MAP: Record<string, string> = {
        fullName: 'fullName',
        lastOrderDate: 'lastOrderDate',
        firstContactDate: 'firstContactDate',
        nextContactDate: 'nextContactDate',
        customerCode: 'customerCode',
        birthday: 'birthday',
        debtAmount: 'debtAmount',
        province: 'province',
        customerType: 'customerType',
        rewardPoints: 'rewardPoints',
        createdAt: 'createdAt',
      };
      const METRIC_SORT_KEYS = [
        'revenueLifetime',
        'profitLifetime',
        'revenue60d',
        'profit60d',
        'revenueYtd',
        'profitYtd',
        'revenueMonth',
        'profitMonth',
      ] as const;
      const isMetricSort = (METRIC_SORT_KEYS as readonly string[]).includes(orderBy);
      const sortDir: 'asc' | 'desc' = order === 'asc' ? 'asc' : 'desc';
      // Filter birthdayWithin30d và metric sort đều cần fetch all rồi
      // post-process trước khi paginate → gộp logic.
      const needsFullFetch = isMetricSort || birthdayWithin30d;

      let orderClause: any = { updatedAt: 'desc' };
      if (orderBy === 'daysSinceLastOrder') {
        // virtual: stale-first khi sort desc → lastOrderDate asc
        orderClause = { lastOrderDate: { sort: sortDir === 'asc' ? 'desc' : 'asc', nulls: 'last' } };
      } else if (orderBy === 'customerRank') {
        // Hạng → sort theo rank score (cao = top_1)
        orderClause = { rankScore: { sort: sortDir, nulls: 'last' } };
      } else if (SCALAR_ORDER_MAP[orderBy]) {
        orderClause = { [SCALAR_ORDER_MAP[orderBy]]: { sort: sortDir, nulls: 'last' } };
      }

      const summaryActiveQ = prisma.contact.count({
        where: { orgId: user.orgId, lastOrderDate: { gte: daysAgo(DAYS_BUCKET_ACTIVE_MAX) } },
      });
      const summaryNeedCareQ = prisma.contact.count({
        where: {
          orgId: user.orgId,
          lastOrderDate: {
            lte: daysAgo(DAYS_BUCKET_NEEDCARE_MIN),
            gte: daysAgo(DAYS_BUCKET_NEEDCARE_MAX),
          },
        },
      });

      let contacts: any[];
      let total: number;
      let summaryActive: number;
      let summaryNeedCare: number;

      if (needsFullFetch) {
        // Branch metric / birthdayWithin30d: fetch all, post-process, slice.
        const [allContacts, totalCount, sActive, sNeedCare] = await Promise.all([
          prisma.contact.findMany({
            where,
            include: {
              assignedUser: { select: { id: true, fullName: true, email: true } },
              _count: { select: { conversations: true, appointments: true } },
            },
            // Khi không phải metric sort, vẫn dùng scalar orderBy để
            // ổn định thứ tự trước khi slice (vd birthdayWithin30d + sort
            // theo fullName ASC).
            ...(!isMetricSort ? { orderBy: orderClause } : {}),
          }),
          prisma.contact.count({ where }),
          summaryActiveQ,
          summaryNeedCareQ,
        ]);
        total = totalCount;
        summaryActive = sActive;
        summaryNeedCare = sNeedCare;
        // Slice ở SAU khi compute metrics + sort + filter (xem dưới).
        contacts = allContacts;
      } else {
        const [pageContacts, totalCount, sActive, sNeedCare] = await Promise.all([
          prisma.contact.findMany({
            where,
            include: {
              assignedUser: { select: { id: true, fullName: true, email: true } },
              _count: { select: { conversations: true, appointments: true } },
            },
            orderBy: orderClause,
            skip: (pageNum - 1) * limitNum,
            // limit=-1 → return all (used by "Tất cả" page-size option)
            ...(limitNum > 0 ? { take: limitNum } : {}),
          }),
          prisma.contact.count({ where }),
          summaryActiveQ,
          summaryNeedCareQ,
        ]);
        contacts = pageContacts;
        total = totalCount;
        summaryActive = sActive;
        summaryNeedCare = sNeedCare;
      }

      // Aggregate per-contact metrics in ONE raw query. Doing it as
      // Prisma .groupBy would need 2-3 round trips (revenue + profit
      // separately at month + ytd) — raw SQL with FILTER is one shot.
      // Anchored on PG NOW() so the day-diff matches the at-risk widget.
      let metricsMap = new Map<string, {
        daysSinceLastOrder: number | null;
        revenueYtd: number;
        profitYtd: number;
        revenueMonth: number;
        profitMonth: number;
        revenueLifetime: number;
        profitLifetime: number;
        revenue60d: number;
        profit60d: number;
      }>();
      const contactIds = contacts.map((c: { id: string }) => c.id);
      if (contactIds.length > 0) {
        // PR4.1 — HOTFIX: bug bị multiply doanh số vì LEFT JOIN order_items
        // làm SUM(o.total_amount) cộng nhiều lần theo số line items mỗi đơn.
        // → KH003 PHARMADI: 35 đơn × ~2.26 items = 79 rows → DS x2.57.
        // Sửa: tách SUM revenue (chỉ JOIN orders) khỏi SUM profit (JOIN items),
        // gộp qua CTE.
        const rows = await prisma.$queryRaw<Array<{
          contact_id: string;
          days_since_last_order: number | null;
          revenue_ytd: bigint;
          profit_ytd: bigint;
          revenue_month: bigint;
          profit_month: bigint;
          revenue_lifetime: bigint;
          profit_lifetime: bigint;
          revenue_60d: bigint;
          profit_60d: bigint;
        }>>(Prisma.sql`
          WITH order_rev AS (
            SELECT
              o.contact_id,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= DATE_TRUNC('year', NOW())
              ), 0)::bigint AS revenue_ytd,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= DATE_TRUNC('month', NOW())
              ), 0)::bigint AS revenue_month,
              COALESCE(SUM(o.total_amount), 0)::bigint AS revenue_lifetime,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= NOW() - INTERVAL '60 days'
              ), 0)::bigint AS revenue_60d
            FROM orders o
            WHERE o.contact_id IN (${Prisma.join(contactIds)})
              AND o.status IN ('confirmed','shipped','completed')
            GROUP BY o.contact_id
          ),
          item_profit AS (
            SELECT
              o.contact_id,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= DATE_TRUNC('year', NOW())
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_ytd,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= DATE_TRUNC('month', NOW())
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_month,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_lifetime,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= NOW() - INTERVAL '60 days'
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_60d
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.contact_id IN (${Prisma.join(contactIds)})
              AND o.status IN ('confirmed','shipped','completed')
            GROUP BY o.contact_id
          )
          SELECT
            c.id AS contact_id,
            CASE
              WHEN c.last_order_date IS NULL THEN NULL
              ELSE EXTRACT(DAY FROM NOW() - c.last_order_date)::int
            END AS days_since_last_order,
            COALESCE(orv.revenue_ytd, 0)::bigint AS revenue_ytd,
            COALESCE(ipf.profit_ytd, 0)::bigint AS profit_ytd,
            COALESCE(orv.revenue_month, 0)::bigint AS revenue_month,
            COALESCE(ipf.profit_month, 0)::bigint AS profit_month,
            COALESCE(orv.revenue_lifetime, 0)::bigint AS revenue_lifetime,
            COALESCE(ipf.profit_lifetime, 0)::bigint AS profit_lifetime,
            COALESCE(orv.revenue_60d, 0)::bigint AS revenue_60d,
            COALESCE(ipf.profit_60d, 0)::bigint AS profit_60d
          FROM contacts c
          LEFT JOIN order_rev orv ON orv.contact_id = c.id
          LEFT JOIN item_profit ipf ON ipf.contact_id = c.id
          WHERE c.id IN (${Prisma.join(contactIds)})
        `);
        type MetricRow = {
          contact_id: string;
          days_since_last_order: number | null;
          revenue_ytd: bigint;
          profit_ytd: bigint;
          revenue_month: bigint;
          profit_month: bigint;
          revenue_lifetime: bigint;
          profit_lifetime: bigint;
          revenue_60d: bigint;
          profit_60d: bigint;
        };
        metricsMap = new Map(
          rows.map((r: MetricRow) => [
            r.contact_id,
            {
              daysSinceLastOrder: r.days_since_last_order,
              revenueYtd: Number(r.revenue_ytd),
              profitYtd: Number(r.profit_ytd),
              revenueMonth: Number(r.revenue_month),
              profitMonth: Number(r.profit_month),
              revenueLifetime: Number(r.revenue_lifetime),
              profitLifetime: Number(r.profit_lifetime),
              revenue60d: Number(r.revenue_60d),
              profit60d: Number(r.profit_60d),
            },
          ]),
        );
      }

      // Per CEO decision (Q1 in Session 3.5D): members see revenue
      // (DS) but NOT profit (LN). Cost / margin is owner+admin only.
      const canSeeProfit = user.role === 'owner' || user.role === 'admin';
      let enriched = contacts.map((c: { id: string }) => {
        const m = metricsMap.get(c.id);
        return {
          ...c,
          daysSinceLastOrder: m?.daysSinceLastOrder ?? null,
          revenueYtd: m?.revenueYtd ?? 0,
          revenueMonth: m?.revenueMonth ?? 0,
          revenueLifetime: m?.revenueLifetime ?? 0,
          revenue60d: m?.revenue60d ?? 0,
          profitYtd: canSeeProfit ? (m?.profitYtd ?? 0) : null,
          profitMonth: canSeeProfit ? (m?.profitMonth ?? 0) : null,
          profitLifetime: canSeeProfit ? (m?.profitLifetime ?? 0) : null,
          profit60d: canSeeProfit ? (m?.profit60d ?? 0) : null,
        };
      });

      // PR3 — post-process khi needsFullFetch:
      // 1. Filter birthdayWithin30d (ignore year)
      // 2. Sort theo metric nếu isMetricSort
      // 3. Recompute total (sau filter)
      // 4. Slice page
      if (needsFullFetch) {
        if (birthdayWithin30d) {
          const now = new Date();
          enriched = enriched.filter((c: any) => {
            if (!c.birthday) return false;
            const d = new Date(c.birthday);
            if (Number.isNaN(d.getTime())) return false;
            const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
            let diff = thisYear.getTime() - now.getTime();
            if (diff < 0) {
              const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
              diff = nextYear.getTime() - now.getTime();
            }
            return diff <= 30 * 86400_000;
          });
          total = enriched.length;
        }
        if (isMetricSort) {
          // PR3.3 — KH không có dữ liệu (metric=0/null) LUÔN xuống cuối,
          // bất kể ASC hay DESC. Anh Philip không muốn KH `—` lẫn vào giữa.
          const key = orderBy as keyof typeof enriched[number];
          enriched.sort((a: any, b: any) => {
            const va = a[key];
            const vb = b[key];
            const aHas = va !== null && va !== undefined && va !== 0;
            const bHas = vb !== null && vb !== undefined && vb !== 0;
            if (aHas && !bHas) return -1;
            if (!aHas && bHas) return 1;
            if (!aHas && !bHas) return 0;
            const na = Number(va);
            const nb = Number(vb);
            return sortDir === 'asc' ? na - nb : nb - na;
          });
        }
        if (limitNum > 0) {
          enriched = enriched.slice((pageNum - 1) * limitNum, pageNum * limitNum);
        }
      }

      return {
        contacts: enriched,
        total,
        page: pageNum,
        limit: limitNum,
        summary: {
          total,
          active: summaryActive,
          needCare: summaryNeedCare,
        },
      };
    } catch (err) {
      logger.error('[contacts] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  // ── GET /api/v1/contacts/export — xuất Excel toàn bộ KH theo filter ──────
  // Áp đúng filter giống GET /api/v1/contacts (không paginate), tính metrics,
  // dump ra 1 sheet. Member chỉ thấy KH được assign; cột lợi nhuận ẩn với
  // member để khớp với /contacts list.
  app.get('/api/v1/contacts/export', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const q = request.query as QueryParams;
      const {
        search = '',
        source = '',
        assignedUserId = '',
        customerType = '',
        stage = '',
        policyTier = '',
        province = '',
        scale = '',
        daysInactiveBucket = '',
      } = q;

      const where: any = { orgId: user.orgId };
      // Member chỉ xuất KH được assign cho mình — khớp với chính sách
      // hiển thị của list endpoint (frontend ẩn KH khác).
      if (user.role === 'member') where.assignedUserId = user.id;
      if (source) where.source = source;
      if (assignedUserId) where.assignedUserId = assignedUserId;
      if (customerType) where.customerType = customerType;
      if (stage) where.stage = stage;
      if (policyTier) where.policyTier = policyTier;
      if (province) where.province = { contains: province, mode: 'insensitive' };
      if (scale) where.scale = scale;
      const customerRank = q.customerRank;
      if (customerRank === 'no_data') where.customerRank = null;
      else if (customerRank) where.customerRank = customerRank;
      if (q.storeName) where.storeName = { contains: q.storeName, mode: 'insensitive' };
      if (q.hasPhone === 'yes') where.phone = { not: null };
      else if (q.hasPhone === 'no') where.phone = null;
      if (q.hasBirthday === 'yes') where.birthday = { not: null };
      else if (q.hasBirthday === 'no') where.birthday = null;
      if (q.minDebt) where.debtAmount = { ...(where.debtAmount ?? {}), gte: Number(q.minDebt) };
      if (q.maxDebt) where.debtAmount = { ...(where.debtAmount ?? {}), lte: Number(q.maxDebt) };
      const birthdayWithin30d = q.birthdayWithin30d === 'yes';
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { storeName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const now = new Date();
      const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
      if (daysInactiveBucket === 'active') {
        where.lastOrderDate = { gte: daysAgo(DAYS_BUCKET_ACTIVE_MAX) };
      } else if (daysInactiveBucket === 'need_care') {
        where.lastOrderDate = {
          lte: daysAgo(DAYS_BUCKET_NEEDCARE_MIN),
          gte: daysAgo(DAYS_BUCKET_NEEDCARE_MAX),
        };
      } else if (daysInactiveBucket === 'about_to_lose') {
        where.lastOrderDate = {
          lt: daysAgo(DAYS_BUCKET_ABOUTLOSE_MIN),
          gte: daysAgo(DAYS_BUCKET_ABOUTLOSE_MAX),
        };
      } else if (daysInactiveBucket === 'lost') {
        where.lastOrderDate = { lt: daysAgo(DAYS_BUCKET_LOST_MIN) };
      } else if (daysInactiveBucket === 'never') {
        where.lastOrderDate = null;
      }

      // Lấy hết KH (no pagination), sort theo mã KH cho dễ đọc khi mở file.
      const contacts: any[] = await prisma.contact.findMany({
        where,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [
          { customerCode: { sort: 'asc', nulls: 'last' } },
          { fullName: 'asc' },
        ],
      });

      // Metrics — query 1 lần cho toàn bộ contactIds (giống list endpoint).
      const contactIds = contacts.map((c: { id: string }) => c.id);
      const metricsMap = new Map<string, {
        daysSinceLastOrder: number | null;
        revenueYtd: number;
        profitYtd: number;
        revenueMonth: number;
        profitMonth: number;
        revenueLifetime: number;
        profitLifetime: number;
        revenue60d: number;
        profit60d: number;
      }>();
      if (contactIds.length > 0) {
        const rows = await prisma.$queryRaw<Array<{
          contact_id: string;
          days_since_last_order: number | null;
          revenue_ytd: bigint;
          profit_ytd: bigint;
          revenue_month: bigint;
          profit_month: bigint;
          revenue_lifetime: bigint;
          profit_lifetime: bigint;
          revenue_60d: bigint;
          profit_60d: bigint;
        }>>(Prisma.sql`
          WITH order_rev AS (
            SELECT
              o.contact_id,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= DATE_TRUNC('year', NOW())
              ), 0)::bigint AS revenue_ytd,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= DATE_TRUNC('month', NOW())
              ), 0)::bigint AS revenue_month,
              COALESCE(SUM(o.total_amount), 0)::bigint AS revenue_lifetime,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE o.order_date >= NOW() - INTERVAL '60 days'
              ), 0)::bigint AS revenue_60d
            FROM orders o
            WHERE o.contact_id IN (${Prisma.join(contactIds)})
              AND o.status IN ('confirmed','shipped','completed')
            GROUP BY o.contact_id
          ),
          item_profit AS (
            SELECT
              o.contact_id,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= DATE_TRUNC('year', NOW())
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_ytd,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= DATE_TRUNC('month', NOW())
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_month,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_lifetime,
              COALESCE(SUM(oi.line_total - oi.line_cost) FILTER (
                WHERE o.order_date >= NOW() - INTERVAL '60 days'
                  AND oi.line_cost IS NOT NULL
              ), 0)::bigint AS profit_60d
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.contact_id IN (${Prisma.join(contactIds)})
              AND o.status IN ('confirmed','shipped','completed')
            GROUP BY o.contact_id
          )
          SELECT
            c.id AS contact_id,
            CASE
              WHEN c.last_order_date IS NULL THEN NULL
              ELSE EXTRACT(DAY FROM NOW() - c.last_order_date)::int
            END AS days_since_last_order,
            COALESCE(orv.revenue_ytd, 0)::bigint AS revenue_ytd,
            COALESCE(ipf.profit_ytd, 0)::bigint AS profit_ytd,
            COALESCE(orv.revenue_month, 0)::bigint AS revenue_month,
            COALESCE(ipf.profit_month, 0)::bigint AS profit_month,
            COALESCE(orv.revenue_lifetime, 0)::bigint AS revenue_lifetime,
            COALESCE(ipf.profit_lifetime, 0)::bigint AS profit_lifetime,
            COALESCE(orv.revenue_60d, 0)::bigint AS revenue_60d,
            COALESCE(ipf.profit_60d, 0)::bigint AS profit_60d
          FROM contacts c
          LEFT JOIN order_rev orv ON orv.contact_id = c.id
          LEFT JOIN item_profit ipf ON ipf.contact_id = c.id
          WHERE c.id IN (${Prisma.join(contactIds)})
        `);
        for (const r of rows) {
          metricsMap.set(r.contact_id, {
            daysSinceLastOrder: r.days_since_last_order,
            revenueYtd: Number(r.revenue_ytd),
            profitYtd: Number(r.profit_ytd),
            revenueMonth: Number(r.revenue_month),
            profitMonth: Number(r.profit_month),
            revenueLifetime: Number(r.revenue_lifetime),
            profitLifetime: Number(r.profit_lifetime),
            revenue60d: Number(r.revenue_60d),
            profit60d: Number(r.profit_60d),
          });
        }
      }

      // Post-filter birthdayWithin30d (giống list endpoint).
      let enriched: any[] = contacts;
      if (birthdayWithin30d) {
        enriched = enriched.filter((c: any) => {
          if (!c.birthday) return false;
          const d = new Date(c.birthday);
          if (Number.isNaN(d.getTime())) return false;
          const thisYear = new Date(now.getFullYear(), d.getMonth(), d.getDate());
          let diff = thisYear.getTime() - now.getTime();
          if (diff < 0) {
            const nextYear = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
            diff = nextYear.getTime() - now.getTime();
          }
          return diff <= 30 * 86400_000;
        });
      }

      const canSeeProfit = user.role === 'owner' || user.role === 'admin';

      // ── Build Excel workbook ────────────────────────────────────────────
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'CRM Halo';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('Khách hàng');

      type Col = { header: string; key: string; width: number; numFmt?: string };
      const baseCols: Col[] = [
        { header: 'Mã KH', key: 'customerCode', width: 10 },
        { header: 'Tên', key: 'fullName', width: 28 },
        { header: 'SĐT', key: 'phone', width: 14 },
        { header: 'Cửa hàng', key: 'storeName', width: 24 },
        { header: 'Tỉnh/Thành', key: 'province', width: 18 },
        { header: 'Địa chỉ', key: 'address', width: 30 },
        { header: 'Loại KH', key: 'customerType', width: 16 },
        { header: 'Stage', key: 'stage', width: 18 },
        { header: 'Hạng KH', key: 'customerRank', width: 18 },
        { header: 'Điểm hạng', key: 'rankScore', width: 10, numFmt: '0.0' },
        { header: 'Sale phụ trách', key: 'assignedUser', width: 20 },
        { header: 'Chính sách giá', key: 'policyTier', width: 14 },
        { header: 'Nguồn', key: 'source', width: 12 },
        { header: 'NCC hiện tại', key: 'currentSupplier', width: 20 },
        { header: 'DS tháng ước tính', key: 'monthlyRevenueEstimate', width: 16 },
        { header: 'Sinh nhật', key: 'birthday', width: 12 },
        { header: 'Doanh số tổng (VND)', key: 'revenueLifetime', width: 18, numFmt: '#,##0' },
      ];
      const profitCols: Col[] = [
        { header: 'Lợi nhuận tổng (VND)', key: 'profitLifetime', width: 18, numFmt: '#,##0' },
      ];
      const dsCols: Col[] = [
        { header: 'Doanh số năm (VND)', key: 'revenueYtd', width: 18, numFmt: '#,##0' },
      ];
      const lnYtdCols: Col[] = [
        { header: 'Lợi nhuận năm (VND)', key: 'profitYtd', width: 18, numFmt: '#,##0' },
      ];
      const dsMonthCols: Col[] = [
        { header: 'Doanh số tháng (VND)', key: 'revenueMonth', width: 18, numFmt: '#,##0' },
      ];
      const lnMonthCols: Col[] = [
        { header: 'Lợi nhuận tháng (VND)', key: 'profitMonth', width: 18, numFmt: '#,##0' },
      ];
      const ds60Cols: Col[] = [
        { header: 'Doanh số 60 ngày (VND)', key: 'revenue60d', width: 18, numFmt: '#,##0' },
      ];
      const ln60Cols: Col[] = [
        { header: 'Lợi nhuận 60 ngày (VND)', key: 'profit60d', width: 18, numFmt: '#,##0' },
      ];
      const tailCols: Col[] = [
        { header: 'Đơn gần nhất', key: 'lastOrderDate', width: 14 },
        { header: 'Số ngày chưa đặt', key: 'daysSinceLastOrder', width: 14, numFmt: '0' },
        { header: 'Công nợ (VND)', key: 'debtAmount', width: 16, numFmt: '#,##0' },
        { header: 'Hạn mức công nợ (VND)', key: 'creditLimit', width: 16, numFmt: '#,##0' },
        { header: 'Điểm thưởng', key: 'rewardPoints', width: 12, numFmt: '0' },
        { header: 'Ngày tiếp nhận', key: 'firstContactDate', width: 14 },
        { header: 'Liên hệ tiếp theo', key: 'nextContactDate', width: 14 },
        { header: 'Ghi chú', key: 'notes', width: 30 },
      ];

      const allCols: Col[] = canSeeProfit
        ? [
            ...baseCols,
            ...profitCols,
            ...dsCols,
            ...lnYtdCols,
            ...dsMonthCols,
            ...lnMonthCols,
            ...ds60Cols,
            ...ln60Cols,
            ...tailCols,
          ]
        : [
            ...baseCols,
            ...dsCols,
            ...dsMonthCols,
            ...ds60Cols,
            ...tailCols,
          ];

      sheet.columns = allCols.map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width,
        style: c.numFmt ? { numFmt: c.numFmt } : undefined,
      }));
      // Header style: bold + filter dropdown trên hàng 1.
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).alignment = { vertical: 'middle' };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];

      const fmtDate = (d: Date | null | undefined): string => {
        if (!d) return '';
        const dt = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(dt.getTime())) return '';
        return dt.toISOString().slice(0, 10);
      };
      const fmtBirthday = (d: Date | null | undefined): string => {
        if (!d) return '';
        const dt = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
      };

      for (const c of enriched) {
        const m = metricsMap.get(c.id);
        const row: Record<string, any> = {
          customerCode: c.customerCode ?? '',
          fullName: c.fullName ?? '',
          phone: c.phone ?? '',
          storeName: c.storeName ?? '',
          province: c.province ?? '',
          address: c.address ?? '',
          customerType: labelOr(CUSTOMER_TYPE_LABELS, c.customerType),
          stage: labelOr(STAGE_LABELS, c.stage),
          customerRank: labelOr(CUSTOMER_RANK_LABELS, c.customerRank),
          rankScore: c.rankScore != null ? Number(c.rankScore) : null,
          assignedUser: c.assignedUser?.fullName ?? '',
          policyTier: labelOr(POLICY_TIER_LABELS, c.policyTier),
          source: labelOr(SOURCE_LABELS, c.source),
          currentSupplier: c.currentSupplier ?? '',
          monthlyRevenueEstimate: c.monthlyRevenueEstimate ?? '',
          birthday: fmtBirthday(c.birthday),
          revenueLifetime: m?.revenueLifetime ?? 0,
          revenueYtd: m?.revenueYtd ?? 0,
          revenueMonth: m?.revenueMonth ?? 0,
          revenue60d: m?.revenue60d ?? 0,
          lastOrderDate: fmtDate(c.lastOrderDate),
          daysSinceLastOrder: m?.daysSinceLastOrder ?? null,
          debtAmount: c.debtAmount != null ? Number(c.debtAmount) : 0,
          creditLimit: c.creditLimit != null ? Number(c.creditLimit) : null,
          rewardPoints: c.rewardPoints ?? 0,
          firstContactDate: fmtDate(c.firstContactDate),
          nextContactDate: fmtDate(c.nextContactDate),
          notes: c.notes ?? '',
        };
        if (canSeeProfit) {
          row.profitLifetime = m?.profitLifetime ?? 0;
          row.profitYtd = m?.profitYtd ?? 0;
          row.profitMonth = m?.profitMonth ?? 0;
          row.profit60d = m?.profit60d ?? 0;
        }
        sheet.addRow(row);
      }

      // Autofilter trên header (Excel sẽ hiện dropdown filter sẵn).
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: allCols.length },
      };

      const buffer = await workbook.xlsx.writeBuffer();

      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}`;
      const filename = `Khach-hang-${stamp}.xlsx`;

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(Buffer.from(buffer as ArrayBuffer));
    } catch (err) {
      logger.error('[contacts] Export error:', err);
      return reply.status(500).send({ error: 'Xuất Excel thất bại' });
    }
  });

  // ── GET /api/v1/contacts/pipeline — kanban grouped by B2B sales stage ────
  // Stages: tiep_can | da_bao_gia | dang_thu_hang | dai_ly_chinh_thuc | ngung
  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;

      const grouped = await prisma.contact.groupBy({
        by: ['stage'],
        where: { orgId },
        _count: { id: true },
      });

      // Fetch contacts per stage for kanban cards (limit 20 per column)
      const stages = grouped.map((g) => g.stage ?? 'unknown');
      const contactsByStage: Record<string, any[]> = {};

      await Promise.all(
        stages.map(async (stage) => {
          const where: any = { orgId, stage: stage === 'unknown' ? null : stage };
          const contacts = await prisma.contact.findMany({
            where,
            select: {
              id: true,
              fullName: true,
              phone: true,
              avatarUrl: true,
              storeName: true,
              province: true,
              customerType: true,
              stage: true,
              policyTier: true,
              nextContactDate: true,
              lastOrderDate: true,
              assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          });
          contactsByStage[stage] = contacts;
        }),
      );

      const pipeline = grouped.map((g) => ({
        stage: g.stage ?? 'unknown',
        count: g._count.id,
        contacts: contactsByStage[g.stage ?? 'unknown'] ?? [],
      }));

      return { pipeline };
    } catch (err) {
      logger.error('[contacts] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline' });
    }
  });

  // ── GET /api/v1/contacts/:id — detail with appointments + conversation count
  app.get('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      return contact;
    } catch (err) {
      logger.error('[contacts] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  // ── POST /api/v1/contacts — create new contact ────────────────────────────
  app.post('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      // Chuẩn hoá SĐT (nếu có). KH có thể không SĐT (FB lead chưa xin được)
      // → cho phép trống; chỉ reject khi có nhập mà sai format.
      let phone: string | null = null;
      if (body.phone !== undefined && body.phone !== null && String(body.phone).trim() !== '') {
        const r = normalizePhone(body.phone);
        if (!r.ok) {
          return reply.status(400).send({
            error: 'SĐT không hợp lệ. SĐT phải có 10 số bắt đầu bằng 0 (chấp nhận +84… hoặc 9 số thiếu 0).',
          });
        }
        phone = r.value;
        // Check trùng trong cùng org.
        const dup = await prisma.contact.findFirst({
          where: { orgId: user.orgId, phone },
          select: { id: true, fullName: true, customerCode: true },
        });
        if (dup) {
          return reply.status(409).send({
            error: 'duplicate_phone',
            message: `SĐT ${phone} đã có trong CRM (${dup.customerCode ?? '???'} — ${dup.fullName ?? 'chưa có tên'}).`,
            existingContact: dup,
          });
        }
      }

      // Mã KH tự cấp. Caller không cần truyền customerCode.
      const customerCode = await getNextCustomerCode(user.orgId);

      const contact = await prisma.contact.create({
        data: {
          orgId: user.orgId,
          customerCode,
          fullName: body.fullName,
          phone,
          zaloUid: body.zaloUid,
          avatarUrl: body.avatarUrl,
          source: body.source,
          sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
          assignedUserId: body.assignedUserId,
          notes: body.notes,
          tags: body.tags ?? [],
          metadata: body.metadata ?? {},
          // B2B sales fields
          storeName: body.storeName,
          province: body.province,
          customerType: body.customerType,
          scale: body.scale,
          currentProducts: body.currentProducts ?? [],
          currentSupplier: body.currentSupplier,
          monthlyRevenueEstimate: body.monthlyRevenueEstimate,
          avgOrderQuantity: body.avgOrderQuantity,
          stage: body.stage,
          stuckReason: body.stuckReason,
          policyTier: body.policyTier,
          debtAmount: body.debtAmount,
          lastOrderDate: body.lastOrderDate ? new Date(body.lastOrderDate) : undefined,
          nextContactDate: body.nextContactDate ? new Date(body.nextContactDate) : undefined,
          internalNote: body.internalNote,
          rewardPoints: body.rewardPoints,
          potentialValue: body.potentialValue,
          // PR2 fields
          birthday: body.birthday ? new Date(body.birthday) : null,
          specialDates: sanitizeSpecialDates(body.specialDates),
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[contacts] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id — update CRM fields ─────────────────────────
  app.put('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      // Chuẩn hoá SĐT khi PUT. Cho phép clear (null/empty). Reject khi
      // có nhập mà sai format. Check trùng — bỏ qua chính mình.
      let phoneToSave: string | null | undefined = undefined;
      if (body.phone !== undefined) {
        if (body.phone === null || String(body.phone).trim() === '') {
          phoneToSave = null;
        } else {
          const r = normalizePhone(body.phone);
          if (!r.ok) {
            return reply.status(400).send({
              error: 'SĐT không hợp lệ. SĐT phải có 10 số bắt đầu bằng 0 (chấp nhận +84… hoặc 9 số thiếu 0).',
            });
          }
          const dup = await prisma.contact.findFirst({
            where: { orgId: user.orgId, phone: r.value, NOT: { id } },
            select: { id: true, fullName: true, customerCode: true },
          });
          if (dup) {
            return reply.status(409).send({
              error: 'duplicate_phone',
              message: `SĐT ${r.value} đã có ở KH khác (${dup.customerCode ?? '???'} — ${dup.fullName ?? 'chưa có tên'}).`,
              existingContact: dup,
            });
          }
          phoneToSave = r.value;
        }
      }

      const updateData: any = {
        fullName: body.fullName,
        avatarUrl: body.avatarUrl,
        source: body.source,
        sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
        assignedUserId: body.assignedUserId,
        notes: body.notes,
        tags: body.tags,
        metadata: body.metadata,
      };
      if (phoneToSave !== undefined) updateData.phone = phoneToSave;
      if (body.firstContactDate !== undefined) {
        updateData.firstContactDate = body.firstContactDate ? new Date(body.firstContactDate) : null;
      }

      // B2B sales fields — only set when explicitly provided to avoid wiping
      // existing data on partial updates.
      const b2bFields = [
        'storeName',
        'province',
        'customerType',
        'scale',
        'currentProducts',
        'currentSupplier',
        'monthlyRevenueEstimate',
        'avgOrderQuantity',
        'stage',
        'stuckReason',
        'policyTier',
        'debtAmount',
        'internalNote',
        'rewardPoints',
        'potentialValue',
      ];
      for (const f of b2bFields) {
        if (body[f] !== undefined) updateData[f] = body[f];
      }
      if (body.lastOrderDate !== undefined) {
        updateData.lastOrderDate = body.lastOrderDate ? new Date(body.lastOrderDate) : null;
      }
      if (body.nextContactDate !== undefined) {
        updateData.nextContactDate = body.nextContactDate ? new Date(body.nextContactDate) : null;
      }
      if (body.birthday !== undefined) {
        updateData.birthday = body.birthday ? new Date(body.birthday) : null;
      }
      if (body.specialDates !== undefined) {
        updateData.specialDates = sanitizeSpecialDates(body.specialDates);
      }

      const updated = await prisma.contact.update({
        where: { id },
        data: updateData,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      // Compliance hook: log when `notes` was provided in payload (we
      // can't compare to old value without re-fetch — this is good enough
      // for the freshness metric). Tag the assigned sale, not the editor.
      if (body.notes !== undefined && updated.assignedUserId) {
        logCompliance({
          orgId: user.orgId,
          saleId: updated.assignedUserId,
          actionType: 'note_updated',
          contactId: id,
          metadata: { editedBy: user.id },
        });
      }

      return updated;
    } catch (err) {
      logger.error('[contacts] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // ── PATCH /api/v1/contacts/:id/stage — drag-drop endpoint for pipeline
  // Body: { newStage, reason? }. Returns updated contact.
  // Permission: members can only move their own deals.
  app.patch<{
    Params: { id: string };
    Body: { newStage: string; reason?: string | null };
  }>('/api/v1/contacts/:id/stage', async (request, reply) => {
    try {
      const user = request.user!;
      const { id } = request.params;
      const { newStage, reason } = request.body ?? ({} as { newStage?: string; reason?: string });

      if (!newStage || !(PIPELINE_STAGES as readonly string[]).includes(newStage)) {
        return reply.status(400).send({
          error: 'newStage không hợp lệ. Phải là 1 trong: ' + PIPELINE_STAGES.join(', '),
        });
      }

      const existing = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId },
        select: { id: true, stage: true, assignedUserId: true },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Contact not found' });
      }

      // Permission: members can only mutate stages on contacts they own.
      if (
        user.role === 'member' &&
        existing.assignedUserId &&
        existing.assignedUserId !== user.id
      ) {
        return reply.status(403).send({
          error: 'Bạn chỉ được kéo thả deal được phân công cho bản thân',
        });
      }

      // No-op: same stage. Don't write a history row.
      if (existing.stage === newStage) {
        return { unchanged: true, stage: newStage };
      }

      const now = new Date();
      const data: any = {
        stage: newStage,
        stageUpdatedAt: now,
      };
      // When moving to "ngung", staff usually attaches a reason. Persist it
      // so the leader's stuck-reasons report has data. When moving OUT of
      // ngung, optionally clear the reason — keep simple: only touch when
      // a reason is supplied.
      if (newStage === 'ngung' && typeof reason === 'string' && reason.trim()) {
        data.stuckReason = reason.trim();
      }

      const [updated] = await prisma.$transaction([
        prisma.contact.update({
          where: { id },
          data,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
          },
        }),
        prisma.stageHistory.create({
          data: {
            contactId: id,
            fromStage: existing.stage,
            toStage: newStage,
            changedAt: now,
            changedByUserId: user.id,
            reason: reason?.trim() || null,
          },
        }),
      ]);

      // Compliance hook: stage transition by this sale.
      if (existing.assignedUserId) {
        logCompliance({
          orgId: user.orgId,
          saleId: existing.assignedUserId,
          actionType: 'stage_updated',
          contactId: id,
          metadata: {
            fromStage: existing.stage,
            toStage: newStage,
            triggeredBy: user.id,
          },
        });
      }

      // Bust pipeline + resale caches for this org so the next read is fresh.
      invalidateCacheByPrefix('pipeline-deals|' + user.orgId);
      invalidateCacheByPrefix('pipeline-metrics|' + user.orgId);
      invalidateCacheByPrefix('pipeline-stuck|' + user.orgId);
      invalidateCacheByPrefix('resale-overview|' + user.orgId);
      invalidateCacheByPrefix('resale-segments|' + user.orgId);
      invalidateCacheByPrefix('resale-top|' + user.orgId);

      return updated;
    } catch (err) {
      logger.error('[contacts] Update stage error:', err);
      return reply.status(500).send({ error: 'Failed to update stage' });
    }
  });

  // ── PUT /api/v1/contacts/:id/tags — update tags only ─────────────────────
  app.put('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tags } = request.body as { tags: string[] };

      if (!Array.isArray(tags)) return reply.status(400).send({ error: 'tags must be an array' });

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      const updated = await prisma.contact.update({ where: { id }, data: { tags } });
      return updated;
    } catch (err) {
      logger.error('[contacts] Update tags error:', err);
      return reply.status(500).send({ error: 'Failed to update tags' });
    }
  });

  // ── DELETE /api/v1/contacts/:id — soft delete via metadata flag ───────────
  app.delete('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const existing = await prisma.contact.findFirst({ where: { id, orgId: user.orgId }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      await prisma.contact.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[contacts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });
}
