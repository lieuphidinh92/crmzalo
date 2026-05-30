<script setup>
import { computed } from 'vue';
import { formatVND, formatDateVN } from '../composables/useFormat';

const props = defineProps({
  products: { type: Array, required: true },
  page: { type: Number, default: 1 },
  limit: { type: Number, default: 24 },
});
const emit = defineEmits(['open', 'add']);

function startIndex(idx) {
  return (props.page - 1) * props.limit + idx + 1;
}

function stockClass(p) {
  const s = p.stock ?? 0;
  const w = p.warning_stock ?? 0;
  if (s <= 0) return 'text-red-700 font-semibold';
  if (w > 0 && s <= w) return 'text-amber-700 font-semibold';
  return 'text-ink-primary';
}

function rev30(p) {
  return formatVND(p.revenue_30d ?? 0);
}
function qty30(p) {
  return `${(p.quantity_30d ?? 0).toLocaleString('vi-VN')} ${p.unit || 'hộp'}`;
}

const rows = computed(() => props.products);
</script>

<template>
  <div class="bg-white border border-line-200 rounded-card shadow-card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse min-w-[860px]">
        <thead>
          <tr class="bg-surface-soft border-b border-line-200 text-ink-secondary text-xs uppercase">
            <th class="px-3 py-2.5 text-left font-semibold w-12">STT</th>
            <th class="px-3 py-2.5 text-left font-semibold">Tên sản phẩm</th>
            <th class="px-3 py-2.5 text-left font-semibold hidden md:table-cell">Brand</th>
            <th class="px-3 py-2.5 text-left font-semibold hidden lg:table-cell">Hạn sử dụng</th>
            <th class="px-3 py-2.5 text-right font-semibold">Tồn kho</th>
            <th class="px-3 py-2.5 text-right font-semibold">Giá bán lẻ</th>
            <th class="px-3 py-2.5 text-right font-semibold">Giá sỉ KH thường</th>
            <th class="px-3 py-2.5 text-right font-semibold hidden md:table-cell">Doanh số 30 ngày</th>
            <th class="px-3 py-2.5 text-right font-semibold w-12"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(p, idx) in rows"
            :key="p.id"
            @click="emit('open', p)"
            class="border-b border-line-200 last:border-0 hover:bg-royal-50 cursor-pointer transition"
          >
            <td class="px-3 py-2.5 text-ink-secondary tabular-nums">{{ startIndex(idx) }}</td>
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded bg-surface-soft border border-line-200 overflow-hidden shrink-0 flex items-center justify-center">
                  <img
                    v-if="p.mainImageUrl"
                    :src="p.mainImageUrl"
                    :alt="p.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span v-else class="text-[8px] text-ink-disabled">{{ p.sku }}</span>
                </div>
                <div class="min-w-0">
                  <div class="font-medium text-ink-primary line-clamp-1">{{ p.name }}</div>
                  <div class="font-mono text-[10px] text-ink-secondary">{{ p.sku }}</div>
                </div>
              </div>
            </td>
            <td class="px-3 py-2.5 text-ink-secondary hidden md:table-cell">{{ p.brand?.name || '—' }}</td>
            <td class="px-3 py-2.5 text-ink-secondary hidden lg:table-cell tabular-nums">
              {{ p.nearest_expiry ? formatDateVN(p.nearest_expiry) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums" :class="stockClass(p)">
              {{ (p.stock ?? 0).toLocaleString('vi-VN') }} {{ p.unit || '' }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums text-ink-secondary">
              {{ p.retail_price > 0 ? formatVND(p.retail_price) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums font-semibold text-royal-700">
              {{ p.wholesale_normal_price > 0 ? formatVND(p.wholesale_normal_price) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right tabular-nums hidden md:table-cell">
              <div class="text-ink-primary font-medium">{{ rev30(p) }}</div>
              <div class="text-[11px] text-ink-secondary">· {{ qty30(p) }}</div>
            </td>
            <td class="px-3 py-2.5 text-right">
              <button
                @click.stop="emit('add', p)"
                :disabled="!p.wholesale_price || p.wholesale_price <= 0 || (p.stock ?? 0) <= 0"
                class="h-8 w-8 rounded-btn border border-royal-700 text-royal-700 hover:bg-royal-50 text-base font-bold leading-none transition disabled:opacity-30 disabled:cursor-not-allowed"
                title="Thêm vào đơn"
              >
                +
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
