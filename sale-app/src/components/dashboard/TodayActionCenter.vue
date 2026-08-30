<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { formatVND } from '../../composables/useFormat';
import { api } from '../../api/client';

const props = defineProps({ data: { type: Object, required: true } });
const emit = defineEmits(['action-changed']);
const router = useRouter();
const expanded = ref(false);
const busyId = ref('');
const actionError = ref('');
const openMenuId = ref('');
const visibleRows = computed(() => props.data.actions.slice(0, expanded.value ? 12 : 5));

const rankMeta = [
  { label: 'Cao', badge: 'bg-red-500 text-white' },
  { label: 'Cao', badge: 'bg-red-500 text-white' },
  { label: 'TB', badge: 'bg-amber-500 text-white' },
  { label: 'TB', badge: 'bg-amber-500 text-white' },
  { label: 'Thấp', badge: 'bg-emerald-500 text-white' },
];

const typeMeta = {
  risk: { label: 'Cao', badge: 'bg-red-500 text-white', reason: 'text-red-600', potential: 'text-red-600' },
  reorder: { label: 'Cao', badge: 'bg-orange-500 text-white', reason: 'text-orange-600', potential: 'text-orange-600' },
  deal: { label: 'TB', badge: 'bg-amber-500 text-white', reason: 'text-amber-600', potential: 'text-amber-600' },
  opportunity: { label: 'Thấp', badge: 'bg-emerald-500 text-white', reason: 'text-emerald-600', potential: 'text-emerald-600' },
};

function meta(type) {
  return typeMeta[type] || typeMeta.deal;
}

function priorityMeta(index) {
  return rankMeta[index] || rankMeta[rankMeta.length - 1];
}

function reasonParts(reason = '') {
  const patterns = [
    [/^(?:Đã\s+)?quá chu kỳ nhập(?: hàng)?\s*(.*)$/i, 'Quá chu kỳ nhập'],
    [/^Đến chu kỳ nhập(?: hàng)?\s*(.*)$/i, 'Đến chu kỳ nhập'],
    [/^Báo giá chưa phản hồi\s*(.*)$/i, 'Báo giá chưa phản hồi'],
    [/^Mua ít hơn trung bình\s*(.*)$/i, 'Mua ít hơn trung bình'],
    [/^Có cơ hội upsell\s*(.*)$/i, 'Có cơ hội upsell'],
  ];

  for (const [pattern, label] of patterns) {
    const match = reason.match(pattern);
    if (match) return { label, accent: match[1]?.trim() || '' };
  }
  return { label: reason, accent: '' };
}

function call(row) {
  if (row.phone) window.location.href = `tel:${row.phone}`;
}

async function mutate(row, mode) {
  busyId.value = `${mode}:${row.id}`;
  actionError.value = '';
  try {
    await api.put(`/sale-app/dashboard-v2/actions/${mode}`, {
      actionKey: row.id,
      actionType: row.type,
      contactId: row.contactId,
      ...(mode === 'snooze' ? { days: 3 } : {}),
    });
    emit('action-changed');
  } catch (error) {
    actionError.value = error.response?.data?.error || 'Không cập nhật được hành động';
  } finally {
    busyId.value = '';
  }
}
</script>

