<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import {
  formatVND,
  statusLabel,
  statusColor,
  formatDateTimeVN,
} from '../composables/useFormat';

const route = useRoute();
const router = useRouter();
const pos = usePOSStore();

const order = ref(null);
const loading = ref(true);
const errorMsg = ref('');

// ── Đặt lại đơn ──
const reordering = ref(false);

// ── Payment dialog ──
const showPay = ref(false);
const payAmount = ref('');
const payMethod = ref('');
const paySaving = ref(false);
const payError = ref('');

// ── Cancel dialog ──
const showCancel = ref(false);
const cancelReason = ref('');
const cancelSaving = ref(false);
const cancelError = ref('');

const TIMELINE = [
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Xác nhận' },
  { key: 'packing', label: 'Đóng gói' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'completed', label: 'Hoàn tất' },
];

const PAY_METHODS = [
  { value: '', label: 'Giữ nguyên' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'cod', label: 'COD' },
  { value: 'credit', label: 'Công nợ' },
];

const norm = computed(() => order.value?.statusNormalized || order.value?.status || 'draft');
const isCancelled = computed(() => norm.value === 'cancelled');
const isCompleted = computed(() => norm.value === 'completed');
const activeStep = computed(() => TIMELINE.findIndex((s) => s.key === norm.value));

const debt = computed(() => Number(order.value?.debtAmountValue ?? 0));
const canPay = computed(() => order.value && !isCancelled.value);
const canCancel = computed(() => order.value && !isCancelled.value && !isCompleted.value);

function num(v) {
  return Number(v) || 0;
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get(`/orders/${route.params.id}`);
    order.value = data;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được đơn hàng';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function handleReorder() {
  if (!order.value || reordering.value) return;
  reordering.value = true;
  try {
    const { added, skipped } = await pos.loadCartFromOrder(order.value);
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
    reordering.value = false;
  }
}

function openPay() {
  payAmount.value = debt.value > 0 ? String(Math.round(debt.value)) : '';
  payMethod.value = '';
  payError.value = '';
  showPay.value = true;
}

async function submitPay() {
  const amount = Number(payAmount.value);
  if (!amount || amount <= 0) {
    payError.value = 'Số tiền phải > 0';
    return;
  }
  paySaving.value = true;
  payError.value = '';
  try {
    const body = { paidAmount: amount, mode: 'add' };
    if (payMethod.value) body.paymentMethod = payMethod.value;
    await api.post(`/orders/${route.params.id}/payment`, body);
    showPay.value = false;
    await load();
  } catch (err) {
    payError.value = err.response?.data?.error || 'Lỗi ghi nhận thanh toán';
  } finally {
    paySaving.value = false;
  }
}

