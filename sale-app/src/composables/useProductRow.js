/**
 * Hàm hiển thị dùng chung cho MỘT sản phẩm trong danh sách.
 *
 * Thẻ lưới máy tính (ProductCard.vue) và thẻ dòng điện thoại
 * (MobileProductCard.vue) phải ra cùng nhãn tồn / cùng cảnh báo HSD / cùng
 * điều kiện khoá nút thêm vào đơn → gom về đây, sửa 1 chỗ đổi cả 2.
 *
 * ⛔ Thuần hiển thị. Điều kiện khoá nút (hết hàng / chưa có giá) là NGHIỆP VỤ
 * đang chạy — không nới ở đây (bán âm kho chỉ mở ở màn Tạo đơn cho admin).
 */
import { formatDateVN } from './useFormat';

/** Nhãn tồn: hết hàng / sắp hết / thấp — null nếu tồn bình thường. */
export function productStockBadge(p) {
  const s = p.stock ?? 0;
  const w = p.warning_stock ?? 0;
  if (s <= 0) return { label: 'Hết hàng', cls: 'bg-red-50 text-red-700' };
  if (w > 0 && s <= w * 0.3) return { label: 'Sắp hết', cls: 'bg-red-50 text-red-700' };
  if (w > 0 && s <= w) return { label: 'Thấp', cls: 'bg-amber-50 text-amber-700' };
  return null;
}

/** Cảnh báo hạn dùng: quá hạn, hoặc còn dưới 90 ngày. */
export function productExpiryWarn(p) {
  const d = p.nearest_expiry;
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Đã hết HSD', cls: 'text-red-700' };
  if (days < 90) return { label: `HSD ${formatDateVN(d)}`, cls: 'text-amber-700' };
  return null;
}

/** Chưa có giá sỉ → hiện "Liên hệ giá", không cho thêm vào đơn. */
export function productNoPrice(p) {
  return !p.wholesale_price || p.wholesale_price <= 0;
}

/** Màu huy hiệu thứ hạng ở bộ lọc "Bán chạy". */
export function rankColor(rank) {
  if (rank === 1) return 'bg-amber-500';
  if (rank === 2) return 'bg-slate-400';
  if (rank === 3) return 'bg-orange-700';
  return 'bg-royal-700';
}
