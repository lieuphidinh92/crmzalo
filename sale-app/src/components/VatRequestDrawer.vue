<script setup>
/**
 * VatRequestDrawer — form trượt "Yêu cầu xuất VAT" cho 1 đơn đã hoàn tất.
 *
 * Anh Philip chốt 24/8/2026. Giai đoạn này CHƯA nối API Vietinvoice: bấm gửi =
 * ghi nhận yêu cầu, đơn vào hàng chờ để kế toán xuất tay (lọc "Chờ xuất VAT").
 *
 * Tự điền sẵn theo thứ tự ưu tiên:
 *   1. Thông tin đã lưu trên CHÍNH đơn này (khi mở lại để sửa/gửi lại).
 *   2. Hồ sơ VAT mặc định của khách (`contact.invoice*`).
 * Luôn cho sửa trước khi gửi — khách có thể xuất hoá đơn sang công ty khác.
 */
import { ref, computed, watch } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatDateTimeVN } from '../composables/useFormat';
import { useTaxLookup, isLookupableTaxCode } from '../composables/useTaxLookup';

const props = defineProps({
  // Đơn được chọn từ danh sách (cần tối thiểu id + orderCode). null = đóng.
  order: { type: Object, default: null },
});
const emit = defineEmits(['close', 'saved']);

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm';
const labelCls = 'text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5';

const auth = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');
const detail = ref(null);

// Đánh dấu ĐÃ XUẤT là việc của kế toán/quản lý (chị Mai Hiền có cờ
// can_issue_vat). Sale KHÔNG tự đánh dấu đơn của mình — vừa xin vừa tự duyệt.
const canMarkIssued = computed(() => {
  const u = auth.user;
  return ['owner', 'admin'].includes(u?.role) || u?.canIssueVat === true;
});
const issuing = ref(false);
const issueError = ref('');
const issueForm = ref({ invoiceNumber: '', issuedDate: '', invoiceUrl: '' });

const BUYER_TYPES = [
  { v: 'cong_ty', label: 'Công ty' },
  { v: 'ho_kinh_doanh', label: 'Hộ kinh doanh' },
  { v: 'ca_nhan', label: 'Cá nhân' },
];

const form = ref(blankForm());
function blankForm() {
  return {
    invoiceFormat: 'dien_tu',
    invoiceBuyerType: 'cong_ty',
    invoiceBuyerName: '',
    invoiceTaxCode: '',
    invoiceAddress: '',
    invoiceEmail: '',
    invoiceReceiverName: '',
    invoiceReceiverPhone: '',
    invoiceNote: '',
    saveInvoiceToCustomer: true,
  };
}

const isPersonal = computed(() => form.value.invoiceBuyerType === 'ca_nhan');

// ── Tra cứu MST → tự điền tên + địa chỉ ───────────────────────────────────
// Chỉ ĐIỀN GIÚP: dữ liệu Cục Thuế trễ ~9 ngày nên luôn để sale sửa lại, và cổng
// tra cứu lỗi cũng không được chặn gửi yêu cầu.
const {
  looking,
  lookupError,
  lookupResult,
  undoSnapshot,
  lookup: runTaxLookup,
  undo: undoTaxLookup,
  reset: resetTaxLookup,
} = useTaxLookup();

const canLookupTax = computed(() => isLookupableTaxCode(form.value.invoiceTaxCode));

function setTaxFields({ name, address }, { skipEmpty = false } = {}) {
  if (!skipEmpty || name) form.value.invoiceBuyerName = name;
  if (!skipEmpty || address) form.value.invoiceAddress = address;
}
const taxSnapshot = () => ({
  name: form.value.invoiceBuyerName,
  address: form.value.invoiceAddress,
});

async function doTaxLookup() {
  if (looking.value) return;
  // API chỉ có tên + địa chỉ, KHÔNG có email nhận hoá đơn — ô email vẫn nhập tay.
  const found = await runTaxLookup(
    form.value.invoiceTaxCode,
    (v) => setTaxFields(v, { skipEmpty: true }),
    taxSnapshot,
  );
  // Vừa lấy đúng số từ Cục Thuế → khoá lại để không ai sửa trượt sau đó.
  if (found) infoUnlocked.value = false;
}
function undoTaxFill() {
  undoTaxLookup((v) => setTaxFields(v));
}

