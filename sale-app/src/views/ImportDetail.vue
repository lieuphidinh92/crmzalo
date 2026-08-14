<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useImports } from '../composables/useImports';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const isAdmin = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const {
  detail,
  detailLoading,
  detailError,
  warnings,
  confirming,
  saving,
  loadDetail,
  loadWarnings,
  confirmImport,
  patchConfirmed,
  deleteDraft,
  formatVND,
  formatDateVN,
} = useImports();

// Khoảng năm cho mọi <input type="date"> ở màn này — khớp validate backend.
// Browser mặc định cho gõ năm 2 chữ số ('0029'), min/max chặn ngay tại form.
const DATE_MIN = '2000-01-01';
const DATE_MAX = '2100-12-31';

const id = String(route.params.id);

// ── Helpers ──────────────────────────────────────────────────────────
// Tiền lưu dạng Prisma.Decimal → serialize thành string; luôn ép Number.
function num(v) {
  return Number(v) || 0;
}

const imp = computed(() => detail.value);
const status = computed(() => imp.value?.status || 'draft');
const isDraft = computed(() => status.value === 'draft');
const isConfirmed = computed(() => status.value === 'confirmed');

const statusInfo = computed(() =>
  isConfirmed.value
    ? { label: 'Đã chốt', cls: 'bg-emerald-100 text-emerald-700' }
    : { label: 'Nháp', cls: 'bg-gray-100 text-gray-700' },
);

// Giá trị hàng trước phí/chiết khấu/VAT (fallback cho draft cũ chưa có mô hình phí).
const goodsValue = computed(() => num(imp.value?.totalAmount));
const shippingFee = computed(() => num(imp.value?.shippingFee));
const discountAmount = computed(() => num(imp.value?.discountAmount));
const vatRate = computed(() => num(imp.value?.vatRate));
const vatAmount = computed(() => num(imp.value?.vatAmount));
// Cần thanh toán: ưu tiên grandTotal (đơn POS mới), fallback totalAmount (draft cũ).
const grandTotal = computed(() =>
  num(imp.value?.grandTotal) > 0 ? num(imp.value?.grandTotal) : goodsValue.value,
);
const depositAmount = computed(() => num(imp.value?.depositAmount));
// Công nợ NCC còn lại: backend chỉ set debtAmount sau khi chốt; draft = 0.
const supplierDebt = computed(() => num(imp.value?.debtAmount));

// HSD sắp hết: <= 90 ngày. Đã hết hạn: quá hôm nay.
function expiryState(d) {
  if (!d) return null;
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: 'Hết hạn', cls: 'bg-rose-100 text-rose-700' };
  if (days <= 90) return { label: `Còn ${days}n`, cls: 'bg-amber-100 text-amber-700' };
  return null;
}

// Tiêu đề cảnh báo theo `type` backend trả về. Dùng map thay vì ternary —
// thêm loại cảnh báo mới mà quên sửa ternary là hiện sai nhãn.
const WARNING_TITLES = {
  cost_above_price: '⚠ Giá vốn cao hơn giá bán',
  price_jump: '⚠ Giá nhập tăng đột biến',
  cost_far_below_price: '⚠ Giá vốn thấp bất thường — nghi gõ thiếu số 0',
};
function warningTitle(type) {
  return WARNING_TITLES[type] || '⚠ Cảnh báo';
}

// ── Load ─────────────────────────────────────────────────────────────
async function load() {
  await loadDetail(id);
  // Cảnh báo chỉ có ý nghĩa khi còn nháp (admin còn sửa được) + chỉ admin xem.
  if (isDraft.value && isAdmin.value) {
    await loadWarnings(id);
  } else {
    warnings.value = [];
  }
}

onMounted(load);

// ── Xoá nháp ─────────────────────────────────────────────────────────
const showDelete = ref(false);
const deleting = ref(false);
const deleteError = ref('');

async function onDelete() {
  deleting.value = true;
  deleteError.value = '';
  try {
    await deleteDraft(id);
    showDelete.value = false;
    router.push('/imports');
  } catch (err) {
    deleteError.value = err.response?.data?.error || 'Không xoá được phiếu nháp';
  } finally {
    deleting.value = false;
  }
}

