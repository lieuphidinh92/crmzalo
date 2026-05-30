<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { api } from '../api/client';
import { formatVND, formatVNDShort, formatDateVN, tierLabel } from '../composables/useFormat';

dayjs.locale('vi');

const router = useRouter();

const period = ref('this_month');
const groupBy = ref('day');
const skuGroupBy = ref('brand');

const loading = ref(true);
const errorMsg = ref('');
const summary = ref(null);
const trend = ref([]);
const topCustomers = ref([]);
const skuMix = ref({ items: [], total_revenue: 0 });

const periodChips = [
  { key: 'this_month', label: 'Tháng này' },
  { key: 'last_month', label: 'Tháng trước' },
  { key: '90d', label: '90 ngày' },
  { key: 'ytd', label: 'YTD' },
];

// Auto-pick trend groupBy based on period
watch(period, (p) => {
  if (p === 'ytd') groupBy.value = 'month';
  else if (p === '90d') groupBy.value = 'week';
  else groupBy.value = 'day';
});

async function load() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const [s, t, c, m] = await Promise.all([
      api.get('/sale-app/reports/summary', { params: { period: period.value } }),
      api.get('/sale-app/reports/revenue-trend', { params: { period: period.value, groupBy: groupBy.value } }),
      api.get('/sale-app/reports/top-customers', { params: { period: period.value, limit: 10 } }),
      api.get('/sale-app/reports/sku-mix', { params: { period: period.value, groupBy: skuGroupBy.value, limit: 8 } }),
    ]);
    summary.value = s.data;
    trend.value = t.data.series || [];
    topCustomers.value = c.data.customers || [];
    skuMix.value = m.data;
  } catch (err) {
    errorMsg.value = err.response?.data?.error || 'Không tải được báo cáo';
  } finally {
    loading.value = false;
  }
}

watch([period, groupBy, skuGroupBy], load);
onMounted(load);

// ── SVG chart helpers ────────────────────────────────────────────────────
const chartW = 800;
const chartH = 200;
const padL = 50;
const padR = 16;
const padT = 16;
const padB = 28;

const chart = computed(() => {
  if (!trend.value.length) return null;
  const max = Math.max(...trend.value.map((p) => p.revenue), 1);
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const n = trend.value.length;
  const stepX = n > 1 ? innerW / (n - 1) : innerW;

  const points = trend.value.map((p, i) => ({
    x: padL + i * stepX,
    y: padT + innerH - (p.revenue / max) * innerH,
    revenue: p.revenue,
    bucket: p.bucket,
    order_count: p.order_count,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    linePath +
    ` L${points[points.length - 1].x.toFixed(1)},${padT + innerH} L${points[0].x.toFixed(1)},${padT + innerH} Z`;

  // Y-axis ticks (4 levels)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: padT + innerH - p * innerH,
    label: formatVNDShort(max * p),
  }));

  // X-axis labels (max 6, evenly spaced)
  const xLabelCount = Math.min(n, 6);
  const xStep = Math.max(1, Math.floor(n / xLabelCount));
  const xTicks = points.filter((_, i) => i % xStep === 0 || i === n - 1).map((p) => ({
    x: p.x,
    label: formatBucket(p.bucket),
  }));

  return { points, linePath, areaPath, yTicks, xTicks, max };
});

