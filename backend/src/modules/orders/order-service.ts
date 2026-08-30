/**
 * Shared helpers for the wholesale-order pipeline.
 *
 * Lives outside the route file so transitions, payments, and the
 * delivery-note PDF endpoint can all share the same constants and
 * permission helpers.
 */
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';

// 6-status pipeline (new) — see schema.prisma `Order.status`.
// `paid` and `shipped` are LEGACY aliases that may still appear on
// MISA-imported rows; they are normalized to `completed`/`shipping` in
// the response shape.
export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'packing',
  'shipping',
  'completed',
  'returned',
  'cancelled',
] as const;

// Statuses whose order is financially reversed — must be EXCLUDED from
// revenue/debt aggregates everywhere `cancelled` is excluded.
export const NON_REVENUE_STATUSES = ['cancelled', 'returned'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const LEGACY_STATUS_MAP: Record<string, OrderStatus> = {
  paid: 'completed',
  shipped: 'shipping',
  new: 'draft',
};

export function normalizeStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return 'draft';
  if ((ORDER_STATUSES as readonly string[]).includes(raw)) {
    return raw as OrderStatus;
  }
  return LEGACY_STATUS_MAP[raw] ?? 'draft';
}

// Legal forward transitions. Cancellation is handled separately and
// allowed from any non-terminal status.
const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed'],
  // "Đóng gói" đã gộp vào "Đang giao" (sale-app bỏ bước packing). Đơn đi THẲNG
  // confirmed → shipping và trừ kho ở bước đó. Vẫn giữ confirmed → packing để
  // CRM đầy đủ (chưa dọn) chạy được; sẽ loại ở Phase 2.
  confirmed: ['packing', 'shipping'],
  packing: ['shipping'],
  shipping: ['completed'],
  completed: [],
  returned: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'cancelled') {
    return from !== 'completed' && from !== 'cancelled' && from !== 'returned';
  }
  // `returned` is reached only via the dedicated /return endpoint (a
  // delivered order sent back), never through the forward pipeline.
  if (to === 'returned') return false;
  return FORWARD[from].includes(to);
}

/**
 * ⚠️ 3 quyền TÁCH BIỆT — đừng gộp lại (4/8/2026).
 *
 * Trước đây chỉ có 1 hàm `canSeeAllOrders(role)` dùng cho cả 3 việc, nên muốn cho
 * nhân sự vận hành xem full đơn là buộc phải cấp `admin` → lộ luôn giá vốn/lãi gộp.
 * Nay tách:
 *
 *   1. canSeeAllOrders(user) — PHẠM VI đơn được xem. owner/admin, HOẶC member có cờ
 *      `canViewAllOrders` (Thạch Quang Huy giao hàng, Mai Hiền đối soát chứng từ).
 *   2. canSeeCost(role)      — TIỀN (unitCost/lineCost/profit). CHỈ owner/admin.
 *   3. canEditOrderContent   — sửa nội dung đơn (hàng hoá, quà, header) ở mọi trạng
 *      thái. CHỈ owner/admin — người có cờ xem-full KHÔNG được sửa nội dung đơn của
 *      người khác; họ chỉ chuyển trạng thái + upload tài liệu (gate theo phạm vi).
 */
export function canSeeAllOrders(user: { role: string; canViewAllOrders?: boolean }): boolean {
  return user.role === 'owner' || user.role === 'admin' || user.canViewAllOrders === true;
}

/** Xem giá vốn / lãi gộp — CHỈ owner+admin. KHÔNG nới theo cờ xem-full-đơn. */
export function canSeeCost(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function canEditOrderStatus(role: string, status: OrderStatus): boolean {
  // Cố ý dùng canSeeCost (owner/admin) chứ không dùng canSeeAllOrders: người chỉ
  // có cờ xem-full-đơn không được sửa nội dung đơn đã qua bước xác nhận.
  if (canSeeCost(role)) return true;
  // Member can only edit orders that are still draft or confirmed.
  return status === 'draft' || status === 'confirmed';
}

// Build a Prisma `where` for "orders this user is allowed to see".
export function orderScopeWhere(user: {
  orgId: string; id: string; role: string; canViewAllOrders?: boolean;
}): Prisma.OrderWhereInput {
  if (canSeeAllOrders(user)) {
    return { orgId: user.orgId };
  }
  return {
    orgId: user.orgId,
    OR: [
      { assignedSaleId: user.id },
      { createdByUserId: user.id },
      { contact: { assignedUserId: user.id } },
    ],
  };
}

// Convert a Decimal | string | number | null to a plain number for
// arithmetic, defaulting to 0. Prisma returns Decimal as string-ish
// from raw queries depending on adapter.
export function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Decimal instance
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return 0;
}

