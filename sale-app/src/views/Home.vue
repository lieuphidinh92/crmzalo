<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { api } from '../api/client';
import { useScreenCache } from '../composables/use-screen-cache';
import { useAuthStore } from '../stores/auth';
import { useDashboardStore } from '../stores/dashboard';
import DashboardKpiStrip from '../components/dashboard/DashboardKpiStrip.vue';
import TodayActionCenter from '../components/dashboard/TodayActionCenter.vue';
import SalesKpiTree from '../components/dashboard/SalesKpiTree.vue';
import CustomerHealthStrip from '../components/dashboard/CustomerHealthStrip.vue';
import SalesPipelinePanel from '../components/dashboard/SalesPipelinePanel.vue';
import ProductOpportunityPanel from '../components/dashboard/ProductOpportunityPanel.vue';
import CompactLeaderboard from '../components/dashboard/CompactLeaderboard.vue';

dayjs.locale('vi');

const router = useRouter();
const auth = useAuthStore();
const dashboardStore = useDashboardStore();
const loading = ref(true);
const refreshing = ref(false);
const errorMsg = ref('');
const refreshError = ref('');
const dashboard = ref(null);

const userName = computed(() => auth.user?.fullName || auth.user?.email || 'Sale');
const today = computed(() => {
  const date = dayjs();
  const weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][date.day()];
  return `${weekday}, ${date.format('DD/MM/YYYY')}`;
});
const generatedLabel = computed(() => {
  if (!dashboard.value?.generatedAt) return '';
  return dayjs(dashboard.value.generatedAt).format('HH:mm, DD/MM/YYYY');
});

async function load(silent = false) {
  if (silent) refreshing.value = true;
  else loading.value = true;
  if (!silent) errorMsg.value = '';
  try {
    const response = await api.get('/sale-app/dashboard-v2');
    dashboard.value = response.data;
    dashboardStore.setDashboard(response.data);
    errorMsg.value = '';
    refreshError.value = '';
  } catch (error) {
    const message = error.response?.data?.error || 'Không tải được dashboard bán hàng';
    if (silent && dashboard.value) refreshError.value = message;
    else errorMsg.value = message;
  } finally {
    if (silent) refreshing.value = false;
    else loading.value = false;
  }
}

const { refresh } = useScreenCache(load, { ttl: 30_000 });

const quickActions = [
  { label: 'Tạo đơn hàng', note: 'Lên đơn nhanh', icon: '🛒', to: '/pos' },
  { label: 'Khách hàng', note: 'Tìm và chăm sóc', icon: '👥', to: '/customers' },
  { label: 'Đơn hàng', note: 'Theo dõi xử lý', icon: '📦', to: '/orders' },
  { label: 'Sản phẩm', note: 'Tra cứu tồn và giá', icon: '🔎', to: '/products' },
];

function stockMeta(row) {
  if (row.stock <= 0) return { label: 'Hết hàng', cls: 'bg-red-50 text-red-700' };
  if (row.stock <= Math.max(1, row.warningStock / 2)) return { label: 'Sắp hết', cls: 'bg-red-50 text-red-700' };
  return { label: 'Tồn thấp', cls: 'bg-amber-50 text-amber-700' };
}
</script>

