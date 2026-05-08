<template>
  <div class="import-form">
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        density="compact"
        @click="goBack"
      />
      <h1 class="text-h5 ml-2">
        {{ editing ? `Sửa đơn nhập ${state.importCode || ''}` : 'Tạo đơn nhập mới' }}
      </h1>
      <v-spacer />
      <v-btn
        v-if="editing && state.id"
        variant="outlined"
        color="error"
        prepend-icon="mdi-delete"
        :disabled="saving"
        @click="onDeleteDraft"
      >
        Xoá nháp
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" closable class="mb-3">
      {{ error }}
    </v-alert>

    <!-- Section 1: Header info -->
    <v-card variant="flat" class="section pa-4 mb-3">
      <h2 class="section-title">Thông tin đơn nhập</h2>
      <v-row dense class="mt-2">
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="state.importDate"
            label="Ngày nhập *"
            type="date"
            hide-details
            density="comfortable"
          />
        </v-col>
        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="state.supplierId"
            :items="suppliers"
            item-title="name"
            item-value="id"
            label="Nhà cung cấp"
            clearable
            hide-details
            density="comfortable"
          >
            <template #item="{ item, props: itemProps }">
              <v-list-item v-bind="itemProps">
                <template #subtitle>{{ item.raw.country ?? '' }}</template>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" sm="6" md="4">
          <v-text-field
            v-model="state.nccInvoiceNo"
            label="Số hoá đơn NCC"
            placeholder="VD INV-MH-2605-A"
            hide-details
            density="comfortable"
          />
        </v-col>
        <v-col cols="12">
          <v-textarea
            v-model="state.notes"
            label="Ghi chú"
            rows="2"
            auto-grow
            hide-details
            density="comfortable"
            class="mt-2"
          />
        </v-col>
      </v-row>
    </v-card>

    <!-- Section 2: line items -->
    <v-card variant="flat" class="section pa-4 mb-3">
      <div class="d-flex align-center mb-3">
        <h2 class="section-title">Sản phẩm nhập</h2>
        <v-spacer />
        <v-btn
          variant="outlined"
          prepend-icon="mdi-microsoft-excel"
          color="green-darken-2"
          class="mr-2"
          @click="showExcelDialog = true"
        >
          Import từ Excel
        </v-btn>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openItemPicker(null)">
          Thêm SP
        </v-btn>
      </div>

      <div v-if="state.items.length === 0" class="empty-state">
        <v-icon size="42" color="grey-darken-1">mdi-package-variant-remove</v-icon>
        <div class="mt-2 text-medium-emphasis">Chưa có sản phẩm nào</div>
        <div class="text-caption text-medium-emphasis">
          Bấm "Thêm SP" hoặc "Import từ Excel" để bắt đầu
        </div>
      </div>

      <v-table v-else density="compact" class="lines-table">
        <thead>
          <tr>
            <th style="width: 40px">#</th>
            <th>Sản phẩm</th>
            <th>Mã lô</th>
            <th class="text-right">SL</th>
            <th class="text-right">Giá nhập</th>
            <th class="text-right">Thành tiền</th>
            <th>HSD</th>
            <th class="text-right" style="width: 100px">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, idx) in state.items" :key="line.id">
            <td>{{ idx + 1 }}</td>
            <td>
              <div class="font-medium">{{ line.product?.name ?? line.productId }}</div>
              <div class="font-mono text-caption text-medium-emphasis">
                {{ line.product?.sku ?? '' }}
              </div>
            </td>
            <td class="font-mono">{{ line.batchCode }}</td>
            <td class="text-right font-mono">{{ line.quantity }}</td>
            <td class="text-right font-mono">{{ formatVNDFull(line.unitCost) }}</td>
            <td class="text-right font-mono total-cell">
              {{ formatVNDFull(Number(line.quantity) * Number(line.unitCost)) }}
            </td>
            <td>{{ line.expiryDate ?? '—' }}</td>
            <td class="text-right">
              <v-btn icon="mdi-pencil" size="x-small" variant="text" @click="openItemPicker(line)" />
              <v-btn icon="mdi-close" size="x-small" variant="text" color="error" @click="removeLine(idx)" />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Section 3: summary -->
    <v-card variant="flat" class="section summary-card pa-4 mb-3">
      <div class="summary-row">
        <span>Tổng số lượng</span>
        <span class="font-mono">{{ totalQuantity }} hộp</span>
      </div>
      <div class="summary-row">
        <span>Tổng tiền nhập</span>
        <span class="font-mono summary-total">{{ formatVNDFull(totalAmount) }}</span>
      </div>
    </v-card>

    <!-- Actions -->
    <div class="actions-bar">
      <v-btn variant="text" :disabled="saving" @click="goBack">Huỷ</v-btn>
      <v-btn
        variant="outlined"
        :loading="saving"
        :disabled="state.items.length === 0"
        @click="onSaveDraft"
      >
        Lưu nháp
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        :loading="saving"
        :disabled="state.items.length === 0"
        @click="onSaveAndConfirm"
      >
        Xác nhận nhập kho
      </v-btn>
    </div>

    <ItemPickerDialog
      v-model="showItemDialog"
      :line="editingLine"
      @save="onItemSaved"
    />
    <ExcelUploadDialog v-model="showExcelDialog" @apply="onExcelApply" />

    <v-snackbar v-model="toast.show" :color="toast.color" timeout="3500">
      {{ toast.text }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  formatVNDFull,
  useImports,
  type ImportLine,
  type ImportSupplier,
  type ParsedExcelRow,
} from '@/composables/use-imports';
import ItemPickerDialog from '@/components/imports/ItemPickerDialog.vue';
import ExcelUploadDialog from '@/components/imports/ExcelUploadDialog.vue';