// ── Khoá ô Tên công ty + Địa chỉ (anh Philip chốt 25/8/2026) ──────────────
// 2 ô này đi THẲNG lên hoá đơn: gõ trượt 1 chữ là hoá đơn sai tên/sai địa chỉ,
// kế toán phải xuất lại. Nên mặc định khoá, muốn sửa phải bấm "Sửa" một lần nữa.
// Cố ý KHÔNG khoá 2 trường hợp:
//   - mua là CÁ NHÂN: không tra cứu MST được, buộc phải nhập tay;
//   - cả 2 ô còn rỗng: chưa có gì để bảo vệ, khoá là sale bí không nhập nổi.
const infoUnlocked = ref(false);
const hasInvoiceIdentity = computed(
  () => !!(form.value.invoiceBuyerName || form.value.invoiceAddress),
);
const canToggleInfoLock = computed(() => !isPersonal.value && hasInvoiceIdentity.value);
const infoLocked = computed(() => canToggleInfoLock.value && !infoUnlocked.value);
function toggleInfoLock() {
  infoUnlocked.value = !infoUnlocked.value;
}
const alreadyRequested = computed(() => detail.value?.vatInvoiceStatus === 'requested');
const alreadyIssued = computed(() => detail.value?.vatInvoiceStatus === 'issued');
// Nguồn tự điền — hiện cho sale biết số đang nhìn lấy từ đâu, tránh gửi nhầm
// thông tin cũ của khách.
const prefillSource = ref('');

