<template>
  <v-row dense>
    <!-- 1. Đại lý active -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-check-outline" color="success" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đại lý active</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ overview ? overview.activeAgents.count : '—' }}
          <span class="text-body-2 text-medium-emphasis">/ {{ overview?.activeAgents.total ?? '—' }}</span>
        </div>
        <div class="d-flex align-center mt-1" style="gap: 6px;">
          <v-chip size="x-small" variant="tonal" color="success">
            {{ overview ? overview.activeAgents.percent.toFixed(0) : '—' }}%
          </v-chip>
          <span
            v-if="overview"
            class="text-caption"
            :class="trendColor(overview.activeAgents.trend)"
          >
            <v-icon size="14">{{ trendIcon(overview.activeAgents.trend) }}</v-icon>
            {{ overview.activeAgents.trend > 0 ? '+' : '' }}{{ overview.activeAgents.trend.toFixed(0) }}%
          </span>
        </div>
      </v-card>
    </v-col>

    <!-- 2. Sắp churn -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100 nds-card-warning" @click="$emit('open-at-risk', 'pre_churn')" style="cursor: pointer;">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-alert-outline" color="warning" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Sắp churn (45-90d)</div>
        </div>
        <div class="text-h5 font-weight-bold" style="color: var(--brand-amber-500);">
          {{ overview ? overview.atRiskAgents.count : '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Cần liên hệ ngay
        </div>
      </v-card>
    </v-col>

    <!-- 3. Đã churn -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100 nds-card-danger" @click="$emit('open-at-risk', 'churned')" style="cursor: pointer;">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-account-cancel-outline" color="error" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Đã churn (>90d)</div>
        </div>
        <div class="text-h5 font-weight-bold" style="color: #EF4444;">
          {{ overview ? overview.churnedAgents.count : '—' }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          Cứu lại được không?
        </div>
      </v-card>
    </v-col>

    <!-- 4. Doanh số tháng -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-cash-multiple" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">DS resale tháng</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVND(overview?.monthRevenue.value) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ overview ? overview.monthRevenue.orderCount : '—' }} đơn
        </div>
      </v-card>
    </v-col>

    <!-- 5. Tần suất đặt -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-calendar-clock-outline" color="info" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Tần suất TB</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ overview ? Math.round(overview.avgOrderInterval.days) : '—' }}
          <span class="text-body-2 text-medium-emphasis">ngày</span>
        </div>
        <div class="text-caption text-medium-emphasis mt-1">Giữa 2 đơn</div>
      </v-card>
    </v-col>

    <!-- 6. Giá trị đơn TB -->
    <v-col cols="12" sm="6" md="4" lg="2">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-tag-outline" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">AOV resale</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVND(overview?.avgOrderValue.value) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">Giá trị đơn TB</div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { formatVND, type OverviewResponse } from '@/composables/use-resale-report';

interface Props {
  overview: OverviewResponse | null;
}

defineProps<Props>();
defineEmits<{ (e: 'open-at-risk', segmentKey: string): void }>();

function trendIcon(trend: number): string {
  if (trend > 5) return 'mdi-trending-up';
  if (trend < -5) return 'mdi-trending-down';
  return 'mdi-minus';
}

function trendColor(trend: number): string {
  if (trend > 5) return 'text-success';
  if (trend < -5) return 'text-error';
  return 'text-medium-emphasis';
}
</script>

<style scoped>
.nds-card-warning {
  border-left: 3px solid var(--brand-amber-500);
}
.nds-card-danger {
  border-left: 3px solid #EF4444;
}
</style>
