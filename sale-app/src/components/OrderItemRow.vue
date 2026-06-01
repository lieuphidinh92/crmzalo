<script setup>
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
function onInput(e) {
  const val = parseInt(e.target.value);
  if (!isNaN(val) && val >= 1) emit('update-qty', val);
}

// Phase 2 — sửa đơn giá thương lượng (integer VND >= 0).
function onPriceInput(e) {
  const val = parseInt(e.target.value);
  emit('update-price', isNaN(val) || val < 0 ? 0 : val);
}
// Phase 2 — chiết khấu dòng (integer VND >= 0).
function onDiscountInput(e) {
  const val = parseInt(e.target.value);
  emit('update-discount', isNaN(val) || val < 0 ? 0 : val);
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
  <div class="bg-white border border-line-200 rounded-xl p-3">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="min-w-0 flex-1">
        <div class="font-mono text-[10px] text-ink-secondary">{{ item.sku }}</div>
        <div class="font-medium text-sm text-ink-primary truncate">{{ item.name }}</div>
      </div>
      <button @click="emit('remove')" class="text-ink-disabled hover:text-red-600 shrink-0" title="Xoá">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
        </svg>
      </button>
    </div>

    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center bg-surface-50 rounded-lg">
        <button @click="dec" class="w-9 h-9 text-ink-primary font-bold hover:bg-line-200 rounded-l-lg">−</button>
        <input
          :value="item.quantity"
          @input="onInput"
          type="number"
          min="1"
          class="w-12 h-9 text-center bg-transparent outline-none font-semibold"
        />
        <button @click="inc" class="w-9 h-9 text-ink-primary font-bold hover:bg-line-200 rounded-r-lg">+</button>
      </div>

      <div class="text-right">
        <div class="text-[11px] text-ink-secondary">{{ formatVND(item.unitPrice) }} × {{ item.quantity }}</div>
        <div class="font-bold text-royal-700">{{ formatVND(lineTotal) }}</div>
      </div>
    </div>

    <!-- Phase 2: đơn giá thương lượng + chiết khấu dòng -->
    <div class="mt-2 grid grid-cols-2 gap-2">
      <div>
        <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Đơn giá</div>
        <input
          :value="item.unitPrice"
          @input="onPriceInput"
          type="number"
          min="0"
          step="1000"
          inputmode="numeric"
          class="w-full h-9 px-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm text-right"
        />
      </div>
      <div>
        <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Chiết khấu</div>
        <input
          :value="discountValue"
          @input="onDiscountInput"
          type="number"
          min="0"
          step="1000"
          inputmode="numeric"
          placeholder="0"
          class="w-full h-9 px-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm text-right"
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
