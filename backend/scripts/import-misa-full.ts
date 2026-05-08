/**
 * MISA full historical import — Session "data load".
 *
 * Inputs (3 Excel files in ~/Downloads):
 *   - Danh_sach_hang_hoa_dich_vu.xlsx   → Product catalog (966 SP)
 *   - Ban_hang (3).xlsx                 → Order headers (393 orders)
 *   - So_chi_tiet_ban_hang (1).xlsx     → Line items (622 rows)
 *
 * Pipeline (idempotent, --dry-run by default):
 *   1. Read 3 files into structured rows
 *   2. UPSERT 966 products (by orgId+sku) — preserve existing prices
 *   3. UPSERT contacts (by orgId+misaCustomerCode, fallback by phone)
 *   4. UPSERT orders (by orgId+orderCode) — full data backfill
 *   5. Replace order_items for re-imported orders so totals match exactly
 *   6. Sync product.totalStock & contact.lastOrderDate
 *
 * Status mapping (Session 2/3 6-status pipeline):
 *   Đã xuất đủ + Đã thanh toán    → completed (paid)
 *   Đã xuất đủ + Chưa thanh toán  → completed (paymentMethod=credit)
 *   Chưa xuất + *                  → confirmed
 *   (rỗng) + *                     → draft
 *
 * Usage:
 *   npx tsx scripts/import-misa-full.ts                # dry-run (default)
 *   npx tsx scripts/import-misa-full.ts --apply        # write to DB
 */
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;
import { PrismaPg } from '@prisma/adapter-pg';
import ExcelJS from 'exceljs';

const APPLY = process.argv.includes('--apply');
const DRY = !APPLY;

/** CLI args:
 *   --catalog=<path>        override catalog file (skip if --skip-catalog)
 *   --orders=<path>         override orders file
 *   --items=<path>          override items file
 *   --only-orders=AA,BB,CC  scope to a specific list of orderCodes — items
 *                           and contacts for ONLY those orders are touched.
 *                           Used for incremental delta imports without
 *                           wiping line items of historical orders.
 *   --skip-catalog          skip the 966-product catalog re-import.
 *   --apply                 write to DB (default is dry-run).
 */
function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}
const SKIP_CATALOG = process.argv.includes('--skip-catalog');
const ONLY_ORDERS_RAW = getArgValue('only-orders');
const ONLY_ORDERS = ONLY_ORDERS_RAW
  ? new Set(ONLY_ORDERS_RAW.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

const CATALOG_FILE = getArgValue('catalog')
  ?? '/Users/tranhien1897/Downloads/Danh_sach_hang_hoa_dich_vu.xlsx';
const ORDERS_FILE = getArgValue('orders')
  ?? '/Users/tranhien1897/Downloads/Ban_hang (3).xlsx';
const ITEMS_FILE = getArgValue('items')
  ?? '/Users/tranhien1897/Downloads/So_chi_tiet_ban_hang (1).xlsx';

const conn = process.env.DATABASE_URL;
if (!conn) throw new Error('DATABASE_URL not set');
const adapter = new PrismaPg({ connectionString: conn });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object' && v && 'text' in (v as any)) return String((v as any).text).trim();
  return String(v).trim();
}

