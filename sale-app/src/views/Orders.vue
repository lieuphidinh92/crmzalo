<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import {
  formatVND,
  statusLabel,
  statusColor,
  formatDateTimeVN,
  formatRelativeTime,
} from '../composables/useFormat';

const router = useRouter();

const orders = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const loading = ref(false);
const errorMsg = ref('');

const q = ref('');
const status = ref('');
const range = ref('30'); // 7 | 30 | 90 | all

let debounceTimer = null;

// Chip key → raw status values sent to the API. Legacy MISA rows carry
// `paid`/`shipped`; fold them into the matching modern chip so old orders
// still show under the right filter.
const statusChips = [
  { key: '', label: 'Tất cả', api: '' },
  { key: 'draft', label: 'Nháp', api: 'draft' },
  { key: 'confirmed', label: 'Đã xác nhận', api: 'confirmed' },
  { key: 'packing', label: 'Đóng gói', api: 'packing' },
  { key: 'shipping', label: 'Đang giao', api: 'shipping,shipped' },
  { key: 'completed', label: 'Hoàn tất', api: 'completed,paid' },
  { key: 'cancelled', label: 'Huỷ', api: 'cancelled' },
];

const rangeOptions = [
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
  { value: '90', label: '90 ngày qua' },
  { value: 'all', label: 'Tất cả' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

function fromDate() {
  if (range.value === 'all') return '';
  const days = parseInt(range.value);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const apiStatus = statusChips.find((c) => c.key === status.value)?.api ?? '';
    const params = {
      page: page.value,
      limit: limit.value,
    };
    if (apiStatus) params.status = apiStatus;
    if (q.value.trim()) params.search = q.value.trim();
    const from = fromDate();
    if (from) params.from = from;

    const { data } = await api.get('/orders', { params });
    orders.value = data.orders || [];
    total.value = data.total ?? orders.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được đơn hàng';
    orders.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

watch([q, status, range], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
});

watch(page, load);

onMounted(load);

function totalOf(o) {
  return o.totalAmountValue ?? o.totalAmount ?? 0;
}

function openOrder(o) {
  router.push(`/orders/${o.id}`);
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
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1280px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Đơn hàng</h1>
        <p class="text-xs text-ink-secondary mt-0.5">{{ total.toLocaleString('vi-VN') }} đơn</p>
      </div>
      <button
        @click="router.push('/pos')"
        class="h-10 px-4 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold shadow-pop flex items-center gap-2"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Tạo đơn
      </button>
    </div>

    <!-- Search + range + chips -->
    <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
      <div class="grid lg:grid-cols-3 gap-3 mb-3">
        <div class="relative lg:col-span-2">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm mã đơn / tên KH / SĐT..."
            class="w-full h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <select
          v-model="range"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
        >
          <option v-for="opt in rangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div class="flex gap-2 flex-wrap">
        <button
          v-for="chip in statusChips"
          :key="chip.key"
          @click="status = chip.key"
          class="h-8 px-3 rounded-full text-xs font-semibold border transition"
          :class="
            status === chip.key
              ? 'bg-royal-700 text-white border-royal-700'
              : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
          "
        >
          {{ chip.label }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="h-[68px] bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="orders.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Chưa có đơn nào</div>
      <p class="text-xs text-ink-secondary mt-1">Thử đổi bộ lọc, khoảng thời gian hoặc từ khoá.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2">
      <button
        v-for="o in orders"
        :key="o.id"
        @click="openOrder(o)"
        class="w-full bg-white border border-line-200 rounded-card p-3.5 shadow-card hover:border-royal-700 transition text-left flex items-center gap-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-ink-secondary">{{ o.orderCode }}</span>
            <span
              class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded"
              :class="statusColor(o.statusNormalized || o.status)"
            >
              {{ statusLabel(o.statusNormalized || o.status) }}
            </span>
          </div>
          <div class="text-sm font-semibold text-ink-primary truncate mt-0.5">
            {{ o.contact?.fullName || '—' }}
          </div>
          <div class="text-[11px] text-ink-secondary truncate">
            <span v-if="o.contact?.storeName">{{ o.contact.storeName }} · </span>
            <span :title="formatDateTimeVN(o.orderDate || o.createdAt)">
              {{ formatRelativeTime(o.orderDate || o.createdAt) }}
            </span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-sm font-bold text-royal-700">{{ formatVND(totalOf(o)) }}</div>
          <div
            v-if="(o.debtAmountValue ?? 0) > 0"
            class="text-[10px] text-red-600 font-medium mt-0.5"
          >
            Nợ {{ formatVND(o.debtAmountValue) }}
          </div>
        </div>
        <svg class="w-4 h-4 text-ink-disabled shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pt-4 flex items-center justify-center gap-1.5">
        <button
          @click="page = Math.max(1, page - 1)"
          :disabled="page <= 1"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >‹</button>
        <button
          v-for="(n, idx) in pageNumbers"
          :key="idx"
          @click="typeof n === 'number' && (page = n)"
          :disabled="typeof n !== 'number'"
          class="h-9 min-w-[36px] px-2 rounded-btn text-sm font-medium transition"
          :class="
            n === page
              ? 'bg-royal-700 text-white'
              : typeof n === 'number'
              ? 'border border-line-300 hover:border-royal-700 text-ink-primary'
              : 'text-ink-disabled'
          "
        >{{ n }}</button>
        <button
          @click="page = Math.min(totalPages, page + 1)"
          :disabled="page >= totalPages"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >›</button>
      </div>
    </div>
  </div>
</template>
