/**
 * Hàm hiển thị dùng chung cho MỘT dòng đơn hàng.
 *
 * Bảng trên máy tính (Orders.vue) và thẻ trên điện thoại (MobileOrderCard.vue)
 * phải ra cùng một nhãn / cùng một điều kiện hiện nút, nên gom về đây — sửa 1
 * chỗ là cả 2 nơi đổi theo. Thuần hiển thị: KHÔNG gọi API, KHÔNG đổi nghiệp vụ.
 */

/** Tổng tiền đơn — backend trả 2 tên tuỳ endpoint. */
export function totalOf(o) {
  return o.totalAmountValue ?? o.totalAmount ?? 0;
}

/** Giờ HH:mm hiện dưới ngày tạo (máy chạy giờ VN — xem LUẬT MÚI GIỜ). */
export function timeVN(d) {
  if (!d) return '';
  const t = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

/** Chỉ đơn hoàn tất mới xuất hoá đơn — đơn huỷ/hoàn không phát sinh doanh thu. */
export function canRequestVat(o) {
  return (o.statusNormalized || o.status) === 'completed';
}

/** Nhãn + màu của nút VAT theo trạng thái hoá đơn của đơn. */
export function vatBadge(o) {
  const st = o.vatInvoiceStatus;
  if (st === 'issued') return { label: 'Đã xuất VAT', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700' };
  if (st === 'partial') return { label: 'Xuất 1 phần', cls: 'border-royal-500 bg-royal-50 text-royal-700' };
  if (st === 'skipped') return { label: 'Không xuất VAT', cls: 'border-line-300 bg-surface-soft text-ink-secondary' };
  if (st === 'requested') return { label: 'Đã yêu cầu VAT', cls: 'border-amber-500 bg-amber-50 text-amber-700' };
  return { label: 'Yêu cầu xuất VAT', cls: 'border-royal-700 text-royal-700 hover:bg-royal-50' };
}

/** Đơn đã bắt đầu quy trình VAT → hiện thêm nút xem / sửa cạnh nhãn. */
export const hasVatFlow = (o) => ['requested', 'partial', 'issued'].includes(o.vatInvoiceStatus);

/** Đơn đã có file hoá đơn để mở / tải gửi khách. */
export const hasVatFile = (o) => ['partial', 'issued'].includes(o.vatInvoiceStatus);
