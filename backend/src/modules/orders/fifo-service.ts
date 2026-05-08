/**
 * FIFO allocator (Session 3.5B — Module Giá Vốn).
 *
 * `processFIFO` is called from the packing transition when the order's
 * `legacyCost` flag is false. It walks every line item with a populated
 * `productId`, finds the active inventory batches for that product
 * sorted oldest-import-first, and decrements them in order until the
 * line's quantity is satisfied. Each batch consumed is recorded in
 * `order_item_batches` with the cost at allocation time, so margin
 * reports stay correct even if we later adjust the batch's import_cost.
 * The owning OrderItem then has its `unitCost` (qty-weighted), `lineCost`
 * and `profit` rewritten from the trace.
 *
 * `reverseFIFO` reads back `order_item_batches`, returns the quantity
 * to each batch with a `type=return` movement, deletes the trace rows,
 * and nulls the cost fields on the OrderItem. Used when an order that
 * has already moved past `packing` is cancelled.
 *
 * Concurrency: the caller MUST wrap the packing flow in a transaction
 * with isolationLevel='Serializable' so two concurrent packs that each
 * see enough stock can't both succeed. Postgres surfaces the conflict
 * as Prisma error code P2034 — order-transitions.ts catches that and
 * returns 409.
 *
 * Gifts (order_gifts) are NOT FIFO'd. Admin still picks the batch by
 * hand because gift lots tend to be sample/clearance batches. Stock
 * deduction for gifts continues through the existing manual flow.
 */
import pkg from '@prisma/client';
const { Prisma } = pkg;

interface FifoUser {
  id: string;
  orgId: string;
}

interface FifoItem {
  id: string;
  productId: string;
  quantity: number;
  lineTotal: number;
}

interface BatchRow {
  id: string;
  currentQuantity: number;
  importCost: any;
  batchCode: string;
}

/**
 * Validate that there is enough active stock to cover every line item
 * that has a `productId` (FIFO ignores legacy items with only a SKU
 * text). Throws a user-facing error string before any mutation so the
 * caller can return 400 without entering the write transaction.
 *
 * Aggregates per `productId`: needed = SUM(items.quantity) for items
 * whose product matches; available = SUM(active batches' currentQty).
 */
export async function validateFifoStock(
  tx: any,
  orderId: string,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, productId: { not: null } },
    select: { productId: true, quantity: true, productName: true, sku: true },
  });
  if (items.length === 0) return;

  // Aggregate need per product.
  const needPerProduct = new Map<string, { need: number; sku: string; name: string }>();
  for (const it of items) {
    const key = it.productId as string;
    const cur = needPerProduct.get(key);
    const nextNeed = (cur?.need ?? 0) + Math.round(it.quantity);
    needPerProduct.set(key, {
      need: nextNeed,
      sku: cur?.sku ?? it.sku,
      name: cur?.name ?? it.productName,
    });
  }

  for (const [productId, info] of needPerProduct) {
    const agg = await tx.inventoryBatch.aggregate({
      where: { productId, status: 'active', currentQuantity: { gt: 0 } },
      _sum: { currentQuantity: true },
    });
    const avail = agg._sum.currentQuantity ?? 0;
    if (avail < info.need) {
      throw new Error(
        `Không đủ tồn kho FIFO cho ${info.sku} (${info.name}): cần ${info.need}, còn ${avail}.`,
      );
    }
  }
}

/**
 * Allocate stock for every product line in `orderId` using FIFO.
 * Caller is responsible for wrapping in `$transaction(..., { isolationLevel: 'Serializable' })`.
 *
 * Per item:
 *   1. Pull active batches sorted oldest-import-first.
 *   2. Re-check the running total covers the line; throw if a
 *      concurrent packer drained it between validate and process.
 *   3. Decrement each batch in turn, writing one `order_item_batches`
 *      row + one `inventory_movements` (type=export) per allocation.
 *   4. Rewrite the OrderItem's `unitCost`, `lineCost`, `profit` from
 *      the consumed cost.
 */
