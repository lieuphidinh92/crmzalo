<script setup>
import { ref, computed } from 'vue';
import { usePOSStore } from '../stores/pos';
import { useTaxLookup, isLookupableTaxCode } from '../composables/useTaxLookup';

const pos = usePOSStore();

// Khối "Tùy chọn nâng cao" gập/mở — mặc định gập để màn chính gọn.
const open = ref(false);

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm';
const labelCls = 'text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5';

// ── Tra cứu MST → tự điền tên đơn vị + địa chỉ xuất hoá đơn ───────────────
// Cùng backend `/tax-lookup` với ô "Yêu cầu xuất VAT" ở màn Đơn hàng. Lấy đúng
// tên/địa chỉ ngay lúc lên đơn thì lúc xin hoá đơn khỏi phải sửa lại.
const isPersonalBuyer = computed(() => pos.invoiceBuyerType === 'ca_nhan');
const {
  looking,
  lookupError,
  lookupResult,
  undoSnapshot,
  lookup: runTaxLookup,
  undo: undoTaxLookup,
} = useTaxLookup();

const canLookupTax = computed(() => isLookupableTaxCode(pos.invoiceTaxCode));

function setTaxFields({ name, address }, { skipEmpty = false } = {}) {
  if (!skipEmpty || name) pos.invoiceBuyerName = name;
  if (!skipEmpty || address) pos.invoiceAddress = address;
}
const taxSnapshot = () => ({ name: pos.invoiceBuyerName, address: pos.invoiceAddress });

function doTaxLookup() {
  if (looking.value) return;
  runTaxLookup(pos.invoiceTaxCode, (v) => setTaxFields(v, { skipEmpty: true }), taxSnapshot);
}
function undoTaxFill() {
  undoTaxLookup((v) => setTaxFields(v));
}
</script>

