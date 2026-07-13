<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import html2canvas from 'html2canvas';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import SalesDocument from '../components/SalesDocument.vue';
import {
  formatVND,
  statusLabel,
  statusColor,
  formatDateTimeVN,
  formatDateVN,
} from '../composables/useFormat';

const route = useRoute();
const router = useRouter();
const pos = usePOSStore();
const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const order = ref(null);
const loading = ref(true);
const errorMsg = ref('');

// ── Xoá đơn (admin) — chỉ đơn Nháp / Đã huỷ (backend chặn đơn đang chạy) ──
const showDelete = ref(false);
const deleting = ref(false);
const deleteError = ref('');

// ── Phiếu xuất kho / Biên bản bàn giao (giống màn Tạo đơn) ──
const showDoc = ref(false);
const docOrder = computed(() => {
  const o = order.value;
  if (!o) return null;
  return {
    order_code: o.orderCode || o.order_code || '',
    saleName: o.assignedSale?.fullName || '',
    customerName: o.contact?.fullName || '',
    customerPhone: o.contact?.phone || '',
    customerAddress: o.deliveryAddress || o.contact?.address || '',
    deliveryAddress: o.deliveryAddress || o.contact?.address || '',
    note: o.customerNote || o.internalNote || '',
    items: (o.items || []).map((it) => ({
      name: it.productName,
      sku: it.sku,
      unit: it.unit,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      lineTotal: Number(it.lineTotal) || 0,
    })),
    subtotal: Number(o.subtotalAmount) || 0,
    total: Number(o.totalAmountValue ?? o.totalAmount) || 0,
  };
});

// ── Thông tin chuyển khoản (load từ backend, không chặn render) ──
const paymentInfo = ref({ bankName: '', accountNumber: '', accountHolder: '', note: '' });

// ── Gửi Zalo / Tải ảnh phiếu ──
const COMPANY_NAME = 'Ngheduocsi.vn';
const receiptEl = ref(null);
const generatingImage = ref(false);
const shareMsg = ref('');
let shareMsgTimer = null;

function flashShareMsg(text) {
  shareMsg.value = text;
  if (shareMsgTimer) clearTimeout(shareMsgTimer);
  shareMsgTimer = setTimeout(() => (shareMsg.value = ''), 3000);
}

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

// ── Return dialog (đánh dấu đơn hoàn — chỉ admin, đơn đã Giao thành công) ──
const showReturn = ref(false);
const returnReason = ref('');
const returnSaving = ref(false);
const returnError = ref('');

// ── Chuyển trạng thái tiến bước (advance) ──
const showAdvance = ref(false);
const advanceSaving = ref(false);
const advanceError = ref('');
const shipTracking = ref('');
const shipProvider = ref('');
// Gợi ý đơn vị vận chuyển hay dùng (datalist — vẫn gõ tự do được)
const SHIP_PROVIDERS = [
  'Green SM',
  'Giao Hàng Nhanh (GHN)',
  'Giao Hàng Tiết Kiệm (GHTK)',
  'Viettel Post',
  'J&T Express',
  'Ahamove',
  'Grab',
  'Nhất Tín',
  'Khách tự lấy tại kho',
];
// Bước kế tiếp theo trạng thái hiện tại. Khớp FORWARD của backend order-service.
const NEXT_STEP = {
  draft: { to: 'confirmed', label: 'Xác nhận đơn' },
  confirmed: { to: 'packing', label: 'Đóng gói / Chuẩn bị hàng' },
  packing: { to: 'shipping', label: 'Chuyển sang Giao hàng' },
  shipping: { to: 'completed', label: 'Hoàn tất đơn' },
};

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
const isReturned = computed(() => norm.value === 'returned');
const activeStep = computed(() => TIMELINE.findIndex((s) => s.key === norm.value));

