<template>
  <div class="import-form">
    <!-- Header -->
    <div class="d-flex align-center mb-3 flex-wrap gap-2">
      <v-btn icon="mdi-arrow-left" variant="text" density="compact" @click="goBack" />
      <h1 class="text-h6 ml-1">
        {{ editing ? `Sửa phiếu nhập ${state.importCode || ''}` : 'Tạo phiếu nhập mới' }}
      </h1>
      <v-spacer />
      <v-btn
        v-if="editing && state.id"
        variant="outlined"
        color="error"
        prepend-icon="mdi-delete"
        size="small"
        :disabled="saving"
        @click="onDeleteDraft"
      >
        Xoá nháp
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" closable class="mb-3">{{ error }}</v-alert>

    <v-row dense>
      <!-- ══════════ CỘT TRÁI: danh sách sản phẩm ══════════ -->
      <v-col cols="12" md="8">
        <v-card variant="flat" class="section pa-4">
          <div class="d-flex align-center mb-3 flex-wrap gap-2">
            <h2 class="section-title mr-2">Danh sách sản phẩm</h2>
            <v-select
              v-model="state.warehouseId"
              :items="warehouses"
              item-title="name"
              item-value="id"
              density="compact"
              variant="solo-filled"
              flat
              hide-details
              prepend-inner-icon="mdi-warehouse"
              style="max-width: 200px"
            />
            <v-spacer />
            <v-btn
              variant="outlined"
              prepend-icon="mdi-microsoft-excel"
              color="green"
              size="small"
              @click="showExcelDialog = true"
            >
              Excel
            </v-btn>
            <v-btn
              variant="text"
              icon="mdi-barcode-scan"
              size="small"
              title="Quét mã vạch (sắp có)"
              disabled
            />
          </div>

          <!-- Ô tìm + thêm SP inline -->
          <!-- Bám đúng mẫu OrderProductPickerDialog (giao diện bán hàng): KHÔNG
               dùng v-model:search (gây @update:search không bắn ổn định trong
               Vuetify 4 → gõ không ra SP); chỉ lắng nghe @update:search. -->
          <v-autocomplete
            :model-value="productPickId"
            :items="productOptions"
            :loading="searching"
            item-title="label"
            item-value="id"
            placeholder="Tìm SKU / tên sản phẩm để thêm…"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            no-filter
            hide-no-data
            clearable
            class="mb-3"
            @update:search="onSearch"
            @update:model-value="onProductSelected"
          >
            <template #item="{ item, props: ip }">
              <v-list-item v-bind="ip">
                <template #title>
                  <span class="font-mono text-caption">{{ item.raw.sku }}</span> · {{ item.raw.name }}
                </template>
                <template #subtitle>
                  <span v-if="item.raw.costPrice">Giá vốn TB: {{ formatVNDFull(item.raw.costPrice) }}</span>
                  <span v-else>Đơn vị: {{ item.raw.unit ?? '—' }}</span>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <div v-if="state.items.length === 0" class="empty-state">
            <v-icon size="40" color="grey-darken-1">mdi-package-variant-remove</v-icon>
            <div class="mt-2 text-medium-emphasis">Chưa có sản phẩm nào</div>
            <div class="text-caption text-medium-emphasis">Tìm SP ở trên hoặc nhập từ Excel</div>
          </div>

          <v-table v-else density="compact" class="lines-table">
            <thead>
              <tr>
                <th style="width: 30px"></th>
                <th>Sản phẩm</th>
                <th class="text-center" style="width: 90px">Số lượng</th>
                <th class="text-right" style="width: 130px">Giá nhập</th>
                <th class="text-right" style="width: 120px">Thành tiền</th>
                <th style="width: 36px"></th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(line, idx) in state.items" :key="line.id">
                <tr :class="{ 'row-warn': !line.expiryDate }">
                  <td>
                    <v-btn
                      :icon="line._expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                      size="x-small"
                      variant="text"
                      :color="!line.expiryDate ? 'warning' : undefined"
                      :title="line.expiryDate ? 'Mã lô / HSD' : 'Chưa nhập HSD — bấm để nhập'"
                      @click="line._expanded = !line._expanded"
                    />
                  </td>
                  <td>
                    <div class="font-medium">{{ line.product?.name ?? line.productId }}</div>
                    <div class="font-mono text-caption text-medium-emphasis">
                      {{ line.product?.sku ?? '' }}
                      <span v-if="line.batchCode"> · lô {{ line.batchCode }}</span>
                      <span v-if="line.expiryDate"> · HSD {{ formatDateVN(line.expiryDate) }}</span>
                      <span v-else class="text-warning"> · chưa có HSD</span>
                    </div>
                  </td>
                  <td class="text-center">
                    <v-text-field
                      v-model.number="line.quantity"
                      type="number"
                      min="1"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="cell-input"
                    />
                  </td>
                  <td>
                    <v-text-field
                      v-model.number="line.unitCost"
                      type="number"
                      min="0"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="cell-input"
                    />
                  </td>
                  <td class="text-right font-mono total-cell">
                    {{ formatVNDFull(Number(line.quantity || 0) * Number(line.unitCost || 0)) }}
                  </td>
                  <td class="text-center">
                    <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeLine(idx)" />
                  </td>
                </tr>
                <!-- Dòng mở rộng: Mã lô + NSX + HSD -->
                <tr v-if="line._expanded" class="expand-row">
                  <td></td>
                  <td colspan="5">
                    <v-row dense class="py-1">
                      <v-col cols="12" sm="4">
                        <v-text-field
                          v-model="line.batchCode"
                          label="Mã lô"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="6" sm="4">
                        <v-text-field
                          v-model="line.manufactureDate"
                          label="NSX"
                          type="date"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                      <v-col cols="6" sm="4">
                        <v-text-field
                          v-model="line.expiryDate"
                          label="HSD"
                          type="date"
                          density="compact"
                          variant="outlined"
                          hide-details
                        />
                      </v-col>
                    </v-row>
                  </td>
                </tr>
              </template>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <!-- ══════════ CỘT PHẢI: thông tin phiếu ══════════ -->
      <v-col cols="12" md="4">
        <v-card variant="flat" class="section pa-4">
          <h2 class="section-title mb-3">Thông tin phiếu</h2>

          <div class="field-label">Nhà cung cấp</div>
          <div class="d-flex align-center gap-2 mb-1">
            <v-select
              v-model="state.supplierId"
              :items="suppliers"
              item-title="name"
              item-value="id"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              placeholder="Chọn NCC"
              @update:model-value="onSupplierChange"
            />
            <v-btn icon="mdi-plus" color="primary" size="small" variant="flat" title="Thêm NCC" @click="quickAddOpen = true" />
          </div>
          <div v-if="state.supplierId" class="debt-line mb-3">
            <span class="text-medium-emphasis">Công nợ hiện tại:</span>
            <span class="font-mono" :class="supplierDebt > 0 ? 'text-error' : 'text-success'">
              {{ formatVNDFull(supplierDebt) }}
            </span>
          </div>

          <v-text-field
            v-model="state.importDate"
            label="Ngày nhập *"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-text-field
            v-model="state.nccInvoiceNo"
            label="Số hoá đơn NCC"
            placeholder="VD INV-MH-2605-A"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-text-field
            v-model.number="state.shippingFee"
            label="Phí giao hàng"
            type="number"
            min="0"
            suffix="đ"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-3"
          />
          <v-textarea
            v-model="state.notes"
            label="Ghi chú"
            rows="2"
            auto-grow
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-card>
      </v-col>
    </v-row>

    <!-- ══════════ THANH ĐÁY: chiết khấu / cọc / VAT / tổng ══════════ -->
    <v-card variant="flat" class="section summary-bar pa-4 mt-3">
      <v-row dense align="center">
        <v-col cols="6" sm="3" md="2">
          <div class="field-label">Chiết khấu</div>
          <div class="d-flex gap-1">
            <v-text-field
              v-model.number="state.discountValue"
              type="number"
              min="0"
              density="compact"
              variant="outlined"
              hide-details
            />
            <v-select
              v-model="state.discountType"
              :items="[{ title: '%', value: 'percent' }, { title: 'đ', value: 'amount' }]"
              density="compact"
              variant="outlined"
              hide-details
              style="max-width: 72px"
            />
          </div>
        </v-col>
        <v-col cols="6" sm="3" md="2">
          <div class="field-label">Đặt cọc</div>
          <v-text-field
            v-model.number="state.depositAmount"
            type="number"
            min="0"
            suffix="đ"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="6" sm="3" md="2">
          <div class="field-label">Thuế VAT</div>
          <v-select
            v-model.number="state.vatRate"
            :items="VAT_OPTIONS"
            density="compact"
            variant="outlined"
            hide-details
          />
        </v-col>
        <v-col cols="6" sm="3" md="3" class="totals-col">
          <div class="t-row"><span>Giá trị hàng</span><span class="font-mono">{{ formatVNDFull(goodsValue) }}</span></div>
          <div v-if="discountAmount > 0" class="t-row"><span>Chiết khấu</span><span class="font-mono text-error">−{{ formatVNDFull(discountAmount) }}</span></div>
          <div v-if="Number(state.shippingFee) > 0" class="t-row"><span>Phí giao hàng</span><span class="font-mono">+{{ formatVNDFull(state.shippingFee) }}</span></div>
          <div v-if="vatAmount > 0" class="t-row"><span>VAT {{ state.vatRate }}%</span><span class="font-mono">+{{ formatVNDFull(vatAmount) }}</span></div>
        </v-col>
        <v-col cols="12" md="3" class="pay-col">
          <div class="text-caption text-medium-emphasis">Cần thanh toán</div>
          <div class="grand-total font-mono">{{ formatVNDFull(grandTotal) }}</div>
          <div v-if="Number(state.depositAmount) > 0" class="text-caption">
            Cọc {{ formatVNDFull(depositClamped) }} · Còn nợ
            <span class="text-error font-weight-bold">{{ formatVNDFull(debtAfter) }}</span>
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ totalProducts }} SP · {{ totalQuantity }} đơn vị
          </div>
        </v-col>
      </v-row>

      <div class="actions-bar mt-3">
        <v-btn variant="text" :disabled="saving" @click="goBack">Huỷ</v-btn>
        <v-btn variant="outlined" :loading="saving" :disabled="state.items.length === 0" @click="onSaveDraft">
          Lưu nháp
        </v-btn>
        <v-btn color="primary" variant="flat" :loading="saving" :disabled="state.items.length === 0" @click="onSaveAndConfirm">
          Tạo phiếu (nhập kho)
        </v-btn>
      </div>
    </v-card>

    <!-- Quick add supplier -->
    <v-dialog v-model="quickAddOpen" max-width="420" persistent>
      <v-card>
        <v-card-title class="pa-4">Thêm nhà cung cấp</v-card-title>
        <v-card-text class="pa-4">
          <v-text-field v-model="quickAddName" label="Tên NCC *" density="comfortable" variant="outlined" hide-details autofocus @keyup.enter="onQuickAddSupplier" />
          <div class="text-caption text-medium-emphasis mt-2">
            Thông tin ngân hàng / hạn TT có thể bổ sung sau ở Cài đặt → Nhà cung cấp.
          </div>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="quickAddOpen = false">Huỷ</v-btn>
          <v-btn color="primary" variant="flat" :loading="quickAddSaving" :disabled="!quickAddName.trim()" @click="onQuickAddSupplier">Thêm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ExcelUploadDialog v-model="showExcelDialog" @apply="onExcelApply" />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3500">{{ toast.text }}</v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '@/api/index';
