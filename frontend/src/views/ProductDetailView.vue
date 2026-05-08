<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <v-btn
        icon
        variant="text"
        size="small"
        @click="goBack"
        title="Quay lại danh sách"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <div>
        <h1 class="text-h6 mb-0">
          {{ isNew ? 'Thêm sản phẩm' : form.name || 'Chi tiết sản phẩm' }}
        </h1>
        <div v-if="!isNew && form.sku" class="text-caption text-medium-emphasis font-mono">
          {{ form.sku }}
        </div>
      </div>
      <v-spacer />
      <v-btn
        v-if="!isNew && canEdit"
        color="error"
        variant="text"
        prepend-icon="mdi-archive-outline"
        @click="confirmArchive"
      >
        Ngừng bán
      </v-btn>
      <v-btn
        v-if="canEdit"
        color="primary"
        :loading="saving"
        prepend-icon="mdi-content-save"
        @click="onSave"
      >
        {{ isNew ? 'Tạo sản phẩm' : 'Lưu thay đổi' }}
      </v-btn>
    </div>

    <v-alert
      v-if="!canEdit"
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
    >
      Bạn đang xem ở chế độ chỉ đọc. Cần quyền admin/owner để chỉnh sửa sản phẩm.
    </v-alert>

    <v-alert
      v-if="loadError"
      type="error"
      variant="tonal"
      class="mb-4"
    >
      {{ loadError }}
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <v-expansion-panels v-model="openedSections" multiple variant="accordion">
      <!-- Section 1: Thông tin cơ bản -->
      <v-expansion-panel value="basic">
        <v-expansion-panel-title>
          <span class="section-header">
            <span class="mr-2">📦</span>
            Thông tin cơ bản
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.sku"
                label="SKU *"
                placeholder="VD: MNH-MEN-60"
                :readonly="!canEdit"
                :error-messages="errors.sku"
                hint="Mã định danh duy nhất, viết HOA, vd: BRAND-PROD-SIZE"
                persistent-hint
                class="font-mono"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.name"
                label="Tên sản phẩm *"
                :readonly="!canEdit"
                :error-messages="errors.name"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.brandId"
                :items="brandItems"
                item-title="text"
                item-value="value"
                label="Brand *"
                :readonly="!canEdit"
                :error-messages="errors.brandId"
              >
                <template #append>
                  <v-btn
                    v-if="canEdit"
                    icon
                    size="small"
                    variant="text"
                    color="primary"
                    title="Thêm brand mới"
                    @click="brandDialog = true"
                  >
                    <v-icon>mdi-plus</v-icon>
                  </v-btn>
                </template>
              </v-select>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.packageSize"
                label="Quy cách"
                placeholder="VD: 60 viên/hộp"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.status"
                :items="statusItems"
                item-title="text"
                item-value="value"
                label="Trạng thái"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                v-model="form.unit"
                :items="unitItems"
                item-title="text"
                item-value="value"
                label="Đơn vị tính"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="form.mainImageUrl"
                label="URL hình ảnh chính"
                placeholder="https://..."
                :readonly="!canEdit"
                hint="Paste link ảnh từ Drive / CDN. Upload từ máy sẽ có ở Session sau."
                persistent-hint
              />
              <v-img
                v-if="form.mainImageUrl"
                :src="form.mainImageUrl"
                max-width="200"
                max-height="200"
                cover
                class="mt-3 rounded-lg"
              />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Section 2: Mức giá sỉ -->
      <v-expansion-panel value="prices">
        <v-expansion-panel-title>
          <span class="section-header">
            <span class="mr-2">💰</span>
            Mức giá sỉ
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <ProductPriceTierEditor
            :product-id="productId"
            :prices="prices"
            :can-edit="canEdit"
            @updated="reloadPrices"
            @error="showSnackbar($event, 'error')"
          />

          <v-divider class="my-4" />

          <div v-if="canSeeCost" class="cost-section">
            <div class="d-flex align-center mb-2">
              <v-icon size="16" color="amber" class="mr-1">mdi-lock</v-icon>
              <span class="text-caption text-medium-emphasis">
                Giá vốn — chỉ admin/owner thấy
              </span>
            </div>
            <v-text-field
              v-model.number="form.costPrice"
              type="number"
              label="Giá vốn (đ)"
              :readonly="!canEdit"
              suffix="đ"
              class="font-mono"
              hide-details
              persistent-hint
              hint="Giá vốn TB tính từ FIFO — tự cập nhật khi tạo đơn nhập"
            />
          </div>
          <div v-else class="text-caption text-medium-emphasis">
            <v-icon size="14" class="mr-1">mdi-lock</v-icon>
            Giá vốn được ẩn với role hiện tại
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Section 3: Thông tin TPCN -->
      <v-expansion-panel value="tpcn">
        <v-expansion-panel-title>
          <span class="section-header">
            <span class="mr-2">🌿</span>
            Thông tin TPCN
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row dense>
            <v-col cols="12">
              <v-textarea
                v-model="form.mainUse"
                label="Công dụng chính"
                rows="3"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.targetAudience"
                label="Đối tượng sử dụng"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="form.shelfLifeMonths"
                type="number"
                label="HSD (số tháng)"
                :readonly="!canEdit"
                suffix="tháng"
              />
            </v-col>
            <v-col cols="12">
              <v-textarea
                v-model="form.usageMethod"
                label="Cách dùng"
                rows="3"
                :readonly="!canEdit"
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                v-model="form.registrationNumber"
                label="Số đăng ký công bố"
                placeholder="VD: 5145/2023/ĐKSP"
                :readonly="!canEdit"
                class="font-mono"
              />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Section 4: Tồn kho -->
      <v-expansion-panel value="stock">
        <v-expansion-panel-title>
          <span class="section-header">
            <span class="mr-2">📦</span>
            Tồn kho
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field
                :model-value="form.totalStock"
                label="Tồn hiện tại (auto từ lô)"
                readonly
                :suffix="form.unit"
                hint="Tự động tính = SUM(currentQuantity) các lô active"
                persistent-hint
                class="font-mono"
              />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                v-model.number="form.warningStock"
                type="number"
                label="Mức cảnh báo"
                :readonly="!canEdit"
                :suffix="form.unit"
                hint="Cảnh báo vàng khi tồn ≤ mức này"
                persistent-hint
                class="font-mono"
              />
            </v-col>
          </v-row>

          <!-- Mini-table batches -->
          <v-divider class="my-4" />
          <div class="d-flex align-center mb-2">
            <span class="text-caption font-weight-bold" style="text-transform: uppercase; letter-spacing: 0.04em;">
              <v-icon size="14" class="mr-1">mdi-package-variant</v-icon>
              Các lô hiện có
            </span>
            <v-spacer />
            <v-btn
              variant="text"
              size="small"
              prepend-icon="mdi-warehouse"
              @click="goInventory"
            >
              Quản lý kho cho SP này
            </v-btn>
          </div>
          <v-progress-linear v-if="batchesLoading" indeterminate color="primary" />
          <div v-else-if="productBatches.length === 0" class="text-caption text-medium-emphasis text-center py-3 batches-empty">
            Chưa có lô nào
          </div>
          <v-table v-else density="compact" class="batches-mini-table">
            <thead>
              <tr>
                <th>Mã lô</th>
                <th>HSD</th>
                <th class="text-right">Tồn / Nhập</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in productBatches.slice(0, 5)" :key="b.id">
                <td class="font-mono">{{ b.batchCode }}</td>
                <td class="text-caption">{{ formatBatchDate(b.expiryDate) }}</td>
                <td class="text-right font-mono">
                  <span :class="b.currentQuantity === 0 ? 'text-error' : ''">{{ b.currentQuantity }}</span>
                  / {{ b.importQuantity }}
                </td>
                <td>
                  <v-chip v-if="b.warning === 'expired'" color="error" size="x-small" variant="tonal">Hết hạn</v-chip>
                  <v-chip v-else-if="b.warning === 'expiring_soon'" color="warning" size="x-small" variant="tonal">Sắp hết hạn</v-chip>
                  <v-chip v-else color="success" size="x-small" variant="tonal">Còn hạn</v-chip>
                </td>
              </tr>
            </tbody>
          </v-table>
          <div v-if="productBatches.length > 5" class="text-caption text-medium-emphasis text-center mt-2">
            và {{ productBatches.length - 5 }} lô khác — xem đầy đủ ở Quản lý kho
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Section 5: Tài liệu Marketing -->
      <v-expansion-panel value="docs">
        <v-expansion-panel-title>
          <span class="section-header">
            <span class="mr-2">📂</span>
            Tài liệu Marketing
          </span>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <MarketingDocsList
            :product-id="productId"
            :docs="form.marketingDocs"
            :can-edit="canEdit"
            @updated="reloadProduct"
            @error="showSnackbar($event, 'error')"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Brand quick add dialog -->
    <BrandFormDialog
      v-model="brandDialog"
      :editing="null"
      :suppliers="suppliers"
      @saved="onBrandSaved"
    />

    <!-- Confirm archive -->
    <v-dialog v-model="archiveDialog" max-width="380">
      <v-card>
        <v-card-title>Ngừng bán sản phẩm?</v-card-title>
        <v-card-text>
          Sản phẩm sẽ chuyển sang trạng thái <strong>Ngừng bán</strong> và ẩn khỏi các filter mặc định. Có thể khôi phục bất cứ lúc nào.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="archiveDialog = false">Huỷ</v-btn>
          <v-btn color="error" :loading="saving" @click="onArchive">Ngừng bán</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3500">
      {{ snackbar.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  useProducts,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_UNIT_OPTIONS,
  type Product,
  type MarketingDoc,
  type ProductPrice,
} from '@/composables/use-products';
import { useBrands } from '@/composables/use-brands';
import ProductPriceTierEditor from '@/components/products/ProductPriceTierEditor.vue';
import MarketingDocsList from '@/components/products/MarketingDocsList.vue';
import BrandFormDialog from '@/components/products/BrandFormDialog.vue';
import { useBatches } from '@/composables/use-batches';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const isNew = computed(() => route.params.id === 'new' || !route.params.id);
const productId = ref<string | null>(isNew.value ? null : (route.params.id as string));

const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});
const canEdit = computed(() => isAdmin.value);
const canSeeCost = computed(() => isAdmin.value);

