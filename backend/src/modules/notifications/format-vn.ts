/**
 * format-vn.ts — định dạng ngày/giờ/tiền theo chuẩn Việt Nam cho thông báo.
 *
 * ⚠️ TẤT CẢ đều đi qua `Intl` với `timeZone: 'Asia/Ho_Chi_Minh'`.
 * TUYỆT ĐỐI KHÔNG dùng `toISOString().slice(0,10)` để lấy ngày: nó lấy giờ UTC,
 * nên từ 00:00–07:00 giờ VN sẽ trả về NGÀY HÔM TRƯỚC. Dùng nhầm ở đây thì khoá
 * chống trùng đổi theo → gửi trùng 2 lần vào sáng sớm.
 */
const TZ = 'Asia/Ho_Chi_Minh';

/** '27/08/2026 10:00' — dùng trong nội dung thông báo. */
export function formatVnDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** '2026-08-27' theo giờ VN — thành phần ngày của khoá chống trùng. */
export function vnDateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Giờ hiện tại theo VN, 0–23 — để biết cron đang chạy khung 10h hay 16h. */
export function vnHour(d: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d),
  );
}

/** 1500000 → '1,500,000 đ' (đúng chuẩn hiển thị tiền của dự án). */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} đ`;
}

/** 26 → '1 ngày 2 giờ' — mô tả đơn đã chờ bao lâu cho dễ đọc. */
export function formatWaited(hours: number): string {
  const h = Math.floor(hours);
  if (h < 24) return `${h} giờ`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem === 0 ? `${d} ngày` : `${d} ngày ${rem} giờ`;
}
