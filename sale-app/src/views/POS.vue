<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePOSStore } from '../stores/pos';
import { formatVND } from '../composables/useFormat';
import CustomerPanel from '../components/CustomerPanel.vue';
import CartTable from '../components/CartTable.vue';
import AdvancedOptions from '../components/AdvancedOptions.vue';
import ProductFinder from '../components/ProductFinder.vue';
import NewCustomerDialog from '../components/NewCustomerDialog.vue';
import OrderSummaryDialog from '../components/OrderSummaryDialog.vue';
import CompanyPickDialog from '../components/CompanyPickDialog.vue';

const router = useRouter();
const pos = usePOSStore();

const showNewCustomer = ref(false);
const submitErr = ref('');
const showSummary = ref(false);
const summaryOrder = ref(null);
const showCompanyPick = ref(false);

const customerPanelRef = ref(null);
const productFinderRef = ref(null);

const canSubmit = computed(
  () => pos.selectedCustomer && pos.items.length > 0 && !pos.submitting,
);

// Cảnh báo mềm: đơn công nợ làm tổng nợ vượt hạn mức của KH.
const overCreditLimit = computed(() => {
  const cd = pos.customerDetail;
  const limit = cd?.credit_limit;
  if (!pos.isCredit || limit == null) return null;
  const projected = (cd?.stats?.current_debt || 0) + pos.totalAmount;
  return projected > limit ? projected - limit : null;
});

// Vận chuyển / thanh toán — bản đồ value ↔ nhãn.
const SHIPPING = [
  { v: 'pickup_at_warehouse', l: 'Tự lấy' },
  { v: 'prepaid', l: 'Giao hàng' },
  { v: 'cod', l: 'Grab/COD' },
];
const PAYMENT = [
  { v: 'cod', l: 'COD' },
  { v: 'bank_transfer', l: 'Chuyển khoản' },
  { v: 'credit', l: 'Công nợ' },
];

// Xác nhận đơn: hỏi pháp nhân xuất hoá đơn TRƯỚC khi chốt.
function requestConfirm() {
  if (!canSubmit.value) return;
  submitErr.value = '';
  showCompanyPick.value = true;
}

// Đã chọn công ty trong popup → lưu lựa chọn rồi tạo đơn (confirmed).
// Đóng popup sau khi xong: thành công → mở tóm tắt đơn; lỗi → hiện lỗi ở khối tổng tiền.
async function onPickCompany(key) {
  pos.invoicingCompany = key;
  await submit('confirmed');
  showCompanyPick.value = false;
}

// Lưu tạm (draft) / Xác nhận (confirmed) → tạo đơn rồi mở modal tóm tắt.
async function submit(status) {
  if (!canSubmit.value) return;
  submitErr.value = '';
  try {
    const snapshot = pos.buildOrderSnapshot(); // chụp dữ liệu TRƯỚC khi reset
    const order = await pos.submitOrder(status);
    summaryOrder.value = {
      ...snapshot,
      order_code: order.order_code,
      status: order.status,
    };
    showSummary.value = true;
    pos.reset();
  } catch (err) {
    submitErr.value = err.response?.data?.error || err.message || 'Lỗi khi tạo đơn';
  }
}

function closeSummary() {
  showSummary.value = false;
  summaryOrder.value = null;
}

function onCustomerCreated(customer) {
  pos.selectCustomer(customer);
  showNewCustomer.value = false;
}

// ── Phím tắt: F2 tìm SP · F9 xác nhận · Ctrl+K tìm KH · Ctrl+P in đơn ──
function onKeydown(e) {
  const key = e.key;
  if (key === 'F2') {
    e.preventDefault();
    productFinderRef.value?.focusSearch?.();
  } else if (key === 'F9') {
    e.preventDefault();
    requestConfirm();
  } else if ((e.ctrlKey || e.metaKey) && (key === 'k' || key === 'K')) {
    e.preventDefault();
    customerPanelRef.value?.focusSearch?.();
  } else if ((e.ctrlKey || e.metaKey) && (key === 'p' || key === 'P')) {
    e.preventDefault();
    window.print();
  }
}