import {
  formatVNDFull,
  formatDateVN,
  suggestBatchCode,
  useImports,
  type ParsedExcelRow,
} from '@/composables/use-imports';
import ExcelUploadDialog from '@/components/imports/ExcelUploadDialog.vue';

const route = useRoute();
const router = useRouter();
const {
  saving,
  error,
  suppliers: suppliersRef,
  warehouses: warehousesRef,
  fetchImport,
  fetchSuppliers,
  fetchWarehouses,
  fetchSupplierBalance,
  createSupplierQuick,
  createImport,
  updateImport,
  deleteImport,
  confirmImport,
} = useImports();

const editing = computed(() => !!route.params.id && route.params.id !== 'new');

const VAT_OPTIONS = [0, 5, 8, 10];

interface FormItem {
  id: string;
  productId: string;
  batchCode: string;
  quantity: number;
  unitCost: number;
  manufactureDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  product?: { id: string; sku: string; name: string; unit: string | null };
  _expanded?: boolean;
}

const state = reactive({
  id: '' as string,
  importCode: '',
  importDate: new Date().toISOString().slice(0, 10),
  supplierId: null as string | null,
  warehouseId: null as string | null,
  nccInvoiceNo: '',
  notes: '',
  status: 'draft' as 'draft' | 'confirmed',
  items: [] as FormItem[],
  shippingFee: 0 as number,
  discountType: 'amount' as 'amount' | 'percent',
  discountValue: 0 as number,
  vatRate: 0 as number,
  depositAmount: 0 as number,
});

