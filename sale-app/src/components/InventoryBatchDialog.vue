<script setup>
import { ref, watch, computed } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatDateVN } from '../composables/useFormat';
import { expiryBadge } from '../composables/useInventory';

const props = defineProps({
  productId: { type: String, default: null },
});
const emit = defineEmits(['close']);

const auth = useAuthStore();
const canSeeCost = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const loading = ref(false);
const errorMsg = ref('');
const product = ref(null);
// Admin-only enrichment: importCost lives on /inventory/batches (member
// gets it null-stripped). We merge by batch.id when role allows.
const batchCostByid = ref(new Map());

watch(
  () => props.productId,
  async (id) => {
    if (!id) {
      product.value = null;
      batchCostByid.value = new Map();
      return;
    }
    loading.value = true;
    errorMsg.value = '';
    try {
      const { data } = await api.get(`/sale-app/products/${id}`);
      product.value = data.product;

      if (canSeeCost.value) {
        try {
          const res = await api.get('/inventory/batches', {
            params: { productId: id, limit: 100, status: 'active,expired,recalled' },
          });
          const map = new Map();
          for (const b of res.data.batches || []) {
            if (b.importCost !== null && b.importCost !== undefined) {
              map.set(b.id, Number(b.importCost));
            }
          }
          batchCostByid.value = map;
        } catch {
          batchCostByid.value = new Map();
        }
      }
    } catch (err) {
      errorMsg.value = err.response?.data?.error || 'Không tải được lô hàng';
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const batches = computed(() => product.value?.batches ?? []);
</script>

<template>
  <transition name="fade">
    <div v-if="productId" class="fixed inset-0 z-50 bg-black/40" @click.self="emit('close')">
      <transition name="slide">
        <div
          class="absolute right-0 top-0 bottom-0 w-full lg:w-[640px] bg-white shadow-pop flex flex-col"
          @click.stop
        >
          <div class="h-14 px-5 flex items-center justify-between border-b border-line-200 shrink-0">
            <div>
              <div class="text-sm font-semibold text-ink-primary">Chi tiết lô hàng</div>
              <div v-if="product" class="text-[11px] text-ink-secondary truncate max-w-[440px]">
                {{ product.sku }} · {{ product.name }}
              </div>
            </div>
            <button
              @click="emit('close')"
              class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary"
              aria-label="Đóng"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-5">
            <div v-if="loading" class="space-y-2">
              <div v-for="i in 4" :key="i" class="h-16 bg-surface-soft animate-pulse rounded-card"></div>
            </div>

            <div
              v-else-if="errorMsg"
              class="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-card"
            >
              {{ errorMsg }}
            </div>

            <div v-else-if="!batches.length" class="text-center py-12">
              <div class="text-4xl mb-3">📦</div>
              <div class="font-semibold text-ink-primary">Không có lô nào</div>
              <p class="text-xs text-ink-secondary mt-1">Sản phẩm này hiện chưa có lô tồn trong kho.</p>
            </div>

            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-[11px] uppercase text-ink-secondary border-b border-line-200">
                    <th class="py-2 pr-3 font-medium">Mã lô</th>
                    <th class="py-2 pr-3 font-medium">Tồn / Nhập</th>
                    <th class="py-2 pr-3 font-medium">Ngày SX</th>
                    <th class="py-2 pr-3 font-medium">HSD</th>
                    <th v-if="canSeeCost" class="py-2 pr-3 font-medium text-right">Giá nhập</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="b in batches"
                    :key="b.id"
                    class="border-b border-line-200 last:border-0"
                  >
                    <td class="py-3 pr-3">
                      <div class="font-mono text-xs font-semibold text-ink-primary">{{ b.batch_code }}</div>
                      <span
                        v-if="expiryBadge(b.days_until_expiry)"
                        class="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded"
                        :class="expiryBadge(b.days_until_expiry).cls"
                      >
                        {{ expiryBadge(b.days_until_expiry).label }}
                      </span>
                    </td>
                    <td class="py-3 pr-3 tabular-nums">
                      <span class="font-semibold text-ink-primary">{{ b.current_quantity }}</span>
                      <span class="text-ink-secondary"> / {{ b.import_quantity }}</span>
                    </td>
                    <td class="py-3 pr-3 text-ink-primary">{{ formatDateVN(b.manufacture_date) }}</td>
                    <td class="py-3 pr-3 text-ink-primary">{{ formatDateVN(b.expiry_date) }}</td>
                    <td v-if="canSeeCost" class="py-3 pr-3 text-right tabular-nums text-ink-primary">
                      {{ batchCostByid.get(b.id) !== undefined ? formatVND(batchCostByid.get(b.id)) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="!canSeeCost" class="text-[11px] text-ink-disabled mt-3">
                Cột "Giá nhập" chỉ hiển thị cho quản trị viên.
              </div>
            </div>
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
