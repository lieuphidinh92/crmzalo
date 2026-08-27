<script setup>
import MoneyInput from './MoneyInput.vue';
/**
 * OrderItemRow.vue — MỘT dòng giỏ hàng dạng THẺ, dùng cho điện thoại/tablet
 * (<1024px) ở màn Tạo đơn. Desktop vẫn dùng bảng 5 cột trong CartTable.vue.
 *
 * Vì sao (27/8/2026): bảng 5 cột trên máy 390px chỉ còn ~286px bề ngang → ô SL
 * và ô đơn giá cao 28–32px, bấm bằng ngón cái rất dễ trượt. Thẻ này cho ô bấm
 * 44px và hiện đủ tên SP + cảnh báo tồn/HSD.
 *
 * ⛔ Thuần hiển thị + phát event: mọi phép tính tiền, chiết khấu, cảnh báo tồn
 *    giữ y như cũ (parseInt integer VND), không thêm/bớt điều kiện nào.
 */
import { computed } from 'vue';
import { formatVND, formatDateVN } from '../composables/useFormat';

const props = defineProps({
  item: { type: Object, required: true },
});
const emit = defineEmits(['update-qty', 'update-price', 'update-discount', 'remove']);

const EXPIRY_WARN_DAYS = 90;

function dec() {
  if (props.item.quantity > 1) emit('update-qty', props.item.quantity - 1);
}
function inc() {
  emit('update-qty', props.item.quantity + 1);
}
// MoneyInput nhả ra SỐ NGUYÊN sạch — gõ "1.000" ra 1000 (trước 27/8/2026
// parseInt("1.000") = 1, sai số lượng/giá).
function onInput(val) {
  if (val >= 1) emit('update-qty', val);
}

// Phase 2 — sửa đơn giá thương lượng (integer VND >= 0).
function onPriceInput(val) {
  emit('update-price', Math.max(0, Number(val) || 0));
}
// Phase 2 — chiết khấu dòng (integer VND >= 0).
function onDiscountInput(val) {
  emit('update-discount', Math.max(0, Number(val) || 0));
}

const discountValue = computed(() => Number(props.item.discountValue) || 0);

// Thành tiền dòng = đơn giá × số lượng − chiết khấu (kẹp >= 0).
const lineTotal = computed(() => {
  const gross = (Number(props.item.unitPrice) || 0) * (Number(props.item.quantity) || 0);
  return Math.max(0, gross - discountValue.value);
});

// Giá vốn — CHỈ hiển thị khi field tồn tại (member thường không có).
const itemCost = computed(() => {
  const c = props.item.cost ?? props.item.unitCost;
  return c === undefined || c === null ? null : Number(c);
});
const isBelowCost = computed(
  () =>
    itemCost.value !== null &&
    (Number(props.item.unitPrice) || 0) < itemCost.value,
);

// HẾT HÀNG: tồn = 0
const isOutOfStock = computed(() => props.item.stock === 0);

// VƯỢT TỒN: còn hàng nhưng số lượng > tồn
const isOverStock = computed(
  () =>
    props.item.stock !== undefined &&
    props.item.stock > 0 &&
    props.item.quantity > props.item.stock,
);

// Số ngày tới HSD lô gần nhất (tính theo client, làm tròn ngày).
const daysToExpiry = computed(() => {
  if (!props.item.nearestExpiry) return null;
  const exp = new Date(props.item.nearestExpiry);
  if (isNaN(exp.getTime())) return null;
  const now = new Date();
  const a = Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86400000);
});

const isExpired = computed(() => daysToExpiry.value !== null && daysToExpiry.value < 0);
const isNearExpiry = computed(
  () => daysToExpiry.value !== null && daysToExpiry.value >= 0 && daysToExpiry.value <= EXPIRY_WARN_DAYS,
);
</script>

