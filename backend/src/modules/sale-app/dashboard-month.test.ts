import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardMonthRange } from './dashboard-month.js';

test('Vietnam month includes local midnight and excludes next month', () => {
  const range = dashboardMonthRange('2026-09');
  assert.equal(range.start.toISOString(), '2026-08-31T17:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-09-30T17:00:00.000Z');
});
test('default month rolls over at midnight Vietnam even on a UTC server', () => {
  assert.equal(dashboardMonthRange(undefined, new Date('2026-09-30T16:59:59Z')).month, '2026-09');
  assert.equal(dashboardMonthRange(undefined, new Date('2026-09-30T17:00:00Z')).month, '2026-10');
});
test('December and leap February boundaries', () => {
  assert.equal(dashboardMonthRange('2025-12').end.toISOString(), '2025-12-31T17:00:00.000Z');
  const range = dashboardMonthRange('2024-02');
  assert.equal((range.end.getTime() - range.start.getTime()) / 86400000, 29);
});
test('invalid months are rejected before database access', () => {
  for (const month of ['', '2026-00', '2026-13', '2026-9', '1999-12', '2101-01', 'garbage']) {
    assert.throws(() => dashboardMonthRange(month), { statusCode: 400 });
  }
});
