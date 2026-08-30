<script setup>
/**
 * NewCustomerDialog — tạo khách hàng mới (dùng ở màn POS và màn Khách hàng).
 *
 * Anh Philip chốt 25/8/2026: khai luôn hồ sơ hoá đơn ngay lúc tạo khách, lấy từ
 * **mã số thuế** (nút Tra cứu → dữ liệu Cục Thuế) thay vì gõ tay. Lần sau khách
 * xin hoá đơn là form VAT tự điền sẵn, khỏi gõ lại và khỏi sai chính tả.
 *
 * Bộ trường: Họ tên người mua · SĐT · MST · Tên đơn vị · Địa chỉ (hoá đơn)
 * · Địa chỉ nhận hàng (mặc định trùng địa chỉ hoá đơn) · Bảng giá · Hạn mức công
 * nợ · Sale phụ trách.
 * Bỏ ô Tỉnh/TP: backend tự tách tỉnh từ địa chỉ để báo cáo theo tỉnh vẫn chạy.
 */
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { useTaxLookup, isLookupableTaxCode } from '../composables/useTaxLookup';

const emit = defineEmits(['close', 'created']);

// 44px trên điện thoại (chuẩn ngón tay), desktop giữ 40px như cũ — form này mở
// từ cả màn Khách hàng và màn Tạo đơn, sale hay nhập KH mới ngay tại quầy (27/8/2026).
const inputCls =
  'w-full h-11 lg:h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-base lg:text-sm';
const labelCls = 'block text-xs font-medium text-ink-primary mb-1';

const auth = useAuthStore();
const isManager = computed(() => ['owner', 'admin'].includes(auth.user?.role));
const myName = computed(() => auth.user?.fullName || auth.user?.full_name || 'tôi');

const form = ref({
  fullName: '',
  phone: '',
  invoiceTaxCode: '',
  storeName: '',
  invoiceAddress: '',
  address: '',
  policyTier: 'thung_1',
  creditLimitText: '0',
  creditTermDays: 0,
  assignedUserId: null,
});
// Địa chỉ nhận hàng mặc định TRÙNG địa chỉ trên hoá đơn — nhà thuốc/hộ kinh doanh
// gần như luôn nhận hàng tại địa chỉ đăng ký. Bỏ tick mới hiện ô riêng.
const sameShippingAddress = ref(true);

const loading = ref(false);
const errorMsg = ref('');

// ── Danh sách nhân viên (chỉ chủ/quản lý mới được chọn người khác) ─────────
const staffList = ref([]);
onMounted(async () => {
  if (!isManager.value) return;
  try {
    const { data } = await api.get('/sale-app/staff');
    staffList.value = data.staff || [];
  } catch {
    staffList.value = [];
  }
});

// ── Tra cứu MST → tự điền Tên đơn vị + Địa chỉ ────────────────────────────
const {
  looking,
  lookupError,
  lookupResult,
  undoSnapshot,
  lookup: runTaxLookup,
  undo: undoTaxLookup,
} = useTaxLookup();

const canLookupTax = computed(() => isLookupableTaxCode(form.value.invoiceTaxCode));

function setTaxFields({ name, address }, { skipEmpty = false } = {}) {
  if (!skipEmpty || name) form.value.storeName = name;
  if (!skipEmpty || address) form.value.invoiceAddress = address;
}
const taxSnapshot = () => ({ name: form.value.storeName, address: form.value.invoiceAddress });

async function doTaxLookup() {
  if (looking.value) return;
  const found = await runTaxLookup(
    form.value.invoiceTaxCode,
    (v) => setTaxFields(v, { skipEmpty: true }),
    taxSnapshot,
  );
  if (found) infoUnlocked.value = false;
}
function undoTaxFill() {
  undoTaxLookup((v) => setTaxFields(v));
}

// ── Khoá Tên đơn vị + Địa chỉ, muốn sửa phải bấm "Sửa" ────────────────────
// Cùng luật với form Yêu cầu xuất VAT: 2 trường này đi thẳng lên hoá đơn, gõ
// trượt 1 chữ là hoá đơn sai. Không khoá khi cả 2 còn rỗng (chưa có gì để giữ).
const infoUnlocked = ref(false);
const canToggleInfoLock = computed(
  () => !!(form.value.storeName || form.value.invoiceAddress),
);
const infoLocked = computed(() => canToggleInfoLock.value && !infoUnlocked.value);
function toggleInfoLock() {
  infoUnlocked.value = !infoUnlocked.value;
}