const statusItems = PRODUCT_STATUS_OPTIONS.map((s) => ({ text: s.text, value: s.value }));
const unitItems = PRODUCT_UNIT_OPTIONS.map((u) => ({ text: u.text, value: u.value }));

const {
  saving,
  fetchProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} = useProducts();

const { brands, suppliers, fetchBrands, fetchSuppliers } = useBrands();

const brandItems = computed(() =>
  brands.value
    .filter((b) => b.active)
    .map((b) => ({ text: b.name, value: b.id })),
);

const loading = ref(false);
const loadError = ref('');
const openedSections = ref<string[]>(['basic', 'prices', 'tpcn', 'stock', 'docs']);

const form = reactive<{
  sku: string;
  name: string;
  brandId: string | null;
  packageSize: string;
  mainImageUrl: string;
  status: 'active' | 'discontinued' | 'coming_soon';
  unit: string;
  mainUse: string;
  targetAudience: string;
  usageMethod: string;
  shelfLifeMonths: number | null;
  registrationNumber: string;
  totalStock: number;
  warningStock: number;
  costPrice: number | null;
  marketingDocs: MarketingDoc[];
}>({
  sku: '',
  name: '',
  brandId: null,
  packageSize: '',
  mainImageUrl: '',
  status: 'active',
  unit: 'hộp',
  mainUse: '',
  targetAudience: '',
  usageMethod: '',
  shelfLifeMonths: null,
  registrationNumber: '',
  totalStock: 0,
  warningStock: 30,
  costPrice: null,
  marketingDocs: [],
});

