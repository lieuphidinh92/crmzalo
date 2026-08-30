<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import { formatVND, statusLabel, statusColor } from '../../composables/useFormat';

const props = defineProps({ data: { type: Object, required: true }, processingOrders: { type: Array, default: () => [] } });
const router = useRouter();
const dealCount = computed(() => props.data.dealStages.reduce((sum, row) => sum + row.count, 0));
const pipelineTabs = computed(() => {
  const deals = (props.data.dealStages || []).map((row) => ({ ...row, type: 'deal' }));
  const orders = (props.data.orderStages || []).map((row) => ({ ...row, type: 'order', tabKey: `order:${row.key}` }));
  if (!orders.length && props.processingOrders.length) orders.push({ key: 'pending', tabKey: 'order:pending', label: 'Đơn pending', count: props.processingOrders.length, type: 'order' });
  return [...deals, ...orders];
});
const selectedStage = ref(props.data.dealStages?.[0]?.key || (props.processingOrders.length ? 'order:pending' : ''));
const activeTab = computed(() => pipelineTabs.value.find((row) => (row.tabKey || row.key) === selectedStage.value) || pipelineTabs.value[0]);
const showingOrders = computed(() => activeTab.value?.type === 'order');
const filteredDeals = computed(() => props.data.rows.filter((row) => row.stage === activeTab.value?.key));
const filteredOrders = computed(() => {
  const stage = activeTab.value?.key;
  if (!stage || stage === 'pending') return props.processingOrders;
  return props.processingOrders.filter((row) => row.status === stage);
});

function followLabel(value) {
  if (!value) return 'Chưa có lịch';
  const due = dayjs(value);
  const today = dayjs();
  if (due.isSame(today, 'day')) return `Hôm nay ${due.format('HH:mm')}`;
  if (due.isSame(today.add(1, 'day'), 'day')) return `Ngày mai ${due.format('HH:mm')}`;
  return due.format('DD/MM/YYYY');
}

function call(row) {
  if (row.phone) window.location.href = `tel:${row.phone}`;
}
</script>

<template>
  <section class="h-full overflow-hidden rounded-card border border-line-200 bg-white shadow-card">
    <header class="flex h-[52px] items-center justify-between gap-2 border-b border-line-200 px-4">
      <h2 class="text-[14px] font-bold tracking-[-0.01em] text-ink-primary">ĐƠN & CƠ HỘI ĐANG XỬ LÝ</h2>
      <button @click="router.push('/orders')" class="text-[10px] text-royal-700 font-semibold">Xem tất cả</button>
    </header>
    <div class="flex overflow-x-auto border-b border-line-200 px-2">
      <button v-for="stage in pipelineTabs" :key="stage.tabKey || stage.key" @click="selectedStage = stage.tabKey || stage.key" class="h-10 shrink-0 whitespace-nowrap border-b-2 px-3 text-[10px] font-semibold" :class="selectedStage === (stage.tabKey || stage.key) ? 'text-royal-700 border-royal-700' : 'text-ink-secondary border-transparent'">{{ stage.label }} ({{ stage.count }})</button>
    </div>

    <div v-if="!showingOrders && !data.dataComplete" class="p-6 text-center">
      <div class="font-semibold text-ink-primary">Có {{ dealCount }} cơ hội nhưng chưa đủ dữ liệu</div>
      <p class="mt-1 text-xs text-ink-secondary">Cần cập nhật giá trị tiềm năng và ngày follow tiếp theo để ưu tiên chính xác.</p>
    </div>
    <div v-else-if="!showingOrders" class="divide-y divide-line-200">
      <div class="pipeline-grid hidden h-8 items-center gap-2 border-b border-line-200 bg-surface-50 px-4 text-[8px] font-semibold uppercase tracking-[0.025em] text-ink-secondary sm:grid"><span>Khách hàng</span><span>Giá trị</span><span>Ngày follow tiếp theo</span><span>Trạng thái</span><span></span></div>
      <div v-if="!filteredDeals.length" class="p-6 text-center text-xs text-ink-secondary">Không có cơ hội trong giai đoạn này.</div>
      <article v-for="row in filteredDeals" :key="row.id" class="pipeline-grid grid min-h-[48px] cursor-pointer grid-cols-1 gap-2 px-4 py-2.5 text-left text-[10px] transition hover:bg-royal-50/40 sm:items-center sm:py-0" @click="router.push('/customers')">
        <div class="truncate text-[11px] font-semibold text-ink-primary" :title="row.name">{{ row.name }}</div>
        <div class="whitespace-nowrap font-semibold tabular-nums text-ink-primary">{{ row.value ? formatVND(row.value) : 'Chưa nhập' }}</div>
        <div class="whitespace-nowrap font-medium" :class="row.overdue ? 'text-red-600' : 'text-ink-primary'">{{ followLabel(row.nextFollowAt) }}</div>
        <div><span class="inline-flex rounded px-1.5 py-0.5 text-[8px] font-semibold" :class="row.overdue ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'">{{ row.overdue ? 'Quá hạn' : 'Đúng hạn' }}</span></div>
        <div class="flex items-center justify-end gap-1" @click.stop>
          <button :disabled="!row.phone" class="pipeline-action" title="Gọi khách" @click="call(row)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92Z" /></svg></button>
          <button disabled class="pipeline-action" title="Chưa liên kết kênh chat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 10h8M8 14h5" /></svg></button>
          <button class="pipeline-action" title="Xem khách hàng" @click="router.push('/customers')">•••</button>
        </div>
      </article>
    </div>
    <div v-else-if="!filteredOrders.length" class="p-8 text-center text-xs text-ink-secondary">Không có đơn đang xử lý.</div>
    <div v-else class="divide-y divide-line-200">
      <div class="hidden grid-cols-[1fr_1.3fr_auto] gap-2 bg-surface-50 px-4 py-2 text-[9px] font-semibold uppercase text-ink-secondary sm:grid"><span>Mã đơn</span><span>Khách hàng</span><span>Trạng thái / giá trị</span></div>
      <button v-for="row in filteredOrders" :key="row.id" @click="router.push(`/orders/${row.id}`)" class="w-full grid grid-cols-[1fr_1.3fr_auto] gap-2 px-4 py-3 text-left text-xs hover:bg-royal-50/40">
        <div class="font-mono text-ink-secondary">{{ row.orderCode }}</div>
        <div class="font-semibold text-ink-primary truncate">{{ row.customerName }}</div>
        <div class="text-right"><strong>{{ formatVND(row.totalAmount) }}</strong><br><span class="inline-block mt-1 px-1.5 py-0.5 rounded" :class="statusColor(row.status)">{{ statusLabel(row.status) }}</span></div>
      </button>
    </div>
  </section>
</template>

<style scoped>
@media (min-width: 640px) {
  .pipeline-grid {
    grid-template-columns: minmax(0, 1.2fr) 88px 112px 64px 76px;
  }
}

.pipeline-action {
  display: inline-flex;
  height: 24px;
  width: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #f8fafc;
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
}

.pipeline-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.pipeline-action svg {
  height: 12px;
  width: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
</style>
