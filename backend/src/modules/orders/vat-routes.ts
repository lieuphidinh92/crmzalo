/**
 * vat-routes.ts — nghiệp vụ xuất hoá đơn VAT cho đơn hàng.
 *
 * Quy trình anh Philip chốt 24/8/2026 (5 bước):
 *   1. Sale bấm "Yêu cầu xuất VAT" trên đơn đã hoàn tất  → order-transitions.ts
 *   2. Đơn chuyển trạng thái `requested` (chờ kế toán xuất)
 *   3. Kế toán xuất hoá đơn trên phần mềm hoá đơn NGOÀI hệ thống
 *   4. Kế toán quay lại đây điền số hoá đơn + ngày + GIÁ TRỊ + file đính kèm
 *   5. Sale thấy nhãn đổi màu + nhận thông báo ở chuông
 *
 * Vì sao mỗi lần xuất là 1 DÒNG trong `vat_invoices` chứ không phải cột trên
 * Order: 1 đơn có thể xuất NHIỀU hoá đơn, cộng dồn tới khi đủ tổng tiền đơn
 * ("Xuất một phần" → "Đã xuất đủ"), và màn chi tiết đơn có "Xem lịch sử xuất VAT".
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import {
  orderScopeWhere,
  canSeeAllOrders,
  ORDER_FULL_INCLUDE,
  stripCostFromOrder,
  normalizeStatus,
  reqUser,
  toNumber,
} from './order-service.js';
import { uploadToStorage, extForMime, storageConfigured } from '../../shared/storage/supabase-storage.js';

/**
 * Quyền LÀM HOÁ ĐƠN VAT (anh Philip chốt 24/8/2026).
 *
 * ⛔ Cố ý KHÔNG dùng `canSeeAllOrders`: cờ `canViewAllOrders` cấp cho Thạch Quang
 * Huy để XEM đơn đi giao, không phải để xác nhận hoá đơn. Gộp 2 quyền vào 1 cờ
 * là đúng cái bẫy đã gặp hồi tháng 8 (phải nâng admin mới cho xem full đơn → lộ
 * giá vốn). owner/admin luôn có; member phải bật `can_issue_vat` (chị Mai Hiền).
 */
export function canIssueVatInvoice(user: { role: string; canIssueVat?: boolean }): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.canIssueVat === true;
}

/** 5 trạng thái xuất VAT của 1 đơn. Nguồn chuẩn duy nhất — đừng hardcode nơi khác. */
export const VAT_STATUSES = ['not_issued', 'requested', 'partial', 'issued', 'skipped'] as const;
export type VatStatus = (typeof VAT_STATUSES)[number];

/** Tổng tiền đơn (số CÓ VAT) — cơ sở để biết đã xuất đủ hay chưa. */
function orderTotal(o: { totalAmountValue: unknown; totalAmount: unknown }): number {
  const v = toNumber(o.totalAmountValue);
  return v > 0 ? Math.round(v) : Math.round(toNumber(o.totalAmount));
}

/**
 * Tính lại trạng thái + cột lưu sẵn từ các dòng hoá đơn thực tế.
 *
 * PHẢI gọi trong cùng transaction với mọi thay đổi `vat_invoices` — cột
 * `vatIssuedAmount` lệch là hàng chờ của kế toán ra sai (bài học `total_stock`).
 */
async function recomputeVat(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, totalAmount: true, totalAmountValue: true,
      vatRequestedAt: true, vatSkippedAt: true,
    },
  });
  if (!order) return;

  const rows = await tx.vatInvoice.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    select: {
      amount: true, invoiceNumber: true, lookupCode: true, fileUrl: true,
      createdAt: true, issuedById: true,
    },
  });

  const issuedAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const total = orderTotal(order);

  let status: VatStatus;
  if (issuedAmount <= 0) {
    // Chưa có hoá đơn nào → quay về đúng chỗ cũ trong quy trình.
    status = order.vatSkippedAt ? 'skipped' : order.vatRequestedAt ? 'requested' : 'not_issued';
  } else if (issuedAmount >= total) {
    status = 'issued';
  } else {
    status = 'partial';
  }

  const latest = rows[0];
  await tx.order.update({
    where: { id: orderId },
    data: {
      vatInvoiceStatus: status,
      vatIssuedAmount: issuedAmount,
      // Cột lưu sẵn của LẦN GẦN NHẤT — để danh sách đơn hiện số hoá đơn mà
      // không phải join bảng lịch sử.
      vatInvoiceId: latest?.invoiceNumber ?? null,
      vatInvoiceUrl: latest?.fileUrl ?? null,
      vatIssuedAt: latest?.createdAt ?? null,
      vatIssuedById: latest?.issuedById ?? null,
      needsVatInvoice: issuedAmount > 0 ? true : undefined,
    },
  });
}

