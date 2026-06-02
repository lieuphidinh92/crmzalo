<script setup>
import { ref, watch, computed } from 'vue';
import { api } from '../api/client';
import { formatVND, formatDateVN } from '../composables/useFormat';
import { useAuthStore } from '../stores/auth';

const props = defineProps({
  productId: { type: String, default: null },
  tier: { type: String, default: 'thung_1' },
});
const emit = defineEmits(['close', 'add', 'updated']);

const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const loading = ref(false);
const errorMsg = ref('');
const product = ref(null);
const activeTab = ref('info');

// ---- Mode ----
const editing = ref(false);

// ---- Canonical tier names (nhóm giá theo thùng, từ 1/6/2026) ----
// Lưu ý: mức "10 thùng" lấy theo bảng giá Excel, chưa sửa ở đây (sửa 3 mức dưới).
const TIER_RETAIL = '<1 thùng';
const TIER_CAP1 = '1 thùng';
const TIER_CAP2 = '5 thùng';

// ---- Doc categories ----
const DOC_CATEGORIES = [
  { key: 'catalog', label: 'Catalog sản phẩm' },
  { key: 'price_policy', label: 'Bảng giá đại lý & chính sách thưởng quý' },
  { key: 'product_photos', label: 'Bộ ảnh sản phẩm' },
  { key: 'cbsp', label: 'Giấy CBSP' },
  { key: 'sales_material', label: 'Ảnh tư liệu chào hàng' },
];

// ---- Edit field state ----
const editSku = ref('');
const editBrandId = ref('');
const editAllowOversell = ref(false);

const editRetail = ref(0); // Bán lẻ → 'Lẻ niêm yết'
const editCap1 = ref(0); // 1 thùng
const editCap2 = ref(0); // 5 thùng
const fifoCost = ref(null);

const editDescription = ref('');
const descExpanded = ref(false);

const editMainImage = ref('');
const editGallery = ref([]); // up to 4 strings

// ---- Brands ----
const brands = ref([]);
const brandsLoaded = ref(false);

// ---- Per-section busy + message ----
const savingBasic = ref(false); // sku/brand/oversell (PUT /products/:id)
const basicMsg = ref(null);
const savingPrice = ref(false);
const syncingFifo = ref(false);
const priceMsg = ref(null);
const savingDesc = ref(false);
const descMsg = ref(null);
const savingMedia = ref(false);
const mediaMsg = ref(null);

// New-doc form state, keyed by category (+ 'other')
const docForms = ref({});
const docBusy = ref(null);
const docMsg = ref(null);

function tierPrice(name) {
  const t = (product.value?.tiers || []).find((x) => x.name === name);
  return t ? Number(t.price) || 0 : 0;
}

function resetEditState() {
  const p = product.value;
  // basic
  editSku.value = p?.sku || '';
  editBrandId.value = p?.brand?.id || '';
  editAllowOversell.value = !!p?.allow_oversell;
  // prices theo nhóm thùng
  editRetail.value = tierPrice(TIER_RETAIL);
  editCap1.value = tierPrice(TIER_CAP1);
  editCap2.value = tierPrice(TIER_CAP2);
  fifoCost.value = null;
  // description
  editDescription.value = p?.description || '';
  descExpanded.value = false;
  // media
  editMainImage.value = p?.mainImageUrl || '';
  editGallery.value = Array.isArray(p?.galleryUrls) ? [...p.galleryUrls].slice(0, 4) : [];
  // docs
  const forms = {};
  for (const c of DOC_CATEGORIES) forms[c.key] = { name: '', driveUrl: '' };
  forms.other = { name: '', driveUrl: '' };
  docForms.value = forms;
  // clear messages
  basicMsg.value = null;
  priceMsg.value = null;
  descMsg.value = null;
  mediaMsg.value = null;
  docMsg.value = null;
}

const docsByCategory = computed(() => {
  const map = {};
  for (const c of DOC_CATEGORIES) map[c.key] = [];
  map.other = [];
  for (const d of product.value?.marketingDocs || []) {
    const key = d.category && map[d.category] !== undefined ? d.category : 'other';
    map[key].push(d);
  }
  return map;
});

