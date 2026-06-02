<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import { tierLabel } from '../composables/useFormat';
import ProductCard from '../components/ProductCard.vue';
import ProductTable from '../components/ProductTable.vue';
import ProductDetailDrawer from '../components/ProductDetailDrawer.vue';
import BrandFilterSelect from '../components/BrandFilterSelect.vue';
import ProductImportDialog from '../components/ProductImportDialog.vue';

const router = useRouter();
const pos = usePOSStore();
const auth = useAuthStore();

const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const products = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(24);
const loading = ref(false);
const errorMsg = ref('');

const q = ref('');
const filter = ref('');
const sort = ref('name');
const brandId = ref('');
const brands = ref([]);

// Tier theo policyTier của KH đang chọn (nếu có), nếu không mặc định "1 thùng".
const tier = computed(() => pos.selectedCustomer?.policyTier || pos.selectedTier || 'thung_1');

const detailId = ref(null);
let debounceTimer = null;

const viewMode = ref(localStorage.getItem('productViewMode') || 'grid');
watch(viewMode, (v) => {
  localStorage.setItem('productViewMode', v);
});

// Excel export / bulk import (admin only)
const exporting = ref(false);
const exportError = ref('');
const showImport = ref(false);

async function exportExcel() {
  if (exporting.value) return;
  exporting.value = true;
  exportError.value = '';
  try {
    const { data } = await api.get('/products/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'san-pham.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value = err.response?.status === 403 ? 'Bạn không có quyền xuất file.' : 'Xuất Excel thất bại, thử lại.';
  } finally {
    exporting.value = false;
  }
}

// When media/docs are edited in the drawer, refresh the list so thumbnails stay in sync.
function onProductUpdated(updated) {
  if (!updated?.id) return;
  const item = products.value.find((p) => p.id === updated.id);
  if (item && 'mainImageUrl' in updated) {
    item.mainImageUrl = updated.mainImageUrl;
  }
}

const filterChips = [
  { key: '', label: 'Tất cả' },
  { key: 'bestseller', label: 'Bán chạy' },
  { key: 'low-stock', label: 'Sắp hết' },
  { key: 'near-expiry', label: 'Cận date' },
  { key: 'promotion', label: 'Khuyến mãi' },
];

const sortOptions = [
  { value: 'name', label: 'Tên A → Z' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'price', label: 'Giá thấp → cao' },
  { value: 'stock', label: 'Tồn nhiều → ít' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

async function loadBrands() {
  try {
    const { data } = await api.get('/brands');
    brands.value = data.brands || data || [];
  } catch {
    brands.value = [];
  }
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/products', {
      params: {
        q: q.value,
        brand: brandId.value,
        filter: filter.value,
        sort: sort.value,
        page: page.value,
        limit: limit.value,
        tier: tier.value,
      },
    });
    products.value = data.products || [];
    total.value = data.total ?? products.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được sản phẩm';
    products.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

watch([q, filter, sort, brandId], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
});

watch(page, load);
watch(tier, load);

onMounted(async () => {
  await loadBrands();
  await load();
});

function addToCart(product) {
  pos.addProduct({
    id: product.id,
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    stock: product.stock,
    nearest_expiry: product.nearest_expiry,
    price: product.wholesale_price,
    priceTierId: product.wholesale_price_tier_id,
    priceTierName: product.wholesale_tier,
  });
  // Subtle feedback — drawer closes if opened
  detailId.value = null;
}

function goToCart() {
  router.push('/pos');
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
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1400px] mx-auto">
    <!-- Header row -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Sản phẩm</h1>
        <p class="text-xs text-ink-secondary mt-0.5">
          {{ total.toLocaleString('vi-VN') }} SP · bảng giá {{ tierLabel(tier) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="isAdmin"
          @click="exportExcel"
          :disabled="exporting"
          class="h-10 px-3 lg:px-4 rounded-btn border border-line-300 hover:border-royal-700 text-ink-primary text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Xuất danh sách sản phẩm ra Excel"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span class="hidden sm:inline">{{ exporting ? 'Đang xuất...' : 'Xuất Excel' }}</span>
          <span class="sm:hidden">{{ exporting ? '...' : 'Xuất' }}</span>
        </button>
        <button
          v-if="isAdmin"
          @click="showImport = true"
          class="h-10 px-3 lg:px-4 rounded-btn border border-line-300 hover:border-royal-700 text-ink-primary text-sm font-semibold flex items-center gap-2"
          title="Nhập sản phẩm hàng loạt từ Excel"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span class="hidden sm:inline">Nhập Excel</span>
          <span class="sm:hidden">Nhập</span>
        </button>
        <button
          v-if="isAdmin"
          @click="router.push('/products/brands')"
          class="h-10 px-3 lg:px-4 rounded-btn border border-line-300 hover:border-royal-700 text-ink-primary text-sm font-semibold flex items-center gap-2"
          title="Quản lý NCC / Thương hiệu"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <span class="hidden sm:inline">NCC / Thương hiệu</span>
          <span class="sm:hidden">NCC</span>
        </button>
        <button
          v-if="pos.items.length"
          @click="goToCart"
          class="relative h-10 px-4 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold shadow-pop flex items-center gap-2"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>
          </svg>
          Giỏ ({{ pos.itemCount }})
        </button>
      </div>
    </div>

    <!-- Export error (light) -->
    <div v-if="exportError" class="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {{ exportError }}
    </div>

    <!-- Search + Sort + Brand row -->
    <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
      <div class="grid lg:grid-cols-3 gap-3 mb-3">
        <div class="relative lg:col-span-1">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm SKU / tên sản phẩm..."
            class="w-full h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </div>
        <BrandFilterSelect v-model="brandId" :brands="brands" />
        <div class="flex gap-2">
          <select
            v-model="sort"
            class="flex-1 h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
          >
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              Sắp xếp: {{ opt.label }}
            </option>
          </select>
          <!-- View mode toggle -->
          <div class="flex h-10 rounded-input border border-line-300 overflow-hidden shrink-0">
            <button
              type="button"
              @click="viewMode = 'grid'"
              class="w-10 flex items-center justify-center transition"
              :class="viewMode === 'grid' ? 'bg-royal-700 text-white' : 'bg-white text-ink-secondary hover:text-royal-700'"
              title="Xem dạng lưới"
              aria-label="Xem dạng lưới"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              type="button"
              @click="viewMode = 'list'"
              class="w-10 flex items-center justify-center transition border-l border-line-300"
              :class="viewMode === 'list' ? 'bg-royal-700 text-white' : 'bg-white text-ink-secondary hover:text-royal-700'"
              title="Xem dạng dòng"
              aria-label="Xem dạng dòng"
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/>
                <line x1="8" y1="12" x2="21" y2="12"/>
                <line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/>
                <line x1="3" y1="12" x2="3.01" y2="12"/>
                <line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter chips -->
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="chip in filterChips"
          :key="chip.key"
          @click="filter = chip.key"
          class="h-8 px-3 rounded-full text-xs font-semibold border transition"
          :class="
            filter === chip.key
              ? 'bg-royal-700 text-white border-royal-700'
              : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
          "
        >
          {{ chip.label }}
        </button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading && viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      <div v-for="i in 10" :key="i" class="bg-white border border-line-200 rounded-card aspect-[3/5] animate-pulse"></div>
    </div>
    <div v-else-if="loading" class="bg-white border border-line-200 rounded-card shadow-card p-3 space-y-2.5">
      <div v-for="i in 10" :key="i" class="h-10 bg-surface-soft animate-pulse rounded"></div>
    </div>

    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <div v-else-if="products.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM12 22V12"/>
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có sản phẩm</div>
      <p class="text-xs text-ink-secondary mt-1">Thử bỏ filter hoặc đổi từ khoá tìm.</p>
    </div>

    <div v-else>
      <div v-if="viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <ProductCard
          v-for="(p, idx) in products"
          :key="p.id"
          :product="p"
          :rank="filter === 'bestseller' ? (page - 1) * limit + idx + 1 : 0"
          @open="detailId = $event.id"
          @add="addToCart"
        />
      </div>

      <ProductTable
        v-else
        :products="products"
        :page="page"
        :limit="limit"
        @open="detailId = $event.id"
        @add="addToCart"
      />

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="mt-6 flex items-center justify-center gap-1.5">
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

    <!-- Detail drawer -->
    <ProductDetailDrawer
      :product-id="detailId"
      :tier="tier"
      @close="detailId = null"
      @add="addToCart"
      @updated="onProductUpdated"
    />

    <!-- Bulk import dialog (admin) -->
    <ProductImportDialog
      v-if="showImport"
      @close="showImport = false"
      @done="load"
    />
  </div>
</template>
