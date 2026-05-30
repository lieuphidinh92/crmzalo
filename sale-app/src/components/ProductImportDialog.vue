<script setup>
import { ref, computed } from 'vue';
import { api } from '../api/client';

const emit = defineEmits(['close', 'done']);

// step: 'select' | 'preview' | 'result'
const step = ref('select');
const file = ref(null);
const fileName = ref('');
const loading = ref(false);
const errorMsg = ref('');

const preview = ref(null); // {total, will_create, will_update, errors, warnings, sample_create, sample_update}
const result = ref(null); // {created, updated, failed, errors}

const confirmCount = computed(() => {
  if (!preview.value) return 0;
  return (preview.value.will_create || 0) + (preview.value.will_update || 0);
});

const canConfirm = computed(() => {
  if (!preview.value) return false;
  return (preview.value.total || 0) > 0 && confirmCount.value > 0;
});

function onFileChange(e) {
  const f = e.target.files?.[0] || null;
  file.value = f;
  fileName.value = f?.name || '';
  errorMsg.value = '';
  // Reset downstream state if a new file is chosen
  preview.value = null;
  result.value = null;
  step.value = 'select';
}

function buildFormData() {
  const fd = new FormData();
  fd.append('file', file.value);
  return fd;
}

async function doPreview() {
  if (!file.value) {
    errorMsg.value = 'Vui lòng chọn file .xlsx';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post('/products/import?dryRun=1', buildFormData(), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    preview.value = data;
    step.value = 'preview';
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không xem trước được file. Kiểm tra định dạng .xlsx.';
  } finally {
    loading.value = false;
  }
}

async function doCommit() {
  if (!file.value) {
    errorMsg.value = 'File không còn khả dụng, vui lòng chọn lại.';
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.post('/products/import', buildFormData(), {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    result.value = data;
    step.value = 'result';
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Nhập thất bại. Thử lại hoặc kiểm tra file.';
  } finally {
    loading.value = false;
  }
}

function backToSelect() {
  step.value = 'select';
  errorMsg.value = '';
}

function finish() {
  emit('done');
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4">
    <div class="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-line-200 shrink-0">
        <h3 class="text-lg font-bold text-ink-primary">Nhập sản phẩm từ Excel</h3>
        <button @click="emit('close')" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
      </div>

      <div class="px-5 py-4 overflow-y-auto">
        <!-- Common error -->
        <div v-if="errorMsg" class="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ errorMsg }}
        </div>

        <!-- STEP 1: SELECT FILE -->
        <div v-if="step === 'select'" class="space-y-4">
          <div class="text-xs text-ink-secondary bg-surface-soft border border-line-200 rounded-lg px-3 py-2.5 leading-relaxed">
            Tải file mẫu bằng nút <span class="font-semibold">Xuất Excel</span>, sửa rồi nhập lại.
            Các cột <span class="font-semibold">Giá vốn / Tồn kho / HSD</span> chỉ tham khảo, không được ghi.
          </div>

          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1.5">Chọn file Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx"
              @change="onFileChange"
              class="block w-full text-sm text-ink-primary file:mr-3 file:h-10 file:px-4 file:rounded-lg file:border-0 file:bg-royal-700 file:text-white file:font-semibold file:cursor-pointer hover:file:bg-royal-800 border border-line-300 rounded-lg"
            />
            <p v-if="fileName" class="mt-1.5 text-xs text-ink-secondary truncate">Đã chọn: {{ fileName }}</p>
          </div>
        </div>

        <!-- STEP 2: PREVIEW -->
        <div v-else-if="step === 'preview'" class="space-y-4">
          <!-- Summary cards -->
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border border-line-200 bg-surface-soft px-3 py-3 text-center">
              <div class="text-2xl font-bold text-ink-primary">{{ (preview.total || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs text-ink-secondary mt-0.5">Tổng dòng</div>
            </div>
            <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
              <div class="text-2xl font-bold text-emerald-700">{{ (preview.will_create || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs text-emerald-700 mt-0.5">Tạo mới</div>
            </div>
            <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-center">
              <div class="text-2xl font-bold text-blue-700">{{ (preview.will_update || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs text-blue-700 mt-0.5">Cập nhật</div>
            </div>
          </div>

          <!-- Errors -->
          <div v-if="preview.errors && preview.errors.length" class="rounded-lg border border-red-200 bg-red-50">
            <div class="px-3 py-2 text-sm font-semibold text-red-700 border-b border-red-200">
              Lỗi ({{ preview.errors.length }}) — các dòng này sẽ bị bỏ qua
            </div>
            <div class="max-h-44 overflow-y-auto divide-y divide-red-100">
              <div v-for="(e, i) in preview.errors" :key="'e' + i" class="px-3 py-1.5 text-xs text-red-700 flex gap-2">
                <span class="font-mono shrink-0">Dòng {{ e.row }}<span v-if="e.sku"> · {{ e.sku }}</span>:</span>
                <span>{{ e.message }}</span>
              </div>
            </div>
          </div>

          <!-- Warnings -->
          <div v-if="preview.warnings && preview.warnings.length" class="rounded-lg border border-amber-200 bg-amber-50">
            <div class="px-3 py-2 text-sm font-semibold text-amber-700 border-b border-amber-200">
              Cảnh báo ({{ preview.warnings.length }})
            </div>
            <div class="max-h-36 overflow-y-auto divide-y divide-amber-100">
              <div v-for="(w, i) in preview.warnings" :key="'w' + i" class="px-3 py-1.5 text-xs text-amber-700 flex gap-2">
                <span class="font-mono shrink-0">Dòng {{ w.row }}<span v-if="w.sku"> · {{ w.sku }}</span>:</span>
                <span>{{ w.message }}</span>
              </div>
            </div>
          </div>

          <div v-if="!canConfirm" class="text-xs text-ink-secondary">
            Không có dòng hợp lệ để nhập. Hãy sửa file rồi xem trước lại.
          </div>
        </div>

        <!-- STEP 3: RESULT -->
        <div v-else-if="step === 'result'" class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
              <div class="text-2xl font-bold text-emerald-700">{{ (result.created || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs text-emerald-700 mt-0.5">Đã tạo</div>
            </div>
            <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-center">
              <div class="text-2xl font-bold text-blue-700">{{ (result.updated || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs text-blue-700 mt-0.5">Đã cập nhật</div>
            </div>
            <div class="rounded-lg border border-line-200 bg-surface-soft px-3 py-3 text-center" :class="{ '!border-red-200 !bg-red-50': (result.failed || 0) > 0 }">
              <div class="text-2xl font-bold" :class="(result.failed || 0) > 0 ? 'text-red-700' : 'text-ink-primary'">{{ (result.failed || 0).toLocaleString('vi-VN') }}</div>
              <div class="text-xs mt-0.5" :class="(result.failed || 0) > 0 ? 'text-red-700' : 'text-ink-secondary'">Thất bại</div>
            </div>
          </div>

          <div v-if="result.errors && result.errors.length" class="rounded-lg border border-red-200 bg-red-50">
            <div class="px-3 py-2 text-sm font-semibold text-red-700 border-b border-red-200">
              Lỗi ({{ result.errors.length }})
            </div>
            <div class="max-h-44 overflow-y-auto divide-y divide-red-100">
              <div v-for="(e, i) in result.errors" :key="'re' + i" class="px-3 py-1.5 text-xs text-red-700 flex gap-2">
                <span class="font-mono shrink-0">Dòng {{ e.row }}<span v-if="e.sku"> · {{ e.sku }}</span>:</span>
                <span>{{ e.message }}</span>
              </div>
            </div>
          </div>

          <div v-else class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            Nhập hoàn tất, không có lỗi.
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="flex gap-2 px-5 py-4 border-t border-line-200 shrink-0">
        <template v-if="step === 'select'">
          <button
            type="button"
            @click="emit('close')"
            class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-soft"
            :disabled="loading"
          >Huỷ</button>
          <button
            type="button"
            @click="doPreview"
            class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
            :disabled="loading || !file"
          >{{ loading ? 'Đang xử lý...' : 'Xem trước' }}</button>
        </template>

        <template v-else-if="step === 'preview'">
          <button
            type="button"
            @click="backToSelect"
            class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-soft"
            :disabled="loading"
          >Chọn lại file</button>
          <button
            v-if="canConfirm"
            type="button"
            @click="doCommit"
            class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
            :disabled="loading"
          >{{ loading ? 'Đang nhập...' : `Xác nhận nhập (${confirmCount} dòng)` }}</button>
        </template>

        <template v-else-if="step === 'result'">
          <button
            type="button"
            @click="finish"
            class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold"
          >Xong</button>
        </template>
      </div>
    </div>
  </div>
</template>
