<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import ProductCard from '../components/ProductCard.vue';
import ProductDetailDrawer from '../components/ProductDetailDrawer.vue';

const router = useRouter();
const pos = usePOSStore();

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

// Tier follows the currently-selected customer's policyTier when a draft
// is in progress; otherwise default to Đại lý cấp 2 VIP (rẻ nhất).
const tier = computed(() => pos.selectedCustomer?.policyTier || pos.selectedTier || 'dai_ly_cap_2');

const detailId = ref(null);
let debounceTimer = null;

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
          {{ total.toLocaleString('vi-VN') }} SP · bảng giá {{ tier === 'ctv' ? 'CTV' : tier === 'dai_ly_cap_1' ? 'Đại lý cấp 1' : 'Đại lý cấp 2 (VIP)' }}
        </p>
      </div>
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
        <select
          v-model="brandId"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
        >
          <option value="">Tất cả thương hiệu</option>
          <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <select
          v-model="sort"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
        >
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
            Sắp xếp: {{ opt.label }}
          </option>
        </select>
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

    <!-- Grid -->
    <div v-if="loading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      <div v-for="i in 10" :key="i" class="bg-white border border-line-200 rounded-card aspect-[3/5] animate-pulse"></div>
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
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <ProductCard
          v-for="(p, idx) in products"
          :key="p.id"
          :product="p"
          :rank="filter === 'bestseller' ? (page - 1) * limit + idx + 1 : 0"
          @open="detailId = $event.id"
          @add="addToCart"
        />
      </div>

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
    />
  </div>
</template>
