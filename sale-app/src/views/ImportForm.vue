<script setup>
/**
 * ImportForm.vue — Tạo / sửa phiếu nhập kho (nháp).
 *
 * Dùng chung cho 2 route:
 *   - /imports/new        → tạo mới (route.params.id rỗng)
 *   - /imports/:id/edit   → sửa nháp (load detail đổ vào form)
 *
 * KHÔNG có nút "Chốt phiếu" ở đây — chốt nằm ở màn chi tiết (ImportDetail).
 * Chỉ owner/admin dùng (backend khoá 403 với member) → member thấy màn khoá.
 *
 * Payload gửi createDraft/updateDraft:
 *   { supplierId, warehouseId, importDate, nccInvoiceNo, notes,
 *     shippingFee, discountType, discountValue, vatRate, depositAmount,
 *     items:[{ productId, batchCode, quantity, unitCost,
 *              manufactureDate, expiryDate, notes }] }
 *
 * Tiền = integer VND. Ngày date-only theo giờ VN (không gắn T00:00:00Z).
 */
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useImports } from '../composables/useImports';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const {
  detail,
  warehouses,
  suppliers,
  saving,
  loadWarehouses,
  loadSuppliers,
  searchProducts,
  createDraft,
  updateDraft,
  loadDetail,
  createSupplier,
  loadSupplierDebt,
  formatVND,
} = useImports();

// id có → chế độ sửa; không → tạo mới.
const editId = computed(() => {
  const id = route.params.id;
  return id && id !== 'new' ? String(id) : '';
});
const editing = computed(() => !!editId.value);

// ── Ngày hôm nay theo giờ VN (YYYY-MM-DD, date-only) ─────────────────
function todayVN() {
  // en-CA cho định dạng YYYY-MM-DD; ép timezone VN để không lệch ngày.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Gợi ý mã lô: L + YYYYMMDD (+ hậu tố để không trùng trong cùng phiếu).
function suggestBatchCode() {
  const base = 'L' + todayVN().replace(/-/g, '');
  const existing = new Set(form.items.map((it) => (it.batchCode || '').trim()));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

// ── State ────────────────────────────────────────────────────────────
const form = reactive({
  warehouseId: '',
  supplierId: '',
  importDate: todayVN(),
  nccInvoiceNo: '',
  notes: '',
  shippingFee: 0,
  discountType: 'amount', // 'amount' | 'percent'
  discountValue: 0,
  vatRate: 0,
  depositAmount: 0,
  items: [],
});

const VAT_OPTIONS = [0, 5, 8, 10];

const loadingDetail = ref(false);
const loadError = ref('');
const saveError = ref('');

// ── Tìm sản phẩm (debounce 250ms) ────────────────────────────────────
const query = ref('');
const results = ref([]);
const searching = ref(false);
let searchTimer = null;

watch(query, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 250);
});

async function runSearch() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }
  searching.value = true;
  try {
    results.value = await searchProducts(q);
  } finally {
    searching.value = false;
  }
}

function addProduct(p) {
  form.items.push({
    _key: uid(),
    productId: p.id,
    sku: p.sku || '',
    name: p.name || '',
    quantity: 1,
    unitCost: Number(p.costPrice) || 0,
    batchCode: suggestBatchCode(),
    manufactureDate: '',
    expiryDate: '',
    notes: '',
    _open: false,
  });
  query.value = '';
  results.value = [];
}

function removeItem(idx) {
  form.items.splice(idx, 1);
}

function lineTotal(it) {
  return (Number(it.quantity) || 0) * (Number(it.unitCost) || 0);
}

