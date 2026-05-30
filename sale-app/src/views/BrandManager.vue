<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

// owner/admin = ADMIN; member = SALE
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const suppliers = ref([]);
const brands = ref([]);
const loadingSuppliers = ref(false);
const loadingBrands = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

let toastTimer = null;
function flash(msg) {
  successMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (successMsg.value = ''), 2500);
}
function showError(err, fallback) {
  errorMsg.value = err?.response?.data?.error || err?.message || fallback;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (errorMsg.value = ''), 4000);
}

// ── Suppliers (NCC) ────────────────────────────────────────────────────
const supplierDialog = ref(false);
const supplierForm = ref({ id: null, name: '', country: '', contactInfo: '' });
const supplierSaving = ref(false);

async function loadSuppliers() {
  loadingSuppliers.value = true;
  try {
    const { data } = await api.get('/suppliers');
    suppliers.value = data.suppliers || data || [];
  } catch (err) {
    showError(err, 'Không tải được danh sách NCC');
    suppliers.value = [];
  } finally {
    loadingSuppliers.value = false;
  }
}

function openSupplierCreate() {
  supplierForm.value = { id: null, name: '', country: '', contactInfo: '' };
  supplierDialog.value = true;
}
function openSupplierEdit(s) {
  supplierForm.value = {
    id: s.id,
    name: s.name || '',
    country: s.country || '',
    contactInfo: s.contactInfo || '',
  };
  supplierDialog.value = true;
}

async function saveSupplier() {
  if (!supplierForm.value.name.trim()) {
    showError(null, 'Tên NCC là bắt buộc');
    return;
  }
  supplierSaving.value = true;
  try {
    const payload = {
      name: supplierForm.value.name.trim(),
      country: supplierForm.value.country.trim() || null,
      contactInfo: supplierForm.value.contactInfo.trim() || null,
    };
    if (supplierForm.value.id) {
      await api.put(`/suppliers/${supplierForm.value.id}`, payload);
      flash('Đã cập nhật NCC');
    } else {
      await api.post('/suppliers', payload);
      flash('Đã thêm NCC');
    }
    supplierDialog.value = false;
    await loadSuppliers();
  } catch (err) {
    showError(err, 'Lỗi lưu NCC');
  } finally {
    supplierSaving.value = false;
  }
}

async function deleteSupplier(s) {
  if (!confirm(`Xoá NCC "${s.name}"?`)) return;
  try {
    await api.delete(`/suppliers/${s.id}`);
    flash('Đã xoá NCC');
    await loadSuppliers();
  } catch (err) {
    showError(err, 'Lỗi xoá NCC');
  }
}

// ── Brands (Thương hiệu) ───────────────────────────────────────────────
const brandDialog = ref(false);
const brandForm = ref({ id: null, name: '', supplierId: '', description: '' });
const brandSaving = ref(false);

async function loadBrands() {
  loadingBrands.value = true;
  try {
    const { data } = await api.get('/brands');
    brands.value = data.brands || data || [];
  } catch (err) {
    showError(err, 'Không tải được danh sách thương hiệu');
    brands.value = [];
  } finally {
    loadingBrands.value = false;
  }
}

function openBrandCreate() {
  brandForm.value = { id: null, name: '', supplierId: '', description: '' };
  brandDialog.value = true;
}
function openBrandEdit(b) {
  brandForm.value = {
    id: b.id,
    name: b.name || '',
    supplierId: b.supplierId || '',
    description: b.description || '',
  };
  brandDialog.value = true;
}

async function saveBrand() {
  if (!brandForm.value.name.trim()) {
    showError(null, 'Tên thương hiệu là bắt buộc');
    return;
  }
  brandSaving.value = true;
  try {
    const payload = {
      name: brandForm.value.name.trim(),
      supplierId: brandForm.value.supplierId || null,
      description: brandForm.value.description.trim() || null,
    };
    if (brandForm.value.id) {
      await api.put(`/brands/${brandForm.value.id}`, payload);
      flash('Đã cập nhật thương hiệu');
    } else {
      await api.post('/brands', payload);
      flash('Đã thêm thương hiệu');
    }
    brandDialog.value = false;
    await loadBrands();
  } catch (err) {
    showError(err, 'Lỗi lưu thương hiệu');
  } finally {
    brandSaving.value = false;
  }
}

