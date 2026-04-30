<template>
  <v-row dense>
    <!-- 1. Doanh số tháng -->
    <v-col cols="12" md="6" lg="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-cash-multiple" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Doanh số tháng này</div>
        </div>
        <div class="text-h4 font-weight-bold">
          {{ formatVND(kpi?.monthRevenue.value) }}
        </div>
        <div class="d-flex align-center mt-2">
          <span class="text-caption" :class="trendColor(kpi?.monthRevenue.trend)">
            <v-icon size="14">{{ trendIcon(kpi?.monthRevenue.trend) }}</v-icon>
            {{ formatTrend(kpi?.monthRevenue.trend) }}
            <span class="text-medium-emphasis">vs tháng trước</span>
          </span>
          <v-spacer />
          <Sparkline
            v-if="kpi?.monthRevenue.sparkline"
            :data="kpi.monthRevenue.sparkline"
          />
        </div>
      </v-card>
    </v-col>

    <!-- 2. YTD vs Mục tiêu -->
    <v-col cols="12" md="6" lg="3">
      <v-card class="pa-4 h-100">
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-target" color="success" class="mr-2" />
          <div class="text-caption text-medium-emphasis">DS YTD / Mục tiêu năm</div>
        </div>
        <div class="text-h5 font-weight-bold">
          {{ formatVNDShort(kpi?.ytdRevenue.value) }}
          <span class="text-body-2 text-medium-emphasis">
            / {{ formatVNDShort(kpi?.ytdRevenue.goal) }}
          </span>
        </div>
        <v-progress-linear
          v-if="kpi && kpi.ytdRevenue.goal > 0"
          :model-value="Math.min(kpi.ytdRevenue.percentOfGoal, 100)"
          color="success"
          height="6"
          rounded
          class="mt-2"
        />
        <div class="text-caption text-medium-emphasis mt-1">
          <template v-if="kpi && kpi.ytdRevenue.goal > 0">
            {{ kpi.ytdRevenue.percentOfGoal.toFixed(0) }}% — còn lại
            <strong>{{ formatVNDShort(kpi.ytdRevenue.remaining) }}</strong>
          </template>
          <template v-else>
            <em>Chưa cấu hình mục tiêu năm</em>
          </template>
        </div>
      </v-card>
    </v-col>

    <!-- 3. Tệp đại lý active -->
    <v-col cols="12" md="6" lg="3">
      <v-tooltip
        text="Đại lý đặt hàng trong 60 ngày qua"
        location="top"
      >
        <template #activator="{ props: tipProps }">
          <v-card v-bind="tipProps" class="pa-4 h-100">
            <div class="d-flex align-center mb-1">
              <v-icon
                icon="mdi-account-check-outline"
                :color="ratioColor(kpi?.agents.ratio ?? 0)"
                class="mr-2"
              />
              <div class="text-caption text-medium-emphasis">Tệp đại lý active</div>
            </div>
            <div class="text-h4 font-weight-bold">
              <span :style="{ color: ratioColorHex(kpi?.agents.ratio ?? 0) }">
                {{ kpi?.agents.active ?? '—' }}
              </span>
              <span class="text-body-1 text-medium-emphasis">
                / {{ kpi?.agents.total ?? '—' }}
              </span>
            </div>
            <v-progress-linear
              v-if="kpi"
              :model-value="kpi.agents.ratio"
              :color="ratioColor(kpi.agents.ratio)"
              height="4"
              rounded
              class="mt-2"
            />
            <div class="text-caption text-medium-emphasis mt-1">
              {{ kpi ? kpi.agents.ratio.toFixed(0) : '—' }}% đặt trong 60d
            </div>
          </v-card>
        </template>
      </v-tooltip>
    </v-col>

    <!-- 4. Pipeline value -->
    <v-col cols="12" md="6" lg="3">
      <v-card
        class="pa-4 h-100 cursor-pointer"
        @click="$emit('open-pipeline')"
      >
        <div class="d-flex align-center mb-1">
          <v-icon icon="mdi-pipe" color="primary" class="mr-2" />
          <div class="text-caption text-medium-emphasis">Pipeline value</div>
        </div>
        <div class="text-h4 font-weight-bold">
          {{ formatVNDShort(kpi?.pipeline.totalValue) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-2">
          {{ kpi?.pipeline.dealCount ?? 0 }} deal đang xử lý
        </div>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import {
  formatVND,
  formatVNDShort,
  type AdminHeroKpi,
} from '@/composables/use-admin-dashboard';
import Sparkline from './Sparkline.vue';

interface Props {
  kpi: AdminHeroKpi | null;
}
defineProps<Props>();
defineEmits<{
  (e: 'open-pipeline'): void;
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

function ratioColor(r: number): string {
  if (r > 70) return 'success';
  if (r >= 50) return 'warning';
  return 'error';
}

function ratioColorHex(r: number): string {
  if (r > 70) return '#10B981';
  if (r >= 50) return '#F59E0B';
  return '#EF4444';
}
</script>

<style scoped>
.cursor-pointer { cursor: pointer; transition: transform 0.12s; }
.cursor-pointer:hover { transform: translateY(-1px); }
</style>
