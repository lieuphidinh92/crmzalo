<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatVNDShort, formatDateVN, formatDateTimeVN, statusLabel, statusColor } from '../composables/useFormat';
import DebtCustomerRow from '../components/DebtCustomerRow.vue';

const auth = useAuthStore();
// Chỉ owner/admin được ghi nhận thu tiền; member chỉ xem để đi đòi nợ.
const canRecordPayment = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const customers = ref([]);
const loading = ref(false);
const errorMsg = ref('');

// Tổng hợp công nợ (lấy từ /debt-summary để khớp với CRM lớn).
const summary = ref({ total: 0, overdue_total: 0, contact_count: 0, overdue_order_count: 0 });

// Drilldown 1 KH.
const selected = ref(null); // customer object from the list
const detail = ref(null); // { customer, orders, total_debt, ... }
const detailLoading = ref(false);
const detailError = ref('');
const tab = ref('orders'); // 'orders' | 'payments'
const toast = ref('');

// Lịch sử thu nợ.
const payments = ref([]);
const paymentsLoading = ref(false);
const paymentsError = ref('');
const reversingId = ref(null);

// Form thu tiền.
const payOpen = ref(false);
const paySaving = ref(false);
const payError = ref('');
const payForm = ref(emptyPayForm());
const proofFile = ref(null); // File đã nén
const proofPreview = ref(''); // dataURL để xem trước
const proofProcessing = ref(false);

function emptyPayForm() {
  return {
    amount: 0,
    paymentMethod: 'bank_transfer',
    paymentDate: new Date().toISOString().slice(0, 10),
    reference: '',
    note: '',
  };
}

const paymentMethods = [
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'cod', label: 'COD' },
  { value: 'other', label: 'Khác' },
];

function methodLabel(m) {
  return paymentMethods.find((x) => x.value === m)?.label ?? m ?? '—';
}

const requiresProof = computed(() => payForm.value.paymentMethod === 'bank_transfer');

function showToast(msg) {
  toast.value = msg;
  setTimeout(() => (toast.value = ''), 2800);
}

async function loadList() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [{ data: listData }, { data: sumData }] = await Promise.all([
      api.get('/sale-app/debt/customers'),
      api.get('/sale-app/debt-summary'),
    ]);
    customers.value = listData.customers || [];
    summary.value = sumData || summary.value;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách công nợ';
    customers.value = [];
  } finally {
    loading.value = false;
  }
}

