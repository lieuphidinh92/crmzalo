<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatVNDShort, formatDateVN, statusLabel, statusColor } from '../composables/useFormat';
import DebtCustomerRow from '../components/DebtCustomerRow.vue';

const auth = useAuthStore();
// Chỉ owner/admin được ghi nhận đã thu; member chỉ xem để đi đòi nợ.
const canRecordPayment = computed(() => ['owner', 'admin'].includes(auth.user?.role));

const customers = ref([]);
const loading = ref(false);
const errorMsg = ref('');

// Tổng hợp công nợ (lấy từ /debt-summary để khớp với CRM lớn).
const summary = ref({ total: 0, overdue_total: 0, contact_count: 0, overdue_order_count: 0 });

// Drilldown 1 KH.
const selected = ref(null); // customer object from the list
const detail = ref(null); // { customer, orders, total_debt, ... }
const detailLoading = ref(false);
const detailError = ref('');
const recordingId = ref(null);
const toast = ref('');

async function loadList() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [{ data: listData }, { data: sumData }] = await Promise.all([
      api.get('/sale-app/debt/customers'),
      api.get('/sale-app/debt-summary'),
    ]);
    customers.value = listData.customers || [];
    summary.value = sumData || summary.value;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được danh sách công nợ';
    customers.value = [];
  } finally {
    loading.value = false;
  }
}

async function openCustomer(c) {
  selected.value = c;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    const { data } = await api.get(`/sale-app/debt/customers/${c.id}/orders`);
    detail.value = data;
  } catch (err) {
    detailError.value = err.response?.data?.error || 'Không tải được đơn công nợ';
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selected.value = null;
  detail.value = null;
}

// Owner/admin: ghi nhận đã thu toàn bộ 1 đơn (set paid = total → hết nợ).
async function recordPaid(order) {
  if (!canRecordPayment.value) return;
  if (recordingId.value) return;
  recordingId.value = order.id;
  try {
    await api.post(`/orders/${order.id}/payment`, {
      paidAmount: order.total_amount,
      mode: 'set',
    });
    toast.value = `Đã ghi nhận thu đơn ${order.order_code}`;
    setTimeout(() => (toast.value = ''), 2500);
    // Refresh drilldown + list so figures stay in sync.
    if (selected.value) await openCustomer(selected.value);
    await loadList();
  } catch (err) {
    toast.value = err.response?.data?.error || 'Lỗi ghi nhận thanh toán';
    setTimeout(() => (toast.value = ''), 3000);
  } finally {
    recordingId.value = null;
  }
}

function orderDueBadge(o) {
  if (!o.due_date) return { cls: 'bg-gray-100 text-gray-600', label: 'Không hạn' };
  if (o.is_overdue) return { cls: 'bg-rose-100 text-rose-700', label: `Quá hạn ${o.days_overdue} ngày` };
  return { cls: 'bg-emerald-50 text-emerald-700', label: `Hạn ${formatDateVN(o.due_date)}` };
}