onMounted(() => {
  pos.loadStaff();
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="flex flex-col lg:h-[calc(100dvh-72px)] bg-[#F5F7FB]">
    <!-- 3 cột TỈ LỆ (fr) để scale đều theo zoom: Khách 23% | Giỏ 52% | SP 25%. -->
    <!-- min-px chặn cột co quá nhỏ; min-w-0 trên mỗi cột chặn nội dung đẩy rộng -->
    <!-- → cột KHÔNG đổi size theo nội dung, chỉ theo bề ngang viewport. -->
    <div
      class="flex-1 min-h-0 w-full grid grid-cols-1 lg:grid-cols-[minmax(240px,23fr)_minmax(0,52fr)_minmax(260px,25fr)] gap-4 p-4 lg:overflow-hidden"
    >
      <!-- CỘT 1 — Khách hàng -->
      <section class="flex flex-col min-h-0 min-w-0 lg:h-full">
        <div class="flex items-center gap-2 mb-2 px-1 shrink-0">
          <span class="w-5 h-5 rounded-full bg-royal-700 text-white text-[11px] font-bold flex items-center justify-center">1</span>
          <span class="text-sm font-semibold text-ink-primary">Khách hàng</span>
        </div>
        <div class="flex-1 min-h-0 lg:overflow-y-auto pr-0.5">
          <CustomerPanel ref="customerPanelRef" @create-new="showNewCustomer = true" />
        </div>
      </section>

      <!-- CỘT 2 — Giỏ hàng + vận chuyển/thanh toán + tổng tiền sticky -->
      <section class="flex flex-col min-h-0 min-w-0 lg:h-full">
        <div class="flex items-center gap-2 mb-2 px-1 shrink-0">
          <span class="w-5 h-5 rounded-full bg-royal-700 text-white text-[11px] font-bold flex items-center justify-center">2</span>
          <span class="text-sm font-semibold text-ink-primary">Giỏ hàng</span>
        </div>

        <!-- Nhân viên sale — ghim đầu cột cho dễ chọn -->
        <div class="shrink-0 mb-2 bg-white border border-line-200 rounded-xl px-3 py-2 flex items-center gap-2.5">
          <span class="text-[11px] uppercase tracking-wide text-ink-secondary shrink-0 flex items-center gap-1">
            <svg class="w-4 h-4 text-royal-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Nhân viên sale
          </span>
          <select
            v-model="pos.assignedSaleId"
            class="flex-1 min-w-0 h-9 px-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm font-medium bg-white"
          >
            <option v-for="s in pos.staffList" :key="s.id" :value="s.id">{{ s.fullName }}</option>
          </select>
        </div>

        <!-- vùng cuộn: bảng giỏ + vận chuyển/thanh toán + nâng cao -->
        <div class="flex-1 min-h-0 lg:overflow-y-auto space-y-3 pr-0.5">
          <CartTable />

          <!-- Vận chuyển & thanh toán -->
          <div class="bg-white border border-line-200 rounded-xl p-3 space-y-3">
            <div>
              <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Vận chuyển</div>
              <div class="grid grid-cols-3 gap-2">
                <label
                  v-for="opt in SHIPPING"
                  :key="opt.v"
                  class="flex items-center justify-center text-xs font-medium px-2 py-2 rounded-lg border cursor-pointer transition"
                  :class="pos.shippingMethod === opt.v ? 'bg-royal-50 text-royal-700 border-royal-700' : 'bg-white text-ink-primary border-line-300'"
                >
                  <input type="radio" :value="opt.v" v-model="pos.shippingMethod" class="sr-only" />
                  {{ opt.l }}
                </label>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Thanh toán</div>
              <div class="grid grid-cols-3 gap-2">
                <label
                  v-for="opt in PAYMENT"
                  :key="opt.v"
                  class="flex items-center justify-center text-xs font-medium px-2 py-2 rounded-lg border cursor-pointer transition"
                  :class="pos.paymentMethod === opt.v ? 'bg-royal-50 text-royal-700 border-royal-700' : 'bg-white text-ink-primary border-line-300'"
                >
                  <input type="radio" :value="opt.v" v-model="pos.paymentMethod" class="sr-only" />
                  {{ opt.l }}
                </label>
              </div>
            </div>
          </div>

          <AdvancedOptions />
        </div>

        <!-- Tổng tiền + nút — STICKY cuối cột -->
        <div class="shrink-0 mt-3 bg-white border border-line-200 rounded-xl p-3 shadow-sm">
          <div v-if="submitErr" class="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ submitErr }}
          </div>
          <div v-if="overCreditLimit" class="mb-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <span class="shrink-0">⚠</span>
            <span>Đơn công nợ này làm KH <span class="font-semibold">vượt hạn mức {{ formatVND(overCreditLimit) }}</span> — cân nhắc trước khi chốt.</span>
          </div>
          <div class="flex items-end justify-between gap-3 mb-3">
            <div class="flex gap-4 text-sm">
              <div>
                <div class="text-[11px] text-ink-secondary">Tạm tính</div>
                <div class="font-medium text-ink-primary">{{ formatVND(pos.subtotal) }}</div>
              </div>
              <div v-if="pos.totalDiscount > 0">
                <div class="text-[11px] text-ink-secondary">Chiết khấu</div>
                <div class="font-medium text-emerald-700">− {{ formatVND(pos.totalDiscount) }}</div>
              </div>
              <div v-if="pos.shippingFee > 0">
                <div class="text-[11px] text-ink-secondary">Phí ship</div>
                <div class="font-medium text-ink-primary">{{ formatVND(pos.shippingFee) }}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[11px] text-ink-secondary">Tổng thanh toán</div>
              <div class="text-2xl font-bold text-royal-700">{{ formatVND(pos.totalAmount) }}</div>
              <div v-if="pos.isCredit" class="text-[11px] text-amber-800 font-medium">
                Còn nợ: {{ formatVND(pos.debtAmount) }}<template v-if="pos.debtTermDays > 0"> · {{ pos.debtTermDays }} ngày</template>
              </div>
            </div>
          </div>
          <div class="flex gap-2">
            <button
              @click="submit('draft')"
              :disabled="!canSubmit"
              type="button"
              class="h-12 px-4 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50 transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ⤓ Lưu tạm
            </button>
            <button
              @click="requestConfirm"
              :disabled="!canSubmit"
              class="flex-1 h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {{ pos.submitting ? 'Đang lưu...' : '✓ Xác nhận đơn (F9)' }}
            </button>
          </div>
        </div>
      </section>

      <!-- CỘT 3 — Tìm sản phẩm -->
      <section class="flex flex-col min-h-0 min-w-0 lg:h-full">
        <div class="flex items-center gap-2 mb-2 px-1 shrink-0">
          <span class="w-5 h-5 rounded-full bg-royal-700 text-white text-[11px] font-bold flex items-center justify-center">3</span>
          <span class="text-sm font-semibold text-ink-primary">Tìm sản phẩm</span>
          <span class="ml-auto text-[11px] text-ink-disabled">Phím tắt: F2</span>
        </div>
        <div class="flex-1 min-h-0 bg-white border border-line-200 rounded-xl p-3 lg:overflow-hidden">
          <ProductFinder ref="productFinderRef" />
        </div>
      </section>
    </div>

    <!-- Thanh phím tắt dưới cùng -->
    <div class="hidden lg:flex shrink-0 items-center gap-5 px-4 py-2 border-t border-line-200 bg-white text-[11px] text-ink-secondary">
      <span><kbd class="font-mono font-semibold text-ink-primary">F2</kbd> Tìm sản phẩm</span>
      <span><kbd class="font-mono font-semibold text-ink-primary">F9</kbd> Xác nhận đơn</span>
      <span><kbd class="font-mono font-semibold text-ink-primary">Ctrl+K</kbd> Tìm khách hàng</span>
      <span><kbd class="font-mono font-semibold text-ink-primary">Ctrl+P</kbd> In đơn</span>
    </div>

    <NewCustomerDialog
      v-if="showNewCustomer"
      @close="showNewCustomer = false"
      @created="onCustomerCreated"
    />

    <CompanyPickDialog
      v-if="showCompanyPick"
      :busy="pos.submitting"
      @pick="onPickCompany"
      @close="showCompanyPick = false"
    />

    <OrderSummaryDialog
      v-if="showSummary && summaryOrder"
      :order="summaryOrder"
      @close="closeSummary"
    />
  </div>
</template>
