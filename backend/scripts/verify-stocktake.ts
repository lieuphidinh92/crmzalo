/**
 * End-to-end smoke test for the Kiểm kho (stocktake) feature.
 * Mints a JWT for an owner user (same secret as the server) and drives the
 * live HTTP endpoints: create → save counts → complete, then asserts the
 * batch stock was corrected and an inventory_movements audit row was written.
 *
 * Run: tsx scripts/verify-stocktake.ts   (backend must be running on :3000)
 */
import jwt from 'jsonwebtoken';
import { prisma } from '../src/shared/database/prisma-client.js';

const BASE = 'http://localhost:3000';
const SECRET = process.env.JWT_SECRET!;

async function api(method: string, path: string, token: string, body?: any) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`✅ ${msg}`);
}

async function main() {
  if (!SECRET) { console.error('Thiếu JWT_SECRET trong env'); process.exit(1); }

  const owner = await prisma.user.findFirst({
    where: { role: { in: ['owner', 'admin'] }, isActive: true },
    select: { id: true, email: true, role: true, orgId: true },
  });
  if (!owner) { console.error('Không có user owner/admin'); process.exit(1); }
  const token = jwt.sign(
    { id: owner.id, email: owner.email, role: owner.role, orgId: owner.orgId },
    SECRET,
    { expiresIn: '1h' },
  );
  console.log(`→ Dùng user ${owner.email} (${owner.role})`);

  // Clean any leftover open session so the test is idempotent.
  await prisma.stocktakeSession.updateMany({
    where: { orgId: owner.orgId, status: 'counting' },
    data: { status: 'cancelled' },
  });

  // 1. Create session
  const create = await api('POST', '/api/v1/inventory/stocktakes', token, { note: 'verify script' });
  assert(create.status === 201 && !!create.json?.id, `Tạo phiên: 201 + có id (${create.json?.code})`);
  const sessionId = create.json.id;

  // 2. Load detail
  const detail = await api('GET', `/api/v1/inventory/stocktakes/${sessionId}`, token);
  assert(detail.status === 200 && Array.isArray(detail.json?.items) && detail.json.items.length > 0,
    `Detail có ${detail.json?.items?.length} lô được snapshot`);

  const firstItem = detail.json.items[0];
  const batchBefore = await prisma.inventoryBatch.findUnique({
    where: { id: firstItem.batchId },
    select: { currentQuantity: true, batchCode: true, productId: true },
  });
  const sysQty = firstItem.systemQty;
  const counted = sysQty + 5; // giả lập đếm dư 5
  console.log(`→ Lô ${batchBefore?.batchCode}: hệ thống=${sysQty}, đếm=${counted} (lệch +5)`);

  // 3. Save counts (only first item)
  const save = await api('PUT', `/api/v1/inventory/stocktakes/${sessionId}/items`, token, {
    items: [{ id: firstItem.id, countedQty: counted }],
  });
  assert(save.status === 200, 'Lưu số đếm: 200');

  const afterSave = await api('GET', `/api/v1/inventory/stocktakes/${sessionId}`, token);
  const savedItem = afterSave.json.items.find((i: any) => i.id === firstItem.id);
  assert(savedItem.countedQty === counted && savedItem.variance === 5, `Item: countedQty=${counted}, variance=+5`);

  // Aggregates on session
  const sessRow = await prisma.stocktakeSession.findUnique({ where: { id: sessionId } });
  assert(sessRow?.countedCount === 1 && sessRow?.varianceQty === 5, `Session: countedCount=1, varianceQty=+5`);

  const movBefore = await prisma.inventoryMovement.count({
    where: { referenceType: 'stocktake', referenceId: sessionId },
  });

  // 4. Complete
  const complete = await api('POST', `/api/v1/inventory/stocktakes/${sessionId}/complete`, token);
  assert(complete.status === 200 && complete.json?.ok === true, `Chốt phiên: 200 (điều chỉnh ${complete.json?.adjusted} SP)`);

  // 5. Assert batch corrected to counted value
  const batchAfter = await prisma.inventoryBatch.findUnique({
    where: { id: firstItem.batchId },
    select: { currentQuantity: true },
  });
  assert(batchAfter?.currentQuantity === counted,
    `Tồn lô đã điều chỉnh: ${batchBefore?.currentQuantity} → ${batchAfter?.currentQuantity} (=${counted})`);

  // 6. Assert audit movement written
  const movAfter = await prisma.inventoryMovement.findFirst({
    where: { referenceType: 'stocktake', referenceId: sessionId, batchId: firstItem.batchId },
    select: { quantity: true, type: true, note: true },
  });
  assert(!!movAfter && movAfter.quantity === 5 && movAfter.type === 'adjust',
    `Audit movement: type=adjust, quantity=+5 — "${movAfter?.note}"`);
  assert(movBefore === 0, 'Movement chỉ ghi khi chốt (không ghi lúc lưu nháp)');

  // 7. Session locked
  const sessDone = await prisma.stocktakeSession.findUnique({ where: { id: sessionId } });
  assert(sessDone?.status === 'completed' && !!sessDone?.completedAt, 'Phiên status=completed + có completedAt');

  // 8. Cannot create a new session while none open is fine; verify duplicate-open guard
  const open1 = await api('POST', '/api/v1/inventory/stocktakes', token, {});
  const open2 = await api('POST', '/api/v1/inventory/stocktakes', token, {});
  assert(open1.status === 201 && open2.status === 400,
    'Chặn 2 phiên mở cùng lúc (phiên 2 trả 400)');
  // cleanup the open one
  await api('POST', `/api/v1/inventory/stocktakes/${open1.json.id}/cancel`, token);

  // Restore the batch we bumped so we don't leave test data skewing stock.
  await prisma.inventoryBatch.update({
    where: { id: firstItem.batchId },
    data: { currentQuantity: batchBefore!.currentQuantity },
  });
  await prisma.inventoryMovement.create({
    data: {
      orgId: owner.orgId,
      productId: batchBefore!.productId,
      batchId: firstItem.batchId,
      type: 'adjust',
      quantity: -5,
      referenceType: 'manual_adjust',
      note: `[${batchBefore!.batchCode}] Hoàn tác verify-stocktake script`,
      createdById: owner.id,
    },
  });
  const sum = await prisma.inventoryBatch.aggregate({
    where: { productId: batchBefore!.productId, status: 'active' },
    _sum: { currentQuantity: true },
  });
  await prisma.product.update({ where: { id: batchBefore!.productId }, data: { totalStock: sum._sum.currentQuantity ?? 0 } });
  console.log('→ Đã hoàn tác tồn về giá trị gốc.');

  console.log('\n🎉 TẤT CẢ PASS — chức năng kiểm kho hoạt động đúng end-to-end.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
