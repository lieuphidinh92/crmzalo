<template>
  <div class="overview-report">
    <!-- Page header + range label -->
    <div class="page-header">
      <div class="d-flex align-center flex-wrap gap-2">
        <h1 class="text-h5 mb-0">
          <v-icon class="mr-2" color="primary" size="22">mdi-view-dashboard-outline</v-icon>
          Báo cáo tổng quan
        </h1>
        <v-chip
          v-if="filters.from && filters.to"
          size="small"
          variant="tonal"
          color="primary"
          class="ml-1"
        >
          <v-icon size="14" start>mdi-calendar-range</v-icon>
          {{ formatDateVN(filters.from) }} — {{ formatDateVN(filters.to) }}
        </v-chip>
        <v-spacer />
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="anyLoading"
          @click="refreshAll"
        >
          Làm mới
        </v-btn>
      </div>
      <div class="text-caption text-medium-emphasis mt-1">
        Sức khoẻ kinh doanh + sản phẩm + sale + khách hàng — chọn khoảng thời gian linh hoạt
      </div>
    </div>

    <!-- Filter pills (horizontal scroll on mobile) -->
    <div class="filter-bar">
      <div class="filter-pills">
        <button
          v-for="p in PRESETS"
          :key="p"
          type="button"
          :class="['pill', filters.preset === p && 'pill--active']"
          @click="onPresetClick(p)"
        >
          {{ presetLabel(p) }}
        </button>
        <button
          type="button"
          :class="['pill', filters.preset === 'custom' && 'pill--active']"
          @click="showCustom = !showCustom"
        >
          {{ presetLabel('custom') }}
          <v-icon size="14" class="ml-1">{{ showCustom ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </button>
      </div>

      <v-expand-transition>
        <div v-if="showCustom" class="custom-range">
          <v-text-field
            v-model="customFrom"
            type="date"
            label="Từ ngày"
            density="compact"
            hide-details
            variant="outlined"
            class="custom-input"
          />
          <v-text-field
            v-model="customTo"
            type="date"
            label="Đến ngày"
            density="compact"
            hide-details
            variant="outlined"
            class="custom-input"
          />
          <v-btn
            color="primary"
            variant="flat"
            :disabled="!customFrom || !customTo || customFrom > customTo"
            @click="applyCustom"
          >
            Áp dụng
          </v-btn>
        </div>
      </v-expand-transition>
    </div>

    <!-- Section 1: KPI cards -->
    <OverviewKpiCards :data="kpi" :loading="loadingKpi" class="mb-4" />

    <!-- Section 2: Top products -->
    <v-row dense>
      <v-col cols="12" md="6" lg="4">
        <OverviewTopProducts :products="topProducts" :loading="loadingProducts" />
      </v-col>

      <!-- Section 3 + 4 placeholders for Session 2 -->
      <v-col cols="12" md="6" lg="4">
        <v-card class="placeholder-card pa-3 h-100" variant="flat">
          <div class="d-flex align-center mb-2">
            <v-icon icon="mdi-trophy-outline" color="primary" class="mr-2" />
            <span class="text-h6">Top NV Sale tháng</span>
          </div>
          <div class="text-caption text-medium-emphasis mb-3">
            Đang xây dựng — sẽ ra ở Session 2
          </div>
          <div class="placeholder-empty">
            <v-icon size="40" color="grey-darken-1">mdi-account-group-outline</v-icon>
            <div class="mt-2 text-caption">Coming soon</div>
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" md="12" lg="4">
        <v-card class="placeholder-card pa-3 h-100" variant="flat">
          <div class="d-flex align-center mb-2">
            <v-icon icon="mdi-account-star-outline" color="primary" class="mr-2" />
            <span class="text-h6">Top khách hàng</span>
          </div>
          <div class="text-caption text-medium-emphasis mb-3">
            Đang xây dựng — sẽ ra ở Session 2
          </div>
          <div class="placeholder-empty">
            <v-icon size="40" color="grey-darken-1">mdi-account-multiple-outline</v-icon>
            <div class="mt-2 text-caption">Coming soon</div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <v-snackbar v-model="hasError" color="error" :timeout="4000">
      {{ error }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import OverviewKpiCards from '@/components/reports/overview/OverviewKpiCards.vue';
import OverviewTopProducts from '@/components/reports/overview/OverviewTopProducts.vue';
import {
  formatDateVN,
  presetLabel,
  useOverviewReport,
  type RangePreset,
} from '@/composables/use-overview-report';

const PRESETS: RangePreset[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'last_month',
];

const {
  filters,
  kpi,
  topProducts,
  loadingKpi,
  loadingProducts,
  anyLoading,
  error,
  setPreset,
  setCustomRange,
  refreshAll,
} = useOverviewReport();

const showCustom = ref(filters.preset === 'custom');
const customFrom = ref(filters.from);
const customTo = ref(filters.to);

const hasError = computed({
  get: () => !!error.value,
  set: (v: boolean) => {
    if (!v) error.value = null;
  },
});

function onPresetClick(p: RangePreset) {
  setPreset(p);
  showCustom.value = false;
}

function applyCustom() {
  if (!customFrom.value || !customTo.value) return;
  setCustomRange(customFrom.value, customTo.value);
}
</script>

<style scoped>
.overview-report {
  padding: 12px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 16px;
}

/* Filter pills bar */
.filter-bar {
  margin-bottom: 16px;
}
.filter-pills {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}
.filter-pills::-webkit-scrollbar {
  height: 4px;
}
.pill {
  flex: 0 0 auto;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(30, 41, 59, 0.7);
  color: rgb(148, 163, 184);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}
.pill:hover {
  border-color: rgba(245, 158, 11, 0.4);
  color: rgb(248, 250, 252);
}
.pill--active {
  background: #f97316;
  border-color: #f97316;
  color: #fff;
}
.pill--active:hover {
  background: #ea580c;
  color: #fff;
}

.custom-range {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
  flex-wrap: wrap;
}
.custom-input {
  min-width: 160px;
  flex: 1;
}

.placeholder-card {
  background: rgb(var(--v-theme-surface)) !important;
  border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
}
.placeholder-empty {
  text-align: center;
  padding: 24px;
  opacity: 0.5;
}
</style>
