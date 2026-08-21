/**
 * API dành cho app do NHÂN VIÊN tự viết (namespace `/api/ext/v1/*`).
 * Xác thực bằng mã API (header `X-Api-Key`), KHÔNG dùng JWT.
 *
 *   GET /api/ext/v1/me                       kiểm tra mã còn sống + mã của ai
 *   GET /api/ext/v1/customers                khách được gán cho chính nhân viên đó
 *   GET /api/ext/v1/customers/:id            chi tiết 1 khách (của mình)
 *   GET /api/ext/v1/customers/:id/orders     đơn của khách đó
 *
 * 3 luật cứng của namespace này — đừng nới khi thêm endpoint mới:
 *   1. MỌI truy vấn phải có `orgId` + `assignedUserId = ctx.userId`. Không bao
 *      giờ đọc `request.user.role` ở đây: mã của admin cũng chỉ thấy khách
 *      của chính người đó (anh Philip chốt 21/8/2026).
 *   2. Dữ liệu trả về đi qua whitelist (`toPublicCustomer` / `toPublicOrder`) —
 *      KHÔNG `select: *`, KHÔNG trả giá vốn/lãi gộp/giá nhập dưới mọi hình thức.
 *   3. Giới hạn 60 lượt gọi/phút cho mỗi mã (app lỗi vòng lặp không được làm
 *      chết backend của cả công ty).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  apiKeyMiddleware,
  requireApiScope,
  API_SCOPE_READ,
} from '../auth/api-key-middleware.js';

/** Giới hạn theo TỪNG mã, không theo IP (nhiều app có thể chung 1 IP). */
const perKeyRateLimit = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute',
      keyGenerator: (request: FastifyRequest) =>
        (request.headers['x-api-key'] as string | undefined) ?? request.ip,
    },
  },
  preHandler: requireApiScope(API_SCOPE_READ),
};

/** Tiền VND: Decimal của Prisma → số nguyên đồng. */
function money(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value));
}

/** Ngày-không-giờ theo giờ VN (process.env.TZ đã ép Asia/Ho_Chi_Minh). */
function dateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whitelist field khách hàng. Cố tình KHÔNG trả: aiInsight (ghi chú AI nội bộ),
 * rankScore, metadata, internalNote, misaCustomerCode, hồ sơ hoá đơn VAT,
 * debtAmount/creditLimit (công nợ tổng — anh chốt đợt 1 chưa mở).
 */
