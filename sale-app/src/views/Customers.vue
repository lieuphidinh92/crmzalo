<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '../api/client';
import CustomerListItem from '../components/CustomerListItem.vue';
import CustomerDetailDrawer from '../components/CustomerDetailDrawer.vue';
import NewCustomerDialog from '../components/NewCustomerDialog.vue';

const customers = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const loading = ref(false);
const errorMsg = ref('');

const q = ref('');
const tier = ref('');
const customerType = ref('');
const filter = ref('');
const sort = ref('recent');

const detailId = ref(null);
const showCreate = ref(false);
let debounceTimer = null;

const tierOptions = [
  { value: '', label: 'Tất cả bảng giá' },
  { value: 'ctv', label: 'CTV' },
  { value: 'dai_ly_cap_1', label: 'Đại lý cấp 1' },
  { value: 'dai_ly_cap_2', label: 'Đại lý cấp 2 (VIP)' },
];
const typeOptions = [
  { value: '', label: 'Tất cả loại KH' },
  { value: 'nha_thuoc', label: 'Nhà thuốc' },
  { value: 'si_online', label: 'Sỉ online' },
  { value: 'duoc_si', label: 'Dược sĩ' },
  { value: 'cua_hang_me_be', label: 'Cửa hàng mẹ bé' },
];
const sortOptions = [
  { value: 'recent', label: 'Mua gần nhất' },
  { value: 'name', label: 'Tên A → Z' },
  { value: 'newest', label: 'Mới thêm' },
  { value: 'debt', label: 'Công nợ cao' },
];
const filterChips = [
  { key: '', label: 'Tất cả' },
  { key: 'has_debt', label: 'Còn công nợ' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/customers', {
      params: {
        q: q.value,
        tier: tier.value,
        customerType: customerType.value,
        filter: filter.value,
        sort: sort.value,
        page: page.value,
        limit: limit.value,
      },
    });
    customers.value = data.customers || [];
    total.value = data.total ?? customers.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách khách hàng';
    customers.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

watch([q, tier, customerType, filter, sort], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
});
watch(page, load);

onMounted(load);

function onCreated(customer) {
  showCreate.value = false;
  // Drop the new customer in and open its detail.
  load();
  if (customer?.id) detailId.value = customer.id;
}

function onUpdated() {
  // Refresh the list row so name / tier / phone stay in sync.
  load();
}

const pageNumbers = computed(() => {
  const pages = [];
  const max = totalPages.value;
  const cur = page.value;
  if (max <= 7) {
    for (let i = 1; i <= max; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (cur > 3) pages.push('…');
  for (let i = Math.max(2, cur - 1); i <= Math.min(max - 1, cur + 1); i++) pages.push(i);
  if (cur < max - 2) pages.push('…');
  pages.push(max);
  return pages;
});
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Khách hàng</h1>
        <p class="text-xs text-ink-secondary mt-0.5">{{ total.toLocaleString('vi-VN') }} khách hàng</p>
      </div>
      <button
        @click="showCreate = true"
        class="h-10 px-4 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold shadow-pop flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Tạo KH
      </button>
    </div>

    <!-- Filters -->
    <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
      <div class="grid lg:grid-cols-4 gap-3 mb-3">
        <div class="relative lg:col-span-2">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm tên / SĐT / cửa hàng / mã KH..."
            class="w-full h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <select v-model="tier" class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
          <option v-for="o in tierOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="customerType" class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
          <option v-for="o in typeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex gap-2 flex-wrap">
          <button
            v-for="chip in filterChips"
            :key="chip.key"
            @click="filter = chip.key"
            class="h-8 px-3 rounded-full text-xs font-semibold border transition"
            :class="filter === chip.key ? 'bg-royal-700 text-white border-royal-700' : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'"
          >
            {{ chip.label }}
          </button>
        </div>
        <select v-model="sort" class="h-8 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-xs">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">Sắp xếp: {{ o.label }}</option>
        </select>
      </div>
    </div>

    <!-- List -->
    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-card h-20 animate-pulse"></div>
    </div>

    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <div v-else-if="customers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có khách hàng</div>
      <p class="text-xs text-ink-secondary mt-1">Thử bỏ filter hoặc tạo khách hàng mới.</p>
    </div>

    <div v-else>
      <div class="space-y-2.5">
        <CustomerListItem
          v-for="c in customers"
          :key="c.id"
          :customer="c"
          @open="detailId = $event.id"
        />
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-1.5">
        <button @click="page = Math.max(1, page - 1)" :disabled="page <= 1" class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
        <button
          v-for="(n, idx) in pageNumbers"
          :key="idx"
          @click="typeof n === 'number' && (page = n)"
          :disabled="typeof n !== 'number'"
          class="h-9 min-w-[36px] px-2 rounded-btn text-sm font-medium transition"
          :class="n === page ? 'bg-royal-700 text-white' : typeof n === 'number' ? 'border border-line-300 hover:border-royal-700 text-ink-primary' : 'text-ink-disabled'"
        >{{ n }}</button>
        <button @click="page = Math.min(totalPages, page + 1)" :disabled="page >= totalPages" class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">›</button>
      </div>
    </div>

    <!-- Detail drawer -->
    <CustomerDetailDrawer
      :customer-id="detailId"
      @close="detailId = null"
      @updated="onUpdated"
    />

    <!-- Create dialog -->
    <NewCustomerDialog
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />
  </div>
</template>
