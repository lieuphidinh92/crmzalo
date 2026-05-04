<template>
  <v-card class="pa-4 h-100">
    <div class="d-flex align-center mb-3">
      <v-icon icon="mdi-chart-pie" color="primary" class="mr-2" />
      <div class="text-h6">Tỷ trọng DS theo loại đại lý</div>
    </div>
    <div v-if="chartData" style="position: relative; height: 280px;"><Doughnut :data="chartData" :options="chartOptions" /></div>
    <div v-else class="text-center pa-8 text-medium-emphasis">
      <v-icon size="48" color="grey-darken-1">mdi-chart-pie-outline</v-icon>
      <div class="mt-2">Chưa có dữ liệu</div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Props {
  typeShare: Array<{ customerType: string | null; revenue: number }>;
}

const TYPE_LABELS: Record<string, string> = {
  nha_thuoc: 'Nhà thuốc',
  si_online: 'Sỉ online',
  duoc_si: 'Dược sĩ',
  cua_hang_me_be: 'Mẹ bé',
};

const TYPE_COLORS: Record<string, string> = {
  nha_thuoc: '#F59E0B',
  si_online: '#3B82F6',
  duoc_si: '#10B981',
  cua_hang_me_be: '#EF4444',
};

const props = defineProps<Props>();

const chartData = computed(() => {
  if (!props.typeShare?.length) return null;
  const filtered = props.typeShare.filter((t) => t.revenue > 0);
  if (filtered.length === 0) return null;
  return {
    labels: filtered.map((t) =>
      t.customerType ? TYPE_LABELS[t.customerType] ?? t.customerType : 'Chưa phân loại',
    ),
    datasets: [
      {
        data: filtered.map((t) => t.revenue),
        backgroundColor: filtered.map((t) =>
          t.customerType ? TYPE_COLORS[t.customerType] ?? '#7A8AA0' : '#7A8AA0',
        ),
        borderWidth: 0,
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { boxWidth: 12 } },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: number; label: string }) => {
          const formatted = new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
          }).format(ctx.parsed);
          return `${ctx.label}: ${formatted}`;
        },
      },
    },
  },
};
</script>
