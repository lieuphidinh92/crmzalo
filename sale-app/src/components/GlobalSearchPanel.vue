<script setup>
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';

const props = defineProps({
  query: { type: String, default: '' },
});

const emit = defineEmits(['close', 'select']);

const router = useRouter();
const products = ref([]);
const customers = ref([]);
const loading = ref(false);
const errMsg = ref('');

let debounceTimer = null;

watch(
  () => props.query,
  (q) => {
    clearTimeout(debounceTimer);
    const term = (q || '').trim();
    if (term.length < 2) {
      products.value = [];
      customers.value = [];
      loading.value = false;
      errMsg.value = '';
      return;
    }
    debounceTimer = setTimeout(() => fetchResults(term), 250);
  },
  { immediate: true },
);

async function fetchResults(term) {
  loading.value = true;
  errMsg.value = '';
  try {
    const [pRes, cRes] = await Promise.all([
      api.get('/sale-app/products/search', { params: { q: term } }),
      api.get('/sale-app/customers/search', { params: { q: term } }),
    ]);
    products.value = (pRes.data?.products || []).slice(0, 8);
    customers.value = (cRes.data?.customers || []).slice(0, 8);
  } catch (err) {
    errMsg.value = err.response?.data?.error || 'Không tải được kết quả';
    products.value = [];
    customers.value = [];
  } finally {
    loading.value = false;
  }
}

function pickProduct(p) {
  emit('select', { type: 'product', item: p });
  router.push('/products');
}

function pickCustomer(c) {
  emit('select', { type: 'customer', item: c });
  router.push('/customers');
}

function formatStock(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('vi-VN');
}
</script>

<template>
  <div
    class="absolute left-0 right-0 top-full mt-2 bg-white rounded-modal shadow-pop border border-line-200 max-h-96 overflow-y-auto z-40"
  >
    <div v-if="loading" class="p-4 text-sm text-ink-secondary flex items-center gap-2">
      <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 12a9 9 0 11-6.219-8.56" stroke-linecap="round" />
      </svg>
      Đang tìm...
    </div>

    <div v-else-if="errMsg" class="p-4 text-sm text-red-600">{{ errMsg }}</div>

    <div v-else-if="products.length === 0 && customers.length === 0" class="p-6 text-center text-sm text-ink-secondary">
      <div class="text-3xl mb-2">🔍</div>
      Không tìm thấy kết quả phù hợp
    </div>

    <div v-else class="py-2">
      <!-- Products -->
      <div v-if="products.length > 0">
        <div class="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-soft">
          Sản phẩm ({{ products.length }})
        </div>
        <button
          v-for="p in products"
          :key="`p-${p.id}`"
          @click="pickProduct(p)"
          class="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-surface-soft text-left transition"
        >
          <div class="w-9 h-9 rounded-input bg-royal-50 flex items-center justify-center shrink-0">
            <svg class="w-4 h-4 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 7L12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-ink-primary truncate">{{ p.name }}</div>
            <div class="text-xs text-ink-secondary flex items-center gap-2 mt-0.5">
              <span class="font-mono">{{ p.sku }}</span>
              <span v-if="p.brand?.name">· {{ p.brand.name }}</span>
            </div>
          </div>
          <div class="text-xs text-ink-secondary shrink-0">
            Tồn: <span class="font-bold text-ink-primary">{{ formatStock(p.stock) }}</span>
          </div>
        </button>
      </div>

      <!-- Customers -->
      <div v-if="customers.length > 0" :class="products.length > 0 ? 'mt-1' : ''">
        <div class="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-soft">
          Khách hàng ({{ customers.length }})
        </div>
        <button
          v-for="c in customers"
          :key="`c-${c.id}`"
          @click="pickCustomer(c)"
          class="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-surface-soft text-left transition"
        >
          <div class="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0 text-amber-700 font-bold text-xs">
            {{ (c.fullName || '?').slice(0, 1).toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-ink-primary truncate">{{ c.fullName }}</div>
            <div class="text-xs text-ink-secondary flex items-center gap-2 mt-0.5 truncate">
              <span v-if="c.phone">{{ c.phone }}</span>
              <span v-if="c.storeName">· {{ c.storeName }}</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
