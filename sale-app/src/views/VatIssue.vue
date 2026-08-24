<script setup>
/**
 * VatIssue — màn "Xuất VAT" của kế toán (quy trình anh Philip chốt 24/8/2026).
 *
 * 4 nhóm: Chờ xuất · Xuất một phần · Đã xuất đủ · Không xuất.
 * Kế toán mở "Chờ xuất" là ra đúng việc cần làm hôm nay.
 *
 * Chỉ người CÓ QUYỀN LÀM HOÁ ĐƠN vào được: owner/admin hoặc member có cờ
 * `can_issue_vat` (chị Mai Hiền). Cố ý KHÔNG dùng `canViewAllOrders` — cờ đó
 * của người giao hàng/đối soát (anh Huy), họ không làm hoá đơn.
 */
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatDateTimeVN, formatDateVN } from '../composables/useFormat';
import VatConfirmDialog from '../components/VatConfirmDialog.vue';
import { useScreenCache } from '../composables/use-screen-cache';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const TABS = [
  { key: 'requested', label: 'Chờ xuất', tone: 'amber' },
  { key: 'partial', label: 'Xuất 1 phần', tone: 'royal' },
  { key: 'issued', label: 'Đã xuất đủ', tone: 'emerald' },
  { key: 'skipped', label: 'Không xuất', tone: 'slate' },
];

const status = computed(() => {
  const s = route.params.status;
  return TABS.some((t) => t.key === s) ? s : 'requested';
});

const summary = ref({});
const orders = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const loading = ref(false);
const errorMsg = ref('');

const staff = ref([]);
const saleId = ref('');
const search = ref('');
const dateFilter = ref(''); // '' | today | 7 | 30
const confirmOrder = ref(null);

// Đơn đang mở hộp "không xuất" (nhập lý do) — null = đóng.
const skipOrder = ref(null);
const skipReason = ref('');
const skipSaving = ref(false);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

