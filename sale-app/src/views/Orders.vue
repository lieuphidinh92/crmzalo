<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import {
  formatVND,
  statusLabel,
  statusColor,
  formatDateTimeVN,
  formatRelativeTime,
} from '../composables/useFormat';
import VatRequestDrawer from '../components/VatRequestDrawer.vue';
import VatConfirmDialog from '../components/VatConfirmDialog.vue';
import VatViewDialog from '../components/VatViewDialog.vue';
import { useScreenCache } from '../composables/use-screen-cache';

const router = useRouter();
const pos = usePOSStore();
const auth = useAuthStore();

const reorderingId = ref(null);

const orders = ref([]);
const total = ref(0);
const page = ref(1);
const limit = ref(20);
const loading = ref(false);
const errorMsg = ref('');

const q = ref('');
const status = ref('');
const range = ref('30'); // 7 | 30 | 90 | all

let debounceTimer = null;

// Tab key → raw status values sent to the API. Legacy MISA rows carry
// `paid`/`shipped`; fold them into the matching modern tab so old orders
// still show under the right filter. `normalizeStatus` on the backend maps
// them the same way, so the per-tab counts line up with the rows.
const statusTabs = [
  { key: '', label: 'Tất cả', api: '' },
  { key: 'draft', label: 'Sale lên đơn', api: 'draft' },
  { key: 'confirmed', label: 'Kho xác nhận đủ hàng', api: 'confirmed' },
  // Bỏ bước "Đóng gói" — đơn kho xác nhận đi thẳng sang giao vận (trừ kho ở đó).
  { key: 'shipping', label: 'Giao cho vận chuyển', api: 'shipping,shipped' },
  { key: 'completed', label: 'Giao thành công', api: 'completed,paid' },
  { key: 'returned', label: 'Đơn hoàn', api: 'returned' },
  { key: 'cancelled', label: 'Đơn huỷ', api: 'cancelled' },
];

// Per-tab counts from /orders/pipeline-summary, keyed by normalized status.
// Scoped to the same date range as the list so the numbers match on screen.
const counts = ref({});

function tabCount(key) {
  if (key === '') {
    return Object.values(counts.value).reduce((a, b) => a + (b || 0), 0);
  }
  return counts.value[key] || 0;
}

const rangeOptions = [
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
  { value: '90', label: '90 ngày qua' },
  { value: 'custom', label: 'Chọn khoảng ngày…' },
  { value: 'all', label: 'Tất cả' },
];

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

// Ngày theo LỊCH VIỆT NAM. KHÔNG dùng toISOString() — nó trả ngày theo UTC nên
// từ 00:00–07:00 sáng giờ VN sẽ ra ngày hôm trước ("30 ngày qua" thành 31 ngày).
function ymdVN(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const today = ymdVN(new Date());
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymdVN(d);
};

// Khoảng ngày tự chọn — mặc định 30 ngày gần nhất để bấm vào là có số ngay.
const customFrom = ref(daysAgo(30));
const customTo = ref(today);

// ── ĐỐI SOÁT CHỨNG TỪ (Mai Hiền phụ trách — anh Philip giao 4/8/2026) ──
// Chỉ người xem được full đơn mới thấy ô tick: owner/admin, hoặc member được cấp
// cờ canViewAllOrders. Sale thường không tự tick đơn của mình (vừa bán vừa tự xác nhận).
const canReconcile = computed(() => {
  const u = auth.user;
  return ['owner', 'admin'].includes(u?.role) || u?.canViewAllOrders === true;
});
const reconcilingId = ref(null);
// Lọc: '' tất cả · '0' chưa đối soát · '1' đã đối soát
const reconciledFilter = ref('');
const reconciledOptions = [
  { value: '', label: 'Đối soát: tất cả' },
  { value: '0', label: 'Chưa đối soát' },
  { value: '1', label: 'Đã đối soát' },
];