const debt = computed(() => Number(order.value?.debtAmountValue ?? 0));
const canPay = computed(() => order.value && !isCancelled.value && !isReturned.value);
const canCancel = computed(
  () => order.value && !isCancelled.value && !isCompleted.value && !isReturned.value,
);
// Đánh dấu hoàn: chỉ admin + đơn đã "Giao thành công" (backend cũng chặn tương tự).
const canReturn = computed(() => isAdmin.value && order.value && isCompleted.value);
// Xoá: chỉ admin + đơn Nháp/Đã huỷ (khớp ràng buộc backend; đơn đang chạy phải Huỷ trước).
const canDelete = computed(() => isAdmin.value && order.value && ['draft', 'cancelled'].includes(norm.value));

// Bước chuyển trạng thái kế tiếp (null nếu đơn đã hoàn tất/huỷ/hoàn hoặc trạng thái lạ).
const nextStep = computed(() =>
  order.value && !isCancelled.value && !isCompleted.value && !isReturned.value
    ? NEXT_STEP[norm.value] || null
    : null,
);
// Đơn khách tự lấy tại kho → không bắt buộc mã vận đơn khi chuyển "Đang giao".
const isPickup = computed(() => order.value?.shippingMethod === 'pickup_at_warehouse');

const orderTotal = computed(() => Number(order.value?.totalAmountValue ?? order.value?.totalAmount ?? 0));
const paid = computed(() => Number(order.value?.paidAmount ?? 0));
const orderCode = computed(() => order.value?.orderCode || order.value?.order_code || '');
const orderDateVN = computed(() => formatDateVN(order.value?.orderDate || order.value?.createdAt));

// Đích Zalo: ưu tiên zaloUid, fallback số điện thoại (chỉ giữ chữ số)
const zaloTarget = computed(() => {
  const c = order.value?.contact;
  if (!c) return '';
  return c.zaloUid || (c.phone || '').replace(/\D/g, '');
});
const hasBankInfo = computed(
  () => !!(paymentInfo.value.bankName || paymentInfo.value.accountNumber),
);

function num(v) {
  return Number(v) || 0;
}

async function loadPaymentInfo() {
  try {
    const { data } = await api.get('/sale-app/payment-info');
    paymentInfo.value = {
      bankName: data?.bankName || '',
      accountNumber: data?.accountNumber || '',
      accountHolder: data?.accountHolder || '',
      note: data?.note || '',
    };
  } catch {
    // Không chặn render nếu lỗi
  }
}

// Build nội dung tin nhắn tiếng Việt cho đơn
function buildOrderMessage() {
  const o = order.value;
  if (!o) return '';
  const lines = [];
  lines.push(COMPANY_NAME);
  lines.push(`Mã đơn: ${orderCode.value}`);
  lines.push(`Ngày đặt: ${orderDateVN.value}`);
  lines.push(`Khách hàng: ${o.contact?.fullName || '—'}`);
  lines.push('');
  lines.push('Chi tiết đơn:');
  (o.items || []).forEach((it) => {
    lines.push(`- ${it.productName} x${num(it.quantity)} = ${formatVND(it.lineTotal)}`);
  });
  lines.push('');
  lines.push(`Tổng tiền: ${formatVND(orderTotal.value)}`);
  if (paid.value > 0 || debt.value > 0) {
    lines.push(`Đã thanh toán: ${formatVND(paid.value)}`);
    lines.push(`Còn nợ: ${formatVND(debt.value)}`);
  }
  if (hasBankInfo.value) {
    lines.push('');
    lines.push(
      `Chuyển khoản: ${paymentInfo.value.bankName} - ${paymentInfo.value.accountNumber} - ${paymentInfo.value.accountHolder}`,
    );
    if (paymentInfo.value.note) lines.push(paymentInfo.value.note);
  }
  return lines.join('\n');
}

