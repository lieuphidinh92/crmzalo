<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import KpiCard from '../components/KpiCard.vue';
import InventoryBatchDialog from '../components/InventoryBatchDialog.vue';
import { useInventory, expiryBadge, stockLevel } from '../composables/useInventory';

const {
  brands,
  products,
  total,
  summary,
  activeProductTotal,
  alertsLoading,
  listLoading,
  errorMsg,
  loadAlerts,
  loadBrands,
  loadProducts,
  rowsFromAlerts,
} = useInventory();

const chip = ref('all');
const q = ref('');
const brandId = ref('');
const page = ref(1);
const limit = ref(20);
const drillProductId = ref(null);

let debounceTimer = null;

const filterChips = [
  { key: 'all', label: 'Tất cả' },
  { key: 'low-stock', label: 'Cảnh báo tồn' },
  { key: 'near-expiry', label: 'Sắp hết HSD' },
  { key: 'expired', label: 'Đã hết HSD' },
];

// Use alerts buckets when chip is alert-type AND user has not narrowed
// by search/brand. Otherwise call catalog endpoint so the q+brand work.
const useAlertsBucket = computed(
  () => chip.value !== 'all' && !q.value.trim() && !brandId.value,
);

const rows = computed(() => {
  if (useAlertsBucket.value) {
    const all = rowsFromAlerts(chip.value);
    const start = (page.value - 1) * limit.value;
    return all.slice(start, start + limit.value);
  }
  return products.value;
});

const totalRows = computed(() => {
  if (useAlertsBucket.value) {
    return rowsFromAlerts(chip.value).length;
  }
  return total.value;
});

const totalPages = computed(() => Math.max(1, Math.ceil(totalRows.value / limit.value)));

const loading = computed(() => alertsLoading.value || listLoading.value);

async function reloadList() {
  if (useAlertsBucket.value) {
    return;
  }
  const filter = chip.value === 'all' ? '' : chip.value;
  await loadProducts({
    q: q.value.trim(),
    brand: brandId.value,
    filter,
    page: page.value,
    limit: limit.value,
  });
}

watch([chip, q, brandId], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reloadList, 250);
});
watch(page, reloadList);

onMounted(async () => {
  await Promise.all([loadAlerts(), loadBrands(), reloadList()]);
});

const totalActiveLabel = computed(() => {
  if (activeProductTotal.value !== null) return activeProductTotal.value.toLocaleString('vi-VN');
  return '—';
});

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