watch(
  () => props.order?.id,
  async (id) => {
    errorMsg.value = '';
    if (!id) return;
    form.value = blankForm();
    detail.value = null;
    prefillSource.value = '';
    resetTaxLookup();
    infoUnlocked.value = false;
    loading.value = true;
    try {
      // Danh sách đơn KHÔNG trả hồ sơ VAT của khách (payload nhẹ), nên phải lấy
      // bản đầy đủ để tự điền.
      const { data } = await api.get(`/orders/${id}`);
      detail.value = data;
      prefill(data);
    } catch (err) {
      errorMsg.value = err?.response?.data?.error || 'Không tải được thông tin đơn.';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function prefill(o) {
  const c = o?.contact || {};
  const fromOrder = !!(o?.invoiceBuyerName || o?.invoiceTaxCode);
  const src = fromOrder ? o : c;
  form.value = {
    invoiceFormat: src.invoiceFormat || 'dien_tu',
    invoiceBuyerType: src.invoiceBuyerType || 'cong_ty',
    invoiceBuyerName: src.invoiceBuyerName || c.storeName || c.fullName || '',
    invoiceTaxCode: src.invoiceTaxCode || '',
    invoiceAddress: src.invoiceAddress || c.address || '',
    invoiceEmail: src.invoiceEmail || '',
    invoiceReceiverName: src.invoiceReceiverName || '',
    invoiceReceiverPhone: src.invoiceReceiverPhone || c.phone || '',
    invoiceNote: o?.invoiceNote || '',
    saveInvoiceToCustomer: true,
  };
  issueForm.value = {
    invoiceNumber: o?.vatInvoiceId || '',
    issuedDate: o?.vatIssuedAt ? ymdVN(new Date(o.vatIssuedAt)) : ymdVN(new Date()),
    invoiceUrl: o?.vatInvoiceUrl || '',
  };
  issueError.value = '';
  prefillSource.value = fromOrder
    ? 'Đang hiện thông tin đã gửi của đơn này.'
    : c.invoiceTaxCode
      ? 'Tự điền từ hồ sơ VAT đã lưu của khách — kiểm lại trước khi gửi.'
      : '';
}

// Kiểm phía người dùng để báo lỗi ngay dưới ô, backend vẫn kiểm lại lần nữa.
function validate() {
  const f = form.value;
  if (!f.invoiceBuyerName.trim())
    return isPersonal.value ? 'Chưa nhập họ tên người mua.' : 'Chưa nhập tên công ty / đơn vị.';
  if (!isPersonal.value) {
    if (!f.invoiceTaxCode.trim()) return 'Chưa nhập mã số thuế.';
    if (!/^\d{10}(-\d{3})?$/.test(f.invoiceTaxCode.replace(/\s/g, '')))
      return 'Mã số thuế phải là 10 số (hoặc 13 số dạng 1234567890-001).';
  }
  if (!f.invoiceAddress.trim()) return 'Chưa nhập địa chỉ trên hoá đơn.';
  if (!f.invoiceEmail.trim()) return 'Chưa nhập email nhận hoá đơn.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.invoiceEmail.trim()))
    return 'Email nhận hoá đơn chưa đúng định dạng.';
  if (f.invoiceNote.length > 250) return 'Ghi chú cho kế toán tối đa 250 ký tự.';
  return '';
}

async function submit() {
  errorMsg.value = validate();
  if (errorMsg.value) return;
  saving.value = true;
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat-request`, form.value);
    emit('saved', data);
    emit('close');
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Gửi yêu cầu thất bại. Thử lại giúp em.';
  } finally {
    saving.value = false;
  }
}

// Ngày theo LỊCH VIỆT NAM — KHÔNG dùng toISOString() (trước 7h sáng giờ VN nó
// trả ngày hôm trước, kế toán đối chiếu sẽ lệch 1 ngày).
function ymdVN(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function markIssued() {
  issueError.value = '';
  if (!issueForm.value.invoiceNumber.trim()) {
    issueError.value = 'Chưa nhập số hoá đơn.';
    return;
  }
  issuing.value = true;
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat-issued`, {
      invoiceNumber: issueForm.value.invoiceNumber.trim(),
      issuedDate: issueForm.value.issuedDate || undefined,
      invoiceUrl: issueForm.value.invoiceUrl.trim() || undefined,
    });
    detail.value = data;
    emit('saved', data);
  } catch (err) {
    issueError.value = err?.response?.data?.error || 'Không đánh dấu được. Thử lại giúp em.';
  } finally {
    issuing.value = false;
  }
}

async function undoIssued() {
  issueError.value = '';
  issuing.value = true;
  try {
    const { data } = await api.post(`/orders/${props.order.id}/vat-issued`, { issued: false });
    detail.value = data;
    issueForm.value = { invoiceNumber: '', issuedDate: ymdVN(new Date()), invoiceUrl: '' };
    emit('saved', data);
  } catch (err) {
    issueError.value = err?.response?.data?.error || 'Không gỡ được đánh dấu.';
  } finally {
    issuing.value = false;
  }
}

// Rút yêu cầu xuất VAT — sale bấm nhầm đơn hoặc khách chưa chốt lấy hoá đơn.
// Chỉ khi CHƯA có hoá đơn nào; đã xuất rồi thì backend chặn, phải báo kế toán.
const cancelling = ref(false);
const canCancel = computed(
  () => alreadyRequested.value && !Number(detail.value?.vatIssuedAmount || 0),
);
async function cancelRequest() {
  if (!window.confirm('Rút yêu cầu xuất VAT của đơn này? Đơn sẽ ra khỏi hàng chờ của kế toán.')) return;
  cancelling.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.delete(`/orders/${props.order.id}/vat-request`);
    emit('saved', data);
    emit('close');
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'Không rút được yêu cầu.';
  } finally {
    cancelling.value = false;
  }
}

const totalOf = (o) => o?.totalAmountValue ?? o?.totalAmount ?? 0;
</script>

