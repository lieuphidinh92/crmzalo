import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateVatFromGross } from './amis-vat-service.js';

test('tách giá đã gồm VAT nhưng luôn giữ nguyên tổng tiền bán lẻ', () => {
  assert.deepEqual(calculateVatFromGross(4_830_000, 8), { net: 4_472_222, vat: 357_778 });
  assert.deepEqual(calculateVatFromGross(105_000, 5), { net: 100_000, vat: 5_000 });
  assert.deepEqual(calculateVatFromGross(110_000, 10), { net: 100_000, vat: 10_000 });
  assert.deepEqual(calculateVatFromGross(99_999, 0), { net: 99_999, vat: 0 });
});

test('chặn thuế suất ngoài danh sách được duyệt', () => {
  assert.throws(() => calculateVatFromGross(100_000, 7), /0%, 5%, 8% hoặc 10%/);
});