const prices = ref<ProductPrice[]>([]);

const errors = reactive<{ sku?: string; name?: string; brandId?: string }>({});

const snackbar = reactive<{ show: boolean; text: string; color: string }>({
  show: false,
  text: '',
  color: 'success',
});

function showSnackbar(text: string, color: 'success' | 'error' | 'info' = 'success') {
  snackbar.text = text;
  snackbar.color = color;
  snackbar.show = true;
}

function applyProduct(p: Product) {
  form.sku = p.sku;
  form.name = p.name;
  form.brandId = p.brandId;
  form.packageSize = p.packageSize ?? '';
  form.mainImageUrl = p.mainImageUrl ?? '';
  form.status = p.status;
  form.unit = p.unit;
  form.mainUse = p.mainUse ?? '';
  form.targetAudience = p.targetAudience ?? '';
  form.usageMethod = p.usageMethod ?? '';
  form.shelfLifeMonths = p.shelfLifeMonths;
  form.registrationNumber = p.registrationNumber ?? '';
  form.totalStock = p.totalStock;
  form.warningStock = p.warningStock;
  form.costPrice = p.costPrice == null ? null : Number(p.costPrice);
  form.marketingDocs = Array.isArray(p.marketingDocs) ? p.marketingDocs : [];
  prices.value = (p.prices ?? []).map((pr) => ({ ...pr, price: Number(pr.price) }));
}

