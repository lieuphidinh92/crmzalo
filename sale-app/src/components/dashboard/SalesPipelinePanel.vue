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
</script>

<template>
  <section class="bg-white border border-line-200 rounded-card shadow-card overflow-hidden">
    <header class="px-4 py-3 flex items-center justify-between gap-2 border-b border-line-200">
      <h2 class="text-sm font-bold text-ink-primary">ĐƠN & CƠ HỘI ĐANG XỬ LÝ</h2>
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
      <div class="hidden grid-cols-[1.4fr_1fr_1fr] gap-2 border-b border-line-200 bg-surface-50 px-4 py-2 text-[9px] font-semibold uppercase text-ink-secondary sm:grid"><span>Khách hàng</span><span>Giá trị</span><span>Ngày follow tiếp theo</span></div>
      <div v-if="!filteredDeals.length" class="p-6 text-center text-xs text-ink-secondary">Không có cơ hội trong giai đoạn này.</div>
      <button v-for="row in filteredDeals" :key="row.id" class="grid w-full grid-cols-[1.4fr_1fr_1fr] gap-2 px-4 py-3 text-left text-xs hover:bg-royal-50/40" @click="router.push('/customers')">
        <div class="font-semibold text-ink-primary truncate">{{ row.name }}</div>
        <div class="tabular-nums">{{ row.value ? formatVND(row.value) : 'Chưa nhập giá trị' }}</div>
        <div :class="row.overdue ? 'text-red-600 font-semibold' : 'text-ink-secondary'">{{ row.nextFollowAt ? `${row.overdue ? 'Quá hạn' : 'Follow'} ${dayjs(row.nextFollowAt).format('DD/MM')}` : row.stageLabel }}</div>
      </button>
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