<template>
  <div class="bg-white border border-line-200 rounded-xl">
    <!-- Header bấm được — toggle gập/mở -->
    <button
      type="button"
      @click="open = !open"
      class="w-full flex items-center justify-between px-3 py-3 text-left"
    >
      <span class="text-sm font-semibold text-ink-primary">Tùy chọn nâng cao</span>
      <svg
        class="w-4 h-4 text-ink-secondary transition-transform"
        :class="open ? 'rotate-180' : ''"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <div v-if="open" class="px-3 pb-3 space-y-3 border-t border-line-200 pt-3">
      <!-- Công nợ — chỉ hiện khi đơn công nợ -->
      <div v-if="pos.isCredit" class="grid grid-cols-2 gap-2">
        <div>
          <div :class="labelCls">Cho nợ (số ngày)</div>
          <input v-model.number="pos.debtTermDays" type="number" min="1" inputmode="numeric" placeholder="VD: 10" :class="inputCls" />
        </div>
        <div>
          <div :class="labelCls">Trả trước (nếu có)</div>
          <input v-model.number="pos.paidAmount" type="number" min="0" step="1000" inputmode="numeric" placeholder="0" :class="inputCls" />
        </div>
      </div>

      <!-- ===== 2 KHỐI CHÍNH: Giao hàng | Xuất VAT ===== -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- 🚚 THÔNG TIN GIAO HÀNG -->
        <div class="border border-line-200 rounded-lg p-3 bg-surface-soft/40">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-base leading-none">🚚</span>
            <span class="text-sm font-semibold text-ink-primary">Thông tin giao hàng</span>
          </div>
          <div class="text-[11px] text-ink-secondary mb-3">
            Để trống nếu giao đúng theo khách hàng đã chọn.
          </div>

          <div class="grid grid-cols-2 gap-2 mb-2">
            <div>
              <div :class="labelCls">Tên người nhận</div>
              <input
                v-model="pos.recipientName"
                type="text"
                :placeholder="pos.selectedCustomer?.fullName || 'Theo khách hàng'"
                :class="inputCls"
              />
            </div>
            <div>
              <div :class="labelCls">SĐT người nhận</div>
              <input
                v-model="pos.recipientPhone"
                type="tel"
                inputmode="tel"
                :placeholder="pos.selectedCustomer?.phone || 'Theo khách hàng'"
                :class="inputCls"
              />
            </div>
          </div>

          <div class="mb-2">
            <div :class="labelCls">Địa chỉ giao</div>
            <textarea
              v-model="pos.deliveryAddress"
              rows="2"
              placeholder="Địa chỉ giao hàng..."
              class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
            />
          </div>

          <div>
            <div :class="labelCls">Phí ship (nếu có)</div>
            <input v-model.number="pos.shippingFee" type="number" min="0" step="1000" inputmode="numeric" placeholder="0" :class="inputCls" />
          </div>
        </div>

        <!-- 🧾 THÔNG TIN XUẤT VAT -->
        <div class="border border-line-200 rounded-lg p-3 bg-surface-soft/40">
          <label class="flex items-center justify-between cursor-pointer">
            <span class="flex items-center gap-2">
              <span class="text-base leading-none">🧾</span>
              <span class="text-sm font-semibold text-ink-primary">Thông tin xuất VAT</span>
            </span>
            <input
              type="checkbox"
              v-model="pos.needsVatInvoice"
              class="h-5 w-5 rounded border-line-300 text-royal-700 focus:ring-royal-100"
            />
          </label>

          <div v-if="!pos.needsVatInvoice" class="text-[11px] text-ink-secondary mt-2">
            Bật công tắc để nhập thông tin xuất hóa đơn VAT.
          </div>

          <div v-else class="mt-3 space-y-3">
            <div>
              <div :class="labelCls">Người mua</div>
              <div class="grid grid-cols-3 gap-2">
                <label
                  v-for="opt in [
                    { v: 'ca_nhan', l: 'Cá nhân' },
                    { v: 'ho_kinh_doanh', l: 'Hộ KD' },
                    { v: 'cong_ty', l: 'Công ty' },
                  ]"
                  :key="opt.v"
                  class="flex items-center justify-center text-xs font-medium px-2 py-2 rounded-lg border cursor-pointer transition"
                  :class="
                    pos.invoiceBuyerType === opt.v
                      ? 'bg-royal-50 text-royal-700 border-royal-700'
                      : 'bg-white text-ink-primary border-line-300'
                  "
                >
                  <input type="radio" :value="opt.v" v-model="pos.invoiceBuyerType" class="sr-only" />
                  {{ opt.l }}
                </label>
              </div>
            </div>

            <div>
              <div :class="labelCls">
                {{ pos.invoiceBuyerType === 'ca_nhan' ? 'Họ tên người mua' : 'Tên đơn vị (trên hóa đơn)' }}
              </div>
              <input v-model="pos.invoiceBuyerName" type="text" placeholder="Tên xuất hóa đơn..." :class="inputCls" />
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <div :class="labelCls">
                  {{ pos.invoiceBuyerType === 'ca_nhan' ? 'Số CCCD' : 'Mã số thuế' }}
                </div>
                <div class="flex gap-1.5">
                  <div class="flex-1 min-w-0">
                    <input
                      v-model="pos.invoiceTaxCode"
                      type="text"
                      inputmode="numeric"
                      :placeholder="pos.invoiceBuyerType === 'ca_nhan' ? 'Số căn cước' : 'MST'"
                      :class="inputCls"
                      @keydown.enter.prevent="!isPersonalBuyer && doTaxLookup()"
                    />
                  </div>
                  <button
                    v-if="!isPersonalBuyer"
                    type="button"
                    @click="doTaxLookup"
                    :disabled="looking || !canLookupTax"
                    class="w-10 h-10 shrink-0 rounded-lg border border-royal-700 text-royal-700 hover:bg-royal-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                    title="Tra cứu tên + địa chỉ theo mã số thuế (dữ liệu Cục Thuế)"
                  >
                    <svg
                      v-if="!looking"
                      class="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
                    </svg>
                    <span v-else class="text-[10px] font-semibold">...</span>
                  </button>
                </div>
              </div>
              <div>
                <div :class="labelCls">Email nhận HĐ</div>
                <input v-model="pos.invoiceEmail" type="email" inputmode="email" placeholder="email@..." :class="inputCls" />
              </div>
            </div>

            <div v-if="!isPersonalBuyer && (lookupError || lookupResult)">
              <p v-if="lookupError" class="text-[11px] text-red-600">{{ lookupError }}</p>
              <template v-else>
                <p class="text-[11px] text-ink-secondary">
                  Đã điền tên + địa chỉ từ dữ liệu Cục Thuế{{ lookupResult.stale ? ' (bản lưu cũ)' : '' }}.
                  Kiểm lại giúp em.
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
            </div>

            <div>
              <div :class="labelCls">Địa chỉ xuất hóa đơn</div>
              <textarea
                v-model="pos.invoiceAddress"
                rows="2"
                placeholder="Địa chỉ trên hóa đơn..."
                class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
              />
            </div>

            <label class="flex items-center gap-2 text-[13px] text-ink-primary cursor-pointer">
              <input
                type="checkbox"
                v-model="pos.saveInvoiceToCustomer"
                class="h-4 w-4 rounded border-line-300 text-royal-700 focus:ring-royal-100"
              />
              Lưu làm thông tin hóa đơn mặc định cho khách này
            </label>
          </div>
        </div>
      </div>

      <!-- Người giới thiệu (Nhân viên sale đã đưa lên đầu cột Giỏ hàng) -->
      <div>
        <div :class="labelCls">Người giới thiệu</div>
        <input v-model="pos.referrerName" type="text" placeholder="Tên người giới thiệu (nếu có)" :class="inputCls" />
      </div>
    </div>
  </div>
</template>
