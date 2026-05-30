<script setup>
import { ref, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { usePOSStore } from '../stores/pos';
import {
  formatVND,
  formatDateVN,
  formatRelativeTime,
  tierLabel,
  statusLabel,
  statusColor,
} from '../composables/useFormat';

const props = defineProps({
  customerId: { type: String, default: null },
});
const emit = defineEmits(['close', 'updated']);

const router = useRouter();
const pos = usePOSStore();

const loading = ref(false);
const errorMsg = ref('');
const customer = ref(null);
const activeTab = ref('info');

// Edit state
const editing = ref(false);
const saving = ref(false);
const saveError = ref('');
const form = ref({});

const TYPE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'nha_thuoc', label: 'Nhà thuốc' },
  { value: 'si_online', label: 'Sỉ online' },
  { value: 'duoc_si', label: 'Dược sĩ' },
  { value: 'cua_hang_me_be', label: 'Cửa hàng mẹ bé' },
];
const TIER_OPTIONS = [
  { value: 'ctv', label: 'CTV' },
  { value: 'dai_ly_cap_1', label: 'Đại lý cấp 1' },
  { value: 'dai_ly_cap_2', label: 'Đại lý cấp 2 (VIP)' },
];

const tabs = [
  { key: 'info', label: 'Thông tin' },
  { key: 'orders', label: 'Lịch sử đơn' },
  { key: 'debt', label: 'Công nợ' },
];

const typeLabel = computed(
  () => TYPE_OPTIONS.find((t) => t.value === customer.value?.customer_type)?.label || '—',
);
const debtOrders = computed(() =>
  (customer.value?.orders || []).filter((o) => (o.debt_amount ?? 0) > 0),
);

async function load(id) {
  if (!id) {
    customer.value = null;
    return;
  }
  loading.value = true;
  errorMsg.value = '';
  editing.value = false;
  activeTab.value = 'info';
  try {
    const { data } = await api.get(`/sale-app/customers/${id}`);
    customer.value = data.customer;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được chi tiết KH';
  } finally {
    loading.value = false;
  }
}

watch(() => props.customerId, load, { immediate: true });

function startEdit() {
  const c = customer.value;
  form.value = {
    fullName: c.full_name || '',
    phone: c.phone || '',
    storeName: c.store_name || '',
    province: c.province || '',
    address: c.address || '',
    customerType: c.customer_type || '',
    policyTier: c.policy_tier || '',
    notes: c.notes || '',
    internalNote: c.internal_note || '',
  };
  saveError.value = '';
  editing.value = true;
}

async function saveEdit() {
  if (!form.value.fullName.trim()) {
    saveError.value = 'Vui lòng nhập tên';
    return;
  }
  if (!form.value.phone.trim()) {
    saveError.value = 'Vui lòng nhập SĐT';
    return;
  }
  saving.value = true;
  saveError.value = '';
  try {
    const { data } = await api.put(`/sale-app/customers/${customer.value.id}`, form.value);
    // Merge updated fields back into the detail object.
    Object.assign(customer.value, data.customer);
    editing.value = false;
    emit('updated', data.customer);
  } catch (err) {
    saveError.value = err.response?.data?.error || 'Lỗi lưu thông tin';
  } finally {
    saving.value = false;
  }
}

function createOrder() {
  pos.selectCustomer({
    id: customer.value.id,
    fullName: customer.value.full_name,
    phone: customer.value.phone,
    storeName: customer.value.store_name,
    province: customer.value.province,
    policyTier: customer.value.policy_tier,
    address: customer.value.address,
  });
  emit('close');
  router.push('/pos');
}
</script>