async function toggleReconcile(o) {
  if (reconcilingId.value) return;
  const next = !o.reconciledAt;
  const before = o.reconciledAt;
  // PHẢN HỒI TỨC THÌ: tick đổi màu ngay, không bắt chị Hiền chờ ~85ms mạng cho
  // từng đơn (một buổi đối soát vài chục đơn thì chờ đó cộng lại rất khó chịu).
  // Server báo lỗi thì trả lại đúng trạng thái cũ + hiện thông báo.
  o.reconciledAt = next ? new Date().toISOString() : null;
  reconcilingId.value = o.id;
  try {
    const { data } = await api.patch(`/orders/${o.id}/reconcile`, { reconciled: next });
    o.reconciledAt = data.reconciledAt ?? null;
    // Nếu đang lọc theo tình trạng đối soát thì dòng này không còn thuộc bộ lọc → tải lại.
    if (reconciledFilter.value !== '') load(true);
  } catch (err) {
    o.reconciledAt = before; // trả lại như cũ
    errorMsg.value = err.response?.data?.error || 'Không cập nhật được đối soát';
  } finally {
    reconcilingId.value = null;
  }
}

// ── YÊU CẦU XUẤT VAT (anh Philip chốt 24/8/2026) ──────────────────────
// Sale bấm trên đơn ĐÃ HOÀN TẤT → đơn vào hàng chờ để kế toán xuất hoá đơn.
// Chưa nối API Vietinvoice: giai đoạn này chỉ ghi nhận yêu cầu.
const vatOrder = ref(null); // đơn đang mở form VAT (null = đóng)
// Bàn xuất VAT của kế toán (owner/admin hoặc member có cờ can_issue_vat —
// chị Mai Hiền). Anh Philip chốt 24/8/2026: KHÔNG làm menu riêng ở sidebar,
// vào bằng 1 nút ngay trên màn Danh sách đơn hàng này.
const isVatDesk = computed(() => {
  const u = auth.user;
  // Quyền LÀM HOÁ ĐƠN — cờ riêng, KHÔNG dùng canViewAllOrders (cờ đó của người
  // giao hàng/đối soát, họ không làm hoá đơn). Anh Philip chốt 24/8/2026.
  return ['owner', 'admin'].includes(u?.role) || u?.canIssueVat === true;
});
// Số đơn đang chờ xuất — hiện lên nút để kế toán biết còn việc mà không phải mở.
const vatPending = ref(0);
async function loadVatPending() {
  if (!isVatDesk.value) return;
  try {
    const { data } = await api.get('/vat/summary');
    vatPending.value = data.summary?.requested?.count ?? 0;
  } catch {
    vatPending.value = 0;
  }
}
// Lọc: '' tất cả · requested chờ xuất · issued đã xuất
const vatFilter = ref('');
const vatOptions = [
  { value: '', label: 'VAT: tất cả' },
  { value: 'requested', label: 'Chờ xuất VAT' },
  { value: 'issued', label: 'Đã xuất VAT' },
];

