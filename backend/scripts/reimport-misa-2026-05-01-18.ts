/**
 * Re-import MISA data ngày 01-18/05/2026 (TASK LỚN, 1 lần duy nhất).
 *
 * Bối cảnh (anh Philip yêu cầu 19/05/2026):
 *   Xuất 2 file Excel từ MISA range 01-18/5 để re-import "sạch":
 *     - Ban_hang 1-18.5.xlsx          (122 đơn, 1 đơn nháp XK5832)
 *     - So_chi_tiet_ban_hang 1-18.5.xlsx (121 đơn thật, 172 line items, 2.341.535.444đ)
 *
 *   Excel đã được convert sang JSON ở /tmp/misa_1_18_5.json (qua Python openpyxl)
 *   để TS script đọc dễ hơn (không cần install xlsx package).
 *
 * Trước khi chạy script này đã:
 *   1. Backup DB → backups/backup_before_misa_reimport_20260519_0950.sql
 *   2. Update products.cost_price theo Bảng giá vốn anh gửi (áp 1/5/2026)
 *   3. Xoá 113 orders trong range XK5767-XK5887 (giữ 6 đơn 28-30/4)
 *
 * Quyết định anh Philip chốt (19/05/2026):
 *   1. Cost: dùng products.cost_price (đã update theo Bảng giá vốn)
 *   2. BIO_01: 511.000 (theo bảng anh)
 *   3. User "Halo VN": fallback Admin (KHÔNG tạo user mới)
 *   4. XK5869: re-import theo SCT (có line items đầy đủ)
 *   5. 6 đơn DB không có trong SCT: đã XOÁ, KHÔNG import lại
 *
 * Usage:
 *   npx tsx scripts/reimport-misa-2026-05-01-18.ts            # dry-run
 *   npx tsx scripts/reimport-misa-2026-05-01-18.ts --apply    # ghi DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: conn }) });

const JSON_PATH = '/tmp/misa_1_18_5.json';

interface OrderHeader {
  orderCode: string;
  orderDate: string;       // ISO
  misaCode: string;
  customerName: string;
  saleName: string;
  address: string;
  province: string;
  ward: string;
  phone: string;
  description: string;
  total: number;           // Tổng tiền thanh toán (gross w/VAT nếu có)
  subtotal: number;        // Tổng tiền hàng (net)
  vat: number;             // VAT
}

interface LineItem {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

async function main(): Promise<void> {
  console.log(`Re-import MISA 01-18/05/2026 — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log('═'.repeat(72));

  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8')) as { orders: OrderHeader[]; items: LineItem[] };
  const allOrders = data.orders;
  const allItems = data.items;

  const sctCodes = new Set(allItems.map((i) => i.orderCode));
  const draftOrders = allOrders.filter((o) => !sctCodes.has(o.orderCode));
  const officialOrders = allOrders.filter((o) => sctCodes.has(o.orderCode));

  console.log(`File Ban_hang:     ${allOrders.length} đơn`);
  console.log(`File SCT:          ${sctCodes.size} đơn / ${allItems.length} line items`);
  console.log(`Đơn nháp (skip):   ${draftOrders.length} → ${draftOrders.map((o) => o.orderCode).join(', ')}`);
  console.log(`Đơn chính thức:    ${officialOrders.length}`);

  const itemsByCode = new Map<string, LineItem[]>();
  for (const it of allItems) {
    const arr = itemsByCode.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByCode.set(it.orderCode, arr);
  }

  // Header vs line items consistency (chỉ note, không throw vì 1 đơn có VAT)
  let vatOrders = 0;
  for (const o of officialOrders) {
    const items = itemsByCode.get(o.orderCode) ?? [];
    const sum = items.reduce((s, i) => s + i.lineTotal, 0);
    if (Math.abs(sum - o.total) > 1) {
      // Đơn có VAT: SCT = net, Ban_hang.total = gross
      const expectedGross = sum + (o.vat || 0);
      if (Math.abs(expectedGross - o.total) <= 1) {
        vatOrders++;
      } else {
        console.log(`  ⚠ ${o.orderCode}: SCT=${sum.toLocaleString('vi-VN')} vs Ban_hang=${o.total.toLocaleString('vi-VN')} (VAT=${o.vat})`);
      }
    }
  }
  if (vatOrders > 0) console.log(`✓ ${vatOrders} đơn có VAT (gross = net + VAT)`);

  const allSkus = Array.from(new Set(allItems.map((i) => i.sku)));
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization');
  const products = await prisma.product.findMany({
    where: { orgId: org.id, sku: { in: allSkus } },
    select: { id: true, sku: true, costPrice: true },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const missingSku: string[] = [];
  const missingCost: string[] = [];
  for (const sku of allSkus) {
    const p = productBySku.get(sku);
    if (!p) missingSku.push(sku);
    else if (p.costPrice == null || Number(p.costPrice) === 0) missingCost.push(sku);
  }
  if (missingSku.length) {
    console.error(`\n❌ SKU không có trong DB: ${missingSku.join(', ')} — DỪNG`);
    process.exit(1);
  }
  if (missingCost.length) {
    console.warn(`\n⚠ SKU có cost_price=0/NULL: ${missingCost.join(', ')}`);
  }
  console.log(`\n✓ Tất cả ${allSkus.length} SKU có trong DB & có cost_price`);

  const users = await prisma.user.findMany({
    where: { orgId: org.id },
    select: { id: true, fullName: true, role: true },
  });
  const userByName = new Map(users.map((u) => [u.fullName.toLowerCase(), u.id]));
  const adminUser = users.find((u) => u.role === 'owner') ?? users.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin user');

  const existingContacts = await prisma.contact.findMany({
    where: {
      orgId: org.id,
      OR: [
        { misaCustomerCode: { in: officialOrders.map((o) => o.misaCode).filter(Boolean) } },
        { fullName: { in: officialOrders.map((o) => o.customerName) } },
      ],
    },
    select: { id: true, misaCustomerCode: true, fullName: true },
  });
  const contactByMisa = new Map(existingContacts.filter((c) => c.misaCustomerCode).map((c) => [c.misaCustomerCode!, c.id]));
  const contactByName = new Map(existingContacts.map((c) => [c.fullName, c.id]));

  const existingOrders = await prisma.order.findMany({
    where: { orgId: org.id, orderCode: { in: officialOrders.map((o) => o.orderCode) } },
    select: { orderCode: true },
  });
  const existingOrderCodes = new Set(existingOrders.map((o) => o.orderCode));
  if (existingOrderCodes.size > 0) {
    console.log(`\n⚠ ${existingOrderCodes.size} đơn đã có trong DB — sẽ skip`);
  }

  const totalOfficial = officialOrders.reduce((s, o) => s + o.total, 0);
  let totalCost = 0;
  for (const o of officialOrders) {
    const items = itemsByCode.get(o.orderCode) ?? [];
    for (const it of items) {
      totalCost += Number(productBySku.get(it.sku)!.costPrice) * it.quantity;
    }
  }

  const saleBreakdown = new Map<string, { count: number; total: number }>();
  for (const o of officialOrders) {
    const key = o.saleName || '(trống)';
    const s = saleBreakdown.get(key) ?? { count: 0, total: 0 };
    s.count++;
    s.total += o.total;
    saleBreakdown.set(key, s);
  }

  let toCreate = 0, toReuse = 0;
  for (const o of officialOrders) {
    const cid = (o.misaCode && contactByMisa.get(o.misaCode)) ?? contactByName.get(o.customerName);
    if (cid) toReuse++; else toCreate++;
  }

  console.log('\n─── SUMMARY ─────────────────────────────────────────────────');
  console.log(`  Sẽ import: ${officialOrders.length} đơn (skip ${existingOrderCodes.size} đã có)`);
  console.log(`  Contact:   tạo ${toCreate}, reuse ${toReuse}`);
  console.log(`  Doanh số:  ${totalOfficial.toLocaleString('vi-VN').padStart(15)} đ`);
  console.log(`  Giá vốn:   ${totalCost.toLocaleString('vi-VN').padStart(15)} đ`);
  console.log(`  Lãi gộp:   ${(totalOfficial - totalCost).toLocaleString('vi-VN').padStart(15)} đ`);
  console.log(`  Margin:    ${((totalOfficial - totalCost) / totalOfficial * 100).toFixed(2)}%`);
  console.log('\n  Sale breakdown:');
  const saleSorted = [...saleBreakdown.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [name, s] of saleSorted) {
    const matched = userByName.has(name.toLowerCase());
    console.log(`    ${matched ? '✓' : '→Admin'} ${name.padEnd(22)} ${String(s.count).padStart(3)} đơn  ${s.total.toLocaleString('vi-VN').padStart(15)} đ`);
  }

  if (!APPLY) {
    console.log('\n💡 Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ─────────────────────────────────────────────────');

  const touchedContacts = new Set<string>();
  let importedCount = 0;
  let importedItemCount = 0;

  for (const o of officialOrders) {
    if (existingOrderCodes.has(o.orderCode)) continue;

    const saleId = userByName.get(o.saleName.toLowerCase()) ?? adminUser.id;

    let contactId = (o.misaCode && contactByMisa.get(o.misaCode)) ?? contactByName.get(o.customerName);
    if (!contactId) {
      const fullAddress = [o.address, o.ward].filter(Boolean).join(', ') || null;
      const c = await prisma.contact.create({
        data: {
          orgId: org.id,
          misaCustomerCode: o.misaCode || null,
          fullName: o.customerName,
          phone: o.phone || null,
          address: fullAddress,
          province: o.province || null,
          source: 'misa_import',
          assignedUserId: saleId,
        },
        select: { id: true },
      });
      contactId = c.id;
      if (o.misaCode) contactByMisa.set(o.misaCode, contactId);
      contactByName.set(o.customerName, contactId);
    }
    touchedContacts.add(contactId);

    const items = itemsByCode.get(o.orderCode) ?? [];
    const orderDate = new Date(o.orderDate);

    const order = await prisma.order.create({
      data: {
        orgId: org.id,
        contactId,
        createdByUserId: adminUser.id,
        assignedSaleId: saleId,
        orderCode: o.orderCode,
        orderDate,
        status: 'completed',
        paymentMethod: 'credit',
        totalAmount: o.total,
        subtotalAmount: o.total,
        discountAmount: 0,
        totalAmountValue: o.total,
        paidAmount: 0,
        debtAmountValue: o.total,
        internalNote: o.description ? `Import từ Misa - ${o.description}` : 'Import từ Misa',
        productSkus: Array.from(new Set(items.map((it) => it.sku))),
        confirmedAt: orderDate,
        packedAt: orderDate,
        shippedAt: orderDate,
        completedAt: orderDate,
      },
      select: { id: true },
    });

    await prisma.orderItem.createMany({
      data: items.map((it) => {
        const product = productBySku.get(it.sku)!;
        const unitCost = Number(product.costPrice);
        const lineCost = unitCost * it.quantity;
        return {
          orderId: order.id,
          productId: product.id,
          sku: it.sku,
          productName: it.productName,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountValue: 0,
          lineTotal: it.lineTotal,
          costValue: lineCost,
          unitCost,
          lineCost,
          profit: it.lineTotal - lineCost,
          returnQty: 0,
          returnValue: 0,
        };
      }),
    });
    importedCount++;
    importedItemCount += items.length;

    if (importedCount % 20 === 0) console.log(`  ✓ ${importedCount} đơn đã import...`);
  }
  console.log(`\n  ✓ Import xong: ${importedCount} đơn, ${importedItemCount} line items`);

  console.log('\n─── RECALCULATING contact.lastOrderDate ─────────────────────');
  for (const cid of touchedContacts) {
    const last = await prisma.order.findFirst({
      where: { contactId: cid, status: 'completed' },
      orderBy: { orderDate: 'desc' },
      select: { orderDate: true },
    });
    if (last?.orderDate) {
      await prisma.contact.update({
        where: { id: cid },
        data: { lastOrderDate: last.orderDate },
      });
    }
  }
  console.log(`  ✓ Synced ${touchedContacts.size} contacts`);

  console.log('\n✅ Re-import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