function ymdVN(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Lọc theo NGÀY YÊU CẦU. Ngày tính theo lịch VN — KHÔNG dùng toISOString()
// (trước 7h sáng giờ VN nó trả ngày hôm trước).
function dateParams() {
  if (!dateFilter.value) return {};
  const today = new Date();
  if (dateFilter.value === 'today') return { from: ymdVN(today), to: ymdVN(today) };
  const d = new Date();
  d.setDate(d.getDate() - Number(dateFilter.value));
  return { from: ymdVN(d), to: ymdVN(today) };
}

async function loadSummary() {
  try {
    const { data } = await api.get('/vat/summary');
    summary.value = data.summary || {};
  } catch {
    summary.value = {};
  }
}

async function load(silent = false) {
  if (!silent) loading.value = true;
  errorMsg.value = '';
  try {
    const params = { status: status.value, page: page.value, limit: limit.value, ...dateParams() };
    if (saleId.value) params.saleId = saleId.value;
    if (search.value.trim()) params.search = search.value.trim();
    const { data } = await api.get('/vat/queue', { params });
    orders.value = data.orders || [];
    total.value = data.total ?? orders.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách xuất VAT';
    orders.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function loadStaff() {
  try {
    const { data } = await api.get('/sale-app/staff');
    staff.value = data.staff || data.users || [];
  } catch {
    staff.value = [];
  }
}

useScreenCache(
  (silent) => Promise.all([loadStaff(), loadSummary(), load(silent)]),
  { ttl: 45_000 },
);

let timer = null;
watch([status, saleId, dateFilter, search], () => {
  page.value = 1;
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
watch(page, load);

function goTab(key) {
  router.push(`/vat/${key}`);
}

// Sau khi kế toán xác nhận: đơn có thể rời khỏi tab hiện tại (chờ xuất → đã
// xuất) nên tải lại cả bảng lẫn 4 thẻ.
function onSaved() {
  loadSummary();
  load();
}

async function submitSkip() {
  if (!skipReason.value.trim()) return;
  skipSaving.value = true;
  try {
    await api.post(`/orders/${skipOrder.value.id}/vat-skip`, {
      skip: true,
      reason: skipReason.value.trim(),
    });
    skipOrder.value = null;
    skipReason.value = '';
    onSaved();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không đánh dấu được';
  } finally {
    skipSaving.value = false;
  }
}

async function undoSkip(o) {
  try {
    await api.post(`/orders/${o.id}/vat-skip`, { skip: false });
    onSaved();
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không bỏ đánh dấu được';
  }
}

const cardTone = {
  amber: 'border-amber-300 bg-amber-50',
  royal: 'border-royal-300 bg-royal-50',
  emerald: 'border-emerald-300 bg-emerald-50',
  slate: 'border-line-300 bg-surface-soft',
};
const badgeTone = {
  requested: 'bg-amber-100 text-amber-700',
  partial: 'bg-royal-100 text-royal-700',
  issued: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-slate-200 text-slate-700',
};
const statusLabelVat = {
  requested: 'Chờ xuất',
  partial: 'Xuất 1 phần',
  issued: 'Đã xuất',
  skipped: 'Không xuất',
};
</script>

<template>
  <div class="p-4 lg:p-6 space-y-4">
    <!-- Vào màn này từ nút trên Danh sách đơn hàng (không có menu riêng ở
         sidebar — anh Philip chốt 24/8/2026), nên phải có đường quay lại. -->
    <button
      @click="router.push('/orders')"
      class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-secondary hover:text-royal-700 transition"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Danh sách Đơn hàng
    </button>

    <div>
      <h1 class="text-xl font-bold text-ink-primary">Xuất VAT – Danh sách chờ xử lý</h1>
      <p class="text-[13px] text-ink-secondary mt-0.5">
        Sale gửi yêu cầu → kế toán xuất hoá đơn trên phần mềm hoá đơn → quay lại đây xác nhận.
      </p>
    </div>

    <!-- 4 thẻ tổng hợp -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button
        v-for="t in TABS"
        :key="t.key"
        @click="goTab(t.key)"
        class="text-left rounded-card border p-3.5 transition"
        :class="[cardTone[t.tone], status === t.key ? 'ring-2 ring-royal-700' : 'hover:shadow-card']"
      >
        <div class="text-[13px] font-semibold text-ink-primary">
          {{ t.label }} {{ summary[t.key]?.count ?? 0 }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-1">
          Tổng tiền: {{ formatVND(summary[t.key]?.amount ?? 0) }}
        </div>
      </button>
    </div>

    <!-- Bộ lọc -->
    <div class="bg-white border border-line-200 rounded-card p-3 grid grid-cols-1 lg:grid-cols-4 gap-2">
      <select v-model="saleId" class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
        <option value="">Tất cả nhân viên</option>
        <option v-for="s in staff" :key="s.id" :value="s.id">{{ s.fullName }}</option>
      </select>
      <select v-model="dateFilter" class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm">
        <option value="">Ngày yêu cầu: tất cả</option>
        <option value="today">Hôm nay</option>
        <option value="7">7 ngày qua</option>
        <option value="30">30 ngày qua</option>
      </select>
      <input
        v-model="search"
        type="text"
        placeholder="Tìm mã đơn / khách / MST..."
        class="lg:col-span-2 h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm"
      />
    </div>

    <div v-if="errorMsg" class="rounded-card bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ errorMsg }}
    </div>

    <!-- Bảng -->
    <div class="bg-white border border-line-200 rounded-card overflow-hidden">
      <div v-if="loading" class="p-4 space-y-2">
        <div v-for="n in 5" :key="n" class="h-10 bg-surface-soft animate-pulse rounded"></div>
      </div>

      <div v-else-if="!orders.length" class="p-10 text-center">
        <div class="text-3xl mb-2">🧾</div>
        <div class="font-semibold text-ink-primary">Không có đơn nào ở nhóm này</div>
        <p class="text-[12px] text-ink-secondary mt-1">
          Sale bấm "Yêu cầu xuất VAT" trên đơn hoàn tất thì đơn sẽ xuất hiện ở đây.
        </p>
      </div>

      <!-- KHÔNG đặt class="grid" cho <table>: .grid là utility Tailwind
           (display:grid) sẽ phá colspan/colgroup. -->
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-royal-50 text-ink-secondary text-[11px]">
              <th class="text-left font-semibold px-3 py-2.5 whitespace-nowrap">MÃ ĐƠN</th>
              <th class="text-left font-semibold px-3 py-2.5">KHÁCH HÀNG</th>
              <th class="text-left font-semibold px-3 py-2.5 whitespace-nowrap">NHÂN VIÊN</th>
              <th class="text-left font-semibold px-3 py-2.5 whitespace-nowrap">NGÀY YÊU CẦU</th>
              <th class="text-right font-semibold px-3 py-2.5 whitespace-nowrap">TIỀN CẦN XUẤT</th>
              <th class="text-left font-semibold px-3 py-2.5 whitespace-nowrap">TRẠNG THÁI</th>
              <th class="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in orders" :key="o.id" class="border-b border-line-200 last:border-0 hover:bg-surface-soft/60">
              <td class="px-3 py-2.5 whitespace-nowrap">
                <button @click="router.push(`/orders/${o.id}`)" class="font-mono text-[12px] text-royal-700 hover:underline">
                  {{ o.orderCode }}
                </button>
              </td>
              <td class="px-3 py-2.5">
                <div class="font-medium text-ink-primary truncate max-w-[220px]">
                  {{ o.invoiceBuyerName || o.contact?.storeName || o.contact?.fullName || '—' }}
                </div>
                <div v-if="o.invoiceTaxCode" class="text-[11px] text-ink-secondary">MST: {{ o.invoiceTaxCode }}</div>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap text-ink-secondary">{{ o.assignedSale?.fullName || '—' }}</td>
              <td class="px-3 py-2.5 whitespace-nowrap text-ink-secondary text-[12px]">
                {{ o.vatRequestedAt ? formatDateTimeVN(o.vatRequestedAt) : '—' }}
              </td>
              <td class="px-3 py-2.5 text-right whitespace-nowrap font-semibold tabular-nums">
                {{ formatVND(o.remainingAmount) }}
                <div v-if="o.vatIssuedAmount > 0" class="text-[11px] font-normal text-ink-secondary">
                  đã xuất {{ formatVND(o.vatIssuedAmount) }}
                </div>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded" :class="badgeTone[o.vatInvoiceStatus]">
                  {{ statusLabelVat[o.vatInvoiceStatus] }}
                </span>
                <div v-if="o.vatSkipReason" class="text-[11px] text-ink-secondary mt-0.5 max-w-[160px] truncate" :title="o.vatSkipReason">
                  {{ o.vatSkipReason }}
                </div>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap text-right">
                <button
                  v-if="o.vatInvoiceStatus === 'requested' || o.vatInvoiceStatus === 'partial'"
                  @click="confirmOrder = o"
                  class="h-8 px-3 rounded-lg border border-royal-700 text-royal-700 text-[12px] font-semibold hover:bg-royal-50 transition"
                >
                  Xác nhận đã xuất
                </button>
                <button
                  v-else-if="o.vatInvoiceStatus === 'skipped'"
                  @click="undoSkip(o)"
                  class="h-8 px-3 rounded-lg border border-line-300 text-ink-secondary text-[12px] font-semibold hover:border-royal-700 hover:text-royal-700 transition"
                >
                  Trả về hàng chờ
                </button>
                <button
                  v-if="o.vatInvoiceStatus === 'requested'"
                  @click="skipOrder = o; skipReason = ''"
                  class="ml-1.5 h-8 px-2.5 rounded-lg border border-line-300 text-ink-secondary text-[12px] hover:border-red-400 hover:text-red-600 transition"
                >
                  Không xuất
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Phân trang -->
      <div v-if="orders.length" class="px-3 py-2.5 border-t border-line-200 flex items-center justify-between text-[12px] text-ink-secondary">
        <div>Hiển thị {{ (page - 1) * limit + 1 }} đến {{ (page - 1) * limit + orders.length }} của {{ total }}</div>
        <div class="flex items-center gap-1.5">
          <button
            @click="page = Math.max(1, page - 1)"
            :disabled="page <= 1"
            class="h-8 w-8 rounded-btn border border-line-300 disabled:opacity-40"
          >‹</button>
          <span class="px-2">{{ page }}/{{ totalPages }}</span>
          <button
            @click="page = Math.min(totalPages, page + 1)"
            :disabled="page >= totalPages"
            class="h-8 w-8 rounded-btn border border-line-300 disabled:opacity-40"
          >›</button>
        </div>
      </div>
    </div>

    <VatConfirmDialog :order="confirmOrder" @close="confirmOrder = null" @saved="onSaved" />

    <!-- Hộp nhập lý do "Không xuất" — bắt buộc có lý do để sau còn truy được -->
    <transition name="fade">
      <div v-if="skipOrder" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="skipOrder = null">
        <div class="w-full max-w-[380px] bg-white rounded-card shadow-pop p-5 space-y-3">
          <div class="text-base font-bold text-ink-primary">Đơn này không xuất hoá đơn</div>
          <p class="text-[12px] text-ink-secondary">
            Đơn <span class="font-mono">{{ skipOrder.orderCode }}</span> sẽ ra khỏi hàng chờ của kế toán.
          </p>
          <textarea
            v-model="skipReason"
            rows="3"
            maxlength="250"
            placeholder="Lý do: khách không lấy hoá đơn / sai MST / đơn huỷ..."
            class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
          ></textarea>
          <div class="grid grid-cols-2 gap-2">
            <button @click="skipOrder = null" class="h-10 rounded-btn border border-line-300 text-sm font-semibold text-ink-secondary">
              Hủy
            </button>
            <button
              @click="submitSkip"
              :disabled="!skipReason.trim() || skipSaving"
              class="h-10 rounded-btn bg-royal-700 text-white text-sm font-bold disabled:opacity-50"
            >
              Xác nhận không xuất
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
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
