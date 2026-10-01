import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { normalizeStatus, orderScopeWhere, reqUser } from './order-service.js';
import { syncTotalStock } from './fifo-service.js';

export class BatchChangeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new BatchChangeError(status, message); };
const todayVN = () => new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T00:00:00Z');
const isStocked = (status: string) => ['packing', 'shipping', 'completed'].includes(normalizeStatus(status));
const batchSelect = { id: true, batchCode: true, expiryDate: true, currentQuantity: true };

async function context(tx: any, user: any, id: string, itemId: string) {
  const actor = await tx.user.findFirst({ where: { id: user.id, orgId: user.orgId, isActive: true } });
  if (!actor) fail(403, 'Tài khoản không còn quyền thao tác');
  const order = await tx.order.findFirst({ where: { AND: [orderScopeWhere(actor), { id }] } });
  if (!order) fail(404, 'Không tìm thấy đơn hàng');
  const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId: id }, include: { fifoUsages: { include: { batch: true } }, batch: true } });
  if (!item) fail(404, 'Không tìm thấy dòng hàng');
  const status = normalizeStatus(order.status);
  const canEdit = !['cancelled', 'returned'].includes(status) && !!item.productId &&
    (!isStocked(status) || ['owner', 'admin'].includes(actor.role) || actor.canManageImports === true);
  return { actor, order, item, canEdit };
}

// Legacy rows must have unambiguous item-level signed movements, never infer
// consumed inventory from a displayed batch or from the order status alone.
async function allocations(tx: any, order: any, item: any) {
  if (!isStocked(order.status)) return [];
  if (!order.legacyCost) {
    const rows = item.fifoUsages;
    if (!rows.length || rows.some((r: any) => r.quantityUsed <= 0 || r.batch.orgId !== order.orgId || r.batch.productId !== item.productId) ||
        rows.reduce((s: number, r: any) => s + r.quantityUsed, 0) !== item.quantity) {
      fail(409, 'Đơn cũ thiếu hoặc lệch lịch sử xuất lô; cần đối soát kho trước khi sửa.');
    }
    return rows;
  }
  if (!item.batchId || !item.batch || item.fifoUsages.length) fail(409, 'Đơn cũ chưa có lịch sử lô rõ ràng để đổi.');
  const movements = await tx.inventoryMovement.findMany({ where: {
    orgId: order.orgId, productId: item.productId, referenceType: 'order', referenceId: order.id,
    note: { contains: `(item ${item.id})` },
  } });
  const net = new Map<string, number>();
  for (const m of movements) net.set(m.batchId, (net.get(m.batchId) ?? 0) - m.quantity);
  const remaining = [...net].filter(([, quantity]) => quantity !== 0);
  if (remaining.length !== 1 || remaining[0][0] !== item.batchId || remaining[0][1] !== item.quantity ||
      item.batch.orgId !== order.orgId || item.batch.productId !== item.productId) {
    fail(409, 'Đơn cũ thiếu hoặc lệch lịch sử xuất lô; cần đối soát kho trước khi sửa.');
  }
  return [{ batchId: item.batchId, quantityUsed: item.quantity, batch: item.batch }];
}