<template>
  <transition name="fade">
    <div v-if="customerId" class="fixed inset-0 z-50 bg-black/40" @click.self="emit('close')">
      <transition name="slide">
        <div class="absolute right-0 top-0 bottom-0 w-full lg:w-[520px] bg-white shadow-pop flex flex-col" @click.stop>
          <!-- Header -->
          <div class="h-14 px-5 flex items-center justify-between border-b border-line-200 shrink-0">
            <div class="text-sm font-semibold text-ink-primary">Chi tiết khách hàng</div>
            <button @click="emit('close')" class="w-8 h-8 rounded-lg hover:bg-surface-soft flex items-center justify-center text-ink-secondary" aria-label="Đóng">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-6 space-y-3">
              <div class="h-16 bg-surface-soft animate-pulse rounded-card"></div>
              <div class="h-5 bg-surface-soft animate-pulse rounded w-2/3"></div>
              <div class="h-20 bg-surface-soft animate-pulse rounded-card"></div>
            </div>

            <div v-else-if="errorMsg" class="p-5 text-sm text-red-700 bg-red-50 border border-red-200 m-5 rounded-card">
              {{ errorMsg }}
            </div>

            <div v-else-if="customer">
              <!-- Hero -->
              <div class="p-5 border-b border-line-200">
                <div class="flex items-start gap-3">
                  <div class="w-12 h-12 rounded-full bg-royal-50 text-royal-700 flex items-center justify-center font-bold text-lg shrink-0">
                    {{ (customer.full_name || '?').slice(0, 1).toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <h2 class="text-lg font-bold text-ink-primary leading-tight">{{ customer.full_name || '—' }}</h2>
                    <div class="text-xs text-ink-secondary mt-0.5 flex flex-wrap gap-x-2">
                      <span v-if="customer.phone">📞 {{ customer.phone }}</span>
                      <span v-if="customer.store_name">· {{ customer.store_name }}</span>
                    </div>
                    <div class="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span v-if="customer.policy_tier" class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-royal-50 text-royal-700">
                        {{ tierLabel(customer.policy_tier) }}
                      </span>
                      <span v-if="customer.misa_customer_code" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-soft text-ink-secondary">
                        {{ customer.misa_customer_code }}
                      </span>
                    </div>
                  </div>
                  <button
                    v-if="!editing"
                    @click="startEdit"
                    class="shrink-0 h-8 px-3 rounded-btn border border-line-300 hover:border-royal-700 hover:text-royal-700 text-xs font-medium text-ink-primary"
                  >
                    Sửa
                  </button>
                </div>

                <!-- Stat cards -->
                <div class="grid grid-cols-3 gap-2 mt-4">
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Doanh số</div>
                    <div class="text-sm font-bold text-ink-primary tabular-nums">{{ formatVND(customer.stats?.total_revenue || 0) }}</div>
                  </div>
                  <div class="p-2.5 rounded-input bg-surface-soft">
                    <div class="text-[10px] text-ink-secondary uppercase">Số đơn</div>
                    <div class="text-sm font-bold text-ink-primary">{{ customer.stats?.order_count || 0 }}</div>
                  </div>
                  <div class="p-2.5 rounded-input" :class="(customer.stats?.current_debt || 0) > 0 ? 'bg-red-50' : 'bg-surface-soft'">
                    <div class="text-[10px] text-ink-secondary uppercase">Công nợ</div>
                    <div class="text-sm font-bold tabular-nums" :class="(customer.stats?.current_debt || 0) > 0 ? 'text-red-600' : 'text-ink-primary'">
                      {{ formatVND(customer.stats?.current_debt || 0) }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- ===== EDIT FORM ===== -->
              <div v-if="editing" class="p-5 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div class="col-span-2">
                    <label class="block text-xs font-medium text-ink-primary mb-1">Tên KH *</label>
                    <input v-model="form.fullName" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-ink-primary mb-1">SĐT *</label>
                    <input v-model="form.phone" type="tel" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-ink-primary mb-1">Tỉnh / TP</label>
                    <input v-model="form.province" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm" />
                  </div>
                  <div class="col-span-2">
                    <label class="block text-xs font-medium text-ink-primary mb-1">Tên cửa hàng</label>
                    <input v-model="form.storeName" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm" />
                  </div>
                  <div class="col-span-2">
                    <label class="block text-xs font-medium text-ink-primary mb-1">Địa chỉ</label>
                    <input v-model="form.address" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-ink-primary mb-1">Loại KH</label>
                    <select v-model="form.customerType" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm bg-white">
                      <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-ink-primary mb-1">Bảng giá</label>
                    <select v-model="form.policyTier" class="w-full h-10 px-3 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm bg-white">
                      <option v-for="o in TIER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                  <div class="col-span-2">
                    <label class="block text-xs font-medium text-ink-primary mb-1">Ghi chú</label>
                    <textarea v-model="form.notes" rows="2" class="w-full px-3 py-2 rounded-input border border-line-300 focus:border-royal-700 outline-none text-sm resize-none"></textarea>
                  </div>
                </div>

                <div v-if="saveError" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {{ saveError }}
                </div>

                <div class="flex gap-2 pt-1">
                  <button @click="editing = false" :disabled="saving" class="flex-1 h-11 rounded-btn border border-line-300 text-ink-primary font-medium hover:bg-surface-50 disabled:opacity-50">
                    Huỷ
                  </button>
                  <button @click="saveEdit" :disabled="saving" class="flex-1 h-11 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-semibold disabled:opacity-50">
                    {{ saving ? 'Đang lưu...' : 'Lưu' }}
                  </button>
                </div>
              </div>

              <!-- ===== VIEW MODE ===== -->
              <template v-else>
                <!-- Tabs -->
                <div class="border-b border-line-200 sticky top-0 bg-white z-10">
                  <div class="flex">
                    <button
                      v-for="t in tabs"
                      :key="t.key"
                      @click="activeTab = t.key"
                      class="flex-1 h-12 text-sm font-medium transition border-b-2"
                      :class="activeTab === t.key ? 'text-royal-700 border-royal-700' : 'text-ink-secondary border-transparent hover:text-ink-primary'"
                    >
                      {{ t.label }}
                    </button>
                  </div>
                </div>

                <div class="p-5">
                  <!-- Info tab -->
                  <div v-if="activeTab === 'info'" class="space-y-3 text-sm">
                    <div class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Loại KH</div><div class="text-ink-primary">{{ typeLabel }}</div></div>
                    <div v-if="customer.province" class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Tỉnh / TP</div><div class="text-ink-primary">{{ customer.province }}</div></div>
                    <div v-if="customer.address" class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Địa chỉ</div><div class="text-ink-primary">{{ customer.address }}</div></div>
                    <div class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Phụ trách</div><div class="text-ink-primary">{{ customer.assigned_user?.name || '—' }}</div></div>
                    <div class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Mua gần nhất</div><div class="text-ink-primary">{{ customer.last_order_date ? formatDateVN(customer.last_order_date) : 'Chưa mua' }}</div></div>
                    <div class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Điểm thưởng</div><div class="text-ink-primary">{{ customer.reward_points || 0 }}</div></div>
                    <div class="flex gap-3"><div class="w-28 text-ink-secondary shrink-0">Ngày tạo</div><div class="text-ink-primary">{{ formatDateVN(customer.created_at) }}</div></div>
                    <div v-if="customer.notes" class="pt-2 border-t border-line-200">
                      <div class="text-ink-secondary mb-1">Ghi chú</div>
                      <div class="text-ink-primary leading-relaxed whitespace-pre-line">{{ customer.notes }}</div>
                    </div>
                  </div>

                  <!-- Orders tab -->
                  <div v-else-if="activeTab === 'orders'">
                    <div v-if="!customer.orders?.length" class="text-ink-secondary text-center py-8 text-sm">
                      Khách hàng chưa có đơn hàng nào
                    </div>
                    <ul v-else class="space-y-2">
                      <li v-for="o in customer.orders" :key="o.id" class="p-3 rounded-card border border-line-200">
                        <div class="flex items-center justify-between mb-1">
                          <span class="font-mono text-xs font-semibold text-ink-primary">{{ o.order_code }}</span>
                          <span class="text-[10px] font-semibold px-2 py-0.5 rounded" :class="statusColor(o.status)">{{ statusLabel(o.status) }}</span>
                        </div>
                        <div class="flex items-center justify-between text-xs">
                          <span class="text-ink-secondary">{{ formatDateVN(o.order_date) }}</span>
                          <span class="font-bold text-royal-700 tabular-nums">{{ formatVND(o.total_amount) }}</span>
                        </div>
                        <div v-if="o.debt_amount > 0" class="text-[11px] text-red-600 mt-1 text-right">Còn nợ {{ formatVND(o.debt_amount) }}</div>
                      </li>
                    </ul>
                  </div>

                  <!-- Debt tab -->
                  <div v-else-if="activeTab === 'debt'">
                    <div class="p-4 rounded-card mb-3" :class="(customer.stats?.current_debt || 0) > 0 ? 'bg-red-50 border border-red-200' : 'bg-surface-soft'">
                      <div class="text-xs text-ink-secondary">Tổng công nợ hiện tại</div>
                      <div class="text-2xl font-bold tabular-nums mt-0.5" :class="(customer.stats?.current_debt || 0) > 0 ? 'text-red-600' : 'text-ink-primary'">
                        {{ formatVND(customer.stats?.current_debt || 0) }}
                      </div>
                      <div v-if="customer.stats?.debt_order_count" class="text-[11px] text-ink-secondary mt-0.5">
                        {{ customer.stats.debt_order_count }} đơn còn nợ
                      </div>
                    </div>
                    <div v-if="!debtOrders.length" class="text-ink-secondary text-center py-6 text-sm">
                      Không có đơn nào còn nợ 🎉
                    </div>
                    <ul v-else class="space-y-2">
                      <li v-for="o in debtOrders" :key="o.id" class="p-3 rounded-card border border-line-200 flex items-center justify-between">
                        <div>
                          <div class="font-mono text-xs font-semibold text-ink-primary">{{ o.order_code }}</div>
                          <div class="text-[11px] text-ink-secondary">{{ formatDateVN(o.order_date) }}</div>
                        </div>
                        <div class="text-right">
                          <div class="font-bold text-red-600 tabular-nums">{{ formatVND(o.debt_amount) }}</div>
                          <div class="text-[10px] text-ink-secondary">/ {{ formatVND(o.total_amount) }}</div>
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Sticky CTA -->
          <div v-if="customer && !loading && !editing" class="p-4 border-t border-line-200 shrink-0">
            <button @click="createOrder" class="w-full h-12 rounded-btn bg-royal-700 hover:bg-royal-800 text-white font-bold transition shadow-pop">
              + Tạo đơn cho KH này
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
