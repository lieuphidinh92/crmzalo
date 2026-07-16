<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useImports } from '../composables/useImports';

const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const {
  list,
  listLoading,
  listError,
  suppliers,
  loadList,
  loadSuppliers,
  formatVND,
  formatDateVN,
} = useImports();

const status = ref('');
const supplierId = ref('');
const from = ref('');
const to = ref('');

const statusFilters = [
  { key: '', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã chốt' },
];

let debounceTimer = null;

async function reloadList() {
  if (!isAdmin.value) return;
  await loadList({
    status: status.value,
    supplierId: supplierId.value,
    from: from.value,
    to: to.value,
  });
}

watch([status, supplierId, from, to], () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reloadList, 250);
});

onMounted(async () => {
  if (!isAdmin.value) return;
  await Promise.all([loadSuppliers(), reloadList()]);
});

function supplierName(imp) {
  return imp.supplier?.name || imp.supplierName || '—';
}

function importDate(imp) {
  return imp.importDate || imp.import_date || imp.createdAt || imp.created_at;
}

function grandTotal(imp) {
  return imp.grandTotal ?? imp.grand_total ?? 0;
}

function statusBadge(s) {
  if (s === 'confirmed') return { label: 'Đã chốt', cls: 'bg-emerald-100 text-emerald-700' };
  if (s === 'draft') return { label: 'Nháp', cls: 'bg-amber-100 text-amber-700' };
  return { label: s || '—', cls: 'bg-gray-100 text-gray-700' };
}

function openImport(id) {
  router.push('/imports/' + id);
}

function createNew() {
  router.push('/imports/new');
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1200px] mx-auto">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Nhập kho</h1>
        <p class="text-xs text-ink-secondary mt-0.5">Quản lý phiếu nhập hàng từ nhà cung cấp</p>
      </div>
      <button
        v-if="isAdmin"
        @click="createNew"
        class="shrink-0 h-10 px-4 rounded-btn bg-royal-700 text-white text-sm font-semibold hover:bg-royal-800 transition flex items-center gap-1.5"
      >
        <span class="text-lg leading-none">＋</span>
        <span class="hidden sm:inline">Tạo phiếu nhập</span>
        <span class="sm:hidden">Tạo</span>
      </button>
    </div>

    <!-- Member: không có quyền -->
    <div
      v-if="!isAdmin"
      class="bg-white border border-line-200 rounded-card p-12 text-center"
    >
      <div class="text-5xl mb-3">🔒</div>
      <div class="font-semibold text-ink-primary">Chức năng dành cho quản lý</div>
      <p class="text-xs text-ink-secondary mt-1">
        Chỉ chủ cửa hàng / quản lý mới xem và tạo được phiếu nhập kho.
      </p>
    </div>

    <template v-else>
      <!-- Filters -->
      <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
        <div class="grid lg:grid-cols-3 gap-3 mb-3">
          <select
            v-model="supplierId"
            class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          >
            <option value="">Tất cả nhà cung cấp</option>
            <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <input
            v-model="from"
            type="date"
            class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          />
          <input
            v-model="to"
            type="date"
            class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          />
        </div>

        <div class="flex gap-2 flex-wrap">
          <button
            v-for="f in statusFilters"
            :key="f.key"
            @click="status = f.key"
            class="h-8 px-3 rounded-full text-xs font-semibold border transition"
            :class="
              status === f.key
                ? 'bg-royal-700 text-white border-royal-700'
                : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
            "
          >
            {{ f.label }}
          </button>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="listLoading" class="space-y-2.5">
        <div
          v-for="i in 5"
          :key="i"
          class="bg-white border border-line-200 rounded-card h-20 animate-pulse"
        ></div>
      </div>

      <!-- Error -->
      <div
        v-else-if="listError"
        class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm"
      >
        {{ listError }}
        <button @click="reloadList" class="block mt-2 text-red-700 underline font-medium">
          Thử lại
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="list.length === 0"
        class="bg-white border border-line-200 rounded-card p-12 text-center"
      >
        <div class="text-5xl mb-3">📦</div>
        <div class="font-semibold text-ink-primary">Chưa có phiếu nhập nào</div>
        <p class="text-xs text-ink-secondary mt-1">
          Bấm "Tạo phiếu nhập" để nhập hàng từ nhà cung cấp.
        </p>
      </div>

      <!-- List -->
      <div v-else class="space-y-2.5">
        <button
          v-for="imp in list"
          :key="imp.id"
          @click="openImport(imp.id)"
          class="w-full text-left bg-white border border-line-200 rounded-card p-3 shadow-card hover:border-royal-700 transition flex items-center gap-3"
        >
          <!-- Icon -->
          <div class="w-10 h-10 rounded-input bg-surface-soft shrink-0 flex items-center justify-center text-xl">
            📥
          </div>

          <!-- Code + supplier -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-mono text-[11px] text-ink-secondary truncate">
                {{ imp.importCode || imp.import_code || '—' }}
              </span>
              <span
                class="text-[10px] font-semibold px-2 py-0.5 rounded shrink-0"
                :class="statusBadge(imp.status).cls"
              >
                {{ statusBadge(imp.status).label }}
              </span>
            </div>
            <div class="text-sm font-semibold text-ink-primary truncate">
              {{ supplierName(imp) }}
            </div>
            <div class="text-[11px] text-ink-secondary mt-0.5">
              {{ formatDateVN(importDate(imp)) }}
            </div>
          </div>

          <!-- Total -->
          <div class="text-right shrink-0">
            <div class="text-base lg:text-lg font-bold tabular-nums text-ink-primary">
              {{ formatVND(grandTotal(imp)) }}
            </div>
            <div class="text-[10px] text-ink-secondary uppercase">Tổng tiền</div>
          </div>

          <svg class="w-4 h-4 text-ink-disabled shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </template>
  </div>
</template>
