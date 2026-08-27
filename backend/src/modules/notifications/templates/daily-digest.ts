/**
 * daily-digest.ts — MỘT tin gộp 3 việc: xuất VAT · công nợ quá hạn · tồn kho.
 * Gửi nhóm Lark "Xuất Nhập Kho" lúc 10:00 và 16:00 (anh Philip chốt 27/8/2026).
 *
 * Bố cục anh chốt: mỗi mục = **1 dòng số tổng** + link "xem chi tiết". Riêng
 * tồn kho có thêm danh sách ngắn vì đó là thứ phải hành động ngay (đặt hàng).
 * Chi tiết đầy đủ nằm trên phần mềm — tin nhắn KHÔNG phải bảng kê.
 *
 * ⛔ Chỉ số tổng hợp + mã hàng/mã đơn. KHÔNG giá vốn, KHÔNG lãi gộp: Lark nằm
 * ngoài tường quyền CRM và tin nhắn forward được.
 */
import { formatTien, formatVnDateTime, formatWaited } from '../format-vn.js';
import type { RenderedMessage } from '../notification-types.js';
import type { VatPendingData } from './vat-pending.js';

export interface DailyDigestData {
  ngay: string;
  vat: VatPendingData | null;
  congNo: { customerCount: number; customerAmount: number; supplierCount: number; supplierAmount: number } | null;
  tonKho: {
    atRisk: Array<{ sku: string; name: string; stock: number; coverDays: number; perDay: number }>;
    outOfStockCount: number;
    nearExpiry: Array<{ sku: string; name: string; batchCode: string; quantity: number; daysLeft: number }>;
    nearExpiryTotal: number;
    expiredCount: number;
  } | null;
  links: { vat: string; congNo: string; tonKhoHetHang: string; tonKhoCanDate: string };
  isTest?: boolean;
}

/** Tên hàng dài quá thì cắt — tin nhắn trên điện thoại xuống dòng loạn. */
function ngan(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Số lẻ kiểu Việt Nam: 2.5 → '2,5'. Đừng để dấu chấm — người Việt đọc là hàng nghìn. */
function so(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

/** '0,1 ngày' đọc khó tin; dưới 1 ngày thì nói thẳng là sắp hết trong hôm nay. */
function moTaConDuBan(coverDays: number): string {
  return coverDays < 1 ? '**hết trong hôm nay**' : `**đủ bán ~${so(coverDays)} ngày**`;
}

export function renderDailyDigest(d: DailyDigestData): RenderedMessage {
  const lines: string[] = [];
  const canhBao: string[] = [];

  if (d.isTest) {
    lines.push('**Đây là tin THỬ để kiểm tra hệ thống — số liệu bên dưới là giả, KHÔNG cần xử lý.**');
    lines.push('');
  }

  // ── 1. Xuất hoá đơn VAT ───────────────────────────────────────────────
  if (d.vat && d.vat.totalCount > 0) {
    const v = d.vat;
    lines.push(`**🧾 XUẤT HOÁ ĐƠN VAT** — ${v.totalCount} yêu cầu chờ: **${formatTien(v.totalAmount)}**`);
    if (v.oldestRequestedAt) {
      lines.push(`Cũ nhất: ${formatVnDateTime(new Date(v.oldestRequestedAt))} — chờ ${formatWaited(v.oldestWaitedHours)}`);
    }
    if (v.over24hCount > 0) canhBao.push(`${v.over24hCount} yêu cầu VAT chờ quá 24 giờ`);
    lines.push(`[Bấm vào đây để xem chi tiết](${d.links.vat})`);
    lines.push('');
  }

  // ── 2. Công nợ quá hạn ────────────────────────────────────────────────
  const cn = d.congNo;
  if (cn && (cn.customerCount > 0 || cn.supplierCount > 0)) {
    lines.push('**💰 CÔNG NỢ QUÁ HẠN**');
    if (cn.customerCount > 0) {
      lines.push(`Khách nợ mình: **${cn.customerCount} đơn — ${formatTien(cn.customerAmount)}**`);
    }
    if (cn.supplierCount > 0) {
      lines.push(`Mình nợ NCC: **${cn.supplierCount} phiếu — ${formatTien(cn.supplierAmount)}**`);
    }
    lines.push(`[Bấm vào đây để xem chi tiết](${d.links.congNo})`);
    lines.push('');
  }

  // ── 3. Tồn kho ────────────────────────────────────────────────────────
  const tk = d.tonKho;
  if (tk && (tk.atRisk.length > 0 || tk.nearExpiryTotal > 0 || tk.expiredCount > 0)) {
    lines.push('**📦 TỒN KHO**');

    if (tk.atRisk.length > 0) {
      lines.push(`Hàng bán chạy sắp hết (${tk.atRisk.length} mã):`);
      for (const p of tk.atRisk) {
        lines.push(
          p.stock <= 0
            ? `• ${p.sku} — ${ngan(p.name)}: **HẾT HÀNG** (bán ~${so(p.perDay)}/ngày)`
            : `• ${p.sku} — ${ngan(p.name)}: còn ${p.stock}, ${moTaConDuBan(p.coverDays)}`,
        );
      }
      if (tk.outOfStockCount > 0) canhBao.push(`${tk.outOfStockCount} mã bán chạy đã HẾT HÀNG`);
      lines.push(`[Bấm vào đây để xem toàn bộ hàng sắp hết](${d.links.tonKhoHetHang})`);
      lines.push('');
    }

    if (tk.nearExpiryTotal > 0) {
      lines.push(`Sản phẩm cận date (dưới 6 tháng): **${tk.nearExpiryTotal} lô**`);
      for (const b of tk.nearExpiry) {
        lines.push(`• ${b.sku || b.batchCode} — ${ngan(b.name)}: ${b.quantity} đv, còn ${b.daysLeft} ngày`);
      }
      if (tk.nearExpiryTotal > tk.nearExpiry.length) {
        lines.push(`• …và ${tk.nearExpiryTotal - tk.nearExpiry.length} lô khác`);
      }
      lines.push(`[Bấm vào đây để xem toàn bộ hàng cận date](${d.links.tonKhoCanDate})`);
    }

    if (tk.expiredCount > 0) {
      lines.push(`⛔ Lô ĐÃ hết hạn còn tồn: **${tk.expiredCount} lô**`);
      canhBao.push(`${tk.expiredCount} lô đã hết hạn nhưng còn trong kho`);
    }

  }

  return {
    title: `📋 ${d.isTest ? '[THỬ NGHIỆM] ' : ''}Việc cần xử lý — ${d.ngay}`,
    lines,
    alert: canhBao.length > 0 ? canhBao.join(' · ') : undefined,
    // Nút bấm chính trỏ về mục ĐẦU TIÊN có việc — bấm nút mà mở ra màn trống thì
    // người đọc tưởng hệ thống báo sai.
    actionUrl:
      d.vat && d.vat.totalCount > 0 ? d.links.vat : d.congNo ? d.links.congNo : d.links.tonKhoHetHang,
    actionLabel: 'Mở phần mềm',
    severity: canhBao.length > 0 ? 'warning' : 'info',
  };
}