const suppliers = suppliersRef;
const warehouses = warehousesRef;
const supplierDebt = ref(0);

const showExcelDialog = ref(false);
const quickAddOpen = ref(false);
const quickAddName = ref('');
const quickAddSaving = ref(false);
const toast = ref({ show: false, text: '', color: 'success' });

// ── Product search (inline add) ──
const productPickId = ref<string | null>(null);
const productSearch = ref('');
const productOptions = ref<any[]>([]);
const searching = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

// Dùng event @update:search (như ItemPickerDialog cũ) — đáng tin hơn watch
// trên v-model:search trong Vuetify 4.
function onSearch(val: string) {
  if (searchTimer) clearTimeout(searchTimer);
  const q = (val ?? '').trim();
  // Bỏ qua khi text trùng nhãn SP vừa chọn (autocomplete set search = title).
  if (!q || productOptions.value.some((o) => o.label === q)) {
    if (!q) productOptions.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      const { data } = await api.get('/products', { params: { search: q, limit: 25 } });
      productOptions.value = (data.products ?? data ?? []).map((p: any) => ({
        id: p.id, sku: p.sku, name: p.name, unit: p.unit ?? null,
        costPrice: p.costPrice ?? null, label: `${p.sku} — ${p.name}`,
      }));
    } catch (err) {
      console.error('[import-form] product search failed:', err);
    } finally {
      searching.value = false;
    }
  }, 250);
}

