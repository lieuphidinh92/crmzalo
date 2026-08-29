<script setup>
import { formatVND } from '../../composables/useFormat';

defineProps({ data: { type: Object, required: true } });

const pct = (value) => `${Math.round(Number(value) || 0)}%`;
</script>

<template>
  <section class="dashboard-kpi-grid grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.32fr_1.12fr_0.98fr_1.02fr_0.84fr_0.92fr] 2xl:gap-4">
    <article class="dashboard-kpi-card sm:col-span-2 xl:col-span-1">
      <div class="dashboard-kpi-label">Doanh số tháng</div>
      <div class="mt-2.5 flex flex-wrap items-baseline gap-1 text-[22px] font-bold leading-7 text-ink-primary tabular-nums 2xl:text-2xl">{{ formatVND(data.revenue) }}<span v-if="data.target" class="text-xs font-medium text-ink-secondary">/ {{ formatVND(data.target) }}</span></div>
      <div v-if="data.target" class="mt-2">
        <div class="flex items-center gap-2">
          <div class="h-1.5 flex-1 rounded-full bg-surface-soft overflow-hidden">
            <div class="h-full bg-royal-600 rounded-full" :style="{ width: `${Math.min(100, data.targetPercent || 0)}%` }"></div>
          </div>
          <span class="text-xs font-bold text-ink-primary">{{ pct(data.targetPercent) }}</span>
        </div>
      </div>
      <div v-else class="mt-2 text-xs text-amber-600 font-medium">Chưa cấu hình mục tiêu</div>
    </article>

    <article class="dashboard-kpi-card">
      <div class="flex items-center justify-between gap-2"><div class="dashboard-kpi-label">Dự kiến cuối tháng</div><span class="dashboard-kpi-icon bg-red-50 text-red-600">↓</span></div>
      <div class="mt-2.5 text-[22px] font-bold leading-7 text-ink-primary tabular-nums 2xl:text-2xl">{{ formatVND(data.forecast) }}</div>
      <div v-if="data.forecastGap" class="mt-2 text-xs font-semibold text-red-600">Thiếu {{ formatVND(data.forecastGap) }}</div>
      <div v-else-if="data.target" class="mt-2 text-xs font-semibold text-emerald-600">Đang đạt nhịp mục tiêu</div>
      <div v-else class="mt-2 text-xs text-ink-secondary">Theo nhịp bán hiện tại</div>
    </article>

    <article class="dashboard-kpi-card">
      <div class="flex items-center justify-between gap-2">
        <div class="dashboard-kpi-label">Khách hàng active</div>
        <span class="dashboard-kpi-icon bg-emerald-50 text-emerald-600">●</span>
      </div>
      <div class="mt-2 text-2xl font-bold leading-7 text-ink-primary tabular-nums">{{ data.activeCustomers }}</div>
      <div class="mt-1 text-xs text-ink-secondary">{{ data.activeTarget ? `/ ${data.activeTarget} khách mục tiêu` : 'Có đơn trong tháng' }}</div>
    </article>

    <article class="dashboard-kpi-card">
      <div class="flex items-center justify-between gap-2">
        <div class="dashboard-kpi-label">Tỷ lệ khách quay lại</div>
        <span class="dashboard-kpi-icon bg-emerald-50 text-emerald-600">↻</span>
      </div>
      <div class="mt-2 text-2xl font-bold leading-7 text-ink-primary tabular-nums">{{ pct(data.repeatRate) }}</div>
      <div class="mt-1 text-xs font-medium" :class="data.repeatRateDelta >= 0 ? 'text-emerald-600' : 'text-red-600'">
        {{ data.repeatRateDelta >= 0 ? '+' : '' }}{{ data.repeatRateDelta }}% so với tháng trước
      </div>
    </article>

    <article class="dashboard-kpi-card">
      <div class="flex items-center justify-between gap-2"><div class="dashboard-kpi-label">Khách hàng mới</div><span class="dashboard-kpi-icon bg-blue-50 text-blue-600">♙</span></div>
      <div class="mt-2 text-2xl font-bold leading-7 text-emerald-600 tabular-nums">+{{ data.newCustomers }}</div>
      <div class="mt-1 text-xs text-ink-secondary">Khách mới</div>
    </article>

    <article class="dashboard-kpi-card sm:col-span-2 xl:col-span-1">
      <div class="flex items-center justify-between gap-2"><div class="dashboard-kpi-label">Khách nguy cơ rời bỏ</div><span class="dashboard-kpi-icon bg-red-50 text-red-600">△</span></div>
      <div class="mt-2 text-2xl font-bold leading-7 text-ink-primary tabular-nums">{{ data.atRiskCustomers }}</div>
      <div class="mt-1 text-xs text-red-600 font-medium">Cần chăm sóc</div>
    </article>
  </section>
</template>

<style scoped>
.dashboard-kpi-card {
  min-width: 0;
  min-height: 112px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(15, 23, 42, 0.045);
}

.dashboard-kpi-label {
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
  letter-spacing: 0.025em;
  text-transform: uppercase;
  color: #64748b;
}

.dashboard-kpi-icon {
  display: flex;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  font-size: 16px;
}

@media (max-width: 1279px) {
  .dashboard-kpi-card { min-height: 112px; }
}
</style>
