<script setup>
// ─────────────────────────────────────────────────────────────────────────
// Tab "Phải trả NCC" của trang Công nợ (sale-app).
// Backend đã có sẵn full API /api/v1/supplier-debt/* (chỉ owner/admin) —
// component này thuần là UI, mirror phong cách tab "Phải thu KH".
//   GET  /supplier-debt/summary            → thẻ tổng
//   GET  /supplier-debt/suppliers          → danh sách NCC đang nợ
//   GET  /supplier-debt/suppliers/:id      → chi tiết: đơn nhập còn nợ + lịch sử trả
//   POST /supplier-debt/payments           → ghi 1 lần trả cho 1 đơn nhập
// ─────────────────────────────────────────────────────────────────────────
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatDateVN, formatDateTimeVN } from '../composables/useFormat';

const auth = useAuthStore();
// Chỉ owner/admin được ghi nhận trả tiền NCC (khớp requireRole ở backend).
const canRecordPayment = computed(() => ['owner', 'admin'].includes(auth.user?.role));

// ── Danh sách NCC đang nợ ──
const suppliers = ref([]);
const summary = ref({ total_debt: 0, overdue_debt: 0, overdue_order_count: 0, supplier_count: 0 });
const loading = ref(false);
const errorMsg = ref('');

const search = ref('');
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return suppliers.value;
  const digits = q.replace(/\D/g, '');
  return suppliers.value.filter((s) => {
    const name = (s.name || '').toLowerCase();
    const phone = String(s.phone || '').replace(/\D/g, '');
    return name.includes(q) || (digits && phone.includes(digits));
  });
});

async function loadList() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [{ data: sum }, { data: list }] = await Promise.all([
      api.get('/supplier-debt/summary'),
      api.get('/supplier-debt/suppliers'),
    ]);
    summary.value = sum || {};
    suppliers.value = list.suppliers || [];
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được công nợ NCC';
    suppliers.value = [];
  } finally {
    loading.value = false;
  }
}

// ── Badge hạn trả cho 1 NCC / 1 đơn nhập ──
function dueBadge(dueDate, isOverdue) {
  if (!dueDate) return { cls: 'bg-gray-100 text-gray-600', label: 'Không hạn' };
  const d = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (d > 0 || isOverdue) return { cls: 'bg-rose-100 text-rose-700', label: `Quá hạn ${Math.max(d, 1)} ngày` };
  if (d === 0) return { cls: 'bg-amber-100 text-amber-700', label: 'Đến hạn hôm nay' };
  return { cls: 'bg-emerald-50 text-emerald-700', label: `Hạn ${formatDateVN(dueDate)}` };
}
function initialOf(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

// ── Drilldown 1 NCC ──
const selected = ref(null); // supplier row from list
const detail = ref(null); // { supplier, summary, orders, payments }
const detailLoading = ref(false);
const detailError = ref('');
const tab = ref('orders'); // 'orders' | 'payments'

async function openSupplier(s) {
  if (!s.id) {
    detailError.value = 'Đơn nhập chưa gắn NCC — không xem được chi tiết.';
    selected.value = s;
    detail.value = null;
    return;
  }
  selected.value = s;
  detail.value = null;
  detailError.value = '';
  tab.value = 'orders';
  detailLoading.value = true;
  try {
    const { data } = await api.get(`/supplier-debt/suppliers/${s.id}`);
    detail.value = data;
  } catch (err) {
    detailError.value = err.response?.data?.error || 'Không tải được chi tiết NCC';
  } finally {
    detailLoading.value = false;
  }
}
function closeDetail() {
  selected.value = null;
  detail.value = null;
}

// Chỉ các đơn còn nợ (debt > 0) — sắp quá hạn lên đầu.
const outstandingOrders = computed(() => {
  if (!detail.value?.orders) return [];
  return [...detail.value.orders]
    .filter((o) => o.debt_amount > 0)
    .sort((a, b) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      const ad = a.payment_due_date ? new Date(a.payment_due_date).getTime() : Infinity;
      const bd = b.payment_due_date ? new Date(b.payment_due_date).getTime() : Infinity;
      return ad - bd;
    });
});

// ── Form ghi thanh toán 1 đơn nhập ──
const payOrder = ref(null); // import order being paid
const payForm = ref({ amount: '', method: 'bank_transfer', date: '', reference: '', note: '' });
const paySaving = ref(false);
const payError = ref('');
const toast = ref('');

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
function openPayForm(order) {
  payOrder.value = order;
  payForm.value = {
    amount: String(order.debt_amount || ''),
    method: 'bank_transfer',
    date: todayStr(),
    reference: '',
    note: '',
  };
  payError.value = '';
}
function closePayForm() {
  payOrder.value = null;
}