const route = useRoute();
const router = useRouter();
const {
  saving,
  error,
  fetchImport,
  fetchSuppliers,
  createImport,
  updateImport,
  deleteImport,
  confirmImport,
} = useImports();

const editing = computed(() => !!route.params.id && route.params.id !== 'new');

interface FormItem extends Omit<ImportLine, 'lineTotal'> {
  lineTotal?: number | string;
}

const state = reactive({
  id: '' as string,
  importCode: '',
  importDate: new Date().toISOString().slice(0, 10),
  supplierId: null as string | null,
  nccInvoiceNo: '',
  notes: '',
  status: 'draft' as 'draft' | 'confirmed',
  items: [] as FormItem[],
});

const suppliers = ref<ImportSupplier[]>([]);

const showItemDialog = ref(false);
const editingLine = ref<ImportLine | null>(null);
const showExcelDialog = ref(false);

const toast = ref({ show: false, text: '', color: 'success' });

const totalQuantity = computed(() =>
  state.items.reduce((s, it) => s + Number(it.quantity || 0), 0),
);
const totalAmount = computed(() =>
  state.items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitCost || 0), 0),
);

onMounted(async () => {
  suppliers.value = await fetchSuppliers();
  if (editing.value) {
    const id = String(route.params.id);
    const order = await fetchImport(id);
    if (!order) {
      toast.value = { show: true, text: 'Không tìm thấy đơn nhập', color: 'error' };
      router.replace('/imports');
      return;
    }
    if (order.status === 'confirmed') {
      // Confirmed orders are read-only; bounce to detail.
      router.replace(`/imports/${id}`);
      return;
    }
    state.id = order.id;
    state.importCode = order.importCode;
    state.importDate = order.importDate.slice(0, 10);
    state.supplierId = order.supplierId;
    state.nccInvoiceNo = order.nccInvoiceNo ?? '';
    state.notes = order.notes ?? '';
    state.status = order.status;
    state.items = (order.items ?? []).map(
      (it): FormItem => ({
        id: it.id,
        productId: it.productId,
        batchCode: it.batchCode,
        quantity: it.quantity,
        unitCost: Number(it.unitCost),
        manufactureDate: it.manufactureDate?.slice(0, 10) ?? null,
        expiryDate: it.expiryDate?.slice(0, 10) ?? null,
        notes: it.notes,
        product: it.product,
      }),
    );
  }
});

watch(error, (msg) => {
  if (msg) toast.value = { show: true, text: msg, color: 'error' };
});

function goBack() {
  router.push('/imports');
}

function openItemPicker(line: ImportLine | FormItem | null) {
  editingLine.value = line as ImportLine | null;
  showItemDialog.value = true;
}

function onItemSaved(line: Omit<ImportLine, 'id' | 'lineTotal'>) {
  // If we were editing an existing row, replace by id.
  if (editingLine.value && state.items.some((i) => i.id === editingLine.value!.id)) {
    const idx = state.items.findIndex((i) => i.id === editingLine.value!.id);
    state.items[idx] = { ...editingLine.value, ...line };
  } else {
    state.items.push({
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...line,
    });
  }
  editingLine.value = null;
}

function removeLine(idx: number) {
  state.items.splice(idx, 1);
}

function onExcelApply(rows: ParsedExcelRow[]) {
  for (const r of rows) {
    if (!r.productId) continue;
    state.items.push({
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: r.productId,
      batchCode: r.batchCode,
      quantity: r.quantity,
      unitCost: r.unitCost,
      manufactureDate: r.manufactureDate,
      expiryDate: r.expiryDate,
      notes: r.notes,
      product: {
        id: r.productId,
        sku: r.sku,
        name: r.productName,
        unit: null,
      },
    });
  }
  toast.value = {
    show: true,
    text: `Đã đưa ${rows.length} dòng vào form`,
    color: 'success',
  };
}

function buildPayload() {
  return {
    supplierId: state.supplierId,
    importDate: state.importDate,
    nccInvoiceNo: state.nccInvoiceNo || null,
    notes: state.notes || null,
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
  if (created) {
    state.id = created.id;
    state.importCode = created.importCode;
  }
  return created?.id ?? null;
}

async function onSaveDraft() {
  const id = await ensureDraftId();
  if (!id) return;
  toast.value = { show: true, text: 'Đã lưu nháp', color: 'success' };
  router.replace(`/imports/${id}/edit`);
}

async function onSaveAndConfirm() {
  const id = await ensureDraftId();
  if (!id) return;
  const result = await confirmImport(id);
  if (result?.ok) {
    toast.value = {
      show: true,
      text: `Đã nhập kho ${result.batchesCreated} lô hàng`,
      color: 'success',
    };
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
  max-width: 1200px;
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
.lines-table .total-cell {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}
.empty-state {
  text-align: center;
  padding: 32px;
  opacity: 0.6;
}
.summary-card {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.08), rgba(249, 115, 22, 0.02)) !important;
  border-color: rgba(249, 115, 22, 0.2) !important;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px 0;
  font-size: 0.95rem;
}
.summary-total {
  font-weight: 700;
  font-size: 1.2rem;
  color: rgb(var(--v-theme-primary));
}
.actions-bar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