async function submitCancel() {
  if (!cancelReason.value.trim()) {
    cancelError.value = 'Vui lòng nhập lý do huỷ';
    return;
  }
  cancelSaving.value = true;
  cancelError.value = '';
  try {
    await api.post(`/orders/${route.params.id}/cancel`, { cancelReason: cancelReason.value.trim() });
    showCancel.value = false;
    await load();
  } catch (err) {
    cancelError.value = err.response?.data?.error || 'Lỗi huỷ đơn';
  } finally {
    cancelSaving.value = false;
  }
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[860px] mx-auto">
    <!-- Back -->
    <button
      @click="router.back()"
      class="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary mb-3"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Đơn hàng
    </button>

    <div v-if="loading" class="space-y-3">
      <div class="h-24 bg-white rounded-card border border-line-200 animate-pulse"></div>
      <div class="h-40 bg-white rounded-card border border-line-200 animate-pulse"></div>
      <div class="h-32 bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>

    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <template v-else-if="order">
      <!-- Header card -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <div class="text-lg font-bold font-mono text-ink-primary">{{ order.orderCode }}</div>
            <div class="text-xs text-ink-secondary mt-0.5">
              Ngày tạo: {{ formatDateTimeVN(order.orderDate || order.createdAt) }}
            </div>
          </div>
          <span
            class="text-[11px] uppercase font-semibold px-2.5 py-1 rounded"
            :class="statusColor(norm)"
          >
            {{ statusLabel(norm) }}
          </span>
        </div>

        <!-- Cancelled banner -->
        <div
          v-if="isCancelled"
          class="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm"
        >
          <span class="font-semibold">Đơn đã huỷ.</span>
          <span v-if="order.cancelReason"> Lý do: {{ order.cancelReason }}</span>
        </div>

        <!-- Status timeline -->
        <div v-else class="flex items-center">
          <template v-for="(s, idx) in TIMELINE" :key="s.key">
            <div class="flex flex-col items-center shrink-0">
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                :class="idx <= activeStep ? 'bg-royal-700 text-white' : 'bg-surface-50 border border-line-300 text-ink-disabled'"
              >
                <svg v-if="idx < activeStep" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span v-else>{{ idx + 1 }}</span>
              </div>
              <span class="text-[10px] mt-1 text-center" :class="idx <= activeStep ? 'text-ink-primary font-medium' : 'text-ink-disabled'">
                {{ s.label }}
              </span>
            </div>
            <div
              v-if="idx < TIMELINE.length - 1"
              class="flex-1 h-0.5 mx-1 -mt-4"
              :class="idx < activeStep ? 'bg-royal-700' : 'bg-line-300'"
            ></div>
          </template>
        </div>
      </div>

      <!-- Customer -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="text-xs font-semibold text-ink-secondary uppercase mb-2">Khách hàng</div>
        <div class="text-sm font-semibold text-ink-primary">{{ order.contact?.fullName || '—' }}</div>
        <div v-if="order.contact?.storeName" class="text-xs text-ink-secondary mt-0.5">{{ order.contact.storeName }}</div>
        <div v-if="order.contact?.phone" class="text-xs text-ink-secondary mt-0.5">📞 {{ order.contact.phone }}</div>
        <div v-if="order.deliveryAddress" class="text-xs text-ink-secondary mt-1.5 flex gap-1.5">
          <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          <span>{{ order.deliveryAddress }}</span>
        </div>
        <div v-if="order.assignedSale?.fullName" class="text-[11px] text-ink-disabled mt-2">
          Phụ trách: {{ order.assignedSale.fullName }}
        </div>
      </div>

      <!-- Items -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">
          Sản phẩm ({{ order.items?.length || 0 }})
        </div>
        <div class="space-y-3">
          <div v-for="it in order.items" :key="it.id" class="flex gap-3">
            <div class="w-11 h-11 rounded-lg bg-surface-50 border border-line-200 overflow-hidden shrink-0 flex items-center justify-center text-ink-disabled">
              <img v-if="it.product?.mainImageUrl" :src="it.product.mainImageUrl" :alt="it.productName" class="w-full h-full object-cover" />
              <span v-else class="text-[9px]">{{ (it.sku || '').slice(0, 3) }}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-ink-primary leading-snug">{{ it.productName }}</div>
              <div class="text-[11px] text-ink-secondary mt-0.5">
                {{ num(it.quantity) }} {{ it.unit || '' }} × {{ formatVND(it.unitPrice) }}
                <span v-if="num(it.discountValue) > 0" class="text-amber-600"> − {{ formatVND(it.discountValue) }}</span>
              </div>
            </div>
            <div class="text-sm font-semibold text-ink-primary shrink-0">{{ formatVND(it.lineTotal) }}</div>
          </div>
        </div>

        <!-- Gifts -->
        <template v-if="order.gifts?.length">
          <div class="text-xs font-semibold text-ink-secondary uppercase mt-4 mb-2">Quà tặng</div>
          <div class="space-y-1.5">
            <div v-for="g in order.gifts" :key="g.id" class="flex items-center gap-2 text-sm">
              <span class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Tặng</span>
              <span class="text-ink-primary">{{ g.giftName }}</span>
              <span class="text-ink-secondary">× {{ g.quantity }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Totals -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-ink-secondary">Tạm tính</span>
            <span class="text-ink-primary">{{ formatVND(order.subtotalAmount) }}</span>
          </div>
          <div v-if="num(order.discountAmount) > 0" class="flex justify-between">
            <span class="text-ink-secondary">Giảm giá</span>
            <span class="text-amber-600">− {{ formatVND(order.discountAmount) }}</span>
          </div>
          <div v-if="num(order.shippingFee) > 0" class="flex justify-between">
            <span class="text-ink-secondary">Phí vận chuyển</span>
            <span class="text-ink-primary">{{ formatVND(order.shippingFee) }}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-line-200">
            <span class="font-semibold text-ink-primary">Tổng cộng</span>
            <span class="font-bold text-royal-700 text-base">{{ formatVND(order.totalAmountValue ?? order.totalAmount) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-ink-secondary">Đã thanh toán</span>
            <span class="text-emerald-700 font-medium">{{ formatVND(order.paidAmount) }}</span>
          </div>
          <div v-if="debt > 0" class="flex justify-between">
            <span class="text-ink-secondary">Còn nợ</span>
            <span class="text-red-600 font-bold">{{ formatVND(debt) }}</span>
          </div>
          <div v-if="debt > 0 && order.debtDueDate" class="text-[11px] text-ink-disabled text-right">
            Hạn trả: {{ formatDateTimeVN(order.debtDueDate) }}
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div v-if="order.internalNote || order.customerNote" class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div v-if="order.customerNote" class="mb-2">
          <div class="text-xs font-semibold text-ink-secondary uppercase mb-1">Ghi chú khách</div>
          <div class="text-sm text-ink-primary">{{ order.customerNote }}</div>
        </div>
        <div v-if="order.internalNote">
          <div class="text-xs font-semibold text-ink-secondary uppercase mb-1">Ghi chú nội bộ</div>
          <div class="text-sm text-ink-primary">{{ order.internalNote }}</div>
        </div>
      </div>
    </template>

    <!-- Đặt lại đơn này (luôn hiện khi đã tải đơn) -->
    <button
      v-if="order"
      @click="handleReorder"
      :disabled="reordering"
      class="w-full h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold shadow-pop flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
      </svg>
      {{ reordering ? 'Đang nạp giỏ...' : 'Đặt lại đơn này' }}
    </button>

    <!-- Action bar (inline, end of content) -->
    <div
      v-if="order && (canPay || canCancel)"
      class="flex gap-2 mt-1"
    >
      <button
        v-if="canCancel"
        @click="showCancel = true; cancelReason = ''; cancelError = ''"
        class="flex-1 h-11 rounded-xl border border-rose-300 text-rose-600 font-semibold hover:bg-rose-50"
      >
        Huỷ đơn
      </button>
      <button
        v-if="canPay"
        @click="openPay"
        class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold shadow-pop"
      >
        Ghi nhận thanh toán
      </button>
    </div>

    <!-- Payment dialog -->
    <div v-if="showPay" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Ghi nhận thanh toán</h3>
          <button @click="showPay = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <div class="text-sm text-ink-secondary mb-3" v-if="debt > 0">
          Còn nợ: <span class="font-bold text-red-600">{{ formatVND(debt) }}</span>
        </div>
        <form @submit.prevent="submitPay" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Số tiền thu *</label>
            <input
              v-model="payAmount"
              type="number"
              min="0"
              inputmode="numeric"
              class="w-full h-11 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-base font-semibold"
            />
          </div>
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Hình thức</label>
            <select v-model="payMethod" class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none bg-white">
              <option v-for="m in PAY_METHODS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div v-if="payError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ payError }}
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="showPay = false" :disabled="paySaving" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
              Huỷ
            </button>
            <button type="submit" :disabled="paySaving" class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50">
              {{ paySaving ? 'Đang lưu...' : 'Xác nhận' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Cancel dialog -->
    <div v-if="showCancel" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Huỷ đơn hàng</h3>
          <button @click="showCancel = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <p class="text-sm text-ink-secondary mb-3">
          Đơn <span class="font-mono font-semibold">{{ order?.orderCode }}</span> sẽ bị huỷ. Hàng đã trừ kho (nếu có) sẽ được hoàn lại.
        </p>
        <form @submit.prevent="submitCancel" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Lý do huỷ *</label>
            <textarea
              v-model="cancelReason"
              rows="3"
              placeholder="VD: Khách đổi ý, hết hàng..."
              class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
            ></textarea>
          </div>
          <div v-if="cancelError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ cancelError }}
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="showCancel = false" :disabled="cancelSaving" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
              Quay lại
            </button>
            <button type="submit" :disabled="cancelSaving" class="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50">
              {{ cancelSaving ? 'Đang huỷ...' : 'Xác nhận huỷ' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
