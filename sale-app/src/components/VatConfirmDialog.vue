<script setup>
/**
 * VatConfirmDialog — "Xác nhận đã xuất VAT" (bước 4 trong quy trình 24/8/2026).
 *
 * Kế toán xuất hoá đơn trên phần mềm hoá đơn NGOÀI hệ thống rồi quay lại đây
 * điền số hoá đơn + ngày + GIÁ TRỊ + đính kèm PDF/XML.
 *
 * Giá trị hoá đơn cho phép NHỎ HƠN tổng đơn (xuất một phần, xuất tiếp lần sau)
 * nhưng KHÔNG được vượt phần còn lại — anh Philip chốt chặn cứng.
 */
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';

const props = defineProps({
  order: { type: Object, default: null }, // dòng đơn từ bảng hàng chờ. null = đóng
});
const emit = defineEmits(['close', 'saved']);

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm';
const labelCls = 'text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5';

const saving = ref(false);
const errorMsg = ref('');
const uploading = ref(false);
const file = ref(null); // { url, fileName, size }

function ymdVN(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const form = ref({ invoiceNumber: '', lookupCode: '', invoiceDate: '', amountText: '', note: '' });

// Còn được xuất tối đa bao nhiêu — hiện ngay dưới ô tiền để kế toán khỏi đoán.
const remaining = computed(() => props.order?.remainingAmount ?? 0);

// Ô TIỀN không dùng type="number": gõ "18.400.000" kiểu Việt Nam sẽ bị hiểu
// thành 18,4 (chia 1000) — đã dính lỗi này ở phiếu nhập.
const amountValue = computed(() => Number(String(form.value.amountText).replace(/[^\d]/g, '')) || 0);
const amountOver = computed(() => amountValue.value > remaining.value);

function formatAmountInput() {
  const n = amountValue.value;
  form.value.amountText = n ? n.toLocaleString('vi-VN') : '';
}

watch(
  () => props.order?.id,
  (id) => {
    if (!id) return;
    errorMsg.value = '';
    file.value = null;
    form.value = {
      invoiceNumber: '',
      lookupCode: '',
      invoiceDate: ymdVN(new Date()),
      // Mặc định xuất trọn phần còn lại — ca hay gặp nhất, kế toán chỉ sửa khi
      // xuất một phần.
      amountText: remaining.value ? remaining.value.toLocaleString('vi-VN') : '',
      note: '',
    };
  },
  { immediate: true },
);

async function onFile(e) {
  const f = e.target.files?.[0];
  if (!f) return;
  errorMsg.value = '';
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', f);
    const { data } = await api.post(`/orders/${props.order.id}/vat-invoices/file`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    file.value = data;
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không tải được file hoá đơn.';
  } finally {
    uploading.value = false;
    e.target.value = '';
  }
}

async function submit() {
  errorMsg.value = '';
  if (!form.value.invoiceNumber.trim()) return (errorMsg.value = 'Chưa nhập số hoá đơn.');
  if (!form.value.invoiceDate) return (errorMsg.value = 'Chưa chọn ngày hoá đơn.');
  if (!amountValue.value) return (errorMsg.value = 'Chưa nhập giá trị hoá đơn.');
  if (amountOver.value) {
    return (errorMsg.value = `Vượt phần còn lại — tối đa ${formatVND(remaining.value)}.`);
  }
  // Bắt buộc đính kèm (anh Philip chốt 24/8/2026) — backend cũng chặn lần nữa.
  if (!file.value?.url) return (errorMsg.value = 'Bắt buộc đính kèm file hoá đơn (PDF hoặc XML).');
  saving.value = true;
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat-invoices`, {
      invoiceNumber: form.value.invoiceNumber.trim(),
      lookupCode: form.value.lookupCode.trim() || undefined,
      invoiceDate: form.value.invoiceDate,
      amount: amountValue.value,
      fileUrl: file.value?.url,
      note: form.value.note.trim() || undefined,
    });
    emit('saved', data);
    emit('close');
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không lưu được. Thử lại giúp em.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <transition name="fade">
    <div
      v-if="order"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-[420px] bg-white rounded-card shadow-pop flex flex-col max-h-[90vh]">
        <div class="px-5 py-3.5 border-b border-line-200 flex items-center justify-between shrink-0">
          <div class="text-base font-bold text-ink-primary">Xác nhận đã xuất VAT</div>
          <button
            @click="emit('close')"
            class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
            aria-label="Đóng"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <div class="text-[12px] text-ink-secondary">
            Đơn <span class="font-mono font-semibold text-ink-primary">{{ order.orderCode }}</span>
            · còn cần xuất
            <span class="font-semibold text-royal-700">{{ formatVND(remaining) }}</span>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <div :class="labelCls">Số hoá đơn <span class="text-red-600">*</span></div>
              <input v-model="form.invoiceNumber" type="text" placeholder="00000216" :class="inputCls" />
            </div>
            <div>
              <div :class="labelCls">Ngày xuất hoá đơn <span class="text-red-600">*</span></div>
              <input v-model="form.invoiceDate" type="date" :class="inputCls" />
            </div>
          </div>

          <div>
            <div :class="labelCls">Mã tra cứu hoá đơn</div>
            <input
              v-model="form.lookupCode"
              type="text"
              placeholder="Mã để khách tự tra trên web nhà cung cấp"
              :class="inputCls"
            />
          </div>

          <div>
            <div :class="labelCls">Giá trị hoá đơn <span class="text-red-600">*</span></div>
            <input
              v-model="form.amountText"
              @blur="formatAmountInput"
              type="text"
              inputmode="numeric"
              placeholder="18.400.000"
              :class="[inputCls, amountOver ? 'border-red-500' : '']"
            />
            <p v-if="amountOver" class="text-[11px] text-red-600 mt-1">
              Vượt phần còn lại — tối đa {{ formatVND(remaining) }}.
            </p>
            <p v-else class="text-[11px] text-ink-secondary mt-1">
              Xuất ít hơn số này thì đơn vào nhóm "Xuất một phần", lần sau xuất tiếp.
            </p>
          </div>

          <div>
            <div :class="labelCls">
              Đính kèm hoá đơn (PDF/XML) <span class="text-red-600">*</span>
            </div>
            <div v-if="file" class="flex items-center gap-2 rounded-lg border border-line-300 px-3 h-10">
              <a :href="file.url" target="_blank" rel="noopener" class="flex-1 truncate text-[13px] text-royal-700 underline">
                {{ file.fileName }}
              </a>
              <span class="text-[11px] text-ink-disabled shrink-0">
                ({{ Math.max(1, Math.round(file.size / 1024)) }} KB)
              </span>
              <button @click="file = null" class="text-ink-secondary hover:text-red-600 shrink-0" aria-label="Bỏ file">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <label
              v-else
              class="flex items-center justify-center h-10 rounded-lg border border-dashed text-[13px] cursor-pointer hover:border-royal-700 hover:text-royal-700"
              :class="errorMsg.includes('đính kèm')
                ? 'border-red-400 text-red-600'
                : 'border-line-300 text-ink-secondary'"
            >
              <span v-if="uploading">Đang tải lên...</span>
              <span v-else>＋ Chọn file PDF hoặc XML</span>
              <input type="file" accept=".pdf,.xml,application/pdf,application/xml,text/xml" class="hidden" @change="onFile" />
            </label>
          </div>

          <div>
            <div :class="labelCls">Ghi chú</div>
            <textarea
              v-model="form.note"
              rows="2"
              maxlength="250"
              placeholder="Nhập ghi chú (nếu có)..."
              class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
            ></textarea>
            <div class="text-[11px] text-ink-disabled text-right mt-1">{{ form.note.length }}/250</div>
          </div>

          <div v-if="errorMsg" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700">
            {{ errorMsg }}
          </div>
        </div>

        <div class="px-5 py-3 border-t border-line-200 grid grid-cols-2 gap-2 shrink-0">
          <button
            @click="emit('close')"
            class="h-11 rounded-btn border border-line-300 text-sm font-semibold text-ink-secondary hover:bg-surface-soft transition"
          >
            Hủy
          </button>
          <button
            @click="submit"
            :disabled="saving || uploading"
            class="h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-bold transition shadow-pop disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg v-if="saving" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" />
            </svg>
            Xác nhận đã xuất
          </button>
        </div>
      </div>
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
</style>