// Chỉ đơn hoàn tất mới xuất hoá đơn — đơn huỷ/hoàn không phát sinh doanh thu.
function canRequestVat(o) {
  return (o.statusNormalized || o.status) === 'completed';
}
function vatBadge(o) {
  const st = o.vatInvoiceStatus;
  if (st === 'issued') return { label: 'Đã xuất VAT', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700' };
  if (st === 'partial') return { label: 'Xuất 1 phần', cls: 'border-royal-500 bg-royal-50 text-royal-700' };
  if (st === 'skipped') return { label: 'Không xuất VAT', cls: 'border-line-300 bg-surface-soft text-ink-secondary' };
  if (st === 'requested') return { label: 'Đã yêu cầu VAT', cls: 'border-amber-500 bg-amber-50 text-amber-700' };
  return { label: 'Yêu cầu xuất VAT', cls: 'border-royal-700 text-royal-700 hover:bg-royal-50' };
}
// Đơn đang mở popup xem hoá đơn đã ký (null = đóng).
const vatViewOrder = ref(null);
// Đơn đã bắt đầu quy trình VAT → hiện thêm nút xem / sửa cạnh nhãn.
const hasVatFlow = (o) => ['requested', 'partial', 'issued'].includes(o.vatInvoiceStatus);
const hasVatFile = (o) => ['partial', 'issued'].includes(o.vatInvoiceStatus);

// Đơn kế toán đang xác nhận đã xuất (null = đóng popup).
const vatConfirmOrder = ref(null);

/**
 * Bấm vào nhãn VAT trên dòng đơn:
 *  - Kế toán/quản lý + đơn đang chờ xuất (hoặc mới xuất một phần) → mở thẳng
 *    popup "Xác nhận đã xuất" của chính đơn đó (anh Philip chốt 24/8/2026),
 *    khỏi phải sang màn Quản lý Xuất VAT tìm lại.
 *  - Còn lại (sale, hoặc đơn đã xong) → mở form yêu cầu để xem/sửa.
 */
function onVatClick(o) {
  const st = o.vatInvoiceStatus;
  if (isVatDesk.value && (st === 'requested' || st === 'partial')) {
    const total = Number(totalOf(o)) || 0;
    vatConfirmOrder.value = {
      id: o.id,
      orderCode: o.orderCode,
      // Popup cần biết còn phải xuất bao nhiêu; danh sách đơn không có sẵn cột
      // này (chỉ /vat/queue mới tính) nên tính tại chỗ.
      remainingAmount: Math.max(0, Math.round(total) - (o.vatIssuedAmount || 0)),
    };
    return;
  }
  vatOrder.value = o;
}

// Đơn vừa gửi yêu cầu — cập nhật tại chỗ để khỏi tải lại cả danh sách.
function onVatSaved(updated) {
  const row = orders.value.find((o) => o.id === updated.id);
  if (row) {
    row.vatInvoiceStatus = updated.vatInvoiceStatus;
    row.vatRequestedAt = updated.vatRequestedAt;
    row.vatInvoiceId = updated.vatInvoiceId;
    row.vatIssuedAt = updated.vatIssuedAt;
  }
  // Đang lọc theo VAT thì dòng này có thể không còn thuộc bộ lọc → tải lại NGẦM.
  if (vatFilter.value !== '') load(true);
  loadVatPending();
}

// Bấm nhanh các mốc hay dùng thay vì chọn tay 2 lần.
const quickPresets = [
  { label: 'Hôm nay', calc: () => ({ from: today, to: today }) },
  {
    label: 'Tháng này',
    calc: () => {
      const n = new Date();
      return { from: ymdVN(new Date(n.getFullYear(), n.getMonth(), 1)), to: today };
    },
  },
  {
    label: 'Tháng trước',
    calc: () => {
      const n = new Date();
      return {
        from: ymdVN(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        to: ymdVN(new Date(n.getFullYear(), n.getMonth(), 0)), // ngày 0 = ngày cuối tháng trước
      };
    },
  },
];

function applyPreset(p) {
  const { from, to } = p.calc();
  customFrom.value = from;
  customTo.value = to;
}

// Chọn ngược (từ > đến) → báo đỏ và KHÔNG gọi API, tránh trả list rỗng khó hiểu.
const dateError = computed(() =>
  range.value === 'custom' && customFrom.value && customTo.value && customFrom.value > customTo.value
    ? 'Ngày bắt đầu đang sau ngày kết thúc'
    : '',
);

/** Tham số ngày gửi lên API cho cả danh sách lẫn số đếm trên tab. */
function dateParams() {
  if (range.value === 'all') return {};
  if (range.value === 'custom') {
    if (dateError.value) return null; // báo hiệu: đừng gọi API
    const p = {};
    if (customFrom.value) p.from = customFrom.value;
    if (customTo.value) p.to = customTo.value;
    return p;
  }
  return { from: daysAgo(parseInt(range.value)) };
}

async function load(silent = false) {
  const dates = dateParams();
  if (dates === null) { loading.value = false; return; } // khoảng ngày không hợp lệ
  // silent = làm mới ngầm khi quay lại màn: giữ danh sách cũ, không chớp khung chờ.
  if (!silent) loading.value = true;
  errorMsg.value = '';
  try {
    const apiStatus = statusTabs.find((c) => c.key === status.value)?.api ?? '';
    const params = {
      page: page.value,
      limit: limit.value,
      ...dates,
    };
    if (apiStatus) params.status = apiStatus;
    if (q.value.trim()) params.search = q.value.trim();
    if (reconciledFilter.value !== '') params.reconciled = reconciledFilter.value;
    if (vatFilter.value !== '') params.vatStatus = vatFilter.value;

    const { data } = await api.get('/orders', { params });
    orders.value = data.orders || [];
    total.value = data.total ?? orders.value.length;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được đơn hàng';
    orders.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

// Tab counts depend only on the date range (not status/search), so refresh
// them when the range changes. Failure is non-blocking — tabs just show 0.
async function loadCounts() {
  const dates = dateParams();
  if (dates === null) return; // khoảng ngày không hợp lệ → giữ số cũ
  try {
    const { data } = await api.get('/orders/pipeline-summary', { params: dates });
    counts.value = data.counts || {};
  } catch {
    counts.value = {};
  }
}

// Đổi ngày tự chọn cũng phải tải lại (cả list lẫn số đếm trên tab, để 2 chỗ khớp nhau).
watch([q, status, range, customFrom, customTo, reconciledFilter, vatFilter], () => {
  page.value = 1;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(load, 250);
});

watch([range, customFrom, customTo], loadCounts);

watch(page, load);

// Quay lại màn: giữ nguyên danh sách + bộ lọc + vị trí cuộn, chỉ làm mới ngầm
// nếu rời màn quá 45 giây (đơn mới vào liên tục trong giờ làm).
useScreenCache(
  (silent) => Promise.all([load(silent), loadCounts(), loadVatPending()]),
  { ttl: 45_000 },
);

function totalOf(o) {
  return o.totalAmountValue ?? o.totalAmount ?? 0;
}

function openOrder(o) {
  router.push(`/orders/${o.id}`);
}

// Đặt lại đơn: lấy full detail (items + contact) rồi nạp giỏ POS với giá
// hiện tại, giữ số lượng cũ. SP ngừng bán bị bỏ qua + cảnh báo.
async function reorder(o) {
  if (reorderingId.value) return;
  reorderingId.value = o.id;
  try {
    const { data: full } = await api.get(`/orders/${o.id}`);
    const { added, skipped } = await pos.loadCartFromOrder(full);
    if (added === 0) {
      alert('Tất cả sản phẩm trong đơn cũ đã ngừng bán hoặc không còn giá. Không có gì để đặt lại.');
      return;
    }
    if (skipped.length > 0) {
      alert(
        `Đã nạp ${added} sản phẩm vào đơn mới.\n\nBỏ qua ${skipped.length} SP đã ngừng bán / hết giá:\n• ${skipped.join('\n• ')}`,
      );
    }
    router.push('/pos');
  } catch (err) {
    alert(err.response?.data?.error || err.message || 'Lỗi khi đặt lại đơn');
  } finally {
    reorderingId.value = null;
  }
}

const pageNumbers = computed(() => {
  const pages = [];
  const max = totalPages.value;
  const cur = page.value;
  if (max <= 7) {
    for (let i = 1; i <= max; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (cur > 3) pages.push('…');
  for (let i = Math.max(2, cur - 1); i <= Math.min(max - 1, cur + 1); i++) pages.push(i);
  if (cur < max - 2) pages.push('…');
  pages.push(max);
  return pages;
});
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1280px] mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Danh sách Đơn hàng</h1>
        <p class="text-xs text-ink-secondary mt-0.5">{{ total.toLocaleString('vi-VN') }} đơn</p>
      </div>
      <!-- Quản lý Xuất VAT — chỉ kế toán/quản lý thấy. Sale theo dõi VAT bằng
           nhãn trên từng dòng đơn, không cần vào đây. -->
      <button
        v-if="isVatDesk"
        @click="router.push('/vat/requested')"
        class="h-10 px-4 rounded-btn border border-royal-700 text-royal-700 hover:bg-royal-50 text-sm font-semibold flex items-center gap-2 transition"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4h16v16l-2.5-1.5L15 20l-2.5-1.5L10 20l-2.5-1.5L5 20 4 19z" />
          <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="13" y2="13" />
        </svg>
        Quản lý Xuất VAT
        <span
          v-if="vatPending"
          class="text-[11px] font-bold bg-amber-500 text-navy-900 px-1.5 py-0.5 rounded-full"
        >{{ vatPending }}</span>
      </button>
      <button
        @click="router.push('/pos')"
        class="h-10 px-4 rounded-btn bg-royal-700 hover:bg-royal-800 text-white text-sm font-semibold shadow-pop flex items-center gap-2"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Tạo đơn
      </button>
    </div>

    <!-- Tab bar theo trạng thái (cuộn ngang trên mobile) -->
    <div class="border-b border-line-200 mb-4 overflow-x-auto">
      <div class="flex gap-1 min-w-max">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          @click="status = tab.key"
          class="relative h-10 px-3 text-sm font-semibold whitespace-nowrap transition border-b-2 -mb-px flex items-center gap-1.5"
          :class="
            status === tab.key
              ? 'text-royal-700 border-royal-700'
              : 'text-ink-secondary border-transparent hover:text-ink-primary'
          "
        >
          {{ tab.label }}
          <span
            class="text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
            :class="status === tab.key ? 'bg-royal-100 text-royal-700' : 'bg-surface-soft text-ink-secondary'"
          >
            {{ tabCount(tab.key) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Search + range -->
    <div class="bg-white border border-line-200 rounded-card p-4 shadow-card mb-4">
      <div class="grid lg:grid-cols-3 gap-3">
        <div class="relative lg:col-span-2">
          <input
            v-model="q"
            type="search"
            placeholder="Tìm mã đơn / tên KH / SĐT..."
            class="w-full h-10 pl-10 pr-3 rounded-input border border-line-300 focus:border-royal-700 focus:ring-2 focus:ring-royal-100 outline-none bg-white text-sm"
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <select
          v-model="range"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
        >
          <option v-for="opt in rangeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <!-- Lọc theo tình trạng đối soát — chỉ người phụ trách đối soát mới cần -->
        <select
          v-if="canReconcile"
          v-model="reconciledFilter"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm lg:col-span-1"
        >
          <option v-for="opt in reconciledOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <!-- Lọc hàng chờ xuất hoá đơn VAT — kế toán mở "Chờ xuất VAT" là ra việc cần làm -->
        <select
          v-model="vatFilter"
          class="h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm lg:col-span-1"
        >
          <option v-for="opt in vatOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <!-- Khoảng ngày tự chọn — chỉ hiện khi chọn "Chọn khoảng ngày…" -->
      <div v-if="range === 'custom'" class="mt-3 pt-3 border-t border-line-200">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex-1 min-w-[150px]">
            <span class="block text-xs font-semibold text-ink-secondary mb-1">Từ ngày</span>
            <input
              v-model="customFrom"
              type="date"
              :max="customTo || undefined"
              class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
            />
          </label>
          <label class="flex-1 min-w-[150px]">
            <span class="block text-xs font-semibold text-ink-secondary mb-1">Đến ngày</span>
            <input
              v-model="customTo"
              type="date"
              :min="customFrom || undefined"
              class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm"
            />
          </label>
          <div class="flex gap-2">
            <button
              v-for="p in quickPresets"
              :key="p.label"
              type="button"
              class="h-10 px-3 rounded-input border border-line-300 text-sm font-semibold text-ink-secondary hover:border-royal-700 hover:text-royal-700 whitespace-nowrap"
              @click="applyPreset(p)"
            >
              {{ p.label }}
            </button>
          </div>
        </div>
        <p v-if="dateError" class="mt-2 text-sm text-red-600 font-semibold">{{ dateError }}</p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="h-[68px] bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="orders.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Chưa có đơn nào</div>
      <p class="text-xs text-ink-secondary mt-1">Thử đổi bộ lọc, khoảng thời gian hoặc từ khoá.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2">
      <div
        v-for="o in orders"
        :key="o.id"
        @click="openOrder(o)"
        role="button"
        tabindex="0"
        @keydown.enter="openOrder(o)"
        class="w-full cursor-pointer bg-white border border-line-200 rounded-card p-3.5 shadow-card hover:border-royal-700 transition text-left flex items-center gap-3"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-ink-secondary">{{ o.orderCode }}</span>
            <span
              class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded"
              :class="statusColor(o.statusNormalized || o.status)"
            >
              {{ statusLabel(o.statusNormalized || o.status) }}
            </span>
          </div>
          <div class="text-sm font-semibold text-ink-primary truncate mt-0.5">
            {{ o.contact?.fullName || '—' }}
          </div>
          <div class="text-[11px] text-ink-secondary truncate">
            <span v-if="o.contact?.storeName">{{ o.contact.storeName }} · </span>
            <span :title="formatDateTimeVN(o.orderDate || o.createdAt)">
              {{ formatRelativeTime(o.orderDate || o.createdAt) }}
            </span>
          </div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-sm font-bold text-royal-700">{{ formatVND(totalOf(o)) }}</div>
          <div
            v-if="(o.debtAmountValue ?? 0) > 0"
            class="text-[10px] text-red-600 font-medium mt-0.5"
          >
            Nợ {{ formatVND(o.debtAmountValue) }}
          </div>
        </div>
        <!-- Yêu cầu xuất hoá đơn VAT — chỉ đơn đã hoàn tất. Đơn đã gửi thì nút đổi
             thành nhãn trạng thái, bấm lại để xem/sửa cho tới khi kế toán xuất. -->
        <button
          v-if="canRequestVat(o)"
          @click.stop="onVatClick(o)"
          :title="o.vatInvoiceStatus === 'issued' || o.vatInvoiceStatus === 'partial'
            ? `Đã xuất hoá đơn${o.vatInvoiceId ? ' số ' + o.vatInvoiceId : ''} ${formatDateTimeVN(o.vatIssuedAt)}`
            : o.vatInvoiceStatus === 'skipped'
              ? `Không xuất hoá đơn — ${o.vatSkipReason || 'không rõ lý do'}`
              : o.vatInvoiceStatus === 'requested'
              ? (isVatDesk
                  ? `Yêu cầu lúc ${formatDateTimeVN(o.vatRequestedAt)} — bấm để xác nhận đã xuất`
                  : `Đã yêu cầu xuất VAT ${formatDateTimeVN(o.vatRequestedAt)} — bấm để xem/sửa`)
              : 'Yêu cầu kế toán xuất hoá đơn VAT cho đơn này'"
          class="shrink-0 h-8 flex items-center justify-center rounded-lg border text-[12px] font-semibold transition w-8 sm:w-auto sm:px-2.5"
          :class="vatBadge(o).cls"
        >
          <!-- Điện thoại chỉ đủ chỗ cho icon; máy tính hiện đủ chữ. -->
          <svg class="w-4 h-4 sm:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16v16l-2.5-1.5L15 20l-2.5-1.5L10 20l-2.5-1.5L5 20 4 19z" />
            <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="13" x2="13" y2="13" />
          </svg>
          <span class="hidden sm:inline">{{ vatBadge(o).label }}</span>
        </button>
        <!-- Xem hoá đơn đã ký (chỉ đơn đã có hoá đơn) -->
        <button
          v-if="hasVatFile(o)"
          @click.stop="vatViewOrder = o"
          title="Xem hoá đơn VAT đã xuất — mở/tải file gửi khách"
          class="shrink-0 h-8 w-8 hidden sm:flex items-center justify-center rounded-lg border border-line-300 text-ink-secondary hover:border-royal-700 hover:text-royal-700 transition"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <!-- Sửa thông tin xuất VAT / huỷ yêu cầu (sale tự xử khi khách đổi ý) -->
        <button
          v-if="hasVatFlow(o)"
          @click.stop="vatOrder = o"
          title="Sửa thông tin xuất VAT / huỷ yêu cầu"
          class="shrink-0 h-8 w-8 hidden sm:flex items-center justify-center rounded-lg border border-line-300 text-ink-secondary hover:border-royal-700 hover:text-royal-700 transition"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z" />
          </svg>
        </button>
        <!-- Ô tick ĐÃ ĐỐI SOÁT chứng từ (Mai Hiền phụ trách). Chỉ người xem được
             full đơn mới thấy ô này — sale thường không tự tick đơn của mình. -->
        <button
          v-if="canReconcile"
          @click.stop="toggleReconcile(o)"
          :disabled="reconcilingId === o.id"
          :title="o.reconciledAt ? `Đã đối soát ${formatDateTimeVN(o.reconciledAt)} — bấm để bỏ tick` : 'Bấm để đánh dấu đã đối soát chứng từ'"
          class="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border transition disabled:opacity-50"
          :class="o.reconciledAt
            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
            : 'border-line-300 text-ink-secondary hover:border-emerald-500 hover:text-emerald-700'"
        >
          <svg v-if="reconcilingId === o.id" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9" stroke-opacity="0.3" /><path d="M21 12a9 9 0 0 0-9-9" />
          </svg>
          <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <button
          @click.stop="reorder(o)"
          :disabled="reorderingId === o.id"
          title="Đặt lại đơn này"
          class="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-line-300 text-royal-700 hover:border-royal-700 hover:bg-royal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            class="w-4 h-4"
            :class="reorderingId === o.id ? 'animate-spin' : ''"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
        <svg class="w-4 h-4 text-ink-disabled shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="pt-4 flex items-center justify-center gap-1.5">
        <button
          @click="page = Math.max(1, page - 1)"
          :disabled="page <= 1"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >‹</button>
        <button
          v-for="(n, idx) in pageNumbers"
          :key="idx"
          @click="typeof n === 'number' && (page = n)"
          :disabled="typeof n !== 'number'"
          class="h-9 min-w-[36px] px-2 rounded-btn text-sm font-medium transition"
          :class="
            n === page
              ? 'bg-royal-700 text-white'
              : typeof n === 'number'
              ? 'border border-line-300 hover:border-royal-700 text-ink-primary'
              : 'text-ink-disabled'
          "
        >{{ n }}</button>
        <button
          @click="page = Math.min(totalPages, page + 1)"
          :disabled="page >= totalPages"
          class="h-9 w-9 rounded-btn border border-line-300 hover:border-royal-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >›</button>
      </div>
    </div>

    <!-- Form trượt "Yêu cầu xuất VAT" (sale) -->
    <VatRequestDrawer :order="vatOrder" @close="vatOrder = null" @saved="onVatSaved" />

    <!-- Popup xem hoá đơn đã ký + tải về gửi khách -->
    <VatViewDialog :order="vatViewOrder" @close="vatViewOrder = null" />

    <!-- Popup "Xác nhận đã xuất VAT" (kế toán bấm thẳng từ dòng đơn) -->
    <VatConfirmDialog
      :order="vatConfirmOrder"
      @close="vatConfirmOrder = null"
      @saved="onVatSaved"
    />
  </div>
</template>
