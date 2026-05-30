<script setup>
import { ref, watch, computed } from 'vue';
import { api } from '../api/client';
import { formatVND, formatDateVN } from '../composables/useFormat';

const props = defineProps({
  productId: { type: String, default: null },
  tier: { type: String, default: 'dai_ly_cap_2' },
});
const emit = defineEmits(['close', 'add']);

const loading = ref(false);
const errorMsg = ref('');
const product = ref(null);
const activeTab = ref('info');

watch(
  () => props.productId,
  async (id) => {
    if (!id) {
      product.value = null;
      return;
    }
    loading.value = true;
    errorMsg.value = '';
    activeTab.value = 'info';
    try {
      const { data } = await api.get(`/sale-app/products/${id}`, { params: { tier: props.tier } });
      product.value = data.product;
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được chi tiết SP';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const noPrice = computed(() => !product.value?.wholesale_price || product.value.wholesale_price <= 0);

const tabs = [
  { key: 'info', label: 'Thông tin' },
  { key: 'price', label: 'Giá' },
  { key: 'batches', label: 'Lô / HSD' },
];

function batchLevel(days) {
  if (days === null || days === undefined) return { label: '—', cls: 'text-ink-secondary' };
  if (days < 0) return { label: `Hết HSD ${Math.abs(days)}d`, cls: 'text-red-700 bg-red-50' };
  if (days < 30) return { label: `Còn ${days}d`, cls: 'text-red-700 bg-red-50' };
  if (days < 90) return { label: `Còn ${days}d`, cls: 'text-amber-700 bg-amber-50' };
  return { label: `Còn ${days}d`, cls: 'text-green-700 bg-green-50' };
}
</script>

<template>
  <transition name="fade">
    <div v-if="productId" class="fixed inset-0 z-50 bg-black/40" @click.self="emit('close')">
      <transition name="slide">
        <div
          class="absolute right-0 top-0 bottom-0 w-full lg:w-[520px] bg-white shadow-pop flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="h-14 px-5 flex items-center justify-between border-b border-line-200 shrink-0">
            <div class="text-sm font-semibold text-ink-primary">Chi tiết sản phẩm</div>
            <button @click="emit('close')" class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary" aria-label="Đóng">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-6 space-y-3">
              <div class="aspect-square bg-surface-soft animate-pulse rounded-card"></div>
              <div class="h-5 bg-surface-soft animate-pulse rounded"></div>
              <div class="h-4 bg-surface-soft animate-pulse rounded w-1/2"></div>
            </div>

            <div v-else-if="errorMsg" class="p-5 text-sm text-red-700 bg-red-50 border border-red-200 m-5 rounded-card">
              {{ errorMsg }}
            </div>

            <div v-else-if="product">
              <!-- Hero image -->
              <div class="aspect-square bg-surface-soft border-b border-line-200 overflow-hidden">
                <img
                  v-if="product.mainImageUrl"
                  :src="product.mainImageUrl"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-ink-disabled">
                  {{ product.sku }}
                </div>
              </div>

              <!-- Header info -->
              <div class="p-5 border-b border-line-200">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-mono text-xs text-ink-secondary">{{ product.sku }}</span>
                  <span v-if="product.brand?.name" class="text-xs bg-royal-50 text-royal-700 px-2 py-0.5 rounded font-medium">
                    {{ product.brand.name }}
                  </span>
                </div>
                <h2 class="text-lg font-bold text-ink-primary leading-tight mb-3">{{ product.name }}</h2>

                <div v-if="noPrice" class="inline-block text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded">
                  Liên hệ giá
                </div>
                <template v-else>
                  <div class="text-2xl font-bold text-royal-700 tabular-nums leading-none">
                    {{ formatVND(product.wholesale_price) }}
                  </div>
                  <div v-if="product.wholesale_tier" class="text-[11px] text-ink-secondary mt-1">
                    {{ product.wholesale_tier }}
                  </div>
                  <div v-if="product.retail_price > product.wholesale_price" class="mt-2 flex gap-4 text-xs">
                    <div>
                      <div class="text-ink-secondary">Giá lẻ niêm yết</div>
                      <div class="font-semibold text-ink-primary line-through tabular-nums">{{ formatVND(product.retail_price) }}</div>
                    </div>
                    <div>
                      <div class="text-ink-secondary">Lãi dự kiến</div>
                      <div class="font-semibold text-green-700 tabular-nums">{{ formatVND(product.estimated_profit) }}</div>
                    </div>
                  </div>
                </template>

                <!-- Stock + stats -->
                <div class="grid grid-cols-3 gap-3 mt-4">
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Tồn kho</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stock ?? 0 }}</div>
                  </div>
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Bán 30d</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stats?.quantity_sold_30d ?? 0 }}</div>
                  </div>
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Đơn 30d</div>
                    <div class="text-base font-bold text-ink-primary">{{ product.stats?.order_count_30d ?? 0 }}</div>
                  </div>
                </div>
              </div>

              <!-- Tabs -->
              <div class="border-b border-line-200 sticky top-0 bg-white z-10">
                <div class="flex">
                  <button
                    v-for="t in tabs"
                    :key="t.key"
                    @click="activeTab = t.key"
                    class="flex-1 h-12 text-sm font-medium transition border-b-2"
                    :class="
                      activeTab === t.key
                        ? 'text-royal-700 border-royal-700'
                        : 'text-ink-secondary border-transparent hover:text-ink-primary'
                    "
                  >
                    {{ t.label }}
                  </button>
                </div>
              </div>

              <!-- Tab content -->
              <div class="p-5 space-y-3">
                <!-- Info -->
                <div v-if="activeTab === 'info'" class="space-y-3 text-sm">
                  <div v-if="product.package_size" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Quy cách</div>
                    <div class="text-ink-primary">{{ product.package_size }}</div>
                  </div>
                  <div v-if="product.shelf_life_months" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">HSD (tháng)</div>
                    <div class="text-ink-primary">{{ product.shelf_life_months }}</div>
                  </div>
                  <div v-if="product.registration_number" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Số ĐK</div>
                    <div class="text-ink-primary font-mono text-xs">{{ product.registration_number }}</div>
                  </div>
                  <div v-if="product.main_use" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Công dụng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.main_use }}</div>
                  </div>
                  <div v-if="product.target_audience" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Đối tượng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.target_audience }}</div>
                  </div>
                  <div v-if="product.usage_method" class="flex gap-3">
                    <div class="w-32 text-ink-secondary shrink-0">Cách dùng</div>
                    <div class="text-ink-primary leading-relaxed">{{ product.usage_method }}</div>
                  </div>
                  <div v-if="!product.main_use && !product.target_audience && !product.usage_method" class="text-ink-secondary text-center py-6">
                    Chưa có mô tả chi tiết
                  </div>
                </div>

                <!-- Prices -->
                <div v-if="activeTab === 'price'">
                  <div v-if="!product.tiers?.length" class="text-ink-secondary text-center py-6 text-sm">
                    Chưa có bảng giá. Liên hệ admin để cấu hình.
                  </div>
                  <ul v-else class="space-y-2">
                    <li
                      v-for="t in product.tiers"
                      :key="t.id"
                      class="flex items-center justify-between p-3 rounded-card border border-line-200"
                      :class="t.name === product.wholesale_tier ? 'border-royal-700 bg-royal-50' : ''"
                    >
                      <div>
                        <div class="text-sm font-semibold text-ink-primary">{{ t.name }}</div>
                        <div v-if="t.isDefault" class="text-[10px] text-ink-secondary">Mặc định</div>
                      </div>
                      <div class="text-base font-bold text-royal-700 tabular-nums">{{ formatVND(t.price) }}</div>
                    </li>
                  </ul>
                </div>

                <!-- Batches -->
                <div v-if="activeTab === 'batches'">
                  <div v-if="!product.batches?.length" class="text-ink-secondary text-center py-6 text-sm">
                    Không có lô nào trong kho
                  </div>
                  <ul v-else class="space-y-2">
                    <li
                      v-for="b in product.batches"
                      :key="b.id"
                      class="p-3 rounded-card border border-line-200"
                    >
                      <div class="flex items-center justify-between mb-1.5">
                        <div class="text-sm font-mono font-semibold text-ink-primary">{{ b.batch_code }}</div>
                        <span class="text-[10px] font-semibold px-2 py-0.5 rounded" :class="batchLevel(b.days_until_expiry).cls">
                          {{ batchLevel(b.days_until_expiry).label }}
                        </span>
                      </div>
                      <div class="grid grid-cols-3 gap-2 text-[11px] text-ink-secondary">
                        <div>
                          <div>Tồn / nhập</div>
                          <div class="text-ink-primary font-medium">{{ b.current_quantity }} / {{ b.import_quantity }}</div>
                        </div>
                        <div>
                          <div>HSD</div>
                          <div class="text-ink-primary font-medium">{{ formatDateVN(b.expiry_date) }}</div>
                        </div>
                        <div>
                          <div>Ngày SX</div>
                          <div class="text-ink-primary font-medium">{{ formatDateVN(b.manufacture_date) }}</div>
                        </div>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Sticky CTA -->
          <div v-if="product && !loading" class="p-4 border-t border-line-200 shrink-0">
            <button
              @click="emit('add', product)"
              :disabled="noPrice || product.stock <= 0"
              class="w-full h-12 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-pop"
            >
              {{ noPrice ? 'Chưa có giá' : product.stock <= 0 ? 'Hết hàng' : '+ Thêm vào đơn' }}
            </button>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease-out;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}
</style>
