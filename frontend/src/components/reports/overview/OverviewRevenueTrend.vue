<template>
  <v-card class="trend-card pa-3" variant="flat">
    <header class="trend-head">
      <div>
        <div class="d-flex align-center">
          <v-icon icon="mdi-chart-line" color="primary" size="18" class="mr-2" />
          <span class="trend-title">Doanh số 12 tháng</span>
        </div>
        <div class="trend-sub">Đỉnh + đáy tự động đánh dấu</div>
      </div>
      <div class="filter-chips">
        <button
          v-for="opt in OPTIONS"
          :key="opt.value"
          type="button"
          :class="['chip', activeGroup === opt.value && 'chip--active']"
          @click="onGroupClick(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </header>

    <div v-if="loading" class="chart-skeleton" />
    <div v-else-if="!hasData" class="empty-state">
      <v-icon size="40" color="grey-darken-1">mdi-chart-line-variant</v-icon>
      <div class="mt-2">Chưa có doanh số 12 tháng gần đây</div>
    </div>
    <div v-else class="chart-box">
      <Line :data="chartData" :options="chartOptions" />
      <div v-if="peak" class="peak-annotation" :style="peakStyle">
        📈 Đỉnh {{ peak.label }}: {{ formatVNDShort(peak.value) }}
      </div>
    </div>

    <footer v-if="data?.target" class="target-foot">
      <span class="dash" />
      Mục tiêu/tháng (YTD ÷ 12): {{ formatVNDShort(data.target) }}
    </footer>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import {
  formatVNDShort,
  type RevenueTrendResponse,
  type TrendGroupBy,
} from '@/composables/use-overview-report';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  Legend,
);

interface Props {
  data: RevenueTrendResponse | null;
  loading: boolean;
  activeGroup: TrendGroupBy;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'change-group', g: TrendGroupBy): void;
}>();

const OPTIONS: ReadonlyArray<{ value: TrendGroupBy; label: string }> = [
  { value: 'total', label: 'Tổng' },
  { value: 'customer_type', label: 'Theo loại KH' },
  { value: 'brand', label: 'Theo brand' },
];

const SERIES_COLORS = ['#F97316', '#10B981', '#3B82F6', '#A855F7', '#EAB308', '#06B6D4'];

const hasData = computed(
  () =>
    !!props.data?.series?.length &&
    props.data.series.some((s) => s.values.some((v) => v > 0)),
);

function fmtMonth(ym: string): string {
  // 'YYYY-MM' → 'MM/YY'
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
}

const chartData = computed(() => {
  const d = props.data;
  if (!d) return { labels: [], datasets: [] };
  const labels = d.buckets.map(fmtMonth);
  const datasets: Array<Record<string, unknown>> = d.series.map((s, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length];
    const isTotal = props.activeGroup === 'total';
    return {
      label: s.label,
      data: s.values,
      borderColor: color,
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 2,
      pointHoverRadius: 4,
      pointBackgroundColor: color,
      // For 'total' single-series we paint the gradient fill below the
      // line for the "DS dashboard" look. Multi-series stays unfilled
      // so colors don't muddy.
      fill: isTotal ? 'origin' : false,
      backgroundColor: isTotal
        ? (ctx: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
            const { ctx: c, chartArea } = ctx.chart;
            if (!chartArea) return 'rgba(249,115,22,0.15)';
            const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, 'rgba(249,115,22,0.35)');
            grad.addColorStop(1, 'rgba(249,115,22,0)');
            return grad;
          }
        : color,
    };
  });

  // Optional dashed target line on `total` only
  if (props.activeGroup === 'total' && d.target) {
    datasets.push({
      label: 'Mục tiêu',
      data: new Array(labels.length).fill(d.target),
      borderColor: 'rgba(148,163,184,0.55)',
      borderWidth: 1.5,
      borderDash: [6, 6],
      pointRadius: 0,
      fill: false,
      tension: 0,
    });
  }
  return { labels, datasets };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: {
      display: props.activeGroup !== 'total',
      position: 'top' as const,
      labels: { color: 'rgba(248,250,252,0.85)', boxWidth: 10, font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: 'rgba(15,23,42,0.94)',
      borderColor: 'rgba(148,163,184,0.18)',
      borderWidth: 1,
      titleColor: '#F8FAFC',
      bodyColor: '#F8FAFC',
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) =>
          `${ctx.dataset.label ?? ''}: ${new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748B', font: { size: 10 } },
    },
    y: {
      grid: { color: 'rgba(148,163,184,0.06)' },
      ticks: {
        color: '#64748B',
        font: { size: 10 },
        callback: (val: string | number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'tỷ';
          if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'tr';
          return n.toString();
        },
      },
    },
  },
}));

/** Find the peak month in the first (primary) series for the annotation. */
const peak = computed(() => {
  const s0 = props.data?.series?.[0];
  if (!s0 || !s0.values.length) return null;
  let maxIdx = 0;
  for (let i = 1; i < s0.values.length; i++) {
    if (s0.values[i] > s0.values[maxIdx]) maxIdx = i;
  }
  if (s0.values[maxIdx] === 0) return null;
  return {
    index: maxIdx,
    value: s0.values[maxIdx],
    label: fmtMonth(props.data!.buckets[maxIdx]),
  };
});

/** Position the annotation roughly above the peak point (% of x). */
const peakStyle = computed(() => {
  if (!peak.value || !props.data) return {};
  const pct = (peak.value.index / Math.max(1, props.data.buckets.length - 1)) * 100;
  // Clamp so the badge doesn't bleed off-card on the edges
  const left = Math.max(8, Math.min(85, pct));
  return { left: `${left}%` };
});

function onGroupClick(g: TrendGroupBy) {
  if (g === props.activeGroup) return;
  emit('change-group', g);
}
</script>

<style scoped>
.trend-card {
  background: #1E293B !important;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.06);
}

.trend-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.trend-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #F8FAFC;
}
.trend-sub {
  font-size: 0.7rem;
  color: #64748B;
  margin-top: 2px;
}

.filter-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.chip {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: transparent;
  color: #94A3B8;
  font-size: 0.72rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.chip:hover { color: #F8FAFC; border-color: rgba(245, 158, 11, 0.4); }
.chip--active {
  background: #F97316;
  border-color: #F97316;
  color: #fff;
}

.chart-box {
  position: relative;
  height: 240px;
  width: 100%;
}
@media (min-width: 900px) {
  .chart-box { height: 280px; }
}

.peak-annotation {
  position: absolute;
  top: 4px;
  transform: translateX(-50%);
  background: rgba(249, 115, 22, 0.94);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.target-foot {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  color: #94A3B8;
}
.dash {
  display: inline-block;
  width: 18px;
  height: 0;
  border-top: 1.5px dashed rgba(148, 163, 184, 0.6);
}

.chart-skeleton {
  height: 240px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.06) 0%,
    rgba(148, 163, 184, 0.14) 50%,
    rgba(148, 163, 184, 0.06) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.empty-state {
  text-align: center;
  padding: 40px 12px;
  color: #94A3B8;
}
</style>
