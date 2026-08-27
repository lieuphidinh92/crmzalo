<script setup>
import { computed } from 'vue';
import {
  formatVND,
  formatDateVN,
  formatDateTimeVN,
  statusLabel,
  statusColor,
} from '../composables/useFormat';
import {
  totalOf,
  timeVN,
  canRequestVat,
  vatBadge,
  hasVatFlow,
  hasVatFile,
} from '../composables/useOrderRow';

/**
 * Thẻ MỘT đơn hàng cho điện thoại / tablet nhỏ (< 1024px).
 *
 * Vì sao tách riêng khỏi bảng desktop (27/8/2026): bảng 7 cột nhét vào màn 6
 * inch làm chữ xuống dòng từng từ, sale đi thị trường không đọc nổi. Thẻ này
 * xếp thông tin theo thứ tự cần đọc: mã+tiền → khách → trạng thái → thao tác.
 *
 * ⛔ Component CHỈ trình bày: mọi thao tác phát ra ngoài bằng emit, logic
 * (gọi API, phân quyền, điều kiện hiện nút) vẫn nằm ở Orders.vue như trước.
 */
const props = defineProps({
  order: { type: Object, required: true },
  /** Owner/admin hoặc member có cờ canViewAllOrders → thấy ô tick đối soát. */
  canReconcile: { type: Boolean, default: false },
  /** Người có quyền LÀM hoá đơn (kế toán/quản lý) — chỉ đổi nội dung tooltip. */
  isVatDesk: { type: Boolean, default: false },
  /** Đang gọi API đối soát / đặt lại đơn này → khoá nút + xoay icon. */
  reconciling: { type: Boolean, default: false },
  reordering: { type: Boolean, default: false },
});

const emit = defineEmits(['open', 'vat', 'vat-view', 'vat-edit', 'reconcile', 'reorder']);

const o = computed(() => props.order);
const debt = computed(() => Number(o.value.debtAmountValue ?? 0));
const createdAt = computed(() => o.value.orderDate || o.value.createdAt);

// Tooltip nút VAT — giữ nguyên nội dung như bảng desktop.
const vatTitle = computed(() => {
  const x = o.value;
  if (x.vatInvoiceStatus === 'issued' || x.vatInvoiceStatus === 'partial') {
    return `Đã xuất hoá đơn${x.vatInvoiceId ? ' số ' + x.vatInvoiceId : ''} ${formatDateTimeVN(x.vatIssuedAt)}`;
  }
  if (x.vatInvoiceStatus === 'skipped') {
    return `Không xuất hoá đơn — ${x.vatSkipReason || 'không rõ lý do'}`;
  }
  if (x.vatInvoiceStatus === 'requested') {
    return props.isVatDesk
      ? `Yêu cầu lúc ${formatDateTimeVN(x.vatRequestedAt)} — bấm để xác nhận đã xuất`
      : `Đã yêu cầu xuất VAT ${formatDateTimeVN(x.vatRequestedAt)} — bấm để xem/sửa`;
  }
  return 'Yêu cầu kế toán xuất hoá đơn VAT cho đơn này';
});
</script>

