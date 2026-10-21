import assert from 'node:assert/strict';
import Fastify from 'fastify';
import ExcelJS from 'exceljs';
const contact = { id: 'customer-test', orgId: 'org-test', fullName: 'Khách hàng kiểm thử', phone: '0900000000', storeName: 'BM CARE', misaCustomerCode: 'KH-001', creditTermDays: 30 };
const allOrders = [
  { id: 'opening', orderCode: 'NDK-001', debtAmountValue: 0, paidAmount: 2000, totalAmountValue: 2000, status: 'completed', assignedSaleId: 'someone-else', createdByUserId: 'someone-else' },
  { id: 'order-1', orderCode: 'DH-001', debtAmountValue: 7000, paidAmount: 3000, totalAmountValue: 10000, status: 'completed', assignedSaleId: 'member-test', createdByUserId: 'owner-test' },
  { id: 'order-2', orderCode: 'DH-002', debtAmountValue: 5000, paidAmount: 3000, totalAmountValue: 8000, status: 'completed', assignedSaleId: 'someone-else', createdByUserId: 'someone-else' },
  { id: 'cancelled', orderCode: 'CANCELLED', debtAmountValue: 999999, status: 'cancelled', assignedSaleId: 'member-test', createdByUserId: 'member-test' },
].map((o) => ({ ...o, orgId: contact.orgId, contactId: contact.id, createdAt: new Date('2026-10-01T00:00:00Z'), orderDate: new Date('2026-10-01T00:00:00Z'), debtDueDate: null, contact }));
const pays = [{ id: 'payment-1', amount: 8000, paymentDate: new Date('2026-10-02T00:00:00Z'), paymentMethod: 'bank_transfer', reference: '=HYPERLINK("http://invalid")', allocations: [{ orderId: 'opening', applied: 2000 }, { orderId: 'order-1', applied: 3000 }, { orderId: 'order-2', applied: 3000 }] }];
(globalThis as any).prisma = {
  contact: { findFirst: async ({ where }: any) => where.orgId === contact.orgId && where.id === contact.id ? contact : null, findMany: async () => [contact] },
  order: { findMany: async ({ where }: any) => {
    assert.equal(where.orgId, 'org-test');
    assert.deepEqual(where.status.notIn, ['cancelled', 'returned']);
    return allOrders.filter((o) => !where.status.notIn.includes(o.status) && (!where.contactId || o.contactId === where.contactId) && (!where.debtAmountValue || o.debtAmountValue > 0) && (!where.OR || where.OR.some((clause: any) => Object.entries(clause).every(([key, value]) => (o as any)[key] === value))));
  } },
  customerPayment: { findMany: async ({ where }: any) => { assert.equal(where.orgId, 'org-test'); assert.equal(where.reversedAt, null); return pays; } },
};
const { debtRoutes } = await import('../src/modules/sale-app/debt-routes.js');
const app = Fastify();
app.decorateRequest('jwtVerify', async function(this: any) {
  const token = this.headers.authorization?.replace('Bearer ', '');
  if (!['owner', 'admin', 'member', 'other-org'].includes(token)) throw new Error('Unauthorized');
  this.user = { id: token === 'member' ? 'member-test' : 'owner-test', orgId: token === 'other-org' ? 'other-org' : 'org-test', role: token === 'member' ? 'member' : token === 'admin' ? 'admin' : 'owner' };
});
await app.register(debtRoutes);
const url = '/api/v1/sale-app/debt/customers/customer-test/ledger';
const get = (path: string, role = 'owner') => app.inject({ method: 'GET', url: path, headers: { authorization: `Bearer ${role}` } });
assert.equal((await app.inject({ method: 'GET', url: url + '?format=xlsx' })).statusCode, 401);
assert.equal((await get(url + '?format=xlsx', 'other-org')).statusCode, 404);
for (const role of ['owner', 'admin', 'member']) {
  const json = (await get(url, role)).json();
  const res = await get(url + '?format=xlsx', role);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.match(String(res.headers['content-type']), /spreadsheetml/);
  assert.match(String(res.headers['content-disposition']), /Cong-no-Khach-hang-kiem-thu-.*\.xlsx/);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(res.rawPayload as any);
  assert.equal(book.worksheets.length, 2);
  const ledger = book.worksheets[0], orders = book.worksheets[1];
  assert.equal(ledger.getCell('F6').value, json.totals.closing);
  assert.equal(ledger.getCell(`F${ledger.rowCount}`).value, role === 'member' ? 7000 : 12000);
  assert.equal(orders.getCell(`F${orders.rowCount}`).value, role === 'member' ? 7000 : 12000);
  assert.equal(orders.rowCount, role === 'member' ? 10 : 11);
  assert.equal(ledger.getCell('B' + (ledger.rowCount - 1)).type, ExcelJS.ValueType.String);
  assert.equal(ledger.getCell('D10').type, ExcelJS.ValueType.Number);
  assert.equal(ledger.getCell('A10').type, ExcelJS.ValueType.Date);
  if (role === 'member') assert.match(String(ledger.getCell('A5').value), /Phạm vi/);
}
const { buildDebtExport } = await import('../src/modules/sale-app/debt-export.js');
const empty = { customer: { name: '=formula / tên', phone: null, store_name: null, code: null }, opening_balance: 0, rows: [], totals: { debit: 0, credit: 0, closing: 0 } };
const file = await buildDebtExport(empty, [], new Date('2026-10-21T18:00:00Z'));
assert.match(file.filename, /2026-10-22\.xlsx$/);
const book = new ExcelJS.Workbook(); await book.xlsx.load(file.buffer as any);
assert.equal(book.worksheets[0].getCell('F6').value, 0);
assert.equal(book.worksheets[0].getCell('A3').type, ExcelJS.ValueType.String);
assert.equal(book.worksheets[1].getCell('C9').value, 'Không có đơn còn nợ');
console.log('PASS: XLSX download, auth, org/member scope, reconciled totals, numeric/date cells, formula-like strings, empty customer, VN date rollover.');
await app.close();