<template>
  <main class="w-full px-3 py-4 sm:px-4 lg:px-5 lg:py-4 2xl:px-6">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3 lg:hidden">
      <div>
        <h1 class="text-xl font-bold text-ink-primary lg:text-2xl">Chào buổi sáng, {{ userName }}! 👋</h1>
        <p class="mt-0.5 text-sm text-ink-secondary">Hôm nay là {{ today }}</p>
      </div>
    </header>

    <div v-if="loading" class="space-y-4" aria-label="Đang tải dashboard">
      <div class="grid grid-cols-2 gap-2 xl:grid-cols-6">
        <div v-for="index in 6" :key="index" class="h-28 animate-pulse rounded-card border border-line-200 bg-white" />
      </div>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,.95fr)]">
        <div class="h-[480px] animate-pulse rounded-card border border-line-200 bg-white" />
        <div class="space-y-4"><div class="h-64 animate-pulse rounded-card border border-line-200 bg-white" /><div class="h-48 animate-pulse rounded-card border border-line-200 bg-white" /></div>
      </div>
    </div>

    <div v-else-if="errorMsg" class="rounded-card border border-red-200 bg-red-50 p-5 text-sm text-red-700">
      <strong>Không thể tải dashboard.</strong>
      <p class="mt-1">{{ errorMsg }}</p>
      <button class="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 font-semibold" @click="load(false)">Thử lại</button>
    </div>

    <div v-else-if="dashboard" class="space-y-4">
      <div v-if="refreshError" class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
        <span>Không thể lấy dữ liệu mới. Dashboard đang hiển thị bản cập nhật lúc {{ generatedLabel }}.</span>
        <button class="font-semibold underline underline-offset-2" @click="refresh(true)">Thử lại</button>
      </div>
      <DashboardKpiStrip :data="dashboard.monthlyKpi" />

      <section class="grid items-start gap-4 2xl:grid-cols-12">
        <TodayActionCenter class="2xl:col-span-8" :data="dashboard.todayAction" @action-changed="load(true)" />
        <div class="grid gap-4 lg:grid-cols-2 2xl:col-span-4 2xl:grid-cols-1">
          <SalesKpiTree :data="dashboard.kpiTree" />
          <CustomerHealthStrip :data="dashboard.customerHealth" />
        </div>
      </section>

      <section class="grid items-start gap-4 lg:grid-cols-2 min-[1600px]:grid-cols-[1.3fr_.9fr_.9fr]">
        <SalesPipelinePanel :data="dashboard.pipeline" :processing-orders="dashboard.utilities.processingOrders" />
        <ProductOpportunityPanel :rows="dashboard.productOpportunities" />
        <div class="lg:col-span-2 min-[1600px]:col-span-1">
          <CompactLeaderboard :rows="dashboard.leaderboard" @targets-updated="load(true)" />
        </div>
      </section>

      <section class="pt-1">
        <div class="mb-3">
          <h2 class="text-sm font-bold text-ink-primary">CÔNG CỤ & CẢNH BÁO VẬN HÀNH</h2>
          <p class="mt-0.5 text-[11px] text-ink-secondary">Đặt sau khu vực ưu tiên để không làm loãng công việc bán hàng.</p>
        </div>
        <div class="grid gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
          <article class="rounded-card border border-line-200 bg-white p-4 shadow-card">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-ink-primary">Cảnh báo tồn kho</h3>
              <button class="text-[10px] font-semibold text-royal-700" @click="router.push('/products')">Xem tất cả</button>
            </div>
            <div v-if="!dashboard.utilities.lowStock.length" class="py-8 text-center text-xs text-ink-secondary">Không có sản phẩm dưới ngưỡng cảnh báo.</div>
            <ul v-else class="mt-3 space-y-2.5">
              <li v-for="row in dashboard.utilities.lowStock" :key="row.id" class="flex items-center gap-3">
                <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line-200 bg-surface-50">
                  <img v-if="row.imageUrl" :src="row.imageUrl" :alt="row.name" class="h-full w-full object-cover" />
                  <span v-else class="text-[9px] text-ink-disabled">{{ row.sku }}</span>
                </div>
                <div class="min-w-0 flex-1"><div class="truncate text-xs font-semibold text-ink-primary">{{ row.name }}</div><div class="text-[10px] text-ink-secondary">Tồn: {{ row.stock }} · Ngưỡng: {{ row.warningStock }}</div></div>
                <span class="shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase" :class="stockMeta(row).cls">{{ stockMeta(row).label }}</span>
              </li>
            </ul>
          </article>

          <article class="rounded-card border border-line-200 bg-white p-4 shadow-card">
            <h3 class="text-sm font-bold text-ink-primary">Thao tác nhanh</h3>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <button v-for="action in quickActions" :key="action.label" class="flex items-center gap-3 rounded-xl border border-line-200 p-3 text-left transition hover:border-royal-200 hover:bg-royal-50/40" @click="router.push(action.to)">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-royal-50 text-base">{{ action.icon }}</span>
                <span class="min-w-0"><strong class="block truncate text-xs text-ink-primary">{{ action.label }}</strong><small class="text-[10px] text-ink-secondary">{{ action.note }}</small></span>
              </button>
            </div>
          </article>

          <article class="rounded-card border border-dashed border-amber-300 bg-amber-50/60 p-4">
            <div class="flex h-full min-h-36 flex-col justify-center">
              <span class="text-xl">🎁</span>
              <h3 class="mt-2 text-sm font-bold text-ink-primary">Chương trình bán hàng</h3>
              <p class="mt-1 text-xs leading-5 text-ink-secondary">Chưa có nguồn dữ liệu khuyến mãi được cấu hình. Phase 1 không hiển thị banner giả hoặc ưu đãi hard-code.</p>
              <span class="mt-3 w-fit rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-amber-700">Chờ dữ liệu nguồn</span>
            </div>
          </article>
        </div>
      </section>

      <footer class="flex flex-wrap items-center justify-center gap-2 pb-2 pt-1 text-center text-[10px] text-ink-disabled">
        <span>KPI tính từ đơn hợp lệ và sale phụ trách; target, giá trị deal và khuyến mãi không được suy diễn khi chưa có dữ liệu nguồn.</span>
        <span v-if="generatedLabel">Cập nhật {{ generatedLabel }}</span>
        <button :disabled="refreshing" class="font-semibold text-royal-700 disabled:opacity-50" @click="refresh(true)">{{ refreshing ? 'Đang làm mới…' : '↻ Làm mới' }}</button>
      </footer>
    </div>
  </main>
</template>