// ── Sửa thông tin phiếu ĐÃ CHỐT (owner/admin) ────────────────────────
// Chỉ field không đụng tiền/tồn: ngày nhập, số HĐ NCC, ghi chú + mã lô /
// NSX / HSD từng dòng. Backend gương thay đổi xuống lô trong kho và tính
// lại active/expired theo HSD mới.
const showEdit = ref(false);
const editError = ref('');
const editNotice = ref('');
const editForm = ref({ importDate: '', nccInvoiceNo: '', notes: '', items: [] });

// Cột @db.Date về client dạng '2029-02-01T00:00:00.000Z' → cắt 10 ký tự đầu
// là đúng ngày. KHÔNG dùng new Date().toISOString() (lệch ngày trước 7h VN).
function toDateInput(v) {
  return v ? String(v).slice(0, 10) : '';
}

function openEdit() {
  editError.value = '';
  editNotice.value = '';
  editForm.value = {
    importDate: toDateInput(imp.value?.importDate),
    nccInvoiceNo: imp.value?.nccInvoiceNo || '',
    notes: imp.value?.notes || '',
    items: (imp.value?.items || []).map((line) => ({
      id: line.id,
      name: line.product?.name || line.productId,
      sku: line.product?.sku || '',
      quantity: num(line.quantity),
      unit: line.product?.unit || '',
      batchCode: line.batchCode || '',
      manufactureDate: toDateInput(line.manufactureDate),
      expiryDate: toDateInput(line.expiryDate),
    })),
  };
  showEdit.value = true;
}

async function onSaveEdit() {
  editError.value = '';
  try {
    const res = await patchConfirmed(id, {
      // Ngày nhập rỗng = không đổi (backend giữ nguyên khi thiếu field).
      ...(editForm.value.importDate ? { importDate: editForm.value.importDate } : {}),
      nccInvoiceNo: editForm.value.nccInvoiceNo,
      notes: editForm.value.notes,
      items: editForm.value.items.map((it) => ({
        id: it.id,
        batchCode: it.batchCode,
        manufactureDate: it.manufactureDate || null,
        expiryDate: it.expiryDate || null,
      })),
    });
    showEdit.value = false;
    const changes = res?.batchStatusChanges || [];
    editNotice.value = changes.length
      ? 'Đã lưu. ' +
        changes
          .map((c) =>
            c.to === 'active'
              ? `Lô ${c.batchCode} còn hạn trở lại → tồn kho được tính lại.`
              : `Lô ${c.batchCode} chuyển sang hết hạn (${c.to}) → không còn tính vào tồn bán.`,
          )
          .join(' ')
      : 'Đã lưu thông tin phiếu.';
    await load();
  } catch (err) {
    editError.value = err.response?.data?.error || 'Không lưu được thay đổi';
  }
}

// ── Chốt phiếu (dialog 2 bước) ───────────────────────────────────────
// confirmStep: 0 = đóng · 1 = liệt kê cảnh báo · 2 = xác nhận cuối.
const confirmStep = ref(0);
const confirmError = ref('');

function openConfirm() {
  confirmError.value = '';
  confirmStep.value = 1;
}