// ── Mô hình tiền (số nguyên VND — khớp backend computeCharges) ───────
const goodsValue = computed(() =>
  form.items.reduce((s, it) => s + lineTotal(it), 0),
);
const discountAmount = computed(() => {
  const v = Number(form.discountValue) || 0;
  const raw =
    form.discountType === 'percent'
      ? Math.round((goodsValue.value * Math.min(v, 100)) / 100)
      : Math.round(v);
  return Math.min(Math.max(0, raw), goodsValue.value);
});
const taxBase = computed(() => goodsValue.value - discountAmount.value);
const vatAmount = computed(() =>
  Math.round((taxBase.value * (Number(form.vatRate) || 0)) / 100),
);
const grandTotal = computed(
  () => taxBase.value + (Number(form.shippingFee) || 0) + vatAmount.value,
);
const depositClamped = computed(() =>
  Math.min(Math.max(0, Number(form.depositAmount) || 0), grandTotal.value),
);
const debtAfter = computed(() => Math.max(0, grandTotal.value - depositClamped.value));
const totalQuantity = computed(() =>
  form.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0),
);

// ── NCC: chọn / tìm kiếm ─────────────────────────────────────────────
const selectedSupplier = computed(() =>
  suppliers.value.find((s) => s.id === form.supplierId) || null,
);

