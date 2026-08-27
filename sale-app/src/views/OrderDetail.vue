<script setup>
import { ref, computed, onMounted, defineAsyncComponent, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
// Chứng từ A4 nặng ~214 KB (kèm html2canvas) mà chỉ hiện khi bấm xem/in phiếu
// → nạp lười, đừng để nó đi kèm mỗi lần mở chi tiết đơn (đo 26/8/2026).
const SalesDocument = defineAsyncComponent({
  loader: () => import('../components/SalesDocument.vue'),
  // Lần đầu bấm xem phiếu phải tải chunk ~200ms; không có dòng chờ này thì màn
  // hình đứng im, sale tưởng lỗi và bấm lại. Từ lần 2 đã nằm trong máy nên
  // delay 150ms khiến dòng chờ hầu như không bao giờ hiện.
  delay: 150,
  loadingComponent: {
    render: () =>
      h(
        'div',
        { class: 'fixed inset-0 z-[60] bg-black/40 flex items-center justify-center' },
        h('div', { class: 'bg-white rounded-card px-5 py-4 text-sm font-semibold text-ink-primary shadow-pop' }, 'Đang mở phiếu…'),
      ),
  },
});
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

// ── Gửi Zalo / mở phiếu ──
// 28/8/2026: bỏ hàm downloadReceipt + khối DOM ẩn 81 dòng đi kèm. Không ai gọi
// hàm đó (nút "Tải ảnh phiếu" thực ra mở popup phiếu A4 — nhãn nay sửa thành
// "Xem / In phiếu"), mà khối ẩn vẫn render mỗi lần mở đơn. Muốn tải ảnh thì
// bấm ⤓ trong popup — SalesDocument.vue đã có sẵn cả In/Lưu PDF và Tải ảnh PNG.
const COMPANY_NAME = 'Ngheduocsi.vn';
const shareMsg = ref('');
let shareMsgTimer = null;

function flashShareMsg(text) {
  shareMsg.value = text;
  if (shareMsgTimer) clearTimeout(shareMsgTimer);
  shareMsgTimer = setTimeout(() => (shareMsg.value = ''), 3000);
}

// ── Đặt lại đơn ──
const reordering = ref(false);

// ── Thanh toán đã chuyển hẳn sang màn Công nợ (không ghi nhận ở đơn nữa). ──

// ── Sửa đơn Nháp (admin) — chỉnh số lượng / xoá dòng ──
const editingItems = ref(false);
const itemSaving = ref(false);
const itemError = ref('');

// ── Ảnh giao hàng / giao thành công (upload lên Supabase qua backend) ──
const shipPhone = ref('');
const shipPhotos = ref([]); // URL[]
const deliveryPhotos = ref([]); // URL[] — ảnh giao thành công
const handoverPhotos = ref([]); // URL[] — ảnh/file biên bản bàn giao
const uploadingShip = ref(false);
const uploadingDelivery = ref(false);
const uploadingHandover = ref(false);

const PHOTO_TARGETS = {
  ship: { flag: uploadingShip, bucket: shipPhotos },
  delivery: { flag: uploadingDelivery, bucket: deliveryPhotos },
  handover: { flag: uploadingHandover, bucket: handoverPhotos },
};

// Upload nhiều ảnh/file cho đơn → đẩy URL vào bucket tương ứng.
async function uploadOrderPhotos(files, target) {
  if (!files || !files.length) return;
  const { flag, bucket } = PHOTO_TARGETS[target];
  flag.value = true;
  advanceError.value = '';
  try {
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/orders/${route.params.id}/photos`, fd);
      if (data?.url) bucket.value.push(data.url);
    }
  } catch (err) {
    advanceError.value = err.response?.data?.error || 'Lỗi upload tệp';
  } finally {
    flag.value = false;
  }
}
function onShipFiles(e) { uploadOrderPhotos(e.target.files, 'ship'); e.target.value = ''; }
function onDeliveryFiles(e) { uploadOrderPhotos(e.target.files, 'delivery'); e.target.value = ''; }
function onHandoverFiles(e) { uploadOrderPhotos(e.target.files, 'handover'); e.target.value = ''; }
function removeShipPhoto(i) { shipPhotos.value.splice(i, 1); }
function removeDeliveryPhoto(i) { deliveryPhotos.value.splice(i, 1); }
function removeHandoverPhoto(i) { handoverPhotos.value.splice(i, 1); }

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
  draft: { to: 'confirmed', label: 'Kho xác nhận đủ hàng' },
  // Đã gộp "Đóng gói" vào "Đang giao": xác nhận → giao thẳng (trừ kho ở bước này).
  confirmed: { to: 'shipping', label: 'Giao cho vận chuyển' },
  // Giữ cho đơn cũ lỡ đang ở 'packing' (luồng CRM) vẫn đi tiếp được.
  packing: { to: 'shipping', label: 'Giao cho vận chuyển' },
  shipping: { to: 'completed', label: 'Hoàn tất đơn' },
};

const TIMELINE = [
  { key: 'draft', label: 'Sale lên đơn' },
  { key: 'confirmed', label: 'Kho xác nhận đủ hàng' },
  { key: 'shipping', label: 'Giao cho vận chuyển' },
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
// Sửa số lượng đơn: chỉ owner/admin (kho vận) + đơn còn ở Nháp/Xác nhận.
const canEditItems = computed(
  () => isAdmin.value && order.value && ['draft', 'confirmed'].includes(norm.value),
);
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

// ── Trạng thái xuất VAT (quy trình anh Philip chốt 24/8/2026) ──────────
const VAT_LABEL = {
  requested: { text: 'CHỜ KẾ TOÁN XUẤT VAT', cls: 'bg-amber-100 text-amber-700' },
  partial: { text: 'XUẤT MỘT PHẦN', cls: 'bg-royal-100 text-royal-700' },
  issued: { text: 'ĐÃ XUẤT VAT', cls: 'bg-emerald-100 text-emerald-700' },
  skipped: { text: 'KHÔNG XUẤT VAT', cls: 'bg-slate-200 text-slate-700' },
};
const vatStatus = computed(() => order.value?.vatInvoiceStatus || 'not_issued');
const vatBadgeInfo = computed(() => VAT_LABEL[vatStatus.value] || null);
const vatIssuedAmount = computed(() => Number(order.value?.vatIssuedAmount || 0));

const vatHistory = ref([]);
const vatHistoryOpen = ref(false);
const vatHistoryLoading = ref(false);
async function toggleVatHistory() {
  vatHistoryOpen.value = !vatHistoryOpen.value;
  if (!vatHistoryOpen.value || vatHistory.value.length) return;
  vatHistoryLoading.value = true;
  try {
    const { data } = await api.get(`/orders/${order.value.id}/vat-invoices`);
    vatHistory.value = data.invoices || [];
  } catch {
    vatHistory.value = [];
  } finally {
    vatHistoryLoading.value = false;
  }
}
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

// ── Lịch sử cập nhật đơn (dựng từ các mốc thời gian đã lưu) ──
const timeline = computed(() => {
  const o = order.value;
  if (!o) return [];
  const rows = [];
  const push = (at, label, meta) => { if (at) rows.push({ at, label, meta }); };
  push(o.createdAt, 'Sale lên đơn', null);
  push(o.confirmedAt, 'Kho xác nhận đủ hàng', null);
  push(o.shippedAt, 'Giao cho vận chuyển', [
    o.shippingProvider && `ĐVVC: ${o.shippingProvider}`,
    o.trackingCode && `Mã VĐ: ${o.trackingCode}`,
    o.shipperPhone && `SĐT shipper: ${o.shipperPhone}`,
  ].filter(Boolean).join(' · ') || null);
  push(o.completedAt, 'Giao thành công', null);
  push(o.cancelledAt, 'Huỷ đơn', o.cancelReason ? `Lý do: ${o.cancelReason}` : null);
  push(o.returnedAt, 'Đơn hoàn', o.returnReason ? `Lý do: ${o.returnReason}` : null);
  // Mới nhất lên đầu
  return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
});

// ── Tài liệu đính kèm (ảnh/file) — bằng chứng gửi khách ──
const docGroups = computed(() => {
  const o = order.value;
  if (!o) return [];
  const g = (label, arr) => ({ label, files: Array.isArray(arr) ? arr : [] });
  return [
    g('Ảnh bàn giao vận chuyển', o.shippingPhotos),
    g('Biên bản bàn giao', o.handoverPhotos),
    g('Ảnh giao thành công', o.deliveryPhotos),
  ].filter((grp) => grp.files.length > 0);
});
const hasDocs = computed(() => docGroups.value.length > 0);
function isPdf(url) { return /\.pdf($|\?)/i.test(url || ''); }

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

// ── Sửa số lượng / xoá dòng hàng (đơn Nháp, admin) ──
// Cập nhật số lượng 1 dòng; qty<=0 hoặc bấm xoá → gọi DELETE.
async function updateItemQty(item, newQty) {
  const qty = Math.max(0, Math.floor(Number(newQty) || 0));
  itemSaving.value = true;
  itemError.value = '';
  try {
    if (qty === 0) {
      await api.delete(`/orders/${route.params.id}/items/${item.id}`);
    } else {
      await api.put(`/orders/${route.params.id}/items/${item.id}`, { quantity: qty });
    }
    await load();
  } catch (err) {
    itemError.value = err.response?.data?.error || 'Lỗi cập nhật số lượng';
  } finally {
    itemSaving.value = false;
  }
}
async function removeItem(item) {
  itemSaving.value = true;
  itemError.value = '';
  try {
    await api.delete(`/orders/${route.params.id}/items/${item.id}`);
    await load();
  } catch (err) {
    itemError.value = err.response?.data?.error || 'Lỗi xoá sản phẩm';
  } finally {
    itemSaving.value = false;
  }
}
// Sửa đơn giá 1 dòng (đơn Nháp/Xác nhận). Bỏ qua nếu không đổi.
async function updateItemPrice(item, newPrice) {
  const price = Math.max(0, Math.floor(Number(newPrice) || 0));
  if (price === num(item.unitPrice)) return;
  itemSaving.value = true;
  itemError.value = '';
  try {
    await api.put(`/orders/${route.params.id}/items/${item.id}`, { unitPrice: price });
    await load();
  } catch (err) {
    itemError.value = err.response?.data?.error || 'Lỗi cập nhật giá';
  } finally {
    itemSaving.value = false;
  }
}

// ── Thêm sản phẩm vào đơn (chế độ sửa) — giá theo bậc của khách ──
const addQuery = ref('');
const addResults = ref([]);
const addSearching = ref(false);
let addTimer = null;
function onAddSearch() {
  if (addTimer) clearTimeout(addTimer);
  const q = addQuery.value.trim();
  if (!q) { addResults.value = []; return; }
  addTimer = setTimeout(async () => {
    addSearching.value = true;
    try {
      const tier = order.value?.contact?.policyTier || 'thung_1';
      const { data } = await api.get('/sale-app/products/search', { params: { q, tier, limit: 8 } });
      addResults.value = data.products || [];
    } catch {
      addResults.value = [];
    } finally {
      addSearching.value = false;
    }
  }, 300);
}
async function addProductToOrder(p) {
  if (p.price == null || p.price <= 0 || !p.priceTierId) {
    itemError.value = `SP "${p.name}" chưa có giá cho bậc khách này — không thêm được.`;
    return;
  }
  itemSaving.value = true;
  itemError.value = '';
  try {
    await api.post(`/orders/${route.params.id}/items`, {
      productId: p.id,
      quantity: 1,
      unitPrice: p.price,
      priceTierId: p.priceTierId,
    });
    addQuery.value = '';
    addResults.value = [];
    await load();
  } catch (err) {
    itemError.value = err.response?.data?.error || 'Lỗi thêm sản phẩm';
  } finally {
    itemSaving.value = false;
  }
}

function openAdvance() {
  advanceError.value = '';
  if (nextStep.value?.to === 'shipping') {
    shipTracking.value = order.value?.trackingCode || '';
    shipProvider.value = order.value?.shippingProvider || '';
    shipPhone.value = order.value?.shipperPhone || '';
    shipPhotos.value = Array.isArray(order.value?.shippingPhotos) ? [...order.value.shippingPhotos] : [];
  }
  if (nextStep.value?.to === 'completed') {
    handoverPhotos.value = Array.isArray(order.value?.handoverPhotos) ? [...order.value.handoverPhotos] : [];
    deliveryPhotos.value = Array.isArray(order.value?.deliveryPhotos) ? [...order.value.deliveryPhotos] : [];
  }
  showAdvance.value = true;
}

async function submitAdvance() {
  const step = nextStep.value;
  if (!step) return;
  // ── Bước "Đang giao": bắt buộc đủ thông tin giao hàng (trừ khách tự lấy) ──
  if (step.to === 'shipping' && !isPickup.value) {
    if (!shipTracking.value.trim()) { advanceError.value = 'Vui lòng nhập Mã vận đơn.'; return; }
    if (!shipProvider.value.trim()) { advanceError.value = 'Vui lòng nhập Đơn vị vận chuyển / Số ship.'; return; }
    if (!shipPhone.value.trim()) { advanceError.value = 'Vui lòng nhập SĐT shipper.'; return; }
    if (shipPhotos.value.length === 0) { advanceError.value = 'Vui lòng thêm ít nhất 1 ảnh chụp lúc bàn giao.'; return; }
  }
  // ── Bước "Giao thành công": bắt buộc biên bản + ảnh ──
  if (step.to === 'completed') {
    if (handoverPhotos.value.length === 0) { advanceError.value = 'Vui lòng đính kèm ảnh/file biên bản bàn giao.'; return; }
    if (deliveryPhotos.value.length === 0) { advanceError.value = 'Vui lòng thêm ít nhất 1 ảnh giao thành công.'; return; }
  }
  advanceSaving.value = true;
  advanceError.value = '';
  try {
    const body = { to_status: step.to };
    if (step.to === 'shipping') {
      if (shipTracking.value.trim()) body.trackingCode = shipTracking.value.trim();
      if (shipProvider.value.trim()) body.shippingProvider = shipProvider.value.trim();
      if (shipPhone.value.trim()) body.shipperPhone = shipPhone.value.trim();
      if (shipPhotos.value.length) body.shippingPhotos = shipPhotos.value;
    }
    if (step.to === 'completed') {
      body.handoverPhotos = handoverPhotos.value;
      body.deliveryPhotos = deliveryPhotos.value;
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

// ── Xem/bổ sung tài liệu theo giai đoạn (bấm vào timeline) ──
const STAGE_LABELS = { draft: 'Sale lên đơn', confirmed: 'Kho xác nhận đủ hàng', shipping: 'Giao cho vận chuyển', completed: 'Hoàn tất' };
const STAGE_DOCS = {
  draft: [],
  confirmed: [],
  shipping: [{ field: 'shippingPhotos', label: 'Ảnh bàn giao vận chuyển', pdf: false }],
  completed: [
    { field: 'handoverPhotos', label: 'Biên bản bàn giao', pdf: true },
    { field: 'deliveryPhotos', label: 'Ảnh giao thành công', pdf: false },
  ],
};
const docStage = ref(null); // stage key đang mở
const stageDraft = ref({ shippingPhotos: [], handoverPhotos: [], deliveryPhotos: [] });
const stageUploading = ref(false);
const stageDocSaving = ref(false);
const stageDocError = ref('');
const stageDocConfig = computed(() => STAGE_DOCS[docStage.value] || []);
// Mốc thời gian của giai đoạn đang mở (để hiển thị trong popup)
const stageAt = computed(() => {
  const o = order.value; if (!o) return null;
  return { draft: o.createdAt, confirmed: o.confirmedAt, shipping: o.shippedAt, completed: o.completedAt }[docStage.value];
});

function openStageDocs(stageKey) {
  const o = order.value || {};
  docStage.value = stageKey;
  stageDocError.value = '';
  stageDraft.value = {
    shippingPhotos: Array.isArray(o.shippingPhotos) ? [...o.shippingPhotos] : [],
    handoverPhotos: Array.isArray(o.handoverPhotos) ? [...o.handoverPhotos] : [],
    deliveryPhotos: Array.isArray(o.deliveryPhotos) ? [...o.deliveryPhotos] : [],
  };
}
async function onStageUpload(field, e) {
  const files = e.target.files;
  e.target.value = '';
  if (!files || !files.length) return;
  stageUploading.value = true;
  stageDocError.value = '';
  try {
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post(`/orders/${route.params.id}/photos`, fd);
      if (data?.url) stageDraft.value[field].push(data.url);
    }
  } catch (err) {
    stageDocError.value = err.response?.data?.error || 'Lỗi upload tệp';
  } finally {
    stageUploading.value = false;
  }
}
function removeStageDoc(field, i) { stageDraft.value[field].splice(i, 1); }
async function saveStageDocs() {
  stageDocSaving.value = true;
  stageDocError.value = '';
  try {
    const body = {};
    for (const g of stageDocConfig.value) body[g.field] = stageDraft.value[g.field];
    await api.patch(`/orders/${route.params.id}/documents`, body);
    docStage.value = null;
    await load();
    flashShareMsg('Đã cập nhật tài liệu');
  } catch (err) {
    stageDocError.value = err.response?.data?.error || 'Lỗi lưu tài liệu';
  } finally {
    stageDocSaving.value = false;
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
            <button
              type="button"
              @click="openStageDocs(s.key)"
              title="Xem / bổ sung tài liệu giai đoạn này"
              class="flex flex-col items-center shrink-0 group focus:outline-none"
            >
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition group-hover:ring-2 group-hover:ring-royal-300"
                :class="idx <= activeStep ? 'bg-royal-700 text-white' : 'bg-surface-50 border border-line-300 text-ink-disabled'"
              >
                <svg v-if="idx < activeStep" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span v-else>{{ idx + 1 }}</span>
              </div>
              <span class="text-[10px] mt-1 text-center group-hover:text-royal-700" :class="idx <= activeStep ? 'text-ink-primary font-medium' : 'text-ink-disabled'">
                {{ s.label }}
              </span>
            </button>
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

      <!-- Trạng thái xuất VAT — chỉ hiện khi đơn đã vào quy trình xuất hoá đơn -->
      <div v-if="vatBadgeInfo" class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="flex items-center justify-between gap-3 mb-2">
          <div class="text-xs font-semibold text-ink-secondary uppercase">Trạng thái xuất VAT</div>
          <span class="text-[10px] uppercase font-bold px-2 py-1 rounded" :class="vatBadgeInfo.cls">
            {{ vatBadgeInfo.text }}
          </span>
        </div>

        <div v-if="order.vatRequestedAt" class="text-[12px] text-ink-secondary">
          Yêu cầu xuất lúc: {{ formatDateTimeVN(order.vatRequestedAt) }}
        </div>
        <div v-if="vatIssuedAmount > 0" class="text-[12px] text-ink-secondary mt-0.5">
          Đã xuất: <span class="font-semibold text-ink-primary">{{ formatVND(vatIssuedAmount) }}</span>
          <template v-if="vatStatus === 'partial'">
            · còn lại {{ formatVND(Math.max(0, orderTotal - vatIssuedAmount)) }}
          </template>
          <template v-if="order.vatInvoiceId"> · số HĐ gần nhất: {{ order.vatInvoiceId }}</template>
        </div>
        <div v-if="order.vatSkipReason" class="text-[12px] text-ink-secondary mt-0.5">
          Lý do không xuất: {{ order.vatSkipReason }}
        </div>

        <div class="flex flex-wrap gap-2 mt-3">
          <button
            @click="toggleVatHistory"
            class="h-9 px-3 rounded-btn border border-line-300 text-[13px] font-semibold text-ink-secondary hover:border-royal-700 hover:text-royal-700 transition"
          >
            {{ vatHistoryOpen ? 'Ẩn lịch sử xuất VAT' : 'Xem lịch sử xuất VAT' }}
          </button>
          <a
            v-if="order.vatInvoiceUrl"
            :href="order.vatInvoiceUrl"
            target="_blank"
            rel="noopener"
            class="h-9 px-3 rounded-btn border border-royal-700 text-royal-700 text-[13px] font-semibold hover:bg-royal-50 transition flex items-center"
          >
            Xem hoá đơn
          </a>
        </div>

        <div v-if="vatHistoryOpen" class="mt-3 border-t border-line-200 pt-3">
          <div v-if="vatHistoryLoading" class="h-10 bg-surface-soft animate-pulse rounded"></div>
          <div v-else-if="!vatHistory.length" class="text-[12px] text-ink-secondary">
            Chưa có hoá đơn nào được xuất cho đơn này.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="inv in vatHistory"
              :key="inv.id"
              class="flex items-start justify-between gap-3 text-[12px] border border-line-200 rounded-lg px-3 py-2"
            >
              <div class="min-w-0">
                <div class="font-semibold text-ink-primary">
                  HĐ {{ inv.invoiceNumber }}
                  <a v-if="inv.fileUrl" :href="inv.fileUrl" target="_blank" rel="noopener" class="ml-1.5 text-royal-700 underline font-normal">
                    file
                  </a>
                </div>
                <div class="text-ink-secondary">
                  Ngày {{ String(inv.invoiceDate).slice(0, 10).split('-').reverse().join('/') }}
                  · {{ inv.issuedBy?.fullName || '—' }}
                </div>
                <div v-if="inv.lookupCode" class="text-ink-secondary">
                  Mã tra cứu: <span class="font-mono">{{ inv.lookupCode }}</span>
                </div>
                <div v-if="inv.note" class="text-ink-disabled truncate">{{ inv.note }}</div>
              </div>
              <div class="font-semibold tabular-nums shrink-0">{{ formatVND(inv.amount) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Items -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="flex items-center justify-between mb-3">
          <div class="text-xs font-semibold text-ink-secondary uppercase">
            Sản phẩm ({{ order.items?.length || 0 }})
          </div>
          <!-- Sửa số lượng: chỉ admin + đơn Nháp/Xác nhận -->
          <button
            v-if="canEditItems"
            @click="editingItems = !editingItems; itemError = ''; addQuery = ''; addResults = []"
            type="button"
            class="text-sm font-bold px-4 py-2 rounded-xl transition shadow-pop"
            :class="editingItems ? 'border-2 border-rose-500 text-rose-600 bg-white hover:bg-rose-50' : 'bg-rose-600 text-white hover:bg-rose-700'"
          >
            {{ editingItems ? '✓ Xong' : '✎ Sửa đơn hàng' }}
          </button>
        </div>
        <div v-if="itemError" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
          {{ itemError }}
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
              <!-- Bộ chỉnh số lượng + giá (chế độ sửa) -->
              <div v-if="editingItems" class="mt-1.5 space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-ink-secondary w-9 shrink-0">SL:</span>
                  <button type="button" :disabled="itemSaving" @click="updateItemQty(it, num(it.quantity) - 1)" class="w-7 h-7 rounded-lg border border-line-300 text-ink-primary font-bold hover:bg-surface-50 disabled:opacity-40">−</button>
                  <input
                    type="number" min="0" :value="num(it.quantity)" :disabled="itemSaving"
                    @change="updateItemQty(it, $event.target.value)"
                    class="w-14 h-7 text-center rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm font-semibold"
                  />
                  <button type="button" :disabled="itemSaving" @click="updateItemQty(it, num(it.quantity) + 1)" class="w-7 h-7 rounded-lg border border-line-300 text-ink-primary font-bold hover:bg-surface-50 disabled:opacity-40">+</button>
                  <button type="button" :disabled="itemSaving" @click="removeItem(it)" class="ml-1 text-xs text-rose-600 font-semibold hover:underline disabled:opacity-40">Xoá</button>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[11px] text-ink-secondary w-9 shrink-0">Giá:</span>
                  <input
                    type="number" min="0" step="1000" :value="num(it.unitPrice)" :disabled="itemSaving"
                    @change="updateItemPrice(it, $event.target.value)"
                    class="w-32 h-7 px-2 text-right rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm font-semibold"
                  />
                  <span class="text-[11px] text-ink-disabled">đ / {{ it.unit || 'đơn vị' }}</span>
                </div>
              </div>
            </div>
            <div class="text-sm font-semibold text-ink-primary shrink-0">{{ formatVND(it.lineTotal) }}</div>
          </div>
        </div>

        <!-- Thêm sản phẩm (chế độ sửa) -->
        <div v-if="editingItems" class="mt-3 pt-3 border-t border-dashed border-line-300">
          <label class="block text-[11px] font-semibold text-ink-secondary uppercase mb-1.5">Thêm sản phẩm vào đơn</label>
          <input
            v-model="addQuery"
            @input="onAddSearch"
            type="search"
            placeholder="Gõ tên SP hoặc SKU..."
            class="w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm"
          />
          <div v-if="addSearching" class="text-[11px] text-ink-disabled mt-1.5">Đang tìm...</div>
          <div v-else-if="addResults.length" class="mt-1.5 border border-line-200 rounded-lg divide-y divide-line-100 max-h-64 overflow-y-auto">
            <button
              v-for="p in addResults"
              :key="p.id"
              type="button"
              :disabled="itemSaving"
              @click="addProductToOrder(p)"
              class="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-surface-50 disabled:opacity-50"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm text-ink-primary leading-snug truncate">{{ p.name }}</div>
                <div class="text-[11px] text-ink-secondary">{{ p.sku }} · Tồn: {{ p.stock ?? '—' }}</div>
              </div>
              <div class="text-sm font-semibold shrink-0" :class="p.price ? 'text-royal-700' : 'text-ink-disabled'">
                {{ p.price ? formatVND(p.price) : 'Chưa có giá' }}
              </div>
              <span class="text-royal-700 font-bold shrink-0">＋</span>
            </button>
          </div>
          <div v-else-if="addQuery.trim()" class="text-[11px] text-ink-disabled mt-1.5">Không tìm thấy sản phẩm.</div>
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

      <!-- Lịch sử cập nhật & Tài liệu (bằng chứng gửi khách) -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">Lịch sử &amp; tài liệu</div>

        <!-- Mốc thời gian -->
        <div class="space-y-2.5">
          <div v-for="(row, i) in timeline" :key="i" class="flex gap-2.5">
            <div class="flex flex-col items-center shrink-0">
              <span class="w-2.5 h-2.5 rounded-full mt-1" :class="i === 0 ? 'bg-royal-700' : 'bg-line-300'"></span>
              <span v-if="i < timeline.length - 1" class="flex-1 w-px bg-line-200 my-0.5"></span>
            </div>
            <div class="min-w-0 flex-1 pb-1">
              <div class="text-sm font-semibold text-ink-primary">{{ row.label }}</div>
              <div class="text-[11px] text-ink-secondary">{{ formatDateTimeVN(row.at) }}</div>
              <div v-if="row.meta" class="text-[11px] text-ink-secondary mt-0.5">{{ row.meta }}</div>
            </div>
          </div>
        </div>

        <!-- Tài liệu đính kèm -->
        <div v-if="hasDocs" class="mt-4 pt-3 border-t border-line-200 space-y-3">
          <div v-for="grp in docGroups" :key="grp.label">
            <div class="text-[11px] font-semibold text-ink-secondary uppercase mb-1.5">{{ grp.label }} ({{ grp.files.length }})</div>
            <div class="flex flex-wrap gap-2">
              <a
                v-for="(f, i) in grp.files" :key="i"
                :href="f" target="_blank" rel="noopener"
                class="relative w-16 h-16 rounded-lg overflow-hidden border border-line-200 bg-surface-50 block group"
                title="Bấm để xem / tải về"
              >
                <img v-if="!isPdf(f)" :src="f" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-ink-secondary font-semibold">PDF</div>
                <span class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center text-white text-[10px] opacity-0 group-hover:opacity-100">Xem</span>
              </a>
            </div>
          </div>
          <div class="text-[11px] text-ink-disabled">Bấm vào ảnh/file để mở, xem hoặc lưu về làm bằng chứng gửi khách.</div>
        </div>
        <div v-else class="mt-3 text-[11px] text-ink-disabled">Chưa có tài liệu đính kèm (ảnh giao hàng sẽ hiện ở đây sau khi cập nhật trạng thái).</div>
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

    <!-- Gửi Zalo / mở phiếu xuất kho -->
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
        Xem / In phiếu
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
      v-if="order && canCancel"
      class="flex gap-2 mt-1"
    >
      <button
        v-if="canCancel"
        @click="showCancel = true; cancelReason = ''; cancelError = ''"
        class="flex-1 h-11 rounded-xl border border-rose-300 text-rose-600 font-semibold hover:bg-rose-50"
      >
        Huỷ đơn
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
        <template v-else-if="nextStep.to === 'completed'">
          <div class="text-sm text-ink-secondary mb-3">
            Xác nhận đơn <span class="font-mono font-semibold">{{ orderCode }}</span> đã giao thành công.
            <template v-if="debt > 0">
              Còn nợ: <span class="font-bold text-red-600">{{ formatVND(debt) }}</span> (thu tiền ở màn Công nợ).
            </template>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">Biên bản bàn giao (ảnh/file) <span class="text-rose-500">*</span></label>
              <div class="flex flex-wrap gap-2">
                <div v-for="(url, i) in handoverPhotos" :key="i" class="relative w-16 h-16 rounded-lg overflow-hidden border border-line-200 bg-surface-50">
                  <img v-if="!/\.pdf($|\?)/i.test(url)" :src="url" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-ink-secondary font-semibold">PDF</div>
                  <button type="button" @click="removeHandoverPhoto(i)" class="absolute top-0 right-0 bg-black/60 text-white w-5 h-5 text-xs leading-none">✕</button>
                </div>
                <label class="w-16 h-16 rounded-lg border border-dashed border-line-300 flex items-center justify-center text-ink-disabled cursor-pointer hover:bg-surface-50">
                  <span v-if="uploadingHandover" class="text-[10px]">Đang tải...</span>
                  <span v-else class="text-2xl leading-none">＋</span>
                  <input type="file" accept="image/*,application/pdf" multiple class="hidden" @change="onHandoverFiles" />
                </label>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">Ảnh giao thành công <span class="text-rose-500">*</span></label>
              <div class="flex flex-wrap gap-2">
                <div v-for="(url, i) in deliveryPhotos" :key="i" class="relative w-16 h-16 rounded-lg overflow-hidden border border-line-200">
                  <img :src="url" class="w-full h-full object-cover" />
                  <button type="button" @click="removeDeliveryPhoto(i)" class="absolute top-0 right-0 bg-black/60 text-white w-5 h-5 text-xs leading-none">✕</button>
                </div>
                <label class="w-16 h-16 rounded-lg border border-dashed border-line-300 flex items-center justify-center text-ink-disabled cursor-pointer hover:bg-surface-50">
                  <span v-if="uploadingDelivery" class="text-[10px]">Đang tải...</span>
                  <span v-else class="text-2xl leading-none">＋</span>
                  <input type="file" accept="image/*" multiple class="hidden" @change="onDeliveryFiles" />
                </label>
              </div>
            </div>
          </div>
        </template>

        <!-- Bước Giao hàng: nhập đơn vị VC + mã vận đơn -->
        <template v-else-if="nextStep.to === 'shipping'">
          <div
            v-if="norm === 'confirmed'"
            class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3"
          >
            ⚠️ Xuất kho &amp; giao sẽ <span class="font-semibold">trừ kho</span> theo số lượng trong đơn. Không đủ tồn sẽ không chuyển được (đơn cũ nhập từ MISA cần chọn lô trên CRM trước).
          </div>
          <div v-if="isPickup" class="text-sm text-ink-secondary mb-3">
            Đơn khách tự lấy tại kho — không bắt buộc mã vận đơn.
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">
                Đơn vị vận chuyển / Số ship <span v-if="!isPickup" class="text-rose-500">*</span>
              </label>
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
            <div>
              <label class="block text-xs font-medium text-ink-primary mb-1">
                SĐT shipper <span v-if="!isPickup" class="text-rose-500">*</span>
              </label>
              <input
                v-model="shipPhone"
                type="tel"
                inputmode="tel"
                placeholder="SĐT người giao / shipper"
                class="w-full h-11 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm"
              />
            </div>
            <div v-if="!isPickup">
              <label class="block text-xs font-medium text-ink-primary mb-1">Ảnh chụp lúc bàn giao <span class="text-rose-500">*</span></label>
              <div class="flex flex-wrap gap-2">
                <div v-for="(url, i) in shipPhotos" :key="i" class="relative w-16 h-16 rounded-lg overflow-hidden border border-line-200">
                  <img :src="url" class="w-full h-full object-cover" />
                  <button type="button" @click="removeShipPhoto(i)" class="absolute top-0 right-0 bg-black/60 text-white w-5 h-5 text-xs leading-none">✕</button>
                </div>
                <label class="w-16 h-16 rounded-lg border border-dashed border-line-300 flex items-center justify-center text-ink-disabled cursor-pointer hover:bg-surface-50">
                  <span v-if="uploadingShip" class="text-[10px]">Đang tải...</span>
                  <span v-else class="text-2xl leading-none">＋</span>
                  <input type="file" accept="image/*" multiple class="hidden" @change="onShipFiles" />
                </label>
              </div>
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

    <!-- Popup tài liệu theo giai đoạn (bấm vào timeline) -->
    <div v-if="docStage" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" @click.self="docStage = null">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-lg font-bold text-ink-primary">Tài liệu — {{ STAGE_LABELS[docStage] }}</h3>
          <button @click="docStage = null" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <div v-if="stageAt" class="text-[11px] text-ink-secondary mb-3">Thời điểm: {{ formatDateTimeVN(stageAt) }}</div>
        <div v-else class="text-[11px] text-ink-disabled mb-3">Đơn chưa đạt tới giai đoạn này (vẫn có thể chuẩn bị tài liệu trước).</div>

        <template v-if="stageDocConfig.length">
          <div v-for="g in stageDocConfig" :key="g.field" class="mb-4">
            <label class="block text-xs font-medium text-ink-primary mb-1.5">{{ g.label }}</label>
            <div class="flex flex-wrap gap-2">
              <div v-for="(url, i) in stageDraft[g.field]" :key="i" class="relative w-16 h-16 rounded-lg overflow-hidden border border-line-200 bg-surface-50">
                <a :href="url" target="_blank" rel="noopener" class="block w-full h-full">
                  <img v-if="!isPdf(url)" :src="url" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-ink-secondary font-semibold">PDF</div>
                </a>
                <button type="button" @click="removeStageDoc(g.field, i)" class="absolute top-0 right-0 bg-black/60 text-white w-5 h-5 text-xs leading-none">✕</button>
              </div>
              <label class="w-16 h-16 rounded-lg border border-dashed border-line-300 flex items-center justify-center text-ink-disabled cursor-pointer hover:bg-surface-50">
                <span v-if="stageUploading" class="text-[10px]">Đang tải...</span>
                <span v-else class="text-2xl leading-none">＋</span>
                <input type="file" :accept="g.pdf ? 'image/*,application/pdf' : 'image/*'" multiple class="hidden" @change="(e) => onStageUpload(g.field, e)" />
              </label>
            </div>
          </div>
          <div v-if="stageDocError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{{ stageDocError }}</div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="docStage = null" :disabled="stageDocSaving" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">Đóng</button>
            <button type="button" @click="saveStageDocs" :disabled="stageDocSaving || stageUploading" class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50">
              {{ stageDocSaving ? 'Đang lưu...' : 'Lưu tài liệu' }}
            </button>
          </div>
        </template>
        <div v-else class="text-sm text-ink-secondary py-3">
          Giai đoạn này chưa có mục tài liệu riêng. Tài liệu giao hàng nằm ở bước <span class="font-semibold">Giao cho vận chuyển</span> và <span class="font-semibold">Hoàn tất</span>.
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
