<template>
  <v-dialog v-model="open" max-width="900" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-microsoft-excel</v-icon>
        Nhập đơn từ Excel
      </v-card-title>

      <v-card-text>
        <!-- Step 1: file pick -->
        <div v-if="!preview" class="upload-zone">
          <v-icon size="56" color="primary">mdi-cloud-upload-outline</v-icon>
          <div class="upload-zone__hint mt-2">
            Kéo thả file <strong>.xlsx</strong> vào đây hoặc bấm để chọn
          </div>
          <v-btn
            color="primary"
            class="mt-4"
            prepend-icon="mdi-paperclip"
            @click="pickFile"
          >
            Chọn file
          </v-btn>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls"
            hidden
            @change="onFile"
          />

          <div class="template-help mt-6">
            <div class="text-caption text-medium-emphasis mb-2">
              File Excel cần đúng 8 cột theo thứ tự:
            </div>
            <ul class="template-cols">
              <li>1. SKU</li>
              <li>2. Tên SP</li>
              <li>3. Số lượng</li>
              <li>4. Giá nhập</li>
              <li>5. Mã lô</li>
              <li>6. Ngày sản xuất</li>
              <li>7. HSD</li>
              <li>8. Ghi chú</li>
            </ul>
            <div class="text-caption text-medium-emphasis mt-2">
              Hàng 1 là tiêu đề (sẽ bị bỏ qua). Mỗi hàng sau là 1 lô hàng.
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-else-if="parsing" class="d-flex justify-center pa-6">
          <v-progress-circular indeterminate color="primary" />
        </div>

        <!-- Step 2: preview + errors -->
        <div v-else>
          <div class="preview-summary">
            <div>
              <strong>{{ preview.summary.totalRows }}</strong> dòng đọc được
              <span v-if="preview.summary.errorRows > 0" class="text-error ml-3">
                · {{ preview.summary.errorRows }} dòng có lỗi
              </span>
              <span v-else class="text-success ml-3">· Không lỗi</span>
            </div>
            <v-btn variant="text" size="small" @click="resetPreview">Chọn file khác</v-btn>
          </div>

          <v-table density="compact" class="preview-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Tên SP</th>
                <th class="text-right">SL</th>
                <th class="text-right">Giá nhập</th>
                <th>Mã lô</th>
                <th>HSD</th>
                <th>Lỗi</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in preview.rows"
                :key="row.rowNum"
                :class="rowErrors(row.rowNum).length > 0 ? 'row-error' : ''"
              >
                <td>{{ row.rowNum }}</td>
                <td class="font-mono">{{ row.sku || '—' }}</td>
                <td>{{ row.productName || '—' }}</td>
                <td class="text-right font-mono">{{ row.quantity || 0 }}</td>
                <td class="text-right font-mono">{{ formatVNDFull(row.unitCost) }}</td>
                <td class="font-mono">{{ row.batchCode || '—' }}</td>
                <td>{{ row.expiryDate ?? '—' }}</td>
                <td class="text-error text-caption">
                  {{ rowErrors(row.rowNum).map((e) => e.message).join('; ') }}
                </td>
              </tr>
            </tbody>
          </v-table>

          <div class="text-caption text-medium-emphasis mt-2">
            Chỉ những dòng KHÔNG có lỗi mới được đưa vào form. Bạn có thể chỉnh sửa thêm trước khi xác nhận nhập kho.
          </div>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="onCancel">Đóng</v-btn>
        <v-btn
          v-if="preview"
          color="primary"
          variant="flat"
          :disabled="validRowCount === 0"
          @click="onApply"
        >
          Đưa {{ validRowCount }} dòng vào form
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  formatVNDFull,
  useImports,
  type ParsedExcelResponse,
  type ParsedExcelRow,
} from '@/composables/use-imports';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  apply: [rows: ParsedExcelRow[]];
}>();

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const fileInput = ref<HTMLInputElement | null>(null);
const parsing = ref(false);
const preview = ref<ParsedExcelResponse | null>(null);
const { parseExcel } = useImports();

function pickFile() {
  fileInput.value?.click();
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  parsing.value = true;
  try {
    const res = await parseExcel(file);
    preview.value = res;
  } finally {
    parsing.value = false;
    input.value = '';
  }
}

function rowErrors(rowNum: number) {
  return preview.value?.errors.filter((e) => e.rowNum === rowNum) ?? [];
}

const validRowCount = computed(() => {
  if (!preview.value) return 0;
  const errorRows = new Set(preview.value.errors.map((e) => e.rowNum));
  return preview.value.rows.filter((r) => !errorRows.has(r.rowNum) && r.productId)
    .length;
});

function resetPreview() {
  preview.value = null;
}

function onCancel() {
  resetPreview();
  open.value = false;
}

function onApply() {
  if (!preview.value) return;
  const errorRows = new Set(preview.value.errors.map((e) => e.rowNum));
  const validRows = preview.value.rows.filter(
    (r) => !errorRows.has(r.rowNum) && r.productId,
  );
  emit('apply', validRows);
  resetPreview();
  open.value = false;
}
</script>

<style scoped>
.upload-zone {
  text-align: center;
  padding: 32px 16px;
  border: 2px dashed rgba(148, 163, 184, 0.25);
  border-radius: 12px;
  background: rgba(148, 163, 184, 0.04);
}
.upload-zone__hint {
  font-size: 0.92rem;
  color: rgb(148, 163, 184);
}
.template-cols {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 16px;
  padding-left: 0;
  font-size: 0.82rem;
}
.preview-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 12px;
}
.preview-table {
  max-height: 50vh;
  overflow-y: auto;
}
.row-error td {
  background: rgba(239, 68, 68, 0.08);
}
.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