async function sendViaZalo() {
  if (!order.value || !zaloTarget.value) return;
  const text = buildOrderMessage();
  // Copy clipboard làm fallback (Zalo có thể không tự điền tin)
  try {
    await navigator.clipboard.writeText(text);
    flashShareMsg('Đã sao chép nội dung đơn');
  } catch {
    flashShareMsg('Đang mở Zalo...');
  }
  const url = `https://zalo.me/${zaloTarget.value}?message=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
}

async function downloadReceipt() {
  if (!order.value || generatingImage.value) return;
  generatingImage.value = true;
  try {
    // Chờ DOM cập nhật khối phiếu (v-if vừa bật khi loading)
    await new Promise((r) => requestAnimationFrame(() => r()));
    const el = receiptEl.value;
    if (!el) throw new Error('no-el');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('no-blob');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `phieu-don-${orderCode.value || 'don-hang'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    flashShareMsg('Đã tải ảnh phiếu đơn');
  } catch {
    flashShareMsg('Không tạo được ảnh phiếu, vui lòng thử lại');
  } finally {
    generatingImage.value = false;
  }
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

onMounted(() => {
  load();
  loadPaymentInfo();
});

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

function openAdvance() {
  advanceError.value = '';
  if (nextStep.value?.to === 'shipping') {
    shipTracking.value = order.value?.trackingCode || '';
    shipProvider.value = order.value?.shippingProvider || '';
  }
  showAdvance.value = true;
}

async function submitAdvance() {
  const step = nextStep.value;
  if (!step) return;
  // "Đang giao" bắt buộc mã vận đơn, trừ đơn khách tự lấy tại kho.
  if (step.to === 'shipping' && !isPickup.value && !shipTracking.value.trim()) {
    advanceError.value = 'Vui lòng nhập mã vận đơn (hoặc đơn khách tự lấy tại kho).';
    return;
  }
  advanceSaving.value = true;
  advanceError.value = '';
  try {
    const body = { to_status: step.to };
    if (step.to === 'shipping') {
      if (shipTracking.value.trim()) body.trackingCode = shipTracking.value.trim();
      if (shipProvider.value.trim()) body.shippingProvider = shipProvider.value.trim();
    }
    await api.post(`/orders/${route.params.id}/transition`, body);
    showAdvance.value = false;
    await load();
    flashShareMsg(`Đã chuyển đơn sang "${statusLabel(step.to)}"`);
  } catch (err) {
    advanceError.value = err.response?.data?.error || 'Lỗi chuyển trạng thái';
  } finally {
    advanceSaving.value = false;
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

async function submitReturn() {
  if (!returnReason.value.trim()) {
    returnError.value = 'Vui lòng nhập lý do hoàn';
    return;
  }
  returnSaving.value = true;
  returnError.value = '';
  try {
    await api.post(`/orders/${route.params.id}/return`, { returnReason: returnReason.value.trim() });
    showReturn.value = false;
    await load();
    flashShareMsg('Đã đánh dấu đơn hoàn, kho đã được cộng lại');
  } catch (err) {
    returnError.value = err.response?.data?.error || 'Lỗi đánh dấu hoàn đơn';
  } finally {
    returnSaving.value = false;
  }
}

// Xoá vĩnh viễn đơn (admin). Backend chỉ cho xoá đơn Nháp/Đã huỷ; nếu đơn
// đang chạy sẽ trả lỗi hướng dẫn Huỷ trước — hiện thẳng cho người dùng.
async function deleteOrder() {
  deleting.value = true;
  deleteError.value = '';
  try {
    await api.delete(`/orders/${route.params.id}`);
    showDelete.value = false;
    router.replace('/orders');
  } catch (err) {
    deleteError.value = err.response?.data?.error || 'Lỗi xoá đơn';
  } finally {
    deleting.value = false;
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

        <!-- Returned banner -->
        <div
          v-else-if="isReturned"
          class="bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-3 py-2 text-sm"
        >
          <span class="font-semibold">Đơn đã hoàn.</span>
          <span v-if="order.returnReason"> Lý do: {{ order.returnReason }}</span>
          <span class="block text-[11px] text-orange-600 mt-0.5">Hàng đã được cộng lại kho; đơn không tính vào doanh thu.</span>
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

        <!-- Nút chuyển sang bước kế tiếp (Xác nhận → Đóng gói → Giao → Hoàn tất) -->
        <button
          v-if="nextStep"
          @click="openAdvance"
          class="mt-4 w-full h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold shadow-pop flex items-center justify-center gap-2"
        >
          {{ nextStep.label }}
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
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

    <!-- Gửi Zalo / Tải ảnh phiếu -->
    <div v-if="order" class="flex flex-col sm:flex-row gap-2 mt-2">
      <button
        @click="sendViaZalo"
        :disabled="!zaloTarget"
        class="flex-1 h-11 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-pop flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Gửi nội dung đơn qua Zalo"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Gửi qua Zalo
      </button>
      <button
        @click="showDoc = true"
        class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-semibold hover:bg-surface-50 flex items-center justify-center gap-2"
        title="Phiếu xuất kho bán hàng / Biên bản bàn giao"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Tải ảnh phiếu
      </button>
    </div>

    <div
      v-if="shareMsg"
      class="mt-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2 text-sm"
    >
      {{ shareMsg }}
    </div>

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

    <!-- Đánh dấu hoàn (admin) — chỉ đơn đã Giao thành công -->
    <button
      v-if="canReturn"
      @click="showReturn = true; returnReason = ''; returnError = ''"
      class="w-full h-11 mt-2 rounded-xl border border-orange-300 text-orange-700 font-semibold hover:bg-orange-50 flex items-center justify-center gap-2"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" />
      </svg>
      Đánh dấu đơn hoàn
    </button>

    <!-- Xoá đơn (admin) — chỉ đơn Nháp / Đã huỷ -->
    <button
      v-if="canDelete"
      @click="showDelete = true; deleteError = ''"
      class="w-full h-11 mt-2 rounded-xl border border-rose-300 text-rose-600 font-semibold hover:bg-rose-50 flex items-center justify-center gap-2"
    >
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
      Xoá đơn (admin)
    </button>

    <!-- Delete confirm dialog -->
    <div v-if="showDelete" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Xoá đơn hàng</h3>
          <button @click="showDelete = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <p class="text-sm text-ink-secondary mb-3">
          Đơn <span class="font-mono font-semibold">{{ order?.orderCode }}</span> sẽ bị
          <span class="font-semibold text-rose-600">xoá vĩnh viễn</span>, không khôi phục được. Anh chắc chắn?
        </p>
        <div v-if="deleteError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {{ deleteError }}
        </div>
        <div class="flex gap-2 pt-1">
          <button type="button" @click="showDelete = false" :disabled="deleting" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
            Quay lại
          </button>
          <button type="button" @click="deleteOrder" :disabled="deleting" class="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50">
            {{ deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn' }}
          </button>
        </div>
      </div>
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

    <!-- Return dialog -->
    <div v-if="showReturn" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Đánh dấu đơn hoàn</h3>
          <button @click="showReturn = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <p class="text-sm text-ink-secondary mb-3">
          Đơn <span class="font-mono font-semibold">{{ order?.orderCode }}</span> sẽ chuyển sang
          <span class="font-semibold text-orange-700">Đơn hoàn</span>. Hàng đã bán sẽ được
          <span class="font-semibold">cộng lại kho</span> và đơn <span class="font-semibold">không tính vào doanh thu</span>.
        </p>
        <form @submit.prevent="submitReturn" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-ink-primary mb-1">Lý do hoàn *</label>
            <textarea
              v-model="returnReason"
              rows="3"
              placeholder="VD: Khách trả hàng, hàng lỗi, giao sai..."
              class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
            ></textarea>
          </div>
          <div v-if="returnError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ returnError }}
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="showReturn = false" :disabled="returnSaving" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
              Quay lại
            </button>
            <button type="submit" :disabled="returnSaving" class="flex-1 h-11 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold disabled:opacity-50">
              {{ returnSaving ? 'Đang xử lý...' : 'Xác nhận hoàn' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Advance status dialog -->
    <div v-if="showAdvance && nextStep" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">{{ nextStep.label }}</h3>
          <button @click="showAdvance = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>

        <!-- Ghi chú theo từng bước -->
        <div v-if="nextStep.to === 'confirmed'" class="text-sm text-ink-secondary mb-3">
          Xác nhận đơn <span class="font-mono font-semibold">{{ orderCode }}</span> đã đủ sản phẩm và có sale phụ trách.
        </div>
        <div
          v-else-if="nextStep.to === 'packing'"
          class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3"
        >
          ⚠️ Đóng gói sẽ <span class="font-semibold">trừ kho</span> theo số lượng trong đơn. Đơn cũ nhập từ MISA cần chọn lô trên CRM trước khi đóng gói.
        </div>
        <div v-else-if="nextStep.to === 'completed'" class="text-sm text-ink-secondary mb-3">
          Hoàn tất đơn yêu cầu <span class="font-semibold">đã thu đủ tiền</span> (đơn công nợ được miễn).
          <template v-if="debt > 0">
            Còn nợ: <span class="font-bold text-red-600">{{ formatVND(debt) }}</span>.
          </template>
        </div>

        <!-- Bước Giao hàng: nhập đơn vị VC + mã vận đơn -->
        <template v-else-if="nextStep.to === 'shipping'">
          <div v-if="isPickup" class="text-sm text-ink-secondary mb-3">
            Đơn khách tự lấy tại kho — không bắt buộc mã vận đơn.
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">Đơn vị vận chuyển</label>
              <input
                v-model="shipProvider"
                list="ship-providers"
                placeholder="VD: Green SM, GHN, GHTK..."
                class="w-full h-11 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm"
              />
              <datalist id="ship-providers">
                <option v-for="p in SHIP_PROVIDERS" :key="p" :value="p" />
              </datalist>
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">
                Mã vận đơn <span v-if="!isPickup" class="text-rose-500">*</span>
                <span v-else class="text-ink-disabled">(không bắt buộc)</span>
              </label>
              <input
                v-model="shipTracking"
                placeholder="Mã tracking từ đơn vị vận chuyển"
                class="w-full h-11 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm font-mono"
              />
            </div>
          </div>
        </template>

        <div v-if="advanceError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          {{ advanceError }}
        </div>

        <div class="flex gap-2 pt-4">
          <button type="button" @click="showAdvance = false" :disabled="advanceSaving" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
            Quay lại
          </button>
          <button type="button" @click="submitAdvance" :disabled="advanceSaving" class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50">
            {{ advanceSaving ? 'Đang xử lý...' : 'Xác nhận' }}
          </button>
        </div>
      </div>
    </div>

    <!-- KHỐI PHIẾU ĐƠN (ẩn ngoài màn hình, dùng cho html2canvas) -->
    <div
      v-if="order"
      aria-hidden="true"
      style="position: absolute; left: -9999px; top: 0; pointer-events: none;"
    >
      <div
        ref="receiptEl"
        style="width: 420px; background: #ffffff; color: #1a1a1a; font-family: Arial, 'Helvetica Neue', sans-serif; padding: 24px; box-sizing: border-box;"
      >
        <!-- Header -->
        <div style="text-align: center; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 12px;">
          <div style="font-size: 18px; font-weight: 700; letter-spacing: 0.5px; color: #1a1a1a;">PHIẾU ĐƠN HÀNG</div>
          <div style="font-size: 13px; font-weight: 600; color: #1d4ed8; margin-top: 2px;">{{ COMPANY_NAME }}</div>
        </div>

        <!-- Mã đơn + ngày -->
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span style="color: #555;">Mã đơn:</span>
          <span style="font-weight: 600; color: #1a1a1a;">{{ orderCode }}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px;">
          <span style="color: #555;">Ngày đặt:</span>
          <span style="color: #1a1a1a;">{{ orderDateVN }}</span>
        </div>

        <!-- Khách hàng -->
        <div style="background: #f5f7fa; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="font-size: 13px; font-weight: 600; color: #1a1a1a;">{{ order.contact?.fullName || '—' }}</div>
          <div v-if="order.contact?.storeName" style="font-size: 11px; color: #555; margin-top: 2px;">{{ order.contact.storeName }}</div>
          <div v-if="order.contact?.phone" style="font-size: 11px; color: #555; margin-top: 2px;">SĐT: {{ order.contact.phone }}</div>
        </div>

        <!-- Bảng sản phẩm -->
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px;">
          <thead>
            <tr style="background: #1d4ed8; color: #ffffff;">
              <th style="text-align: left; padding: 6px 8px; font-weight: 600;">Sản phẩm</th>
              <th style="text-align: center; padding: 6px 4px; font-weight: 600;">SL</th>
              <th style="text-align: right; padding: 6px 4px; font-weight: 600;">Đơn giá</th>
              <th style="text-align: right; padding: 6px 8px; font-weight: 600;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, idx) in order.items" :key="idx" style="border-bottom: 1px solid #e5e7eb;">
              <td style="text-align: left; padding: 6px 8px; color: #1a1a1a;">{{ it.productName }}</td>
              <td style="text-align: center; padding: 6px 4px; color: #1a1a1a;">{{ num(it.quantity) }}</td>
              <td style="text-align: right; padding: 6px 4px; color: #555;">{{ formatVND(it.unitPrice) }}</td>
              <td style="text-align: right; padding: 6px 8px; color: #1a1a1a; font-weight: 500;">{{ formatVND(it.lineTotal) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- Tổng tiền -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #1a1a1a; padding-top: 8px; font-size: 14px;">
          <span style="font-weight: 700; color: #1a1a1a;">TỔNG TIỀN</span>
          <span style="font-weight: 700; color: #1d4ed8;">{{ formatVND(orderTotal) }}</span>
        </div>
        <div v-if="paid > 0 || debt > 0" style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 6px;">
          <span style="color: #555;">Đã thanh toán:</span>
          <span style="color: #047857; font-weight: 600;">{{ formatVND(paid) }}</span>
        </div>
        <div v-if="paid > 0 || debt > 0" style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
          <span style="color: #555;">Còn nợ:</span>
          <span style="color: #dc2626; font-weight: 700;">{{ formatVND(debt) }}</span>
        </div>

        <!-- Thông tin chuyển khoản -->
        <div v-if="hasBankInfo" style="margin-top: 14px; background: #f5f7fa; border: 1px dashed #1d4ed8; border-radius: 8px; padding: 10px 12px;">
          <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px;">THÔNG TIN CHUYỂN KHOẢN</div>
          <div v-if="paymentInfo.bankName" style="font-size: 12px; color: #1a1a1a;">Ngân hàng: {{ paymentInfo.bankName }}</div>
          <div v-if="paymentInfo.accountNumber" style="font-size: 12px; color: #1a1a1a;">Số TK: {{ paymentInfo.accountNumber }}</div>
          <div v-if="paymentInfo.accountHolder" style="font-size: 12px; color: #1a1a1a;">Chủ TK: {{ paymentInfo.accountHolder }}</div>
          <div v-if="paymentInfo.note" style="font-size: 11px; color: #555; margin-top: 4px;">{{ paymentInfo.note }}</div>
        </div>

        <div style="text-align: center; font-size: 10px; color: #999; margin-top: 16px;">
          Cảm ơn quý khách đã đặt hàng cùng {{ COMPANY_NAME }}
        </div>
      </div>
    </div>

    <!-- Phiếu xuất kho bán hàng / Biên bản bàn giao (giống màn Tạo đơn) -->
    <SalesDocument
      v-if="showDoc && docOrder"
      :order="docOrder"
      type="export"
      company-key="halovn"
      @close="showDoc = false"
      @done="showDoc = false"
    />
  </div>
</template>
