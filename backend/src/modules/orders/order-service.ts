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
  'cancelled',
] as const;

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
  confirmed: ['packing'],
  packing: ['shipping'],
  shipping: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'cancelled') {
    return from !== 'completed' && from !== 'cancelled';
  }
  return FORWARD[from].includes(to);
}

// Roles in this CRM: owner | admin | member. Owner+admin see all orders.
// Member sees orders where they are either the assigned sale OR the
// contact owner (assignedUserId on the contact).
export function canSeeAllOrders(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export function canEditOrderStatus(role: string, status: OrderStatus): boolean {
  if (canSeeAllOrders(role)) return true;
  // Member can only edit orders that are still draft or confirmed.
  return status === 'draft' || status === 'confirmed';
}

// Build a Prisma `where` for "orders this user is allowed to see".
export function orderScopeWhere(user: { orgId: string; id: string; role: string }): Prisma.OrderWhereInput {
  if (canSeeAllOrders(user.role)) {
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

// Order code: DH-YYYYMM-NNNN — sequential within (orgId, year-month).
// Concurrent calls in the same minute may collide on `count + 1`; we
// retry on unique-constraint violation up to 5 times. Acceptable for a
// CRM with single-digit RPS.
export async function generateOrderCode(orgId: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `DH-${ym}-`;
  const count = await prisma.order.count({
    where: { orgId, orderCode: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
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
      storeName: true,
      province: true,
      address: true,
      customerType: true,
      policyTier: true,
      stage: true,
      assignedUserId: true,
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
  if (canSeeAllOrders(role)) return order;
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
export function reqUser(request: FastifyRequest): { id: string; orgId: string; role: string } {
  const u = request.user!;
  return { id: u.id, orgId: u.orgId, role: u.role };
}
