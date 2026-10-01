/** Local-only regression fixtures. Every write is rolled back. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/database/prisma-client.js';
import { changeOrderItemBatch } from '../src/modules/orders/order-batch-routes.js';
import { processFIFO, reverseFIFO } from '../src/modules/orders/fifo-service.js';
const url = new URL(process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local database only');
const rollback = new Error('ROLLBACK_TEST');
try {
 await prisma.$transaction(async tx => {
  const user = await tx.user.findFirstOrThrow({ where: { role: { in: ['owner', 'admin'] }, isActive: true } });
  const seed = await tx.order.findFirstOrThrow({ where: { orgId: user.orgId } });
  const source = await tx.inventoryBatch.findFirstOrThrow({ where: { orgId: user.orgId, status: 'active' } });
  const product = await tx.product.findUniqueOrThrow({ where: { id: source.productId } });
  const makeBatch = (qty: number, cost: number, expiry = '2099-01-01') => tx.inventoryBatch.create({ data: { orgId: user.orgId, productId: product.id, warehouseId: source.warehouseId, batchCode: `TEST-${randomUUID()}`, currentQuantity: qty, importQuantity: qty, importCost: cost, expiryDate: new Date(expiry) } });
  const a = await makeBatch(10, 10), b = await makeBatch(8, 20), empty = await makeBatch(0, 10), expired = await makeBatch(10, 10, '2001-01-01');
  const order = await tx.order.create({ data: { orgId: user.orgId, contactId: seed.contactId, createdByUserId: user.id, assignedSaleId: user.id, orderCode: `TEST-${randomUUID()}`, totalAmount: 500, status: 'completed', legacyCost: false } });
  const item = await tx.orderItem.create({ data: { orderId: order.id, productId: product.id, sku: product.sku, productName: product.name, quantity: 5, unitPrice: 100, lineTotal: 500, batchId: a.id } });
  await tx.orderItemBatch.create({ data: { orderItemId: item.id, batchId: a.id, quantityUsed: 5, costAtTime: 10 } });
  const before = JSON.stringify(await tx.order.findUnique({ where: { id: order.id } }));
  await changeOrderItemBatch(tx, user, order.id, item.id, b.id, 'Test');
  assert.equal((await tx.inventoryBatch.findUniqueOrThrow({ where: { id: a.id } })).currentQuantity, 15);
  assert.equal((await tx.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } })).currentQuantity, 3);
  assert.equal(Number((await tx.orderItem.findUniqueOrThrow({ where: { id: item.id } })).lineCost), 100);
  assert.equal(JSON.stringify(await tx.order.findUnique({ where: { id: order.id } })), before, 'Financial order fields unchanged');
  assert.equal((await changeOrderItemBatch(tx, user, order.id, item.id, b.id)).changed, false);
  for (const batchId of [empty.id, expired.id, randomUUID()]) await assert.rejects(changeOrderItemBatch(tx, user, order.id, item.id, batchId), (e: any) => e.status === 400);
  const foreign = await tx.inventoryBatch.findFirst({ where: { orgId: { not: user.orgId } } });
  if (foreign) await assert.rejects(changeOrderItemBatch(tx, user, order.id, item.id, foreign.id), (e: any) => e.status === 400);
  const sum = await tx.inventoryBatch.aggregate({ where: { productId: product.id, status: 'active' }, _sum: { currentQuantity: true } });
  assert.equal((await tx.product.findUniqueOrThrow({ where: { id: product.id } })).totalStock, sum._sum.currentQuantity);
  // Reversal follows the corrected trace exactly once.
  await reverseFIFO(tx, order.id, user);
  assert.equal((await tx.inventoryBatch.findUniqueOrThrow({ where: { id: b.id } })).currentQuantity, 8);
  await tx.order.update({ where: { id: order.id }, data: { status: 'confirmed' } });
  await changeOrderItemBatch(tx, user, order.id, item.id, b.id);
  await processFIFO(tx, order.id, user);
  assert.equal((await tx.orderItemBatch.findFirstOrThrow({ where: { orderItemId: item.id } })).batchId, b.id, 'FIFO honors selected batch');
  await tx.order.update({ where: { id: order.id }, data: { status: 'completed' } });
  await tx.orderItemBatch.deleteMany({ where: { orderItemId: item.id } });
  await assert.rejects(changeOrderItemBatch(tx, user, order.id, item.id, a.id), (e: any) => e.status === 409);
  console.log('PASS completed reallocation, costs, financial invariants, idempotency, insufficient/expired/invalid batch, stock sync, reversal, explicit FIFO, missing trace');
  throw rollback;
 }, { isolationLevel: 'Serializable', timeout: 30000 });
} catch (e) { if (e !== rollback) throw e; console.log('PASS all fixture writes rolled back'); }
finally { await prisma.$disconnect(); }