function onProductSelected(id: string | null) {
  if (!id) return;
  const p = productOptions.value.find((x) => x.id === id);
  if (!p) return;
  state.items.push({
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: p.id,
    batchCode: suggestBatchCode(),
    quantity: 1,
    unitCost: Number(p.costPrice) || 0,
    manufactureDate: null,
    expiryDate: null,
    notes: null,
    product: { id: p.id, sku: p.sku, name: p.name, unit: p.unit ?? null },
    _expanded: false,
  });
  // reset ô tìm
  productPickId.value = null;
  productSearch.value = '';
  productOptions.value = [];
}

function removeLine(idx: number) {
  state.items.splice(idx, 1);
}

// ── Money model (số nguyên VND, khớp backend computeCharges) ──
const goodsValue = computed(() =>
  state.items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitCost || 0), 0),
);
const discountAmount = computed(() => {
  const v = Number(state.discountValue) || 0;
  const raw = state.discountType === 'percent'
    ? Math.round((goodsValue.value * Math.min(v, 100)) / 100)
    : Math.round(v);
  return Math.min(Math.max(0, raw), goodsValue.value);
});
const taxBase = computed(() => goodsValue.value - discountAmount.value);
const vatAmount = computed(() => Math.round((taxBase.value * (Number(state.vatRate) || 0)) / 100));
const grandTotal = computed(() => taxBase.value + (Number(state.shippingFee) || 0) + vatAmount.value);
const depositClamped = computed(() => Math.min(Math.max(0, Number(state.depositAmount) || 0), grandTotal.value));
const debtAfter = computed(() => Math.max(0, grandTotal.value - depositClamped.value));
const totalQuantity = computed(() => state.items.reduce((s, it) => s + Number(it.quantity || 0), 0));
const totalProducts = computed(() => state.items.length);