<template>
  <transition name="fade">
    <div v-if="order" class="fixed inset-0 z-50 bg-black/40" @click.self="emit('close')">
      <transition name="slide">
        <div
          class="absolute right-0 top-0 bottom-0 w-full lg:w-[460px] bg-white shadow-pop flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="px-5 pt-4 pb-3 border-b border-line-200 shrink-0 flex items-start justify-between gap-3">
            <div>
              <div class="text-base font-bold text-ink-primary">Yêu cầu xuất VAT</div>
              <p class="text-[11px] text-ink-secondary mt-0.5">
                Tạo yêu cầu xuất hóa đơn VAT cho đơn hàng
              </p>
            </div>
            <button
              @click="emit('close')"
              class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary shrink-0"
              aria-label="Đóng"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div v-if="loading" class="space-y-3">
              <div class="h-24 bg-surface-soft animate-pulse rounded-card"></div>
              <div class="h-40 bg-surface-soft animate-pulse rounded-card"></div>
            </div>

            <template v-else>
              <!-- Thông tin đơn hàng (chỉ đọc) -->
              <div class="rounded-card border border-line-200 p-3.5">
                <div class="text-sm font-semibold text-ink-primary mb-2.5">Thông tin đơn hàng</div>
                <dl class="space-y-2 text-[13px]">
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-ink-secondary shrink-0">Mã đơn hàng</dt>
                    <dd class="font-mono font-medium text-ink-primary text-right">
                      {{ detail?.orderCode || order.orderCode }}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-ink-secondary shrink-0">Ngày tạo đơn</dt>
                    <dd class="text-ink-primary text-right">
                      {{ formatDateTimeVN(detail?.orderDate || detail?.createdAt) }}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-ink-secondary shrink-0">Khách hàng</dt>
                    <dd class="font-semibold text-ink-primary text-right">
                      {{ detail?.contact?.storeName || detail?.contact?.fullName || '—' }}
                    </dd>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <dt class="text-ink-secondary shrink-0">Giá trị thanh toán</dt>
                    <dd class="font-bold text-royal-700 text-right">{{ formatVND(totalOf(detail)) }}</dd>
                  </div>
                </dl>
              </div>

              <div
                v-if="alreadyIssued"
                class="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-800"
              >
                Kế toán đã xuất hoá đơn
                <strong v-if="detail?.vatInvoiceId">số {{ detail.vatInvoiceId }}</strong>
                {{ detail?.vatIssuedAt ? `ngày ${formatDateTimeVN(detail.vatIssuedAt)}` : '' }}.
                <a
                  v-if="detail?.vatInvoiceUrl"
                  :href="detail.vatInvoiceUrl"
                  target="_blank"
                  rel="noopener"
                  class="underline font-semibold"
                >Mở hoá đơn</a>
              </div>
              <div
                v-else-if="alreadyRequested"
                class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800"
              >
                Đơn này đã gửi yêu cầu lúc {{ formatDateTimeVN(detail?.vatRequestedAt) }}.
                Sửa và gửi lại nếu thông tin chưa đúng.
              </div>

              <!-- Thông tin hóa đơn -->
              <div class="rounded-card border border-line-200 p-3.5 space-y-3">
                <div class="text-sm font-semibold text-ink-primary">Thông tin hóa đơn</div>

                <div>
                  <div :class="labelCls">Hình thức hóa đơn</div>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="opt in [{ v: 'dien_tu', label: 'Hóa đơn điện tử' }, { v: 'giay', label: 'Hóa đơn giấy' }]"
                      :key="opt.v"
                      type="button"
                      @click="form.invoiceFormat = opt.v"
                      class="h-10 rounded-lg border text-sm font-medium transition"
                      :class="form.invoiceFormat === opt.v
                        ? 'border-royal-700 bg-royal-50 text-royal-700'
                        : 'border-line-300 text-ink-secondary hover:border-royal-700'"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <div>
                  <div :class="labelCls">Người mua</div>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="opt in BUYER_TYPES"
                      :key="opt.v"
                      type="button"
                      @click="form.invoiceBuyerType = opt.v"
                      class="h-9 rounded-lg border text-[13px] font-medium transition"
                      :class="form.invoiceBuyerType === opt.v
                        ? 'border-royal-700 bg-royal-50 text-royal-700'
                        : 'border-line-300 text-ink-secondary hover:border-royal-700'"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isPersonal">
                  <div :class="labelCls">Mã số thuế <span class="text-red-600">*</span></div>
                  <div class="flex gap-2">
                    <div class="flex-1 min-w-0">
                      <input
                        v-model="form.invoiceTaxCode"
                        type="text"
                        inputmode="numeric"
                        placeholder="0109988776"
                        :class="inputCls"
                        @keydown.enter.prevent="doTaxLookup"
                      />
                    </div>
                    <button
                      type="button"
                      @click="doTaxLookup"
                      :disabled="looking || !canLookupTax"
                      class="h-10 px-3 shrink-0 rounded-lg border border-royal-700 text-royal-700 text-[13px] font-semibold hover:bg-royal-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      title="Tra cứu tên + địa chỉ theo mã số thuế (dữ liệu Cục Thuế)"
                    >
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
                      </svg>
                      <span>{{ looking ? 'Đang tra...' : 'Tra cứu' }}</span>
                    </button>
                  </div>

                  <p v-if="lookupError" class="mt-1.5 text-[11px] text-red-600">{{ lookupError }}</p>
                  <template v-else-if="lookupResult">
                    <p class="mt-1.5 text-[11px] text-ink-secondary">
                      Đã điền tên + địa chỉ từ dữ liệu Cục Thuế{{ lookupResult.stale ? ' (bản lưu cũ)' : '' }}.
                      Kiểm lại rồi gửi.
                      <button
                        v-if="undoSnapshot"
                        type="button"
                        class="text-royal-700 font-semibold underline ml-0.5"
                        @click="undoTaxFill"
                      >
                        Hoàn tác
                      </button>
                    </p>
                    <p
                      v-if="lookupResult.active === false"
                      class="mt-1 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800"
                    >
                      ⚠️ Trạng thái MST: {{ lookupResult.status }} — hỏi lại khách trước khi xuất hoá đơn.
                    </p>
                  </template>
                </div>

                <div>
                  <div class="flex items-baseline justify-between gap-2">
                    <div :class="labelCls">
                      {{ isPersonal ? 'Họ tên người mua' : 'Tên công ty' }} <span class="text-red-600">*</span>
                    </div>
                    <button
                      v-if="canToggleInfoLock"
                      type="button"
                      @click="toggleInfoLock"
                      class="mb-1.5 text-[11px] font-semibold text-royal-700 hover:underline shrink-0"
                    >
                      {{ infoLocked ? '✏️ Sửa' : '🔒 Khoá lại' }}
                    </button>
                  </div>
                  <input
                    v-model="form.invoiceBuyerName"
                    type="text"
                    placeholder="Tên trên hóa đơn..."
                    :readonly="infoLocked"
                    :class="[inputCls, infoLocked ? 'bg-surface-soft text-ink-secondary cursor-default' : '']"
                  />
                </div>

                <div>
                  <div class="flex items-baseline justify-between gap-2">
                    <div :class="labelCls">Địa chỉ <span class="text-red-600">*</span></div>
                    <button
                      v-if="canToggleInfoLock"
                      type="button"
                      @click="toggleInfoLock"
                      class="mb-1.5 text-[11px] font-semibold text-royal-700 hover:underline shrink-0"
                    >
                      {{ infoLocked ? '✏️ Sửa' : '🔒 Khoá lại' }}
                    </button>
                  </div>
                  <input
                    v-model="form.invoiceAddress"
                    type="text"
                    placeholder="Địa chỉ trên hóa đơn..."
                    :readonly="infoLocked"
                    :class="[inputCls, infoLocked ? 'bg-surface-soft text-ink-secondary cursor-default' : '']"
                  />
                </div>

                <div>
                  <div :class="labelCls">Email nhận hóa đơn <span class="text-red-600">*</span></div>
                  <input v-model="form.invoiceEmail" type="email" inputmode="email" placeholder="ketoan@congty.vn" :class="inputCls" />
                </div>

                <div>
                  <div :class="labelCls">Người nhận hóa đơn</div>
                  <input v-model="form.invoiceReceiverName" type="text" placeholder="Tên người nhận..." :class="inputCls" />
                </div>

                <div>
                  <div :class="labelCls">Số điện thoại</div>
                  <!-- KHÔNG dùng type="number": số 0 đầu bị mất, còn iOS hiện bàn phím sai. -->
                  <input v-model="form.invoiceReceiverPhone" type="tel" inputmode="tel" placeholder="09..." :class="inputCls" />
                </div>

                <p v-if="prefillSource" class="text-[11px] text-ink-secondary">{{ prefillSource }}</p>
              </div>

              <!-- Thông tin khác -->
              <div class="rounded-card border border-line-200 p-3.5">
                <div class="text-sm font-semibold text-ink-primary mb-2.5">Thông tin khác</div>
                <div :class="labelCls">Ghi chú cho kế toán</div>
                <textarea
                  v-model="form.invoiceNote"
                  rows="3"
                  maxlength="250"
                  placeholder="Ví dụ: Xuất theo tháng 8/2026, gửi trước 31/08..."
                  class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
                ></textarea>
                <div class="text-[11px] text-ink-disabled text-right mt-1">
                  {{ form.invoiceNote.length }}/250
                </div>
              </div>

              <!-- Kế toán đóng vòng lặp: xuất trên phần mềm hoá đơn xong quay lại
                   điền số hoá đơn. CRM không tự biết nên phải có bước này. -->
              <div
                v-if="canMarkIssued && (alreadyRequested || alreadyIssued)"
                class="rounded-card border p-3.5 space-y-3"
                :class="alreadyIssued ? 'border-emerald-200 bg-emerald-50/40' : 'border-royal-200 bg-royal-50/40'"
              >
                <div class="text-sm font-semibold text-ink-primary">
                  {{ alreadyIssued ? 'Hoá đơn đã xuất' : 'Kế toán: xác nhận đã xuất hoá đơn' }}
                </div>

                <template v-if="!alreadyIssued">
                  <div>
                    <div :class="labelCls">Số hoá đơn <span class="text-red-600">*</span></div>
                    <input v-model="issueForm.invoiceNumber" type="text" placeholder="Ví dụ: 00012345" :class="inputCls" />
                  </div>
                  <div>
                    <div :class="labelCls">Ngày xuất</div>
                    <input v-model="issueForm.issuedDate" type="date" :class="inputCls" />
                  </div>
                  <div>
                    <div :class="labelCls">Link hoá đơn (nếu có)</div>
                    <input v-model="issueForm.invoiceUrl" type="url" placeholder="https://..." :class="inputCls" />
                  </div>
                  <button
                    @click="markIssued"
                    :disabled="issuing"
                    class="w-full h-10 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg v-if="issuing" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" />
                    </svg>
                    Đánh dấu đã xuất hoá đơn
                  </button>
                  <p class="text-[11px] text-ink-secondary">
                    Sale phụ trách đơn sẽ thấy nhãn xanh và nhận thông báo trong app.
                  </p>
                </template>

                <template v-else>
                  <button
                    @click="undoIssued"
                    :disabled="issuing"
                    class="w-full h-9 rounded-btn border border-line-300 text-[13px] font-semibold text-ink-secondary hover:bg-white transition disabled:opacity-50"
                  >
                    Bấm nhầm — gỡ đánh dấu, trả về hàng chờ
                  </button>
                </template>

                <div v-if="issueError" class="text-[12px] text-red-700">{{ issueError }}</div>
              </div>

              <div
                v-if="errorMsg"
                class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700"
              >
                {{ errorMsg }}
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="border-t border-line-200 px-5 py-3 shrink-0 space-y-3">
            <label class="flex items-center gap-2 text-[13px] text-ink-secondary cursor-pointer">
              <input v-model="form.saveInvoiceToCustomer" type="checkbox" class="w-4 h-4 accent-royal-700" />
              Lưu thông tin cho lần sau
            </label>
            <button
              v-if="canCancel"
              @click="cancelRequest"
              :disabled="cancelling"
              class="w-full h-10 rounded-btn border border-red-300 text-red-600 text-[13px] font-semibold hover:bg-red-50 transition disabled:opacity-50"
            >
              Huỷ yêu cầu xuất VAT
            </button>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="emit('close')"
                class="h-11 rounded-btn border border-line-300 text-sm font-semibold text-ink-secondary hover:bg-surface-soft transition"
              >
                Đóng
              </button>
              <button
                @click="submit"
                :disabled="saving || loading || alreadyIssued"
                :title="alreadyIssued ? 'Đơn đã xuất hoá đơn — muốn sửa phải báo kế toán' : ''"
                class="h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-bold transition shadow-pop disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg v-if="saving" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" />
                </svg>
                {{ alreadyRequested ? 'Cập nhật yêu cầu' : 'Gửi yêu cầu' }}
              </button>
            </div>
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
