<template>
  <v-card>
    <v-card-title class="text-body-1">Pipeline B2B</v-card-title>
    <v-card-text>
      <div v-if="chartData" style="position: relative; height: 250px;"><Doughnut :data="chartData" :options="chartOptions" /></div>
      <div v-else class="text-center pa-8 text-grey">Không có dữ liệu</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Doughnut } from 'vue-chartjs';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const props = defineProps<{
  data: { status: string | null; count: number }[];
}>();

const stageLabels: Record<string, string> = {
  tiep_can: 'Tiếp cận',
  da_bao_gia: 'Đã báo giá',
  dang_thu_hang: 'Đang thử hàng',
  dai_ly_chinh_thuc: 'Đại lý chính thức',
  ngung: 'Ngừng hợp tác',
};

const stageColors: Record<string, string> = {
  tiep_can: '#9E9E9E',
  da_bao_gia: '#42A5F5',
  dang_thu_hang: '#FFB74D',
  dai_ly_chinh_thuc: '#66BB6A',
  ngung: '#EF5350',
};

const chartData = computed(() => {
  if (!props.data?.length) return null;
  const filtered = props.data.filter((d) => d.status);
  if (!filtered.length) return null;
  return {
    labels: filtered.map((d) => stageLabels[d.status || ''] || d.status),
    datasets: [
      {
        data: filtered.map((d) => Number(d.count)),
        backgroundColor: filtered.map(
          (d) => stageColors[d.status || ''] || '#BDBDBD',
        ),
      },
    ],
  };
});

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: 'right' as const, labels: { boxWidth: 12 } } },
};
</script>
