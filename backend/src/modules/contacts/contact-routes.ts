/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { invalidateCacheByPrefix } from '../reports/resale-service.js';
import { logCompliance } from '../../shared/utils/compliance-logger.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { getNextCustomerCode } from './customer-code-service.js';

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