function asNumber(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalise phone — keep last 9-10 digits as match key. */
function phoneNorm(p: unknown): string | null {
  if (!p) return null;
  const digits = String(p).replace(/\D/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

/** Heuristic brand detection from SKU prefix (matches catalog distribution). */
function brandFromSku(sku: string): string | null {
  const m = sku.match(/^([A-Z]+)[_-]/);
  if (!m) return null;
  const prefix = m[1];
  const map: Record<string, string> = {
    AOI: 'AOI',
    BIO: 'Bioisland',
    BS: 'Bioisland',
    DHC: 'DHC',
    HC: 'Healthy Care',
    HTP: 'Hatashi',
    INC: 'Inocare',
    KL: 'Khaolaor',
    MH: 'Manhae',
    NDD: 'NDD',
    NEU: 'Neubria',
    NOW: 'NOW',
    NTC: 'NeuroBoost',
    OT: 'Optibac',
    OTB: 'Optibac',
    OTV: 'Optimax',
    PRT: 'Pro Therapy',
    SPL: 'Supple',
    SS: 'Sample',
    SUA: 'Sữa',
    SW: 'Swisse',
    USL: 'Useful',
    VTR: 'Vitatree',
    BM: 'Beauty Mom',
  };
  return map[prefix] ?? prefix;
}

function mapStatus(payment: string, shipping: string): { status: string; paymentMethod: string } {
  const p = payment.trim();
  const s = shipping.trim();
  // Default
  let status = 'draft';
  let paymentMethod = 'bank_transfer';

  if (s === 'Đã xuất đủ') {
    status = 'completed';
    if (p === 'Chưa thanh toán') {
      paymentMethod = 'credit';
    } else if (p === 'Đã thanh toán') {
      paymentMethod = 'bank_transfer';
    } else if (p === 'Thanh toán một phần') {
      paymentMethod = 'credit';
    }
  } else if (s === 'Chưa xuất' || s === 'Xuất một phần') {
    status = 'confirmed';
    paymentMethod = p === 'Chưa thanh toán' ? 'credit' : 'bank_transfer';
  }
  return { status, paymentMethod };
}

// ─── Read Excel files ───────────────────────────────────────────────────

interface CatalogRow {
  sku: string;
  name: string;
  unit: string;
  origin: string;
  costPrice: number;
  retailPrice: number;
  description: string;
}

async function readCatalog(): Promise<CatalogRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CATALOG_FILE);
  const ws = wb.getWorksheet('DANH SÁCH HÀNG HÓA, DỊCH VỤ');
  if (!ws) throw new Error('Catalog sheet not found');
  const rows: CatalogRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 5) return;
    const sku = asString(row.getCell(2).value); // Col 2: Mã
    if (!sku) return;
    const status = asString(row.getCell(43).value);
    if (status && status !== 'Đang sử dụng') return;
    rows.push({
      sku,
      name: asString(row.getCell(3).value), // Col 3: Tên
      unit: asString(row.getCell(7).value) || 'hộp',
      origin: asString(row.getCell(12).value),
      costPrice: asNumber(row.getCell(27).value), // Col 27: Đơn giá mua gần nhất
      retailPrice: asNumber(row.getCell(28).value), // Col 28: Đơn giá bán 1
      description: asString(row.getCell(13).value),
    });
  });
  return rows;
}

interface OrderRow {
  orderCode: string;
  orderDate: Date | null;
  misaCustomerCode: string | null;
  customerName: string;
  saleCode: string;
  saleName: string;
  address: string;
  province: string;
  district: string;
  ward: string;
  phoneMobile: string;
  description: string;
  totalAmount: number;
  discountAmount: number;
  vat: number;
  totalPayment: number;
  paymentStatus: string;
  shippingStatus: string;
  docType: string;
  branch: string;
  createdByName: string;
  createdAt: Date | null;
}

async function readOrders(): Promise<OrderRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ORDERS_FILE);
  const ws = wb.getWorksheet('Bán hàng');
  if (!ws) throw new Error('Orders sheet not found');
  const rows: OrderRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 4) return;
    const orderCode = asString(row.getCell(4).value); // Col 4: Số chứng từ
    if (!orderCode || !orderCode.startsWith('XK')) return;
    rows.push({
      orderCode,
      orderDate: asDate(row.getCell(2).value), // Col 2: Ngày hạch toán
      misaCustomerCode: asString(row.getCell(8).value) || null, // Col 8: Mã KH
      customerName: asString(row.getCell(9).value), // Col 9: KH name
      saleCode: asString(row.getCell(10).value),
      saleName: asString(row.getCell(11).value),
      address: asString(row.getCell(12).value),
      province: asString(row.getCell(27).value),
      district: asString(row.getCell(28).value),
      ward: asString(row.getCell(29).value),
      phoneMobile: asString(row.getCell(17).value), // Col 17: ĐT di động
      description: asString(row.getCell(18).value),
      totalAmount: asNumber(row.getCell(19).value), // Col 19: Tổng tiền hàng
      discountAmount: asNumber(row.getCell(20).value), // Col 20: Tiền chiết khấu
      vat: asNumber(row.getCell(21).value),
      totalPayment: asNumber(row.getCell(22).value), // Col 22: Tổng TT
      paymentStatus: asString(row.getCell(24).value),
      shippingStatus: asString(row.getCell(25).value),
      docType: asString(row.getCell(26).value),
      branch: asString(row.getCell(47).value),
      createdByName: asString(row.getCell(40).value),
      createdAt: asDate(row.getCell(41).value),
    });
  });
  return rows;
}