// ── Ô TIỀN: type="text" + tự chấm nghìn ───────────────────────────────────
// KHÔNG dùng type="number": gõ "50.000.000" kiểu Việt Nam bị hiểu thành 50
// (chia 1 triệu) → hạn mức công nợ sai bét. Bài học từ phiếu nhập.
const creditLimitValue = computed(
  () => Number(String(form.value.creditLimitText).replace(/[^\d]/g, '')) || 0,
);
function formatCreditLimit() {
  const n = creditLimitValue.value;
  form.value.creditLimitText = n.toLocaleString('vi-VN');
}

async function submit() {
  errorMsg.value = '';
  if (!form.value.fullName.trim()) {
    errorMsg.value = 'Chưa nhập họ tên người mua hàng.';
    return;
  }
  if (!form.value.phone.trim()) {
    errorMsg.value = 'Chưa nhập số điện thoại.';
    return;
  }
  const taxCode = form.value.invoiceTaxCode.trim();
  if (taxCode && !isLookupableTaxCode(taxCode)) {
    errorMsg.value = 'Mã số thuế phải là 10 số (hoặc 13 số dạng 1234567890-001).';
    return;
  }

  loading.value = true;
  try {
    const invoiceAddress = form.value.invoiceAddress.trim();
    const { data } = await api.post('/sale-app/customers', {
      fullName: form.value.fullName.trim(),
      phone: form.value.phone.trim(),
      invoiceTaxCode: taxCode || null,
      // Tên đơn vị dùng cho cả tên cửa hàng lẫn tên trên hoá đơn — backend tự tách.
      storeName: form.value.storeName.trim() || null,
      invoiceAddress: invoiceAddress || null,
      address: sameShippingAddress.value ? invoiceAddress : form.value.address.trim() || null,
      policyTier: form.value.policyTier,
      creditLimit: isManager.value ? creditLimitValue.value : 0,
      creditTermDays: isManager.value ? Math.max(0, Math.trunc(Number(form.value.creditTermDays) || 0)) : 0,
      assignedUserId: isManager.value ? form.value.assignedUserId || null : null,
    });
    emit('created', data.customer);
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Lỗi tạo KH';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <h3 class="text-lg font-bold text-ink-primary">Tạo khách hàng mới</h3>
        <button
          @click="emit('close')"
          aria-label="Đóng"
          class="w-11 h-11 lg:w-auto lg:h-auto -mr-2 lg:mr-0 flex items-center justify-center text-ink-disabled hover:text-ink-primary text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <form @submit.prevent="submit" class="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
        <div>
          <label :class="labelCls">Họ tên người mua hàng *</label>
          <input v-model="form.fullName" :class="inputCls" placeholder="Tên người đứng ra mua" />
        </div>

        <div>
          <label :class="labelCls">Số điện thoại *</label>
          <input v-model="form.phone" type="tel" inputmode="tel" :class="inputCls" />
        </div>

        <!-- MST + tra cứu: điền hộ Tên đơn vị và Địa chỉ -->
        <div>
          <label :class="labelCls">Mã số thuế</label>
          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <input
                v-model="form.invoiceTaxCode"
                type="text"
                inputmode="numeric"
                placeholder="0101248141"
                :class="inputCls"
                @keydown.enter.prevent="doTaxLookup"
              />
            </div>
            <button
              type="button"
              @click="doTaxLookup"
              :disabled="looking || !canLookupTax"
              class="h-11 lg:h-10 px-3 shrink-0 rounded-lg border border-royal-700 text-royal-700 text-[13px] font-semibold hover:bg-royal-50 active:bg-royal-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Tra cứu tên đơn vị + địa chỉ theo mã số thuế (dữ liệu Cục Thuế)"
            >
              <svg
                class="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
              <span>{{ looking ? 'Đang tra...' : 'Tra cứu' }}</span>
            </button>
          </div>

          <p v-if="lookupError" class="mt-1.5 text-[11px] text-red-600">{{ lookupError }}</p>
          <template v-else-if="lookupResult">
            <p class="mt-1.5 text-[11px] text-ink-secondary">
              Đã điền tên đơn vị + địa chỉ từ dữ liệu Cục
              Thuế{{ lookupResult.stale ? ' (bản lưu cũ)' : '' }}.
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
          <p v-else class="mt-1.5 text-[11px] text-ink-secondary">
            Khách không lấy hoá đơn thì để trống ô này.
          </p>
        </div>

        <div>
          <div class="flex items-baseline justify-between gap-2">
            <label :class="labelCls">Tên đơn vị (trên hoá đơn)</label>
            <button
              v-if="canToggleInfoLock"
              type="button"
              @click="toggleInfoLock"
              class="mb-1 text-[11px] font-semibold text-royal-700 hover:underline shrink-0"
            >
              {{ infoLocked ? '✏️ Sửa' : '🔒 Khoá lại' }}
            </button>
          </div>
          <input
            v-model="form.storeName"
            :readonly="infoLocked"
            placeholder="Tra MST hoặc gõ tay"
            :class="[inputCls, infoLocked ? 'bg-surface-soft text-ink-secondary cursor-default' : '']"
          />
        </div>

        <div>
          <div class="flex items-baseline justify-between gap-2">
            <label :class="labelCls">Địa chỉ (trên hoá đơn)</label>
            <button
              v-if="canToggleInfoLock"
              type="button"
              @click="toggleInfoLock"
              class="mb-1 text-[11px] font-semibold text-royal-700 hover:underline shrink-0"
            >
              {{ infoLocked ? '✏️ Sửa' : '🔒 Khoá lại' }}
            </button>
          </div>
          <input
            v-model="form.invoiceAddress"
            :readonly="infoLocked"
            placeholder="Tra MST hoặc gõ tay"
            :class="[inputCls, infoLocked ? 'bg-surface-soft text-ink-secondary cursor-default' : '']"
          />
        </div>

        <!-- Vùng bấm của ô tick là cả <label> → cho nhãn cao 44px trên điện thoại -->
        <label class="flex items-center gap-2 min-h-11 lg:min-h-0 py-1 lg:py-0 text-[13px] text-ink-primary cursor-pointer">
          <input
            v-model="sameShippingAddress"
            type="checkbox"
            class="w-5 h-5 lg:w-4 lg:h-4 accent-royal-700 shrink-0"
          />
          Địa chỉ nhận hàng trùng địa chỉ trên hoá đơn
        </label>

        <div v-if="!sameShippingAddress">
          <label :class="labelCls">Địa chỉ nhận hàng</label>
          <input
            v-model="form.address"
            :class="inputCls"
            placeholder="Kho / nhà thuốc nhận hàng nếu khác địa chỉ hoá đơn"
          />
        </div>

        <div>
          <label :class="labelCls">Bảng giá</label>
          <select v-model="form.policyTier" :class="[inputCls, 'bg-white']">
            <option value="thung_10">10 thùng</option>
            <option value="thung_5">5 thùng</option>
            <option value="thung_1">1 thùng</option>
            <option value="le">&lt;1 thùng</option>
          </select>
        </div>

        <div v-if="isManager">
          <label :class="labelCls">Hạn mức công nợ (đ)</label>
          <input
            v-model="form.creditLimitText"
            @blur="formatCreditLimit"
            type="text"
            inputmode="numeric"
            placeholder="0 = không cho nợ"
            :class="inputCls"
          />
        </div>

        <div v-if="isManager">
          <label :class="labelCls">Số ngày công nợ tối đa</label>
          <input v-model.number="form.creditTermDays" type="number" min="0" step="1" :class="inputCls" />
          <p class="mt-1 text-[11px] text-ink-secondary">0 ngày = không cho nợ. Chỉ mở cho khách được ưu tiên.</p>
        </div>

        <div>
          <label :class="labelCls">Sale phụ trách</label>
          <select v-if="isManager" v-model="form.assignedUserId" :class="[inputCls, 'bg-white']">
            <option :value="null">{{ myName }} (tôi)</option>
            <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.fullName }}</option>
          </select>
          <input
            v-else
            :value="myName"
            readonly
            :class="[inputCls, 'bg-surface-soft text-ink-secondary cursor-default']"
          />
        </div>

        <div
          v-if="errorMsg"
          class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          {{ errorMsg }}
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            @click="emit('close')"
            class="flex-1 h-11 rounded-lg border border-line-300 font-semibold text-ink-primary"
          >
            Huỷ
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="flex-1 h-11 rounded-lg bg-royal-700 text-white font-semibold disabled:opacity-50"
          >
            {{ loading ? 'Đang tạo...' : 'Tạo' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