export async function processFIFO(
  tx: any,
  orderId: string,
  user: FifoUser,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, productId: { not: null } },
    select: { id: true, productId: true, quantity: true, lineTotal: true },
  });
  if (items.length === 0) return;

  for (const item of items as FifoItem[]) {
    const totalQty = Math.round(item.quantity);
    if (totalQty <= 0) continue;

    const batches: BatchRow[] = await tx.inventoryBatch.findMany({
      where: {
        productId: item.productId,
        status: 'active',
        currentQuantity: { gt: 0 },
      },
      orderBy: [{ importedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, currentQuantity: true, importCost: true, batchCode: true },
    });

    let avail = 0;
    for (const b of batches) avail += b.currentQuantity;
    if (avail < totalQty) {
      // Race: another packer drained stock between validate and here.
      // Throw to roll back the whole transition.
      throw new Error(
        `Tồn kho thay đổi giữa lúc xác nhận: cần ${totalQty}, còn ${avail}. Vui lòng thử lại.`,
      );
    }

    let qtyNeeded = totalQty;
    let totalCost = 0;
    for (const batch of batches) {
      if (qtyNeeded <= 0) break;
      const useQty = Math.min(qtyNeeded, batch.currentQuantity);
      const costPerUnit = batch.importCost == null ? 0 : Number(batch.importCost);

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { currentQuantity: { decrement: useQty } },
      });

      await tx.orderItemBatch.create({
        data: {
          orderItemId: item.id,
          batchId: batch.id,
          quantityUsed: useQty,
          costAtTime: new Prisma.Decimal(costPerUnit.toFixed(2)),
        },
      });

      await tx.inventoryMovement.create({
        data: {
          orgId: user.orgId,
          productId: item.productId,
          batchId: batch.id,
          type: 'export',
          quantity: -useQty,
          referenceType: 'order',
          referenceId: orderId,
          note: `FIFO đóng gói (item ${item.id}, lô ${batch.batchCode})`,
          createdById: user.id,
        },
      });

      totalCost += useQty * costPerUnit;
      qtyNeeded -= useQty;
    }

    // Should never trigger after the avail check, but defend anyway.
    if (qtyNeeded > 0) {
      throw new Error(
        `FIFO không đủ tồn ngoài dự kiến — productId=${item.productId}, còn thiếu ${qtyNeeded}.`,
      );
    }

    const unitCost = totalCost / totalQty;
    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        unitCost: new Prisma.Decimal(unitCost.toFixed(2)),
        lineCost: new Prisma.Decimal(totalCost.toFixed(2)),
        profit: new Prisma.Decimal((item.lineTotal - totalCost).toFixed(2)),
      },
    });
  }
}

/**
 * Reverse the FIFO allocation written by `processFIFO`. Called when an
 * order that has packed (or shipped) is cancelled. Reads the
 * `order_item_batches` trace, returns each quantity to its source
 * batch, writes a matching `inventory_movements` (type=return), then
 * clears the trace rows. The OrderItem's cost fields are reset to null
 * so a subsequent re-pack can recompute them from scratch — though in
 * practice a cancelled order doesn't get re-packed.
 */
export async function reverseFIFO(
  tx: any,
  orderId: string,
  user: FifoUser,
): Promise<void> {
  const usages = await tx.orderItemBatch.findMany({
    where: { orderItem: { orderId } },
    include: {
      orderItem: { select: { id: true, productId: true } },
    },
  });
  if (usages.length === 0) return;

  for (const u of usages as Array<{
    id: string;
    batchId: string;
    quantityUsed: number;
    orderItem: { id: string; productId: string | null };
  }>) {
    if (!u.orderItem.productId) continue;
    await tx.inventoryBatch.update({
      where: { id: u.batchId },
      data: { currentQuantity: { increment: u.quantityUsed } },
    });
    await tx.inventoryMovement.create({
      data: {
        orgId: user.orgId,
        productId: u.orderItem.productId,
        batchId: u.batchId,
        type: 'return',
        quantity: u.quantityUsed,
        referenceType: 'order',
        referenceId: orderId,
        note: `Hoàn kho FIFO do huỷ đơn (item ${u.orderItem.id})`,
        createdById: user.id,
      },
    });
  }

  await tx.orderItemBatch.deleteMany({
    where: { orderItem: { orderId } },
  });
  await tx.orderItem.updateMany({
    where: { orderId, productId: { not: null } },
    data: { unitCost: null, lineCost: null, profit: null },
  });
}