// Order code: DH-YYYYMM-NNNN — tăng dần theo (orgId, năm-tháng).
// Lấy MÃ LỚN NHẤT hiện có rồi +1. KHÔNG dùng count(): dữ liệu có gap (import
// MISA / đơn đã xoá / số nhảy cóc) → count+1 rơi trúng mã đã tồn tại → P2002
// "Unique constraint (org_id, order_code)" và retry cũng vô ích vì count không
// đổi. Suffix 4 chữ số zero-pad nên sort desc theo chuỗi = sort theo số (≤9999).
export async function generateOrderCode(orgId: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `DH-${ym}-`;
  const last = await prisma.order.findFirst({
    where: { orgId, orderCode: { startsWith: prefix } },
    orderBy: { orderCode: 'desc' },
    select: { orderCode: true },
  });
  const lastSeq = last ? parseInt(last.orderCode.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/**
 * Recompute and persist the financial fields of an order based on its
 * line items. Caller is responsible for the surrounding transaction.
 *
 *   subtotalAmount  = SUM(line_total)
 *   discountAmount  = resolved (already in VND)
 *   totalAmountValue = subtotal - discount + shipping_fee
 *   debtAmountValue  = total - paid
 *
 * Also mirrors `totalAmountValue` to the legacy `totalAmount` Float so
 * dashboards/resale-service that aggregate `totalAmount` keep working.
 */
export async function recomputeOrderTotals(orderId: string, tx: Prisma.TransactionClient = prisma): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  const subtotal = order.items.reduce((s, it) => s + toNumber(it.lineTotal), 0);

  const discountValue = toNumber(order.discountValue);
  let discountAmount = 0;
  if (order.discountType === 'percent') {
    discountAmount = Math.round((subtotal * discountValue) / 100);
  } else if (order.discountType === 'fixed') {
    discountAmount = Math.round(discountValue);
  }
  // Clamp: discount never exceeds subtotal.
  if (discountAmount > subtotal) discountAmount = subtotal;

  const shippingFee = toNumber(order.shippingFee);
  const total = subtotal - discountAmount + shippingFee;
  const paid = toNumber(order.paidAmount);
  const debt = total - paid;

  await tx.order.update({
    where: { id: orderId },
    data: {
      subtotalAmount: subtotal,
      discountAmount,
      totalAmountValue: total,
      debtAmountValue: debt < 0 ? 0 : debt,
      totalAmount: total,
    },
  });
}

export class CreditPolicyError extends Error {
  statusCode = 400;
}

/**
 * Hạn nợ hiệu lực dùng cho màn đối soát. Chính sách hiện tại của khách được ưu
 * tiên hơn hạn đã ghi trên đơn cũ để khi quản lý đưa khách về 0 ngày, toàn bộ
 * dư nợ cũ lập tức hiện tuổi nợ từ ngày đơn. Không ghi ngược vào Order.
 */
export function effectiveDebtDueDate(input: {
  orderDate?: Date | null;
  createdAt?: Date | null;
  debtDueDate?: Date | null;
  creditTermDays?: number | null;
}): Date | null {
  const base = input.orderDate ?? input.createdAt;
  if (base && input.creditTermDays != null) {
    const due = new Date(base);
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + Math.max(0, Math.trunc(input.creditTermDays)));
    return due;
  }
  return input.debtDueDate ? new Date(input.debtDueDate) : null;
}