async function doConfirm() {
  confirmError.value = '';
  try {
    const res = await confirmImport(id);
    confirmStep.value = 0;
    // Lô trùng mã + cùng HSD được GỘP vào lô đang có thay vì tạo lô mới —
    // nói rõ ra, không thì thủ kho tưởng hàng nhập bị trôi mất.
    const merged = res?.mergedBatchCodes || [];
    if (merged.length) {
      editNotice.value =
        `Đã chốt phiếu. ${merged.length} lô trùng mã + cùng HSD đã được CỘNG DỒN vào lô ` +
        `đang có trong kho (${merged.join(', ')}) — không tạo lô mới.`;
    }
    await load();
  } catch (err) {
    confirmError.value = err.response?.data?.error || 'Không chốt được phiếu nhập';
  }
}
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[860px] mx-auto">
    <!-- Back -->
    <button
      @click="router.push('/imports')"
      class="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary mb-3"
    >
      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      Phiếu nhập
    </button>

    <!-- Loading skeleton -->
    <div v-if="detailLoading" class="space-y-3">
      <div class="h-28 bg-white rounded-card border border-line-200 animate-pulse"></div>
      <div class="h-40 bg-white rounded-card border border-line-200 animate-pulse"></div>
      <div class="h-32 bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>

    <!-- Error state -->
    <div
      v-else-if="detailError"
      class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm"
    >
      {{ detailError }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <template v-else-if="imp">
      <!-- Thông báo sau khi sửa thông tin phiếu đã chốt -->
      <div
        v-if="editNotice"
        class="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-card px-4 py-3 text-sm mb-3 flex items-start justify-between gap-3"
      >
        <span>{{ editNotice }}</span>
        <button @click="editNotice = ''" class="text-emerald-700 hover:text-emerald-900 leading-none">✕</button>
      </div>

      <!-- Header card -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <div class="text-lg font-bold font-mono text-ink-primary">{{ imp.importCode }}</div>
            <div class="text-xs text-ink-secondary mt-0.5">
              Ngày nhập: {{ formatDateVN(imp.importDate) }}
              <span v-if="imp.confirmedAt"> · Chốt: {{ formatDateVN(imp.confirmedAt) }}</span>
            </div>
          </div>
          <span
            class="text-[11px] uppercase font-semibold px-2.5 py-1 rounded"
            :class="statusInfo.cls"
          >
            {{ statusInfo.label }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <div class="text-[11px] font-semibold text-ink-secondary uppercase mb-0.5">Nhà cung cấp</div>
            <div class="text-ink-primary">{{ imp.supplier?.name || '—' }}</div>
          </div>
          <div v-if="imp.warehouse?.name">
            <div class="text-[11px] font-semibold text-ink-secondary uppercase mb-0.5">Kho nhập</div>
            <div class="text-ink-primary">{{ imp.warehouse.name }}</div>
          </div>
          <div>
            <div class="text-[11px] font-semibold text-ink-secondary uppercase mb-0.5">Số HĐ NCC</div>
            <div class="text-ink-primary font-mono">{{ imp.nccInvoiceNo || '—' }}</div>
          </div>
        </div>

        <div v-if="imp.notes" class="mt-3 pt-3 border-t border-line-200">
          <div class="text-[11px] font-semibold text-ink-secondary uppercase mb-0.5">Ghi chú</div>
          <div class="text-sm text-ink-primary whitespace-pre-line">{{ imp.notes }}</div>
        </div>
      </div>

      <!-- Cảnh báo (chỉ khi còn nháp + admin) -->
      <div v-if="isDraft && isAdmin && warnings.length" class="space-y-2 mb-3">
        <div
          v-for="(w, i) in warnings"
          :key="(w.productId || '') + (w.type || '') + i"
          class="rounded-card border px-4 py-3 text-sm"
          :class="
            w.severity === 'high'
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          "
        >
          <span class="font-semibold">
            {{ warningTitle(w.type) }}
          </span>
          <span v-if="w.message"> — {{ w.message }}</span>
        </div>
      </div>

      <!-- Dòng hàng -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">
          Sản phẩm nhập ({{ imp.items?.length || 0 }})
        </div>
        <div class="overflow-x-auto -mx-1">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-[11px] uppercase text-ink-secondary border-b border-line-200">
                <th class="text-left font-semibold py-2 px-1">Sản phẩm</th>
                <th class="text-left font-semibold py-2 px-1">Mã lô</th>
                <th class="text-right font-semibold py-2 px-1">SL</th>
                <th v-if="isAdmin" class="text-right font-semibold py-2 px-1">Giá vốn</th>
                <th v-if="isAdmin" class="text-right font-semibold py-2 px-1">Thành tiền</th>
                <th class="text-left font-semibold py-2 px-1 whitespace-nowrap">HSD</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="line in imp.items"
                :key="line.id"
                class="border-b border-line-100 align-top"
              >
                <td class="py-2 px-1">
                  <div class="font-medium text-ink-primary leading-snug">
                    {{ line.product?.name || line.productId }}
                  </div>
                  <div class="text-[11px] font-mono text-ink-secondary">
                    {{ line.product?.sku || '' }}
                  </div>
                </td>
                <td class="py-2 px-1 font-mono text-ink-primary whitespace-nowrap">{{ line.batchCode }}</td>
                <td class="py-2 px-1 text-right font-mono text-ink-primary">
                  {{ num(line.quantity) }}<span class="text-ink-secondary"> {{ line.product?.unit || '' }}</span>
                </td>
                <td v-if="isAdmin" class="py-2 px-1 text-right font-mono text-ink-primary whitespace-nowrap">
                  {{ formatVND(line.unitCost) }}
                </td>
                <td v-if="isAdmin" class="py-2 px-1 text-right font-mono font-semibold text-royal-700 whitespace-nowrap">
                  {{ formatVND(line.lineTotal) }}
                </td>
                <td class="py-2 px-1 whitespace-nowrap">
                  <span class="text-ink-primary">{{ formatDateVN(line.expiryDate) }}</span>
                  <span
                    v-if="expiryState(line.expiryDate)"
                    class="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    :class="expiryState(line.expiryDate).cls"
                  >
                    {{ expiryState(line.expiryDate).label }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tổng tiền (chỉ admin) -->
      <div v-if="isAdmin" class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-ink-secondary">Giá trị hàng</span>
            <span class="text-ink-primary">{{ formatVND(goodsValue) }}</span>
          </div>
          <div v-if="discountAmount > 0" class="flex justify-between">
            <span class="text-ink-secondary">Chiết khấu</span>
            <span class="text-amber-600">− {{ formatVND(discountAmount) }}</span>
          </div>
          <div v-if="shippingFee > 0" class="flex justify-between">
            <span class="text-ink-secondary">Phí vận chuyển</span>
            <span class="text-ink-primary">{{ formatVND(shippingFee) }}</span>
          </div>
          <div v-if="vatAmount > 0" class="flex justify-between">
            <span class="text-ink-secondary">VAT{{ vatRate > 0 ? ` (${vatRate}%)` : '' }}</span>
            <span class="text-ink-primary">{{ formatVND(vatAmount) }}</span>
          </div>
          <div class="flex justify-between pt-2 border-t border-line-200">
            <span class="font-semibold text-ink-primary">Tổng cần thanh toán</span>
            <span class="font-bold text-royal-700 text-base">{{ formatVND(grandTotal) }}</span>
          </div>
          <div v-if="depositAmount > 0" class="flex justify-between">
            <span class="text-ink-secondary">Đã cọc</span>
            <span class="text-emerald-700 font-medium">{{ formatVND(depositAmount) }}</span>
          </div>
          <div v-if="supplierDebt > 0" class="flex justify-between">
            <span class="text-ink-secondary">Công nợ NCC còn lại</span>
            <span class="text-red-600 font-bold">{{ formatVND(supplierDebt) }}</span>
          </div>
        </div>
      </div>

      <!-- Các lô đã tạo (sau khi chốt) -->
      <div
        v-if="isConfirmed && imp.batches?.length"
        class="bg-white border border-line-200 rounded-card p-5 shadow-card mb-3"
      >
        <div class="text-xs font-semibold text-ink-secondary uppercase mb-3">
          Các lô đã tạo trong kho ({{ imp.batches.length }})
        </div>
        <div class="overflow-x-auto -mx-1">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-[11px] uppercase text-ink-secondary border-b border-line-200">
                <th class="text-left font-semibold py-2 px-1">Mã lô</th>
                <th class="text-right font-semibold py-2 px-1">Tồn hiện tại</th>
                <th class="text-left font-semibold py-2 px-1 whitespace-nowrap">HSD</th>
                <th class="text-left font-semibold py-2 px-1">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in imp.batches" :key="b.id" class="border-b border-line-100">
                <td class="py-2 px-1 font-mono text-ink-primary whitespace-nowrap">{{ b.batchCode }}</td>
                <td class="py-2 px-1 text-right font-mono text-ink-primary">{{ num(b.currentQuantity) }}</td>
                <td class="py-2 px-1 whitespace-nowrap">
                  <template v-if="b.expiryDate">
                    <span class="text-ink-primary">{{ formatDateVN(b.expiryDate) }}</span>
                    <span
                      v-if="expiryState(b.expiryDate)"
                      class="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      :class="expiryState(b.expiryDate).cls"
                    >
                      {{ expiryState(b.expiryDate).label }}
                    </span>
                  </template>
                  <span v-else class="text-ink-disabled">—</span>
                </td>
                <td class="py-2 px-1">
                  <span
                    class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
                    :class="b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'"
                  >
                    {{ b.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Hành động (chỉ khi còn nháp) -->
      <template v-if="isDraft">
        <button
          @click="openConfirm"
          class="w-full h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold shadow-pop flex items-center justify-center gap-2 mb-2"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          Chốt phiếu (cộng tồn kho)
        </button>
        <div class="flex gap-2">
          <button
            @click="router.push('/imports/' + id + '/edit')"
            class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-semibold hover:bg-surface-50 flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
            Sửa
          </button>
          <button
            @click="showDelete = true; deleteError = ''"
            class="flex-1 h-11 rounded-xl border border-rose-300 text-rose-600 font-semibold hover:bg-rose-50 flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Xoá nháp
          </button>
        </div>
      </template>

      <!-- Sửa thông tin phiếu đã chốt (chỉ owner/admin) -->
      <template v-if="isConfirmed && isAdmin">
        <button
          @click="openEdit"
          class="w-full h-11 rounded-xl border border-line-300 text-ink-primary font-semibold hover:bg-surface-50 flex items-center justify-center gap-2"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
          </svg>
          Sửa thông tin phiếu
        </button>
        <p class="text-[11px] text-ink-secondary text-center mt-1.5 leading-snug">
          Sửa được mã lô · NSX · HSD · số HĐ NCC · ghi chú · ngày nhập.
          Số lượng và giá vốn đã chốt thì không sửa được.
        </p>
      </template>
    </template>

    <!-- Dialog sửa thông tin phiếu đã chốt -->
    <div v-if="showEdit" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[88vh] flex flex-col">
        <div class="flex items-center justify-between p-5 pb-3 border-b border-line-200">
          <div>
            <h3 class="text-lg font-bold text-ink-primary">Sửa thông tin phiếu</h3>
            <div class="text-xs text-ink-secondary font-mono">{{ imp?.importCode }}</div>
          </div>
          <button @click="showEdit = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>

        <div class="p-5 overflow-y-auto space-y-4">
          <div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs leading-snug">
            Phiếu đã cộng tồn kho. Ở đây chỉ sửa <span class="font-semibold">thông tin</span> —
            số lượng và giá vốn giữ nguyên. Đổi HSD sẽ tự cập nhật lô trong kho:
            HSD còn hạn thì lô được bán lại, HSD đã qua thì lô ngừng bán.
          </div>

          <!-- Header -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Ngày nhập</div>
              <input
                v-model="editForm.importDate"
                type="date"
                :min="DATE_MIN"
                :max="DATE_MAX"
                class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary"
              />
            </div>
            <div>
              <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Số HĐ NCC</div>
              <input
                v-model="editForm.nccInvoiceNo"
                type="text"
                placeholder="Để trống nếu chưa có"
                class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary"
              />
            </div>
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Ghi chú</div>
            <textarea
              v-model="editForm.notes"
              rows="2"
              class="w-full px-3 py-2 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary"
            ></textarea>
          </div>

          <!-- Từng dòng hàng -->
          <div class="space-y-3">
            <div class="text-[11px] font-semibold text-ink-secondary uppercase">
              Lô hàng ({{ editForm.items.length }})
            </div>
            <div
              v-for="line in editForm.items"
              :key="line.id"
              class="border border-line-200 rounded-xl p-3"
            >
              <div class="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div class="text-sm font-medium text-ink-primary leading-snug">{{ line.name }}</div>
                  <div class="text-[11px] font-mono text-ink-secondary">{{ line.sku }}</div>
                </div>
                <div class="text-xs text-ink-secondary whitespace-nowrap font-mono">
                  {{ line.quantity }} {{ line.unit }}
                </div>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Mã lô</div>
                  <input
                    v-model="line.batchCode"
                    type="text"
                    class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary font-mono"
                  />
                </div>
                <div>
                  <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">Ngày sản xuất</div>
                  <input
                    v-model="line.manufactureDate"
                    type="date"
                    :min="DATE_MIN"
                    :max="DATE_MAX"
                    class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary"
                  />
                </div>
                <div>
                  <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1">HSD</div>
                  <input
                    v-model="line.expiryDate"
                    type="date"
                    :min="DATE_MIN"
                    :max="DATE_MAX"
                    class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none bg-white text-sm text-ink-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-if="editError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ editError }}
          </div>
        </div>

        <div class="flex gap-2 p-5 pt-3 border-t border-line-200">
          <button
            type="button"
            @click="showEdit = false"
            :disabled="saving"
            class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50"
          >
            Quay lại
          </button>
          <button
            type="button"
            @click="onSaveEdit"
            :disabled="saving"
            class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50"
          >
            {{ saving ? 'Đang lưu...' : 'Lưu thay đổi' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Dialog xoá nháp -->
    <div v-if="showDelete" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Xoá phiếu nháp</h3>
          <button @click="showDelete = false" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>
        <p class="text-sm text-ink-secondary mb-3">
          Phiếu <span class="font-mono font-semibold">{{ imp?.importCode }}</span> sẽ bị
          <span class="font-semibold text-rose-600">xoá vĩnh viễn</span>. Chưa cộng tồn kho nên an toàn, nhưng không khôi phục được.
        </p>
        <div v-if="deleteError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {{ deleteError }}
        </div>
        <div class="flex gap-2 pt-1">
          <button type="button" @click="showDelete = false" :disabled="deleting" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
            Quay lại
          </button>
          <button type="button" @click="onDelete" :disabled="deleting" class="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50">
            {{ deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Dialog chốt phiếu (2 bước) -->
    <div v-if="confirmStep > 0" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-ink-primary">Chốt phiếu nhập</h3>
          <button @click="confirmStep = 0" class="text-ink-disabled hover:text-ink-primary text-xl leading-none">✕</button>
        </div>

        <!-- Bước 1: điểm lại cảnh báo + hệ quả -->
        <template v-if="confirmStep === 1">
          <p class="text-sm text-ink-secondary mb-3">
            Chốt phiếu <span class="font-mono font-semibold">{{ imp?.importCode }}</span> sẽ
            <span class="font-semibold text-ink-primary">cộng tồn kho thật</span> theo từng lô. Việc này
            <span class="font-semibold text-rose-600">không hoàn tác dễ</span>.
          </p>

          <div v-if="warnings.length" class="space-y-2 mb-3">
            <div class="text-[11px] font-semibold text-ink-secondary uppercase">Cảnh báo cần lưu ý</div>
            <div
              v-for="(w, i) in warnings"
              :key="'c' + (w.productId || '') + (w.type || '') + i"
              class="rounded-lg border px-3 py-2 text-sm"
              :class="
                w.severity === 'high'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              "
            >
              <span class="font-semibold">
                {{ warningTitle(w.type) }}
              </span>
              <span v-if="w.message"> — {{ w.message }}</span>
            </div>
          </div>

          <div class="flex gap-2 pt-1">
            <button type="button" @click="confirmStep = 0" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
              Quay lại
            </button>
            <button type="button" @click="confirmStep = 2" class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold">
              Tiếp tục
            </button>
          </div>
        </template>

        <!-- Bước 2: xác nhận cuối -->
        <template v-else>
          <p class="text-sm text-ink-secondary mb-3">
            Xác nhận lần cuối: cộng
            <span class="font-semibold text-ink-primary">{{ num(imp?.totalQuantity) }}</span>
            đơn vị vào kho từ phiếu <span class="font-mono font-semibold">{{ imp?.importCode }}</span>?
          </p>
          <div v-if="confirmError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {{ confirmError }}
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="confirmStep = 1" :disabled="confirming" class="flex-1 h-11 rounded-xl border border-line-300 text-ink-primary font-medium hover:bg-surface-50">
              Quay lại
            </button>
            <button type="button" @click="doConfirm" :disabled="confirming" class="flex-1 h-11 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50">
              {{ confirming ? 'Đang chốt...' : 'Chốt phiếu' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
