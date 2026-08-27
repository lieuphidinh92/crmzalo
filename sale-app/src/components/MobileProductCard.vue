<script setup>
import { computed } from 'vue';
import { formatVND } from '../composables/useFormat';
import {
  productStockBadge,
  productExpiryWarn,
  productNoPrice,
  rankColor,
} from '../composables/useProductRow';

/**
 * Thẻ MỘT sản phẩm cho điện thoại / tablet nhỏ (< 1024px).
 *
 * Vì sao khác thẻ lưới của máy tính (27/8/2026): lưới 2 cột trên điện thoại
 * dành ~60% chiều cao cho ảnh — mà phần lớn SKU chưa có ảnh nên chỉ hiện ô
 * xám trống, 1 màn chỉ xem được 2 SP. Sale tra giá ngoài thị trường cần đọc
 * nhanh TÊN + GIÁ + TỒN, nên đổi sang dòng ngang: ảnh nhỏ 64px, mỗi màn ~6 SP.
 *
 * ⛔ Điều kiện khoá nút "thêm vào đơn" giữ y như thẻ máy tính (hết hàng /
 * chưa có giá) — dùng chung useProductRow.js, không nới lỏng ở đây.
 */
const props = defineProps({
  product: { type: Object, required: true },
  /** Thứ hạng ở bộ lọc "Bán chạy" (0 = không hiện). */
  rank: { type: Number, default: 0 },
});
const emit = defineEmits(['open', 'add']);

const p = computed(() => props.product);
const stockBadge = computed(() => productStockBadge(p.value));
const expiryWarn = computed(() => productExpiryWarn(p.value));
const noPrice = computed(() => productNoPrice(p.value));
const disabled = computed(() => noPrice.value || (p.value.stock ?? 0) <= 0);
</script>

<template>
  <div
    @click="emit('open', product)"
    @keydown.enter="emit('open', product)"
    role="button"
    tabindex="0"
    class="card flex gap-3 p-3 bg-white border border-line-200 rounded-card shadow-card
           active:bg-royal-50/40 transition cursor-pointer text-left"
  >
    <!-- Ảnh 64px: chưa có ảnh thì hiện mã SKU cho đỡ trống -->
    <div class="relative w-16 h-16 shrink-0 rounded-lg bg-surface-soft border border-line-200 overflow-hidden flex items-center justify-center">
      <img
        v-if="p.mainImageUrl"
        :src="p.mainImageUrl"
        :alt="p.name"
        class="w-full h-full object-cover"
        loading="lazy"
      />
      <span v-else class="text-[9px] leading-tight text-ink-disabled text-center px-1 line-clamp-3">
        {{ p.sku }}
      </span>
      <span
        v-if="rank"
        class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-card"
        :class="rankColor(rank)"
      >{{ rank }}</span>
    </div>

    <!-- Thông tin: SKU · thương hiệu → tên → giá → tồn/HSD -->
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 text-[11px] text-ink-secondary">
        <span class="font-mono truncate">{{ p.sku }}</span>
        <span v-if="p.brand?.name" class="truncate">· {{ p.brand.name }}</span>
        <span
          v-if="stockBadge"
          class="ml-auto shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
          :class="stockBadge.cls"
        >{{ stockBadge.label }}</span>
      </div>

      <div class="text-[14px] font-bold text-ink-primary leading-snug line-clamp-2 mt-0.5">
        {{ p.name }}
      </div>

      <div class="mt-1 flex items-baseline gap-2 flex-wrap">
        <span
          v-if="noPrice"
          class="text-[12px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded"
        >Liên hệ giá</span>
        <template v-else>
          <span class="text-[16px] font-bold text-royal-700 tabular-nums leading-none">
            {{ formatVND(p.wholesale_price) }}
          </span>
          <span
            v-if="p.retail_price > p.wholesale_price"
            class="text-[11px] text-ink-disabled line-through tabular-nums"
          >Lẻ: {{ formatVND(p.retail_price) }}</span>
        </template>
      </div>

      <!-- Lãi dự kiến: backend chỉ trả cho người được xem giá vốn -->
      <div v-if="p.estimated_profit > 0" class="text-[11px] text-green-700 font-medium mt-0.5">
        Lãi dự kiến: {{ formatVND(p.estimated_profit) }}
      </div>

      <div class="mt-1 flex items-center gap-2 flex-wrap text-[11px]">
        <span class="text-ink-secondary">Tồn: {{ p.stock ?? 0 }} {{ p.unit || '' }}</span>
        <span v-if="expiryWarn" :class="expiryWarn.cls" class="font-medium">{{ expiryWarn.label }}</span>
      </div>
    </div>

    <!-- Thêm vào đơn — ô bấm 44px cho ngón tay -->
    <div class="shrink-0 flex items-center">
      <button
        @click.stop="emit('add', product)"
        :disabled="disabled"
        :title="disabled ? (noPrice ? 'Sản phẩm chưa có giá sỉ' : 'Hết hàng trong kho') : 'Thêm vào đơn'"
        :aria-label="`Thêm ${p.name} vào đơn`"
        class="h-11 w-11 rounded-lg border border-royal-700 text-royal-700 flex items-center justify-center
               active:bg-royal-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.card,
.card button {
  touch-action: manipulation;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
