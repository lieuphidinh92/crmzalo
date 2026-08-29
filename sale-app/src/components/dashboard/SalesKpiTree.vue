<script setup>
import { formatVND } from '../../composables/useFormat';
defineProps({ data: { type: Object, required: true } });

function openActions() {
  document.getElementById('today-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const decimal = (value) => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const moneyMetric = (value) => `${decimal(Number(value || 0) / 1_000_000)}M`;
const signed = (value, suffix = '') => `${Number(value) > 0 ? '+' : ''}${decimal(value)}${suffix}`;
</script>

<template>
  <section class="bg-white border border-line-200 rounded-card shadow-card p-4">
    <h2 class="text-sm font-bold text-ink-primary">KPI TREE – HIỂU VẤN ĐỀ ĐỂ TĂNG DOANH SỐ</h2>
    <div class="mt-4 grid grid-cols-2 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:gap-1.5">
      <div class="rounded-lg border border-royal-100 bg-royal-50/50 p-2 text-center">
        <div class="text-[9px] uppercase font-bold text-royal-700">Doanh thu</div>
        <div class="mt-1 text-[9px] text-ink-secondary">Mục tiêu</div>
        <div class="mt-1 text-sm font-bold text-ink-primary">{{ data.revenueTarget ? moneyMetric(data.revenueTarget) : formatVND(data.revenue) }}</div>
      </div>
      <div class="hidden self-center text-ink-secondary sm:block">=</div>
      <div class="rounded-lg border p-2 text-center" :class="data.largestGap === 'activeCustomers' ? 'border-red-200 bg-red-50/60' : 'border-line-200'">
        <div class="text-[9px] uppercase font-bold text-royal-700">Active</div>
        <div class="mt-2 text-base font-bold" :class="data.largestGap === 'activeCustomers' ? 'text-red-600' : 'text-ink-primary'">{{ data.activeCustomers }}<span v-if="data.activeTarget"> / {{ data.activeTarget }}</span></div>
        <div v-if="data.activeTarget" class="mt-1 text-[9px] font-semibold" :class="data.activeCustomers < data.activeTarget ? 'text-red-600' : 'text-emerald-600'">{{ data.activeCustomers < data.activeTarget ? `-${data.activeTarget - data.activeCustomers} khách` : 'Đạt mục tiêu' }}</div>
      </div>
      <div class="hidden self-center text-ink-secondary sm:block">×</div>
      <div class="rounded-lg border p-2 text-center" :class="data.largestGap === 'orderFrequency' ? 'border-red-200 bg-red-50/60' : 'border-line-200'">
        <div class="text-[9px] uppercase font-bold text-emerald-700">Order frequency</div>
        <div class="mt-2 text-base font-bold" :class="data.largestGap === 'orderFrequency' ? 'text-red-600' : 'text-ink-primary'">{{ decimal(data.orderFrequency) }}<span v-if="data.orderFrequencyTarget"> / {{ decimal(data.orderFrequencyTarget) }}</span></div>
        <div v-if="data.orderFrequencyTarget" class="mt-1 text-[9px] font-semibold" :class="data.orderFrequency >= data.orderFrequencyTarget ? 'text-emerald-600' : 'text-orange-600'">{{ signed(data.orderFrequency - data.orderFrequencyTarget, ' lần') }}</div>
        <div v-else class="mt-1 text-[9px] text-ink-secondary">lần/tháng</div>
      </div>
      <div class="hidden self-center text-ink-secondary sm:block">×</div>
      <div class="rounded-lg border p-2 text-center" :class="data.largestGap === 'averageOrderValue' ? 'border-red-200 bg-red-50/60' : 'border-line-200'">
        <div class="text-[9px] uppercase font-bold text-emerald-700">Average order value</div>
        <div class="mt-2 text-sm font-bold" :class="data.largestGap === 'averageOrderValue' ? 'text-red-600' : 'text-ink-primary'">{{ moneyMetric(data.averageOrderValue) }}<span v-if="data.averageOrderValueTarget"> / {{ moneyMetric(data.averageOrderValueTarget) }}</span></div>
        <div v-if="data.averageOrderValueTarget" class="mt-1 text-[9px] font-semibold" :class="data.averageOrderValue >= data.averageOrderValueTarget ? 'text-emerald-600' : 'text-emerald-700'">{{ signed((data.averageOrderValue - data.averageOrderValueTarget) / 1_000_000, 'M') }}</div>
        <div v-else class="mt-1 text-[9px] text-ink-secondary">giá trị đơn TB</div>
      </div>
    </div>
    <p class="mt-2 text-center text-[9px] text-ink-disabled sm:hidden">Doanh thu = Active × Tần suất × AOV</p>
    <div class="mt-4 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2.5 text-[11px] text-red-700">
      <strong>ⓘ {{ data.issue }}</strong>
      <div class="mt-1 flex flex-wrap items-center justify-between gap-2 text-red-600">
        <span>Doanh thu = Active Customers × Order Frequency × Average Order Value.</span>
        <button v-if="data.largestGap" class="rounded-lg border border-royal-100 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-royal-700" @click="openActions">Xem khách cần kích hoạt lại →</button>
      </div>
    </div>
  </section>
</template>
