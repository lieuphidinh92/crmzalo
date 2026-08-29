<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api/client';
import { formatVND } from '../composables/useFormat';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();

const period = ref('month');
const loading = ref(true);
const errorMsg = ref('');
const data = ref(null);

const periods = [
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
];

// Hiện tối đa top 10 cho gọn; dòng "Hạng của bạn" hiện riêng nếu ngoài top 10.
const TOP_N = 10;

// Phòng trường hợp frontend mới chạy cùng backend cũ: vẫn ẩn nhân viên 0 đơn
// ngay trên giao diện. Backend cũng lọc để thứ hạng trả về luôn liên tục.
const rows = computed(() => (data.value?.rows ?? []).filter((r) => r.order_count > 0));
const topRows = computed(() => rows.value.slice(0, TOP_N));
const meRank = computed(() => data.value?.me_rank ?? null);
const meOutsideTop = computed(() => meRank.value != null && meRank.value > TOP_N);
const meRow = computed(() => (meOutsideTop.value ? rows.value.find((r) => r.is_me) : null));
// Doanh số đơn chưa gán nhân viên — hiện riêng để Tổng = Σ nhân viên + Chưa gán.
const unassigned = computed(() => data.value?.unassigned ?? null);

function medal(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const { data: res } = await api.get('/sale-app/leaderboard', { params: { period: period.value } });
    data.value = res;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được bảng xếp hạng';
  } finally {
    loading.value = false;
  }
}

function setPeriod(p) {
  if (period.value === p) return;
  period.value = p;
  load();
}

function ymdVN(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function canOpenOrders(row) {
  const user = auth.user;
  return row.is_me
    || ['owner', 'admin'].includes(user?.role)
    || user?.canViewAllOrders === true;
}

function openOrders(row) {
  if (!canOpenOrders(row)) return;

  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (period.value === 'week') {
    const day = from.getDay();
    from.setDate(from.getDate() + (day === 0 ? -6 : 1 - day));
  } else {
    from.setDate(1);
  }

  router.push({
    name: 'orders',
    query: {
      source: 'leaderboard',
      saleId: row.sale_id,
      saleName: row.name,
      from: ymdVN(from),
      to: ymdVN(now),
      period: period.value,
    },
  });
}

onMounted(load);
</script>

<template>
  <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
    <div class="flex items-center justify-between gap-2 mb-4">
      <div class="text-sm font-semibold text-ink-primary">🏆 Bảng xếp hạng</div>
      <div class="flex items-center gap-1 bg-surface-50 border border-line-200 rounded-lg p-0.5">
        <button
          v-for="p in periods"
          :key="p.key"
          @click="setPeriod(p.key)"
          class="text-xs font-medium px-2.5 py-1 rounded-md transition"
          :class="period === p.key ? 'bg-royal-700 text-white shadow-card' : 'text-ink-secondary hover:text-ink-primary'"
        >
          {{ p.label }}
        </button>
      </div>
    </div>

    <!-- Loading skeleton -->
    <ul v-if="loading" class="space-y-2.5">
      <li v-for="i in 5" :key="i" class="flex items-center gap-3">
        <div class="w-7 h-7 rounded-full bg-surface-50 border border-line-200 animate-pulse shrink-0"></div>
        <div class="flex-1 h-8 bg-surface-50 border border-line-200 rounded-lg animate-pulse"></div>
      </li>
    </ul>

    <!-- Error -->
    <div v-else-if="errorMsg" class="text-xs text-red-700 py-6 text-center">
      {{ errorMsg }}
      <button @click="load" class="block mx-auto mt-2 underline font-medium">Thử lại</button>
    </div>

    <!-- Empty -->
    <div v-else-if="topRows.length === 0" class="text-xs text-ink-secondary py-8 text-center">
      Chưa có dữ liệu doanh số kỳ này
    </div>

    <!-- List -->
    <template v-else>
      <ul class="space-y-1.5">
        <li
          v-for="r in topRows"
          :key="r.sale_id"
          class="flex items-center gap-3 rounded-lg px-2 py-1.5 transition"
          :class="r.is_me ? 'bg-royal-50 border border-royal-700/30' : 'border border-transparent'"
        >
          <div class="w-7 shrink-0 text-center">
            <span v-if="medal(r.rank)" class="text-lg leading-none">{{ medal(r.rank) }}</span>
            <span v-else class="text-xs font-semibold text-ink-secondary tabular-nums">{{ r.rank }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                :disabled="!canOpenOrders(r)"
                :title="canOpenOrders(r) ? `Xem đơn hàng của ${r.name} trong ${period === 'week' ? 'tuần' : 'tháng'}` : 'Bạn không có quyền xem đơn của nhân viên này'"
                class="text-sm font-medium text-ink-primary truncate text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-700"
                :class="canOpenOrders(r) ? 'hover:text-royal-700 hover:underline cursor-pointer' : 'cursor-default'"
                @click="openOrders(r)"
              >
                {{ r.name }}
              </button>
              <span
                v-if="r.is_me"
                class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-royal-700 text-white shrink-0"
              >
                Bạn
              </span>
            </div>
            <div class="text-[11px] text-ink-secondary tabular-nums">{{ r.order_count }} đơn</div>
          </div>
          <div class="text-sm font-bold text-royal-700 tabular-nums shrink-0">
            {{ formatVND(r.revenue) }}
          </div>
        </li>
      </ul>

      <!-- Hạng của bạn nếu ngoài top 10 -->
      <div
        v-if="meOutsideTop && meRow"
        class="flex items-center gap-3 rounded-lg px-2 py-1.5 mt-2 pt-2 border-t border-line-200 bg-royal-50"
      >
        <div class="w-7 shrink-0 text-center text-xs font-semibold text-ink-secondary tabular-nums">
          {{ meRow.rank }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="text-sm font-medium text-ink-primary truncate text-left rounded hover:text-royal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-royal-700"
              :title="`Xem đơn hàng của ${meRow.name} trong ${period === 'week' ? 'tuần' : 'tháng'}`"
              @click="openOrders(meRow)"
            >
              {{ meRow.name }}
            </button>
            <span class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-royal-700 text-white shrink-0">
              Bạn
            </span>
          </div>
          <div class="text-[11px] text-ink-secondary tabular-nums">{{ meRow.order_count }} đơn</div>
        </div>
        <div class="text-sm font-bold text-royal-700 tabular-nums shrink-0">
          {{ formatVND(meRow.revenue) }}
        </div>
      </div>

      <!-- Đơn chưa gán nhân viên (để tổng công ty cộng khớp) -->
      <div
        v-if="unassigned && unassigned.revenue > 0"
        class="flex items-center gap-3 rounded-lg px-2 py-1.5 mt-2 pt-2 border-t border-line-200"
      >
        <div class="w-7 shrink-0 text-center text-ink-disabled">–</div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium text-ink-secondary truncate">Chưa gán nhân viên</div>
          <div class="text-[11px] text-ink-secondary tabular-nums">{{ unassigned.order_count }} đơn</div>
        </div>
        <div class="text-sm font-bold text-ink-secondary tabular-nums shrink-0">
          {{ formatVND(unassigned.revenue) }}
        </div>
      </div>
    </template>
  </div>
</template>
