// Date-only inventory fields must not shift with the browser timezone.
export function batchDate(value) {
  return value ? String(value).slice(0, 10).split('-').reverse().join('/') : 'Chưa có HSD';
}
export function itemBatchLines(item) {
  const rows = item.fifoUsages?.length ? item.fifoUsages : item.batch ? [{ batch: item.batch, quantityUsed: item.quantity }] : [];
  return rows.map(row => `Lô ${row.batch?.batchCode || 'Chưa rõ'} · HSD ${batchDate(row.batch?.expiryDate)} · SL ${row.quantityUsed}`);
}
