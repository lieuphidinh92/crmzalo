import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { toNumber } from './order-service.js';
import {
  getAllAmisAccountingDictionary,
  saveAmisAccountingDictionary,
  saveAmisAccountingVouchers,
} from './amis-accounting-client.js';

type Row = Record<string, any>;
type TaxLineInput = { itemId: string; vatRate: number };

export type AmisVatPreflight = {
  status: 'ready' | 'missing_catalogs' | 'blocked';
  canExport: boolean;
  orderCode: string;
  orderTotal: number;
  pendingExport: boolean;
  customer: { matched: boolean; code: string; name: string; taxCode: string; willCreate: boolean };
  products: Array<{
    sku: string; crmName: string; misaName: string; unitName: string;
    matched: boolean; willCreate: boolean; usesMisaName: boolean;
  }>;
  lines: Array<{
    itemId: string; sku: string; name: string; unitName: string;
    quantity: number; grossAmount: number; defaultVatRate: number;
  }>;
  missing: { customer: boolean; productSkus: string[] };
  warnings: string[];
  errors: string[];
};

type BuiltPreflight = {
  result: AmisVatPreflight;
  order: Row;
  branchId: string;
  matchedCustomer?: Row;
  matchedProducts: Map<string, Row>;
  customerPayload?: Row;
  productPayloads: Row[];
};

function yes(value: unknown): boolean {
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/đ/g, 'd')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function normalizedCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normalizedTaxCode(value: unknown): string {
  return normalizedCode(value).replace(/[^A-Z0-9]/g, '');
}