async function loadBrands() {
  if (brandsLoaded.value) return;
  try {
    const { data } = await api.get('/brands', { params: { activeOnly: '1' } });
    brands.value = Array.isArray(data.brands) ? data.brands : [];
    brandsLoaded.value = true;
  } catch {
    // non-fatal — dropdown just shows current value only
  }
}

async function enterEdit() {
  resetEditState();
  editing.value = true;
  if (isAdmin.value) loadBrands();
}

function cancelEdit() {
  editing.value = false;
  resetEditState();
}

function addGallerySlot() {
  if (editGallery.value.length >= 4) return;
  editGallery.value.push('');
}
function removeGallerySlot(idx) {
  editGallery.value.splice(idx, 1);
}

function intVal(n) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

// ── Save basic (sku / brand / oversell) — ADMIN, PUT /products/:id ──
async function saveBasic() {
  if (!props.productId || !isAdmin.value) return;
  savingBasic.value = true;
  basicMsg.value = null;
  try {
    const body = {
      sku: (editSku.value || '').trim(),
      brandId: editBrandId.value || null,
      allowOversell: !!editAllowOversell.value,
    };
    const { data } = await api.put(`/products/${props.productId}`, body);
    // backend returns full product (camelCase). Sync the fields we show.
    product.value.sku = data.sku ?? product.value.sku;
    product.value.allow_oversell = data.allowOversell ?? body.allowOversell;
    if (data.brand) product.value.brand = { id: data.brand.id, name: data.brand.name };
    else if (!body.brandId) product.value.brand = null;
    basicMsg.value = { type: 'success', text: 'Đã lưu thông tin sản phẩm' };
    emit('updated', { id: props.productId });
  } catch (err) {
    const code = err.response?.status;
    basicMsg.value = {
      type: 'error',
      text: code === 403 ? 'Chỉ admin' : err.response?.data?.error || 'Lưu thất bại',
    };
  } finally {
    savingBasic.value = false;
  }
}

// ── Sync FIFO suggestions — ADMIN, POST /sync-price-fifo ──
async function syncFifo() {
  if (!props.productId || !isAdmin.value) return;
  syncingFifo.value = true;
  priceMsg.value = null;
  try {
    const { data } = await api.post(`/sale-app/products/${props.productId}/sync-price-fifo`);
    fifoCost.value = data.fifo_cost ?? null;
    for (const s of data.suggestions || []) {
      if (s.tierName === TIER_RETAIL) editRetail.value = intVal(s.price);
      else if (s.tierName === TIER_CAP1) editCap1.value = intVal(s.price);
      else if (s.tierName === TIER_CAP2) editCap2.value = intVal(s.price);
    }
    priceMsg.value = { type: 'success', text: 'Đã điền gợi ý giá từ FIFO' };
  } catch (err) {
    const code = err.response?.status;
    if (code === 400) {
      priceMsg.value = { type: 'error', text: err.response?.data?.error || 'Chưa có lô tồn để tính giá vốn' };
    } else {
      priceMsg.value = {
        type: 'error',
        text: code === 403 ? 'Chỉ admin' : err.response?.data?.error || 'Đồng bộ giá thất bại',
      };
    }
  } finally {
    syncingFifo.value = false;
  }
}

// ── Save prices — ADMIN, PUT /sale-app/products/:id/prices ──
async function savePrices() {
  if (!props.productId || !isAdmin.value) return;
  savingPrice.value = true;
  priceMsg.value = null;
  try {
    const prices = [
      { tierName: TIER_RETAIL, price: intVal(editRetail.value) },
      { tierName: TIER_CAP1, price: intVal(editCap1.value) },
      { tierName: TIER_CAP2, price: intVal(editCap2.value) },
    ];
    const { data } = await api.put(`/sale-app/products/${props.productId}/prices`, { prices });
    if (Array.isArray(data.tiers)) product.value.tiers = data.tiers;
    priceMsg.value = { type: 'success', text: 'Đã lưu bảng giá' };
    emit('updated', { id: props.productId });
  } catch (err) {
    const code = err.response?.status;
    priceMsg.value = {
      type: 'error',
      text: code === 403 ? 'Chỉ admin' : err.response?.data?.error || 'Lưu giá thất bại',
    };
  } finally {
    savingPrice.value = false;
  }
}

