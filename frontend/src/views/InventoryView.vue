<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2">
      <div>
        <h1 class="text-h5 mb-0 d-flex align-center">
          <v-icon class="mr-2" color="primary">mdi-warehouse</v-icon>
          Quản lý kho
        </h1>
        <div class="text-caption text-medium-emphasis">
          Theo dõi lô hàng, HSD, nhập xuất, kiểm kê
        </div>
      </div>
      <v-spacer />
      <v-btn v-if="isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
        Nhập lô mới
      </v-btn>
    </div>

    <!-- Inventory alerts banner (collapse-able) -->
    <InventoryAlertsBanner />

    <!-- KPI cards -->
    <v-row dense class="mb-3">
      <v-col cols="6" sm="3">
        <v-card variant="flat" rounded="xl" class="kpi-card">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis">Tổng SKU đang bán</div>
            <div class="text-h5 font-mono font-weight-bold mt-1">{{ summary?.skuTotal ?? '—' }}</div>
            <div v-if="summary?.skuOutOfStock !== undefined" class="text-caption mt-1" :class="summary.skuOutOfStock > 0 ? 'text-error' : 'text-success'">
              {{ summary.skuOutOfStock }} hết hàng
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" rounded="xl" class="kpi-card">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis">Tổng lô đang bán</div>
            <div class="text-h5 font-mono font-weight-bold mt-1">{{ summary?.batchActive ?? '—' }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" rounded="xl" class="kpi-card kpi-card--warn">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis">Sắp hết hạn (90 ngày)</div>
            <div class="text-h5 font-mono font-weight-bold mt-1 text-warning">
              {{ summary?.expiringSoon ?? '—' }}
            </div>
            <a v-if="(summary?.expiringSoon ?? 0) > 0" href="#" class="text-caption text-decoration-underline" @click.prevent="filterExpiring">
              Xem ngay
            </a>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card variant="flat" rounded="xl" class="kpi-card">
          <v-card-text class="pa-3">
            <div class="text-caption text-medium-emphasis">Giá trị tồn (theo cost)</div>
            <div class="text-h6 font-mono font-weight-bold mt-1 text-primary">
              {{ formatVND(summary?.stockValue ?? 0) }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Tabs -->
    <v-tabs v-model="tab" color="primary" class="mb-3">
      <v-tab value="batches">
        <v-icon size="16" class="mr-1">mdi-package-variant</v-icon>
        Lô hàng
      </v-tab>
      <v-tab value="audit">
        <v-icon size="16" class="mr-1">mdi-history</v-icon>
        Audit log
      </v-tab>
      <v-tab value="brand">
        <v-icon size="16" class="mr-1">mdi-tag-multiple</v-icon>
        Báo cáo theo brand
      </v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <!-- ── Tab 1: Batches ───────────────────────────────────────── -->
      <v-window-item value="batches">
        <!-- Filter bar -->
        <v-card variant="flat" rounded="xl" class="px-4 py-3 mb-3">
          <v-row dense align="center">
            <v-col cols="12" sm="6" md="4">
              <v-text-field
                v-model="filters.search"
                placeholder="Tìm SKU / tên SP / mã lô..."
                prepend-inner-icon="mdi-magnify"
                clearable
                hide-details
                @update:model-value="onFilter"
              />
            </v-col>
            <v-col cols="6" sm="6" md="3">
              <v-select
                v-model="filters.brandIds"
                :items="brandItems"
                item-title="text"
                item-value="value"
                placeholder="Brand"
                multiple
                chips
                closable-chips
                clearable
                hide-details
                @update:model-value="onFilter"
              />
            </v-col>
            <v-col cols="6" sm="6" md="2">
              <v-select
                v-model="filters.statuses"
                :items="statusItems"
                item-title="text"
                item-value="value"
                placeholder="Trạng thái"
                multiple
                chips
                closable-chips
                clearable
                hide-details
                @update:model-value="onFilter"
              />
            </v-col>
            <v-col cols="12" sm="6" md="3">
              <v-select
                v-model="filters.expiryWindow"
                :items="expiryItems"
                item-title="text"
                item-value="value"
                placeholder="HSD"
                clearable
                hide-details
                @update:model-value="onFilter"
              />
            </v-col>
          </v-row>
          <div v-if="hasActiveFilters" class="text-right mt-2">
            <v-btn variant="text" size="small" prepend-icon="mdi-close" @click="resetFilters">
              Xoá bộ lọc
            </v-btn>
          </div>
        </v-card>

        <!-- Loading skeleton -->
        <v-card v-if="loading && batches.length === 0" variant="flat" rounded="xl" class="pa-4">
          <v-skeleton-loader type="table" />
        </v-card>

        <!-- Empty -->
        <v-card v-else-if="!loading && batches.length === 0" variant="flat" rounded="xl" class="empty-state pa-8 text-center">
          <v-icon size="80" color="grey-lighten-1" class="mb-4">mdi-package-variant-closed</v-icon>
          <div class="text-h6 mb-2">
            {{ hasActiveFilters ? 'Không tìm thấy lô nào' : 'Chưa có lô hàng nào' }}
          </div>
          <v-btn v-if="!hasActiveFilters && isAdmin" color="primary" prepend-icon="mdi-plus" @click="openCreate">
            Nhập lô đầu tiên
          </v-btn>
          <v-btn v-else-if="hasActiveFilters" variant="text" prepend-icon="mdi-close" @click="resetFilters">
            Xoá bộ lọc
          </v-btn>
        </v-card>

        <!-- Table -->
        <v-card v-else variant="flat" rounded="xl">
          <v-table density="comfortable" class="batches-table">
            <thead>
              <tr>
                <th>Mã lô / SP</th>
                <th>Brand</th>
                <th>HSD</th>
                <th class="text-right">Tồn / Nhập</th>
                <th>Kho</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in batches" :key="b.id" class="batch-row">
                <td>
                  <div class="font-mono font-weight-medium">{{ b.batchCode }}</div>
                  <div class="text-caption text-medium-emphasis">
                    {{ b.product?.name }}
                    <span class="font-mono ml-1">({{ b.product?.sku }})</span>
                  </div>
                </td>
                <td>
                  <v-chip v-if="b.product?.brand" size="x-small" variant="tonal" color="primary">
                    {{ b.product.brand.name }}
                  </v-chip>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
                <td>
                  <div v-if="b.expiryDate">
                    {{ formatDate(b.expiryDate) }}
                  </div>
                  <div v-else class="text-medium-emphasis">—</div>
                  <v-chip
                    v-if="b.warning"
                    :color="expiryBadgeColor(b.warning)"
                    size="x-small"
                    variant="tonal"
                    class="mt-1"
                  >
                    {{ expiryBadgeLabel(b) }}
                  </v-chip>
                </td>
                <td class="text-right">
                  <div class="font-mono font-weight-bold" :class="qtyTextColor(b)">
                    {{ b.currentQuantity }}
                  </div>
                  <div class="text-caption text-medium-emphasis font-mono">
                    / {{ b.importQuantity }} nhập
                  </div>
                </td>
                <td class="text-caption">{{ b.warehouse?.name ?? '—' }}</td>
                <td>
                  <v-chip
                    :color="statusInfo(b.status).color"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ statusInfo(b.status).text }}
                  </v-chip>
                </td>
                <td>
                  <v-menu>
                    <template #activator="{ props: actProps }">
                      <v-btn icon size="x-small" variant="text" v-bind="actProps">
                        <v-icon>mdi-dots-vertical</v-icon>
                      </v-btn>
                    </template>
                    <v-list density="compact">
                      <v-list-item
                        prepend-icon="mdi-history"
                        @click="openAuditLog(b)"
                      >
                        <v-list-item-title>Xem lịch sử</v-list-item-title>
                      </v-list-item>
                      <template v-if="isAdmin && b.status === 'active'">
                        <v-divider />
                        <v-list-item
                          prepend-icon="mdi-tune"
                          @click="openAdjust(b)"
                        >
                          <v-list-item-title>Điều chỉnh tồn</v-list-item-title>
                        </v-list-item>
                        <v-list-item
                          prepend-icon="mdi-pencil"
                          @click="openEdit(b)"
                        >
                          <v-list-item-title>Sửa thông tin</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item
                          prepend-icon="mdi-alert-octagon-outline"
                          base-color="error"
                          @click="askRecall(b)"
                        >
                          <v-list-item-title>Thu hồi lô</v-list-item-title>
                        </v-list-item>
                      </template>
                    </v-list>
                  </v-menu>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>

        <div v-if="batches.length > 0" class="text-caption text-medium-emphasis mt-3 text-center">
          Hiển thị {{ batches.length }} / {{ total }} lô
        </div>
      </v-window-item>

      <!-- ── Tab 2: Audit log ─────────────────────────────────────── -->
      <v-window-item value="audit">
        <v-card variant="flat" rounded="xl" class="px-4 py-3 mb-3">
          <v-row dense align="center">
            <v-col cols="12" sm="4">
              <v-select
                v-model="auditFilters.type"
                :items="auditTypeItems"
                item-title="text"
                item-value="value"
                placeholder="Loại biến động"
                clearable
                hide-details
                @update:model-value="loadAudit"
              />
            </v-col>
            <v-col cols="6" sm="4">
              <v-text-field
                v-model="auditFilters.from"
                type="date"
                placeholder="Từ"
                hide-details
                clearable
                @update:model-value="loadAudit"
              />
            </v-col>
            <v-col cols="6" sm="4">
              <v-text-field
                v-model="auditFilters.to"
                type="date"
                placeholder="Đến"
                hide-details
                clearable
                @update:model-value="loadAudit"
              />
            </v-col>
          </v-row>
        </v-card>

        <v-card variant="flat" rounded="xl">
          <v-progress-linear v-if="auditLoading" indeterminate color="primary" />
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Loại</th>
                <th>Sản phẩm / Lô</th>
                <th class="text-right">Số lượng</th>
                <th>Ghi chú</th>
                <th>Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!auditLoading && auditMovements.length === 0">
                <td colspan="6" class="text-center text-medium-emphasis py-6">
                  Không có dữ liệu
                </td>
              </tr>
              <tr v-for="m in auditMovements" :key="m.id">
                <td class="text-caption">{{ formatDateTime(m.createdAt) }}</td>
                <td>
                  <v-chip :color="movementTypeInfo(m.type).color" size="x-small" variant="tonal">
                    <v-icon size="12" class="mr-1">{{ movementTypeInfo(m.type).icon }}</v-icon>
                    {{ movementTypeInfo(m.type).text }}
                  </v-chip>
                </td>
                <td>
                  <div class="text-body-2">{{ m.product?.name ?? '—' }}</div>
                  <div class="text-caption text-medium-emphasis font-mono">
                    {{ m.product?.sku ?? '' }} · {{ m.batch?.batchCode ?? '' }}
                  </div>
                </td>
                <td class="text-right font-mono font-weight-bold" :class="m.quantity > 0 ? 'text-success' : 'text-error'">
                  {{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}
                </td>
                <td class="text-caption">
                  {{ m.note }}
                  <a v-if="m.order" href="#" class="text-decoration-underline ml-2" @click.prevent="goOrder(m.order!.id)">
                    {{ m.order.orderCode }}
                  </a>
                </td>
                <td class="text-caption">{{ m.createdByName ?? '—' }}</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>

      <!-- ── Tab 3: By brand ─────────────────────────────────────── -->
      <v-window-item value="brand">
        <v-card variant="flat" rounded="xl">
          <v-table density="comfortable">
            <thead>
              <tr>
                <th>Brand</th>
                <th class="text-right">Số SP</th>
                <th class="text-right">Số lô</th>
                <th class="text-right">Tổng tồn</th>
                <th class="text-right">Giá trị tồn (cost)</th>
                <th class="text-right">Sắp hết hạn</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="byBrand.length === 0">
                <td colspan="6" class="text-center text-medium-emphasis py-6">Chưa có dữ liệu</td>
              </tr>
              <tr v-for="b in byBrand" :key="b.brandId">
                <td>
                  <v-chip color="primary" size="small" variant="tonal">{{ b.brandName }}</v-chip>
                </td>
                <td class="text-right font-mono">{{ b.productCount }}</td>
                <td class="text-right font-mono">{{ b.batchCount }}</td>
                <td class="text-right font-mono font-weight-bold">{{ b.totalQuantity }}</td>
                <td class="text-right font-mono">{{ formatVND(b.stockValue) }}</td>
                <td class="text-right">
                  <v-chip
                    v-if="b.expiringCount > 0"
                    color="warning"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ b.expiringCount }} lô
                  </v-chip>
                  <span v-else class="text-medium-emphasis">—</span>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-window-item>
    </v-window>

    <!-- Dialogs -->
    <BatchFormDialog
      v-model="formDialog"
      :editing="editing"
      @saved="onSaved"
    />
    <BatchAdjustDialog
      v-model="adjustDialog"
      :batch="adjustTarget"
      @saved="onSaved"
    />
    <BatchAuditLogPanel
      v-model="auditPanel"
      :batch="auditTarget"
    />

    <!-- Confirm recall -->
    <v-dialog v-model="recallDialog" max-width="420">
      <v-card>
        <v-card-title>Thu hồi lô {{ recallTarget?.batchCode }}?</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
            Sau khi thu hồi: tồn lô về 0, status = recalled, KHÔNG xuất bán được nữa. Movement audit log sẽ ghi nhận.
          </v-alert>
          <v-textarea
            v-model="recallReason"
            label="Lý do thu hồi *"
            rows="3"
            autofocus
            hide-details="auto"
            :error-messages="recallTried && !recallReason ? 'Bắt buộc' : ''"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="recallDialog = false">Bỏ qua</v-btn>
          <v-btn color="error" :loading="saving" @click="confirmRecall">Thu hồi</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snack.show" :color="snack.color" :timeout="3500">
      {{ snack.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import {
  useInventory,
  BATCH_STATUS_OPTIONS,
  EXPIRY_WINDOW_OPTIONS,
  MOVEMENT_TYPE_OPTIONS,
  formatVND,
  formatDate,
  expiryBadgeColor,
  expiryBadgeLabel,
  movementTypeInfo,
  type Batch,
  type InventoryMovement,
} from '@/composables/use-inventory';
import { useBrands } from '@/composables/use-brands';
import BatchFormDialog from '@/components/inventory/BatchFormDialog.vue';
import BatchAdjustDialog from '@/components/inventory/BatchAdjustDialog.vue';
import BatchAuditLogPanel from '@/components/inventory/BatchAuditLogPanel.vue';
import InventoryAlertsBanner from '@/components/inventory/InventoryAlertsBanner.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const isAdmin = computed(() => {
  const r = authStore.user?.role ?? '';
  return r === 'owner' || r === 'admin';
});

