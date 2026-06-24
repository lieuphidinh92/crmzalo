/**
 * Supplier Debt (Công nợ NCC — Accounts Payable) REST endpoints.
 *
 * Mirrors the customer-debt (accounts receivable) pattern in debt-routes.ts
 * but for the purchasing side. Every confirmed ImportOrder automatically
 * becomes a payable; payments are recorded here and sync the parent
 * ImportOrder's paidAmount / debtAmount / paymentStatus atomically.
 *
 * All endpoints require owner|admin. member → 403 (cost data is sensitive).
 *
 *   GET  /api/v1/supplier-debt/summary              → KPI tổng quan
 *   GET  /api/v1/supplier-debt/suppliers             → NCC đang nợ
 *   GET  /api/v1/supplier-debt/suppliers/:id         → Chi tiết 1 NCC
 *   POST /api/v1/supplier-debt/payments              → Ghi nhận thanh toán
 *   GET  /api/v1/supplier-debt/payments              → Lịch sử thanh toán
 *   DELETE /api/v1/supplier-debt/payments/:id         → Xóa thanh toán (sai)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { toNumber, reqUser } from '../orders/order-service.js';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Where clause for confirmed import orders that still owe money. */
function debtImportWhere(orgId: string) {
  return {
    orgId,
    status: 'confirmed',
    debtAmount: { gt: 0 },
  };
}

/** Re-sync an ImportOrder's paid/debt/status from its SupplierPayment rows.
 *  Called after every payment create/delete. */
async function syncImportOrderDebt(importOrderId: string): Promise<void> {
  const payments = await prisma.supplierPayment.findMany({
    where: { importOrderId },
    select: { amount: true },
  });
  const totalPaid = payments.reduce((s, p) => s + toNumber(p.amount), 0);

  const order = await prisma.importOrder.findUnique({
    where: { id: importOrderId },
    select: { totalAmount: true },
  });
  if (!order) return;

  const total = toNumber(order.totalAmount);
  const debt = Math.max(0, total - totalPaid);
  const status = debt <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  await prisma.importOrder.update({
    where: { id: importOrderId },
    data: {
      paidAmount: totalPaid,
      debtAmount: debt,
      paymentStatus: status,
    },
  });
}

// ── Route registration ──────────────────────────────────────────────────

