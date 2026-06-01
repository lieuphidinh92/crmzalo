<script setup>
import { ref, computed } from 'vue';
import { usePOSStore } from '../stores/pos';
import { formatVND } from '../composables/useFormat';

const pos = usePOSStore();

// Ghi chú đơn — tối giản: chỉ hiện textarea khi user bấm thêm
// (mở sẵn nếu đã có nội dung, ví dụ khi đặt lại đơn cũ).
const showNote = ref(!!pos.note);
function toggleNote() {
  showNote.value = !showNote.value;
}

// Thành tiền 1 dòng = đơn giá × số lượng − chiết khấu (kẹp >= 0).
function lineTotal(it) {
  const gross = (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0);
  return Math.max(0, gross - (Number(it.discountValue) || 0));
}

// ── Stepper số lượng (min 1) ──
function dec(it) {
  if (it.quantity > 1) pos.updateQuantity(it.productId, it.quantity - 1);
}
function inc(it) {
  pos.updateQuantity(it.productId, it.quantity + 1);
}
function onQtyInput(it, e) {
  const val = parseInt(e.target.value);
  if (!isNaN(val) && val >= 1) pos.updateQuantity(it.productId, val);
}

// ── Đơn giá thương lượng (integer VND >= 0) ──
function onPriceInput(it, e) {
  const val = parseInt(e.target.value);
  pos.updateUnitPrice(it.productId, isNaN(val) || val < 0 ? 0 : val);
}

// ── Chiết khấu dòng (integer VND >= 0) ──
function onDiscountInput(it, e) {
  const val = parseInt(e.target.value);
  pos.updateDiscount(it.productId, isNaN(val) || val < 0 ? 0 : val);
}

// ── Cảnh báo tồn (mềm, mỗi dòng) ──
function isOutOfStock(it) {
  return it.stock === 0;
}
function isOverStock(it) {
  return it.stock !== undefined && it.stock > 0 && it.quantity > it.stock;
}

const itemCount = computed(() => pos.items.length);
</script>

