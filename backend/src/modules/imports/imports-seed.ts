/**
 * Seed 3 confirmed import orders so Session 3.5B has multi-lot data
 * for FIFO testing without manual setup.
 *
 *   NK-202604-001  Manhae       50 hộp MH_01  @ 240,000  lô L2604-A
 *   NK-202605-001  Manhae       30 hộp MH_01  @ 245,000  lô L2605-A
 *   NK-202605-002  Bioisland    20 hộp BIO_01 @ 350,000  lô L2605-B
 *
 * Idempotent: re-running skips orders whose `importCode` already exists.
 * Each seed creates the import header + items, then walks the same
 * confirm logic as the API (creates inventory_batches, inventory_movements
 * type=import, syncs product totalStock + costPrice).
 */
import pkg from '@prisma/client';
const { Prisma } = pkg;
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

interface SeedItem {
  sku: string;
  batchCode: string;
  quantity: number;
  unitCost: number;
  manufactureDate: string;
  expiryDate: string;
}

interface SeedOrder {
  importCode: string;
  supplierName: string;
  importDate: string;
  nccInvoiceNo: string;
  items: SeedItem[];
}

const SEEDS: SeedOrder[] = [
  {
    importCode: 'NK-202604-001',
    supplierName: 'Laboratoires Manhae (Pháp)',
    importDate: '2026-04-05',
    nccInvoiceNo: 'INV-MH-2604-A',
    items: [
      {
        sku: 'MH_01',
        batchCode: 'L2604-A',
        quantity: 50,
        unitCost: 240_000,
        manufactureDate: '2026-02-01',
        expiryDate: '2028-02-01',
      },
    ],
  },
  {
    importCode: 'NK-202605-001',
    supplierName: 'Laboratoires Manhae (Pháp)',
    importDate: '2026-05-03',
    nccInvoiceNo: 'INV-MH-2605-A',
    items: [
      {
        sku: 'MH_01',
        batchCode: 'L2605-A',
        quantity: 30,
        unitCost: 245_000,
        manufactureDate: '2026-03-15',
        expiryDate: '2028-03-15',
      },
    ],
  },
  {
    importCode: 'NK-202605-002',
    supplierName: 'Bioisland Australia',
    importDate: '2026-05-04',
    nccInvoiceNo: 'INV-BIO-2605-B',
    items: [
      {
        sku: 'BIO_01',
        batchCode: 'L2605-B',
        quantity: 20,
        unitCost: 350_000,
        manufactureDate: '2026-02-10',
        expiryDate: '2028-02-10',
      },
    ],
  },
];

async function syncProductCostAndStock(productId: string): Promise<void> {
  const batches = await prisma.inventoryBatch.findMany({
    where: { productId, status: 'active', currentQuantity: { gt: 0 } },
    select: { currentQuantity: true, importCost: true },
  });
  const totalStock = batches.reduce(
    (s: number, b: { currentQuantity: number }) => s + b.currentQuantity,
    0,
  );
  let costSum = 0;
  let qtySum = 0;
  for (const b of batches) {
    if (b.importCost == null) continue;
    costSum += Number(b.importCost) * b.currentQuantity;
    qtySum += b.currentQuantity;
  }
  const costPrice = qtySum > 0 ? costSum / qtySum : null;
  await prisma.product.update({
    where: { id: productId },
    data: {
      totalStock,
      ...(costPrice !== null
        ? { costPrice: new Prisma.Decimal(costPrice.toFixed(2)) }
        : {}),
    },
  });
}