function formatBucket(b) {
  // b can be "YYYY-MM-DD", "YYYY-MM", weekly key "YYYY-MM-DD"
  if (/^\d{4}-\d{2}$/.test(b)) {
    const [y, m] = b.split('-');
    return `T${parseInt(m)}/${y.slice(2)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    const d = dayjs(b);
    return groupBy.value === 'week' ? `T.${d.format('D/M')}` : d.format('D/M');
  }
  return b;
}

const hover = ref(null);

function onChartHover(e) {
  if (!chart.value) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * chartW;
  let best = null;
  let bestDist = Infinity;
  for (const p of chart.value.points) {
    const d = Math.abs(p.x - x);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  hover.value = best;
}

const trendCls = (pct) => {
  if (pct === null || pct === undefined) return 'text-ink-secondary';
  if (pct > 0) return 'text-green-600';
  if (pct < 0) return 'text-red-600';
  return 'text-ink-secondary';
};

const trendLabel = (pct) => {
  if (pct === null || pct === undefined) return 'Không có dữ liệu kỳ trước';
  if (pct === 0) return 'Không đổi';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}% so với kỳ trước`;
};

const trendArrow = (pct) => {
  if (pct === null || pct === undefined || pct === 0) return null;
  return pct > 0 ? 'up' : 'down';
};

function customerInitial(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).pop()[0].toUpperCase();
}

const customerTypeLabel = (t) => {
  const map = {
    nha_thuoc: 'Nhà thuốc',
    si_online: 'Sỉ online',
    duoc_si: 'Dược sĩ',
    cua_hang_me_be: 'Cửa hàng mẹ bé',
  };
  return map[t] || '—';
};
</script>