// Ô tìm kiếm NCC (lọc theo tên gợi nhớ / tên công ty / MST / SĐT).
const supplierQuery = ref('');
const supplierDropdownOpen = ref(false);
const filteredSuppliers = computed(() => {
  const q = supplierQuery.value.trim().toLowerCase();
  const active = suppliers.value.filter((s) => s.active !== false);
  if (!q) return active;
  return active.filter((s) =>
    [s.name, s.companyName, s.taxCode, s.phone]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
});

function selectSupplier(s) {
  form.supplierId = s ? s.id : '';
  supplierQuery.value = s ? s.name : '';
  supplierDropdownOpen.value = false;
}
function clearSupplier() {
  form.supplierId = '';
  supplierQuery.value = '';
}
function onSupplierInput() {
  supplierDropdownOpen.value = true;
  // Gõ lại làm mất lựa chọn cũ cho tới khi chọn item khác.
  if (!supplierQuery.value.trim()) form.supplierId = '';
}

// ── Công nợ NCC hiện tại (gọi API /suppliers/:id/debt) ───────────────
const supplierDebt = ref(null);
watch(
  () => form.supplierId,
  async (id) => {
    supplierDebt.value = null;
    if (!id) return;
    supplierDebt.value = await loadSupplierDebt(id);
  },
);

// ── Modal thêm NCC mới ───────────────────────────────────────────────
const showAddSupplier = ref(false);
const savingSupplier = ref(false);
const supplierErr = ref('');
const newSupplier = reactive({
  name: '',
  companyName: '',
  taxCode: '',
  address: '',
  representative: '',
  representativeTitle: '',
  phone: '',
});
function openAddSupplier() {
  supplierErr.value = '';
  newSupplier.name = supplierQuery.value.trim();
  newSupplier.companyName = '';
  newSupplier.taxCode = '';
  newSupplier.address = '';
  newSupplier.representative = '';
  newSupplier.representativeTitle = '';
  newSupplier.phone = '';
  showAddSupplier.value = true;
}
async function submitNewSupplier() {
  supplierErr.value = '';
  if (!newSupplier.name.trim()) {
    supplierErr.value = 'Tên gợi nhớ là bắt buộc.';
    return;
  }
  savingSupplier.value = true;
  try {
    const created = await createSupplier({
      name: newSupplier.name.trim(),
      companyName: newSupplier.companyName.trim() || null,
      taxCode: newSupplier.taxCode.trim() || null,
      address: newSupplier.address.trim() || null,
      representative: newSupplier.representative.trim() || null,
      representativeTitle: newSupplier.representativeTitle.trim() || null,
      phone: newSupplier.phone.trim() || null,
    });
    await loadSuppliers(); // nạp lại danh sách để có NCC mới
    selectSupplier(created); // chọn luôn NCC vừa tạo
    showAddSupplier.value = false;
  } catch (err) {
    supplierErr.value = err.response?.data?.error || 'Không tạo được NCC. Thử lại.';
  } finally {
    savingSupplier.value = false;
  }
}

// ── Load dữ liệu ─────────────────────────────────────────────────────
onMounted(async () => {
  if (!isAdmin.value) return;
  await Promise.all([loadWarehouses(), loadSuppliers()]);

  if (editing.value) {
    await hydrateFromDetail();
  } else if (!form.warehouseId && warehouses.value.length) {
    // Tạo mới: mặc định kho đầu tiên cho tiện.
    form.warehouseId = warehouses.value[0].id;
  }
});

async function hydrateFromDetail() {
  loadingDetail.value = true;
  loadError.value = '';
  try {
    await loadDetail(editId.value);
    const d = detail.value;
    if (!d) {
      loadError.value = 'Không tìm thấy phiếu nhập.';
      return;
    }
    // Phiếu đã chốt thì không sửa được → về màn chi tiết.
    if ((d.status || 'draft') !== 'draft') {
      router.replace('/imports/' + editId.value);
      return;
    }
    form.warehouseId = d.warehouseId || d.warehouse?.id || '';
    form.supplierId = d.supplierId || d.supplier?.id || '';
    supplierQuery.value = selectedSupplier.value?.name || d.supplier?.name || '';
    form.importDate = (d.importDate || '').slice(0, 10) || todayVN();
    form.nccInvoiceNo = d.nccInvoiceNo || '';
    form.notes = d.notes || '';
    form.shippingFee = Number(d.shippingFee) || 0;
    form.discountType = d.discountType || 'amount';
    form.discountValue = Number(d.discountValue) || 0;
    form.vatRate = Number(d.vatRate) || 0;
    form.depositAmount = Number(d.depositAmount) || 0;
    form.items = (d.items || []).map((it) => ({
      _key: uid(),
      productId: it.productId,
      sku: it.product?.sku || '',
      name: it.product?.name || '',
      quantity: Number(it.quantity) || 0,
      unitCost: Number(it.unitCost) || 0,
      batchCode: it.batchCode || '',
      manufactureDate: (it.manufactureDate || '').slice(0, 10),
      expiryDate: (it.expiryDate || '').slice(0, 10),
      notes: it.notes || '',
      _open: false,
    }));
  } catch (err) {
    loadError.value = err.response?.data?.error || 'Không tải được phiếu nhập.';
  } finally {
    loadingDetail.value = false;
  }
}

// ── Validate + Lưu nháp ──────────────────────────────────────────────
function validate() {
  if (!form.warehouseId) return 'Chưa chọn kho nhập.';

  const lines = form.items.filter((it) => it.productId);
  if (lines.length === 0) return 'Chưa có sản phẩm nào.';

  for (const it of form.items) {
    const label = it.sku || it.name || 'SP';
    if (!it.productId) return `${label}: dòng thiếu sản phẩm.`;
    if (!(Number(it.quantity) > 0)) return `${label}: số lượng phải > 0.`;
    if (Number(it.unitCost) < 0) return `${label}: giá vốn không được âm.`;
    if (
      it.expiryDate &&
      it.manufactureDate &&
      new Date(it.expiryDate) <= new Date(it.manufactureDate)
    ) {
      return `${label}: HSD phải sau NSX.`;
    }
  }

  // Mã lô không trùng trong cùng phiếu (chỉ xét mã đã nhập).
  const codes = form.items
    .map((it) => (it.batchCode || '').trim())
    .filter(Boolean);
  const seen = new Set();
  for (const c of codes) {
    const key = c.toLowerCase();
    if (seen.has(key)) return `Mã lô "${c}" bị trùng trong phiếu.`;
    seen.add(key);
  }

  // Có đặt cọc thì bắt buộc chọn NCC (backend trả 400 nếu thiếu).
  if ((Number(form.depositAmount) || 0) > 0 && !form.supplierId) {
    return 'Có đặt cọc thì phải chọn nhà cung cấp.';
  }
  return null;
}

function buildPayload() {
  return {
    supplierId: form.supplierId || null,
    warehouseId: form.warehouseId,
    importDate: form.importDate,
    nccInvoiceNo: form.nccInvoiceNo?.trim() || null,
    notes: form.notes?.trim() || null,
    shippingFee: Number(form.shippingFee) || 0,
    discountType: form.discountType,
    discountValue: Number(form.discountValue) || 0,
    vatRate: Number(form.vatRate) || 0,
    depositAmount: Number(form.depositAmount) || 0,
    items: form.items.map((it) => ({
      productId: it.productId,
      batchCode: (it.batchCode || '').trim() || null,
      quantity: Number(it.quantity) || 0,
      unitCost: Number(it.unitCost) || 0,
      manufactureDate: it.manufactureDate || null,
      expiryDate: it.expiryDate || null,
      notes: it.notes?.trim() || null,
    })),
  };
}

async function onSave() {
  saveError.value = '';
  const err = validate();
  if (err) {
    saveError.value = err;
    // Cuộn lên đầu để user thấy lỗi.
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  try {
    const payload = buildPayload();
    let id = editId.value;
    if (editing.value) {
      await updateDraft(editId.value, payload);
    } else {
      const res = await createDraft(payload);
      id = res?.id || res?.import?.id;
    }
    if (!id) {
      saveError.value = 'Lưu xong nhưng không nhận được mã phiếu. Kiểm tra lại danh sách.';
      return;
    }
    router.push('/imports/' + id);
  } catch (e) {
    saveError.value = e.response?.data?.error || 'Không lưu được phiếu nhập. Thử lại.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function goBack() {
  if (editing.value) router.push('/imports/' + editId.value);
  else router.push('/imports');
}

// Ô input dùng chung.
const inputCls =
  'w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary';
const labelCls = 'text-[11px] uppercase tracking-wide text-ink-secondary mb-1';
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[900px] mx-auto pb-28">
    <!-- Back -->
    <button
      @click="goBack"
      class="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary mb-3"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Phiếu nhập
    </button>

    <!-- Member: không có quyền -->
    <div
      v-if="!isAdmin"
      class="bg-white border border-line-200 rounded-card p-12 text-center"
    >
      <div class="text-5xl mb-3">🔒</div>
      <div class="font-semibold text-ink-primary">Chức năng dành cho quản lý</div>
      <p class="text-xs text-ink-secondary mt-1">
        Chỉ chủ cửa hàng / quản lý mới tạo và sửa được phiếu nhập kho.
      </p>
    </div>

    <template v-else>
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary mb-4">
        {{ editing ? 'Sửa phiếu nhập' : 'Tạo phiếu nhập' }}
      </h1>

      <!-- Loading khi nạp phiếu để sửa -->
      <div v-if="loadingDetail" class="space-y-3">
        <div class="h-40 bg-white rounded-card border border-line-200 animate-pulse"></div>
        <div class="h-40 bg-white rounded-card border border-line-200 animate-pulse"></div>
      </div>

      <div
        v-else-if="loadError"
        class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm"
      >
        {{ loadError }}
        <button @click="hydrateFromDetail" class="block mt-2 text-red-700 underline font-medium">
          Thử lại
        </button>
      </div>

      <template v-else>
        <!-- Lỗi khi lưu / validate -->
        <div
          v-if="saveError"
          class="bg-red-50 border border-red-200 text-red-700 rounded-card px-4 py-3 text-sm mb-3"
        >
          {{ saveError }}
        </div>

        <!-- ══════════ THÔNG TIN PHIẾU ══════════ -->
        <div class="bg-white border border-line-200 rounded-card p-4 lg:p-5 shadow-card mb-3">
          <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">Thông tin phiếu</div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Kho nhập (bắt buộc) -->
            <div>
              <div :class="labelCls">Kho nhập <span class="text-rose-500">*</span></div>
              <select v-model="form.warehouseId" :class="inputCls">
                <option value="">— Chọn kho —</option>
                <option v-for="w in warehouses" :key="w.id" :value="w.id">{{ w.name }}</option>
              </select>
            </div>

            <!-- Nhà cung cấp (tìm kiếm + thêm mới) -->
            <div>
              <div :class="labelCls">Nhà cung cấp</div>
              <div class="flex gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="supplierQuery"
                    type="text"
                    placeholder="Tìm hoặc chọn NCC..."
                    :class="inputCls"
                    @focus="supplierDropdownOpen = true"
                    @input="onSupplierInput"
                  />
                  <button
                    v-if="form.supplierId"
                    type="button"
                    @click="clearSupplier"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-ink-disabled hover:text-ink-primary text-lg leading-none"
                  >×</button>

                  <!-- Overlay bấm ra ngoài để đóng dropdown -->
                  <div
                    v-if="supplierDropdownOpen"
                    class="fixed inset-0 z-10"
                    @click="supplierDropdownOpen = false"
                  ></div>

                  <!-- Dropdown kết quả -->
                  <div
                    v-if="supplierDropdownOpen"
                    class="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border border-line-200 rounded-input shadow-pop"
                  >
                    <button
                      v-for="s in filteredSuppliers"
                      :key="s.id"
                      type="button"
                      @click="selectSupplier(s)"
                      class="w-full text-left px-3 py-2 text-sm hover:bg-surface-soft border-b border-line-100 last:border-0"
                      :class="s.id === form.supplierId ? 'bg-royal-50 text-royal-700 font-medium' : 'text-ink-primary'"
                    >
                      <div>{{ s.name }}</div>
                      <div v-if="s.companyName || s.taxCode" class="text-[11px] text-ink-secondary">
                        <span v-if="s.companyName">{{ s.companyName }}</span>
                        <span v-if="s.taxCode"> · MST {{ s.taxCode }}</span>
                      </div>
                    </button>
                    <div
                      v-if="filteredSuppliers.length === 0"
                      class="px-3 py-2 text-xs text-ink-disabled"
                    >
                      Không có NCC khớp — bấm ＋ để thêm mới
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  @click="openAddSupplier"
                  title="Thêm NCC mới"
                  class="shrink-0 w-10 h-10 rounded-input border border-line-300 text-royal-700 hover:bg-royal-50 flex items-center justify-center text-xl font-semibold leading-none"
                >＋</button>
              </div>

              <div
                v-if="form.supplierId && supplierDebt != null"
                class="mt-1 text-[11px] flex items-center gap-1"
              >
                <span class="text-ink-secondary">Công nợ hiện tại:</span>
                <span
                  class="font-mono font-semibold"
                  :class="supplierDebt > 0 ? 'text-rose-600' : 'text-emerald-600'"
                >
                  {{ formatVND(supplierDebt) }}
                </span>
              </div>
            </div>

            <!-- Ngày nhập -->
            <div>
              <div :class="labelCls">Ngày nhập</div>
              <input v-model="form.importDate" type="date" :class="inputCls" />
            </div>

            <!-- Số HĐ NCC -->
            <div>
              <div :class="labelCls">Số hoá đơn NCC</div>
              <input
                v-model="form.nccInvoiceNo"
                type="text"
                placeholder="VD: INV-MH-2607-A"
                :class="inputCls"
              />
            </div>
          </div>

          <div class="mt-3">
            <div :class="labelCls">Ghi chú</div>
            <textarea
              v-model="form.notes"
              rows="2"
              placeholder="Ghi chú cho phiếu nhập..."
              class="w-full px-3 py-2 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm resize-none text-ink-primary"
            />
          </div>
        </div>

        <!-- ══════════ DÒNG HÀNG ══════════ -->
        <div class="bg-white border border-line-200 rounded-card p-4 lg:p-5 shadow-card mb-3">
          <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">
            Sản phẩm nhập ({{ form.items.length }})
          </div>

          <!-- Ô tìm SP -->
          <div class="relative mb-3">
            <input
              v-model="query"
              type="search"
              placeholder="Tìm SKU / tên sản phẩm để thêm..."
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

            <!-- Dropdown kết quả -->
            <div
              v-if="query.trim()"
              class="absolute z-20 mt-1 left-0 right-0 bg-white border border-line-200 rounded-lg shadow-pop max-h-72 overflow-y-auto"
            >
              <div v-if="searching" class="px-3 py-3 text-sm text-ink-secondary">Đang tìm...</div>
              <div
                v-else-if="results.length === 0"
                class="px-3 py-3 text-sm text-ink-secondary"
              >
                Không có sản phẩm phù hợp
              </div>
              <button
                v-for="p in results"
                :key="p.id"
                type="button"
                @click="addProduct(p)"
                class="w-full text-left px-3 py-2 hover:bg-surface-50 border-b border-line-100 last:border-0 flex items-center justify-between gap-2"
              >
                <span class="min-w-0">
                  <span class="font-mono text-[10px] text-ink-secondary">{{ p.sku }}</span>
                  <span class="block text-sm text-ink-primary truncate">{{ p.name }}</span>
                </span>
                <span
                  v-if="p.costPrice != null"
                  class="shrink-0 text-[11px] font-mono text-ink-secondary"
                >
                  {{ formatVND(p.costPrice) }}
                </span>
              </button>
            </div>
          </div>

          <!-- Empty -->
          <div
            v-if="form.items.length === 0"
            class="text-center py-8 text-sm text-ink-secondary"
          >
            <div class="text-4xl mb-2">📦</div>
            Chưa có sản phẩm nào. Tìm ở ô trên để thêm.
          </div>

          <!-- Danh sách dòng hàng (card, mobile-first) -->
          <div v-else class="space-y-2.5">
            <div
              v-for="(it, idx) in form.items"
              :key="it._key"
              class="border rounded-lg p-3"
              :class="!it.expiryDate ? 'border-amber-300 bg-amber-50/40' : 'border-line-200'"
            >
              <!-- Dòng 1: tên SP + xoá -->
              <div class="flex items-start justify-between gap-2 mb-2">
                <div class="min-w-0">
                  <div class="font-medium text-sm text-ink-primary leading-snug">
                    {{ it.name || it.productId }}
                  </div>
                  <div class="font-mono text-[10px] text-ink-secondary">{{ it.sku }}</div>
                </div>
                <button
                  type="button"
                  @click="removeItem(idx)"
                  class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-rose-500 hover:bg-rose-50"
                  title="Xoá dòng"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <!-- Dòng 2: SL + Giá vốn + Thành tiền -->
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <div :class="labelCls">Số lượng</div>
                  <input
                    v-model.number="it.quantity"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    :class="inputCls + ' tabular-nums'"
                  />
                </div>
                <div>
                  <div :class="labelCls">Giá vốn (đ)</div>
                  <input
                    v-model.number="it.unitCost"
                    type="number"
                    min="0"
                    step="1000"
                    inputmode="numeric"
                    :class="inputCls + ' tabular-nums'"
                  />
                </div>
              </div>
              <div class="flex justify-between items-baseline mt-2 text-sm">
                <span class="text-ink-secondary text-xs">Thành tiền</span>
                <span class="font-mono font-semibold text-royal-700">{{ formatVND(lineTotal(it)) }}</span>
              </div>

              <!-- Dòng 3: Mã lô + HSD (luôn hiện) -->
              <div class="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <div :class="labelCls">Mã lô</div>
                  <input v-model="it.batchCode" type="text" placeholder="VD: L20260715" :class="inputCls + ' font-mono'" />
                </div>
                <div>
                  <div :class="labelCls">
                    HSD
                    <span v-if="!it.expiryDate" class="text-amber-600 normal-case">· nên nhập</span>
                  </div>
                  <input
                    v-model="it.expiryDate"
                    type="date"
                    :class="[
                      'w-full h-10 px-3 rounded-input border outline-none bg-white text-sm text-ink-primary',
                      it.expiryDate ? 'border-line-300 focus:border-royal-700' : 'border-amber-400 focus:border-amber-500',
                    ]"
                  />
                </div>
              </div>

              <!-- Toggle: NSX + ghi chú dòng -->
              <button
                type="button"
                @click="it._open = !it._open"
                class="mt-2 text-[11px] text-royal-700 font-medium inline-flex items-center gap-1"
              >
                <svg
                  class="w-3.5 h-3.5 transition-transform"
                  :class="it._open ? 'rotate-180' : ''"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {{ it._open ? 'Thu gọn' : 'NSX / ghi chú' }}
              </button>
              <div v-if="it._open" class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 pt-2 border-t border-line-100">
                <div>
                  <div :class="labelCls">Ngày sản xuất</div>
                  <input v-model="it.manufactureDate" type="date" :class="inputCls" />
                </div>
                <div>
                  <div :class="labelCls">Ghi chú dòng</div>
                  <input v-model="it.notes" type="text" placeholder="Ghi chú (nếu có)" :class="inputCls" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ══════════ PHÍ & CHIẾT KHẤU ══════════ -->
        <div class="bg-white border border-line-200 rounded-card p-4 lg:p-5 shadow-card mb-3">
          <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">Phí & chiết khấu</div>

          <div class="grid grid-cols-2 gap-3">
            <!-- Chiết khấu -->
            <div>
              <div :class="labelCls">Chiết khấu</div>
              <div class="flex gap-1.5">
                <input
                  v-model.number="form.discountValue"
                  type="number"
                  min="0"
                  inputmode="numeric"
                  :class="inputCls + ' tabular-nums'"
                />
                <select
                  v-model="form.discountType"
                  class="h-10 px-2 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm shrink-0"
                >
                  <option value="amount">đ</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>

            <!-- VAT -->
            <div>
              <div :class="labelCls">Thuế VAT</div>
              <select v-model.number="form.vatRate" :class="inputCls">
                <option v-for="v in VAT_OPTIONS" :key="v" :value="v">{{ v }}%</option>
              </select>
            </div>

            <!-- Phí vận chuyển -->
            <div>
              <div :class="labelCls">Phí vận chuyển (đ)</div>
              <input
                v-model.number="form.shippingFee"
                type="number"
                min="0"
                step="1000"
                inputmode="numeric"
                :class="inputCls + ' tabular-nums'"
              />
            </div>

            <!-- Đặt cọc -->
            <div>
              <div :class="labelCls">
                Đặt cọc (đ)
                <span v-if="(Number(form.depositAmount) || 0) > 0 && !form.supplierId" class="text-rose-500 normal-case">· cần NCC</span>
              </div>
              <input
                v-model.number="form.depositAmount"
                type="number"
                min="0"
                step="1000"
                inputmode="numeric"
                :class="[
                  'w-full h-10 px-3 rounded-input border outline-none bg-white text-sm tabular-nums text-ink-primary',
                  (Number(form.depositAmount) || 0) > 0 && !form.supplierId
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-line-300 focus:border-royal-700',
                ]"
              />
            </div>
          </div>

          <!-- Tạm tính (client) -->
          <div class="mt-4 pt-3 border-t border-line-200 space-y-1.5 text-sm">
            <div class="flex justify-between">
              <span class="text-ink-secondary">Giá trị hàng</span>
              <span class="font-mono text-ink-primary">{{ formatVND(goodsValue) }}</span>
            </div>
            <div v-if="discountAmount > 0" class="flex justify-between">
              <span class="text-ink-secondary">Chiết khấu</span>
              <span class="font-mono text-amber-600">− {{ formatVND(discountAmount) }}</span>
            </div>
            <div v-if="(Number(form.shippingFee) || 0) > 0" class="flex justify-between">
              <span class="text-ink-secondary">Phí vận chuyển</span>
              <span class="font-mono text-ink-primary">+ {{ formatVND(form.shippingFee) }}</span>
            </div>
            <div v-if="vatAmount > 0" class="flex justify-between">
              <span class="text-ink-secondary">VAT {{ form.vatRate }}%</span>
              <span class="font-mono text-ink-primary">+ {{ formatVND(vatAmount) }}</span>
            </div>
            <div class="flex justify-between pt-2 border-t border-line-200">
              <span class="font-semibold text-ink-primary">Tạm tính cần thanh toán</span>
              <span class="font-mono font-bold text-royal-700 text-base">{{ formatVND(grandTotal) }}</span>
            </div>
            <div v-if="depositClamped > 0" class="flex justify-between">
              <span class="text-ink-secondary">Đã cọc</span>
              <span class="font-mono text-emerald-700">{{ formatVND(depositClamped) }}</span>
            </div>
            <div v-if="depositClamped > 0" class="flex justify-between">
              <span class="text-ink-secondary">Còn nợ NCC</span>
              <span class="font-mono font-bold text-rose-600">{{ formatVND(debtAfter) }}</span>
            </div>
            <div class="text-[11px] text-ink-secondary pt-1">
              {{ form.items.length }} SP · {{ totalQuantity }} đơn vị ·
              <span class="italic">backend sẽ tính lại số cuối khi lưu</span>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>

  <!-- ══════════ THANH ĐÁY: Lưu nháp ══════════ -->
  <div
    v-if="isAdmin && !loadingDetail && !loadError"
    class="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line-200 px-4 py-3"
  >
    <div class="max-w-[900px] mx-auto flex items-center gap-2">
      <button
        type="button"
        @click="goBack"
        :disabled="saving"
        class="h-12 px-5 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50 disabled:opacity-50"
      >
        Huỷ
      </button>
      <button
        type="button"
        @click="onSave"
        :disabled="saving"
        class="flex-1 h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold shadow-pop disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <svg v-if="!saving" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
        </svg>
        {{ saving ? 'Đang lưu...' : 'Lưu nháp' }}
      </button>
    </div>

    <!-- ══════════ MODAL THÊM NCC ══════════ -->
    <Teleport to="body">
    <div
      v-if="showAddSupplier"
      class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      @click.self="showAddSupplier = false"
    >
      <div class="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-card shadow-pop max-h-[90dvh] overflow-auto">
        <div class="flex items-center justify-between px-4 py-3 border-b border-line-200 sticky top-0 bg-white">
          <div class="font-bold text-ink-primary">Thêm nhà cung cấp</div>
          <button
            type="button"
            @click="showAddSupplier = false"
            class="text-ink-disabled hover:text-ink-primary text-2xl leading-none"
          >×</button>
        </div>

        <div class="p-4 space-y-3">
          <div>
            <div :class="labelCls">Tên gợi nhớ <span class="text-rose-500">*</span></div>
            <input v-model="newSupplier.name" type="text" placeholder="VD: Manhae Pháp" :class="inputCls" />
          </div>
          <div>
            <div :class="labelCls">Tên công ty</div>
            <input
              v-model="newSupplier.companyName"
              type="text"
              placeholder="Tên pháp lý đầy đủ"
              :class="inputCls"
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div :class="labelCls">MST</div>
              <input v-model="newSupplier.taxCode" type="text" :class="inputCls" />
            </div>
            <div>
              <div :class="labelCls">SĐT</div>
              <input v-model="newSupplier.phone" type="tel" :class="inputCls" />
            </div>
          </div>
          <div>
            <div :class="labelCls">Địa chỉ</div>
            <input v-model="newSupplier.address" type="text" :class="inputCls" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div :class="labelCls">Người đại diện</div>
              <input v-model="newSupplier.representative" type="text" :class="inputCls" />
            </div>
            <div>
              <div :class="labelCls">Chức vụ</div>
              <input
                v-model="newSupplier.representativeTitle"
                type="text"
                placeholder="VD: Giám đốc"
                :class="inputCls"
              />
            </div>
          </div>
          <div
            v-if="supplierErr"
            class="text-xs text-rose-600 bg-rose-50 rounded-input px-3 py-2"
          >
            {{ supplierErr }}
          </div>
        </div>

        <div class="flex gap-2 px-4 py-3 border-t border-line-200 sticky bottom-0 bg-white">
          <button
            type="button"
            @click="showAddSupplier = false"
            class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-semibold"
          >
            Huỷ
          </button>
          <button
            type="button"
            @click="submitNewSupplier"
            :disabled="savingSupplier"
            class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold disabled:opacity-50"
          >
            {{ savingSupplier ? 'Đang lưu...' : 'Lưu NCC' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>