const tab = ref<'batches' | 'audit' | 'brand'>('batches');

const {
  batches,
  total,
  loading,
  saving,
  summary,
  byBrand,
  filters,
  hasActiveFilters,
  fetchBatches,
  fetchSummary,
  fetchByBrand,
  fetchMovements,
  recallBatch,
  resetFilters,
} = useInventory();

const { brands, fetchBrands } = useBrands();

const brandItems = computed(() =>
  brands.value.filter((b) => b.active).map((b) => ({ text: b.name, value: b.id })),
);
const statusItems = BATCH_STATUS_OPTIONS.map((s) => ({ text: s.text, value: s.value }));
const expiryItems = EXPIRY_WINDOW_OPTIONS.map((e) => ({ text: e.text, value: e.value }));
const auditTypeItems = MOVEMENT_TYPE_OPTIONS.map((t) => ({ text: t.text, value: t.value }));

function statusInfo(s: string) {
  return BATCH_STATUS_OPTIONS.find((opt) => opt.value === s) ?? BATCH_STATUS_OPTIONS[0];
}

function qtyTextColor(b: Batch): string {
  if (b.currentQuantity === 0) return 'text-error';
  if (b.currentQuantity < 10) return 'text-warning';
  return '';
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let debouncer: ReturnType<typeof setTimeout> | null = null;
function onFilter() {
  if (debouncer) clearTimeout(debouncer);
  debouncer = setTimeout(() => fetchBatches(), 250);
}

function filterExpiring() {
  filters.expiryWindow = '90';
  fetchBatches();
}

// ── Audit tab ──────────────────────────────────────────────────────
const auditMovements = ref<InventoryMovement[]>([]);
const auditLoading = ref(false);
const auditFilters = reactive({ type: '' as string, from: '', to: '' });

async function loadAudit() {
  auditLoading.value = true;
  try {
    const res = await fetchMovements({
      type: auditFilters.type || undefined,
      from: auditFilters.from || undefined,
      to: auditFilters.to || undefined,
      limit: 100,
    });
    auditMovements.value = res.movements;
  } finally {
    auditLoading.value = false;
  }
}

watch(tab, async (t) => {
  if (t === 'audit' && auditMovements.value.length === 0) await loadAudit();
  if (t === 'brand' && byBrand.value.length === 0) await fetchByBrand();
});

// ── Dialogs / actions ─────────────────────────────────────────────
const formDialog = ref(false);
const editing = ref<Batch | null>(null);
function openCreate() {
  editing.value = null;
  formDialog.value = true;
}
function openEdit(b: Batch) {
  editing.value = b;
  formDialog.value = true;
}

const adjustDialog = ref(false);
const adjustTarget = ref<Batch | null>(null);
function openAdjust(b: Batch) {
  adjustTarget.value = b;
  adjustDialog.value = true;
}

const auditPanel = ref(false);
const auditTarget = ref<Batch | null>(null);
function openAuditLog(b: Batch) {
  auditTarget.value = b;
  auditPanel.value = true;
}

const recallDialog = ref(false);
const recallTarget = ref<Batch | null>(null);
const recallReason = ref('');
const recallTried = ref(false);
function askRecall(b: Batch) {
  recallTarget.value = b;
  recallReason.value = '';
  recallTried.value = false;
  recallDialog.value = true;
}
async function confirmRecall() {
  recallTried.value = true;
  if (!recallReason.value.trim() || !recallTarget.value) return;
  try {
    await recallBatch(recallTarget.value.id, recallReason.value.trim());
    recallDialog.value = false;
    showSnack('Đã thu hồi lô', 'info');
    await Promise.all([fetchBatches(), fetchSummary()]);
  } catch (err: any) {
    showSnack(err?.message ?? 'Thu hồi thất bại', 'error');
  }
}

async function onSaved() {
  showSnack('Đã lưu', 'success');
  await Promise.all([fetchBatches(), fetchSummary(), fetchByBrand()]);
}

function goOrder(id: string) {
  router.push(`/orders/${id}`);
}

const snack = reactive<{ show: boolean; text: string; color: string }>({ show: false, text: '', color: 'success' });
function showSnack(text: string, color: 'success' | 'error' | 'info' = 'success') {
  snack.text = text;
  snack.color = color;
  snack.show = true;
}

onMounted(async () => {
  // Pre-filter from query (e.g. from ProductDetailView "Quản lý kho cho SP này")
  const productId = route.query.productId;
  if (typeof productId === 'string' && productId) {
    filters.productId = productId;
  }
  await Promise.all([fetchBrands(), fetchBatches(), fetchSummary()]);
});
</script>

<style scoped>
.gap-2 { gap: 8px; }

.kpi-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.kpi-card--warn {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.25);
}

.batches-table .batch-row:hover {
  background: rgba(255, 255, 255, 0.04);
}
.empty-state {
  border: 1px dashed rgba(255, 255, 255, 0.18);
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

@media (max-width: 600px) {
  .batches-table th:nth-child(2),
  .batches-table th:nth-child(5),
  .batches-table td:nth-child(2),
  .batches-table td:nth-child(5) {
    display: none;
  }
}
</style>
