<script setup>
import { computed } from 'vue';
import { formatVND, formatDateVN } from '../composables/useFormat';

const props = defineProps({
  product: { type: Object, required: true },
  rank: { type: Number, default: 0 },
});
const emit = defineEmits(['open', 'add']);

const stockBadge = computed(() => {
  const s = props.product.stock ?? 0;
  const w = props.product.warning_stock ?? 0;
  if (s <= 0) return { label: 'Hết hàng', cls: 'bg-red-50 text-red-700' };
  if (w > 0 && s <= w * 0.3) return { label: 'Sắp hết', cls: 'bg-red-50 text-red-700' };
  if (w > 0 && s <= w) return { label: 'Thấp', cls: 'bg-amber-50 text-amber-700' };
  return null;
});

const expiryWarn = computed(() => {
  const d = props.product.nearest_expiry;
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Đã hết HSD', cls: 'text-red-700' };
  if (days < 90) return { label: `HSD ${formatDateVN(d)}`, cls: 'text-amber-700' };
  return null;
});

const rankColor = computed(() => {
  if (props.rank === 1) return 'bg-amber-500';
  if (props.rank === 2) return 'bg-slate-400';
  if (props.rank === 3) return 'bg-orange-700';
  return 'bg-royal-700';
});

const noPrice = computed(() => !props.product.wholesale_price || props.product.wholesale_price <= 0);
</script>

<template>
  <button
    @click="emit('open', product)"
    type="button"
    class="bg-white border border-line-200 hover:border-royal-700 hover:shadow-card rounded-card overflow-hidden text-left transition group flex flex-col"
  >
    <!-- Image -->
    <div class="relative aspect-square bg-surface-soft border-b border-line-200 overflow-hidden">
      <img
        v-if="product.mainImageUrl"
        :src="product.mainImageUrl"
        :alt="product.name"
        class="w-full h-full object-cover group-hover:scale-105 transition"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-ink-disabled text-xs">
        {{ product.sku }}
      </div>
      <span
        v-if="rank"
        class="absolute top-2 left-2 w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-card"
        :class="rankColor"
      >
        {{ rank }}
      </span>
      <span
        v-if="stockBadge"
        class="absolute top-2 right-2 text-[10px] uppercase font-semibold px-2 py-0.5 rounded"
        :class="stockBadge.cls"
      >
        {{ stockBadge.label }}
      </span>
    </div>

    <!-- Info -->
    <div class="p-3 flex flex-col flex-1">
      <div class="flex items-center gap-1.5 mb-1">
        <span class="font-mono text-[10px] text-ink-secondary">{{ product.sku }}</span>
        <span v-if="product.brand?.name" class="text-[10px] text-ink-secondary">· {{ product.brand.name }}</span>
      </div>
      <div class="text-sm font-semibold text-ink-primary line-clamp-2 leading-snug mb-2">
        {{ product.name }}
      </div>

      <!-- Pricing -->
      <div class="mt-auto">
        <template v-if="noPrice">
          <div class="text-xs font-semibold text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded">
            Liên hệ giá
          </div>
        </template>
        <template v-else>
          <div class="text-base font-bold text-royal-700 tabular-nums leading-none">
            {{ formatVND(product.wholesale_price) }}
          </div>
          <div v-if="product.retail_price > product.wholesale_price" class="text-[11px] text-ink-disabled line-through mt-0.5 tabular-nums">
            Lẻ: {{ formatVND(product.retail_price) }}
          </div>
          <div v-if="product.estimated_profit > 0" class="text-[11px] text-green-700 font-medium mt-0.5">
            Lãi dự kiến: {{ formatVND(product.estimated_profit) }}
          </div>
        </template>
      </div>

      <!-- Stock + expiry footer -->
      <div class="mt-2 flex items-center justify-between text-[11px]">
        <span class="text-ink-secondary">Tồn: {{ product.stock ?? 0 }} {{ product.unit || '' }}</span>
        <span v-if="expiryWarn" :class="expiryWarn.cls" class="font-medium">{{ expiryWarn.label }}</span>
      </div>

      <!-- Add to order -->
      <button
        @click.stop="emit('add', product)"
        :disabled="noPrice || product.stock <= 0"
        class="mt-2 h-8 w-full rounded-btn border border-royal-700 text-royal-700 hover:bg-royal-50 text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Thêm vào đơn
      </button>
    </div>
  </button>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
