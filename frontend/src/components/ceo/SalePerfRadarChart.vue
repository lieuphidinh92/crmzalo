<template>
  <div v-if="chartData" class="chart-box">
    <Radar :data="chartData" :options="chartOptions" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Radar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  METRIC_LABELS,
  type MetricKey,
  type SaleMetrics,
} from '@/composables/use-sale-performance';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

interface Props {
  sale: SaleMetrics;
}

const props = defineProps<Props>();

const ORDER: MetricKey[] = [
  'resale_revenue',
  'active_rate',
  'new_agents',
  'conversion_rate',
  'retention_90d',
  'compliance_score',
];

const chartData = computed(() => ({
  labels: ORDER.map((k) => METRIC_LABELS[k]),
  datasets: [
    {
      label: props.sale.saleName,
      data: ORDER.map((k) => props.sale.normalized[k]),
      backgroundColor: 'rgba(245, 158, 11, 0.25)',
      borderColor: '#F59E0B',
      pointBackgroundColor: '#F59E0B',
      pointBorderColor: '#fff',
      borderWidth: 2,
    },
  ],
}));

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    r: {
      min: 0,
      max: 100,
      ticks: { stepSize: 25, color: 'rgba(184,197,214,0.6)' },
      grid: { color: 'rgba(184,197,214,0.15)' },
      angleLines: { color: 'rgba(184,197,214,0.15)' },
      pointLabels: { color: 'rgba(184,197,214,0.9)', font: { size: 11 } },
    },
  },
};
</script>

<style scoped>
.chart-box {
  position: relative;
  height: 280px;
  width: 100%;
}
</style>