interface ItemRow {
  orderCode: string;
  itemDescription: string;
  misaCustomerCode: string;
  customerName: string;
  sku: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountValue: number;
  returnQty: number;
  returnValue: number;
  costValue: number;
}

async function readItems(): Promise<ItemRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ITEMS_FILE);
  const ws = wb.getWorksheet('SỔ CHI TIẾT BÁN HÀNG');
  if (!ws) throw new Error('Items sheet not found');
  const rows: ItemRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum < 5) return;
    const orderCode = asString(row.getCell(3).value); // Col 3: Số chứng từ
    if (!orderCode || !orderCode.startsWith('XK')) return;
    const sku = asString(row.getCell(10).value); // Col 10: Mã hàng
    if (!sku) return;
    rows.push({
      orderCode,
      itemDescription: asString(row.getCell(7).value),
      misaCustomerCode: asString(row.getCell(8).value),
      customerName: asString(row.getCell(9).value),
      sku,
      productName: asString(row.getCell(11).value),
      unit: asString(row.getCell(13).value) || 'hộp',
      quantity: asNumber(row.getCell(14).value), // Col 14: SL bán
      unitPrice: asNumber(row.getCell(15).value), // Col 15: Đơn giá
      lineTotal: asNumber(row.getCell(16).value), // Col 16: Doanh số bán
      discountValue: asNumber(row.getCell(17).value),
      returnQty: asNumber(row.getCell(18).value),
      returnValue: asNumber(row.getCell(19).value),
      costValue: asNumber(row.getCell(21).value), // Col 21: Giá vốn
    });
  });
  return rows;
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`MISA full import — mode: ${DRY ? 'DRY-RUN (no DB writes)' : 'APPLY (writing to DB)'}`);
  console.log('─'.repeat(70));

  // 1. Find target organization (single org assumed)
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) throw new Error('No organization in DB');
  console.log(`Org: ${org.name} (${org.id})`);

  // 2. Read all 3 files (catalog optional via --skip-catalog)
  console.log('\nReading files...');
  const [catalogRaw, ordersRaw, itemsRaw] = await Promise.all([
    SKIP_CATALOG ? Promise.resolve([] as Awaited<ReturnType<typeof readCatalog>>) : readCatalog(),
    readOrders(),
    readItems(),
  ]);

  // Apply --only-orders scope: keep only orders/items whose orderCode is
  // in the allow-list. Items for orderCodes outside the list are dropped
  // so we don't accidentally wipe historical line items.
  const catalog = catalogRaw;
  let orders = ordersRaw;
  let items = itemsRaw;
  if (ONLY_ORDERS) {
    const before = { o: orders.length, i: items.length };
    orders = orders.filter((o) => ONLY_ORDERS.has(o.orderCode));
    items = items.filter((i) => ONLY_ORDERS.has(i.orderCode));
    console.log(`  --only-orders scope: ${ONLY_ORDERS.size} codes → kept ${orders.length}/${before.o} orders, ${items.length}/${before.i} items`);
    const missing = [...ONLY_ORDERS].filter((c) => !orders.some((o) => o.orderCode === c));
    if (missing.length) {
      console.warn(`  ⚠ Codes in --only-orders not found in file: ${missing.join(', ')}`);
    }
  }
  if (SKIP_CATALOG) {
    console.log(`  catalog: SKIPPED (--skip-catalog)`);
  } else {
    console.log(`  catalog: ${catalog.length} products`);
  }
  console.log(`  orders:  ${orders.length} headers`);
  console.log(`  items:   ${items.length} line items`);

  // 3. Pre-load existing data for diff
  const [existingProducts, existingContacts, existingOrders, existingUsers, existingBrands, existingSuppliers] = await Promise.all([
    prisma.product.findMany({ where: { orgId: org.id }, select: { id: true, sku: true, name: true } }),
    prisma.contact.findMany({
      where: { orgId: org.id },
      select: { id: true, misaCustomerCode: true, phone: true, fullName: true },
    }),
    prisma.order.findMany({ where: { orgId: org.id }, select: { id: true, orderCode: true } }),
    prisma.user.findMany({ where: { orgId: org.id }, select: { id: true, fullName: true, role: true } }),
    prisma.brand.findMany({ where: { orgId: org.id }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { orgId: org.id }, select: { id: true, name: true } }),
  ]);
  const skuMap = new Map(existingProducts.map((p) => [p.sku, p.id]));
  const contactByCode = new Map(existingContacts.filter((c) => c.misaCustomerCode).map((c) => [c.misaCustomerCode!, c.id]));
  const contactByPhone = new Map(
    existingContacts
      .filter((c) => c.phone)
      .map((c) => [phoneNorm(c.phone)!, c.id])
      .filter(([k]) => k !== null),
  );
  const orderCodeMap = new Map(existingOrders.map((o) => [o.orderCode, o.id]));
  const userByName = new Map(existingUsers.map((u) => [u.fullName.toLowerCase(), u.id]));
  const brandByName = new Map(existingBrands.map((b) => [b.name, b.id]));
  const adminUser = existingUsers.find((u) => u.role === 'owner') ?? existingUsers.find((u) => u.role === 'admin');
  if (!adminUser) throw new Error('No admin/owner user to attribute imports to');

  // 4. Group items by orderCode
  const itemsByOrder = new Map<string, ItemRow[]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderCode) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderCode, arr);
  }

  // 5. Group contacts (one per misaCustomerCode OR per phone if no code)
  const customerByKey = new Map<string, { code: string | null; name: string; phone: string; address: string; province: string; district: string; ward: string }>();
  for (const o of orders) {
    const key = o.misaCustomerCode || `noname:${o.customerName}|${o.phoneMobile}`;
    if (!customerByKey.has(key)) {
      customerByKey.set(key, {
        code: o.misaCustomerCode,
        name: o.customerName,
        phone: o.phoneMobile,
        address: o.address,
        province: o.province,
        district: o.district,
        ward: o.ward,
      });
    }
  }

  // ── Diff for DRY-RUN ─────────────────────────────────────────────
  let productsCreate = 0, productsUpdate = 0;
  for (const c of catalog) {
    if (skuMap.has(c.sku)) productsUpdate++;
    else productsCreate++;
  }

  let contactsCreate = 0, contactsUpdate = 0;
  for (const [, c] of customerByKey) {
    const code = c.code;
    const phoneKey = phoneNorm(c.phone);
    const existing = (code && contactByCode.get(code)) || (phoneKey && contactByPhone.get(phoneKey));
    if (existing) contactsUpdate++;
    else contactsCreate++;
  }

  let ordersCreate = 0, ordersUpdate = 0;
  let orderStatusBreakdown: Record<string, number> = {};
  for (const o of orders) {
    if (orderCodeMap.has(o.orderCode)) ordersUpdate++;
    else ordersCreate++;
    const { status } = mapStatus(o.paymentStatus, o.shippingStatus);
    orderStatusBreakdown[status] = (orderStatusBreakdown[status] ?? 0) + 1;
  }

  let itemsTotal = items.length;
  let unmatchedSales = 0;
  for (const o of orders) {
    if (!userByName.get(o.saleName.toLowerCase())) unmatchedSales++;
  }

  console.log('\n─── DIFF SUMMARY ─────────────────────────────────────────');
  console.log(`Products:`);
  console.log(`  CREATE: ${productsCreate}  UPDATE: ${productsUpdate}  total catalog: ${catalog.length}`);
  console.log(`Contacts (unique customers):`);
  console.log(`  CREATE: ${contactsCreate}  UPDATE: ${contactsUpdate}  total: ${customerByKey.size}`);
  console.log(`Orders:`);
  console.log(`  CREATE: ${ordersCreate}  UPDATE: ${ordersUpdate}  total: ${orders.length}`);
  console.log(`  Status breakdown:`, orderStatusBreakdown);
  console.log(`Order items:`);
  console.log(`  total: ${itemsTotal}`);
  console.log(`Sale assignment:`);
  console.log(`  matched: ${orders.length - unmatchedSales}  unmatched (→ admin): ${unmatchedSales}`);
  console.log(`  unmatched sale names:`, Array.from(new Set(
    orders.filter((o) => !userByName.get(o.saleName.toLowerCase())).map((o) => o.saleName).filter(Boolean)
  )).slice(0, 10));

  if (DRY) {
    console.log('\n💡 DRY-RUN done. Re-run with --apply to write to DB.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n─── APPLYING ────────────────────────────────────────────');

  // 5b. Ensure missing sale users exist before order import.
  // - "Hoàng Bích Huế" → create as member (per user instruction 2026-05-07)
  // - "Halo VN" / "HaloVN" → keep mapped to admin (existing behaviour)
  console.log('\n[0/4] Resolving missing sale users...');
  const NAMES_TO_CREATE = ['Hoàng Bích Huế'];
  const NAMES_TO_ADMIN = ['Halo VN', 'HaloVN', 'Halo Vn'];
  for (const fullName of NAMES_TO_CREATE) {
    const key = fullName.toLowerCase();
    if (userByName.has(key)) {
      console.log(`  • "${fullName}" already exists`);
      continue;
    }
    const slug = fullName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '');
    const email = `${slug}@halo.local`;
    // Use a 60-char bcrypt-shaped placeholder so the schema accepts it; the
    // user will reset their password the first time they log in.
    const placeholderHash = '$2b$10$placeholderplaceholderplaceholderplaceholderplaceholderpla';
    const created = await prisma.user.create({
      data: {
        orgId: org.id,
        email,
        fullName,
        passwordHash: placeholderHash,
        role: 'member',
        isActive: false, // off until admin sets a real password
      },
      select: { id: true, fullName: true },
    });
    userByName.set(created.fullName.toLowerCase(), created.id);
    console.log(`  ✓ Created user: ${created.fullName} (${email}, isActive=false — admin sets password later)`);
  }
  for (const name of NAMES_TO_ADMIN) {
    if (!userByName.has(name.toLowerCase())) {
      userByName.set(name.toLowerCase(), adminUser.id);
      console.log(`  • "${name}" → mapped to admin (${adminUser.fullName})`);
    }
  }

  // 6. UPSERT products — preserve existing prices/descriptions.
  //    Skipped entirely when --skip-catalog is passed (incremental mode).
  if (SKIP_CATALOG) {
    console.log('\n[1/4] Catalog import — SKIPPED (--skip-catalog)');
  } else {
  console.log('\n[1/4] Importing catalog (products + brands)...');
  // Pre-create brands needed
  const brandsNeeded = new Set<string>();
  for (const c of catalog) {
    const b = brandFromSku(c.sku);
    if (b) brandsNeeded.add(b);
  }
  // Single supplier for MISA imports if none exist with that name
  let misaSupplierId: string | null = null;
  const misaSupplier = await prisma.supplier.findFirst({ where: { orgId: org.id, name: 'MISA Import (chưa phân loại)' } });
  if (misaSupplier) {
    misaSupplierId = misaSupplier.id;
  } else {
    const created = await prisma.supplier.create({
      data: { orgId: org.id, name: 'MISA Import (chưa phân loại)', country: '—', active: true },
    });
    misaSupplierId = created.id;
  }
  for (const name of brandsNeeded) {
    if (!brandByName.has(name)) {
      const b = await prisma.brand.create({
        data: { orgId: org.id, name, supplierId: misaSupplierId, active: true },
      });
      brandByName.set(name, b.id);
    }
  }

  let pCreated = 0, pUpdated = 0;
  for (const c of catalog) {
    const brandName = brandFromSku(c.sku);
    const brandId = brandName ? brandByName.get(brandName) ?? null : null;
    const existingId = skuMap.get(c.sku);
    if (existingId) {
      // Update name/unit/cost only if currently empty/zero (preserve human edits)
      const existing = await prisma.product.findUnique({ where: { id: existingId }, select: { name: true, costPrice: true, brandId: true } });
      const data: any = {};
      if (!existing?.name && c.name) data.name = c.name;
      if (!existing?.costPrice && c.costPrice) data.costPrice = c.costPrice;
      if (!existing?.brandId && brandId) data.brandId = brandId;
      if (Object.keys(data).length > 0) {
        await prisma.product.update({ where: { id: existingId }, data });
        pUpdated++;
      }
    } else {
      const created = await prisma.product.create({
        data: {
          orgId: org.id,
          sku: c.sku,
          name: c.name,
          unit: c.unit,
          status: 'active',
          brandId,
          costPrice: c.costPrice || null,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        },
        select: { id: true },
      });
      // Seed 1 default price tier so order items can pick it
      if (c.retailPrice > 0) {
        await prisma.productPrice.create({
          data: {
            productId: created.id,
            tierName: 'Giá lẻ niêm yết',
            price: c.retailPrice,
            displayOrder: 1,
            isDefault: true,
            active: true,
          },
        });
      }
      skuMap.set(c.sku, created.id);
      pCreated++;
    }
    if ((pCreated + pUpdated) % 100 === 0) {
      console.log(`  ...${pCreated + pUpdated}/${catalog.length}`);
    }
  }
  console.log(`  Products: created ${pCreated}, updated ${pUpdated}`);
  } // end if (!SKIP_CATALOG)

  // 7. UPSERT contacts
  console.log('\n[2/4] Importing contacts...');
  const contactKeyToId = new Map<string, string>();
  let cCreated = 0, cUpdated = 0;
  for (const [key, info] of customerByKey) {
    let contactId: string | undefined;
    if (info.code) contactId = contactByCode.get(info.code);
    if (!contactId) {
      const phoneKey = phoneNorm(info.phone);
      if (phoneKey) contactId = contactByPhone.get(phoneKey);
    }
    const fullAddress = [info.address, info.ward, info.district].filter(Boolean).join(', ') || null;
    if (contactId) {
      // Update missing fields, preserve existing
      const c = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { fullName: true, phone: true, address: true, province: true, misaCustomerCode: true },
      });
      const data: any = {};
      if (!c?.misaCustomerCode && info.code) data.misaCustomerCode = info.code;
      if (!c?.fullName && info.name) data.fullName = info.name;
      if (!c?.phone && info.phone) data.phone = info.phone;
      if (!c?.address && fullAddress) data.address = fullAddress;
      if (!c?.province && info.province) data.province = info.province;
      if (Object.keys(data).length > 0) {
        await prisma.contact.update({ where: { id: contactId }, data });
        cUpdated++;
      }
    } else {
      const created = await prisma.contact.create({
        data: {
          orgId: org.id,
          misaCustomerCode: info.code,
          fullName: info.name || '(Chưa có tên)',
          phone: info.phone || null,
          address: fullAddress,
          province: info.province || null,
          source: 'misa_import',
          assignedUserId: adminUser.id,
        },
        select: { id: true },
      });
      contactId = created.id;
      cCreated++;
    }
    contactKeyToId.set(key, contactId!);
  }
  console.log(`  Contacts: created ${cCreated}, updated ${cUpdated}`);

  // 8. UPSERT orders + replace items
  console.log('\n[3/4] Importing orders + line items...');
  let oCreated = 0, oUpdated = 0, itemsInserted = 0;
  for (const o of orders) {
    const customerKey = o.misaCustomerCode || `noname:${o.customerName}|${o.phoneMobile}`;
    const contactId = contactKeyToId.get(customerKey);
    if (!contactId) {
      console.warn(`  ⚠ Skipping ${o.orderCode}: no contact`);
      continue;
    }
    const { status, paymentMethod } = mapStatus(o.paymentStatus, o.shippingStatus);
    const saleId = userByName.get(o.saleName.toLowerCase()) ?? adminUser.id;

    const orderData = {
      orgId: org.id,
      contactId,
      createdByUserId: adminUser.id,
      assignedSaleId: saleId,
      orderCode: o.orderCode,
      orderDate: o.orderDate,
      status,
      source: null,
      shippingMethod: null,
      paymentMethod,
      totalAmount: o.totalPayment,
      subtotalAmount: o.totalAmount,
      discountAmount: o.discountAmount,
      totalAmountValue: o.totalPayment,
      paidAmount: paymentMethod === 'credit' ? 0 : o.totalPayment,
      debtAmountValue: paymentMethod === 'credit' ? o.totalPayment : 0,
      internalNote: o.description || null,
      productSkus: Array.from(new Set((itemsByOrder.get(o.orderCode) ?? []).map((it) => it.sku))),
      // Stage timestamps inferred from status
      confirmedAt: status !== 'draft' ? o.orderDate : null,
      packedAt: ['shipping', 'completed'].includes(status) ? o.orderDate : null,
      shippedAt: ['shipping', 'completed'].includes(status) ? o.orderDate : null,
      completedAt: status === 'completed' ? o.orderDate : null,
    };

    const existingId = orderCodeMap.get(o.orderCode);
    let orderId: string;
    if (existingId) {
      await prisma.order.update({
        where: { id: existingId },
        data: orderData,
      });
      orderId = existingId;
      // Wipe existing items so re-import is clean
      await prisma.orderItem.deleteMany({ where: { orderId } });
      oUpdated++;
    } else {
      const created = await prisma.order.create({
        data: orderData,
        select: { id: true },
      });
      orderId = created.id;
      orderCodeMap.set(o.orderCode, orderId);
      oCreated++;
    }

    // Items
    const lineItems = itemsByOrder.get(o.orderCode) ?? [];
    if (lineItems.length > 0) {
      const itemsData = lineItems.map((it) => {
        const productId = skuMap.get(it.sku) ?? null;
        const lineCost = it.costValue;
        const profit = it.lineTotal - lineCost;
        return {
          orderId,
          productId,
          sku: it.sku,
          productName: it.productName || it.itemDescription,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discountValue: it.discountValue,
          lineTotal: it.lineTotal,
          costValue: it.costValue || null,
          unitCost: it.costValue && it.quantity > 0 ? it.costValue / it.quantity : null,
          lineCost: it.costValue || null,
          profit: profit || null,
          returnQty: it.returnQty,
          returnValue: it.returnValue,
        };
      });
      await prisma.orderItem.createMany({ data: itemsData });
      itemsInserted += itemsData.length;
    }

    if ((oCreated + oUpdated) % 50 === 0) {
      console.log(`  ...${oCreated + oUpdated}/${orders.length}`);
    }
  }
  console.log(`  Orders: created ${oCreated}, updated ${oUpdated}, items inserted ${itemsInserted}`);

  // 9. Sync contact.lastOrderDate
  console.log('\n[4/4] Syncing contact.lastOrderDate...');
  const contactsToSync = Array.from(new Set(Array.from(contactKeyToId.values())));
  for (const cid of contactsToSync) {
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
  console.log(`  Synced ${contactsToSync.length} contacts`);

  console.log('\n✅ Import complete.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ Import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