<template>
  <div class="px-4 lg:px-6 py-4 lg:py-6 max-w-[1400px] mx-auto space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 class="text-xl lg:text-2xl font-bold text-ink-primary">Báo cáo</h1>
        <p class="text-xs text-ink-secondary mt-0.5">
          {{ summary?.period?.label ?? '—' }}
          <span v-if="summary?.period?.from">
            · {{ dayjs(summary.period.from).format('DD/MM') }} – {{ dayjs(summary.period.to).subtract(1, 'day').format('DD/MM/YYYY') }}
          </span>
        </p>
      </div>
      <div class="flex gap-1.5 flex-wrap">
        <button
          v-for="chip in periodChips"
          :key="chip.key"
          @click="period = chip.key"
          class="h-9 px-3 rounded-full text-xs font-semibold border transition"
          :class="
            period === chip.key
              ? 'bg-royal-700 text-white border-royal-700'
              : 'bg-white text-ink-primary border-line-300 hover:border-royal-700'
          "
        >
          {{ chip.label }}
        </button>
      </div>
    </div>

    <div v-if="errorMsg" class="bg-red-50 border border-red-200 text-red-700 rounded-card p-4 text-sm">
      {{ errorMsg }}
      <button @click="load" class="block mt-2 text-red-700 underline font-medium">Thử lại</button>
    </div>

    <!-- KPI row -->
    <div v-if="loading && !summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div v-for="i in 4" :key="i" class="h-28 bg-white rounded-card border border-line-200 animate-pulse"></div>
    </div>
    <div v-else-if="summary" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div
        v-for="(k, key) in {
          revenue: { label: 'Doanh số', formatter: formatVND },
          order_count: { label: 'Số đơn', formatter: (v) => `${v.toLocaleString('vi-VN')} đơn` },
          avg_order_value: { label: 'Giá trị TB / đơn', formatter: formatVND },
          active_customers: { label: 'KH active', formatter: (v) => `${v} KH` },
        }"
        :key="key"
        class="bg-white border border-line-200 rounded-card p-5 shadow-card"
      >
        <div class="text-[13px] text-ink-secondary font-medium mb-1">{{ k.label }}</div>
        <div class="text-2xl lg:text-[26px] font-bold text-ink-primary leading-tight tabular-nums">
          {{ k.formatter(summary.kpi[key].value) }}
        </div>
        <div class="mt-2 flex items-center gap-1 text-[11px]">
          <svg
            v-if="trendArrow(summary.kpi[key].trend_pct)"
            class="w-3.5 h-3.5"
            :class="trendCls(summary.kpi[key].trend_pct)"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path v-if="trendArrow(summary.kpi[key].trend_pct) === 'up'" d="M7 14l5-5 5 5z"/>
            <path v-else d="M7 10l5 5 5-5z"/>
          </svg>
          <span :class="trendCls(summary.kpi[key].trend_pct)" class="font-medium">
            {{ trendLabel(summary.kpi[key].trend_pct) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Revenue trend chart -->
    <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="text-sm font-semibold text-ink-primary">Biểu đồ doanh thu</div>
          <div class="text-[11px] text-ink-secondary">
            Theo {{ groupBy === 'day' ? 'ngày' : groupBy === 'week' ? 'tuần' : 'tháng' }}
          </div>
        </div>
      </div>

      <div v-if="loading && !trend.length" class="h-[200px] bg-surface-soft rounded-input animate-pulse"></div>
      <div v-else-if="trend.length === 0" class="h-[200px] flex items-center justify-center text-sm text-ink-secondary">
        Chưa có doanh thu trong kỳ này
      </div>
      <div v-else-if="chart" class="relative">
        <svg
          :viewBox="`0 0 ${chartW} ${chartH}`"
          class="w-full h-auto"
          preserveAspectRatio="none"
          @mousemove="onChartHover"
          @mouseleave="hover = null"
        >
          <!-- Grid + Y labels -->
          <line
            v-for="(t, i) in chart.yTicks"
            :key="`y${i}`"
            :x1="padL" :x2="chartW - padR"
            :y1="t.y" :y2="t.y"
            stroke="#E2E8F0" stroke-width="1"
          />
          <text
            v-for="(t, i) in chart.yTicks"
            :key="`yl${i}`"
            :x="padL - 6" :y="t.y + 3"
            text-anchor="end" font-size="10" fill="#64748B"
          >{{ t.label }}</text>

          <!-- Area + Line -->
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1E40AF" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#1E40AF" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path :d="chart.areaPath" fill="url(#areaGrad)"/>
          <path :d="chart.linePath" stroke="#1E40AF" stroke-width="2" fill="none"/>

          <!-- Points -->
          <circle
            v-for="(p, i) in chart.points"
            :key="`pt${i}`"
            :cx="p.x" :cy="p.y"
            :r="hover === p ? 5 : 3"
            fill="#1E40AF"
            :stroke="hover === p ? '#FFFFFF' : 'none'"
            stroke-width="2"
          />

          <!-- X labels -->
          <text
            v-for="(t, i) in chart.xTicks"
            :key="`x${i}`"
            :x="t.x" :y="chartH - 8"
            text-anchor="middle" font-size="10" fill="#64748B"
          >{{ t.label }}</text>

          <!-- Hover line -->
          <line
            v-if="hover"
            :x1="hover.x" :x2="hover.x"
            :y1="padT" :y2="chartH - padB"
            stroke="#1E40AF" stroke-width="1" stroke-dasharray="3 3"
          />
        </svg>

        <!-- Hover tooltip -->
        <div
          v-if="hover"
          class="absolute bg-navy-900 text-white px-3 py-2 rounded-lg text-xs pointer-events-none shadow-pop"
          :style="{
            left: `calc(${(hover.x / chartW) * 100}% - 60px)`,
            top: `${(hover.y / chartH) * 100}%`,
            transform: 'translateY(-110%)',
            minWidth: '120px',
          }"
        >
          <div class="font-mono text-[10px] text-slate-300">{{ formatBucket(hover.bucket) }}</div>
          <div class="font-bold text-amber-500 tabular-nums">{{ formatVND(hover.revenue) }}</div>
          <div class="text-[10px] text-slate-300">{{ hover.order_count }} đơn</div>
        </div>
      </div>
    </div>

    <!-- Top KH + SKU mix -->
    <div class="grid lg:grid-cols-2 gap-5">
      <!-- Top KH -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold text-ink-primary">Top khách hàng theo doanh số</div>
        </div>
        <div v-if="loading && !topCustomers.length" class="space-y-2">
          <div v-for="i in 5" :key="i" class="h-12 bg-surface-soft rounded-input animate-pulse"></div>
        </div>
        <div v-else-if="topCustomers.length === 0" class="text-center text-sm text-ink-secondary py-8">
          Chưa có giao dịch trong kỳ
        </div>
        <ul v-else class="space-y-1">
          <li
            v-for="(c, idx) in topCustomers"
            :key="c.id"
            class="flex items-center gap-3 py-2 hover:bg-surface-soft rounded-input px-2 -mx-2 transition"
          >
            <div
              class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
              :class="
                idx === 0 ? 'bg-amber-500' :
                idx === 1 ? 'bg-slate-400' :
                idx === 2 ? 'bg-orange-700' :
                'bg-royal-700'
              "
            >
              {{ idx + 1 }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-ink-primary truncate">
                {{ c.full_name }}
                <span v-if="c.policy_tier" class="ml-1 text-[10px] text-ink-secondary">· {{ tierLabel(c.policy_tier) }}</span>
              </div>
              <div class="text-[11px] text-ink-secondary truncate">
                <span v-if="c.store_name">{{ c.store_name }}</span>
                <span v-else-if="c.customer_type">{{ customerTypeLabel(c.customer_type) }}</span>
                <span v-if="c.province"> · {{ c.province }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-bold text-royal-700 tabular-nums">{{ formatVNDShort(c.revenue) }}</div>
              <div class="text-[11px] text-ink-secondary">{{ c.order_count }} đơn</div>
            </div>
          </li>
        </ul>
      </div>

      <!-- SKU mix -->
      <div class="bg-white border border-line-200 rounded-card p-5 shadow-card">
        <div class="flex items-center justify-between mb-3">
          <div class="text-sm font-semibold text-ink-primary">Cơ cấu doanh số</div>
          <div class="flex bg-surface-soft rounded-input p-0.5 text-xs">
            <button
              @click="skuGroupBy = 'brand'"
              class="px-3 py-1 rounded-input transition"
              :class="skuGroupBy === 'brand' ? 'bg-white text-ink-primary shadow-card font-semibold' : 'text-ink-secondary'"
            >
              Brand
            </button>
            <button
              @click="skuGroupBy = 'product'"
              class="px-3 py-1 rounded-input transition"
              :class="skuGroupBy === 'product' ? 'bg-white text-ink-primary shadow-card font-semibold' : 'text-ink-secondary'"
            >
              Sản phẩm
            </button>
          </div>
        </div>

        <div v-if="loading && !skuMix.items.length" class="space-y-2">
          <div v-for="i in 5" :key="i" class="h-10 bg-surface-soft rounded-input animate-pulse"></div>
        </div>
        <div v-else-if="skuMix.items.length === 0" class="text-center text-sm text-ink-secondary py-8">
          Chưa có dữ liệu trong kỳ
        </div>
        <ul v-else class="space-y-2.5">
          <li v-for="(it, idx) in skuMix.items" :key="it.key">
            <div class="flex items-center justify-between text-xs mb-1">
              <div class="font-medium text-ink-primary truncate flex-1 min-w-0">
                <span class="text-ink-disabled mr-1 tabular-nums">{{ String(idx + 1).padStart(2, '0') }}</span>
                {{ it.label }}
              </div>
              <div class="flex items-baseline gap-2 shrink-0">
                <span class="text-ink-secondary tabular-nums">{{ formatVNDShort(it.revenue) }}</span>
                <span class="font-bold text-royal-700 tabular-nums">{{ it.share_pct.toFixed(1) }}%</span>
              </div>
            </div>
            <div class="h-1.5 bg-surface-soft rounded-full overflow-hidden">
              <div
                class="h-full bg-royal-700 rounded-full transition-all"
                :style="{ width: `${Math.max(2, it.share_pct)}%` }"
              ></div>
            </div>
          </li>
        </ul>
        <div v-if="skuMix.items.length" class="mt-3 pt-3 border-t border-line-200 text-[11px] text-ink-secondary text-right">
          Tổng: {{ formatVND(skuMix.total_revenue) }}
        </div>
      </div>
    </div>
  </div>
</template>
