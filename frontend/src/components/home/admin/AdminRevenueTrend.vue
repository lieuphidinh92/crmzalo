<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3 flex-wrap gap-2">
      <v-icon icon="mdi-chart-line" color="primary" class="mr-2" />
      <div class="text-h6">Doanh số 12 tháng gần nhất</div>
      <v-spacer />
      <v-btn-toggle
        :model-value="groupBy"
        @update:model-value="$emit('change-group', $event)"
        density="compact"
        variant="outlined"
        divided
        mandatory
      >
        <v-btn value="total" size="small">Tổng</v-btn>
        <v-btn value="type" size="small">Theo loại</v-btn>
        <v-btn value="source" size="small">Theo nguồn</v-btn>
      </v-btn-toggle>
    </div>

    <v-progress-linear v-if="trendLoading" indeterminate color="primary" class="mb-2" />

    <div v-if="chartData" style="position: relative; height: 300px;">
      <Line :data="chartData" :options="chartOptions" /></div>
    <div v-else class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-chart-line-variant</v-icon>
      <div class="mt-2">Chưa có order nào trong 12 tháng gần đây</div>
    </div>
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
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import {
  customerTypeLabel,
  type RevenueTrendResponse,
  type RevenueGroupBy,
} from '@/composables/use-admin-dashboard';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

interface Props {
  data: RevenueTrendResponse | null;
  groupBy: RevenueGroupBy;
  trendLoading: boolean;
}

const props = defineProps<Props>();
defineEmits<{ (e: 'change-group', g: RevenueGroupBy): void }>();

const SERIES_COLORS = [
  '#F59E0B', '#3B82F6', '#10B981', '#EF4444',
  '#8B5CF6', '#EC4899', '#7A8AA0',
];

const SOURCE_LABELS: Record<string, string> = {
  zalo: 'Zalo',
  facebook: 'Facebook',
  gioi_thieu: 'Giới thiệu',
  khac: 'Khác',
  unknown: 'Chưa rõ',
};

function seriesLabel(key: string): string {
  if (props.groupBy === 'type') {
    return customerTypeLabel(key === 'unknown' ? null : key) || 'Chưa phân loại';
  }
  if (props.groupBy === 'source') return SOURCE_LABELS[key] ?? key;
  return 'Tổng doanh số';
}

const chartData = computed(() => {
  if (!props.data?.rows.length) return null;
  const hasAny = props.data.rows.some((r) =>
    Object.values(r.series).some((v) => v > 0),
  );
  if (!hasAny) return null;

  return {
    labels: props.data.rows.map((r) => formatMonth(r.month)),
    datasets: props.data.series.map((s, i) => ({
      label: seriesLabel(s),
      data: props.data!.rows.map((r) => r.series[s] ?? 0),
      borderColor: SERIES_COLORS[i % SERIES_COLORS.length],
      backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] + '22',
      tension: 0.3,
      fill: props.groupBy === 'total',
      pointRadius: 3,
    })),
  } as ChartData<'line'>;
});

const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const, labels: { boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) =>
          `${ctx.dataset.label ?? ''}: ${new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    y: {
      ticks: {
        callback: (val: string | number) => {
          const n = typeof val === 'number' ? val : Number(val);
          if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ';
          if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + ' tr';
          return n.toString();
        },
      },
      grid: { color: 'rgba(184, 197, 214, 0.08)' },
    },
    x: { grid: { display: false } },
  },
};

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
}
</script>