// ── Save description — SALE + ADMIN, PUT /sale-app/products/:id/description ──
async function saveDescription() {
  if (!props.productId) return;
  savingDesc.value = true;
  descMsg.value = null;
  try {
    const { data } = await api.put(`/sale-app/products/${props.productId}/description`, {
      description: (editDescription.value || '').trim() || null,
    });
    product.value.description = data.description;
    editDescription.value = data.description || '';
    descMsg.value = { type: 'success', text: 'Đã lưu mô tả' };
  } catch (err) {
    descMsg.value = { type: 'error', text: err.response?.data?.error || 'Lưu mô tả thất bại' };
  } finally {
    savingDesc.value = false;
  }
}

// ── Save media — SALE + ADMIN, PUT /sale-app/products/:id/media ──
async function saveMedia() {
  if (!props.productId) return;
  savingMedia.value = true;
  mediaMsg.value = null;
  try {
    const gallery = editGallery.value.map((s) => (s || '').trim()).filter(Boolean).slice(0, 4);
    const main = (editMainImage.value || '').trim();
    const { data } = await api.put(`/sale-app/products/${props.productId}/media`, {
      mainImageUrl: main || null,
      galleryUrls: gallery,
    });
    product.value.mainImageUrl = data.mainImageUrl;
    product.value.galleryUrls = data.galleryUrls;
    editMainImage.value = data.mainImageUrl || '';
    editGallery.value = Array.isArray(data.galleryUrls) ? [...data.galleryUrls] : [];
    mediaMsg.value = { type: 'success', text: 'Đã lưu ảnh' };
    emit('updated', { id: props.productId, mainImageUrl: data.mainImageUrl });
  } catch (err) {
    mediaMsg.value = { type: 'error', text: err.response?.data?.error || 'Lưu ảnh thất bại' };
  } finally {
    savingMedia.value = false;
  }
}

async function addDoc(categoryKey) {
  const form = docForms.value[categoryKey];
  if (!form) return;
  const name = (form.name || '').trim();
  const driveUrl = (form.driveUrl || '').trim();
  if (!name || !driveUrl) {
    docMsg.value = { type: 'error', text: 'Nhập đủ tên và link tài liệu' };
    return;
  }
  docBusy.value = `add:${categoryKey}`;
  docMsg.value = null;
  try {
    const body = { name, driveUrl };
    if (categoryKey !== 'other') body.category = categoryKey;
    const { data } = await api.post(`/sale-app/products/${props.productId}/marketing-docs`, body);
    product.value.marketingDocs = data.marketingDocs;
    form.name = '';
    form.driveUrl = '';
    docMsg.value = { type: 'success', text: 'Đã thêm tài liệu' };
  } catch (err) {
    docMsg.value = { type: 'error', text: err.response?.data?.error || 'Thêm tài liệu thất bại' };
  } finally {
    docBusy.value = null;
  }
}

async function deleteDoc(doc) {
  if (!doc?.id) return;
  docBusy.value = `del:${doc.id}`;
  docMsg.value = null;
  try {
    const { data } = await api.delete(`/sale-app/products/${props.productId}/marketing-docs/${doc.id}`);
    product.value.marketingDocs = data.marketingDocs;
    docMsg.value = { type: 'success', text: 'Đã xoá tài liệu' };
  } catch (err) {
    docMsg.value = { type: 'error', text: err.response?.data?.error || 'Xoá tài liệu thất bại' };
  } finally {
    docBusy.value = null;
  }
}

function onImgError(e) {
  e.target.style.display = 'none';
}

