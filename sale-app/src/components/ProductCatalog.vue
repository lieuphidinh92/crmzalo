<script setup>
import { ref, watch, computed } from 'vue';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const props = defineProps({
  tier: { type: String, default: 'dai_ly_cap_1' },
});
const emit = defineEmits(['add']);

const query = ref('');
const products = ref([]);
const loading = ref(false);
let debounceTimer = null;

async function loadProducts() {
  loading.value = true;
  try {
    const { data } = await api.get('/sale-app/products/search', {
      params: { q: query.value, tier: props.tier },
    });
    products.value = data.products || [];
  } catch {
    products.value = [];
  } finally {
    loading.value = false;
  }
}

watch(query, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadProducts, 300);
});

watch(() => props.tier, loadProducts);

loadProducts();

function stockBadge(n) {
  if (n <= 0) return { text: 'Hết hàng', class: 'text-red-600' };
  if (n < 30) return { text: `Tồn: ${n}`, class: 'text-amber-600' };
  return { text: `Tồn: ${n}`, class: 'text-ink-secondary' };
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="relative mb-3">
      <input
        v-model="query"
        type="search"
        placeholder="Tìm SP theo SKU / tên (F3)"
        class="w-full h-11 pl-10 pr-3 rounded-xl border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white"
      />
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-disabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    </div>

    <div class="flex-1 overflow-y-auto -mx-1 px-1">
      <div v-if="loading && products.length === 0" class="grid grid-cols-2 gap-2">
        <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-xl h-28 animate-pulse"></div>
      </div>
      <div v-else-if="products.length === 0" class="text-center text-sm text-ink-secondary py-10">
        Không có sản phẩm phù hợp
      </div>
      <div v-else class="grid grid-cols-2 gap-2">
        <button
          v-for="p in products"
          :key="p.id"
          @click="emit('add', p)"
          type="button"
          class="bg-white border border-line-200 hover:border-royal-700 hover:shadow-md rounded-xl p-3 text-left transition group"
        >
          <div class="font-mono text-[10px] text-ink-secondary">{{ p.sku }}</div>
          <div class="font-medium text-sm text-ink-primary line-clamp-2 mt-0.5">{{ p.name }}</div>
          <div class="mt-2 flex items-baseline justify-between">
            <div class="font-bold text-royal-700 text-base">{{ formatVND(p.price) }}</div>
          </div>
          <div class="mt-1 flex items-center justify-between text-[11px]">
            <span :class="stockBadge(p.stock).class">{{ stockBadge(p.stock).text }}</span>
            <span v-if="p.priceTierName" class="text-ink-disabled truncate ml-1">{{ p.priceTierName }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