export async function changeOrderItemBatch(tx: any, user: any, id: string, itemId: string, batchId: string, reason = '') {
  // Serialize with status updates and other batch corrections. The transaction
  // snapshot causes concurrent writers to fail rather than apply stale traces.
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${itemId} AND order_id = ${id} FOR UPDATE`;
  const { actor, order, item, canEdit } = await context(tx, user, id, itemId);
  if (!canEdit) fail(403, 'Bạn không có quyền đổi lô ở trạng thái này');
  if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.returnQty > 0) fail(409, 'Dòng hàng có số lượng/hoàn trả cần đối soát trước khi sửa lô');
  const old = await allocations(tx, order, item);
  // An identical allocation is idempotent even when the original batch has since expired.
  if ((old.length === 1 && old[0].batchId === batchId) || (!isStocked(order.status) && item.batchId === batchId)) return { success: true, changed: false };
  const ids = [...new Set<string>([batchId, ...old.map((r: any) => r.batchId)])].sort();
  for (const bid of ids) await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id = ${bid} FOR UPDATE`;
  const target = await tx.inventoryBatch.findFirst({ where: { id: batchId, orgId: order.orgId, productId: item.productId } });
  if (!target || target.status !== 'active' || (target.expiryDate && target.expiryDate < todayVN())) fail(400, 'Lô không hợp lệ, hết hạn hoặc không thuộc sản phẩm này');
  const released = old.filter((r: any) => r.batchId === batchId).reduce((s: number, r: any) => s + r.quantityUsed, 0);
  if (target.currentQuantity + released < item.quantity) fail(400, `Lô ${target.batchCode} không đủ tồn cho ${item.quantity} sản phẩm`);
  if (!isStocked(order.status)) {
    const others = await tx.orderItem.aggregate({ where: { orderId: id, batchId, id: { not: itemId } }, _sum: { quantity: true } });
    if (target.currentQuantity < item.quantity + (others._sum.quantity ?? 0)) fail(400, 'Lô không đủ tồn cho các dòng đã chọn trong đơn');
    await tx.orderItem.update({ where: { id: itemId }, data: { batchId } });
    return { success: true, changed: true };
  }
  if (!reason.trim()) fail(400, 'Vui lòng ghi lý do đổi lô cho đơn đã xuất kho');
  if (target.importCost == null) fail(409, 'Lô được chọn chưa có giá vốn; cần bổ sung trước khi đổi lô đã xuất.');
  // Returning an inactive lot would move inventory outside active totalStock.
  if (old.some((r: any) => r.batch.status !== 'active')) fail(409, 'Lô đã xuất không còn hoạt động; cần đối soát kho trước khi đổi.');
  const note = `Đổi lô (item ${item.id})${reason ? `: ${reason}` : ''}`;
  for (const row of old) {
    await tx.inventoryBatch.update({ where: { id: row.batchId }, data: { currentQuantity: { increment: row.quantityUsed } } });
    await tx.inventoryMovement.create({ data: { orgId: order.orgId, productId: item.productId, batchId: row.batchId, type: 'return', quantity: row.quantityUsed, referenceType: 'order', referenceId: id, note, createdById: actor.id } });
  }
  await tx.inventoryBatch.update({ where: { id: batchId }, data: { currentQuantity: { decrement: item.quantity } } });
  await tx.inventoryMovement.create({ data: { orgId: order.orgId, productId: item.productId, batchId, type: 'export', quantity: -item.quantity, referenceType: 'order', referenceId: id, note, createdById: actor.id } });
  const unitCost = Number(target.importCost ?? 0);
  const lineCost = unitCost * item.quantity;
  if (!order.legacyCost) {
    await tx.orderItemBatch.deleteMany({ where: { orderItemId: item.id } });
    await tx.orderItemBatch.create({ data: { orderItemId: item.id, batchId, quantityUsed: item.quantity, costAtTime: unitCost } });
  }
  await tx.orderItem.update({ where: { id: item.id }, data: { batchId, unitCost, lineCost, profit: item.lineTotal - lineCost, costValue: unitCost } });
  await syncTotalStock(tx, item.productId);
  return { success: true, changed: true };
}

export async function orderBatchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.get('/api/v1/orders/:id/items/:itemId/batches', async (request, reply) => {
    try {
      const { id, itemId } = request.params as { id: string; itemId: string };
      const { order, item, canEdit } = await context(prisma, reqUser(request), id, itemId);
      let old: any[] = [], reason: string | undefined;
      try { old = await allocations(prisma, order, item); } catch (error) {
        if (!(error instanceof BatchChangeError)) throw error;
        reason = error.message;
      }
      const batches = item.productId ? await prisma.inventoryBatch.findMany({ where: { orgId: order.orgId, productId: item.productId, status: 'active', OR: [{ expiryDate: null }, { expiryDate: { gte: todayVN() } }] }, select: batchSelect, orderBy: [{ expiryDate: 'asc' }, { batchCode: 'asc' }] }) : [];
      return { batches: batches.map((b: any) => ({ ...b, availableQuantity: b.currentQuantity + old.filter(r => r.batchId === b.id).reduce((s, r) => s + r.quantityUsed, 0) })),
        allocations: old.map(r => ({ batchId: r.batchId, batchCode: r.batch.batchCode, expiryDate: r.batch.expiryDate, quantityUsed: r.quantityUsed })), selectedBatchId: old.length === 1 ? old[0].batchId : item.batchId, canEdit: canEdit && !reason, reason };
    } catch (error: any) { return reply.status(error instanceof BatchChangeError ? error.status : 500).send({ error: error instanceof BatchChangeError ? error.message : 'Không tải được danh sách lô' }); }
  });
  app.put('/api/v1/orders/:id/items/:itemId/batch', async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const body = request.body as { batchId?: unknown; reason?: unknown } | null;
    if (!body || typeof body.batchId !== 'string' || !body.batchId || (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 500))) return reply.status(400).send({ error: 'Vui lòng chọn lô và ghi lý do tối đa 500 ký tự' });
    try {
      return await prisma.$transaction(tx => changeOrderItemBatch(tx, reqUser(request), id, itemId, body.batchId as string, (body.reason as string | undefined)?.trim()), { isolationLevel: 'Serializable', timeout: 15000 });
    } catch (error: any) {
      if (error instanceof BatchChangeError) return reply.status(error.status).send({ error: error.message });
      if (error.code === 'P2034' || error.code === '40001') return reply.status(409).send({ error: 'Tồn kho hoặc đơn vừa thay đổi, vui lòng tải lại và thử lại' });
      request.log.error(error);
      return reply.status(500).send({ error: 'Không đổi được lô hàng' });
    }
  });
}