onMounted(loadList);
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1100px] mx-auto">
    <!-- Header -->
    <div class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Công nợ</h1>
      <p class="text-xs text-ink-secondary mt-0.5">
        {{ summary.contact_count?.toLocaleString('vi-VN') || 0 }} đại lý đang nợ · ưu tiên đòi đơn quá hạn
      </p>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="bg-white border border-line-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-ink-secondary">Tổng công nợ</div>
        <div class="text-lg lg:text-xl font-bold text-ink-primary mt-1 tabular-nums">
          {{ formatVND(summary.total || 0) }}
        </div>
      </div>
      <div class="bg-white border border-rose-200 rounded-card p-4 shadow-card">
        <div class="text-xs text-rose-600">Quá hạn</div>
        <div class="text-lg lg:text-xl font-bold text-rose-600 mt-1 tabular-nums">
          {{ formatVND(summary.overdue_total || 0) }}
        </div>
        <div class="text-[11px] text-ink-secondary mt-0.5">{{ summary.overdue_order_count || 0 }} đơn quá hạn</div>
      </div>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="space-y-2.5">
      <div v-for="i in 6" :key="i" class="bg-white border border-line-200 rounded-card h-24 animate-pulse"></div>
    </div>

    <!-- Error -->
    <div v-else-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="loadList" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="customers.length === 0" class="bg-white border border-line-200 rounded-card p-12 text-center">
      <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-surface-soft flex items-center justify-center text-ink-disabled">
        <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div class="font-semibold text-ink-primary">Không có công nợ</div>
      <p class="text-xs text-ink-secondary mt-1">Tất cả đại lý đã thanh toán đầy đủ.</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-2.5">
      <DebtCustomerRow
        v-for="c in customers"
        :key="c.id"
        :customer="c"
        @open="openCustomer"
      />
    </div>

    <!-- Drilldown: outstanding orders of a customer -->
    <div v-if="selected" class="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div class="absolute inset-0 bg-black/40" @click="closeDetail"></div>
      <div
        class="relative bg-white w-full lg:max-w-lg lg:rounded-card rounded-t-2xl shadow-pop max-h-[88vh] flex flex-col"
      >
        <!-- Drawer header -->
        <div class="flex items-start justify-between gap-3 p-4 border-b border-line-200">
          <div class="min-w-0">
            <div class="font-bold text-ink-primary truncate">{{ selected.full_name || '—' }}</div>
            <div class="text-xs text-ink-secondary truncate">
              <span v-if="selected.store_name">🏪 {{ selected.store_name }}</span>
              <span v-if="selected.phone"> · 📞 {{ selected.phone }}</span>
            </div>
          </div>
          <button @click="closeDetail" class="shrink-0 w-8 h-8 rounded-full hover:bg-surface-soft flex items-center justify-center text-ink-secondary">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <!-- Drawer body -->
        <div class="p-4 overflow-y-auto">
          <div v-if="detailLoading" class="space-y-2.5">
            <div v-for="i in 3" :key="i" class="bg-surface-soft rounded-card h-20 animate-pulse"></div>
          </div>

          <div v-else-if="detailError" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-3 text-sm">
            {{ detailError }}
          </div>

          <template v-else-if="detail">
            <!-- Totals -->
            <div class="flex items-center justify-between mb-3 text-sm">
              <span class="text-ink-secondary">{{ detail.order_count }} đơn còn nợ</span>
              <span class="font-bold text-rose-600 tabular-nums">{{ formatVND(detail.total_debt) }}</span>
            </div>

            <!-- Order list -->
            <div class="space-y-2.5">
              <div
                v-for="o in detail.orders"
                :key="o.id"
                class="border rounded-card p-3"
                :class="o.is_overdue ? 'border-rose-200 bg-rose-50/30' : 'border-line-200'"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-ink-primary">{{ o.order_code }}</span>
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="statusColor(o.status)">
                    {{ statusLabel(o.status) }}
                  </span>
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" :class="orderDueBadge(o).cls">
                    {{ orderDueBadge(o).label }}
                  </span>
                </div>
                <div class="text-[11px] text-ink-secondary mt-1">
                  Ngày đặt: {{ formatDateVN(o.order_date || o.created_at) }}
                </div>
                <div class="flex items-center gap-3 mt-2 text-xs flex-wrap">
                  <span class="text-ink-secondary">Tổng: {{ formatVNDShort(o.total_amount) }}</span>
                  <span class="text-ink-secondary">Đã thu: {{ formatVNDShort(o.paid_amount) }}</span>
                  <span class="font-bold text-rose-600 tabular-nums ml-auto">Còn nợ {{ formatVND(o.debt_amount) }}</span>
                </div>

                <!-- Owner/admin only: record payment -->
                <button
                  v-if="canRecordPayment"
                  @click="recordPaid(o)"
                  :disabled="recordingId === o.id"
                  class="mt-2.5 w-full h-9 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {{ recordingId === o.id ? 'Đang ghi nhận…' : 'Ghi nhận đã thu' }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div
      v-if="toast"
      class="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-ink-primary text-white text-sm px-4 py-2.5 rounded-btn shadow-pop"
    >
      {{ toast }}
    </div>
  </div>
</template>