watch(
  () => props.productId,
  async (id) => {
    editing.value = false;
    if (!id) {
      product.value = null;
      return;
    }
    loading.value = true;
    errorMsg.value = '';
    activeTab.value = 'info';
    try {
      const { data } = await api.get(`/sale-app/products/${id}`, { params: { tier: props.tier } });
      product.value = data.product;
      resetEditState();
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được chi tiết SP';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const noPrice = computed(() => !product.value?.wholesale_price || product.value.wholesale_price <= 0);

const tabs = [
  { key: 'info', label: 'Thông tin' },
  { key: 'price', label: 'Giá' },
  { key: 'batches', label: 'Lô / HSD' },
];

function batchLevel(days) {
  if (days === null || days === undefined) return { label: '—', cls: 'text-ink-secondary' };
  if (days < 0) return { label: `Hết HSD ${Math.abs(days)}d`, cls: 'text-red-700 bg-red-50' };
  if (days < 30) return { label: `Còn ${days}d`, cls: 'text-red-700 bg-red-50' };
  if (days < 90) return { label: `Còn ${days}d`, cls: 'text-amber-700 bg-amber-50' };
  return { label: `Còn ${days}d`, cls: 'text-green-700 bg-green-50' };
}
</script>

<template>
  <transition name="fade">
    <div v-if="productId" class="fixed inset-0 z-50 bg-black/40" @click.self="emit('close')">
      <transition name="slide">
        <div
          class="absolute right-0 top-0 bottom-0 w-full lg:w-[520px] bg-white shadow-pop flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="h-14 px-5 flex items-center justify-between border-b border-line-200 shrink-0">
            <div class="text-sm font-semibold text-ink-primary">
              {{ editing ? 'Chỉnh sửa sản phẩm' : 'Chi tiết sản phẩm' }}
            </div>
            <div class="flex items-center gap-1">
              <!-- Edit toggle (only in view mode, when a product is loaded) -->
              <button
                v-if="product && !loading && !editing"
                @click="enterEdit"
                class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
                aria-label="Chỉnh sửa"
                title="Chỉnh sửa"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
              <button
                @click="emit('close')"
                class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
                aria-label="Đóng"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-6 space-y-3">
              <div class="aspect-square bg-surface-soft animate-pulse rounded-card"></div>
              <div class="h-5 bg-surface-soft animate-pulse rounded"></div>
              <div class="h-4 bg-surface-soft animate-pulse rounded w-1/2"></div>
            </div>

            <div v-else-if="errorMsg" class="p-5 text-sm text-red-700 bg-red-50 border border-red-200 m-5 rounded-card">
              {{ errorMsg }}
            </div>

            <!-- ════════════════ EDIT MODE ════════════════ -->
            <div v-else-if="product && editing" class="p-5 space-y-6">
              <!-- (1) Thông tin cơ bản (admin) -->
              <section v-if="isAdmin" class="space-y-4">
                <h3 class="text-sm font-bold text-ink-primary">Thông tin cơ bản</h3>

                <!-- SKU -->
                <div>
                  <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Mã SP (SKU)</label>
                  <input
                    v-model="editSku"
                    type="text"
                    class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
                  />
                </div>

                <!-- Brand -->
                <div>
                  <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Thương hiệu</label>
                  <select
                    v-model="editBrandId"
                    class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm bg-white"
                  >
                    <option value="">— Không gắn brand —</option>
                    <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
                  </select>
                </div>

                <!-- Allow oversell -->
                <div class="flex items-center justify-between rounded-card border border-line-200 p-3">
                  <div>
                    <div class="text-sm font-medium text-ink-primary">Cho phép bán vượt tồn kho</div>
                    <div class="text-[11px] text-ink-secondary">Cho phép tạo đơn dù số lượng vượt tồn hiện có</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    :aria-checked="editAllowOversell"
                    @click="editAllowOversell = !editAllowOversell"
                    class="relative w-11 h-6 rounded-full transition shrink-0"
                    :class="editAllowOversell ? 'bg-royal-700' : 'bg-line-300'"
                  >
                    <span
                      class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      :class="editAllowOversell ? 'translate-x-5' : ''"
                    ></span>
                  </button>
                </div>

                <div v-if="basicMsg" class="text-xs font-medium" :class="basicMsg.type === 'success' ? 'text-green-700' : 'text-red-700'">
                  {{ basicMsg.text }}
                </div>
                <button
                  @click="saveBasic"
                  :disabled="savingBasic"
                  class="h-10 w-full rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {{ savingBasic ? 'Đang lưu...' : 'Lưu thông tin cơ bản' }}
                </button>
              </section>

              <!-- Note for sale on locked basic fields -->
              <section v-else class="rounded-card border border-line-200 p-3 space-y-2">
                <h3 class="text-sm font-bold text-ink-primary">Thông tin cơ bản</h3>
                <div class="text-xs text-ink-secondary">
                  Mã SP: <span class="font-mono text-ink-primary">{{ product.sku }}</span>
                  <span v-if="product.brand?.name"> · Brand: {{ product.brand.name }}</span>
                </div>
                <p class="text-[11px] text-ink-disabled">Mã SP, thương hiệu, giá, bán vượt tồn — chỉ admin.</p>
              </section>

              <!-- (2) Giá 3 cấp (admin) -->
              <section v-if="isAdmin" class="border-t border-line-200 pt-5 space-y-3">
                <h3 class="text-sm font-bold text-ink-primary">Bảng giá</h3>
                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="block text-[11px] font-semibold text-ink-secondary mb-1">&lt;1 thùng</label>
                    <input
                      v-model.number="editRetail"
                      type="number"
                      min="0"
                      class="w-full h-10 px-2 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-ink-secondary mb-1">1 thùng</label>
                    <input
                      v-model.number="editCap1"
                      type="number"
                      min="0"
                      class="w-full h-10 px-2 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-ink-secondary mb-1">5 thùng</label>
                    <input
                      v-model.number="editCap2"
                      type="number"
                      min="0"
                      class="w-full h-10 px-2 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div v-if="fifoCost !== null" class="text-[11px] text-ink-secondary">
                  Giá vốn FIFO: <span class="font-semibold text-ink-primary tabular-nums">{{ formatVND(fifoCost) }}</span>
                </div>

                <div v-if="priceMsg" class="text-xs font-medium" :class="priceMsg.type === 'success' ? 'text-green-700' : 'text-red-700'">
                  {{ priceMsg.text }}
                </div>

                <div class="flex gap-2">
                  <button
                    @click="syncFifo"
                    :disabled="syncingFifo"
                    type="button"
                    class="h-10 flex-1 rounded-btn border border-royal-700 text-royal-700 hover:bg-royal-50 text-sm font-semibold disabled:opacity-50"
                  >
                    {{ syncingFifo ? 'Đang đồng bộ...' : 'Đồng bộ giá FIFO' }}
                  </button>
                  <button
                    @click="savePrices"
                    :disabled="savingPrice"
                    class="h-10 flex-1 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {{ savingPrice ? 'Đang lưu...' : 'Lưu giá' }}
                  </button>
                </div>
              </section>

              <!-- (3) Mô tả chi tiết (sale + admin) -->
              <section class="border-t border-line-200 pt-5">
                <h3 class="text-sm font-bold text-ink-primary mb-2">Mô tả chi tiết</h3>

                <!-- Collapsed view -->
                <div
                  v-if="!descExpanded"
                  @click="descExpanded = true"
                  class="rounded-card border border-line-200 p-3 text-sm cursor-text hover:border-royal-700 transition"
                >
                  <div v-if="editDescription" class="text-ink-primary whitespace-pre-wrap leading-relaxed">{{ editDescription }}</div>
                  <div v-else class="text-ink-disabled">Chưa có mô tả chi tiết — bấm để thêm</div>
                </div>

                <!-- Expanded editor -->
                <div v-else class="space-y-2">
                  <textarea
                    v-model="editDescription"
                    rows="6"
                    placeholder="Nhập mô tả chi tiết sản phẩm..."
                    class="w-full px-3 py-2 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm leading-relaxed resize-y"
                  ></textarea>
                  <div v-if="descMsg" class="text-xs font-medium" :class="descMsg.type === 'success' ? 'text-green-700' : 'text-red-700'">
                    {{ descMsg.text }}
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click="descExpanded = false"
                      type="button"
                      class="h-9 px-4 rounded-btn border border-line-300 hover:border-line-400 text-ink-primary text-sm font-semibold"
                    >
                      Thu gọn
                    </button>
                    <button
                      @click="saveDescription"
                      :disabled="savingDesc"
                      class="h-9 flex-1 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {{ savingDesc ? 'Đang lưu...' : 'Lưu mô tả' }}
                    </button>
                  </div>
                </div>
              </section>

              <!-- (4) Ảnh sản phẩm (sale + admin) -->
              <section class="border-t border-line-200 pt-5">
                <h3 class="text-sm font-bold text-ink-primary mb-1">Ảnh sản phẩm</h3>
                <p class="text-[11px] text-ink-secondary mb-3">Dán link ảnh (Google Drive / URL). 1 ảnh đại diện + tối đa 4 ảnh phụ.</p>

                <!-- Main image -->
                <div class="mb-4">
                  <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Ảnh đại diện</label>
                  <div class="flex gap-3 items-start">
                    <div class="w-16 h-16 rounded-input bg-surface-soft border border-line-200 overflow-hidden shrink-0 flex items-center justify-center">
                      <img v-if="editMainImage" :src="editMainImage" alt="" class="w-full h-full object-cover" @error="onImgError" />
                      <span v-else class="text-[9px] text-ink-disabled">Chưa có</span>
                    </div>
                    <input
                      v-model="editMainImage"
                      type="url"
                      placeholder="Dán link ảnh đại diện..."
                      class="flex-1 h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
                    />
                  </div>
                </div>

                <!-- Gallery -->
                <div>
                  <label class="block text-xs font-semibold text-ink-secondary mb-1.5">Ảnh phụ ({{ editGallery.length }}/4)</label>
                  <div class="space-y-2">
                    <div v-for="(g, idx) in editGallery" :key="idx" class="flex gap-3 items-start">
                      <div class="w-12 h-12 rounded-input bg-surface-soft border border-line-200 overflow-hidden shrink-0 flex items-center justify-center">
                        <img v-if="editGallery[idx]" :src="editGallery[idx]" alt="" class="w-full h-full object-cover" @error="onImgError" />
                        <span v-else class="text-[8px] text-ink-disabled">—</span>
                      </div>
                      <input
                        v-model="editGallery[idx]"
                        type="url"
                        placeholder="Dán link ảnh phụ..."
                        class="flex-1 h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
                      />
                      <button
                        @click="removeGallerySlot(idx)"
                        type="button"
                        class="h-10 w-10 rounded-input border border-line-300 hover:border-red-400 hover:text-red-600 text-ink-secondary flex items-center justify-center shrink-0"
                        title="Xoá ảnh"
                      >
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                      </button>
                    </div>
                  </div>
                  <button
                    v-if="editGallery.length < 4"
                    @click="addGallerySlot"
                    type="button"
                    class="mt-2 h-9 px-3 rounded-btn border border-line-300 hover:border-royal-700 text-ink-primary text-xs font-semibold"
                  >
                    + Thêm ảnh phụ
                  </button>
                </div>

                <div v-if="mediaMsg" class="mt-3 text-xs font-medium" :class="mediaMsg.type === 'success' ? 'text-green-700' : 'text-red-700'">
                  {{ mediaMsg.text }}
                </div>
                <button
                  @click="saveMedia"
                  :disabled="savingMedia"
                  class="mt-3 h-10 w-full rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {{ savingMedia ? 'Đang lưu...' : 'Lưu ảnh' }}
                </button>
              </section>

              <!-- (5) Tài liệu gửi khách (sale + admin) -->
              <section class="border-t border-line-200 pt-5">
                <h3 class="text-sm font-bold text-ink-primary mb-1">Tài liệu gửi khách</h3>
                <p class="text-[11px] text-ink-secondary mb-3">Dán link tài liệu vào từng nhóm.</p>

                <div v-if="docMsg" class="mb-3 text-xs font-medium" :class="docMsg.type === 'success' ? 'text-green-700' : 'text-red-700'">
                  {{ docMsg.text }}
                </div>

                <div class="space-y-4">
                  <div
                    v-for="cat in [...DOC_CATEGORIES, { key: 'other', label: 'Khác' }]"
                    :key="cat.key"
                    class="rounded-card border border-line-200 p-3"
                  >
                    <div class="text-xs font-semibold text-ink-primary mb-2">{{ cat.label }}</div>

                    <ul v-if="docsByCategory[cat.key]?.length" class="space-y-1.5 mb-2">
                      <li v-for="d in docsByCategory[cat.key]" :key="d.id" class="flex items-center gap-2 text-sm">
                        <a :href="d.driveUrl" target="_blank" rel="noopener" class="flex-1 min-w-0 text-royal-700 hover:underline truncate">{{ d.name }}</a>
                        <button
                          @click="deleteDoc(d)"
                          :disabled="docBusy === `del:${d.id}`"
                          type="button"
                          class="h-7 w-7 rounded border border-line-300 hover:border-red-400 hover:text-red-600 text-ink-secondary flex items-center justify-center shrink-0 disabled:opacity-50"
                          title="Xoá"
                        >
                          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                        </button>
                      </li>
                    </ul>
                    <div v-else class="text-[11px] text-ink-disabled mb-2">Chưa có tài liệu</div>

                    <div v-if="docForms[cat.key]" class="space-y-1.5">
                      <input
                        v-model="docForms[cat.key].name"
                        type="text"
                        placeholder="Tên tài liệu"
                        class="w-full h-9 px-2.5 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm"
                      />
                      <div class="flex gap-1.5">
                        <input
                          v-model="docForms[cat.key].driveUrl"
                          type="url"
                          placeholder="Dán link..."
                          class="flex-1 h-9 px-2.5 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm"
                        />
                        <button
                          @click="addDoc(cat.key)"
                          :disabled="docBusy === `add:${cat.key}`"
                          type="button"
                          class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-xs font-semibold shrink-0 disabled:opacity-50"
                        >
                          Thêm
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <!-- ════════════════ VIEW MODE ════════════════ -->
            <div v-else-if="product">
              <!-- Hero image -->
              <div class="aspect-square bg-surface-soft border-b border-line-200 overflow-hidden">
                <img
                  v-if="product.mainImageUrl"
                  :src="product.mainImageUrl"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-ink-disabled">
                  {{ product.sku }}
                </div>
              </div>

              <!-- Header info -->
              <div class="p-5 border-b border-line-200">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-mono text-xs text-ink-secondary">{{ product.sku }}</span>
                  <span v-if="product.brand?.name" class="text-xs bg-royal-50 text-royal-700 px-2 py-0.5 rounded font-medium">
                    {{ product.brand.name }}
                  </span>
                </div>
                <h2 class="text-lg font-bold text-ink-primary leading-tight mb-3">{{ product.name }}</h2>

                <div v-if="noPrice" class="inline-block text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded">
                  Liên hệ giá
                </div>
                <template v-else>
                  <div class="text-2xl font-bold text-royal-700 tabular-nums leading-none">
                    {{ formatVND(product.wholesale_price) }}
                  </div>
                  <div v-if="product.wholesale_tier" class="text-[11px] text-ink-secondary mt-1">
                    {{ product.wholesale_tier }}
                  </div>
                  <div v-if="product.retail_price > product.wholesale_price" class="mt-2 flex gap-4 text-xs">
                    <div>
                      <div class="text-ink-secondary">&lt;1 thùng</div>
                      <div class="font-semibold text-ink-primary line-through tabular-nums">{{ formatVND(product.retail_price) }}</div>
                    </div>
                    <div>
                      <div class="text-ink-secondary">Lãi dự kiến</div>
                      <div class="font-semibold text-green-700 tabular-nums">{{ formatVND(product.estimated_profit) }}</div>
                    </div>
                  </div>
                </template>

                <!-- Stock + stats -->
                <div class="grid grid-cols-3 gap-3 mt-4">
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Tồn kho</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stock ?? 0 }}</div>
                  </div>
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Bán 30d</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stats?.quantity_sold_30d ?? 0 }}</div>
                  </div>
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Đơn 30d</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stats?.order_count_30d ?? 0 }}</div>
                  </div>
                </div>
              </div>

              <!-- Tabs -->
              <div class="border-b border-line-200 sticky top-0 bg-white z-10">
                <div class="flex">
                  <button
                    v-for="t in tabs"
                    :key="t.key"
                    @click="activeTab = t.key"
                    class="flex-1 h-12 text-sm font-medium transition border-b-2"
                    :class="
                      activeTab === t.key
                        ? 'text-royal-700 border-royal-700'
                        : 'text-ink-secondary border-transparent hover:text-ink-primary'
                    "
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>

              <!-- Tab content -->
              <div class="p-5 space-y-3">
                <!-- Info -->
                <div v-if="activeTab === 'info'" class="space-y-3 text-sm">
                  <div v-if="product.package_size" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Quy cách</div>
                    <div class="text-ink-primary">{{ product.package_size }}</div>
                  </div>
                  <div v-if="product.shelf_life_months" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">HSD (tháng)</div>
                    <div class="text-ink-primary">{{ product.shelf_life_months }}</div>
                  </div>
                  <div v-if="product.registration_number" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Số ĐK</div>
                    <div class="text-ink-primary font-mono text-xs">{{ product.registration_number }}</div>
                  </div>
                  <div v-if="product.main_use" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Công dụng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.main_use }}</div>
                  </div>
                  <div v-if="product.target_audience" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Đối tượng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.target_audience }}</div>
                  </div>
                  <div v-if="product.usage_method" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Cách dùng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.usage_method }}</div>
                  </div>

                  <!-- Description -->
                  <div v-if="product.description" class="pt-2 border-t border-line-200">
                    <div class="text-ink-secondary mb-1">Mô tả chi tiết</div>
                    <div class="text-ink-primary leading-relaxed whitespace-pre-wrap">{{ product.description }}</div>
                  </div>

                  <div
                    v-if="!product.main_use && !product.target_audience && !product.usage_method && !product.description"
                    class="text-ink-secondary text-center py-6"
                  >
                    Chưa có mô tả chi tiết
                  </div>
                </div>

                <!-- Prices -->
                <div v-if="activeTab === 'price'">
                  <div v-if="!product.tiers?.length" class="text-ink-secondary text-center py-6 text-sm">
                    Chưa có bảng giá. Liên hệ admin để cấu hình.
                  </div>
                  <ul v-else class="space-y-2">
                    <li
                      v-for="t in product.tiers"
                      :key="t.id"
                      class="flex items-center justify-between p-3 rounded-card border border-line-200"
                      :class="t.name === product.wholesale_tier ? 'border-royal-700 bg-royal-50' : ''"
                    >
                      <div>
                        <div class="text-sm font-semibold text-ink-primary">{{ t.name }}</div>
                        <div v-if="t.isDefault" class="text-[10px] text-ink-secondary">Mặc định</div>
                      </div>
                      <div class="text-base font-bold text-royal-700 tabular-nums">{{ formatVND(t.price) }}</div>
                    </li>
                  </ul>
                </div>

                <!-- Batches -->
                <div v-if="activeTab === 'batches'">
                  <div v-if="!product.batches?.length" class="text-ink-secondary text-center py-6 text-sm">
                    Không có lô nào trong kho
                  </div>
                  <ul v-else class="space-y-2">
                    <li v-for="b in product.batches" :key="b.id" class="p-3 rounded-card border border-line-200">
                      <div class="flex items-center justify-between mb-1.5">
                        <div class="text-sm font-mono font-semibold text-ink-primary">{{ b.batch_code }}</div>
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded" :class="batchLevel(b.days_until_expiry).cls">
                          {{ batchLevel(b.days_until_expiry).label }}
                        </span>
                      </div>
                      <div class="grid grid-cols-3 gap-2 text-[11px] text-ink-secondary">
                        <div>
                          <div>Tồn / nhập</div>
                          <div class="text-ink-primary font-medium">{{ b.current_quantity }} / {{ b.import_quantity }}</div>
                        </div>
                        <div>
                          <div>HSD</div>
                          <div class="text-ink-primary font-medium">{{ formatDateVN(b.expiry_date) }}</div>
                        </div>
                        <div>
                          <div>Ngày SX</div>
                          <div class="text-ink-primary font-medium">{{ formatDateVN(b.manufacture_date) }}</div>
                        </div>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Sticky CTA -->
          <div v-if="product && !loading && editing" class="p-4 border-t border-line-200 shrink-0 flex gap-2">
            <button
              @click="cancelEdit"
              class="h-12 px-6 rounded-btn border border-line-300 hover:border-line-400 text-ink-primary font-semibold transition"
            >
              Huỷ
            </button>
            <button
              @click="cancelEdit"
              class="flex-1 h-12 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-bold transition shadow-pop"
            >
              Xong
            </button>
          </div>
          <div v-else-if="product && !loading" class="p-4 border-t border-line-200 shrink-0">
            <button
              @click="emit('add', product)"
              :disabled="noPrice || product.stock <= 0"
              class="w-full h-12 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-pop"
            >
              {{ noPrice ? 'Chưa có giá' : product.stock <= 0 ? 'Hết hàng' : '+ Thêm vào đơn' }}
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease-out;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
