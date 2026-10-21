import ExcelJS from 'exceljs';

type Ledger = {
  customer: { name: string | null; phone: string | null; store_name: string | null; code: string | null };
  opening_balance: number;
  rows: Array<{ date: Date | string; code: string; description: string; method?: string; debit: number; credit: number; balance: number }>;
  totals: { debit: number; credit: number; closing: number };
};
type OutstandingOrder = {
  date: Date; code: string; total: number; paid: number; debt: number;
};
const methods: Record<string, string> = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', cod: 'COD', other: 'Khác' };
const moneyFormat = '#,##0;[Red](#,##0);"-"';

// Excel dates have no timezone: save the Vietnam calendar day as UTC midnight.
function vnDay(date: Date | string): Date {
  const key = new Date(new Date(date).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${key}T00:00:00Z`);
}

export async function buildDebtExport(ledger: Ledger, orders: OutstandingOrder[], now = new Date(), scoped = false) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HaloVN';
  workbook.created = now;
  const stamp = vnDay(now).toISOString().slice(0, 10);
  const sheet = workbook.addWorksheet('Sổ chi tiết');
  const outstanding = workbook.addWorksheet('Đơn còn nợ');
  for (const s of [sheet, outstanding]) {
    s.columns = [16, 27, 46, 20, 20, 20].map((width) => ({ width }));
    s.views = [{ state: 'frozen', ySplit: 8, showGridLines: false }];
    s.mergeCells('A2:F2');
    s.getCell('A2').value = 'SỔ CÔNG NỢ KHÁCH HÀNG';
    s.mergeCells('A3:F3');
    s.getCell('A3').value = ledger.customer.name || ledger.customer.store_name || 'Khách hàng';
    s.mergeCells('A4:F4');
    s.getCell('A4').value = `SĐT: ${ledger.customer.phone || '—'} · Mã KH: ${ledger.customer.code || '—'} · Ngày xuất: ${stamp.split('-').reverse().join('/')} · VND`;
    s.mergeCells('A5:F5');
    s.getCell('A5').value = scoped ? 'Phạm vi: các đơn bạn phụ trách hoặc tạo' : (ledger.customer.store_name || '');
    s.mergeCells('A6:E6');
    s.getCell('A6').value = 'Công nợ còn phải thu';
    s.getCell('F6').value = ledger.totals.closing;
    s.getCell('F6').numFmt = moneyFormat;
    s.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:8' };
  }
  sheet.getRow(8).values = ['Ngày', 'Chứng từ', 'Diễn giải', 'Nợ (bán)', 'Có (thu)', 'Số dư'];
  sheet.addRow([null, null, 'Số dư đầu kỳ', null, null, ledger.opening_balance]);
  for (const r of ledger.rows) {
    sheet.addRow([vnDay(r.date), r.code, r.description + (r.method ? ` (${methods[r.method] || r.method})` : ''), r.debit, r.credit, r.balance]);
  }
  const total = sheet.addRow(['Cộng phát sinh', null, null, ledger.totals.debit, ledger.totals.credit, ledger.totals.closing]);
  outstanding.getRow(8).values = ['Ngày đơn', 'Mã đơn', 'Diễn giải', 'Tổng đơn', 'Đã thu', 'Còn nợ'];
  orders.sort((a, b) => a.date.getTime() - b.date.getTime() || a.code.localeCompare(b.code));
  for (const o of orders) outstanding.addRow([vnDay(o.date), o.code, 'Đơn còn nợ', o.total, o.paid, o.debt]);
  if (!orders.length) outstanding.addRow([null, null, 'Không có đơn còn nợ']);
  const sums = orders.reduce((acc, o) => ({ total: acc.total + o.total, paid: acc.paid + o.paid, debt: acc.debt + o.debt }), { total: 0, paid: 0, debt: 0 });
  const orderTotal = outstanding.addRow(['Tổng cộng', null, null, sums.total, sums.paid, sums.debt]);
  for (const [s, end] of [[sheet, total.number], [outstanding, orderTotal.number]] as const) {
    s.eachRow((row) => {
      row.height = 24;
      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, color: { argb: 'FF173658' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      if (row.number >= 9) {
        row.height = 32;
        row.getCell(1).numFmt = 'dd/mm/yyyy';
        for (let col = 4; col <= 6; col++) {
          row.getCell(col).numFmt = moneyFormat;
          row.getCell(col).alignment = { vertical: 'middle', horizontal: 'right' };
        }
      }
    });
    s.getCell('A2').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF173658' } };
    s.getRow(8).height = 30;
    s.getRow(8).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173658' } };
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    for (const index of [6, end]) s.getRow(index).eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } };
      cell.font = { ...cell.font, bold: true };
    });
    s.autoFilter = { from: 'A8', to: `F${end - 1}` };
    s.pageSetup.printArea = `A1:F${end}`;
  }
  const safeName = (ledger.customer.name || ledger.customer.code || 'khach-hang')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'khach-hang';
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), filename: `Cong-no-${safeName}-${stamp}.xlsx` };
}
