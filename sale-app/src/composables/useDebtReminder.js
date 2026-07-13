// Helper dùng chung để nhắc thu nợ qua Zalo.
// Dùng ở DebtCustomerRow (dòng khách) và Debt.vue (bảng Quá hạn) — 1 nguồn nội
// dung duy nhất để tin nhắc nợ không bị lệch giữa 2 chỗ.
import { formatVND, formatDateVN } from './useFormat';

// Soạn nội dung tin nhắn nhắc nợ (giọng lịch sự, xưng em).
export function buildDebtReminderMsg(c) {
  const name = c.full_name || c.store_name || 'anh/chị';
  const amount = formatVND(c.debt || 0);
  const dueText = c.due_date ? ` (hạn thanh toán ${formatDateVN(c.due_date)})` : '';
  return (
    `Dạ em chào ${name} ạ. Em xin phép nhắc nhẹ bên mình về khoản công nợ ` +
    `còn lại là ${amount}${dueText} ạ. Khi nào thuận tiện mình hỗ trợ em ` +
    `thanh toán giúp nhé, có gì cần đối chiếu lại em gửi sao kê cho mình ạ. Em cảm ơn nhiều!`
  );
}

// KH có mở được Zalo không (ưu tiên zalo_uid, fallback số điện thoại).
export function canZaloRemind(c) {
  return !!(c && (c.zalo_uid || c.phone));
}

// Mở Zalo và gắn sẵn tin nhắc nợ vào query ?message=.
export function openZaloReminder(c) {
  let url;
  if (c.zalo_uid) {
    url = `https://zalo.me/${c.zalo_uid}`;
  } else if (c.phone) {
    url = `https://zalo.me/${String(c.phone).replace(/\D/g, '')}`;
  } else {
    return;
  }
  url += `?message=${encodeURIComponent(buildDebtReminderMsg(c))}`;
  window.open(url, '_blank', 'noopener');
}