async function submitPay() {
  const amount = Math.round(Number(String(payForm.value.amount).replace(/[^\d]/g, '')));
  if (!amount || amount <= 0) {
    payError.value = 'Nhập số tiền hợp lệ (> 0).';
    return;
  }
  paySaving.value = true;
  payError.value = '';
  try {
    await api.post('/supplier-debt/payments', {
      importOrderId: payOrder.value.id,
      amount,
      paymentMethod: payForm.value.method,
      paymentDate: payForm.value.date || undefined,
      reference: payForm.value.reference.trim() || undefined,
      note: payForm.value.note.trim() || undefined,
    });
    toast.value = `Đã ghi trả ${formatVND(amount)} cho ${payOrder.value.import_code}`;
    setTimeout(() => (toast.value = ''), 3200);
    closePayForm();
    // Reload chi tiết NCC + danh sách tổng để số liệu đồng bộ.
    await Promise.all([openSupplier(selected.value), loadList()]);
  } catch (err) {
    payError.value = err.response?.data?.error || 'Lỗi ghi thanh toán';
  } finally {
    paySaving.value = false;
  }
}

const PAY_METHODS = [
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'other', label: 'Khác' },
];
function methodLabel(v) {
  return PAY_METHODS.find((m) => m.value === v)?.label || v || '—';
}

onMounted(loadList);
</script>