// ── Supplier debt display ──
async function onSupplierChange(id: string | null) {
  supplierDebt.value = id ? await fetchSupplierBalance(id) : 0;
}

async function onQuickAddSupplier() {
  if (!quickAddName.value.trim()) return;
  quickAddSaving.value = true;
  const created = await createSupplierQuick(quickAddName.value);
  quickAddSaving.value = false;
  if (created) {
    state.supplierId = created.id;
    supplierDebt.value = 0;
    quickAddOpen.value = false;
    quickAddName.value = '';
    toast.value = { show: true, text: 'Đã thêm NCC', color: 'success' };
  }
}

onMounted(async () => {
  await Promise.all([fetchSuppliers(), fetchWarehouses()]);
  if (!state.warehouseId && warehouses.value.length) {
    state.warehouseId = warehouses.value[0].id;
  }
  if (editing.value) {
    const id = String(route.params.id);
    const order = await fetchImport(id);
    if (!order) {
      toast.value = { show: true, text: 'Không tìm thấy đơn nhập', color: 'error' };
      router.replace('/imports');
      return;
    }
    if (order.status === 'confirmed') { router.replace(`/imports/${id}`); return; }
    state.id = order.id;
    state.importCode = order.importCode;
    state.importDate = order.importDate.slice(0, 10);
    state.supplierId = order.supplierId;
    state.warehouseId = order.warehouseId ?? state.warehouseId;
    state.nccInvoiceNo = order.nccInvoiceNo ?? '';
    state.notes = order.notes ?? '';
    state.status = order.status;
    state.shippingFee = Number(order.shippingFee) || 0;
    state.discountType = (order.discountType as any) || 'amount';
    state.discountValue = Number(order.discountValue) || 0;
    state.vatRate = Number(order.vatRate) || 0;
    state.depositAmount = Number(order.depositAmount) || 0;
    state.items = (order.items ?? []).map((it): FormItem => ({
      id: it.id,
      productId: it.productId,
      batchCode: it.batchCode,
      quantity: it.quantity,
      unitCost: Number(it.unitCost),
      manufactureDate: it.manufactureDate?.slice(0, 10) ?? null,
      expiryDate: it.expiryDate?.slice(0, 10) ?? null,
      notes: it.notes,
      product: it.product,
      _expanded: false,
    }));
    if (state.supplierId) supplierDebt.value = await fetchSupplierBalance(state.supplierId);
  }
});

watch(error, (msg) => { if (msg) toast.value = { show: true, text: msg, color: 'error' }; });

function goBack() { router.push('/imports'); }

function onExcelApply(rows: ParsedExcelRow[]) {
  for (const r of rows) {
    if (!r.productId) continue;
    state.items.push({
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: r.productId,
      batchCode: r.batchCode || suggestBatchCode(),
      quantity: r.quantity,
      unitCost: r.unitCost,
      manufactureDate: r.manufactureDate,
      expiryDate: r.expiryDate,
      notes: r.notes,
      product: { id: r.productId, sku: r.sku, name: r.productName, unit: null },
      _expanded: false,
    });
  }
  toast.value = { show: true, text: `Đã đưa ${rows.length} dòng vào form`, color: 'success' };
}

/** Kiểm tra cơ bản trước khi lưu — backend cũng validate nhưng báo sớm cho gọn. */
function validateBeforeSave(): string | null {
  if (state.items.length === 0) return 'Chưa có sản phẩm';
  for (const it of state.items) {
    const label = it.product?.sku || it.product?.name || 'SP';
    if (!it.batchCode || !it.batchCode.trim()) return `${label}: thiếu mã lô (mở rộng dòng để nhập)`;
    if (!(Number(it.quantity) > 0)) return `${label}: số lượng phải > 0`;
    if (!(Number(it.unitCost) > 0)) return `${label}: giá nhập phải > 0`;
    if (it.expiryDate && it.manufactureDate && new Date(it.expiryDate) <= new Date(it.manufactureDate)) {
      return `${label}: HSD phải sau NSX`;
    }
  }
  return null;
}

