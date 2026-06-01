<script setup>
/**
 * ProductFinder.vue — CỘT 3 "Tìm sản phẩm" của màn Tạo đơn hàng (redesign).
 *
 * Nhiệm vụ: tìm SP theo tên/SKU/Barcode, lọc theo tồn kho + thương hiệu,
 * hiển thị giá theo 3 cấp KH (CTV / Cấp 1 / VIP) và cho phép thêm vào giỏ.
 * Component nằm trong 1 cột chiều cao cố định → ô tìm + tabs + filter dính
 * trên, danh sách card cuộn riêng (overflow-y-auto).
 */
import { ref, computed, watch, onMounted } from 'vue';
import { usePOSStore } from '../stores/pos';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';
import BrandFilterSelect from './BrandFilterSelect.vue';

const pos = usePOSStore();

// ── State ───────────────────────────────────────────────────────────────
const query = ref('');
const products = ref([]);
const loading = ref(false);
const brands = ref([]); // [{ id, name, activeProductCount }]
const brandId = ref(''); // id thương hiệu đang lọc ('' = tất cả)
const stockTab = ref('all'); // all | in_stock | out_of_stock

const searchInput = ref(null);
let debounceTimer = null;

// ── API ─────────────────────────────────────────────────────────────────
async function loadProducts() {
  loading.value = true;
  try {
    const { data } = await api.get('/sale-app/products/search', {
      params: {
        q: query.value,
        tier: pos.selectedTier,
        // backend nhận tên param `brand`; gửi id thương hiệu đang chọn.
        ...(brandId.value ? { brand: brandId.value } : {}),
      },
    });
    products.value = data.products || [];
  } catch {
    products.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadBrands() {
  try {
    const { data } = await api.get('/brands');
    brands.value = data.brands || data || [];
  } catch {
    brands.value = [];
  }
}

// Debounce ~300ms cho ô tìm.
watch(query, () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadProducts, 300);
});

// Đổi cấp KH → refetch để lấy giá đúng tier. Đổi thương hiệu → refetch.
watch(() => pos.selectedTier, loadProducts);
watch(brandId, loadProducts);

onMounted(() => {
  loadBrands();
  loadProducts(); // q rỗng = nạp danh sách mặc định
});

// ── Lọc client: theo chữ đang gõ (tức thì) + tab tồn kho ──────────────────
// Lọc text ngay trên list đã có → gõ tới đâu hiện gợi ý tới đó, KHÔNG chờ
// debounce/network. API (debounce 300ms) vẫn chạy nền để lấy đủ SP ngoài
// danh sách hiện tại.
const filteredProducts = computed(() => {
  let list = products.value;
  const q = query.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q),
    );
  }
  if (stockTab.value === 'in_stock') {
    list = list.filter((p) => (Number(p.stock) || 0) > 0);
  } else if (stockTab.value === 'out_of_stock') {
    list = list.filter((p) => (Number(p.stock) || 0) === 0);
  }
  return list;
});

const tabs = [
  { key: 'all', label: 'Tất cả' },
  { key: 'in_stock', label: 'Còn hàng' },
  { key: 'out_of_stock', label: 'Hết hàng' },
];

// ── Giá theo 3 cấp KH ─────────────────────────────────────────────────────
// Map tên cấp (tierName backend) → nhãn ngắn + key tier nội bộ của store.
// "CTV" → CTV (ctv), "Đại lý cấp 1" → Cấp 1 (dai_ly_cap_1),
// "Đại lý cấp 2 (VIP)" → VIP (dai_ly_cap_2).
const TIER_DEFS = [
  { label: 'CTV', tierKey: 'ctv', match: (n) => /ctv/i.test(n) },
  { label: 'Cấp 1', tierKey: 'dai_ly_cap_1', match: (n) => /cấp\s*1/i.test(n) },
  { label: 'VIP', tierKey: 'dai_ly_cap_2', match: (n) => /vip|cấp\s*2/i.test(n) },
];

// Trả về [{ label, tierKey, price }] theo đúng thứ tự CTV / Cấp 1 / VIP.
function tierPrices(product) {
  const tiers = Array.isArray(product.tiers) ? product.tiers : [];
  return TIER_DEFS.map((def) => {
    const found = tiers.find((t) => def.match(t.name || ''));
    return { label: def.label, tierKey: def.tierKey, price: found ? found.price : null };
  });
}

function isSelectedTier(tierKey) {
  return pos.selectedTier === tierKey;
}

// ── Thêm vào giỏ ──────────────────────────────────────────────────────────
function add(product) {
  // Bán sỉ cho phép bán trước/đặt hàng → SP hết hàng vẫn thêm được.
  // (Giỏ hàng sẽ hiện cảnh báo "Hết hàng/Vượt tồn" để sale biết.)
  pos.addProduct(product); // product đã có price = giá theo tier đang chọn
}

// ── Expose: focus ô tìm (màn cha gọi khi bấm F2) ───────────────────────────
function focusSearch() {
  searchInput.value?.focus();
  searchInput.value?.select?.();
}
defineExpose({ focusSearch });
</script>

