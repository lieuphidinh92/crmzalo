<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { formatVND, formatVNDShort, formatDateTimeVN, statusLabel, statusColor } from '../composables/useFormat';

dayjs.locale('vi');

const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const errorMsg = ref('');
const stats = ref(null);

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');
const today = computed(() => {
  const d = dayjs();
  const weekday = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][d.day()];
  return `${weekday}, ${d.format('DD/MM/YYYY')}`;
});

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data } = await api.get('/sale-app/home-stats');
    stats.value = data;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được thống kê';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function goCreate() {
  router.push('/pos');
}

function goOrder(orderId) {
  // Phase 1: chỉ alert, Phase 2 sẽ mở detail
  console.log('Open order', orderId);
}
</script>

<template>
  <div class="px-4 pt-4 pb-6 max-w-3xl mx-auto">
    <div class="mb-5">
      <div class="text-xl font-bold text-gray-900">Xin chào, {{ userName }} 👋</div>
      <div class="text-sm text-gray-500 mt-0.5">Hôm nay là {{ today }}</div>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="h-28 bg-white rounded-2xl border border-gray-200 animate-pulse"></div>
      <div class="h-14 bg-white rounded-2xl border border-gray-200 animate-pulse"></div>
      <div class="grid grid-cols-2 gap-3">
        <div class="h-20 bg-white rounded-xl border border-gray-200 animate-pulse"></div>
        <div class="h-20 bg-white rounded-xl border border-gray-200 animate-pulse"></div>
      </div>
    </div>

    <div v-else-if="errorMsg" class="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-rose-600 underline">Thử lại</button>
    </div>

    <div v-else-if="stats">
      <div class="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 text-white shadow-lg shadow-orange-200 mb-4">
        <div class="text-xs uppercase tracking-wide opacity-80 mb-1">Hôm nay</div>
        <div class="text-3xl font-bold leading-tight">
          {{ formatVND(stats.today.revenue) }}
        </div>
        <div class="text-sm mt-1 opacity-90">
          {{ stats.today.order_count }} đơn
        </div>
      </div>

      <button
        @click="goCreate"
        class="w-full h-14 rounded-2xl bg-white border-2 border-brand-500 text-brand-600 hover:bg-brand-50 active:bg-brand-100 font-semibold text-base flex items-center justify-center gap-2 mb-5 transition"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
        </svg>
        <span>Tạo đơn mới</span>
      </button>

      <div class="grid grid-cols-2 gap-3 mb-5">
        <div class="bg-white rounded-xl border border-gray-200 p-3">
          <div class="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Tuần này</div>
          <div class="text-lg font-bold text-gray-900 leading-tight">
            {{ formatVNDShort(stats.this_week.revenue) }}
          </div>
          <div class="text-xs text-gray-500">{{ stats.this_week.order_count }} đơn</div>
        </div>
        <div class="bg-white rounded-xl border border-gray-200 p-3">
          <div class="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Tháng này</div>
          <div class="text-lg font-bold text-gray-900 leading-tight">
            {{ formatVNDShort(stats.this_month.revenue) }}
          </div>
          <div class="text-xs text-gray-500">{{ stats.this_month.order_count }} đơn</div>
        </div>
      </div>

      <div>
        <div class="text-sm font-semibold text-gray-900 mb-2 px-1">Đơn gần đây</div>
        <div v-if="stats.recent_orders.length === 0" class="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
          Chưa có đơn nào. Bấm "Tạo đơn mới" để bắt đầu.
        </div>
        <div v-else class="space-y-2">
          <button
            v-for="o in stats.recent_orders"
            :key="o.id"
            @click="goOrder(o.id)"
            class="w-full bg-white rounded-xl border border-gray-200 p-3 text-left hover:border-brand-300 active:bg-gray-50 transition"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="font-mono text-xs text-gray-500">{{ o.order_code }}</div>
                <div class="font-medium text-gray-900 truncate mt-0.5">{{ o.contact_name }}</div>
                <div v-if="o.store_name" class="text-xs text-gray-500 truncate">{{ o.store_name }}</div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-bold text-brand-600">{{ formatVND(o.total_amount) }}</div>
                <div class="text-[11px] text-gray-500 mt-0.5">{{ formatDateTimeVN(o.created_at) }}</div>
              </div>
            </div>
            <div class="mt-2">
              <span
                class="inline-block text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
                :class="statusColor(o.status)"
              >
                {{ statusLabel(o.status) }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
