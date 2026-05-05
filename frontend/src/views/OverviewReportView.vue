<template>
  <div class="overview-report">
    <!-- Slim header: title (text-xl, font-medium) + date subtitle (text-xs) -->
    <header class="page-header">
      <div class="header-text">
        <h1 class="page-title">Báo cáo tổng quan</h1>
        <div class="page-sub">
          {{ formatDateVN(filters.from) }} — {{ formatDateVN(filters.to) }}
        </div>
      </div>
      <button
        type="button"
        class="refresh-btn"
        :disabled="anyLoading"
        :title="anyLoading ? 'Đang tải' : 'Làm mới'"
        @click="refreshAll"
      >
        <v-icon size="16" :class="anyLoading && 'rotating'">mdi-refresh</v-icon>
      </button>
    </header>

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

    <!-- Section 1: KPI cards (4×2 mobile / 4×1 ≥640px) -->
    <OverviewKpiCards
      :data="kpi"
      :spark="sparklines"
      :loading="loadingKpi"
      class="mb-3"
    />

    <!-- Section 7: Critical alerts (auto-hide if both lists empty) -->
    <OverviewCriticalAlerts :data="criticalAlerts" class="mb-3" />

    <!-- Section 9: Quick links horizontal scroll -->
    <OverviewQuickLinks class="mb-3" />

    <!-- Sections 2-4: Top products / Top sales / Top customers -->
    <v-row dense>
      <v-col cols="12" md="6" lg="4">
        <OverviewTopProducts :products="topProducts" :loading="loadingProducts" />
      </v-col>
      <v-col cols="12" md="6" lg="4">
        <OverviewTopSales
          :sales="topSales"
          :loading="loadingSales"
          :hide-ranking="isMember"
          :current-user-id="currentUserId"
        />
      </v-col>
      <v-col cols="12" md="12" lg="4">
        <OverviewTopCustomers
          :customers="topCustomers"
          :loading="loadingCustomers"
          :active-type="topCustomerType"
          @change-type="onChangeCustomerType"
        />
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
import OverviewTopSales from '@/components/reports/overview/OverviewTopSales.vue';
import OverviewTopCustomers from '@/components/reports/overview/OverviewTopCustomers.vue';
import OverviewCriticalAlerts from '@/components/reports/overview/OverviewCriticalAlerts.vue';
import OverviewQuickLinks from '@/components/reports/overview/OverviewQuickLinks.vue';
import {
  formatDateVN,
  presetLabel,
  useOverviewReport,
  type RangePreset,
} from '@/composables/use-overview-report';
import { useAuthStore } from '@/stores/auth';

type CustomerType = 'revenue' | 'resale' | 'profit' | 'at_risk';

const authStore = useAuthStore();
const isMember = computed(() => authStore.user?.role === 'member');
const currentUserId = computed(() => authStore.user?.id ?? null);

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
  sparklines,
  criticalAlerts,
  topProducts,
  topSales,
  topCustomers,
  topCustomerType,
  loadingKpi,
  loadingProducts,
  loadingSales,
  loadingCustomers,
  anyLoading,
  error,
  setPreset,
  setCustomRange,
  fetchTopCustomers,
  refreshAll,
} = useOverviewReport();

function onChangeCustomerType(type: CustomerType) {
  void fetchTopCustomers(type);
}

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

/* ── Slim header (title + date subtitle on left, refresh icon right) ── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}
.header-text { min-width: 0; }
.page-title {
  font-size: 1.25rem;       /* text-xl */
  font-weight: 500;          /* not bold */
  color: #F8FAFC;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
}
.page-sub {
  font-size: 0.72rem;
  color: #64748B;            /* slate-500 */
  margin-top: 2px;
  font-family: ui-monospace, monospace;
}
.refresh-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.08);
  color: #94A3B8;
  cursor: pointer;
  transition: all 0.15s;
}
.refresh-btn:hover:not(:disabled) {
  border-color: rgba(245, 158, 11, 0.3);
  color: #F97316;
}
.refresh-btn:disabled { cursor: wait; opacity: 0.6; }
.rotating { animation: spin 0.9s linear infinite; }
@keyframes spin {
  to { transform: rotate(360deg); }
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