export function debtDaysOverdue(dueDate: Date | null, now = new Date()): number {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date(now);
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

/**
 * Chặn đơn công nợ theo chính sách của khách tại thời điểm chốt đơn.
 * Đơn nháp không tính vào nợ hiện hữu; đơn đang kiểm tra được cộng riêng để
 * không đếm hai lần. Null/0 đều được hiểu là chưa được cấp công nợ.
 */
export async function assertCustomerCreditPolicy(
  orderId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      orgId: true,
      contactId: true,
      paymentMethod: true,
      debtAmountValue: true,
      orderDate: true,
      debtDueDate: true,
    },
  });
  const orderDebt = Math.max(0, toNumber(order.debtAmountValue));
  if (order.paymentMethod !== 'credit' || orderDebt <= 0) return;

  const contact = await tx.contact.findUniqueOrThrow({
    where: { id: order.contactId },
    select: { creditLimit: true, creditTermDays: true },
  });
  const creditLimit = Math.max(0, toNumber(contact.creditLimit));
  const creditTermDays = Math.max(0, Math.trunc(contact.creditTermDays || 0));
  if (creditLimit <= 0 || creditTermDays <= 0) {
    throw new CreditPolicyError(
      'Khách hàng chưa được cấp công nợ. Quản lý cần đặt hạn mức tiền và số ngày công nợ trước khi chốt đơn.',
    );
  }
  if (!order.debtDueDate) {
    throw new CreditPolicyError('Đơn công nợ chưa có hạn thanh toán.');
  }

  const orderDate = order.orderDate ?? new Date();
  const requestedDays = Math.max(
    0,
    Math.ceil((order.debtDueDate.getTime() - orderDate.getTime()) / 86_400_000),
  );
  if (requestedDays <= 0 || requestedDays > creditTermDays) {
    throw new CreditPolicyError(
      `Khách chỉ được nợ tối đa ${creditTermDays} ngày; đơn đang chọn ${requestedDays} ngày.`,
    );
  }

  const existingDebt = await tx.order.aggregate({
    where: {
      orgId: order.orgId,
      contactId: order.contactId,
      id: { not: order.id },
      status: { notIn: ['draft', 'cancelled', 'returned'] },
      debtAmountValue: { gt: 0 },
    },
    _sum: { debtAmountValue: true },
  });
  const projectedDebt = Math.round(toNumber(existingDebt._sum.debtAmountValue) + orderDebt);
  if (projectedDebt > creditLimit) {
    const format = (value: number) => `${Math.round(value).toLocaleString('vi-VN')}đ`;
    throw new CreditPolicyError(
      `Công nợ sau đơn sẽ là ${format(projectedDebt)}, vượt hạn mức ${format(creditLimit)}.`,
    );
  }
}

/**
 * Common include shape for "give me an order with everything the UI
 * needs". Strip cost-related fields server-side based on role before
 * returning.
 */
export const ORDER_FULL_INCLUDE = {
  contact: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      zaloUid: true,
      storeName: true,
      province: true,
      address: true,
      customerType: true,
      policyTier: true,
      stage: true,
      assignedUserId: true,
      // Hồ sơ VAT đã lưu của khách — form "Yêu cầu xuất VAT" ở sale-app tự điền
      // sẵn từ đây (vẫn sửa được trước khi gửi).
      invoiceFormat: true,
      invoiceBuyerType: true,
      invoiceBuyerName: true,
      invoiceTaxCode: true,
      invoiceAddress: true,
      invoiceEmail: true,
      invoiceReceiverName: true,
      invoiceReceiverPhone: true,
    },
  },
  assignedSale: { select: { id: true, fullName: true, email: true } },
  mktOwner: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true } },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, mainImageUrl: true, unit: true } },
      batch: { select: { id: true, batchCode: true, expiryDate: true, currentQuantity: true } },
      tier: { select: { id: true, tierName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  gifts: {
    include: {
      product: { select: { id: true, sku: true, name: true, mainImageUrl: true } },
      batch: { select: { id: true, batchCode: true, expiryDate: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof ORDER_FULL_INCLUDE }>;

/**
 * Strip `unitCost`, `lineCost`, `profit` from items and `costPrice`
 * snapshots when caller is not owner/admin. Mutates a shallow copy.
 */
export function stripCostFromOrder<T extends OrderFull>(order: T, role: string): T {
  // Tiền: chỉ owner/admin. Người có cờ xem-full-đơn vẫn bị ẩn giá vốn/lãi.
  if (canSeeCost(role)) return order;
  return {
    ...order,
    items: order.items.map((it) => ({
      ...it,
      unitCost: null,
      lineCost: null,
      profit: null,
    })) as T['items'],
  };
}

// Helper to read user from request — narrows the type for downstream use.
export function reqUser(request: FastifyRequest): {
  id: string; orgId: string; role: string; canViewAllOrders?: boolean; canIssueVat?: boolean;
} {
  const u = request.user!;
  // PHẢI mang cả cờ ra, nếu không orderScopeWhere() không thấy → vẫn bị bó phạm vi.
  return {
    id: u.id, orgId: u.orgId, role: u.role,
    canViewAllOrders: u.canViewAllOrders,
    canIssueVat: u.canIssueVat,
  };
}
