/**
 * Idempotent seed for the wholesale-order workflow.
 *
 *   1. 1 warehouse "Kho Hà Nội"
 *   2. 2 batches per existing product (one near expiry, one fresh)
 *   3. 5 sample wholesale orders covering each pipeline status
 *
 * Pattern: seed-on-first-use (called from preHandler hook on the orders
 * list endpoint), like task-seeds.ts and product-seeds.ts. Safe to call
 * concurrently — uses a per-org promise lock + idempotent inserts.
 *
 * IMPORTANT: this runs in production-like data. We never delete or
 * mutate existing rows. We skip the entire seed if the org already has
 * any wholesale order (orderCode starting with "DH-") or any batch.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { recomputeOrderTotals, generateOrderCode } from './order-service.js';

const seedingLocks = new Map<string, Promise<void>>();

export async function ensureOrderSeeds(orgId: string): Promise<void> {
  if (seedingLocks.has(orgId)) return seedingLocks.get(orgId)!;
  const p = runSeed(orgId).catch((err) => {
    seedingLocks.delete(orgId);
    logger.error('[order-seeds] Seed failed:', err);
    throw err;
  });
  seedingLocks.set(orgId, p);
  return p;
}

async function runSeed(orgId: string): Promise<void> {
  const [batchCount, dhOrderCount] = await Promise.all([
    prisma.inventoryBatch.count({ where: { orgId } }),
    prisma.order.count({ where: { orgId, orderCode: { startsWith: 'DH-' } } }),
  ]);
  if (batchCount > 0 && dhOrderCount > 0) {
    return;
  }

  logger.info(`[order-seeds] Seeding wholesale orders for org ${orgId}...`);

  // 1. Warehouse
  let warehouse = await prisma.warehouse.findFirst({
    where: { orgId, name: 'Kho Hà Nội' },
  });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        orgId,
        name: 'Kho Hà Nội',
        address: 'Số 12, ngõ 18, đường Cầu Diễn, Bắc Từ Liêm, Hà Nội',
        active: true,
      },
    });
  }

  // 2. Batches (2 per product) — only if no batch exists yet
  if (batchCount === 0) {
    const products = await prisma.product.findMany({
      where: { orgId, status: { not: 'discontinued' } },
      select: { id: true, sku: true, costPrice: true, totalStock: true, warningStock: true },
    });
    const today = new Date();
    for (const p of products) {
      // Older batch — closer expiry
      const oldExpiry = new Date(today);
      oldExpiry.setMonth(oldExpiry.getMonth() + 6);
      const newExpiry = new Date(today);
      newExpiry.setMonth(newExpiry.getMonth() + 18);
      const oldImported = new Date(today);
      oldImported.setMonth(oldImported.getMonth() - 6);
      const newImported = new Date(today);
      newImported.setMonth(newImported.getMonth() - 1);
      const oldQty = Math.max(20, Math.floor((p.totalStock || 100) * 0.4));
      const newQty = Math.max(50, Math.floor((p.totalStock || 100) * 0.6));

      await prisma.inventoryBatch.upsert({
        where: { orgId_productId_batchCode: { orgId, productId: p.id, batchCode: `${p.sku}-OLD` } },
        update: {},
        create: {
          orgId,
          productId: p.id,
          warehouseId: warehouse.id,
          batchCode: `${p.sku}-OLD`,
          manufactureDate: new Date(today.getFullYear() - 1, today.getMonth(), 1),
          expiryDate: oldExpiry,
          importQuantity: oldQty,
          currentQuantity: oldQty,
          importCost: p.costPrice ?? 0,
          importedAt: oldImported,
          notes: 'Seed: lô cũ — gần hết hạn',
        },
      });
      await prisma.inventoryBatch.upsert({
        where: { orgId_productId_batchCode: { orgId, productId: p.id, batchCode: `${p.sku}-NEW` } },
        update: {},
        create: {
          orgId,
          productId: p.id,
          warehouseId: warehouse.id,
          batchCode: `${p.sku}-NEW`,
          manufactureDate: new Date(today.getFullYear(), today.getMonth() - 1, 1),
          expiryDate: newExpiry,
          importQuantity: newQty,
          currentQuantity: newQty,
          importCost: p.costPrice ?? 0,
          importedAt: newImported,
          notes: 'Seed: lô mới',
        },
      });

      // Sync product.totalStock (sum of active batches)
      const sum = await prisma.inventoryBatch.aggregate({
        where: { productId: p.id, status: 'active' },
        _sum: { currentQuantity: true },
      });
      await prisma.product.update({
        where: { id: p.id },
        data: { totalStock: sum._sum.currentQuantity ?? 0 },
      });
    }
  }

  // 3. Sample wholesale orders — 5 with varied statuses
  if (dhOrderCount === 0) {
    const contacts = await prisma.contact.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      take: 5,
      select: { id: true, fullName: true, assignedUserId: true, address: true },
    });
    if (contacts.length === 0) {
      logger.warn('[order-seeds] No contacts to attach sample orders to — skipping order seed');
      seedingLocks.delete(orgId);
      return;
    }
    const products = await prisma.product.findMany({
      where: { orgId, status: 'active' },
      include: {
        prices: { where: { active: true }, orderBy: { displayOrder: 'asc' } },
        batches: { where: { status: 'active', currentQuantity: { gt: 0 } }, orderBy: { expiryDate: 'asc' } },
      },
      take: 5,
    });
    if (products.length === 0) {
      logger.warn('[order-seeds] No products available — skipping order seed');
      seedingLocks.delete(orgId);
      return;
    }

    // Find an admin user to attribute the seeds to
    const admin = await prisma.user.findFirst({
      where: { orgId, role: { in: ['owner', 'admin'] } },
      select: { id: true },
    });
    if (!admin) {
      logger.warn('[order-seeds] No admin user found — skipping order seed');
      seedingLocks.delete(orgId);
      return;
    }

    const today = new Date();
    const samples: Array<{
      status: 'draft' | 'confirmed' | 'shipping' | 'completed';
      paid: number;
      withGift: boolean;
      itemsCount: number;
      daysAgo: number;
      note: string;
    }> = [
      { status: 'draft', paid: 0, withGift: false, itemsCount: 2, daysAgo: 1, note: 'Đơn nháp đang soạn' },
      { status: 'confirmed', paid: 0, withGift: true, itemsCount: 3, daysAgo: 3, note: 'Đã chốt đơn — chờ đóng gói' },
      { status: 'shipping', paid: 5_000_000, withGift: false, itemsCount: 2, daysAgo: 7, note: 'Đang vận chuyển GHTK' },
      { status: 'completed', paid: -1, withGift: false, itemsCount: 3, daysAgo: 30, note: 'Đơn hoàn tất, đã thu đủ' },
      { status: 'completed', paid: 2_000_000, withGift: false, itemsCount: 2, daysAgo: 45, note: 'Còn nợ' },
    ];

    for (let i = 0; i < samples.length && i < contacts.length; i++) {
      const s = samples[i];
      const c = contacts[i];
      const orderDate = new Date(today);
      orderDate.setDate(orderDate.getDate() - s.daysAgo);

      const orderCode = await generateOrderCode(orgId);

      // Create order shell
      const order = await prisma.order.create({
        data: {
          orgId,
          contactId: c.id,
          createdByUserId: admin.id,
          assignedSaleId: c.assignedUserId ?? admin.id,
          orderCode,
          status: 'draft', // promoted later
          orderDate,
          source: ['facebook', 'zalo', 'gioi_thieu', 'khac'][i % 4],
          shippingMethod: i === 0 ? 'pickup_at_warehouse' : i === 2 ? 'cod' : 'prepaid',
          shippingProvider: i === 2 ? 'GHTK' : null,
          trackingCode: i === 2 ? `GHTK${100000 + i}` : null,
          shippingFee: i === 0 ? 0 : 35_000,
          deliveryAddress: c.address ?? 'Địa chỉ giao mẫu - chỉnh sau',
          discountType: i === 1 ? 'percent' : null,
          discountValue: i === 1 ? 5 : 0,
          paymentMethod: i === 4 ? 'credit' : i === 2 ? 'cod' : 'bank_transfer',
          debtDueDate: i === 4 ? new Date(orderDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null,
          internalNote: s.note,
          customerNote: 'Cảm ơn quý khách đã đặt hàng — Nghề Dược Sĩ',
          totalAmount: 0,
          subtotalAmount: 0,
          totalAmountValue: 0,
          discountAmount: 0,
          paidAmount: 0,
        },
      });

      // Add items
      const itemsToAdd = products.slice(0, s.itemsCount);
      for (const p of itemsToAdd) {
        if (p.batches.length === 0 || p.prices.length === 0) continue;
        const batch = p.batches[0];
        const tier = p.prices.find((t: { isDefault: boolean }) => t.isDefault) ?? p.prices[0];
        const qty = 5 + i;
        const unitPrice = Number(tier.price);
        const unitCost = p.costPrice ? Number(p.costPrice) : 0;
        const lineTotal = qty * unitPrice;
        const lineCost = qty * unitCost;
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productId: p.id,
            batchId: batch.id,
            priceTierId: tier.id,
            sku: p.sku,
            productName: p.name,
            unit: p.unit,
            quantity: qty,
            unitPrice,
            lineTotal,
            unitCost,
            lineCost,
            profit: lineTotal - lineCost,
            costValue: unitCost,
          },
        });
      }

      // Optional gift on the second order
      if (s.withGift && itemsToAdd[0]) {
        await prisma.orderGift.create({
          data: {
            orderId: order.id,
            giftName: 'Túi vải Manhae (custom gift)',
            quantity: 1,
            note: 'Khuyến mãi tháng 5',
          },
        });
      }

      await recomputeOrderTotals(order.id);

      // Now promote status to the target — skipping the real transition
      // logic to avoid double stock-deduction. We deduct stock manually
      // for shipping/completed sample orders.
      if (s.status !== 'draft') {
        const stageData: Record<string, unknown> = { status: s.status };
        if (s.status === 'confirmed') stageData.confirmedAt = new Date(orderDate.getTime() + 1 * 60 * 60 * 1000);
        if (s.status === 'shipping') {
          stageData.confirmedAt = new Date(orderDate.getTime() + 1 * 60 * 60 * 1000);
          stageData.packedAt = new Date(orderDate.getTime() + 4 * 60 * 60 * 1000);
          stageData.shippedAt = new Date(orderDate.getTime() + 8 * 60 * 60 * 1000);
        }
        if (s.status === 'completed') {
          stageData.confirmedAt = new Date(orderDate.getTime() + 1 * 60 * 60 * 1000);
          stageData.packedAt = new Date(orderDate.getTime() + 4 * 60 * 60 * 1000);
          stageData.shippedAt = new Date(orderDate.getTime() + 8 * 60 * 60 * 1000);
          stageData.completedAt = new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000);
        }
        await prisma.order.update({ where: { id: order.id }, data: stageData });

        // Manual stock deduction for shipping/completed (not draft/confirmed)
        if (s.status === 'shipping' || s.status === 'completed') {
          const orderWithItems = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
            include: { items: true },
          });
          for (const it of orderWithItems.items) {
            if (!it.batchId || !it.productId) continue;
            await prisma.inventoryBatch.update({
              where: { id: it.batchId },
              data: { currentQuantity: { decrement: it.quantity } },
            });
            await prisma.inventoryMovement.create({
              data: {
                orgId,
                productId: it.productId,
                batchId: it.batchId,
                type: 'export',
                quantity: -Math.round(it.quantity),
                referenceType: 'order',
                referenceId: order.id,
                note: `Seed: trừ kho cho đơn ${orderCode}`,
                createdById: admin.id,
              },
            });
          }
        }
      }

      // Set paidAmount for the sample
      const orderTotal = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { totalAmountValue: true, totalAmount: true },
      });
      const totalNum = Number(orderTotal.totalAmountValue ?? orderTotal.totalAmount ?? 0);
      const paidAmount = s.paid === -1 ? totalNum : s.paid;
      if (paidAmount > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { paidAmount },
        });
        await recomputeOrderTotals(order.id);
      }

      // Update contact.lastOrderDate for completed sample orders
      if (s.status === 'completed') {
        await prisma.contact.update({
          where: { id: c.id },
          data: { lastOrderDate: orderDate, address: c.address ?? 'Địa chỉ giao mẫu' },
        });
      }
    }
  }

  logger.info(`[order-seeds] Done seeding wholesale orders for org ${orgId}`);
}
