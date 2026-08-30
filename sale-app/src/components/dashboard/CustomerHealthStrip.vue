<script setup>
import { computed, ref } from 'vue';
import dayjs from 'dayjs';
import { formatVND } from '../../composables/useFormat';

const props = defineProps({ data: { type: Object, required: true } });
const rows = [
  { key: 'active', label: 'Active', icon: 'user', color: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  { key: 'attention', label: 'Need Attention', icon: 'clock', color: 'text-orange-600', bg: 'bg-orange-50', bar: 'bg-orange-500' },
  { key: 'at_risk', label: 'At Risk', icon: 'alert', color: 'text-red-600', bg: 'bg-red-50', bar: 'bg-red-500' },
  { key: 'lost', label: 'Lost', icon: 'lost', color: 'text-slate-600', bg: 'bg-slate-100', bar: 'bg-slate-400' },
  { key: 'reactivated', label: 'Reactivated this month', icon: 'refresh', color: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500' },
];
const selectedKey = ref(null);
const selectedMeta = computed(() => rows.find((row) => row.key === selectedKey.value));
const healthTotal = computed(() => rows.reduce((sum, row) => sum + Number(props.data[row.key] || 0), 0));
const percent = (key) => healthTotal.value ? Math.round((Number(props.data[key] || 0) / healthTotal.value) * 100) : 0;
const filteredCustomers = computed(() => {
  const details = props.data.details || [];
  if (selectedKey.value === 'reactivated') return details.filter((customer) => customer.reactivated);
  return details.filter((customer) => customer.health === selectedKey.value);
});

function call(customer) {
  if (customer.phone) window.location.href = `tel:${customer.phone}`;
}
</script>

<template>
  <section class="rounded-card border border-line-200 bg-white p-4 shadow-card">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h2 class="text-[14px] font-bold leading-5 tracking-[-0.01em] text-ink-primary">SỨC KHỎE TỆP KHÁCH HÀNG</h2>
        <p class="mt-0.5 text-[9px] text-ink-secondary">Bấm vào nhóm để xem khách phụ trách</p>
      </div>
      <button class="text-[10px] font-semibold text-royal-700" @click="selectedKey = 'active'">Xem tất cả</button>
    </div>
    <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <button v-for="row in rows" :key="row.key" class="flex min-h-[108px] min-w-0 flex-col items-center rounded-[10px] border border-line-200 px-1.5 py-2.5 text-center transition hover:border-royal-200 hover:bg-royal-50/30" :aria-label="`Xem ${data[row.key]} khách ${row.label}`" @click="selectedKey = row.key">
        <span class="mx-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full" :class="[row.bg, row.color]">
          <svg v-if="row.icon === 'user'" class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M6.5 19v-1.5a4.5 4.5 0 0 1 4.5-4.5h2a4.5 4.5 0 0 1 4.5 4.5V19M5 19h14" /></svg>
          <svg v-else-if="row.icon === 'clock'" class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="M12 8v4l3 2" /></svg>
          <svg v-else-if="row.icon === 'alert'" class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.4 3.6 17a2 2 0 0 0 1.8 3h13.2a2 2 0 0 0 1.8-3L13.7 4.4a1.9 1.9 0 0 0-3.4 0Z" /><path d="M12 9v4M12 16.5h.01" /></svg>
          <svg v-else-if="row.icon === 'lost'" class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><path d="m9.5 9.5 5 5m0-5-5 5" /></svg>
          <svg v-else class="health-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7v5h-5M5 17v-5h5" /><path d="M7.1 8.2A6 6 0 0 1 18.5 12M5.5 12a6 6 0 0 0 11.4 3.8" /></svg>
        </span>
        <div class="mt-2 flex min-h-6 items-center text-[9px] font-semibold leading-3 text-ink-primary" :title="row.label">{{ row.label }}</div>
        <div class="mt-1 text-xl font-bold tabular-nums text-ink-primary">{{ data[row.key] }}</div>
      </button>
    </div>
    <div class="mt-4 flex h-1.5 gap-1 overflow-hidden rounded-full bg-surface-soft">
      <div v-for="row in rows" :key="row.key" :class="row.bar" :style="{ flexGrow: Math.max(0.2, data[row.key]) }"></div>
    </div>
    <div class="mt-1.5 grid grid-cols-5 gap-1 text-center text-[8px] font-semibold text-ink-secondary">
      <span v-for="row in rows" :key="row.key">{{ percent(row.key) }}%</span>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="selectedKey" class="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-5" @click.self="selectedKey = null" @keydown.esc.window="selectedKey = null">
      <section class="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-pop sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Danh sách sức khỏe khách hàng">
        <header class="flex items-start justify-between gap-4 border-b border-line-200 px-4 py-4 sm:px-5">
          <div>
            <h3 class="text-base font-bold text-ink-primary">Khách hàng · {{ selectedMeta?.label }}</h3>
            <p class="mt-1 text-xs text-ink-secondary">{{ filteredCustomers.length }} khách do bạn phụ trách</p>
          </div>
          <button class="flex h-8 w-8 items-center justify-center rounded-lg border border-line-200 text-ink-secondary" aria-label="Đóng" @click="selectedKey = null">×</button>
        </header>
        <div v-if="!filteredCustomers.length" class="p-10 text-center text-sm text-ink-secondary">Không có khách hàng trong nhóm này.</div>
        <div v-else class="overflow-auto divide-y divide-line-200">
          <article v-for="customer in filteredCustomers" :key="customer.contactId" class="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center sm:px-5">
            <div class="min-w-0">
              <div class="truncate text-xs font-semibold text-ink-primary">{{ customer.name }}</div>
              <div class="mt-1 text-[10px] text-ink-secondary">{{ customer.phone || 'Chưa có số điện thoại' }}</div>
            </div>
            <div class="text-[10px] text-ink-secondary">
              Đơn gần nhất
              <div class="mt-1 font-semibold text-ink-primary">{{ customer.lastOrderAt ? dayjs(customer.lastOrderAt).format('DD/MM/YYYY') : 'Chưa có' }}</div>
            </div>
            <div class="text-[10px] text-ink-secondary">
              {{ customer.daysSinceLastOrder }} ngày chưa mua · chu kỳ {{ customer.reorderCycleDays }} ngày
              <div class="mt-1 font-semibold text-ink-primary">Tiềm năng {{ formatVND(customer.potentialRevenue) }}</div>
            </div>
            <button :disabled="!customer.phone" class="h-9 rounded-lg border border-royal-100 px-3 text-[10px] font-semibold text-royal-700 disabled:opacity-40" @click="call(customer)">Gọi</button>
          </article>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.health-icon {
  height: 16px;
  width: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
</style>
