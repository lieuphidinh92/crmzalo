<template>
  <v-card class="pa-4">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-chart-bar-stacked" color="primary" class="mr-2" />
      <div class="text-h6">Pareto — Top 20 đại lý gánh DS YTD</div>
      <v-spacer />
      <v-chip
        v-if="pareto"
        size="small"
        variant="tonal"
        color="warning"
        prepend-icon="mdi-alert-circle-outline"
      >
        {{ pareto.agentsFor80Percent }} đại lý chiếm 80% DS
      </v-chip>
    </div>

    <div v-if="chartData" class="chart-box">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
    <div v-else class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-chart-line-variant</v-icon>
      <div class="mt-2">Chưa có dữ liệu YTD</div>
    </div>

    <v-divider class="my-4" />

    <v-table density="comfortable" hover>
      <thead>
        <tr>
          <th>#</th>
          <th>Đại lý</th>
          <th>Loại</th>
          <th>Sale</th>
          <th class="text-right">DS YTD</th>
          <th class="text-right">% đóng góp</th>
          <th class="text-center">Health</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in pareto?.rows ?? []"
          :key="row.contactId"
        >
          <td>
            <v-chip
              v-if="row.rank <= 3"
              size="x-small"
              :color="['warning', 'grey', 'orange'][row.rank - 1]"
              variant="flat"
            >{{ row.rank }}</v-chip>
            <span v-else class="text-medium-emphasis">{{ row.rank }}</span>
          </td>
          <td>
            <div class="font-weight-medium">{{ row.fullName || '(không tên)' }}</div>
            <div v-if="row.storeName" class="text-caption text-medium-emphasis">
              {{ row.storeName }}
            </div>
          </td>
          <td>
            <v-chip v-if="row.customerType" size="x-small" variant="tonal" color="info">
              {{ customerTypeLabel(row.customerType) }}
            </v-chip>
            <span v-else class="text-medium-emphasis">—</span>
          </td>
          <td class="text-medium-emphasis">{{ row.assignedUser?.fullName ?? '—' }}</td>
          <td class="text-right font-weight-medium">{{ formatVNDShort(row.ytdRevenue) }}</td>
          <td class="text-right">{{ row.contributionPercent.toFixed(1) }}%</td>
          <td class="text-center">
            <v-chip
              :color="healthColor(row.health)"
              size="x-small"
              variant="flat"
            >
              {{ healthLabel(row.health) }}
            </v-chip>
          </td>
        </tr>
        <tr v-if="!pareto?.rows.length">
          <td colspan="7" class="text-center pa-6 text-medium-emphasis">
            Chưa có order nào trong năm nay.
          </td>
        </tr>
      </tbody>
    </v-table>
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
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import {
  customerTypeLabel,
  formatVNDShort,
  type ParetoResponse,
} from '@/composables/use-ceo-dashboard';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

interface Props {
  pareto: ParetoResponse | null;
}

const props = defineProps<Props>();

const chartData = computed(() => {
  if (!props.pareto?.rows.length) return null;
  const labels = props.pareto.rows.map((r) =>
    truncate(r.fullName ?? `#${r.rank}`, 16),
  );
  return {
    labels,
    datasets: [
      {
        type: 'bar' as const,
        label: 'DS YTD',
        data: props.pareto.rows.map((r) => r.ytdRevenue),
        backgroundColor: '#F59E0B',
        borderRadius: 4,
        order: 2,
        yAxisID: 'y',
      },
      {
        type: 'line' as const,
        label: '% Cumulative',
        data: props.pareto.rows.map((r) => r.cumulativePercent),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        tension: 0.25,
        fill: false,
        pointRadius: 3,
        order: 1,
        yAxisID: 'y2',
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  plugins: {
    legend: { position: 'top' as const, labels: { boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) => {
          const label = ctx.dataset.label ?? '';
          if (label.includes('%'))
            return `${label}: ${ctx.parsed.y.toFixed(1)}%`;
          return `${label}: ${new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed.y)}`;
        },
      },
    },
  },
  scales: {
    y: {
      type: 'linear' as const,
      position: 'left' as const,
      title: { display: true, text: 'DS YTD (VND)' },
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
    y2: {
      type: 'linear' as const,
      position: 'right' as const,
      title: { display: true, text: '% Cumulative' },
      min: 0,
      max: 100,
      ticks: { callback: (v: string | number) => `${v}%` },
      grid: { drawOnChartArea: false },
    },
    x: { grid: { display: false } },
  },
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function healthLabel(h: string): string {
  if (h === 'active') return 'Active';
  if (h === 'at_risk') return 'At-risk';
  if (h === 'churned') return 'Churned';
  return '—';
}

function healthColor(h: string): string {
  if (h === 'active') return 'success';
  if (h === 'at_risk') return 'warning';
  if (h === 'churned') return 'error';
  return 'grey';
}
</script>

<style scoped>
/* Chart.js with responsive:true + maintainAspectRatio:false reads its
   parent element for sizing. The parent MUST have explicit dimensions +
   position:relative — otherwise the canvas grows unbounded and the
   browser hangs trying to allocate millions of pixels. */
.chart-box {
  position: relative;
  height: 320px;
  width: 100%;
}
</style>
