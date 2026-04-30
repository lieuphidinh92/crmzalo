<template>
  <v-row dense>
    <!-- DS Resale tháng -->
    <v-col cols="12" sm="6" lg="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-cash-multiple" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">DS Resale tháng</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(kpi?.resaleRevenue.value) }}
        </div>
        <v-progress-linear
          v-if="kpi && kpi.resaleRevenue.monthlyTarget > 0"
          :model-value="Math.min(kpi.resaleRevenue.percentOfTarget, 100)"
          color="primary"
          height="4"
          rounded
          class="mt-1"
        />
        <div class="text-caption mt-1" :class="trendColor(kpi?.resaleRevenue.trend)">
          <v-icon size="14">{{ trendIcon(kpi?.resaleRevenue.trend) }}</v-icon>
          {{ formatTrend(kpi?.resaleRevenue.trend) }}
          <span class="text-medium-emphasis">vs tháng trước</span>
        </div>
      </v-card>
    </v-col>

    <!-- Đại lý mới chốt -->
    <v-col cols="12" sm="6" lg="3">
      <v-card
        class="pa-4 h-100 cursor-pointer"
        @click="$emit('open-pipeline', 'dai_ly_chinh_thuc')"
      >
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-plus-outline" color="success" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đại lý mới chốt</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ kpi ? kpi.newClosed.count : '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Tháng này
        </div>
      </v-card>
    </v-col>

    <!-- Pipeline đang xử lý -->
    <v-col cols="12" sm="6" lg="3">
      <v-card
        class="pa-4 h-100 cursor-pointer"
        @click="$emit('open-pipeline')"
      >
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-pipe" color="warning" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Pipeline đang xử lý</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ kpi ? kpi.pipeline.dealCount : '—' }}
          <span class="text-body-2 text-medium-emphasis">deal</span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ formatVNDShort(kpi?.pipeline.totalValue) }} tiềm năng
        </div>
      </v-card>
    </v-col>

    <!-- Score tuân thủ -->
    <v-col cols="12" sm="6" lg="3">
      <v-tooltip
        text="Bao gồm tốc độ phản hồi Zalo, cập nhật ghi chú, đúng quy trình, dùng AI Insight đúng lúc"
        location="top"
      >
        <template #activator="{ props: tipProps }">
          <v-card v-bind="tipProps" class="pa-4 h-100">
            <div class="d-flex align-center mb-1">
              <v-icon icon="mdi-shield-check-outline" :color="scoreColor(kpi?.complianceScore.value ?? 0)" class="mr-2" />
              <div class="text-caption text-medium-emphasis">Score tuân thủ</div>
            </div>
            <div
              class="text-h5 font-weight-bold"
              :style="{ color: scoreColorHex(kpi?.complianceScore.value ?? 0) }"
            >
              {{ kpi ? Math.round(kpi.complianceScore.value) : '—' }}
              <span class="text-body-2 text-medium-emphasis">/ 100</span>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
              Hover để xem cách tính
            </div>
          </v-card>
        </template>
      </v-tooltip>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type PersonalKpi,
} from '@/composables/use-personal-dashboard';

interface Props {
  kpi: PersonalKpi | null;
}
defineProps<Props>();
defineEmits<{
  (e: 'open-pipeline', stage?: string): void;
}>();

function trendIcon(t: number | undefined): string {
  if (t == null) return 'mdi-minus';
  if (t > 5) return 'mdi-trending-up';
  if (t < -5) return 'mdi-trending-down';
  return 'mdi-minus';
}

function trendColor(t: number | undefined): string {
  if (t == null) return 'text-medium-emphasis';
  if (t > 5) return 'text-success';
  if (t < -5) return 'text-error';
  return 'text-medium-emphasis';
}

function formatTrend(t: number | undefined): string {
  if (t == null) return '—';
  return (t > 0 ? '+' : '') + t.toFixed(0) + '%';
}

function scoreColor(s: number): string {
  if (s >= 80) return 'success';
  if (s >= 60) return 'warning';
  return 'error';
}

function scoreColorHex(s: number): string {
  if (s >= 80) return '#10B981';
  if (s >= 60) return '#F59E0B';
  return '#EF4444';
}
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: border-color 0.15s, transform 0.12s;
}
.cursor-pointer:hover {
  transform: translateY(-1px);
}
</style>
