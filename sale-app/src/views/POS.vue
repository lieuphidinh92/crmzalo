<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePOSStore } from '../stores/pos';
import { formatVND, statusLabel } from '../composables/useFormat';
import CustomerSearch from '../components/CustomerSearch.vue';
import CustomerCard from '../components/CustomerCard.vue';
import NewCustomerDialog from '../components/NewCustomerDialog.vue';
import ProductCatalog from '../components/ProductCatalog.vue';
import OrderItemRow from '../components/OrderItemRow.vue';

const router = useRouter();
const pos = usePOSStore();

const showNewCustomer = ref(false);
const showMobileCatalog = ref(false);
const submitMsg = ref('');
const submitErr = ref('');

const isDesktop = ref(window.matchMedia('(min-width: 1024px)').matches);
window.matchMedia('(min-width: 1024px)').addEventListener('change', (e) => {
  isDesktop.value = e.matches;
});

const canSubmit = computed(
  () => pos.selectedCustomer && pos.items.length > 0 && !pos.submitting,
);

async function handleSubmit() {
  submitErr.value = '';
  submitMsg.value = '';
  try {
    const order = await pos.submitOrder();
    submitMsg.value = `Đã tạo đơn ${order.order_code} (${statusLabel(order.status)}) — ${formatVND(order.total_amount)}`;
    pos.reset();
    // Phase 1: alert đơn giản
    setTimeout(() => {
      if (confirm(`✅ ${submitMsg.value}\n\nVề trang chủ?`)) router.push('/');
    }, 50);
  } catch (err) {
    submitErr.value = err.response?.data?.error || err.message || 'Lỗi khi tạo đơn';
  }
}

function onCustomerCreated(customer) {
  pos.selectCustomer(customer);
  showNewCustomer.value = false;
}
</script>