function toPublicCustomer(c: any) {
  return {
    id: c.id,
    customerCode: c.customerCode,
    fullName: c.fullName,
    storeName: c.storeName,
    phone: c.phone,
    province: c.province,
    address: c.address,
    customerType: c.customerType,
    scale: c.scale,
    stage: c.stage,
    policyTier: c.policyTier,
    customerRank: c.customerRank,
    source: c.source,
    tags: c.tags,
    notes: c.notes,
    birthday: dateOnly(c.birthday),
    lastOrderDate: c.lastOrderDate ? c.lastOrderDate.toISOString() : null,
    nextContactDate: c.nextContactDate ? c.nextContactDate.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

const CUSTOMER_SELECT = {
  id: true,
  customerCode: true,
  fullName: true,
  storeName: true,
  phone: true,
  province: true,
  address: true,
  customerType: true,
  scale: true,
  stage: true,
  policyTier: true,
  customerRank: true,
  source: true,
  tags: true,
  notes: true,
  birthday: true,
  lastOrderDate: true,
  nextContactDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Whitelist field đơn hàng. Chỉ phần doanh thu (tiền khách trả) — KHÔNG có
 * giá vốn, lãi gộp, hay dòng hàng kèm cost.
 */
function toPublicOrder(o: any) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    // Ngày đặt thật; đơn cũ chưa nhập thì lấy ngày tạo (giống báo cáo CRM).
    orderDate: (o.orderDate ?? o.createdAt).toISOString(),
    status: o.status,
    totalAmount: money(o.totalAmountValue ?? o.totalAmount),
    paidAmount: money(o.paidAmount),
    debtAmount: money(o.debtAmountValue),
    debtDueDate: dateOnly(o.debtDueDate),
    shippingMethod: o.shippingMethod,
    trackingCode: o.trackingCode,
    createdAt: o.createdAt.toISOString(),
  };
}

const ORDER_SELECT = {
  id: true,
  orderCode: true,
  orderDate: true,
  status: true,
  totalAmount: true,
  totalAmountValue: true,
  paidAmount: true,
  debtAmountValue: true,
  debtDueDate: true,
  shippingMethod: true,
  trackingCode: true,
  createdAt: true,
} as const;

/** page/limit an toàn: limit tối đa 100 để 1 lệnh gọi không kéo cả DB. */
function paging(query: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * `updatedSince=YYYY-MM-DD` → mốc 00:00 GIỜ VN của ngày đó (không phải UTC).
 * Chặn năm ngoài 2000–2100: gõ thiếu số ("0029") từng làm cron đánh sai lô.
 * Trả `undefined` nếu không truyền, `null` nếu sai định dạng (route trả 400).
 */
function parseUpdatedSince(raw: string | undefined): Date | null | undefined {
  if (!raw) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return null;
  const d = new Date(`${raw.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function extCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', apiKeyMiddleware);

  // ── GET /api/ext/v1/me ─ để nhân viên test mã đã gắn đúng chưa ───────────
  app.get('/api/ext/v1/me', perKeyRateLimit, async (request: FastifyRequest) => {
    const ctx = request.apiKeyCtx!;
    return {
      user: { id: ctx.userId, fullName: ctx.userFullName },
      scope: ctx.scope,
      note: 'Mã này chỉ đọc được khách hàng được gán cho chính nhân viên trên.',
    };
  });

  // ── GET /api/ext/v1/customers ───────────────────────────────────────────
  app.get('/api/ext/v1/customers', perKeyRateLimit, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = request.apiKeyCtx!;
      const query = request.query as Record<string, string | undefined>;
      const { page, limit, skip } = paging(query);

      const updatedSince = parseUpdatedSince(query.updatedSince);
      if (updatedSince === null) {
        return reply.status(400).send({ error: 'updatedSince phải theo dạng YYYY-MM-DD (năm 2000–2100)' });
      }

      // Khoá cứng phạm vi: đúng công ty + đúng nhân viên sở hữu mã.
      const where: any = { orgId: ctx.orgId, assignedUserId: ctx.userId };
      if (updatedSince) where.updatedAt = { gte: updatedSince };

      const search = (query.search ?? '').trim();
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { storeName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { customerCode: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          select: CUSTOMER_SELECT,
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.contact.count({ where }),
      ]);

      return {
        customers: rows.map(toPublicCustomer),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (err) {
      logger.error('GET /api/ext/v1/customers lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách khách hàng' });
    }
  });

  // ── GET /api/ext/v1/customers/:id ───────────────────────────────────────
  app.get('/api/ext/v1/customers/:id', perKeyRateLimit, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = request.apiKeyCtx!;
      const { id } = request.params as { id: string };

      const customer = await prisma.contact.findFirst({
        where: { id, orgId: ctx.orgId, assignedUserId: ctx.userId },
        select: CUSTOMER_SELECT,
      });
      // Khách của người khác trả 404 (không phải 403) — không tiết lộ là có tồn tại.
      if (!customer) return reply.status(404).send({ error: 'Không tìm thấy khách hàng' });

      return { customer: toPublicCustomer(customer) };
    } catch (err) {
      logger.error('GET /api/ext/v1/customers/:id lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi tải khách hàng' });
    }
  });

  // ── GET /api/ext/v1/customers/:id/orders ────────────────────────────────
  app.get('/api/ext/v1/customers/:id/orders', perKeyRateLimit, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = request.apiKeyCtx!;
      const { id } = request.params as { id: string };
      const { page, limit, skip } = paging(request.query as Record<string, string | undefined>);

      // Kiểm khách có thuộc mình trước — nếu không, không được xem đơn.
      const owned = await prisma.contact.findFirst({
        where: { id, orgId: ctx.orgId, assignedUserId: ctx.userId },
        select: { id: true },
      });
      if (!owned) return reply.status(404).send({ error: 'Không tìm thấy khách hàng' });

      const where = { orgId: ctx.orgId, contactId: id };
      const [rows, total] = await Promise.all([
        prisma.order.findMany({
          where,
          select: ORDER_SELECT,
          orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      return {
        orders: rows.map(toPublicOrder),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (err) {
      logger.error('GET /api/ext/v1/customers/:id/orders lỗi:', err);
      return reply.status(500).send({ error: 'Lỗi tải đơn hàng của khách' });
    }
  });
}
