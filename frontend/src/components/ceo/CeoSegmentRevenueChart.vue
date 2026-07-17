<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-chart-bar" color="primary" class="mr-2" />
      <div class="text-h6">DS theo loại đại lý — 12 tháng</div>
    </div>

    <div v-if="chartData" class="chart-box">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
    <div v-else class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-chart-bar</v-icon>
      <div class="mt-2">Chưa có order nào trong 12 tháng gần đây</div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import {
  customerTypeLabel,
  CUSTOMER_TYPE_COLORS,
  type SegmentMonthRow,
} from '@/composables/use-ceo-dashboard';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Props {
  segments: SegmentMonthRow[];
}

const props = defineProps<Props>();

const chartData = computed(() => {
  if (!props.segments.length) return null;
  // Discover which customer types appeared in any month so the legend
  // is stable across the period.
  const typeSet = new Set<string>();
  for (const m of props.segments) {
    for (const k of Object.keys(m.byType)) typeSet.add(k);
  }
  if (typeSet.size === 0) return null;
  const types = [...typeSet];

  const labels = props.segments.map((s) => formatMonth(s.month));
  return {
    labels,
    datasets: types.map((t) => ({
      label: customerTypeLabel(t === 'unknown' ? null : t) || 'Chưa phân loại',
      data: props.segments.map((s) => s.byType[t] ?? 0),
      backgroundColor: CUSTOMER_TYPE_COLORS[t] ?? CUSTOMER_TYPE_COLORS.unknown,
      stack: 'revenue',
      borderRadius: 4,
    })),
  } as ChartData<'bar'>;
});

const chartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const, labels: { boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) =>
          `${ctx.dataset.label ?? ''}: ${new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed.y ?? 0)}`,
      },
    },
  },
  scales: {
    x: { stacked: true, grid: { display: false } },
    y: {
      stacked: true,
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
  },
};

function formatMonth(ym: string): string {
  // 'YYYY-MM' → 'MM/YY' for compact x-axis labels.
  const [y, m] = ym.split('-');
  return `${m}/${y.slice(2)}`;
}
</script>

<style scoped>
.chart-box {
  position: relative;
  height: 320px;
  width: 100%;
}
</style>
