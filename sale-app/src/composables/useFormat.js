import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const VND = new Intl.NumberFormat('vi-VN');

export function formatVND(n) {
  const num = Number(n) || 0;
  return `${VND.format(num)}đ`;
}

export function formatVNDShort(n) {
  const num = Math.abs(Number(n) || 0);
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(num >= 10_000_000_000 ? 0 : 1)} tỷ`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}tr`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return String(Math.round(num));
}

export function formatDateVN(d) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

export function formatDateTimeVN(d) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM HH:mm');
}

export function formatRelativeTime(d) {
  if (!d) return '—';
  return dayjs(d).fromNow();
}

export function statusLabel(s) {
  const map = {
    draft: 'Nháp',
    confirmed: 'Đã xác nhận',
    packing: 'Đang đóng gói',
    shipping: 'Đang giao',
    completed: 'Hoàn tất',
    shipped: 'Đã giao',
    paid: 'Đã thanh toán',
    cancelled: 'Đã huỷ',
  };
  return map[s] ?? s;
}

export function statusColor(s) {
  const map = {
    draft: 'bg-gray-100 text-gray-700',
    confirmed: 'bg-blue-100 text-blue-700',
    packing: 'bg-amber-100 text-amber-700',
    shipping: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    shipped: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-rose-100 text-rose-700',
  };
  return map[s] ?? 'bg-gray-100 text-gray-700';
}

export function tierLabel(t) {
  const map = {
    thung_10: '10 thùng',
    thung_5: '5 thùng',
    thung_1: '1 thùng',
    le: '<1 thùng',
    // legacy
    ctv: '<1 thùng',
    dai_ly_cap_1: '1 thùng',
    dai_ly_cap_2: '5 thùng',
  };
  return map[t] ?? '—';
}
