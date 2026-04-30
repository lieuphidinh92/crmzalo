<template>
  <v-row dense>
    <v-col cols="12" sm="6" md="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-cash-multiple" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Tổng pipeline value</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(metrics?.totalPipelineValue) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Deal đang xử lý (3 stage active)
        </div>
      </v-card>
    </v-col>

    <v-col cols="12" sm="6" md="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-target" color="success" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Conversion rate</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ metrics ? metrics.conversionRate.rate.toFixed(1) : '—' }}%
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ metrics?.conversionRate.converted ?? '—' }} /
          {{ metrics?.conversionRate.total ?? '—' }} deal
          → đại lý chính thức
        </div>
      </v-card>
    </v-col>

    <v-col cols="12" sm="6" md="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-timer-sand" color="info" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Thời gian TB chốt</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ metrics ? Math.round(metrics.avgClosingDays.days) : '—' }}
          <span class="text-body-2 text-medium-emphasis">ngày</span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ metrics?.avgClosingDays.sample ?? 0 }} mẫu
        </div>
      </v-card>
    </v-col>

    <v-col cols="12" sm="6" md="3">
      <v-card class="pa-4 h-100" :class="{ 'nds-card-danger': stuckDanger }">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-alert-octagon-outline" color="error" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Deal đang nghẽn</div>
        </div>
        <div
          class="text-h5 font-weight-bold"
          :style="{ color: stuckDanger ? '#EF4444' : undefined }"
        >
          {{ metrics?.stuckCount ?? '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Đứng yên >14 ngày
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatVNDShort, type PipelineMetrics } from '@/composables/use-pipeline';

interface Props {
  metrics: PipelineMetrics | null;
}

const props = defineProps<Props>();
const stuckDanger = computed(() => (props.metrics?.stuckCount ?? 0) > 0);
</script>

<style scoped>
.nds-card-danger {
  border-left: 3px solid #EF4444;
}
</style>