async function openCustomer(c) {
  selected.value = c;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  tab.value = 'orders';
  payments.value = [];
  try {
    const { data } = await api.get(`/sale-app/debt/customers/${c.id}/orders`);
    detail.value = data;
  } catch (err) {
    detailError.value = err.response?.data?.error || 'Không tải được đơn công nợ';
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selected.value = null;
  detail.value = null;
  payments.value = [];
}

async function loadPayments() {
  if (!selected.value) return;
  paymentsLoading.value = true;
  paymentsError.value = '';
  try {
    const { data } = await api.get(`/sale-app/debt/customers/${selected.value.id}/payments`);
    payments.value = data.payments || [];
  } catch (err) {
    paymentsError.value = err.response?.data?.error || 'Không tải được lịch sử thu';
  } finally {
    paymentsLoading.value = false;
  }
}

function switchTab(t) {
  tab.value = t;
  if (t === 'payments' && payments.value.length === 0 && !paymentsLoading.value) {
    loadPayments();
  }
}

// ── Form thu tiền ────────────────────────────────────────────────────────
function openPayForm() {
  if (!canRecordPayment.value || !detail.value) return;
  payForm.value = { ...emptyPayForm(), amount: detail.value.total_debt || 0 };
  proofFile.value = null;
  proofPreview.value = '';
  payError.value = '';
  payOpen.value = true;
}

function closePayForm() {
  payOpen.value = false;
}

// Nén ảnh client-side: max cạnh 1280px, JPEG ~0.8 → file nhỏ trước khi upload.
async function onPickProof(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  payError.value = '';

  // PDF: giữ nguyên, không nén.
  if (file.type === 'application/pdf') {
    if (file.size > 5 * 1024 * 1024) {
      payError.value = 'File PDF quá lớn (tối đa 5MB)';
      return;
    }
    proofFile.value = file;
    proofPreview.value = '';
    return;
  }

  if (!file.type.startsWith('image/')) {
    payError.value = 'Chỉ nhận ảnh (JPG/PNG/WEBP) hoặc PDF';
    return;
  }

  proofProcessing.value = true;
  try {
    const compressed = await compressImage(file, 1280, 0.8);
    proofFile.value = compressed.file;
    proofPreview.value = compressed.dataUrl;
  } catch (err) {
    // Nén lỗi → dùng file gốc nếu không quá lớn.
    if (file.size <= 5 * 1024 * 1024) {
      proofFile.value = file;
      proofPreview.value = URL.createObjectURL(file);
    } else {
      payError.value = 'Không xử lý được ảnh, thử ảnh khác';
    }
  } finally {
    proofProcessing.value = false;
  }
}

function compressImage(file, maxEdge, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxEdge || height > maxEdge) {
        const scale = maxEdge / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('toBlob failed'));
          const out = new File([blob], 'proof.jpg', { type: 'image/jpeg' });
          resolve({ file: out, dataUrl: canvas.toDataURL('image/jpeg', quality) });
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function clearProof() {
  proofFile.value = null;
  proofPreview.value = '';
}

async function submitPayment() {
  if (!selected.value || paySaving.value) return;
  const amount = Math.round(Number(payForm.value.amount) || 0);
  if (amount <= 0) {
    payError.value = 'Số tiền phải lớn hơn 0';
    return;
  }
  if (detail.value && amount > (detail.value.total_debt || 0)) {
    payError.value = `Số tiền vượt tổng nợ hiện tại (${formatVND(detail.value.total_debt)})`;
    return;
  }
  if (requiresProof.value && !proofFile.value) {
    payError.value = 'Chuyển khoản bắt buộc đính ảnh chứng từ';
    return;
  }

  paySaving.value = true;
  payError.value = '';
  try {
    // 1) Upload ảnh chứng từ trước (nếu có) → lấy URL.
    let proofUrl = null;
    if (proofFile.value) {
      const fd = new FormData();
      fd.append('file', proofFile.value);
      const { data: up } = await api.post('/sale-app/uploads/proof', fd);
      proofUrl = up.url;
    }

    // 2) Ghi nhận thu tiền (FIFO tự gạt vào đơn nợ cũ nhất).
    const { data } = await api.post('/sale-app/debt/payments', {
      contactId: selected.value.id,
      amount,
      paymentMethod: payForm.value.paymentMethod,
      paymentDate: payForm.value.paymentDate || undefined,
      reference: payForm.value.reference || undefined,
      note: payForm.value.note || undefined,
      proofUrl: proofUrl || undefined,
    });

    const n = data.allocated?.length || 0;
    showToast(`Đã thu ${formatVND(amount)} · gạt vào ${n} đơn`);
    payOpen.value = false;

    // Refresh drilldown + lịch sử + danh sách.
    await openCustomer(selected.value);
    if (tab.value === 'payments') await loadPayments();
    else payments.value = [];
    await loadList();
  } catch (err) {
    payError.value = err.response?.data?.error || 'Lỗi ghi nhận thu tiền';
  } finally {
    paySaving.value = false;
  }
}

// ── Đảo bút toán ─────────────────────────────────────────────────────────
async function reversePayment(p) {
  if (!canRecordPayment.value || reversingId.value) return;
  if (!confirm(`Đảo phiếu thu ${formatVND(p.amount)} ngày ${formatDateVN(p.payment_date)}?\nNợ các đơn đã gạt sẽ được hoàn lại.`)) return;
  reversingId.value = p.id;
  try {
    await api.post(`/sale-app/debt/payments/${p.id}/reverse`);
    showToast('Đã đảo phiếu thu');
    await loadPayments();
    if (selected.value) await openCustomer(selected.value);
    tab.value = 'payments';
    await loadList();
  } catch (err) {
    showToast(err.response?.data?.error || 'Lỗi đảo phiếu thu');
  } finally {
    reversingId.value = null;
  }
}

function orderDueBadge(o) {
  if (!o.due_date) return { cls: 'bg-gray-100 text-gray-600', label: 'Không hạn' };
  if (o.is_overdue) return { cls: 'bg-rose-100 text-rose-700', label: `Quá hạn ${o.days_overdue} ngày` };
  return { cls: 'bg-emerald-50 text-emerald-700', label: `Hạn ${formatDateVN(o.due_date)}` };
}

onMounted(loadList);
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Công nợ</h1>
      <p class="text-xs text-ink-secondary mt-0.5">
        {{ summary.contact_count?.toLocaleString('vi-VN') || 0 }} đại lý đang nợ · ưu tiên đòi đơn quá hạn
      </p>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white border border-line-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-ink-secondary">Tổng công nợ</div>
        <div class="text-lg lg:text-xl font-bold text-ink-primary mt-1 tabular-nums">
          {{ formatVND(summary.total || 0) }}
        </div>
      </div>
      <div class="bg-white border border-rose-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-rose-600">Quá hạn</div>
        <div class="text-lg lg:text-xl font-bold text-rose-600 mt-1 tabular-nums">
          {{ formatVND(summary.overdue_total || 0) }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-0.5">{{ summary.overdue_order_count || 0 }} đơn quá hạn</div>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-card h-24 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="loadList" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="customers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có công nợ</div>
      <p class="text-xs text-ink-secondary mt-1">Tất cả đại lý đã thanh toán đầy đủ.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2.5">
      <DebtCustomerRow
        v-for="c in customers"
        :key="c.id"
        :customer="c"
        @open="openCustomer"
      />
    </div>

    <!-- Drilldown: outstanding orders of a customer -->
    <div v-if="selected" class="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div class="absolute inset-0 bg-black/40" @click="closeDetail"></div>
      <div
        class="relative bg-white w-full lg:max-w-lg lg:rounded-card rounded-t-2xl shadow-pop max-h-[88vh] flex flex-col"
      >
        <!-- Drawer header -->
        <div class="flex items-start justify-between gap-3 p-4 border-b border-line-200">
          <div class="min-w-0">
            <div class="font-bold text-ink-primary truncate">{{ selected.full_name || '—' }}</div>
            <div class="text-xs text-ink-secondary truncate">
              <span v-if="selected.store_name">🏪 {{ selected.store_name }}</span>
              <span v-if="selected.phone"> · 📞 {{ selected.phone }}</span>
            </div>
          </div>
          <button @click="closeDetail" class="shrink-0 w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 px-4 pt-3 border-b border-line-200">
          <button
            @click="switchTab('orders')"
            class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
            :class="tab === 'orders' ? 'border-royal-600 text-royal-700' : 'border-transparent text-ink-secondary'"
          >
            Đơn còn nợ
          </button>
          <button
            @click="switchTab('payments')"
            class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
            :class="tab === 'payments' ? 'border-royal-600 text-royal-700' : 'border-transparent text-ink-secondary'"
          >
            Lịch sử thu
          </button>
        </div>

        <!-- Drawer body -->
        <div class="p-4 overflow-y-auto">
          <div v-if="detailLoading" class="space-y-2.5">
            <div v-for="i in 3" :key="i" class="bg-surface-soft rounded-card h-20 animate-pulse"></div>
          </div>

          <div v-else-if="detailError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-3 text-sm">
            {{ detailError }}
          </div>

          <template v-else-if="detail">
            <!-- ── Tab: Đơn còn nợ ── -->
            <div v-show="tab === 'orders'">
              <!-- Totals + thu tiền -->
              <div class="flex items-center justify-between mb-3 text-sm">
                <span class="text-ink-secondary">{{ detail.order_count }} đơn còn nợ</span>
                <span class="font-bold text-rose-600 tabular-nums">{{ formatVND(detail.total_debt) }}</span>
              </div>

              <button
                v-if="canRecordPayment && detail.total_debt > 0"
                @click="openPayForm"
                class="mb-3 w-full h-10 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Thu tiền (tự gạt vào đơn cũ nhất)
              </button>

              <!-- Order list -->
              <div class="space-y-2.5">
                <div
                  v-for="o in detail.orders"
                  :key="o.id"
                  class="border rounded-card p-3"
                  :class="o.is_overdue ? 'border-rose-200 bg-rose-50/30' : 'border-line-200'"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-ink-primary">{{ o.order_code }}</span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="statusColor(o.status)">
                      {{ statusLabel(o.status) }}
                    </span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="orderDueBadge(o).cls">
                      {{ orderDueBadge(o).label }}
                    </span>
                  </div>
                  <div class="text-[11px] text-ink-secondary mt-1">
                    Ngày đặt: {{ formatDateVN(o.order_date || o.created_at) }}
                  </div>
                  <div class="flex items-center gap-3 mt-2 text-xs flex-wrap">
                    <span class="text-ink-secondary">Tổng: {{ formatVNDShort(o.total_amount) }}</span>
                    <span class="text-ink-secondary">Đã thu: {{ formatVNDShort(o.paid_amount) }}</span>
                    <span class="font-bold text-rose-600 tabular-nums ml-auto">Còn nợ {{ formatVND(o.debt_amount) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Tab: Lịch sử thu ── -->
            <div v-show="tab === 'payments'">
              <div v-if="paymentsLoading" class="space-y-2.5">
                <div v-for="i in 3" :key="i" class="bg-surface-soft rounded-card h-16 animate-pulse"></div>
              </div>
              <div v-else-if="paymentsError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-3 text-sm">
                {{ paymentsError }}
              </div>
              <div v-else-if="payments.length === 0" class="text-center py-8 text-ink-secondary text-sm">
                Chưa có phiếu thu nào.
              </div>
              <div v-else class="space-y-2.5">
                <div
                  v-for="p in payments"
                  :key="p.id"
                  class="border rounded-card p-3"
                  :class="p.reversed ? 'border-line-200 bg-surface-soft opacity-70' : 'border-line-200'"
                >
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold tabular-nums" :class="p.reversed ? 'text-ink-secondary line-through' : 'text-emerald-700'">
                      {{ formatVND(p.amount) }}
                    </span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {{ methodLabel(p.payment_method) }}
                    </span>
                    <span v-if="p.reversed" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      Đã đảo
                    </span>
                    <a
                      v-if="p.proof_url"
                      :href="p.proof_url"
                      target="_blank"
                      rel="noopener"
                      class="ml-auto text-[11px] text-royal-700 underline"
                    >Xem chứng từ</a>
                  </div>
                  <div class="text-[11px] text-ink-secondary mt-1">
                    {{ formatDateVN(p.payment_date) }}
                    <span v-if="p.reference"> · {{ p.reference }}</span>
                    <span v-if="p.created_by"> · {{ p.created_by }}</span>
                  </div>
                  <div v-if="p.note" class="text-[11px] text-ink-secondary mt-0.5 italic">{{ p.note }}</div>
                  <div v-if="p.reversed" class="text-[11px] text-amber-700 mt-0.5">
                    Đảo bởi {{ p.reversed_by }} · {{ formatDateTimeVN(p.reversed_at) }}
                  </div>

                  <button
                    v-if="canRecordPayment && !p.reversed"
                    @click="reversePayment(p)"
                    :disabled="reversingId === p.id"
                    class="mt-2 h-8 px-3 rounded-btn border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
                  >
                    {{ reversingId === p.id ? 'Đang đảo…' : 'Đảo phiếu thu' }}
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Payment form (bottom sheet on top of drilldown) -->
    <div v-if="payOpen" class="fixed inset-0 z-[55] flex items-end lg:items-center lg:justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closePayForm"></div>
      <div class="relative bg-white w-full lg:max-w-md lg:rounded-card rounded-t-2xl shadow-pop max-h-[92vh] flex flex-col">
        <div class="flex items-center justify-between gap-3 p-4 border-b border-line-200">
          <div class="font-bold text-ink-primary">Thu tiền · {{ selected?.full_name }}</div>
          <button @click="closePayForm" class="shrink-0 w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="p-4 overflow-y-auto space-y-3">
          <div v-if="payError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-3 text-sm">
            {{ payError }}
          </div>

          <div class="flex items-center justify-between text-sm bg-surface-soft rounded-card px-3 py-2">
            <span class="text-ink-secondary">Tổng nợ hiện tại</span>
            <span class="font-bold text-rose-600 tabular-nums">{{ formatVND(detail?.total_debt || 0) }}</span>
          </div>

          <!-- Số tiền -->
          <div>
            <label class="block text-xs font-medium text-ink-secondary mb-1">Số tiền thu *</label>
            <input
              v-model.number="payForm.amount"
              type="number"
              min="0"
              inputmode="numeric"
              class="w-full h-11 px-3 rounded-btn border border-line-300 focus:border-royal-600 focus:outline-none text-base tabular-nums"
              placeholder="0"
            />
            <div class="flex gap-2 mt-1.5">
              <button
                type="button"
                @click="payForm.amount = detail?.total_debt || 0"
                class="text-[11px] px-2 py-1 rounded bg-royal-50 text-royal-700 font-medium"
              >Trả hết ({{ formatVNDShort(detail?.total_debt || 0) }})</button>
            </div>
          </div>

          <!-- Phương thức -->
          <div>
            <label class="block text-xs font-medium text-ink-secondary mb-1">Phương thức</label>
            <div class="grid grid-cols-4 gap-1.5">
              <button
                v-for="m in paymentMethods"
                :key="m.value"
                type="button"
                @click="payForm.paymentMethod = m.value"
                class="h-9 rounded-btn text-xs font-semibold border transition-colors"
                :class="payForm.paymentMethod === m.value ? 'border-royal-600 bg-royal-50 text-royal-700' : 'border-line-300 text-ink-secondary'"
              >{{ m.label }}</button>
            </div>
          </div>

          <!-- Ảnh chứng từ -->
          <div>
            <label class="block text-xs font-medium text-ink-secondary mb-1">
              Ảnh chứng từ <span v-if="requiresProof" class="text-rose-600">* (bắt buộc khi chuyển khoản)</span>
            </label>
            <div v-if="!proofFile" class="flex items-center gap-2">
              <label class="flex-1 h-11 rounded-btn border border-dashed border-line-300 flex items-center justify-center gap-2 text-sm text-ink-secondary cursor-pointer hover:bg-surface-soft">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {{ proofProcessing ? 'Đang xử lý ảnh…' : 'Chọn ảnh / PDF' }}
                <input type="file" accept="image/*,application/pdf" class="hidden" @change="onPickProof" />
              </label>
            </div>
            <div v-else class="flex items-center gap-3 border border-line-200 rounded-card p-2">
              <img v-if="proofPreview" :src="proofPreview" class="w-12 h-12 rounded object-cover" />
              <div v-else class="w-12 h-12 rounded bg-surface-soft flex items-center justify-center text-ink-secondary text-[10px] font-bold">PDF</div>
              <div class="text-xs text-ink-secondary flex-1 min-w-0 truncate">Đã chọn chứng từ</div>
              <button @click="clearProof" class="text-xs text-rose-600 font-medium">Xóa</button>
            </div>
          </div>

          <!-- Tham chiếu -->
          <div>
            <label class="block text-xs font-medium text-ink-secondary mb-1">Số tham chiếu (UNC / mã GD)</label>
            <input
              v-model="payForm.reference"
              type="text"
              class="w-full h-11 px-3 rounded-btn border border-line-300 focus:border-royal-600 focus:outline-none text-sm"
              placeholder="VD: FT2406..."
            />
          </div>

          <!-- Ngày + ghi chú -->
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-xs font-medium text-ink-secondary mb-1">Ngày thu</label>
              <input
                v-model="payForm.paymentDate"
                type="date"
                class="w-full h-11 px-3 rounded-btn border border-line-300 focus:border-royal-600 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-secondary mb-1">Ghi chú</label>
              <input
                v-model="payForm.note"
                type="text"
                class="w-full h-11 px-3 rounded-btn border border-line-300 focus:border-royal-600 focus:outline-none text-sm"
                placeholder="Tùy chọn"
              />
            </div>
          </div>
        </div>

        <div class="p-4 border-t border-line-200 flex gap-2">
          <button @click="closePayForm" class="h-11 px-4 rounded-btn border border-line-300 text-ink-secondary text-sm font-semibold">Hủy</button>
          <button
            @click="submitPayment"
            :disabled="paySaving || proofProcessing"
            class="flex-1 h-11 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
          >
            {{ paySaving ? 'Đang ghi nhận…' : 'Xác nhận thu tiền' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-ink-primary text-white text-sm px-4 py-2.5 rounded-btn shadow-pop"
    >
      {{ toast }}
    </div>
  </div>
</template>
