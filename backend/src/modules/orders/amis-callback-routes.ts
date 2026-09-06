import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { toNumber } from './order-service.js';

type Row = Record<string, any>;

function sameSecret(received: string): boolean {
  const expected = config.amisAccountingCallbackSecret;
  if (!expected || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function parsed(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function callbackRows(body: unknown): Row[] {
  const value = parsed(body);
  if (Array.isArray(value)) return value.flatMap(callbackRows);
  if (!value || typeof value !== 'object') return [];
  const row = value as Row;
  const nested = parsed(row.Data ?? row.data ?? row.Result ?? row.result);
  if (nested && nested !== value && (Array.isArray(nested) || typeof nested === 'object')) {
    const rows = callbackRows(nested);
    if (rows.length) return rows.map((child) => ({ ...row, Data: undefined, data: undefined, ...child }));
  }
  return [row];
}

function valueOf(row: Row, ...keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
}

function callbackSuccess(row: Row): boolean {
  const raw = valueOf(row, 'Success', 'success', 'IsSuccess', 'is_success', 'isSuccess', 'Status', 'status');
  const value = String(raw ?? '').trim().toLowerCase();
  return raw === true || raw === 1 || ['true', '1', 'success', 'succeeded', 'completed'].includes(value);
}

function callbackRefId(row: Row): string {
  return String(valueOf(row, 'org_refid', 'org_ref_id', 'orgRefId', 'OrgRefId', 'ORG_REFID') || '').trim();
}

function callbackMessage(row: Row): string {
  return String(valueOf(row, 'ErrorMessage', 'errorMessage', 'error_message', 'Message', 'message') || '').trim();
}

function callbackAmount(row: Row): number | null {
  const raw = valueOf(row, 'total_amount_after_tax', 'TotalAmountAfterTax', 'amount_after_tax', 'Amount');
  if (raw === undefined || raw === null || raw === '') return null;
  const amount = Math.round(toNumber(raw));
  return Number.isFinite(amount) ? amount : null;
}

async function handleCallback(row: Row): Promise<'succeeded' | 'failed' | 'ignored'> {
  const orgRefId = callbackRefId(row);
  if (!orgRefId) return 'ignored';
  const attempt = await prisma.amisVatExportAttempt.findUnique({ where: { orgRefId } });
  if (!attempt || attempt.status === 'succeeded') return 'ignored';

  const misaRefId = String(valueOf(row, 'refid', 'RefId', 'misa_refid', 'MisaRefId') || '').trim() || null;
  const misaRefNo = String(valueOf(row, 'refno', 'RefNo', 'misa_refno', 'MisaRefNo') || '').trim() || null;
  if (!callbackSuccess(row)) {
    await prisma.amisVatExportAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', misaRefId, misaRefNo,
        errorMessage: (callbackMessage(row) || 'Actapp báo xử lý chứng từ thất bại.').slice(0, 1000), completedAt: new Date() },
    });
    return 'failed';
  }

  const reportedAmount = callbackAmount(row);
  if (reportedAmount !== null && reportedAmount !== attempt.expectedAmount) {
    await prisma.amisVatExportAttempt.update({
      where: { id: attempt.id },
      data: { status: 'failed', misaRefId, misaRefNo,
        errorMessage: `Actapp callback ${reportedAmount}đ, CRM đã gửi ${attempt.expectedAmount}đ. Đã chặn xác nhận.`, completedAt: new Date() },
    });
    return 'failed';
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Compare-and-set biến callback thành idempotent: chỉ một request được đi
    // tiếp; callback trùng hoặc chạy đồng thời không thể tạo hai VatInvoice.
    const claimed = await tx.amisVatExportAttempt.updateMany({
      where: { id: attempt.id, status: { in: ['submitting', 'pending'] } },
      data: { status: 'processing' },
    });
    if (claimed.count !== 1) return;
    const order = await tx.order.findUnique({
      where: { id: attempt.orderId },
      select: { id: true, orgId: true, totalAmount: true, totalAmountValue: true, vatIssuedAmount: true },
    });
    const total = Math.round(toNumber(order?.totalAmountValue) > 0 ? toNumber(order?.totalAmountValue) : toNumber(order?.totalAmount));
    if (!order || total !== attempt.expectedAmount || order.vatIssuedAmount !== 0) {
      await tx.amisVatExportAttempt.update({
        where: { id: attempt.id },
        data: { status: 'failed', errorMessage: 'Đơn CRM đã thay đổi sau khi gửi Actapp. Đã chặn xác nhận tự động.', completedAt: new Date() },
      });
      return;
    }
    const now = new Date();
    const invoiceNumber = misaRefNo || attempt.orgRefNo;
    await tx.vatInvoice.create({
      data: {
        orgId: order.orgId, orderId: order.id, invoiceNumber,
        invoiceDate: new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`),
        amount: attempt.expectedAmount, note: 'Actapp xác nhận đồng bộ thành công',
        issuedById: attempt.requestedById,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        vatInvoiceStatus: 'issued', vatIssuedAmount: attempt.expectedAmount,
        vatInvoiceId: invoiceNumber, vatIssuedAt: now, vatIssuedById: attempt.requestedById,
        needsVatInvoice: true,
      },
    });
    await tx.amisVatExportAttempt.update({
      where: { id: attempt.id },
      data: { status: 'succeeded', misaRefId, misaRefNo, errorMessage: null, completedAt: now },
    });
  });
  const final = await prisma.amisVatExportAttempt.findUnique({ where: { id: attempt.id }, select: { status: true } });
  return final?.status === 'succeeded' ? 'succeeded' : 'failed';
}

/** Public callback: không dùng JWT vì MISA gọi máy-chủ-tới-máy-chủ. */
export async function amisCallbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/integrations/amis/accounting/callback/:secret', async (request: FastifyRequest, reply: FastifyReply) => {
    const { secret } = request.params as { secret: string };
    if (!sameSecret(secret)) return reply.status(404).send({ error: 'Not found' });
    try {
      const rows = callbackRows(request.body);
      if (!rows.length) return reply.status(400).send({ error: 'Callback không có dữ liệu.' });
      const results = await Promise.all(rows.map(handleCallback));
      return { received: true, succeeded: results.filter((v) => v === 'succeeded').length,
        failed: results.filter((v) => v === 'failed').length, ignored: results.filter((v) => v === 'ignored').length };
    } catch (err) {
      logger.error('[vat:amis] Callback failed:', err);
      return reply.status(500).send({ error: 'Không xử lý được callback AMIS.' });
    }
  });
}
