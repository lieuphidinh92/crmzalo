/**
 * MISA orders import — runs once to load historical sales data into CRM.
 *
 * Inputs:
 *   - File master ("Bán hàng"): one row per order (số chứng từ XK xxx)
 *   - File detail ("Sổ chi tiết bán hàng"): one row per line item, linked
 *     by Số chứng từ.
 *
 * Pipeline:
 *   1. Read both Excel files via exceljs
 *   2. Group line items by orderCode (354 orders covered + 1 hard-coded XK5712)
 *   3. Group orders by misaCustomerCode → 123 unique customers
 *   4. For each customer: find existing contact (by misa code → phone last9)
 *      or create new
 *   5. For each order: skip if (orgId, orderCode) exists, else insert
 *      + insert all OrderItem rows in one transaction
 *   6. Print summary, in --dry-run no DB writes happen
 *
 * Usage:
 *   npx tsx scripts/import-misa.ts --dry-run    # preview only
 *   npx tsx scripts/import-misa.ts --apply      # write to DB
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';
import path from 'node:path';

// CLI flags: --master <path> --detail <path> [--apply]
function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const MASTER_FILE =
  getArg('master') ?? '/Users/tranhien1897/Downloads/Ban_hang (1).xlsx';
const DETAIL_FILE =
  getArg('detail') ?? '/Users/tranhien1897/Downloads/So_chi_tiet_ban_hang.xlsx';

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

const conn = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: conn });
const prisma = new PrismaClient({ adapter });

// ── Helpers ─────────────────────────────────────────────────────────

/** Strip leading 0/84/+84 → return last 9 digits for phone match. */
function phoneNorm(p: unknown): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

/** Combine TT thanh toán + TT xuất hàng → CRM Order.status. */
function mapStatus(payment: string, shipping: string): string {
  const p = (payment || '').trim();
  const s = (shipping || '').trim();
  if (p === 'Đã thanh toán' && s === 'Đã xuất đủ') return 'completed';
  if (p === 'Chưa thanh toán' && s === 'Đã xuất đủ') return 'shipped';
  if (p === 'Đã thanh toán' && s === 'Chưa xuất') return 'paid';
  if (p === 'Thanh toán một phần') return 'confirmed';
  return 'confirmed';
}

interface MasterRow {
  orderCode: string;
  orderDate: Date;
  misaCustomerCode: string | null;
  customerName: string | null;
  saleNvName: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  phoneFix: string | null;
  phoneMobile: string | null;
  totalGoods: number;
  vat: number;
  totalPayment: number;
  notes: string | null;
  paymentStatus: string;
  shippingStatus: string;
}

interface DetailRow {
  orderCode: string;
  sku: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  discountValue: number;
  lineTotal: number;
  costValue: number | null;
  returnQty: number;
  returnValue: number;
}

// ── Read Excel ──────────────────────────────────────────────────────

async function readMaster(): Promise<MasterRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(MASTER_FILE);
  const ws = wb.getWorksheet('Bán hàng')!;
  const rows: MasterRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 4) return; // header
    const stt = row.getCell(1).value;
    if (!stt) return; // skip empty / total row
    const code = String(row.getCell(4).value || '').trim();
    if (!code) return;
    rows.push({
      orderCode: code,
      orderDate: row.getCell(3).value as Date,
      misaCustomerCode: String(row.getCell(8).value || '').trim() || null,
      customerName: String(row.getCell(9).value || '').trim() || null,
      saleNvName: String(row.getCell(11).value || '').trim() || null,
      address: String(row.getCell(12).value || '').trim() || null,
      phoneFix: String(row.getCell(15).value || '').trim() || null,
      phoneMobile: String(row.getCell(17).value || '').trim() || null,
      notes: String(row.getCell(18).value || '').trim() || null,
      totalGoods: Number(row.getCell(19).value || 0),
      vat: Number(row.getCell(21).value || 0),
      totalPayment: Number(row.getCell(22).value || 0),
      paymentStatus: String(row.getCell(24).value || '').trim(),
      shippingStatus: String(row.getCell(25).value || '').trim(),
      province: String(row.getCell(27).value || '').trim() || null,
      district: String(row.getCell(28).value || '').trim() || null,
      ward: String(row.getCell(29).value || '').trim() || null,
    });
  });
  return rows;
}