export async function supplierDebtRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/supplier-debt/summary ─────────────────────────────────
  // KPI cards: tổng nợ NCC, nợ quá hạn, số NCC đang nợ
  app.get(
    '/api/v1/supplier-debt/summary',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = reqUser(request);
        const now = new Date();

        const orders = await prisma.importOrder.findMany({
          where: debtImportWhere(orgId),
          select: {
            supplierId: true,
            debtAmount: true,
            paymentDueDate: true,
          },
        });

        let totalDebt = 0;
        let overdueDebt = 0;
        let overdueCount = 0;
        const supplierIds = new Set<string>();

        for (const o of orders) {
          const debt = toNumber(o.debtAmount);
          totalDebt += debt;
          if (o.supplierId) supplierIds.add(o.supplierId);
          if (o.paymentDueDate && new Date(o.paymentDueDate) < now) {
            overdueDebt += debt;
            overdueCount += 1;
          }
        }

        return {
          total_debt: Math.round(totalDebt),
          overdue_debt: Math.round(overdueDebt),
          overdue_order_count: overdueCount,
          supplier_count: supplierIds.size,
          total_order_count: orders.length,
        };
      } catch (err: any) {
        logger.error('supplier-debt summary error', err);
        return reply.status(500).send({ error: 'Lỗi tải tổng quan công nợ NCC' });
      }
    },
  );

  // ── GET /api/v1/supplier-debt/suppliers ────────────────────────────────
  // Danh sách NCC đang nợ, sắp xếp quá hạn lên đầu
  app.get(
    '/api/v1/supplier-debt/suppliers',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = reqUser(request);
        const now = new Date();

        const orders = await prisma.importOrder.findMany({
          where: debtImportWhere(orgId),
          select: {
            supplierId: true,
            debtAmount: true,
            totalAmount: true,
            paidAmount: true,
            paymentDueDate: true,
            importCode: true,
          },
        });

        if (orders.length === 0) return { suppliers: [] };

        type Agg = {
          debt: number;
          total: number;
          paid: number;
          overdue_debt: number;
          order_count: number;
          overdue_orders: number;
          earliest_due: Date | null;
        };
        const bySupplier = new Map<string, Agg>();

        for (const o of orders) {
          const sid = o.supplierId || '__no_supplier__';
          const debt = toNumber(o.debtAmount);
          const due = o.paymentDueDate ? new Date(o.paymentDueDate) : null;
          const isOverdue = !!due && due < now;

          let a = bySupplier.get(sid);
          if (!a) {
            a = {
              debt: 0,
              total: 0,
              paid: 0,
              overdue_debt: 0,
              order_count: 0,
              overdue_orders: 0,
              earliest_due: null,
            };
            bySupplier.set(sid, a);
          }
          a.debt += debt;
          a.total += toNumber(o.totalAmount);
          a.paid += toNumber(o.paidAmount);
          a.order_count += 1;
          if (due && (!a.earliest_due || due < a.earliest_due)) a.earliest_due = due;
          if (isOverdue) {
            a.overdue_debt += debt;
            a.overdue_orders += 1;
          }
        }

        // Fetch supplier names
        const supplierIds = [...bySupplier.keys()].filter((k) => k !== '__no_supplier__');
        const supplierRows = await prisma.supplier.findMany({
          where: { id: { in: supplierIds } },
          select: { id: true, name: true, country: true, bankName: true, phone: true },
        });
        const supplierMap = new Map(supplierRows.map((s) => [s.id, s]));

        const result = [...bySupplier.entries()].map(([sid, a]) => {
          const s = supplierMap.get(sid);
          return {
            id: sid === '__no_supplier__' ? null : sid,
            name: s?.name ?? 'Không xác định',
            country: s?.country ?? null,
            phone: s?.phone ?? null,
            debt: Math.round(a.debt),
            total_purchased: Math.round(a.total),
            total_paid: Math.round(a.paid),
            overdue_debt: Math.round(a.overdue_debt),
            order_count: a.order_count,
            overdue_orders: a.overdue_orders,
            earliest_due: a.earliest_due?.toISOString().slice(0, 10) ?? null,
          };
        });

        // Sort: overdue first, then by debt descending
        result.sort((a, b) => {
          if (a.overdue_orders > 0 && b.overdue_orders === 0) return -1;
          if (a.overdue_orders === 0 && b.overdue_orders > 0) return 1;
          return b.debt - a.debt;
        });

        return { suppliers: result };
      } catch (err: any) {
        logger.error('supplier-debt suppliers error', err);
        return reply.status(500).send({ error: 'Lỗi tải danh sách NCC công nợ' });
      }
    },
  );

  // ── GET /api/v1/supplier-debt/suppliers/:id ───────────────────────────
  // Chi tiết 1 NCC: thông tin NCC + các đơn nhập còn nợ + lịch sử TT
  app.get(
    '/api/v1/supplier-debt/suppliers/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { orgId } = reqUser(request);
        const supplierId = request.params.id;

        const supplier = await prisma.supplier.findFirst({
          where: { id: supplierId, orgId },
          select: {
            id: true,
            name: true,
            country: true,
            contactInfo: true,
            paymentTermDays: true,
            bankName: true,
            bankAccount: true,
            bankHolder: true,
            taxCode: true,
            email: true,
            phone: true,
            address: true,
            notes: true,
          },
        });
        if (!supplier) {
          return reply.status(404).send({ error: 'Không tìm thấy NCC' });
        }

        // Outstanding import orders
        const orders = await prisma.importOrder.findMany({
          where: {
            orgId,
            supplierId,
            status: 'confirmed',
          },
          orderBy: { importDate: 'desc' },
          select: {
            id: true,
            importCode: true,
            importDate: true,
            nccInvoiceNo: true,
            totalAmount: true,
            paidAmount: true,
            debtAmount: true,
            paymentStatus: true,
            paymentDueDate: true,
            totalQuantity: true,
            confirmedAt: true,
          },
        });

        const now = new Date();
        const formattedOrders = orders.map((o) => ({
          id: o.id,
          import_code: o.importCode,
          import_date: o.importDate?.toISOString().slice(0, 10) ?? null,
          ncc_invoice_no: o.nccInvoiceNo,
          total_amount: Math.round(toNumber(o.totalAmount)),
          paid_amount: Math.round(toNumber(o.paidAmount)),
          debt_amount: Math.round(toNumber(o.debtAmount)),
          payment_status: o.paymentStatus,
          payment_due_date: o.paymentDueDate?.toISOString().slice(0, 10) ?? null,
          is_overdue:
            o.paymentDueDate && toNumber(o.debtAmount) > 0
              ? new Date(o.paymentDueDate) < now
              : false,
          total_quantity: o.totalQuantity,
        }));

        // Recent payments for this supplier
        const payments = await prisma.supplierPayment.findMany({
          where: { orgId, supplierId },
          orderBy: { paymentDate: 'desc' },
          take: 50,
          select: {
            id: true,
            importOrderId: true,
            amount: true,
            paymentMethod: true,
            paymentDate: true,
            reference: true,
            note: true,
            createdAt: true,
            importOrder: { select: { importCode: true } },
          },
        });

        const formattedPayments = payments.map((p) => ({
          id: p.id,
          import_order_id: p.importOrderId,
          import_code: p.importOrder?.importCode ?? null,
          amount: Math.round(toNumber(p.amount)),
          payment_method: p.paymentMethod,
          payment_date: p.paymentDate?.toISOString().slice(0, 10) ?? null,
          reference: p.reference,
          note: p.note,
          created_at: p.createdAt.toISOString(),
        }));

        // Summary
        const totalDebt = formattedOrders.reduce((s, o) => s + o.debt_amount, 0);
        const totalPurchased = formattedOrders.reduce((s, o) => s + o.total_amount, 0);
        const overdueDebt = formattedOrders
          .filter((o) => o.is_overdue)
          .reduce((s, o) => s + o.debt_amount, 0);

        return {
          supplier,
          summary: {
            total_debt: totalDebt,
            total_purchased: totalPurchased,
            overdue_debt: overdueDebt,
            order_count: formattedOrders.length,
            orders_with_debt: formattedOrders.filter((o) => o.debt_amount > 0).length,
          },
          orders: formattedOrders,
          payments: formattedPayments,
        };
      } catch (err: any) {
        logger.error('supplier-debt supplier detail error', err);
        return reply.status(500).send({ error: 'Lỗi tải chi tiết NCC' });
      }
    },
  );

  // ── PUT /api/v1/supplier-debt/orders/:id/due-date ─────────────────────
  // Sửa lại hạn thanh toán của 1 đơn nhập đã chốt (nhập sai khi confirm).
  // Body: { paymentDueDate: 'YYYY-MM-DD' | null }
  app.put(
    '/api/v1/supplier-debt/orders/:id/due-date',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orgId } = reqUser(request);
        const orderId = (request.params as { id: string }).id;
        const raw = (request.body as { paymentDueDate?: string | null } | undefined)?.paymentDueDate;

        const order = await prisma.importOrder.findFirst({
          where: { id: orderId, orgId },
          select: { id: true, status: true },
        });
        if (!order) {
          return reply.status(404).send({ error: 'Không tìm thấy đơn nhập' });
        }
        if (order.status !== 'confirmed') {
          return reply.status(400).send({ error: 'Chỉ sửa được hạn thanh toán của đơn đã chốt' });
        }

        let dueDate: Date | null = null;
        if (raw != null && raw !== '') {
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) {
            return reply.status(400).send({ error: 'Ngày không hợp lệ' });
          }
          dueDate = d;
        }

        await prisma.importOrder.update({
          where: { id: orderId },
          data: { paymentDueDate: dueDate },
        });

        return { id: orderId, payment_due_date: dueDate?.toISOString().slice(0, 10) ?? null };
      } catch (err: any) {
        logger.error('supplier-debt update due-date error', err);
        return reply.status(500).send({ error: 'Lỗi cập nhật hạn thanh toán' });
      }
    },
  );

  // ── POST /api/v1/supplier-debt/payments ───────────────────────────────
  // Ghi nhận thanh toán NCC. Body:
  //   importOrderId: string (required)
  //   amount: number (required, VND integer)
  //   paymentMethod?: 'bank_transfer' | 'cash' | 'other'
  //   paymentDate?: string (YYYY-MM-DD, default today)
  //   reference?: string
  //   note?: string
  app.post(
    '/api/v1/supplier-debt/payments',
    { preHandler: requireRole('owner', 'admin') },
    async (
      request: FastifyRequest<{
        Body: {
          importOrderId: string;
          amount: number;
          paymentMethod?: string;
          paymentDate?: string;
          reference?: string;
          note?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const user = reqUser(request);
        const { importOrderId, amount, paymentMethod, paymentDate, reference, note } =
          request.body;

        if (!importOrderId || !amount || amount <= 0) {
          return reply
            .status(400)
            .send({ error: 'Thiếu importOrderId hoặc amount phải > 0' });
        }

        // Verify import order exists and belongs to org
        const importOrder = await prisma.importOrder.findFirst({
          where: { id: importOrderId, orgId: user.orgId, status: 'confirmed' },
          select: { id: true, supplierId: true, debtAmount: true, totalAmount: true },
        });
        if (!importOrder) {
          return reply.status(404).send({ error: 'Đơn nhập không tồn tại hoặc chưa confirm' });
        }
        if (!importOrder.supplierId) {
          return reply.status(400).send({ error: 'Đơn nhập chưa có NCC — không thể ghi TT' });
        }

        // Warn if amount > remaining debt (over-payment)
        const currentDebt = toNumber(importOrder.debtAmount);
        if (amount > currentDebt) {
          logger.warn(
            `Supplier payment ${amount} > remaining debt ${currentDebt} for import ${importOrderId}`,
          );
        }

        // Create payment record
        const payment = await prisma.supplierPayment.create({
          data: {
            orgId: user.orgId,
            importOrderId,
            supplierId: importOrder.supplierId,
            amount,
            paymentMethod: paymentMethod ?? 'bank_transfer',
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            reference: reference ?? null,
            note: note ?? null,
            createdById: user.id,
          },
        });

        // Re-sync import order debt
        await syncImportOrderDebt(importOrderId);

        logger.info(
          `Supplier payment recorded: ${Math.round(amount).toLocaleString()}d for import ${importOrderId}`,
        );

        return reply.status(201).send({
          payment: {
            id: payment.id,
            amount: Math.round(toNumber(payment.amount)),
            payment_date: payment.paymentDate.toISOString().slice(0, 10),
          },
          message: 'Đã ghi nhận thanh toán NCC',
        });
      } catch (err: any) {
        logger.error('supplier-debt record payment error', err);
        return reply.status(500).send({ error: 'Lỗi ghi nhận thanh toán' });
      }
    },
  );

  // ── GET /api/v1/supplier-debt/payments ────────────────────────────────
  // Lịch sử thanh toán NCC. Query params:
  //   supplierId?: string
  //   from?: string (YYYY-MM-DD)
  //   to?: string (YYYY-MM-DD)
  //   limit?: number (default 50)
  app.get(
    '/api/v1/supplier-debt/payments',
    { preHandler: requireRole('owner', 'admin') },
    async (
      request: FastifyRequest<{
        Querystring: { supplierId?: string; from?: string; to?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { orgId } = reqUser(request);
        const { supplierId, from, to, limit } = request.query;
        const take = Math.min(parseInt(limit ?? '50', 10) || 50, 200);

        const where: any = { orgId };
        if (supplierId) where.supplierId = supplierId;
        if (from || to) {
          where.paymentDate = {};
          if (from) where.paymentDate.gte = new Date(from);
          if (to) where.paymentDate.lte = new Date(to);
        }

        const payments = await prisma.supplierPayment.findMany({
          where,
          orderBy: { paymentDate: 'desc' },
          take,
          select: {
            id: true,
            importOrderId: true,
            supplierId: true,
            amount: true,
            paymentMethod: true,
            paymentDate: true,
            reference: true,
            note: true,
            createdAt: true,
            importOrder: { select: { importCode: true } },
            supplier: { select: { name: true } },
          },
        });

        return {
          payments: payments.map((p) => ({
            id: p.id,
            import_order_id: p.importOrderId,
            import_code: p.importOrder?.importCode ?? null,
            supplier_id: p.supplierId,
            supplier_name: p.supplier?.name ?? null,
            amount: Math.round(toNumber(p.amount)),
            payment_method: p.paymentMethod,
            payment_date: p.paymentDate?.toISOString().slice(0, 10) ?? null,
            reference: p.reference,
            note: p.note,
            created_at: p.createdAt.toISOString(),
          })),
        };
      } catch (err: any) {
        logger.error('supplier-debt payment history error', err);
        return reply.status(500).send({ error: 'Lỗi tải lịch sử thanh toán' });
      }
    },
  );

  // ── DELETE /api/v1/supplier-debt/payments/:id ─────────────────────────
  // Xóa 1 bản ghi thanh toán (correction). Re-syncs import order debt.
  app.delete(
    '/api/v1/supplier-debt/payments/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { orgId } = reqUser(request);
        const paymentId = request.params.id;

        const payment = await prisma.supplierPayment.findFirst({
          where: { id: paymentId, orgId },
          select: { id: true, importOrderId: true, amount: true },
        });
        if (!payment) {
          return reply.status(404).send({ error: 'Không tìm thấy bản ghi thanh toán' });
        }

        await prisma.supplierPayment.delete({ where: { id: paymentId } });

        // Re-sync import order debt
        await syncImportOrderDebt(payment.importOrderId);

        logger.info(
          `Supplier payment deleted: ${paymentId} (${Math.round(toNumber(payment.amount)).toLocaleString()}d)`,
        );

        return { message: 'Đã xóa bản ghi thanh toán' };
      } catch (err: any) {
        logger.error('supplier-debt delete payment error', err);
        return reply.status(500).send({ error: 'Lỗi xóa thanh toán' });
      }
    },
  );
}