function badgeForRow(row) {
  // Catalog endpoint hands us `nearest_expiry` (a date) instead of a
  // days-left integer — convert on the fly so both data sources share
  // the same badge logic.
  if (row.nearest_days_left !== null && row.nearest_days_left !== undefined) {
    return expiryBadge(row.nearest_days_left);
  }
  if (row.nearest_expiry) {
    const days = Math.floor((new Date(row.nearest_expiry).getTime() - Date.now()) / 86_400_000);
    if (days < 90) return expiryBadge(days);
  }
  return null;
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1200px] mx-auto">
    <div class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Tồn kho</h1>
      <p class="text-xs text-ink-secondary mt-0.5">Tra cứu nhanh tồn kho và cảnh báo HSD</p>
    </div>

    <!-- KPI cards -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
      <KpiCard
        label="Tổng SP đang bán"
        :value="totalActiveLabel"
        icon="shopping-bag"
        icon-color="royal"
      />
      <KpiCard
        label="SP cảnh báo tồn"
        :value="summary.lowStockCount.toLocaleString('vi-VN')"
        icon="trending-up"
        icon-color="amber"
        :trend-label="summary.lowStockCount > 0 ? 'Tồn ≤ ngưỡng cảnh báo' : 'Tồn ổn định'"
      />
      <KpiCard
        label="Lô sắp hết HSD (<90d)"
        :value="summary.expiringCount.toLocaleString('vi-VN')"
        icon="coins"
        :icon-color="summary.expiredCount > 0 ? 'red' : 'amber'"
        :trend-label="summary.expiredCount > 0 ? `${summary.expiredCount} lô đã hết HSD` : ''"
      />
    </div>

    <!-- Filters -->
    <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
      <div class="grid lg:grid-cols-3 gap-3 mb-3">
        <div class="relative lg:col-span-2">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm SKU / tên sản phẩm..."
            class="w-full h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <select
          v-model="brandId"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
        >
          <option value="">Tất cả thương hiệu</option>
          <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </div>

      <div class="flex gap-2 flex-wrap">
        <button
          v-for="c in filterChips"
          :key="c.key"
          @click="chip = c.key"
          class="h-8 px-3 rounded-full text-xs font-semibold border transition"
          :class="
            chip === c.key
              ? 'bg-royal-700 text-white border-royal-700'
              : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
          "
        >
          {{ c.label }}
        </button>
      </div>

      <div v-if="useAlertsBucket && (q || brandId)" class="text-[11px] text-ink-disabled mt-2">
        Khi search/brand đang active, app tự chuyển sang chế độ catalog đầy đủ.
      </div>
    </div>

    <!-- List -->
    <div v-if="loading" class="space-y-2.5">
      <div
        v-for="i in 5"
        :key="i"
        class="bg-white border border-line-200 rounded-card h-20 animate-pulse"
      ></div>
    </div>

    <div
      v-else-if="errorMsg"
      class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm"
    >
      {{ errorMsg }}
      <button @click="reloadList" class="block mt-2 text-red-700 underline font-medium">
        Thử lại
      </button>
    </div>

    <div
      v-else-if="rows.length === 0"
      class="bg-white border border-line-200 rounded-card p-12 text-center"
    >
      <div class="text-5xl mb-3">📦</div>
      <div class="font-semibold text-ink-primary">Chưa có dữ liệu tồn kho</div>
      <p class="text-xs text-ink-secondary mt-1">
        {{
          chip === 'low-stock'
            ? 'Không có SP nào dưới ngưỡng cảnh báo. Tồn kho ổn định.'
            : chip === 'near-expiry'
            ? 'Không có lô nào sắp hết HSD trong 90 ngày tới.'
            : chip === 'expired'
            ? 'Không có lô nào đã hết HSD còn tồn.'
            : 'Thử bỏ filter hoặc đổi từ khoá tìm.'
        }}
      </p>
    </div>

    <div v-else>
      <div class="space-y-2.5">
        <button
          v-for="row in rows"
          :key="row.id"
          @click="drillProductId = row.id"
          class="w-full text-left bg-white border border-line-200 rounded-card p-3 shadow-card hover:border-royal-700 transition flex items-center gap-3"
        >
          <!-- Image -->
          <div class="w-10 h-10 rounded-input bg-surface-soft overflow-hidden shrink-0 flex items-center justify-center text-ink-disabled">
            <img
              v-if="row.mainImageUrl"
              :src="row.mainImageUrl"
              :alt="row.name"
              class="w-full h-full object-cover"
            />
            <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM12 22V12" />
            </svg>
          </div>

          <!-- SKU + name -->
          <div class="flex-1 min-w-0">
            <div class="font-mono text-[11px] text-ink-secondary truncate">{{ row.sku }}</div>
            <div class="text-sm font-semibold text-ink-primary truncate">{{ row.name }}</div>
            <div class="flex gap-2 mt-1 flex-wrap">
              <span v-if="row.brand?.name" class="text-[10px] bg-royal-50 text-royal-700 px-2 py-0.5 rounded font-medium">
                {{ row.brand.name }}
              </span>
              <span
                v-if="badgeForRow(row)"
                class="text-[10px] font-semibold px-2 py-0.5 rounded"
                :class="badgeForRow(row).cls"
              >
                {{ badgeForRow(row).label }}
              </span>
            </div>
          </div>

          <!-- Stock -->
          <div class="text-right shrink-0">
            <div v-if="row.stock !== null && row.stock !== undefined" class="text-xl font-bold tabular-nums" :class="stockLevel(row.stock, row.warning_stock)">
              {{ row.stock }}
            </div>
            <div v-else class="text-xl font-bold text-ink-disabled tabular-nums">—</div>
            <div class="text-[10px] text-ink-secondary uppercase">
              {{ row.unit || 'Tồn' }}
            </div>
            <div v-if="row.warning_stock !== null && row.warning_stock !== undefined" class="text-[10px] text-ink-disabled mt-0.5">
              Cảnh báo: {{ row.warning_stock }}
            </div>
          </div>

          <svg class="w-4 h-4 text-ink-disabled shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-1.5">
        <button
          @click="page = Math.max(1, page - 1)"
          :disabled="page <= 1"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹
        </button>
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
        >
          {{ n }}
        </button>
        <button
          @click="page = Math.min(totalPages, page + 1)"
          :disabled="page >= totalPages"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>

    <InventoryBatchDialog
      :product-id="drillProductId"
      @close="drillProductId = null"
    />
  </div>
</template>
