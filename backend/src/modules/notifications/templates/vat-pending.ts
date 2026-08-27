/**
 * vat-pending.ts — nội dung thông báo "còn yêu cầu xuất VAT đang chờ".
 *
 * Nội dung CỐ Ý chỉ có số tổng hợp + tối đa 5 mã đơn. Lark/email nằm NGOÀI
 * tường quyền của CRM (ai trong nhóm cũng đọc được, tin nhắn forward được) nên
 * tuyệt đối KHÔNG đưa giá vốn / lãi gộp vào đây — cùng tinh thần với whitelist
 * của `/api/ext/v1`.
 *
 * Anh Philip chốt 27/8/2026: "Chờ xuất" tính CẢ đơn "Xuất 1 phần" (phần còn
 * thiếu vẫn phải xuất), nhưng tách riêng 2 dòng để kế toán biết vào tab nào.
 */
import { formatVnd, formatVnDateTime, formatWaited } from '../format-vn.js';
import type { RenderedMessage } from '../notification-types.js';

export interface VatPendingData {
  /** Đơn ở tab "Chờ xuất" (`vatInvoiceStatus = 'requested'`). */
  requestedCount: number;
  requestedAmount: number;
  /** Đơn ở tab "Xuất 1 phần" — số tiền là phần CÒN THIẾU phải xuất tiếp. */
  partialCount: number;
  partialRemaining: number;
  /** Gộp 2 nhóm trên. */
  totalCount: number;
  totalAmount: number;
  /** Đơn đã chờ quá 24 giờ — con số anh muốn nhìn thấy đầu tiên. */
  over24hCount: number;
  /** Yêu cầu cũ nhất (ISO). null khi không có đơn nào. */
  oldestRequestedAt: string | null;
  oldestWaitedHours: number;
  /** Tối đa 5 đơn chờ lâu nhất — đủ để nhận diện, không phải bảng kê. */
  topOrders: Array<{ orderCode: string; buyer: string; amount: number; waitedHours: number }>;
  actionUrl: string;
  /**
   * true = tin do người bấm "gửi thử", số liệu là GIẢ. Phải hiện rõ trong tin,
   * nếu không kế toán mở ra tưởng có việc thật rồi đi tìm đơn không tồn tại.
   */
  isTest?: boolean;
}

export function renderVatPending(data: VatPendingData): RenderedMessage {
  const d = data;
  const lines: string[] = [];
  if (d.isTest) {
    lines.push('**Đây là tin THỬ để kiểm tra hệ thống — số liệu bên dưới là giả, KHÔNG cần xử lý.**');
    lines.push('');
  }
  lines.push(
    `**${d.totalCount} yêu cầu xuất VAT đang chờ** — tổng **${formatVnd(d.totalAmount)}**`,
    `• Chờ xuất: ${d.requestedCount} đơn · ${formatVnd(d.requestedAmount)}`,
  );

  if (d.partialCount > 0) {
    lines.push(`• Xuất 1 phần (còn thiếu): ${d.partialCount} đơn · ${formatVnd(d.partialRemaining)}`);
  }

  if (d.oldestRequestedAt) {
    lines.push(
      `• Yêu cầu cũ nhất: ${formatVnDateTime(new Date(d.oldestRequestedAt))} ` +
        `(đã chờ ${formatWaited(d.oldestWaitedHours)})`,
    );
  }

  if (d.topOrders.length > 0) {
    lines.push('');
    lines.push('**Chờ lâu nhất:**');
    for (const o of d.topOrders) {
      lines.push(`• ${o.orderCode} — ${o.buyer} — ${formatVnd(o.amount)} — chờ ${formatWaited(o.waitedHours)}`);
    }
  }

  return {
    title: `🧾 ${d.isTest ? '[THỬ NGHIỆM] ' : ''}Xuất VAT: ${d.totalCount} yêu cầu đang chờ`,
    lines,
    alert:
      d.over24hCount > 0
        ? `Có ${d.over24hCount} yêu cầu đã chờ QUÁ 24 GIỜ — cần xuất hoá đơn ngay.`
        : undefined,
    actionUrl: d.actionUrl,
    actionLabel: 'Mở danh sách Chờ xuất',
    severity: d.over24hCount > 0 ? 'warning' : 'info',
  };
}