async function reloadProduct() {
  if (!productId.value) return;
  loading.value = true;
  try {
    const p = await fetchProduct(productId.value);
    if (p) applyProduct(p);
    // Refresh batches mini-table at the same time
    await loadBatches();
  } finally {
    loading.value = false;
  }
}

const { batches: productBatches, loading: batchesLoading, fetchProductBatches } = useBatches();

async function loadBatches() {
  if (!productId.value) return;
  await fetchProductBatches(productId.value, { includeEmpty: true });
}

function formatBatchDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });
}

function goInventory() {
  if (!productId.value) return;
  router.push({ path: '/inventory', query: { productId: productId.value } });
}

async function reloadPrices() {
  if (!productId.value) return;
  // Refetch product to keep prices array fresh (including isDefault flips)
  await reloadProduct();
}

async function onSave() {
  errors.sku = undefined;
  errors.name = undefined;
  errors.brandId = undefined;
  if (!form.sku.trim()) {
    errors.sku = 'Bắt buộc';
    showSnackbar('Vui lòng điền SKU', 'error');
    return;
  }
  if (!form.name.trim()) {
    errors.name = 'Bắt buộc';
    showSnackbar('Vui lòng điền tên sản phẩm', 'error');
    return;
  }
  if (!form.brandId) {
    errors.brandId = 'Bắt buộc';
    showSnackbar('Vui lòng chọn brand', 'error');
    return;
  }

  const payload = {
    sku: form.sku.trim(),
    name: form.name.trim(),
    brandId: form.brandId,
    packageSize: form.packageSize?.trim() || null,
    mainImageUrl: form.mainImageUrl?.trim() || null,
    status: form.status,
    unit: form.unit,
    mainUse: form.mainUse?.trim() || null,
    targetAudience: form.targetAudience?.trim() || null,
    usageMethod: form.usageMethod?.trim() || null,
    shelfLifeMonths: form.shelfLifeMonths ?? null,
    registrationNumber: form.registrationNumber?.trim() || null,
    warningStock: form.warningStock ?? 30,
    costPrice: form.costPrice == null || isNaN(Number(form.costPrice)) ? null : Number(form.costPrice),
  };

  try {
    if (isNew.value) {
      const created = await createProduct(payload);
      if (created) {
        productId.value = created.id;
        applyProduct(created);
        showSnackbar('Tạo sản phẩm thành công — 4 mức giá mặc định đã được tạo', 'success');
        // Replace URL so subsequent saves go through update path
        router.replace(`/products/${created.id}`);
      }
    } else if (productId.value) {
      const updated = await updateProduct(productId.value, payload);
      if (updated) {
        applyProduct(updated);
        showSnackbar('Đã lưu thay đổi', 'success');
      }
    }
  } catch (err: any) {
    showSnackbar(err?.message ?? 'Lưu thất bại', 'error');
  }
}

const archiveDialog = ref(false);

function confirmArchive() {
  archiveDialog.value = true;
}

async function onArchive() {
  if (!productId.value) return;
  const ok = await deleteProduct(productId.value);
  archiveDialog.value = false;
  if (ok) {
    showSnackbar('Đã chuyển sang Ngừng bán', 'info');
    router.push('/products');
  } else {
    showSnackbar('Ngừng bán thất bại', 'error');
  }
}

const brandDialog = ref(false);

function onBrandSaved(brand: { id: string; name: string }) {
  fetchBrands();
  form.brandId = brand.id;
  showSnackbar(`Đã thêm brand "${brand.name}"`, 'success');
}

function goBack() {
  router.push('/products');
}

onMounted(async () => {
  await Promise.all([fetchBrands(), fetchSuppliers()]);
  if (!isNew.value && productId.value) {
    loading.value = true;
    try {
      const p = await fetchProduct(productId.value);
      if (p) {
        applyProduct(p);
        await loadBatches();
      } else {
        loadError.value = 'Không tìm thấy sản phẩm';
      }
    } finally {
      loading.value = false;
    }
  }
});
</script>

<style scoped>
.section-header {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: rgb(var(--v-theme-primary));
}
.font-mono :deep(.v-field__input) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.cost-section {
  padding: 12px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.06);
}
.batches-empty {
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 8px;
}
.batches-mini-table {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 8px;
}
.gap-2 {
  gap: 8px;
}
</style>