async function readDetail(): Promise<DetailRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DETAIL_FILE);
  const ws = wb.getWorksheet('SỔ CHI TIẾT BÁN HÀNG')!;
  const rows: DetailRow[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum < 5) return; // headers + title rows
    const code = String(row.getCell(3).value || '').trim();
    const sku = String(row.getCell(10).value || '').trim();
    if (!code || !sku) return;
    rows.push({
      orderCode: code,
      sku,
      productName: String(row.getCell(11).value || '').trim() || sku,
      unit: String(row.getCell(13).value || '').trim() || null,
      quantity: Number(row.getCell(14).value || 0),
      unitPrice: Number(row.getCell(15).value || 0),
      lineTotal: Number(row.getCell(16).value || 0),
      discountValue: Number(row.getCell(17).value || 0),
      returnQty: Number(row.getCell(18).value || 0),
      returnValue: Number(row.getCell(19).value || 0),
      costValue: row.getCell(21).value !== null ? Number(row.getCell(21).value) : null,
    });
  });
  return rows;
}

// XK5712 — order missing in detail file. From the screenshot user provided.
const XK5712_ITEMS: DetailRow[] = [
  {
    orderCode: 'XK5712',
    sku: 'INC_02T',
    productName: 'Tăm nước Pro Water Flosser X6 màu trắng',
    unit: 'Bộ',
    quantity: 10,
    unitPrice: 483000,
    lineTotal: 4830000,
    discountValue: 0,
    returnQty: 0,
    returnValue: 0,
    costValue: null,
  },
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`[mode] ${DRY ? 'DRY RUN — no DB writes' : 'APPLY — writing to DB'}\n`);

  // 1. Load Excel
  const master = await readMaster();
  const detail = await readDetail();
  detail.push(...XK5712_ITEMS);
  console.log(`[excel] master=${master.length} orders, detail=${detail.length} line items`);

  // 2. Build details map
  const detailByCode = new Map<string, DetailRow[]>();
  for (const d of detail) {
    if (!detailByCode.has(d.orderCode)) detailByCode.set(d.orderCode, []);
    detailByCode.get(d.orderCode)!.push(d);
  }

  // 3. Resolve org + sale users
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) throw new Error('No organization in DB');
  const orgId = org.id;

  const users = await prisma.user.findMany({ where: { orgId } });
  const adminUser = users.find(u => u.role === 'owner')!;
  const userByName = new Map<string, string>();
  for (const u of users) userByName.set(u.fullName.trim().toLowerCase(), u.id);

  function resolveSale(name: string | null): string {
    if (!name) return adminUser.id;
    const key = name.trim().toLowerCase();
    if (key === 'halo vn') return adminUser.id;
    return userByName.get(key) ?? adminUser.id;
  }

  // 4. Build customer index from existing DB
  const existingContacts = await prisma.contact.findMany({
    where: { orgId },
    select: { id: true, phone: true, misaCustomerCode: true, fullName: true },
  });
  const byMisaCode = new Map<string, string>();   // misa → contact id
  const byPhone9 = new Map<string, string>();     // last9 phone → contact id
  for (const c of existingContacts) {
    if (c.misaCustomerCode) byMisaCode.set(c.misaCustomerCode, c.id);
    const p9 = phoneNorm(c.phone);
    if (p9 && !byPhone9.has(p9)) byPhone9.set(p9, c.id);
  }
  console.log(`[contacts] existing: ${existingContacts.length}, with misa code: ${byMisaCode.size}, with phone: ${byPhone9.size}`);

  // 5. Group master rows by misaCustomerCode → first row carries customer info
  const customerGroups = new Map<string, MasterRow[]>();
  for (const m of master) {
    const key = m.misaCustomerCode || `__nocode_${m.orderCode}`;
    if (!customerGroups.has(key)) customerGroups.set(key, []);
    customerGroups.get(key)!.push(m);
  }
  console.log(`[customers] unique misa groups: ${customerGroups.size}`);

  // 6. Plan + apply contact upserts
  let contactsCreated = 0;
  let contactsLinkedExisting = 0;
  let contactsBackfilledCode = 0;
  const contactIdByMisa = new Map<string, string>();

  for (const [key, rows] of customerGroups) {
    const first = rows[0];
    const misaCode = first.misaCustomerCode;
    const phone = first.phoneMobile || first.phoneFix || null;
    const phone9 = phoneNorm(phone);
    // Use the EARLIEST order date as the customer's "first contact" — this
    // is what resale/retention metrics filter on (contact.createdAt < month).
    // Without this, every imported MISA contact would carry today's date and
    // get classified as a brand-new lead, breaking the CEO score panel.
    const earliestOrderDate = rows
      .map((r) => r.orderDate)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? first.orderDate;

    let contactId: string | undefined;
    let matchedBy = '';

    // Match priority: misa code → phone last9
    if (misaCode && byMisaCode.has(misaCode)) {
      contactId = byMisaCode.get(misaCode);
      matchedBy = 'misa';
    } else if (phone9 && byPhone9.has(phone9)) {
      contactId = byPhone9.get(phone9);
      matchedBy = 'phone';
      // backfill misa code so future imports match faster
      if (misaCode && APPLY) {
        await prisma.contact.update({
          where: { id: contactId },
          data: { misaCustomerCode: misaCode },
        });
        contactsBackfilledCode++;
      }
    }

    if (contactId) {
      contactsLinkedExisting++;
    } else {
      // Create new contact
      if (APPLY) {
        const created = await prisma.contact.create({
          data: {
            orgId,
            fullName: first.customerName,
            phone: phone || null,
            misaCustomerCode: misaCode,
            source: 'misa_import',
            sourceDate: earliestOrderDate,
            firstContactDate: earliestOrderDate,
            // Override the @default(now()) so resale-revenue metrics
            // recognize this as a returning customer from prior periods.
            createdAt: earliestOrderDate,
            province: first.province,
            stage: 'dai_ly_chinh_thuc',
            assignedUserId: resolveSale(first.saleNvName),
            internalNote: first.address ? `Địa chỉ: ${first.address}` : null,
          },
        });
        contactId = created.id;
      } else {
        contactId = `__pending_${key}`;
      }
      contactsCreated++;
    }

    if (misaCode) contactIdByMisa.set(misaCode, contactId);
    // also map __nocode_xxx for orphan orders
    contactIdByMisa.set(key, contactId);
  }

  console.log(`[contacts] plan: create=${contactsCreated}, link existing=${contactsLinkedExisting}, backfill misa code=${contactsBackfilledCode}`);

  // 7. Plan + apply orders
  const existingOrderCodes = new Set(
    (await prisma.order.findMany({ where: { orgId }, select: { orderCode: true } }))
      .map(o => o.orderCode)
  );

  let ordersCreated = 0;
  let ordersSkipped = 0;
  let itemsCreated = 0;
  let ordersWithoutDetail = 0;

  for (const m of master) {
    if (existingOrderCodes.has(m.orderCode)) {
      ordersSkipped++;
      continue;
    }
    const customerKey = m.misaCustomerCode || `__nocode_${m.orderCode}`;
    const contactId = contactIdByMisa.get(customerKey);
    if (!contactId) {
      console.warn(`[order] ${m.orderCode}: no contact resolved, skipping`);
      continue;
    }

    const items = detailByCode.get(m.orderCode) ?? [];
    if (items.length === 0) ordersWithoutDetail++;

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orgId,
            contactId,
            createdByUserId: resolveSale(m.saleNvName),
            orderCode: m.orderCode,
            totalAmount: m.totalPayment,
            orderDate: m.orderDate,
            productSkus: items.map(i => i.sku),
            status: mapStatus(m.paymentStatus, m.shippingStatus),
            notes: m.notes,
          },
        });
        if (items.length > 0) {
          await tx.orderItem.createMany({
            data: items.map(i => ({
              orderId: order.id,
              sku: i.sku,
              productName: i.productName,
              unit: i.unit,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discountValue: i.discountValue,
              lineTotal: i.lineTotal,
              costValue: i.costValue,
              returnQty: i.returnQty,
              returnValue: i.returnValue,
            })),
          });
        }
      });
    }

    ordersCreated++;
    itemsCreated += items.length;
  }

  // 8. Summary
  console.log('');
  console.log('═══════════ SUMMARY ═══════════');
  console.log(`Mode:                  ${DRY ? 'DRY RUN (no writes)' : 'APPLIED'}`);
  console.log(`Master orders:         ${master.length}`);
  console.log(`Detail line items:     ${detail.length}`);
  console.log(`Customer groups:       ${customerGroups.size}`);
  console.log('');
  console.log(`Contacts → create:     ${contactsCreated}`);
  console.log(`Contacts → link:       ${contactsLinkedExisting}`);
  console.log(`Contacts → backfill:   ${contactsBackfilledCode}`);
  console.log('');
  console.log(`Orders   → create:     ${ordersCreated}`);
  console.log(`Orders   → skip (dup): ${ordersSkipped}`);
  console.log(`Orders   → no detail:  ${ordersWithoutDetail}`);
  console.log(`Items    → create:     ${itemsCreated}`);
  console.log('');
  console.log(`Total revenue:         ${master.reduce((s, m) => s + m.totalPayment, 0).toLocaleString('vi-VN')} VND`);
  console.log('═══════════════════════════════');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import error:', err);
  process.exit(1);
});