<template>
  <div
    @click="emit('open')"
    @keydown.enter="emit('open')"
    role="button"
    tabindex="0"
    class="card w-full text-left bg-white border border-line-200 rounded-card p-3.5 shadow-card
           active:bg-royal-50/40 transition cursor-pointer"
  >
    <!-- Hàng trên: mã đơn + ngày giờ · tổng tiền + công nợ -->
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-[12px] font-semibold text-ink-secondary tracking-tight">
          {{ o.orderCode }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-0.5 whitespace-nowrap">
          {{ formatDateVN(createdAt) }} · {{ timeVN(createdAt) }}
        </div>
      </div>
      <div class="text-right shrink-0">
        <div class="text-[17px] leading-tight font-bold text-royal-700 tabular-nums">
          {{ formatVND(totalOf(o)) }}
        </div>
        <div v-if="debt > 0" class="text-[11px] font-semibold text-red-600 mt-0.5 tabular-nums">
          Nợ {{ formatVND(debt) }}
        </div>
      </div>
    </div>

    <!-- Khách hàng: tên nổi bật nhất (tối đa 2 dòng rồi ...) -->
    <div class="mt-2.5">
      <div class="text-[15px] font-bold text-ink-primary leading-snug line-clamp-2">
        {{ o.contact?.fullName || '—' }}
      </div>
      <div v-if="o.contact?.storeName" class="text-[12px] text-ink-secondary leading-snug line-clamp-1 mt-0.5">
        {{ o.contact.storeName }}
      </div>
      <div v-if="o.contact?.phone" class="text-[12px] text-ink-secondary mt-0.5 tabular-nums">
        {{ o.contact.phone }}
      </div>
    </div>

    <!-- Trạng thái: nhãn tự co theo chữ, không chiếm hết chiều ngang -->
    <div class="mt-2 flex items-center gap-1.5 flex-wrap">
      <span
        class="inline-flex items-center text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg"
        :class="statusColor(o.statusNormalized || o.status)"
      >
        {{ statusLabel(o.statusNormalized || o.status) }}
      </span>
      <!-- Đã đối soát chứng từ: hiện dấu tick xanh cho người đối soát thấy ngay -->
      <span
        v-if="canReconcile && o.reconciledAt"
        class="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700"
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Đã đối soát
      </span>
    </div>

    <!-- Thao tác: ô bấm 44px cho ngón tay, xuống hàng khi màn hẹp -->
    <div class="mt-3 pt-3 border-t border-line-200 flex flex-wrap items-center justify-end gap-1.5">
      <!-- Yêu cầu / trạng thái xuất VAT (chỉ đơn đã hoàn tất) -->
      <button
        v-if="canRequestVat(o)"
        @click.stop="emit('vat')"
        :title="vatTitle"
        :aria-label="vatBadge(o).label"
        class="h-11 px-3 mr-auto flex items-center gap-1.5 rounded-lg border text-[12px] font-semibold transition whitespace-nowrap"
        :class="vatBadge(o).cls"
      >
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16v16l-2.5-1.5L15 20l-2.5-1.5L10 20l-2.5-1.5L5 20 4 19z" />
          <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="13" y2="13" />
        </svg>
        {{ vatBadge(o).label }}
      </button>

      <!-- Xem hoá đơn đã ký (trước 27/8/2026 nút này bị ẩn trên điện thoại) -->
      <button
        v-if="hasVatFile(o)"
        @click.stop="emit('vat-view')"
        title="Xem hoá đơn VAT đã xuất — mở/tải file gửi khách"
        aria-label="Xem hoá đơn VAT đã xuất"
        class="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-line-300 text-ink-secondary active:bg-surface-soft transition"
      >
        <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      <!-- Sửa / huỷ yêu cầu VAT (cũng đang bị ẩn trên điện thoại trước 27/8) -->
      <button
        v-if="hasVatFlow(o)"
        @click.stop="emit('vat-edit')"
        title="Sửa thông tin xuất VAT / huỷ yêu cầu"
        aria-label="Sửa thông tin xuất VAT"
        class="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-line-300 text-ink-secondary active:bg-surface-soft transition"
      >
        <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
        </svg>
      </button>

      <!-- Ô tick đã đối soát chứng từ -->
      <button
        v-if="canReconcile"
        @click.stop="emit('reconcile')"
        :disabled="reconciling"
        :title="o.reconciledAt ? `Đã đối soát ${formatDateTimeVN(o.reconciledAt)} — bấm để bỏ tick` : 'Bấm để đánh dấu đã đối soát chứng từ'"
        :aria-label="o.reconciledAt ? 'Bỏ tick đối soát' : 'Đánh dấu đã đối soát'"
        class="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border transition disabled:opacity-50"
        :class="o.reconciledAt
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
          : 'border-line-300 text-ink-secondary active:bg-emerald-50'"
      >
        <svg v-if="reconciling" class="w-[18px] h-[18px] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
        <svg v-else class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </button>

      <!-- Đặt lại đơn -->
      <button
        @click.stop="emit('reorder')"
        :disabled="reordering"
        title="Đặt lại đơn này"
        aria-label="Đặt lại đơn này"
        class="h-11 w-11 shrink-0 flex items-center justify-center rounded-lg border border-line-300 text-royal-700 active:bg-royal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg class="w-[18px] h-[18px]" :class="reordering ? 'animate-spin' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
      </button>

      <!-- Mở chi tiết đơn (cả thẻ cũng bấm được) -->
      <span class="h-11 w-7 shrink-0 flex items-center justify-center text-ink-disabled" aria-hidden="true">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* iOS hay huỷ cú bấm khi ngón trượt nhẹ ở thẻ/nút — xem BottomNav.vue 27/8/2026 */
.card,
.card button {
  touch-action: manipulation;
}
</style>
