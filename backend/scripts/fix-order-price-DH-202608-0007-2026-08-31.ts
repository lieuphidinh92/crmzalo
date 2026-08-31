import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const ORDER_CODE = 'DH-202608-0007';
const SKU = 'SM_01';
const OLD_UNIT_PRICE = 2_950_000;
const NEW_UNIT_PRICE = 295_000;
const APPLY = process.env.DRY_RUN === '0';

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`Giá trị tiền không hợp lệ: ${String(value)}`);
  return Math.round(parsed);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thiếu DATABASE_URL');

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `SELECT id, order_code, status, total_amount, subtotal_amount,
              discount_type, discount_value, discount_amount, shipping_fee,
              total_amount_value, paid_amount, debt_amount_value,
              vat_invoice_status, vat_issued_amount, updated_at
         FROM orders
        WHERE order_code = $1
        FOR UPDATE`,
      [ORDER_CODE],
    );
    if (orderResult.rowCount !== 1) {
      throw new Error(`Cần đúng 1 đơn ${ORDER_CODE}, thực tế ${orderResult.rowCount}`);
    }
    const order = orderResult.rows[0];

    const itemsResult = await client.query(
      `SELECT id, order_id, sku, product_name, quantity, unit_price,
              discount_value, line_total, unit_cost, line_cost, profit,
              cost_value, return_qty, return_value
         FROM order_items
        WHERE order_id = $1
        ORDER BY created_at
        FOR UPDATE`,
      [order.id],
    );
    if (itemsResult.rowCount !== 1 || itemsResult.rows[0].sku !== SKU) {
      throw new Error(`Đơn không còn đúng 1 dòng ${SKU}; dừng để tránh sửa nhầm`);
    }
    const item = itemsResult.rows[0];

    const alreadyCorrect =
      money(item.unit_price) === NEW_UNIT_PRICE &&
      money(item.line_total) === 2_950_000 &&
      money(order.total_amount_value) === 2_950_000 &&
      money(order.debt_amount_value) === 2_950_000;
    if (alreadyCorrect) {
      console.log(`${ORDER_CODE} đã đúng 295.000đ/hộp; không ghi lại.`);
      await client.query('ROLLBACK');
      return;
    }

    if (money(item.unit_price) !== OLD_UNIT_PRICE || money(item.line_total) !== 29_500_000) {
      throw new Error('Giá hiện tại đã khác ảnh xác nhận; dừng để kiểm tra lại');
    }
    if (Number(item.quantity) !== 10 || Number(item.return_qty) !== 0) {
      throw new Error('Số lượng/hoàn hàng đã thay đổi; dừng để kiểm tra lại');
    }

    const [vatResult, paymentResult] = await Promise.all([
      client.query('SELECT id, invoice_number, amount FROM vat_invoices WHERE order_id = $1', [order.id]),
      client.query(
        `SELECT id, amount, payment_date
           FROM customer_payments
          WHERE reversed_at IS NULL
            AND allocations::text LIKE $1`,
        [`%${order.id}%`],
      ),
    ]);
    if (vatResult.rowCount || paymentResult.rowCount || money(order.paid_amount) !== 0) {
      throw new Error('Đơn đã phát sinh hoá đơn/phiếu thu; dừng để không làm lệch sổ');
    }

    const quantity = Number(item.quantity);
    const itemDiscount = money(item.discount_value);
    const newLineTotal = Math.round(quantity * NEW_UNIT_PRICE - itemDiscount);
    const lineCost = item.line_cost == null ? null : money(item.line_cost);
    const newProfit = lineCost == null ? null : newLineTotal - lineCost;

    const subtotal = newLineTotal;
    const discountValue = money(order.discount_value);
    let discountAmount = 0;
    if (order.discount_type === 'percent') {
      discountAmount = Math.round((subtotal * discountValue) / 100);
    } else if (order.discount_type === 'fixed') {
      discountAmount = Math.min(subtotal, discountValue);
    }
    const total = subtotal - discountAmount + money(order.shipping_fee);
    const debt = Math.max(0, total - money(order.paid_amount));

    const summary = {
      orderCode: ORDER_CODE,
      item: {
        sku: SKU,
        quantity,
        unitPrice: { before: money(item.unit_price), after: NEW_UNIT_PRICE },
        lineTotal: { before: money(item.line_total), after: newLineTotal },
        profit: { before: money(item.profit), after: newProfit },
      },
      order: {
        total: { before: money(order.total_amount_value), after: total },
        debt: { before: money(order.debt_amount_value), after: debt },
      },
    };
    console.log(JSON.stringify(summary, null, 2));

    if (!APPLY) {
      console.log('DRY-RUN: chưa ghi production. Chạy lại với DRY_RUN=0 để áp dụng.');
      await client.query('ROLLBACK');
      return;
    }

    const backupPath = path.resolve(
      process.cwd(),
      'scripts/backups/fix-order-price-DH-202608-0007-before-2026-08-31.json',
    );
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(
        backupPath,
        `${JSON.stringify({ createdAt: new Date().toISOString(), order, items: itemsResult.rows }, null, 2)}\n`,
        { flag: 'wx' },
      );
      console.log(`Đã backup: ${backupPath}`);
    } else {
      console.log(`Backup đã tồn tại, giữ nguyên: ${backupPath}`);
    }

    await client.query(
      `UPDATE order_items
          SET unit_price = $1,
              line_total = $2,
              profit = $3
        WHERE id = $4`,
      [NEW_UNIT_PRICE, newLineTotal, newProfit, item.id],
    );
    await client.query(
      `UPDATE orders
          SET subtotal_amount = $1,
              discount_amount = $2,
              total_amount_value = $3,
              total_amount = $4,
              debt_amount_value = $5,
              updated_at = NOW()
        WHERE id = $6`,
      [subtotal, discountAmount, total, total, debt, order.id],
    );

    await client.query('COMMIT');
    console.log(`ĐÃ ÁP DỤNG ${ORDER_CODE}: đơn giá ${NEW_UNIT_PRICE}đ, tổng ${total}đ, nợ ${debt}đ.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