export async function vatRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/vat/summary — 4 thẻ tổng hợp đầu màn "Xuất VAT" ─────────
  // Chờ xuất · Xuất một phần · Đã xuất đủ · Không xuất (số đơn + tổng tiền).
  app.get('/api/v1/vat/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!canIssueVatInvoice(user)) {
        return reply.status(403).send({ error: 'Bạn không có quyền xem bàn xuất VAT.' });
      }
      const scope = orderScopeWhere(user);
      const groups = await prisma.order.groupBy({
        by: ['vatInvoiceStatus'],
        where: { AND: [scope, { vatInvoiceStatus: { in: ['requested', 'partial', 'issued', 'skipped'] } }] },
        _count: { id: true },
        _sum: { totalAmountValue: true, vatIssuedAmount: true },
      });

      const summary: Record<string, { count: number; amount: number }> = {
        requested: { count: 0, amount: 0 },
        partial: { count: 0, amount: 0 },
        issued: { count: 0, amount: 0 },
        skipped: { count: 0, amount: 0 },
      };
      for (const g of groups as any[]) {
        const key = g.vatInvoiceStatus as string;
        if (!summary[key]) continue;
        summary[key] = {
          count: g._count.id,
          // "Tổng tiền" của nhóm = tiền CẦN xuất (tổng đơn), trừ nhóm xuất một
          // phần thì kế toán quan tâm phần CÒN LẠI phải xuất.
          amount: Math.round(
            key === 'partial'
              ? toNumber(g._sum.totalAmountValue) - toNumber(g._sum.vatIssuedAmount)
              : toNumber(g._sum.totalAmountValue),
          ),
        };
      }
      return { summary };
    } catch (err) {
      logger.error('[vat] Summary error:', err);
      return reply.status(500).send({ error: 'Lỗi tải tổng hợp xuất VAT' });
    }
  });

  // ── GET /api/v1/vat/queue — bảng danh sách chờ xử lý của kế toán ────────
  app.get('/api/v1/vat/queue', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!canIssueVatInvoice(user)) {
        return reply.status(403).send({ error: 'Bạn không có quyền xem bàn xuất VAT.' });
      }
      const q = request.query as Partial<{
        status: string; saleId: string; contactId: string;
        from: string; to: string; search: string; page: string; limit: string;
      }>;

      const page = Math.max(1, parseInt(q.page ?? '1') || 1);
      const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? '20') || 20));

      const filters: Prisma.OrderWhereInput[] = [orderScopeWhere(user)];
      const status = q.status && (VAT_STATUSES as readonly string[]).includes(q.status)
        ? q.status
        : 'requested';
      filters.push({ vatInvoiceStatus: status });
      if (q.saleId) filters.push({ assignedSaleId: q.saleId });
      if (q.contactId) filters.push({ contactId: q.contactId });
      if (q.from || q.to) {
        // Lọc theo NGÀY YÊU CẦU. Hai mốc cùng hệ quy chiếu giờ VN — để
        // `new Date('YYYY-MM-DD')` trơ là nửa đêm UTC = 07:00 VN, sót yêu cầu
        // gửi lúc rạng sáng.
        const range: Prisma.DateTimeFilter = {};
        if (q.from) range.gte = new Date(q.from + 'T00:00:00');
        if (q.to) range.lte = new Date(q.to + 'T23:59:59');
        filters.push({ vatRequestedAt: range });
      }
      if (q.search) {
        const s = q.search.trim();
        filters.push({
          OR: [
            { orderCode: { contains: s, mode: 'insensitive' } },
            { invoiceBuyerName: { contains: s, mode: 'insensitive' } },
            { invoiceTaxCode: { contains: s } },
            { contact: { fullName: { contains: s, mode: 'insensitive' } } },
            { contact: { storeName: { contains: s, mode: 'insensitive' } } },
          ],
        });
      }

      const where: Prisma.OrderWhereInput = { AND: filters };
      const [rows, total] = await Promise.all([
        prisma.order.findMany({
          where,
          select: {
            id: true, orderCode: true, orderDate: true, status: true,
            totalAmount: true, totalAmountValue: true,
            vatInvoiceStatus: true, vatIssuedAmount: true, vatRequestedAt: true,
            vatInvoiceId: true, vatIssuedAt: true, vatSkipReason: true,
            invoiceBuyerName: true, invoiceTaxCode: true, invoiceEmail: true,
            contact: { select: { id: true, fullName: true, storeName: true, phone: true } },
            assignedSale: { select: { id: true, fullName: true } },
          },
          orderBy: [{ vatRequestedAt: 'asc' }, { orderDate: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.order.count({ where }),
      ]);

      const orders = rows.map((o: any) => {
        const totalValue = orderTotal(o);
        return {
          ...o,
          totalValue,
          // Tiền CẦN xuất còn lại — cột "TIỀN CẦN XUẤT" trên bảng của kế toán.
          remainingAmount: Math.max(0, totalValue - (o.vatIssuedAmount ?? 0)),
        };
      });
      return { orders, total, page, limit };
    } catch (err) {
      logger.error('[vat] Queue error:', err);
      return reply.status(500).send({ error: 'Lỗi tải danh sách xuất VAT' });
    }
  });

  // ── GET /api/v1/orders/:id/vat-invoices — lịch sử xuất của 1 đơn ───────
  app.get('/api/v1/orders/:id/vat-invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const invoices = await prisma.vatInvoice.findMany({
        where: { orderId: id },
        orderBy: { createdAt: 'desc' },
        include: { issuedBy: { select: { id: true, fullName: true } } },
      });
      return { invoices };
    } catch (err) {
      logger.error('[vat] History error:', err);
      return reply.status(500).send({ error: 'Lỗi tải lịch sử xuất VAT' });
    }
  });

  // ── POST /api/v1/orders/:id/vat-invoices/file — upload PDF/XML ─────────
  app.post('/api/v1/orders/:id/vat-invoices/file', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!canIssueVatInvoice(user)) {
        return reply.status(403).send({ error: 'Chỉ kế toán/quản lý mới đính kèm hoá đơn.' });
      }
      if (!storageConfigured()) {
        return reply.status(503).send({
          error: 'Chưa cấu hình lưu trữ file trên máy chủ — nhờ anh Philip thêm key Supabase.',
        });
      }
      const { id } = request.params as { id: string };
      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const file = await (request as any).file?.();
      if (!file) return reply.status(400).send({ error: 'Thiếu file hoá đơn' });
      const mime = String(file.mimetype || '');
      const ext = extForMime(mime);
      if (!ext || !['pdf', 'xml'].includes(ext)) {
        return reply.status(400).send({ error: 'Chỉ nhận file PDF hoặc XML.' });
      }
      const buffer = await file.toBuffer();
      if (buffer.length === 0) return reply.status(400).send({ error: 'File rỗng' });

      const url = await uploadToStorage(buffer, mime, 'vat-invoices', order.id);
      return reply.status(201).send({ url, fileName: file.filename ?? `hoadon.${ext}`, size: buffer.length });
    } catch (err: any) {
      const code = err?.statusCode;
      if (code && code >= 400 && code < 600) return reply.status(code).send({ error: err.message });
      logger.error('[vat] Upload error:', err);
      return reply.status(500).send({ error: 'Lỗi tải file hoá đơn' });
    }
  });

  // ── POST /api/v1/orders/:id/vat-invoices — kế toán xác nhận đã xuất ────
  app.post('/api/v1/orders/:id/vat-invoices', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      // Quyền: kế toán/quản lý. Sale KHÔNG tự xác nhận đơn của mình đã xuất
      // (vừa xin vừa tự duyệt) — khác hẳn endpoint gửi yêu cầu.
      if (!canIssueVatInvoice(user)) {
        return reply.status(403).send({ error: 'Chỉ kế toán/quản lý mới xác nhận đã xuất hoá đơn.' });
      }
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        invoiceNumber?: string; invoiceDate?: string; amount?: number | string;
        lookupCode?: string; fileUrl?: string; note?: string;
      };

      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: {
          id: true, orgId: true, totalAmount: true, totalAmountValue: true,
          vatIssuedAmount: true, vatSkippedAt: true,
        },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      if (order.vatSkippedAt) {
        return reply.status(400).send({ error: 'Đơn đang ở nhóm "Không xuất" — bỏ đánh dấu trước đã.' });
      }

      const invoiceNumber = body.invoiceNumber?.trim();
      if (!invoiceNumber) return reply.status(400).send({ error: 'Thiếu số hoá đơn.' });
      if (invoiceNumber.length > 50) {
        return reply.status(400).send({ error: 'Số hoá đơn quá dài (tối đa 50 ký tự).' });
      }

      const dateStr = body.invoiceDate?.trim();
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return reply.status(400).send({ error: 'Thiếu ngày hoá đơn (định dạng YYYY-MM-DD).' });
      }
      const year = Number(dateStr.slice(0, 4));
      // Gõ thiếu số ở ô năm (vd '0029') từng làm cron đánh nhầm lô hết hạn —
      // trình duyệt không chặn năm 2 chữ số nên backend phải chặn.
      if (year < 2020 || year > 2100) {
        return reply.status(400).send({ error: 'Năm của ngày hoá đơn không hợp lệ.' });
      }
      // Cột @db.Date: PHẢI nửa đêm UTC. Nhét offset +07:00 là Postgres cắt DATE
      // lùi 1 ngày (đã dính vụ expiry_date 3/8/2026).
      const invoiceDate = new Date(dateStr + 'T00:00:00Z');

      const amount = Math.round(toNumber(body.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.status(400).send({ error: 'Giá trị hoá đơn phải lớn hơn 0.' });
      }

      const total = orderTotal(order);
      const already = order.vatIssuedAmount ?? 0;
      // Anh Philip chốt 24/8/2026: CHẶN CỨNG, không cho tổng hoá đơn vượt tiền đơn.
      if (already + amount > total) {
        const remain = Math.max(0, total - already);
        return reply.status(400).send({
          error: `Vượt tổng tiền đơn. Đơn ${total.toLocaleString('vi-VN')}đ, đã xuất ${already.toLocaleString('vi-VN')}đ, chỉ còn được xuất tối đa ${remain.toLocaleString('vi-VN')}đ.`,
        });
      }

      // Anh Philip chốt 24/8/2026: BẮT BUỘC đính kèm file hoá đơn. Không có file
      // thì sau này khách đòi bản gốc, kế toán phải lục lại phần mềm hoá đơn.
      const fileUrl = body.fileUrl?.trim() || null;
      if (!fileUrl) {
        return reply.status(400).send({ error: 'Bắt buộc đính kèm file hoá đơn (PDF hoặc XML).' });
      }
      if (!/^https?:\/\//i.test(fileUrl)) {
        return reply.status(400).send({ error: 'Link file hoá đơn không hợp lệ.' });
      }

      const lookupCode = body.lookupCode?.trim() || null;
      if (lookupCode && lookupCode.length > 100) {
        return reply.status(400).send({ error: 'Mã tra cứu quá dài (tối đa 100 ký tự).' });
      }
      const note = body.note?.trim() || null;
      if (note && note.length > 250) {
        return reply.status(400).send({ error: 'Ghi chú tối đa 250 ký tự.' });
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.vatInvoice.create({
          data: {
            orgId: order.orgId,
            orderId: order.id,
            invoiceNumber,
            lookupCode,
            invoiceDate,
            amount,
            fileUrl,
            note,
            issuedById: user.id,
          },
        });
        await recomputeVat(tx, order.id);
      });

      const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_FULL_INCLUDE });
      return reply.status(201).send({
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      });
    } catch (err) {
      logger.error('[vat] Create invoice error:', err);
      return reply.status(500).send({ error: 'Lỗi lưu hoá đơn đã xuất' });
    }
  });

  // ── DELETE /api/v1/orders/:id/vat-invoices/:invoiceId — bấm nhầm ───────
  app.delete('/api/v1/orders/:id/vat-invoices/:invoiceId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      if (!canIssueVatInvoice(user)) {
        return reply.status(403).send({ error: 'Chỉ kế toán/quản lý mới gỡ hoá đơn đã ghi.' });
      }
      const { id, invoiceId } = request.params as { id: string; invoiceId: string };
      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      const row = await prisma.vatInvoice.findFirst({
        where: { id: invoiceId, orderId: order.id },
        select: { id: true },
      });
      if (!row) return reply.status(404).send({ error: 'Không tìm thấy hoá đơn này' });

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.vatInvoice.delete({ where: { id: row.id } });
        await recomputeVat(tx, order.id);
      });

      const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_FULL_INCLUDE });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[vat] Delete invoice error:', err);
      return reply.status(500).send({ error: 'Lỗi gỡ hoá đơn' });
    }
  });

  // ── DELETE /api/v1/orders/:id/vat-request — sale RÚT yêu cầu xuất VAT ──
  // Khác "không xuất" (`vat-skip`, cần lý do, đơn nằm trong nhóm riêng để kế
  // toán biết đã xử lý): rút yêu cầu là đưa đơn về như chưa từng yêu cầu — dùng
  // khi sale bấm nhầm đơn hoặc khách chưa chốt lấy hoá đơn.
  // Quyền: `orderScopeWhere` — sale rút được yêu cầu của đơn mình.
  app.delete('/api/v1/orders/:id/vat-request', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };

      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true, vatIssuedAmount: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });
      if ((order.vatIssuedAmount ?? 0) > 0) {
        return reply.status(400).send({
          error: 'Đơn đã xuất hoá đơn — không rút yêu cầu được, báo kế toán để xử lý.',
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          vatInvoiceStatus: 'not_issued',
          needsVatInvoice: false,
          vatRequestedAt: null,
          vatRequestedById: null,
          vatSkipReason: null,
          vatSkippedAt: null,
          vatSkippedById: null,
        },
      });

      const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_FULL_INCLUDE });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[vat] Cancel request error:', err);
      return reply.status(500).send({ error: 'Lỗi rút yêu cầu xuất VAT' });
    }
  });

  // ── POST /api/v1/orders/:id/vat-skip — đánh dấu "Không xuất" ───────────
  // Anh Philip chốt 24/8/2026: SALE cũng đánh dấu được (khách đổi ý thì sale tự
  // rút yêu cầu, khỏi làm phiền kế toán) — nên dùng orderScopeWhere, không phải
  // canSeeAllOrders. Bắt buộc có lý do để sau còn truy.
  app.post('/api/v1/orders/:id/vat-skip', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = reqUser(request);
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { skip?: boolean; reason?: string };

      const order = await prisma.order.findFirst({
        where: { AND: [orderScopeWhere(user), { id }] },
        select: { id: true, vatIssuedAmount: true, vatRequestedAt: true },
      });
      if (!order) return reply.status(404).send({ error: 'Order not found' });

      if (body.skip === false) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            vatSkipReason: null,
            vatSkippedAt: null,
            vatSkippedById: null,
            vatInvoiceStatus: order.vatRequestedAt ? 'requested' : 'not_issued',
          },
        });
      } else {
        if ((order.vatIssuedAmount ?? 0) > 0) {
          return reply.status(400).send({
            error: 'Đơn đã xuất hoá đơn rồi — gỡ hoá đơn trước khi đánh dấu không xuất.',
          });
        }
        const reason = body.reason?.trim();
        if (!reason) return reply.status(400).send({ error: 'Vui lòng nhập lý do không xuất hoá đơn.' });
        if (reason.length > 250) return reply.status(400).send({ error: 'Lý do tối đa 250 ký tự.' });

        await prisma.order.update({
          where: { id: order.id },
          data: {
            vatSkipReason: reason,
            vatSkippedAt: new Date(),
            vatSkippedById: user.id,
            vatInvoiceStatus: 'skipped',
          },
        });
      }

      const full = await prisma.order.findUnique({ where: { id: order.id }, include: ORDER_FULL_INCLUDE });
      return {
        ...stripCostFromOrder(full!, user.role),
        statusNormalized: normalizeStatus(full!.status),
      };
    } catch (err) {
      logger.error('[vat] Skip error:', err);
      return reply.status(500).send({ error: 'Lỗi đánh dấu không xuất hoá đơn' });
    }
  });
}