<template>
  <div>
    <!-- Header phụ -->
    <div class="mb-3">
      <p class="text-xs text-ink-secondary">
        {{ summary.supplier_count?.toLocaleString('vi-VN') || 0 }} NCC đang nợ · ưu tiên trả đơn quá hạn
      </p>
    </div>

    <!-- Tìm kiếm NCC -->
    <div class="relative mb-3">
      <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        v-model="search"
        type="search"
        inputmode="search"
        placeholder="Tìm NCC (tên, SĐT)…"
        class="w-full h-11 pl-9 pr-9 rounded-btn bg-white border border-line-300 focus:border-royal-600 focus:ring-2 focus:ring-royal-100 outline-none text-sm"
      />
      <button
        v-if="search"
        @click="search = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
        aria-label="Xoá tìm kiếm"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white border border-line-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-ink-secondary">Tổng phải trả NCC</div>
        <div class="text-lg lg:text-xl font-bold text-ink-primary mt-1 tabular-nums">
          {{ formatVND(summary.total_debt || 0) }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-0.5">{{ summary.total_order_count || 0 }} đơn nhập còn nợ</div>
      </div>
      <div class="bg-white border border-rose-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-rose-600">Quá hạn</div>
        <div class="text-lg lg:text-xl font-bold text-rose-600 mt-1 tabular-nums">
          {{ formatVND(summary.overdue_debt || 0) }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-0.5">{{ summary.overdue_order_count || 0 }} đơn quá hạn</div>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 5" :key="i" class="bg-white border border-line-200 rounded-card h-24 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="loadList" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="suppliers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có công nợ NCC</div>
      <p class="text-xs text-ink-secondary mt-1">Đã thanh toán đầy đủ cho các nhà cung cấp.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2.5">
      <div
        v-if="filtered.length === 0"
        class="bg-white border border-line-200 rounded-card p-8 text-center text-sm text-ink-secondary"
      >
        Không tìm thấy NCC nào khớp “<span class="font-semibold text-ink-primary">{{ search }}</span>”.
      </div>

      <div
        v-for="s in filtered"
        :key="s.id || s.name"
        class="bg-white border rounded-card p-3.5 shadow-card flex gap-3"
        :class="s.overdue_orders > 0 ? 'border-rose-200' : 'border-line-200'"
      >
        <button
          @click="openSupplier(s)"
          class="w-11 h-11 rounded-full bg-royal-50 text-royal-700 flex items-center justify-center font-bold shrink-0"
        >
          {{ initialOf(s.name) }}
        </button>

        <button @click="openSupplier(s)" class="min-w-0 flex-1 text-left">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-ink-primary truncate">{{ s.name || '—' }}</span>
            <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="dueBadge(s.earliest_due, s.overdue_orders > 0).cls">
              {{ dueBadge(s.earliest_due, s.overdue_orders > 0).label }}
            </span>
          </div>
          <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span v-if="s.phone">📞 {{ s.phone }}</span>
            <span v-if="s.country">🌐 {{ s.country }}</span>
          </div>
          <div class="flex items-center gap-3 mt-2 text-[11px] flex-wrap">
            <span class="text-ink-secondary">
              {{ s.order_count || 0 }} đơn nợ
              <template v-if="s.overdue_orders">· {{ s.overdue_orders }} quá hạn</template>
            </span>
            <span class="font-bold tabular-nums" :class="s.overdue_orders > 0 ? 'text-rose-600' : 'text-ink-primary'">
              Nợ {{ formatVND(s.debt || 0) }}
            </span>
          </div>
        </button>

        <div class="shrink-0 flex items-center">
          <button
            @click="openSupplier(s)"
            class="h-9 px-3 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-xs font-semibold shadow-pop flex items-center gap-1.5"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            Chi tiết
          </button>
        </div>
      </div>
    </div>

    <!-- Drilldown: chi tiết 1 NCC -->
    <div v-if="selected" class="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div class="absolute inset-0 bg-black/40" @click="closeDetail"></div>
      <div class="relative bg-white w-full lg:max-w-lg lg:rounded-card rounded-t-2xl shadow-pop max-h-[88vh] flex flex-col">
        <!-- header -->
        <div class="flex items-start justify-between gap-3 p-4 border-b border-line-200">
          <div class="min-w-0">
            <div class="font-bold text-ink-primary truncate">{{ selected.name || '—' }}</div>
            <div class="text-xs text-ink-secondary truncate">
              <span v-if="detail?.supplier?.phone">📞 {{ detail.supplier.phone }}</span>
              <span v-if="detail?.supplier?.bankName"> · 🏦 {{ detail.supplier.bankName }}</span>
              <span v-if="detail?.supplier?.paymentTermDays"> · Hạn TT {{ detail.supplier.paymentTermDays }} ngày</span>
            </div>
          </div>
          <button @click="closeDetail" class="shrink-0 w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <!-- sub-tabs -->
        <div class="flex gap-1 px-4 pt-3 border-b border-line-200">
          <button
            @click="tab = 'orders'"
            class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
            :class="tab === 'orders' ? 'border-royal-600 text-royal-700' : 'border-transparent text-ink-secondary'"
          >
            Đơn còn nợ
          </button>
          <button
            @click="tab = 'payments'"
            class="px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors"
            :class="tab === 'payments' ? 'border-royal-600 text-royal-700' : 'border-transparent text-ink-secondary'"
          >
            Lịch sử trả
          </button>
        </div>

        <!-- body -->
        <div class="p-4 overflow-y-auto">
          <div v-if="detailLoading" class="space-y-2.5">
            <div v-for="i in 3" :key="i" class="bg-surface-soft rounded-card h-20 animate-pulse"></div>
          </div>

          <div v-else-if="detailError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-3 text-sm">
            {{ detailError }}
          </div>

          <template v-else-if="detail">
            <!-- Tab: Đơn còn nợ -->
            <div v-show="tab === 'orders'">
              <div class="flex items-center justify-between mb-3 text-sm">
                <span class="text-ink-secondary">{{ outstandingOrders.length }} đơn còn nợ</span>
                <span class="font-bold text-rose-600 tabular-nums">{{ formatVND(detail.summary?.total_debt || 0) }}</span>
              </div>

              <div v-if="outstandingOrders.length === 0" class="text-center text-sm text-ink-secondary py-8">
                NCC này đã được trả đủ.
              </div>

              <div v-else class="space-y-2.5">
                <div
                  v-for="o in outstandingOrders"
                  :key="o.id"
                  class="border rounded-card p-3"
                  :class="o.is_overdue ? 'border-rose-200 bg-rose-50/40' : 'border-line-200 bg-white'"
                >
                  <div class="flex items-center justify-between gap-2 flex-wrap">
                    <span class="font-semibold text-sm text-ink-primary">{{ o.import_code }}</span>
                    <span class="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="dueBadge(o.payment_due_date, o.is_overdue).cls">
                      {{ dueBadge(o.payment_due_date, o.is_overdue).label }}
                    </span>
                  </div>
                  <div class="text-[11px] text-ink-secondary mt-1 flex flex-wrap gap-x-2">
                    <span v-if="o.import_date">📅 {{ formatDateVN(o.import_date) }}</span>
                    <span v-if="o.ncc_invoice_no">🧾 HĐ {{ o.ncc_invoice_no }}</span>
                    <span v-if="o.total_quantity">📦 {{ o.total_quantity }} sp</span>
                  </div>
                  <div class="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div class="text-ink-secondary">Giá trị</div>
                      <div class="font-semibold tabular-nums text-ink-primary">{{ formatVND(o.total_amount) }}</div>
                    </div>
                    <div>
                      <div class="text-ink-secondary">Đã trả</div>
                      <div class="font-semibold tabular-nums text-emerald-700">{{ formatVND(o.paid_amount) }}</div>
                    </div>
                    <div>
                      <div class="text-ink-secondary">Còn nợ</div>
                      <div class="font-bold tabular-nums text-rose-600">{{ formatVND(o.debt_amount) }}</div>
                    </div>
                  </div>
                  <button
                    v-if="canRecordPayment"
                    @click="openPayForm(o)"
                    class="mt-2.5 w-full h-9 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Ghi thanh toán
                  </button>
                </div>
              </div>
            </div>

            <!-- Tab: Lịch sử trả -->
            <div v-show="tab === 'payments'">
              <div v-if="!detail.payments || detail.payments.length === 0" class="text-center text-sm text-ink-secondary py-8">
                Chưa có lần thanh toán nào.
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="p in detail.payments"
                  :key="p.id"
                  class="border border-line-200 rounded-card p-3 flex items-start justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div class="font-bold tabular-nums text-emerald-700">{{ formatVND(p.amount) }}</div>
                    <div class="text-[11px] text-ink-secondary mt-0.5 flex flex-wrap gap-x-2">
                      <span>{{ formatDateVN(p.payment_date) }}</span>
                      <span>· {{ methodLabel(p.payment_method) }}</span>
                      <span v-if="p.import_code">· {{ p.import_code }}</span>
                    </div>
                    <div v-if="p.reference" class="text-[11px] text-ink-secondary mt-0.5">Mã: {{ p.reference }}</div>
                    <div v-if="p.note" class="text-[11px] text-ink-secondary mt-0.5">{{ p.note }}</div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Modal: form ghi thanh toán NCC -->
    <div v-if="payOrder" class="fixed inset-0 z-[60] flex items-end lg:items-center lg:justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closePayForm"></div>
      <div class="relative bg-white w-full lg:max-w-md lg:rounded-card rounded-t-2xl shadow-pop max-h-[90vh] flex flex-col">
        <div class="flex items-start justify-between gap-3 p-4 border-b border-line-200">
          <div class="min-w-0">
            <div class="font-bold text-ink-primary">Ghi thanh toán NCC</div>
            <div class="text-xs text-ink-secondary truncate">
              {{ payOrder.import_code }} · còn nợ
              <span class="font-semibold text-rose-600">{{ formatVND(payOrder.debt_amount) }}</span>
            </div>
          </div>
          <button @click="closePayForm" class="shrink-0 w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div class="p-4 overflow-y-auto space-y-3">
          <div>
            <label class="block text-xs font-semibold text-ink-secondary mb-1">Số tiền trả</label>
            <input
              v-model="payForm.amount"
              type="text"
              inputmode="numeric"
              class="w-full h-11 px-3 rounded-btn bg-white border border-line-300 focus:border-royal-600 focus:ring-2 focus:ring-royal-100 outline-none text-sm tabular-nums"
              placeholder="0"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-ink-secondary mb-1">Hình thức</label>
              <select
                v-model="payForm.method"
                class="w-full h-11 px-3 rounded-btn bg-white border border-line-300 focus:border-royal-600 outline-none text-sm"
              >
                <option v-for="m in PAY_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-ink-secondary mb-1">Ngày trả</label>
              <input
                v-model="payForm.date"
                type="date"
                class="w-full h-11 px-3 rounded-btn bg-white border border-line-300 focus:border-royal-600 outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-secondary mb-1">Mã tham chiếu (tuỳ chọn)</label>
            <input
              v-model="payForm.reference"
              type="text"
              class="w-full h-11 px-3 rounded-btn bg-white border border-line-300 focus:border-royal-600 outline-none text-sm"
              placeholder="Mã giao dịch / UNC…"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-ink-secondary mb-1">Ghi chú (tuỳ chọn)</label>
            <textarea
              v-model="payForm.note"
              rows="2"
              class="w-full px-3 py-2 rounded-btn bg-white border border-line-300 focus:border-royal-600 outline-none text-sm resize-none"
              placeholder="Ghi chú thêm…"
            ></textarea>
          </div>

          <div v-if="payError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-2.5 text-sm">
            {{ payError }}
          </div>
        </div>

        <div class="p-4 border-t border-line-200 flex gap-2">
          <button
            @click="closePayForm"
            class="flex-1 h-11 rounded-btn border border-line-300 text-ink-secondary font-semibold text-sm hover:bg-surface-soft"
          >
            Huỷ
          </button>
          <button
            @click="submitPay"
            :disabled="paySaving"
            class="flex-1 h-11 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg v-if="paySaving" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M12 2a10 10 0 019 5.6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
            {{ paySaving ? 'Đang lưu…' : 'Xác nhận trả' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-ink-primary text-white text-sm px-4 py-2.5 rounded-btn shadow-pop">
      {{ toast }}
    </div>
  </div>
</template>