<template>
  <div class="lg:max-w-7xl lg:mx-auto px-3 pt-3 pb-32 lg:pb-6">
    <div class="lg:grid lg:grid-cols-5 lg:gap-4">
      <!-- LEFT (60% / mobile full) — order builder -->
      <section class="lg:col-span-3 space-y-3">
        <div class="bg-white border border-line-200 rounded-xl p-3">
          <div class="text-sm font-semibold text-ink-primary mb-2">1. Chọn khách hàng</div>

          <CustomerSearch
            v-if="!pos.selectedCustomer"
            @select="pos.selectCustomer($event)"
            @create-new="showNewCustomer = true"
          />
          <CustomerCard
            v-else
            :customer="pos.selectedCustomer"
            :tier="pos.selectedTier"
            @change-tier="pos.changeTier($event)"
            @clear="pos.clearCustomer()"
          />
        </div>

        <div class="bg-white border border-line-200 rounded-xl p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-semibold text-ink-primary">
              2. Sản phẩm
              <span v-if="pos.items.length" class="text-ink-secondary font-normal">({{ pos.items.length }})</span>
            </div>
            <button
              v-if="!isDesktop"
              @click="showMobileCatalog = true"
              type="button"
              class="text-sm text-royal-700 font-medium"
            >
              + Thêm SP
            </button>
          </div>

          <div v-if="pos.items.length === 0" class="text-center text-sm text-ink-secondary py-6">
            Chưa có sản phẩm. Bấm vào danh mục bên phải để thêm.
          </div>
          <div v-else class="space-y-2">
            <OrderItemRow
              v-for="it in pos.items"
              :key="it.productId"
              :item="it"
              @update-qty="pos.updateQuantity(it.productId, $event)"
              @remove="pos.removeProduct(it.productId)"
            />
          </div>
        </div>

        <div class="bg-white border border-line-200 rounded-xl p-3">
          <div class="text-sm font-semibold text-ink-primary mb-2">3. Vận chuyển & thanh toán</div>

          <div class="mb-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Vận chuyển</div>
            <div class="grid grid-cols-3 gap-2">
              <label
                v-for="opt in [
                  { v: 'pickup_at_warehouse', l: 'Tự lấy' },
                  { v: 'cod', l: 'Grab/COD' },
                  { v: 'prepaid', l: 'ĐVVC' },
                ]"
                :key="opt.v"
                class="flex items-center justify-center text-xs font-medium px-2 py-2 rounded-lg border cursor-pointer transition"
                :class="
                  pos.shippingMethod === opt.v
                    ? 'bg-royal-50 text-royal-700 border-royal-700'
                    : 'bg-white text-ink-primary border-line-300'
                "
              >
                <input type="radio" :value="opt.v" v-model="pos.shippingMethod" class="sr-only" />
                {{ opt.l }}
              </label>
            </div>
          </div>

          <div class="mb-3">
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Thanh toán</div>
            <div class="grid grid-cols-2 gap-2">
              <label
                v-for="opt in [
                  { v: 'cod', l: 'COD' },
                  { v: 'bank_transfer', l: 'Chuyển khoản' },
                ]"
                :key="opt.v"
                class="flex items-center justify-center text-xs font-medium px-2 py-2 rounded-lg border cursor-pointer transition"
                :class="
                  pos.paymentMethod === opt.v
                    ? 'bg-royal-50 text-royal-700 border-royal-700'
                    : 'bg-white text-ink-primary border-line-300'
                "
              >
                <input type="radio" :value="opt.v" v-model="pos.paymentMethod" class="sr-only" />
                {{ opt.l }}
              </label>
            </div>
          </div>

          <div>
            <div class="text-[11px] uppercase tracking-wide text-ink-secondary mb-1.5">Ghi chú</div>
            <textarea
              v-model="pos.note"
              rows="2"
              placeholder="Ghi chú nội bộ (nếu có)..."
              class="w-full px-3 py-2 rounded-lg border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"
            />
          </div>
        </div>

        <div v-if="submitErr" class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {{ submitErr }}
        </div>

        <!-- Desktop submit button (mobile uses sticky bottom) -->
        <div class="hidden lg:flex items-center justify-between bg-white border border-line-200 rounded-xl p-4">
          <div>
            <div class="text-xs text-ink-secondary">Tổng tiền ({{ pos.itemCount }} SP)</div>
            <div class="text-2xl font-bold text-royal-700">{{ formatVND(pos.totalAmount) }}</div>
          </div>
          <button
            @click="handleSubmit"
            :disabled="!canSubmit"
            class="h-12 px-6 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {{ pos.submitting ? 'Đang lưu...' : 'XÁC NHẬN ĐƠN' }}
          </button>
        </div>
      </section>

      <!-- RIGHT (40% desktop / hidden mobile) — catalog -->
      <aside class="hidden lg:block lg:col-span-2">
        <div class="sticky top-16 bg-white border border-line-200 rounded-xl p-3" style="height: calc(100dvh - 5.5rem)">
          <ProductCatalog :tier="pos.selectedTier" @add="pos.addProduct($event)" />
        </div>
      </aside>
    </div>

    <!-- Mobile: sticky bottom submit -->
    <div
      v-if="!isDesktop"
      class="lg:hidden fixed bottom-16 left-0 right-0 bg-white border-t border-line-200 p-3 shadow-lg z-30"
      style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem + 4rem)"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-[11px] text-ink-secondary">Tổng ({{ pos.itemCount }} SP)</div>
          <div class="text-lg font-bold text-royal-700">{{ formatVND(pos.totalAmount) }}</div>
        </div>
        <button
          @click="handleSubmit"
          :disabled="!canSubmit"
          class="flex-1 h-12 rounded-xl bg-royal-700 hover:bg-royal-800 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {{ pos.submitting ? 'Đang lưu...' : 'XÁC NHẬN ĐƠN' }}
        </button>
      </div>
    </div>

    <!-- Mobile catalog drawer -->
    <div
      v-if="showMobileCatalog && !isDesktop"
      class="lg:hidden fixed inset-0 z-50 bg-black/40"
      @click.self="showMobileCatalog = false"
    >
      <div class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl flex flex-col" style="height: 85dvh">
        <div class="p-3 border-b border-line-200 flex items-center justify-between">
          <div class="font-semibold text-ink-primary">Danh mục sản phẩm</div>
          <button @click="showMobileCatalog = false" class="text-ink-secondary text-xl">✕</button>
        </div>
        <div class="flex-1 overflow-hidden p-3">
          <ProductCatalog :tier="pos.selectedTier" @add="pos.addProduct($event)" />
        </div>
      </div>
    </div>

    <NewCustomerDialog
      v-if="showNewCustomer"
      @close="showNewCustomer = false"
      @created="onCustomerCreated"
    />
  </div>
</template>