<template>
  <div class="bg-white border border-line-200 rounded-xl flex flex-col">
    <!-- Header thẻ -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-line-200">
      <h2 class="text-sm font-semibold text-ink-primary">
        Giỏ hàng ({{ itemCount }} sản phẩm)
      </h2>
      <button
        v-if="itemCount > 0"
        @click="pos.clearAll()"
        class="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors"
      >
        Xóa tất cả
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="itemCount === 0"
      class="flex flex-col items-center justify-center text-center px-6 py-16 text-ink-secondary"
    >
      <svg class="w-12 h-12 mb-3 text-ink-disabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"/>
      </svg>
      <p class="text-sm">Chưa có sản phẩm.</p>
      <p class="text-xs mt-0.5">Tìm và thêm SP từ cột bên phải.</p>
    </div>

    <!-- Bảng giỏ hàng -->
    <template v-else>
      <div class="flex-1 overflow-y-auto">
        <table class="w-full text-left">
          <thead class="sticky top-0 bg-surface-50 z-10">
            <tr class="text-[11px] uppercase tracking-wide text-ink-secondary border-b border-line-200">
              <th class="font-medium px-4 py-2">Sản phẩm</th>
              <th class="font-medium px-2 py-2 text-center w-[120px]">SL</th>
              <th class="font-medium px-2 py-2 text-right w-[140px]">Đơn giá</th>
              <th class="font-medium px-2 py-2 text-right w-[120px]">Thành tiền</th>
              <th class="font-medium px-2 py-2 w-[44px]"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="it in pos.items"
              :key="it.productId"
              class="border-b border-line-200 last:border-0 hover:bg-surface-50/60 align-top"
            >
              <!-- Sản phẩm -->
              <td class="px-4 py-3">
                <div class="flex items-start gap-2">
                  <img
                    v-if="it.image"
                    :src="it.image"
                    :alt="it.name"
                    class="w-10 h-10 rounded-lg object-cover border border-line-200 shrink-0"
                  />
                  <div class="min-w-0">
                    <div class="font-mono text-[10px] text-ink-secondary">{{ it.sku }}</div>
                    <div class="text-sm text-ink-primary leading-snug">{{ it.name }}</div>
                    <div v-if="it.stock !== undefined" class="text-[11px] text-ink-secondary mt-0.5">
                      Tồn: {{ it.stock }}<template v-if="it.unit"> {{ it.unit }}</template>
                    </div>
                    <!-- Cảnh báo mềm -->
                    <div
                      v-if="isOutOfStock(it) || isOverStock(it)"
                      class="mt-1 flex flex-wrap gap-1"
                    >
                      <span
                        v-if="isOutOfStock(it)"
                        class="text-[10px] font-medium text-red-700 bg-red-50 rounded px-1.5 py-0.5"
                      >
                        Hết hàng
                      </span>
                      <span
                        v-else-if="isOverStock(it)"
                        class="text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5"
                      >
                        Vượt tồn (còn {{ it.stock }})
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- SL: stepper -->
              <td class="px-2 py-3">
                <div class="flex items-center justify-center">
                  <div class="inline-flex items-center bg-surface-50 border border-line-300 rounded-lg">
                    <button
                      @click="dec(it)"
                      :disabled="it.quantity <= 1"
                      class="w-7 h-8 text-ink-primary font-bold hover:bg-line-200 rounded-l-lg disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Giảm"
                    >−</button>
                    <input
                      :value="it.quantity"
                      @input="onQtyInput(it, $event)"
                      type="number"
                      min="1"
                      class="w-9 h-8 text-center bg-transparent outline-none text-sm font-semibold text-ink-primary"
                    />
                    <button
                      @click="inc(it)"
                      class="w-7 h-8 text-ink-primary font-bold hover:bg-line-200 rounded-r-lg"
                      aria-label="Tăng"
                    >+</button>
                  </div>
                </div>
              </td>

              <!-- Đơn giá: input sửa được + ô CK nhỏ -->
              <td class="px-2 py-3">
                <input
                  :value="it.unitPrice"
                  @input="onPriceInput(it, $event)"
                  type="number"
                  min="0"
                  step="1000"
                  inputmode="numeric"
                  class="w-full h-8 px-2 rounded-lg border border-line-300 focus:border-royal-700 focus:ring-1 focus:ring-royal-100 outline-none text-sm text-right text-ink-primary"
                />
                <div class="flex items-center justify-end gap-1 mt-1">
                  <span class="text-[10px] text-ink-secondary">CK</span>
                  <input
                    :value="it.discountValue || 0"
                    @input="onDiscountInput(it, $event)"
                    type="number"
                    min="0"
                    step="1000"
                    inputmode="numeric"
                    placeholder="0"
                    class="w-20 h-7 px-2 rounded-lg border border-line-300 focus:border-royal-700 focus:ring-1 focus:ring-royal-100 outline-none text-[11px] text-right text-ink-secondary"
                  />
                </div>
              </td>

              <!-- Thành tiền -->
              <td class="px-2 py-3 text-right">
                <span class="font-bold text-royal-700 text-sm whitespace-nowrap">
                  {{ formatVND(lineTotal(it)) }}
                </span>
              </td>

              <!-- Xóa -->
              <td class="px-2 py-3 text-center">
                <button
                  @click="pos.removeProduct(it.productId)"
                  class="text-ink-disabled hover:text-red-600 transition-colors"
                  title="Xóa sản phẩm"
                  aria-label="Xóa sản phẩm"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Ghi chú đơn hàng -->
      <div class="px-4 py-3 border-t border-line-200">
        <button
          v-if="!showNote"
          @click="toggleNote"
          class="text-xs font-medium text-royal-700 hover:text-royal-800"
        >
          + Thêm ghi chú cho đơn hàng
        </button>
        <div v-else>
          <label class="block text-[11px] uppercase tracking-wide text-ink-secondary mb-1">
            Ghi chú đơn hàng
          </label>
          <textarea
            v-model="pos.note"
            rows="2"
            placeholder="Ghi chú giao hàng, yêu cầu đặc biệt..."
            class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 focus:ring-1 focus:ring-royal-100 outline-none text-sm text-ink-primary resize-none"
          ></textarea>
        </div>
      </div>
    </template>
  </div>
</template>