export async function seedImportOrders(orgId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findFirst({
    where: { orgId, active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!warehouse) {
    logger.warn('[imports-seed] no active warehouse — skipping');
    return;
  }

  const adminUser = await prisma.user.findFirst({
    where: { orgId, role: { in: ['owner', 'admin'] }, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  for (const seed of SEEDS) {
    const existing = await prisma.importOrder.findFirst({
      where: { orgId, importCode: seed.importCode },
      select: { id: true },
    });
    if (existing) continue;

    const supplier = await prisma.supplier.findFirst({
      where: { orgId, name: seed.supplierName },
      select: { id: true },
    });
    if (!supplier) {
      logger.warn(`[imports-seed] supplier "${seed.supplierName}" not found — skipping ${seed.importCode}`);
      continue;
    }

    // Resolve SKUs to product IDs; skip the whole order if any miss.
    const skuToProduct = new Map<string, string>();
    for (const item of seed.items) {
      const p = await prisma.product.findFirst({
        where: { orgId, sku: item.sku },
        select: { id: true },
      });
      if (!p) {
        logger.warn(`[imports-seed] product "${item.sku}" not found — skipping ${seed.importCode}`);
        skuToProduct.clear();
        break;
      }
      skuToProduct.set(item.sku, p.id);
    }
    if (skuToProduct.size === 0) continue;

    // Skip if any (product, batchCode) already exists — re-running on a
    // partially seeded DB shouldn't corrupt previous data.
    let collision = false;
    for (const item of seed.items) {
      const productId = skuToProduct.get(item.sku)!;
      const exists = await prisma.inventoryBatch.findFirst({
        where: { orgId, productId, batchCode: item.batchCode },
        select: { id: true },
      });
      if (exists) {
        logger.info(`[imports-seed] batch ${item.batchCode} already exists — skipping ${seed.importCode}`);
        collision = true;
        break;
      }
    }
    if (collision) continue;

    let totalQuantity = 0;
    let totalAmount = 0;
    for (const item of seed.items) {
      totalQuantity += item.quantity;
      totalAmount += item.quantity * item.unitCost;
    }

    const importOrder = await prisma.importOrder.create({
      data: {
        orgId,
        importCode: seed.importCode,
        supplierId: supplier.id,
        importDate: new Date(seed.importDate),
        nccInvoiceNo: seed.nccInvoiceNo,
        notes: 'Seed dữ liệu test FIFO (Session 3.5A)',
        attachments: [],
        createdById: adminUser?.id ?? null,
        totalQuantity,
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        status: 'confirmed',
        confirmedAt: new Date(seed.importDate),
        items: {
          create: seed.items.map((it) => ({
            productId: skuToProduct.get(it.sku)!,
            batchCode: it.batchCode,
            quantity: it.quantity,
            unitCost: new Prisma.Decimal(it.unitCost.toFixed(2)),
            manufactureDate: new Date(it.manufactureDate),
            expiryDate: new Date(it.expiryDate),
            lineTotal: new Prisma.Decimal((it.quantity * it.unitCost).toFixed(2)),
            notes: null,
          })),
        },
      },
      include: { items: true },
    });

    // Materialise batches + movements (mirrors confirm endpoint).
    for (const it of importOrder.items) {
      const batch = await prisma.inventoryBatch.create({
        data: {
          orgId,
          productId: it.productId,
          warehouseId: warehouse.id,
          batchCode: it.batchCode,
          manufactureDate: it.manufactureDate,
          expiryDate: it.expiryDate,
          importQuantity: it.quantity,
          currentQuantity: it.quantity,
          importCost: it.unitCost,
          supplierId: supplier.id,
          importOrderId: importOrder.id,
          createdById: adminUser?.id ?? null,
          notes: it.notes,
          importedAt: new Date(seed.importDate),
        },
      });
      await prisma.inventoryMovement.create({
        data: {
          orgId,
          productId: it.productId,
          batchId: batch.id,
          type: 'import',
          quantity: it.quantity,
          referenceType: 'import_order',
          referenceId: importOrder.id,
          note: `Nhập kho ${importOrder.importCode} — lô ${it.batchCode} (seed)`,
          createdById: adminUser?.id ?? null,
          createdAt: new Date(seed.importDate),
        },
      });
    }

    const productIds = [
      ...new Set(importOrder.items.map((it: { productId: string }) => it.productId)),
    ] as string[];
    for (const pid of productIds) {
      await syncProductCostAndStock(pid);
    }

    logger.info(`[imports-seed] created ${seed.importCode}`);
  }
}