async function deleteBrand(b) {
  if (!confirm(`Xoá thương hiệu "${b.name}"?`)) return;
  try {
    await api.delete(`/brands/${b.id}`);
    flash('Đã xoá thương hiệu');
    await loadBrands();
  } catch (err) {
    showError(err, 'Lỗi xoá thương hiệu');
  }
}

function supplierName(id) {
  const s = suppliers.value.find((x) => x.id === id);
  return s ? s.name : '—';
}

onMounted(() => {
  if (!isAdmin.value) return;
  loadSuppliers();
  loadBrands();
});
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-4">
      <button
        @click="router.push('/products')"
        class="h-9 w-9 shrink-0 rounded-btn border border-line-300 hover:border-royal-700 flex items-center justify-center text-ink-secondary"
        title="Quay lại Sản phẩm"
        aria-label="Quay lại Sản phẩm"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">NCC &amp; Thương hiệu</h1>
        <p class="text-xs text-ink-secondary mt-0.5">Quản lý nhà cung cấp và thương hiệu sản phẩm</p>
      </div>
    </div>

    <!-- Access guard -->
    <div
      v-if="!isAdmin"
      class="bg-white border border-line-200 rounded-card p-12 text-center shadow-card"
    >
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Chỉ admin truy cập</div>
      <p class="text-xs text-ink-secondary mt-1">Bạn không có quyền quản lý NCC / Thương hiệu.</p>
    </div>

    <template v-else>
      <!-- Toasts -->
      <div
        v-if="successMsg"
        class="mb-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-card px-4 py-2.5 text-sm"
      >
        {{ successMsg }}
      </div>
      <div
        v-if="errorMsg"
        class="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-card px-4 py-2.5 text-sm"
      >
        {{ errorMsg }}
      </div>

      <div class="grid lg:grid-cols-2 gap-4">
        <!-- ── NHÀ CUNG CẤP ────────────────────────────────────── -->
        <section class="bg-white border border-line-200 rounded-card shadow-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-bold text-ink-primary">Nhà cung cấp (NCC)</h2>
            <button
              @click="openSupplierCreate"
              class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold"
            >
              + Thêm NCC
            </button>
          </div>

          <!-- Skeleton -->
          <div v-if="loadingSuppliers" class="space-y-2">
            <div v-for="i in 4" :key="i" class="h-14 bg-surface-soft animate-pulse rounded-lg"></div>
          </div>

          <!-- Empty -->
          <div
            v-else-if="suppliers.length === 0"
            class="py-10 text-center text-sm text-ink-secondary"
          >
            Chưa có NCC nào. Bấm "+ Thêm NCC" để tạo.
          </div>

          <!-- List -->
          <ul v-else class="space-y-2">
            <li
              v-for="s in suppliers"
              :key="s.id"
              class="border border-line-200 rounded-lg p-3 flex items-start gap-3"
              :class="s.active === false ? 'opacity-50' : ''"
            >
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-ink-primary truncate">{{ s.name }}</div>
                <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2">
                  <span v-if="s.country">🌍 {{ s.country }}</span>
                  <span v-if="s.contactInfo" class="truncate">📞 {{ s.contactInfo }}</span>
                  <span v-if="s._count">🏷️ {{ s._count.brands }} brand</span>
                </div>
              </div>
              <div class="flex gap-1 shrink-0">
                <button
                  @click="openSupplierEdit(s)"
                  class="h-8 px-2.5 rounded-btn border border-line-300 hover:border-royal-700 text-xs font-medium text-ink-primary"
                >
                  Sửa
                </button>
                <button
                  @click="deleteSupplier(s)"
                  class="h-8 px-2.5 rounded-btn border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium"
                >
                  Xoá
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- ── THƯƠNG HIỆU ─────────────────────────────────────── -->
        <section class="bg-white border border-line-200 rounded-card shadow-card p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-base font-bold text-ink-primary">Thương hiệu</h2>
            <button
              @click="openBrandCreate"
              class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold"
            >
              + Thêm TH
            </button>
          </div>

          <!-- Skeleton -->
          <div v-if="loadingBrands" class="space-y-2">
            <div v-for="i in 4" :key="i" class="h-14 bg-surface-soft animate-pulse rounded-lg"></div>
          </div>

          <!-- Empty -->
          <div
            v-else-if="brands.length === 0"
            class="py-10 text-center text-sm text-ink-secondary"
          >
            Chưa có thương hiệu nào. Bấm "+ Thêm TH" để tạo.
          </div>

          <!-- List -->
          <ul v-else class="space-y-2">
            <li
              v-for="b in brands"
              :key="b.id"
              class="border border-line-200 rounded-lg p-3 flex items-start gap-3"
              :class="b.active === false ? 'opacity-50' : ''"
            >
              <div class="min-w-0 flex-1">
                <div class="font-semibold text-ink-primary truncate">{{ b.name }}</div>
                <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2">
                  <span>🏭 {{ b.supplier?.name || supplierName(b.supplierId) }}</span>
                  <span v-if="b._count">📦 {{ b._count.products }} SP</span>
                </div>
                <div v-if="b.description" class="text-xs text-ink-secondary mt-0.5 line-clamp-2">
                  {{ b.description }}
                </div>
              </div>
              <div class="flex gap-1 shrink-0">
                <button
                  @click="openBrandEdit(b)"
                  class="h-8 px-2.5 rounded-btn border border-line-300 hover:border-royal-700 text-xs font-medium text-ink-primary"
                >
                  Sửa
                </button>
                <button
                  @click="deleteBrand(b)"
                  class="h-8 px-2.5 rounded-btn border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium"
                >
                  Xoá
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <!-- ── Supplier dialog ─────────────────────────────────────── -->
    <div
      v-if="supplierDialog"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="supplierDialog = false"
    >
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">
            {{ supplierForm.id ? 'Sửa NCC' : 'Thêm NCC' }}
          </h3>
          <button @click="supplierDialog = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <form @submit.prevent="saveSupplier" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Tên NCC *</label>
            <input v-model="supplierForm.name" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none" />
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Quốc gia</label>
            <input v-model="supplierForm.country" placeholder="VD: Pháp" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none" />
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Thông tin liên hệ</label>
            <input v-model="supplierForm.contactInfo" placeholder="SĐT / email / người LH" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none" />
          </div>
          <div class="flex gap-2 pt-2">
            <button
              type="button"
              @click="supplierDialog = false"
              class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50"
              :disabled="supplierSaving"
            >
              Huỷ
            </button>
            <button
              type="submit"
              class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
              :disabled="supplierSaving"
            >
              {{ supplierSaving ? 'Đang lưu...' : 'Lưu' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Brand dialog ────────────────────────────────────────── -->
    <div
      v-if="brandDialog"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="brandDialog = false"
    >
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">
            {{ brandForm.id ? 'Sửa thương hiệu' : 'Thêm thương hiệu' }}
          </h3>
          <button @click="brandDialog = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <form @submit.prevent="saveBrand" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Tên thương hiệu *</label>
            <input v-model="brandForm.name" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none" />
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Nhà cung cấp</label>
            <select v-model="brandForm.supplierId" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none bg-white">
              <option value="">— Không gán —</option>
              <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Mô tả</label>
            <textarea v-model="brandForm.description" rows="2" class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none resize-none" />
          </div>
          <div class="flex gap-2 pt-2">
            <button
              type="button"
              @click="brandDialog = false"
              class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50"
              :disabled="brandSaving"
            >
              Huỷ
            </button>
            <button
              type="submit"
              class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
              :disabled="brandSaving"
            >
              {{ brandSaving ? 'Đang lưu...' : 'Lưu' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
