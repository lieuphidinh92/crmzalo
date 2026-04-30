<template>
  <v-row dense>
    <!-- 1. Doanh số tháng -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-cash-multiple" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">DS tháng này</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(kpi?.monthRevenue.value) }}
        </div>
        <div class="text-caption mt-1" :class="trendColor(kpi?.monthRevenue.trend)">
          <v-icon size="14">{{ trendIcon(kpi?.monthRevenue.trend) }}</v-icon>
          {{ formatTrend(kpi?.monthRevenue.trend) }} vs tháng trước
        </div>
      </v-card>
    </v-col>

    <!-- 2. YTD -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-calendar-month" color="info" class="mr-2" />
          <div class="text-caption text-medium-emphasis">DS YTD</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(kpi?.ytdRevenue.value) }}
        </div>
        <div class="text-caption mt-1 text-medium-emphasis">
          <span v-if="kpi && kpi.ytdRevenue.goal > 0">
            {{ kpi.ytdRevenue.percentOfGoal.toFixed(0) }}% mục tiêu
            ({{ formatVNDShort(kpi.ytdRevenue.goal) }})
          </span>
          <span v-else>Chưa cấu hình mục tiêu năm</span>
        </div>
        <v-progress-linear
          v-if="kpi && kpi.ytdRevenue.goal > 0"
          :model-value="Math.min(kpi.ytdRevenue.percentOfGoal, 100)"
          color="primary"
          height="4"
          rounded
          class="mt-1"
        />
      </v-card>
    </v-col>

    <!-- 3. Đại lý active -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-check-outline" color="success" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đại lý active</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ kpi ? kpi.agents.active : '—' }}
          <span class="text-body-2 text-medium-emphasis">/ {{ kpi?.agents.total ?? '—' }}</span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ kpi ? kpi.agents.ratio.toFixed(0) : '—' }}% có order trong 30 ngày
        </div>
      </v-card>
    </v-col>

    <!-- 4. Chốt mới -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-plus-outline" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đại lý mới chốt</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ kpi ? kpi.newClosed.count : '—' }}
        </div>
        <div class="text-caption mt-1" :class="trendColor(kpi?.newClosed.trend)">
          <v-icon size="14">{{ trendIcon(kpi?.newClosed.trend) }}</v-icon>
          {{ formatTrend(kpi?.newClosed.trend) }} vs tháng trước
        </div>
      </v-card>
    </v-col>

    <!-- 5. Churn -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card
        class="pa-4 h-100"
        :class="{ 'kpi-card-alert': kpi?.churned.alert }"
      >
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-cancel-outline" color="error" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đại lý churn</div>
        </div>
        <div
          class="text-h5 font-weight-bold"
          :style="{ color: kpi?.churned.alert ? '#EF4444' : undefined }"
        >
          {{ kpi ? kpi.churned.count : '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ kpi ? kpi.churned.ratio.toFixed(1) : '—' }}% tổng đại lý
          <span v-if="kpi?.churned.alert" style="color: #EF4444; font-weight: 600;">
            ⚠ Cao
          </span>
        </div>
      </v-card>
    </v-col>

    <!-- 6. Pipeline value -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-pipe" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Pipeline value</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(kpi?.pipelineValue) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Deal đang xử lý
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  formatVNDShort,
  type CeoKpi,
} from '@/composables/use-ceo-dashboard';

interface Props {
  kpi: CeoKpi | null;
}
defineProps<Props>();

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
  const sign = t > 0 ? '+' : '';
  return `${sign}${t.toFixed(0)}%`;
}
</script>

<style scoped>
.kpi-card-alert {
  border-left: 3px solid #EF4444;
}
</style>