<template>
  <div class="tap bg-white border border-line-200 rounded-xl p-3">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0 flex-1">
        <div class="font-mono text-[10px] text-ink-secondary">{{ item.sku }}</div>
        <div class="font-medium text-sm text-ink-primary line-clamp-2 lg:truncate lg:line-clamp-none">{{ item.name }}</div>
      </div>
      <button
        @click="emit('remove')"
        type="button"
        class="tap shrink-0 w-11 h-11 lg:w-auto lg:h-auto -mr-1.5 -mt-1.5 lg:m-0 flex items-center justify-center text-ink-disabled hover:text-red-600"
        title="Xoá"
        :aria-label="`Xoá ${item.name} khỏi đơn`"
      >
        <svg class="w-5 h-5 lg:w-4 lg:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
        </svg>
      </button>
    </div>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center bg-surface-50 border border-line-300 rounded-lg">
        <button
          @click="dec"
          type="button"
          class="tap w-11 h-11 lg:w-9 lg:h-9 text-lg lg:text-base text-ink-primary font-bold hover:bg-line-200 rounded-l-lg"
          aria-label="Giảm số lượng"
        >−</button>
        <MoneyInput
          :model-value="item.quantity"
          :min="1"
          @update:model-value="onInput"
          aria-label="Số lượng"
          class="w-14 lg:w-12 h-11 lg:h-9 text-center bg-transparent outline-none font-semibold tabular-nums"
        />
        <button
          @click="inc"
          type="button"
          class="tap w-11 h-11 lg:w-9 lg:h-9 text-lg lg:text-base text-ink-primary font-bold hover:bg-line-200 rounded-r-lg"
          aria-label="Tăng số lượng"
        >+</button>
      </div>

      <div class="text-right">
        <div class="text-[11px] text-ink-secondary tabular-nums">{{ formatVND(item.unitPrice) }} × {{ item.quantity }}</div>
        <div class="font-bold text-royal-700 tabular-nums">{{ formatVND(lineTotal) }}</div>
      </div>
    </div>

    <!-- Phase 2: đơn giá thương lượng + chiết khấu dòng -->
    <div class="mt-2 grid grid-cols-2 gap-2">
      <div>
        <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Đơn giá</div>
        <MoneyInput
          :model-value="item.unitPrice"
          @update:model-value="onPriceInput"
          aria-label="Đơn giá"
          class="w-full h-11 lg:h-9 px-2.5 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm text-right tabular-nums"
        />
      </div>
      <div>
        <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Chiết khấu</div>
        <MoneyInput
          :model-value="discountValue"
          @update:model-value="onDiscountInput"
          aria-label="Chiết khấu dòng"
          placeholder="0"
          class="w-full h-11 lg:h-9 px-2.5 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm text-right tabular-nums"
        />
      </div>
    </div>

    <!-- Tồn thực để sale đối chiếu -->
    <div v-if="item.stock !== undefined" class="mt-2 text-[11px] text-ink-secondary">
      Tồn: {{ item.stock }}<template v-if="item.unit"> {{ item.unit }}</template>
    </div>

    <!-- Cảnh báo mềm (có thể hiện đồng thời nhiều badge) -->
    <div v-if="isOutOfStock || isOverStock || isNearExpiry || isExpired || isBelowCost" class="mt-1.5 flex flex-wrap gap-1.5">
      <span v-if="isBelowCost" class="text-[11px] text-red-700 bg-red-50 rounded px-2 py-1">
        ⛔ Dưới giá vốn
      </span>
      <span v-if="isOutOfStock" class="text-[11px] text-red-700 bg-red-50 rounded px-2 py-1">
        ⛔ Hết hàng
      </span>
      <span v-if="isOverStock" class="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
        ⚠ Vượt tồn (còn {{ item.stock }})
      </span>
      <span v-if="isExpired" class="text-[11px] text-red-700 bg-red-50 rounded px-2 py-1">
        ⛔ Hết hạn {{ formatDateVN(item.nearestExpiry) }}
      </span>
      <span v-else-if="isNearExpiry" class="text-[11px] text-orange-700 bg-orange-50 rounded px-2 py-1">
        ⏳ Cận date {{ formatDateVN(item.nearestExpiry) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* iOS huỷ cú bấm nếu ngón trượt nhẹ / nghi ngờ double-tap-zoom (27/8/2026). */
.tap,
.tap button {
  touch-action: manipulation;
}
/* line-clamp-2 / line-clamp-none lấy từ core Tailwind 3.4 — KHÔNG tự khai lại
   trong style scoped: selector scoped có specificity cao hơn utility, sẽ ghi
   đè cả `lg:line-clamp-none` và làm desktop mất truncate. */
</style>
