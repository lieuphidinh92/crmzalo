<template>
  <v-card class="pa-4 h-100">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-chart-line" color="primary" class="mr-2" />
      <div class="text-h6">Doanh số resale theo tuần</div>
    </div>
    <Line v-if="chartData" :data="chartData" :options="chartOptions" style="height: 280px;" />
    <div v-else class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-chart-line-variant</v-icon>
      <div class="mt-2">Chưa có dữ liệu</div>
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
} from 'chart.js';

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
  weekly: Array<{ weekStart: string; revenue: number }>;
}

const props = defineProps<Props>();

const chartData = computed(() => {
  if (!props.weekly?.length) return null;
  // Skip rendering if every bucket is zero so we can show empty state.
  const nonZero = props.weekly.some((w) => w.revenue > 0);
  if (!nonZero) return null;
  return {
    labels: props.weekly.map((w) => labelForWeek(w.weekStart)),
    datasets: [
      {
        label: 'Doanh số (VND)',
        data: props.weekly.map((w) => w.revenue),
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#F59E0B',
        pointRadius: 3,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number } }) =>
          new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed.y),
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
          if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
          return n.toString();
        },
      },
      grid: { color: 'rgba(184, 197, 214, 0.08)' },
    },
    x: { grid: { display: false } },
  },
};

function labelForWeek(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
</script>
