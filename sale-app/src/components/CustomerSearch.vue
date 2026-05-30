<script setup>
import { ref, watch } from 'vue';
import { api } from '../api/client';

const emit = defineEmits(['select', 'create-new']);

const query = ref('');
const results = ref([]);
const loading = ref(false);
const open = ref(false);
let debounceTimer = null;

async function doSearch(term) {
  loading.value = true;
  try {
    const { data } = await api.get('/sale-app/customers/search', { params: { q: term } });
    results.value = data.customers || [];
  } catch {
    results.value = [];
  } finally {
    loading.value = false;
  }
}

watch(query, (val) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => doSearch(val), 300);
});

function focus() {
  open.value = true;
  if (results.value.length === 0) doSearch('');
}

function pick(c) {
  emit('select', c);
  query.value = '';
  open.value = false;
}

function newCustomer() {
  emit('create-new');
  open.value = false;
}
</script>

<template>
  <div class="relative">
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input
          v-model="query"
          @focus="focus"
          @blur="setTimeout(() => (open = false), 200)"
          type="search"
          placeholder="Tìm KH theo tên / SĐT / mã KH (F4)"
          class="w-full h-11 pl-10 pr-3 rounded-xl border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white"
        />
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-disabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>
      <button
        @click="newCustomer"
        type="button"
        class="h-11 px-3 rounded-xl border border-line-300 hover:border-royal-700 hover:text-royal-700 text-sm text-ink-primary bg-white whitespace-nowrap"
      >
        + Tạo KH
      </button>
    </div>

    <div
      v-if="open"
      class="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-line-200 rounded-xl shadow-lg max-h-80 overflow-y-auto"
    >
      <div v-if="loading" class="p-3 text-sm text-ink-secondary text-center">Đang tìm...</div>
      <div v-else-if="results.length === 0" class="p-3 text-sm text-ink-secondary text-center">
        Không có khách hàng phù hợp
      </div>
      <button
        v-for="c in results"
        :key="c.id"
        @mousedown.prevent="pick(c)"
        type="button"
        class="w-full px-3 py-2.5 text-left hover:bg-surface-50 border-b border-line-200 last:border-0 transition"
      >
        <div class="font-medium text-ink-primary">{{ c.fullName || '—' }}</div>
        <div class="text-xs text-ink-secondary flex items-center gap-2">
          <span v-if="c.phone">📞 {{ c.phone }}</span>
          <span v-if="c.storeName">· {{ c.storeName }}</span>
          <span v-if="c.misaCustomerCode" class="font-mono">· {{ c.misaCustomerCode }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