function stableGuid(key: string): string {
  const hex = createHash('sha256').update(`halovn-amis:${key}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function parseMainUnit(product: Row): { id: string; name: string } {
  try {
    const units = typeof product.unit_list === 'string' ? JSON.parse(product.unit_list) : product.unit_list;
    const main = Array.isArray(units) ? units[0] : null;
    return { id: String(main?.unit_id || ''), name: String(main?.unit_name || '') };
  } catch {
    return { id: '', name: '' };
  }
}

function orderTotal(order: { totalAmountValue: unknown; totalAmount: unknown }): number {
  const current = toNumber(order.totalAmountValue);
  return Math.round(current > 0 ? current : toNumber(order.totalAmount));
}

function ymd(value: Date | string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function buildPreflight(orderId: string, scope: Prisma.OrderWhereInput): Promise<BuiltPreflight> {
  const order = await prisma.order.findFirst({
    where: { AND: [scope, { id: orderId }] },
    select: {
      id: true, orgId: true, orderCode: true, orderDate: true, vatInvoiceStatus: true,
      vatIssuedAmount: true, totalAmount: true, totalAmountValue: true,
      subtotalAmount: true, discountAmount: true, shippingFee: true,
      invoiceBuyerType: true, invoiceBuyerName: true, invoiceTaxCode: true,
      invoiceAddress: true, invoiceEmail: true,
      amisVatExports: { where: { status: { in: ['submitting', 'pending'] } }, select: { id: true }, take: 1 },
      items: {
        select: {
          id: true, productId: true, sku: true, productName: true, unit: true,
          quantity: true, unitPrice: true, lineTotal: true,
          product: { select: { id: true, sku: true, name: true, unit: true } },
        },
      },
    },
  });
  if (!order) throw Object.assign(new Error('Không tìm thấy đơn hàng.'), { statusCode: 404, code: 'ORDER_NOT_FOUND' });
  if (!['requested', 'partial'].includes(order.vatInvoiceStatus)) {
    throw Object.assign(new Error('Đơn không nằm trong hàng chờ xuất VAT.'), { statusCode: 409, code: 'VAT_ORDER_NOT_PENDING' });
  }

  const [customerRows, productRows, unitRows, branchRows] = await Promise.all([
    getAllAmisAccountingDictionary(1) as Promise<Row[]>,
    getAllAmisAccountingDictionary(2) as Promise<Row[]>,
    getAllAmisAccountingDictionary(4) as Promise<Row[]>,
    getAllAmisAccountingDictionary(6) as Promise<Row[]>,
  ]);
  const customers = customerRows.filter((row) => yes(row.is_customer) && !yes(row.inactive) && !yes(row.is_group));
  const products = productRows.filter((row) => !yes(row.inactive) && !yes(row.is_group));
  const units = unitRows.filter((row) => !yes(row.inactive) && row.unit_name);
  const branchIds = [...new Set(branchRows.map((row) => String(row.branch_id || '')).filter(Boolean))];
  const branchId = branchIds[0] || '';

  const errors: string[] = [];
  const warnings: string[] = [];
  const buyerName = String(order.invoiceBuyerName || '').trim();
  const taxCode = String(order.invoiceTaxCode || '').trim();
  const address = String(order.invoiceAddress || '').trim();
  const total = orderTotal(order);
  const lineTotal = Math.round(order.items.reduce((sum: number, item: Row) => sum + toNumber(item.lineTotal), 0));
  if (!buyerName) errors.push('Thiếu tên pháp nhân/người mua trên yêu cầu VAT.');
  if (!address) errors.push('Thiếu địa chỉ xuất hóa đơn.');
  if (!branchId) errors.push('Actapp chưa trả về chi nhánh để tạo danh mục.');
  if (branchIds.length > 1) errors.push('Actapp trả nhiều chi nhánh; cần chọn chi nhánh xuất hóa đơn trước.');
  if ((order.vatIssuedAmount || 0) > 0) errors.push('Luồng Actapp chỉ xuất trọn đơn; đơn này đã có hóa đơn xuất một phần.');
  if (lineTotal !== total) {
    errors.push(`Tổng dòng hàng ${lineTotal.toLocaleString('vi-VN')}đ không bằng tiền bán lẻ ${total.toLocaleString('vi-VN')}đ. Không được gửi sang Actapp.`);
  }
  if (order.amisVatExports.length) errors.push('Đơn đang chờ Actapp xử lý; không được gửi lặp.');

  const taxMatches = normalizedTaxCode(taxCode)
    ? customers.filter((row) => normalizedTaxCode(row.company_tax_code) === normalizedTaxCode(taxCode)) : [];
  const nameMatches = customers.filter((row) => normalizedText(row.account_object_name) === normalizedText(buyerName));
  let matchedCustomer: Row | undefined;
  if (taxMatches.length === 1) matchedCustomer = taxMatches[0];
  else if (taxMatches.length > 1) {
    const exact = taxMatches.filter((row) => normalizedText(row.account_object_name) === normalizedText(buyerName));
    if (exact.length === 1) matchedCustomer = exact[0];
    else errors.push(`Actapp có ${taxMatches.length} khách cùng MST; cần làm sạch danh mục trước khi xuất.`);
  } else if (!taxCode && nameMatches.length === 1) matchedCustomer = nameMatches[0];
  else if (!taxCode && nameMatches.length > 1) errors.push('Actapp có nhiều khách trùng tên; cần bổ sung MST/CCCD.');

  const newCustomerCode = normalizedCode(taxCode) || `VAT_${normalizedCode(order.orderCode)}`.slice(0, 50);
  if (!matchedCustomer && customers.some((row) => normalizedCode(row.account_object_code) === newCustomerCode)) {
    errors.push(`Mã khách ${newCustomerCode} đã thuộc một đối tượng khác trên Actapp.`);
  }
  const customerPayload = !matchedCustomer && buyerName && address && branchId ? {
    dictionary_type: 1,
    account_object_id: stableGuid(`customer:${normalizedTaxCode(taxCode) || normalizedText(buyerName)}`),
    account_object_code: newCustomerCode, account_object_name: buyerName,
    account_object_type: order.invoiceBuyerType === 'ca_nhan' ? 1 : 0,
    is_vendor: false, is_customer: true, is_employee: false, inactive: false,
    address, email_address: order.invoiceEmail || '', country: 'Việt Nam',
    company_tax_code: taxCode, branch_id: branchId, state: 1,
  } : undefined;

  const productBySku = new Map<string, Row>();
  const duplicateProductSkus = new Set<string>();
  for (const product of products) {
    const sku = normalizedCode(product.inventory_item_code);
    if (productBySku.has(sku)) duplicateProductSkus.add(sku); else productBySku.set(sku, product);
  }
  const unitByName = new Map(units.map((row) => [normalizedText(row.unit_name), row]));
  const productPayloads: Row[] = [];
  const productResults: AmisVatPreflight['products'] = [];
  const matchedProducts = new Map<string, Row>();
  const seenSkus = new Set<string>();
  for (const item of order.items) {
    const sku = normalizedCode(item.product?.sku || item.sku);
    if (!sku || seenSkus.has(sku)) continue;
    seenSkus.add(sku);
    const crmName = String(item.product?.name || item.productName || '').trim();
    const crmUnit = String(item.product?.unit || item.unit || '').trim();
    if (duplicateProductSkus.has(sku)) {
      errors.push(`Actapp có nhiều hàng hóa cùng mã ${sku}.`);
      continue;
    }
    const misaProduct = productBySku.get(sku);
    if (misaProduct) {
      matchedProducts.set(sku, misaProduct);
      const misaUnit = parseMainUnit(misaProduct);
      const usesMisaName = normalizedText(crmName) !== normalizedText(misaProduct.inventory_item_name);
      if (usesMisaName) warnings.push(`${sku}: khi xuất sẽ dùng tên trên Actapp.`);
      productResults.push({ sku, crmName, misaName: String(misaProduct.inventory_item_name || ''),
        unitName: misaUnit.name || crmUnit, matched: true, willCreate: false, usesMisaName });
      continue;
    }
    const unit = unitByName.get(normalizedText(crmUnit));
    if (!unit) errors.push(`${sku}: đơn vị “${crmUnit || 'trống'}” chưa có trên Actapp.`);
    else productPayloads.push({
      dictionary_type: 3, inventory_item_id: stableGuid(`product:${item.productId || sku}`),
      inventory_item_code: sku, inventory_item_name: crmName, inventory_item_type: 0,
      description: crmName, branch_id: branchId, inactive: false,
      unit_id: unit.unit_id, unit_name: unit.unit_name, state: 1,
    });
    productResults.push({ sku, crmName, misaName: '', unitName: crmUnit,
      matched: false, willCreate: Boolean(unit), usesMisaName: false });
  }
  if (!productResults.length) errors.push('Đơn hàng không có dòng sản phẩm để xuất hóa đơn.');

  const lines = order.items.map((item: Row) => {
    const sku = normalizedCode(item.product?.sku || item.sku);
    const misa = productBySku.get(sku);
    const mainUnit = misa ? parseMainUnit(misa) : { id: '', name: '' };
    return {
      itemId: item.id, sku,
      name: String(misa?.inventory_item_name || item.product?.name || item.productName || ''),
      unitName: mainUnit.name || String(item.product?.unit || item.unit || ''),
      quantity: toNumber(item.quantity), grossAmount: Math.round(toNumber(item.lineTotal)), defaultVatRate: 8,
    };
  });
  const missingCustomer = !matchedCustomer;
  const missingProductSkus = productResults.filter((row) => !row.matched).map((row) => row.sku);
  const status = errors.length ? 'blocked' : missingCustomer || missingProductSkus.length ? 'missing_catalogs' : 'ready';
  return {
    result: {
      status, canExport: status === 'ready', orderCode: order.orderCode, orderTotal: total,
      pendingExport: Boolean(order.amisVatExports.length),
      customer: { matched: Boolean(matchedCustomer), code: String(matchedCustomer?.account_object_code || newCustomerCode),
        name: String(matchedCustomer?.account_object_name || buyerName), taxCode, willCreate: Boolean(customerPayload) },
      products: productResults, lines, missing: { customer: missingCustomer, productSkus: missingProductSkus }, warnings, errors,
    },
    order, branchId, matchedCustomer, matchedProducts, customerPayload, productPayloads,
  };
}

export async function getAmisVatPreflight(orderId: string, scope: Prisma.OrderWhereInput): Promise<AmisVatPreflight> {
  return (await buildPreflight(orderId, scope)).result;
}

export async function createMissingAmisVatCatalogs(
  orderId: string, scope: Prisma.OrderWhereInput,
): Promise<{ queued: true; customerCount: number; productCount: number }> {
  const built = await buildPreflight(orderId, scope);
  if (built.result.status === 'blocked') throw Object.assign(new Error(built.result.errors.join(' ')), { statusCode: 409, code: 'AMISKT_PREFLIGHT_BLOCKED' });
  if (built.result.status === 'ready') throw Object.assign(new Error('Danh mục đã khớp đầy đủ, không có mã mới cần tạo.'), { statusCode: 409, code: 'AMISKT_CATALOG_ALREADY_READY' });
  if (built.customerPayload) await saveAmisAccountingDictionary([built.customerPayload]);
  if (built.productPayloads.length) await saveAmisAccountingDictionary(built.productPayloads);
  return { queued: true, customerCount: built.customerPayload ? 1 : 0, productCount: built.productPayloads.length };
}

export function calculateVatFromGross(gross: number, vatRate: number): { net: number; vat: number } {
  if (![0, 5, 8, 10].includes(vatRate)) throw Object.assign(new Error('Thuế suất chỉ nhận 0%, 5%, 8% hoặc 10%.'), { statusCode: 400, code: 'INVALID_VAT_RATE' });
  const net = Math.round(gross * 100 / (100 + vatRate));
  return { net, vat: gross - net };
}

export async function submitAmisVatExport(
  orderId: string, scope: Prisma.OrderWhereInput, requestedById: string, taxLines: TaxLineInput[],
): Promise<{ queued: true; attemptId: string; orgRefId: string }> {
  const built = await buildPreflight(orderId, scope);
  if (built.result.status !== 'ready' || !built.matchedCustomer) {
    throw Object.assign(new Error(built.result.errors.join(' ') || 'Danh mục Actapp chưa khớp đầy đủ.'), { statusCode: 409, code: 'AMISKT_PREFLIGHT_NOT_READY' });
  }
  const rates = new Map(taxLines.map((line) => [line.itemId, Number(line.vatRate)]));
  if (rates.size !== built.order.items.length || built.order.items.some((item: Row) => !rates.has(item.id))) {
    throw Object.assign(new Error('Phải chọn thuế suất cho tất cả dòng hàng.'), { statusCode: 400, code: 'AMISKT_MISSING_TAX_RATE' });
  }
  const orgRefId = randomUUID();
  const detail = built.order.items.map((item: Row, index: number) => {
    const sku = normalizedCode(item.product?.sku || item.sku);
    const product = built.matchedProducts.get(sku);
    if (!product) throw Object.assign(new Error(`${sku}: chưa khớp hàng hóa Actapp.`), { statusCode: 409, code: 'AMISKT_PRODUCT_NOT_READY' });
    const gross = Math.round(toNumber(item.lineTotal));
    const vatRate = rates.get(item.id)!;
    const { net, vat } = calculateVatFromGross(gross, vatRate);
    const quantity = toNumber(item.quantity);
    const unit = parseMainUnit(product);
    return {
      org_refid: stableGuid(`voucher-line:${orgRefId}:${item.id}`), sort_order: index + 1,
      inventory_item_id: product.inventory_item_id, inventory_item_code: product.inventory_item_code,
      inventory_item_name: product.inventory_item_name, inventory_item_type: product.inventory_item_type ?? 0,
      description: product.inventory_item_name, unit_id: unit.id, unit_name: unit.name,
      quantity, main_quantity: quantity, unit_price: quantity ? net / quantity : 0,
      unit_price_after_tax: quantity ? gross / quantity : 0,
      amount: net, amount_oc: net, amount_after_tax: gross,
      tax_type: vatRate, vat_rate: vatRate, vat_amount: vat, vat_amount_oc: vat,
      debit_account: '131', credit_account: '5111', vat_account: '33311',
      main_convert_rate: 1, main_unit_id: unit.id, main_unit_name: unit.name,
    };
  });
  const grossTotal = detail.reduce((sum: number, row: Row) => sum + row.amount_after_tax, 0);
  if (grossTotal !== built.result.orderTotal) {
    throw Object.assign(new Error('Số tiền sau VAT không bằng tiền bán lẻ của đơn. Đã chặn gửi sang Actapp.'), { statusCode: 409, code: 'AMISKT_TOTAL_MISMATCH' });
  }
  const refDate = ymd(built.order.orderDate);
  const voucher = {
    voucher_type: 11, org_refid: orgRefId, org_refno: built.order.orderCode,
    branch_id: built.branchId, refdate: refDate, posted_date: refDate, inv_date: refDate,
    reftype: 3560, currency_id: 'VND', exchange_rate: 1,
    account_object_id: built.matchedCustomer.account_object_id,
    account_object_code: built.matchedCustomer.account_object_code,
    account_object_name: built.matchedCustomer.account_object_name,
    account_object_address: built.order.invoiceAddress || '',
    company_tax_code: built.order.invoiceTaxCode || '',
    journal_memo: `Bán hàng theo đơn ${built.order.orderCode}`,
    total_amount: detail.reduce((sum: number, row: Row) => sum + row.amount, 0),
    total_vat_amount: detail.reduce((sum: number, row: Row) => sum + row.vat_amount, 0),
    total_amount_after_tax: grossTotal, detail,
  };
  const payloadHash = createHash('sha256').update(JSON.stringify(voucher)).digest('hex');
  const attempt = await prisma.amisVatExportAttempt.create({
    data: {
      orgId: built.order.orgId, orderId: built.order.id, orgRefId, orgRefNo: built.order.orderCode,
      expectedAmount: grossTotal, payloadHash,
      expectedSnapshot: { orderTotal: built.result.orderTotal, customerCode: built.result.customer.code,
        lines: detail.map((row: Row) => ({ sku: row.inventory_item_code, gross: row.amount_after_tax, vatRate: row.vat_rate })) },
      requestedById,
    },
  });
  try {
    await saveAmisAccountingVouchers([voucher]);
    // Callback có thể đến trước khi HTTP /save trả về. Chỉ đổi submitting →
    // pending để không ghi đè succeeded/failed mà callback vừa chốt.
    await prisma.amisVatExportAttempt.updateMany({
      where: { id: attempt.id, status: 'submitting' }, data: { status: 'pending' },
    });
  } catch (err: any) {
    await prisma.amisVatExportAttempt.update({ where: { id: attempt.id }, data: { status: 'failed', errorMessage: String(err?.message || err).slice(0, 1000), completedAt: new Date() } });
    throw err;
  }
  return { queued: true, attemptId: attempt.id, orgRefId };
}