<template>
  <section id="today-actions" class="overflow-hidden rounded-card border border-line-200 bg-white shadow-card">
    <header class="border-b border-line-200 px-4 py-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-[14px] font-bold leading-5 tracking-[-0.01em] text-ink-primary">🔥 VIỆC QUAN TRỌNG NHẤT HÔM NAY</h2>
          <p class="mt-0.5 text-[11px] leading-4 text-ink-secondary">Hệ thống đã sắp xếp theo mức độ ưu tiên và giá trị doanh thu tiềm năng</p>
        </div>
        <div class="pt-0.5 text-[11px] leading-4 text-ink-secondary">
          Tổng doanh thu tiềm năng:
          <strong class="text-ink-primary tabular-nums">{{ formatVND(data.totalPotentialRevenue) }}</strong>
        </div>
      </div>
    </header>

    <div v-if="actionError" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
      {{ actionError }}
    </div>

    <div v-if="!data.actions.length" class="px-6 py-12 text-center">
      <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center text-xl">✓</div>
      <div class="mt-3 font-semibold text-ink-primary">Không có khách cần ưu tiên ngay</div>
      <p class="text-xs text-ink-secondary mt-1">Các cơ hội mới sẽ xuất hiện khi đủ lịch sử mua hàng hoặc lịch follow.</p>
    </div>

    <div v-else>
      <div class="action-grid hidden h-9 items-center border-b border-line-200 bg-surface-50 px-4 text-[9px] font-semibold uppercase tracking-[0.035em] text-ink-secondary xl:grid">
        <div>Ưu tiên</div><div>Khách hàng</div><div>Vì sao ưu tiên?</div><div>Tiềm năng</div><div>Hành động</div><div>Trạng thái</div>
      </div>
      <article
        v-for="(row, index) in visibleRows"
        :key="row.id"
        class="action-grid grid min-h-[76px] grid-cols-1 gap-3 border-b border-line-200 px-4 py-2.5 transition last:border-b-0 hover:bg-royal-50/30 xl:grid xl:items-center xl:gap-0"
      >
        <div class="flex lg:block items-center gap-2">
          <span class="inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shadow-sm" :class="priorityMeta(index).badge">{{ index + 1 }}</span>
          <span class="text-[9px] font-bold uppercase text-ink-secondary xl:mt-1 xl:block">{{ priorityMeta(index).label }}</span>
        </div>
        <div class="xl:pr-3 min-w-0">
          <div class="truncate text-[12px] font-semibold leading-[18px] text-ink-primary" :title="row.name">{{ row.name }}</div>
          <div class="truncate text-[10px] leading-4 text-ink-secondary">Doanh thu TB: {{ formatVND(row.monthlyValue) }}/tháng</div>
          <span v-if="row.lastProduct" class="mt-0.5 inline-block max-w-full truncate rounded bg-royal-50 px-1.5 py-0.5 text-[9px] leading-3 text-royal-700">Mua: {{ row.lastProduct }}</span>
        </div>
        <div class="xl:pr-3">
          <div class="text-[11px] font-medium leading-4 text-ink-primary">
            {{ reasonParts(row.reason).label }}
            <span v-if="reasonParts(row.reason).accent" class="block font-semibold" :class="meta(row.type).reason">{{ reasonParts(row.reason).accent }}</span>
          </div>
          <div class="mt-0.5 text-[10px] leading-4 text-ink-secondary">{{ row.reasonDetail }}</div>
        </div>
        <div class="whitespace-nowrap text-[13px] font-bold tabular-nums" :class="meta(row.type).potential">{{ formatVND(row.potentialRevenue) }}</div>
        <div class="relative flex items-center gap-1.5">
          <button :disabled="!row.phone" @click="call(row)" title="Gọi khách" class="action-button border-emerald-100 bg-emerald-50 text-emerald-700 disabled:opacity-30"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92Z" /></svg><span>Gọi</span></button>
          <button disabled title="Chưa liên kết Zalo với hồ sơ khách" class="action-button border-blue-100 bg-blue-50 text-blue-700 opacity-70"><img src="/zalo-logo.png" alt="" class="h-[18px] w-[18px] rounded-[4px] object-contain" /><span>Zalo</span></button>
          <button v-if="row.lastOrderId" @click="router.push(`/orders/${row.lastOrderId}`)" title="Mở đơn gần nhất để đặt lại" class="action-button w-[46px] border-violet-100 bg-violet-50 text-violet-700"><span class="text-sm leading-none">▤</span><span>Đơn cũ</span></button>
          <button v-else @click="router.push('/pos')" class="action-button w-[46px] border-violet-100 bg-violet-50 text-violet-700"><span class="text-sm leading-none">＋</span><span>Tạo đơn</span></button>
          <button class="flex h-10 w-8 items-center justify-center rounded-lg border border-line-200 bg-white text-base font-bold tracking-wider text-ink-secondary" title="Thêm hành động" @click="openMenuId = openMenuId === row.id ? '' : row.id">•••</button>
          <div v-if="openMenuId === row.id" class="absolute right-0 top-10 z-20 w-40 rounded-lg border border-line-200 bg-white p-1.5 shadow-pop">
            <button :disabled="busyId !== ''" class="w-full rounded-md px-2 py-2 text-left text-[10px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40" @click="openMenuId = ''; mutate(row, 'snooze')">⏱ Hoãn 3 ngày</button>
          </div>
        </div>
        <div class="flex items-center xl:justify-start">
          <button :disabled="busyId !== ''" class="flex items-center gap-1.5 whitespace-nowrap text-left text-[9px] text-ink-secondary disabled:opacity-40" title="Đánh dấu đã xử lý hôm nay" @click="mutate(row, 'complete')">
            <span class="flex h-4 w-4 items-center justify-center rounded border border-line-300 bg-white">{{ busyId === `complete:${row.id}` ? '…' : '' }}</span>
            <span>Chưa xử lý</span>
          </button>
        </div>
      </article>
      <div v-if="data.actions.length > 5" class="border-t border-line-200 p-2 text-center">
        <button @click="expanded = !expanded" class="h-8 px-4 text-xs font-semibold text-royal-700 border border-royal-100 rounded-lg hover:bg-royal-50">
          {{ expanded ? 'Thu gọn' : `Xem thêm ${Math.min(7, data.actions.length - 5)} việc khác` }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (min-width: 1280px) {
  .action-grid {
    grid-template-columns: 48px minmax(0, 1.45fr) minmax(0, 1.15fr) 112px 174px 90px;
  }
}

.action-button {
  display: inline-flex;
  width: 38px;
  height: 42px;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-width: 1px;
  border-radius: 9px;
  font-size: 8px;
  line-height: 10px;
  font-weight: 600;
}

.action-button svg {
  height: 14px;
  width: 14px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
</style>