function buildPayload() {
  return {
    supplierId: state.supplierId,
    warehouseId: state.warehouseId,
    importDate: state.importDate,
    nccInvoiceNo: state.nccInvoiceNo || null,
    notes: state.notes || null,
    shippingFee: Number(state.shippingFee) || 0,
    discountType: state.discountType,
    discountValue: Number(state.discountValue) || 0,
    vatRate: Number(state.vatRate) || 0,
    depositAmount: Number(state.depositAmount) || 0,
    items: state.items.map((it) => ({
      productId: it.productId,
      batchCode: it.batchCode,
      quantity: Number(it.quantity),
      unitCost: Number(it.unitCost),
      manufactureDate: it.manufactureDate || null,
      expiryDate: it.expiryDate || null,
      notes: it.notes || null,
    })),
  };
}

async function ensureDraftId(): Promise<string | null> {
  if (state.id) {
    const updated = await updateImport(state.id, buildPayload());
    return updated?.id ?? null;
  }
  const created = await createImport(buildPayload());
  if (created) { state.id = created.id; state.importCode = created.importCode; }
  return created?.id ?? null;
}

async function onSaveDraft() {
  const err = validateBeforeSave();
  if (err) { toast.value = { show: true, text: err, color: 'error' }; return; }
  const id = await ensureDraftId();
  if (!id) return;
  toast.value = { show: true, text: 'Đã lưu nháp', color: 'success' };
  router.replace(`/imports/${id}/edit`);
}

async function onSaveAndConfirm() {
  const err = validateBeforeSave();
  if (err) { toast.value = { show: true, text: err, color: 'error' }; return; }
  if (state.depositAmount > 0 && !state.supplierId) {
    toast.value = { show: true, text: 'Có đặt cọc thì phải chọn NCC', color: 'error' };
    return;
  }
  const id = await ensureDraftId();
  if (!id) return;
  const result = await confirmImport(id);
  if (result?.ok) {
    toast.value = { show: true, text: `Đã nhập kho ${result.batchesCreated} lô hàng`, color: 'success' };
    router.push(`/imports/${id}`);
  }
}

async function onDeleteDraft() {
  if (!state.id) return;
  if (!confirm('Xoá đơn nháp này?')) return;
  const ok = await deleteImport(state.id);
  if (ok) {
    toast.value = { show: true, text: 'Đã xoá đơn nháp', color: 'success' };
    router.push('/imports');
  }
}
</script>

<style scoped>
.import-form {
  padding: 12px;
  max-width: 1280px;
  margin: 0 auto;
}
.section {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
}
.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  margin: 0;
}
.field-label {
  font-size: 0.75rem;
  font-weight: 600;
  opacity: 0.7;
  margin-bottom: 4px;
}
.lines-table .total-cell {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.lines-table .cell-input {
  min-width: 76px;
}
.lines-table .row-warn td { background: rgba(249, 168, 37, 0.04); }
.expand-row td { padding-top: 0 !important; padding-bottom: 4px !important; }
.empty-state { text-align: center; padding: 32px; opacity: 0.6; }
.debt-line {
  display: flex; justify-content: space-between; align-items: baseline;
  font-size: 0.85rem; padding: 4px 0;
}
.summary-bar {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.06), rgba(249, 115, 22, 0.01)) !important;
  border-color: rgba(249, 115, 22, 0.18) !important;
  position: sticky; bottom: 0; z-index: 2;
}
.totals-col .t-row {
  display: flex; justify-content: space-between; font-size: 0.82rem; padding: 1px 0;
}
.pay-col { text-align: right; }
.grand-total { font-size: 1.5rem; font-weight: 800; color: rgb(var(--v-theme-primary)); line-height: 1.2; }
.actions-bar { display: flex; justify-content: flex-end; gap: 8px; }
.font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
</style>
