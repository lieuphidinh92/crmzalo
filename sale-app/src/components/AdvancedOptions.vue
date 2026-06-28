<script setup>
import { ref } from 'vue';
import { usePOSStore } from '../stores/pos';

const pos = usePOSStore();

// Khối "Tùy chọn nâng cao" gập/mở — mặc định gập để màn chính gọn.
const open = ref(false);

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm';
const labelCls = 'text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5';
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
                <input
                  v-model="pos.invoiceTaxCode"
                  type="text"
                  inputmode="numeric"
                  :placeholder="pos.invoiceBuyerType === 'ca_nhan' ? 'Số căn cước' : 'MST'"
                  :class="inputCls"
                />
              </div>
              <div>
                <div :class="labelCls">Email nhận HĐ</div>
                <input v-model="pos.invoiceEmail" type="email" inputmode="email" placeholder="email@..." :class="inputCls" />
              </div>
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