<template>
  <div class="flex flex-col h-full bg-surface-50">
    <!-- Thanh tìm + filter (dính trên) -->
    <div class="shrink-0 p-3 bg-white border-b border-line-200 space-y-3">
      <!-- Ô tìm -->
      <div class="relative">
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          placeholder="Tìm tên SP, SKU, Barcode..."
          class="w-full h-11 pl-10 pr-3 rounded-lg border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm text-ink-primary"
        />
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-disabled"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      <!-- Filter: Thương hiệu + Danh mục (danh mục disabled — chờ backend) -->
      <div class="grid grid-cols-2 gap-2">
        <BrandFilterSelect v-model="brandId" :brands="brands" />
        <!--
          Danh mục: backend hiện KHÔNG có field category trên SP.
          Render dropdown disabled để đúng bố cục, KHÔNG làm chức năng giả.
          TODO(backend): bổ sung field category vào /sale-app/products/search
          rồi mở khoá dropdown này.
        -->
        <button
          type="button"
          disabled
          title="Lọc theo danh mục — chờ backend bổ sung field category"
          class="w-full h-10 px-3 rounded-lg border border-line-200 bg-surface-50 text-sm text-left flex items-center justify-between gap-2 text-ink-disabled cursor-not-allowed"
        >
          <span class="truncate">Tất cả danh mục</span>
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <!-- Tabs lọc theo tồn kho -->
      <div class="flex items-center gap-1 p-0.5 bg-surface-50 border border-line-200 rounded-lg">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          @click="stockTab = t.key"
          class="flex-1 h-8 rounded-md text-sm font-medium transition"
          :class="
            stockTab === t.key
              ? 'bg-royal-700 text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary'
          "
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- Danh sách card (cuộn riêng) -->
    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <!-- Loading skeleton -->
      <template v-if="loading && products.length === 0">
        <div
          v-for="i in 5"
          :key="i"
          class="bg-white border border-line-200 rounded-xl h-28 animate-pulse"
        ></div>
      </template>

      <!-- Empty -->
      <div
        v-else-if="filteredProducts.length === 0"
        class="text-center text-sm text-ink-secondary py-12"
      >
        {{ loading ? 'Đang tìm...' : 'Không có sản phẩm phù hợp' }}
      </div>

      <!-- Card sản phẩm -->
      <template v-else>
        <div
          v-for="p in filteredProducts"
          :key="p.id"
          @click="add(p)"
          class="relative bg-white border border-line-200 rounded-xl p-3 transition hover:border-royal-700 hover:shadow-md cursor-pointer"
        >
          <div class="flex items-start gap-3">
            <!-- Ảnh -->
            <div
              class="shrink-0 w-12 h-12 rounded-lg bg-surface-50 border border-line-200 overflow-hidden flex items-center justify-center"
            >
              <img
                v-if="p.mainImageUrl"
                :src="p.mainImageUrl"
                :alt="p.name"
                class="w-full h-full object-cover"
              />
              <svg
                v-else
                class="w-5 h-5 text-ink-disabled"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>

            <!-- Thông tin -->
            <div class="flex-1 min-w-0">
              <!-- Dòng 1: SKU + tên -->
              <div class="font-mono text-[10px] text-ink-secondary">{{ p.sku }}</div>
              <div class="font-medium text-sm text-ink-primary line-clamp-2 mt-0.5">
                {{ p.name }}
              </div>

              <!-- Tồn kho -->
              <div class="mt-1 text-[11px] font-medium">
                <span v-if="(Number(p.stock) || 0) > 0" class="text-emerald-600">
                  Tồn: {{ p.stock }}
                </span>
                <span v-else class="text-red-600">Hết hàng</span>
              </div>
            </div>

            <!-- Nút thêm -->
            <button
              type="button"
              @click.stop="add(p)"
              class="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition bg-royal-700 text-white hover:bg-royal-800"
              :title="(Number(p.stock) || 0) === 0 ? 'Hết hàng — bán trước' : 'Thêm vào đơn'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          <!-- Hàng giá theo 3 cấp (làm nổi cấp đang chọn của KH) -->
          <div class="mt-2.5 grid grid-cols-3 gap-1 pt-2 border-t border-line-200">
            <div
              v-for="tp in tierPrices(p)"
              :key="tp.tierKey"
              class="rounded-md px-1.5 py-1 text-center"
              :class="isSelectedTier(tp.tierKey) ? 'bg-royal-50' : ''"
            >
              <div
                class="text-[10px] leading-none"
                :class="isSelectedTier(tp.tierKey) ? 'text-royal-700 font-semibold' : 'text-ink-disabled'"
              >
                {{ tp.label }}
              </div>
              <div
                class="text-[11px] mt-0.5 leading-none tabular-nums"
                :class="
                  isSelectedTier(tp.tierKey)
                    ? 'text-royal-700 font-bold'
                    : 'text-ink-secondary font-medium'
                "
              >
                {{ tp.price != null ? formatVND(tp.price) : '—' }}
              </div>
            </div>
          </div>
        </div>
      </template>
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
